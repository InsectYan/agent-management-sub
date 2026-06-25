# 测试用例生成 — Agent 与 BFF 层设计

> **读者**：子 Agent（Skill）作者、主应用 BFF 开发者  
> **归属**：`agent-management-sub`（Skill）+ `agent-management-master`（平台 BFF）  
> **规范**：[子 Agent 开发指南](../../docs/子Agent开发指南.md) · [方案索引](../../../agent-management-master/docs/schemes/README.md)

---

## 1. 定位与边界

| 本层包含 | 本层不包含 |
|----------|------------|
| `testgen-skill` 插件（`plugins/testgen-skill/`） | 独立 Egg.js MCP 服务 |
| 主应用 BFF 统一编排（RouteManager、SchemeRegistry） | 前端 UI、AntV 可视化 |
| Loop 方案多步迭代生成逻辑 | 知识库 CRUD、PDF 解析（见服务端层） |
| Skill 回调：校验、上下文 enrich、落库、响应格式化 | 直连 LLM / 硬编码 apiKey |

**架构原则**：Agent 能力通过 **轻量 Skill 插件** 接入主应用 BFF，不在业务子应用内嵌 Pi/MCP 进程。

```
HTTP POST /api/skills/testgen
  → RouteManager
  → resolveLlm（请求 > Skill 默认 > 平台 Ollama）
  → callbacks.beforeExecute（解析 doc_content / doc_id）
  → callbacks.enrichContext（拼文档元数据、历史 list）
  → SchemeRegistry.get('loop').executeTask
  → callbacks.persistResult → testgen_runs
  → callbacks.formatResponse
  → JSON { reply, output, meta }
```

---

## 2. 方案选型：Loop（优化版）

对照 [方案索引](../../../agent-management-master/docs/schemes/README.md)：

| scheme | 是否适用 | 说明 |
|--------|----------|------|
| `pi` | 否 | 需文件工作区与 outbox，过重 |
| `langchain` | 部分 | Tool 编排适合 RAG，但本场景以 LLM 多步写作用例为主 |
| **`loop`** | **是** | 固定 phase 循环，每步合并 testCases，可自我修正 |
| `react` | 否 | Thought-Action 适合工具问答，非批量用例生成 |

### 2.1 优化后的四阶段 Loop

在默认 `maxSteps=4` 上，按 **phase 状态机** 驱动（已在 `testgen-skill` 实现）：

| 步 | phase | 任务 | 输出字段 |
|----|-------|------|----------|
| 1 | `analyze` | 解析文档结构、接口清单、合规标签 | `note`, `summary`, `phase→functional` |
| 2 | `functional` | 正向功能 / 接口用例 | `testCases[]`（type=functional） |
| 3 | `edge` | 边界、异常、GDPR/权限安全用例 | `testCases[]`（type=edge/security） |
| 4 | `review` | 去重补全、覆盖分析 | `coverage_notes`, `done=true` |

**终止策略**：`stopWhen: 'llm-done'` — 第 4 步 LLM 输出 `done: true` 或达 `maxSteps` 上限。

**stateMerge 策略**（`config.loop.stateMerge`）：

```javascript
{
  note: 'append',
  summary: 'replace',
  coverage_notes: 'replace',
  testCases: 'concat',   // 各 phase 用例累加
  phase: 'replace',
}
```

### 2.2 相对原方案的改进

原《测试用例生成Agent》将 MCP 工具（parsePRD、queryBusinessDoc、generateTestCases）放在 Egg.js 服务端，前端直连 MCP。**优化后**：

1. **工具职责下沉到 Skill 回调**：`beforeExecute` 解析文档；`enrichContext` 从服务端 REST 拉知识（HTTP，非 MCP）
2. **去掉 MCP 会话层**：进度由主应用 SSE（可选）或同步 JSON 响应中的 `output.steps` 提供
3. **Loop 替代单次 generateTestCases**：分 phase 生成，降低单轮 token 压力，提高边界/安全用例覆盖率
4. **记忆向量表**：`memoryConfig` 注入历史生成摘要，避免重复用例

---

## 3. Skill 插件结构

```
plugins/testgen-skill/
├── index.js              # scheme: loop, routes, callbacks
├── SKILL.md              # action 契约（generate / list / get / register-doc）
├── db/init.sql           # testgen_documents, testgen_runs
├── templates/loop-system.md
├── lib/docParser.js      # Markdown/API 文档解析
└── lib/store.js          # 落库封装
```

### 3.1 index.js 核心配置

```javascript
module.exports = {
  name: 'testgen-skill',
  scheme: 'loop',
  routes: [{ path: '/api/skills/testgen', method: 'POST' }],
  dbTables: ['testgen_documents', 'testgen_runs'],
  config: {
    llmDefaultProfile: 'ollama-qwen',
    loop: {
      maxSteps: 4,
      stopWhen: 'llm-done',
      systemPromptFile: 'loop-system.md',
      initialState: { phase: 'analyze', testCases: [], summary: '' },
      userContextFields: ['doc_meta', 'endpoints', 'requirements_hint'],
    },
  },
  callbacks: { beforeExecute, enrichContext, persistResult, formatResponse },
};
```

### 3.2 执行动作（SKILL.md）

| action | 说明 | 必填参数 |
|--------|------|----------|
| `generate` | 多步生成测试用例 | `doc_content` 或 `doc_id` 或 `doc_path` |
| `register-doc` | 注册源文档 | `doc_content` |
| `list` | 最近生成记录 | — |
| `get` | 单次 run 详情 | `run_id` |

### 3.3 enrichContext 与服务端协作

`enrichContext` **不**实现 PDF 解析或知识库查询，而是：

1. 本地 `docParser` 解析 inline / fixture 文档
2. 若传 `doc_id`，调用 **服务端层** `GET /api/documents/:id`（可选扩展）
3. 将 `endpoints`、`requirements_hint` 注入 Loop 的 user context

---

## 4. 上下文与 Prompt 设计

### 4.1 System Prompt 角色（templates/loop-system.md）

```plaintext
你是一位健身/业务系统测试专家。按 phase 迭代输出 JSON：
- analyze：梳理模块、接口、合规点
- functional：输出正向用例
- edge：边界值、冲突检测、GDPR/权限
- review：去重、补全 coverage_notes，设置 done=true
```

### 4.2 少样本模板（写入 loop-system.md 或 fixtures）

覆盖：课程预约冲突、GDPR 健康数据导出、会员权限联动等健身场景（见原方案 §2.3.2 示例）。

### 4.3 LLM 每步 JSON Schema

```json
{
  "continue": true,
  "phase": "functional",
  "note": "本步说明",
  "summary": "累计摘要",
  "coverage_notes": "覆盖分析",
  "testCases": [{
    "id": "TC-001",
    "title": "…",
    "type": "functional|edge|security",
    "priority": "high|medium|low",
    "preconditions": "…",
    "steps": ["…"],
    "expected": "…",
    "tags": ["GDPR", "课程预约"]
  }],
  "done": false
}
```

---

## 5. 主应用 BFF 集成

### 5.1 接入步骤

```bash
cd agent-management-master
ln -s ../../agent-management-sub/plugins/testgen-skill plugins/testgen-skill
# 或 PLUGIN_DIR=.../agent-management-sub/plugins
npm run dev
```

### 5.2 对外 API

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | `/api/skills/testgen` | 声明路由入口 |
| POST | `/api/skills/testgen-skill/invoke` | 通用 invoke（带 action） |
| GET | `/api/plugins/testgen-skill/skill-doc` | SKILL.md 全文 |

### 5.3 响应格式

```json
{
  "reply": "生成完成，共 12 条用例",
  "output": {
    "testCases": [/* 结构化用例 */],
    "test_case_count": 12,
    "steps": [/* 各 Loop 步 partialOutput */],
    "stoppedReason": "llm-done",
    "coverage_notes": "已覆盖预约冲突与 GDPR 导出"
  },
  "meta": { "run_id": 3, "stepsRun": 4, "skill": "testgen-skill" }
}
```

---

## 6. 数据库（Skill 内置 SQLite / PG）

| 表 | 说明 |
|----|------|
| `testgen_documents` | 注册的 PRD/API 文档 |
| `testgen_runs` | 每次生成 run（`test_cases_json`、`coverage_notes`） |

业务子应用的 **知识库主数据** 由服务端层维护；Skill 仅缓存生成 run 与可选文档副本。

---

## 7. 反模式（禁止）

- 在 Skill 内复制 fitness-agent 全套 BFF + agent 目录
- 在 Skill 内实现 MCP Server / 直连 OpenAI
- 用 BFF 关键词路由替代 Skill action 校验
- 前端直连 MCP（应走 REST + 可选 SSE）

---

## 8. 实施计划

| 阶段 | 内容 | 工期 |
|------|------|------|
| P1 | 完善 `testgen-skill` + loop-system 模板 | 1 周 |
| P2 | enrichContext 对接服务端文档 API | 1 周 |
| P3 | 主应用 SSE 流式（可选）与 selftest | 1 周 |
| P4 | 健身业务 fixtures + 质量评估 | 1 周 |

---

## 9. 相关文档

- [测试用例生成-服务端层设计](./测试用例生成-服务端层设计.md)
- [测试用例生成-前端层设计](./测试用例生成-前端层设计.md)
- [Loop 方案说明](../../../agent-management-master/docs/schemes/loop/README.md)
- [testgen-skill SKILL.md](../../plugins/testgen-skill/SKILL.md)
- [项目索引](./README.md)
