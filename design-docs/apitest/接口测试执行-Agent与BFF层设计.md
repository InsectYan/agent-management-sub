# 接口测试执行 — Agent 与 BFF 层设计

> **读者**：子 Agent（Skill）作者、主应用 BFF 开发者  
> **归属**：`agent-management-sub`（Skill）+ `agent-management-master`（平台 BFF）  
> **规范**：[子 Agent 开发指南](../../docs/子Agent开发指南.md) · [方案索引](../../../agent-management-master/docs/schemes/README.md)  
> **边界**：**仅** 性能瓶颈预测 Skill；**剔除** 测试用例自动生成 Agent（已由 `testgen-skill` 承担且本次不扩展）  
> **参考**：[source.md](./source.md) §6 · [测试用例生成-Agent与BFF层设计](../testgen/测试用例生成-Agent与BFF层设计.md)

---

## 1. 定位与边界

| 本层包含 | 本层不包含 |
|----------|------------|
| `perf-bottleneck-skill` 插件（新建） | `testgen-skill` 用例生成 Loop |
| 主应用 BFF 统一编排（RouteManager、SchemeRegistry） | 前端 UI、AntV 图表 |
| 性能数据 → 瓶颈报告 JSON | HTTP 压测执行（见服务端层 executionEngine） |
| Skill 回调：校验、enrich、落库、formatResponse | 直连 LLM / 硬编码 apiKey |
| 测试结果智能分析 Agent | source.md §6.1.3（Phase 3 可选） |

**触发时机**：业务 BFF 在 **性能测试 run 完成** 后 HTTP invoke `action=analyze`（见 [服务端层设计](./接口测试执行-服务端层设计.md) §6）。

```
POST /api/skills/perf-bottleneck-skill/invoke
  → RouteManager
  → resolveLlm
  → beforeExecute（校验 perf_samples）
  → enrichContext（拼历史 run、case 元数据）
  → SchemeRegistry.get('react').executeTask   # 或 loop 单步
  → persistResult → perf_bottleneck_runs
  → formatResponse
  → JSON { reply, output, meta }
       ↓
testgen BFF 写入 test_runs.perf_analysis
```

---

## 2. 方案选型

| scheme | 是否适用 | 说明 |
|--------|----------|------|
| `loop` | 可选 | 多轮：聚合 → 瓶颈识别 → 建议生成 → 复核 |
| **`react`** | **推荐 P1** | Thought → 分析指标 → 输出结构化报告，步骤少、延迟低 |
| `pi` | 否 | 需文件工作区，过重 |
| `langchain` | 部分 | 若需 RAG 拉历史报告可用，P1 不必 |

**P1 建议**：`react`，`maxSteps=3`，`stopWhen: 'llm-done'`。

---

## 3. Skill 插件结构（待建）

```
plugins/perf-bottleneck-skill/
├── index.js
├── SKILL.md
├── db/
│   ├── init.sql              # perf_bottleneck_runs
│   └── init.pg.sql
├── templates/
│   └── react-system.md       # 性能分析专家角色 + JSON 输出 schema
├── lib/
│   ├── metricsNormalizer.js  # perf_samples → 统计摘要
│   └── store.js
└── fixtures/
    └── sample-perf-run.json
```

### 3.1 index.js 核心配置

```javascript
module.exports = {
  name: 'perf-bottleneck-skill',
  scheme: 'react',
  routes: [{ path: '/api/skills/perf-bottleneck', method: 'POST' }],
  dbTables: ['perf_bottleneck_runs'],
  config: {
    llmDefaultProfile: 'ollama-qwen',
    react: {
      maxSteps: 3,
      stopWhen: 'llm-done',
      systemPromptFile: 'react-system.md',
    },
  },
  callbacks: { beforeExecute, enrichContext, persistResult, formatResponse },
};
```

### 3.2 执行动作（SKILL.md）

| action | 说明 | 必填参数 |
|--------|------|----------|
| **`analyze`** | 分析单次性能 run，输出瓶颈报告 | `run_id`, `perf_samples` |
| `list` | 最近分析记录 | — |
| `get` | 单次分析详情 | `run_id` 或 `analysis_id` |

**剔除动作**：`generate`（用例生成）、`register-doc` 等 testgen 专属 action。

---

## 4. 输入 / 输出契约

### 4.1 invoke 请求（来自 testgen BFF）

```json
{
  "action": "analyze",
  "run_id": 100,
  "perf_samples": [
    {
      "window_start": "2026-06-27T10:00:00Z",
      "tps": 120.5,
      "avg_response_time_ms": 85,
      "p95_response_time_ms": 210,
      "error_rate": 0.02
    }
  ],
  "case_meta": {
    "case_id": "TC-001",
    "title": "课程预约接口压测",
    "module": "course_booking",
    "url": "/api/booking"
  },
  "env_name": "staging"
}
```

### 4.2 LLM 输出 JSON Schema

```json
{
  "continue": false,
  "done": true,
  "summary": "整体 TPS 达标，P95 在高峰窗口劣化明显",
  "bottlenecks": [
    {
      "area": "database",
      "severity": "high",
      "evidence": "error_rate 从 0.5% 升至 3.2%，P95 同步飙升",
      "recommendation": "检查预约表索引与连接池配置"
    }
  ],
  "risk_level": "medium",
  "optimization_priority": ["连接池", "慢查询", "缓存热点"]
}
```

### 4.3 HTTP 响应（BFF → testgen BFF）

```json
{
  "reply": "性能分析完成，识别 2 处瓶颈",
  "output": {
    "report": {
      "summary": "...",
      "bottlenecks": [],
      "risk_level": "medium",
      "optimization_priority": []
    }
  },
  "meta": { "run_id": 100, "analysis_id": 5, "skill": "perf-bottleneck-skill" }
}
```

testgen BFF 将 `output.report` 写入 `test_runs.perf_analysis`。

---

## 5. 回调设计

### 5.1 beforeExecute

- 校验 `perf_samples` 非空数组
- 校验 `run_id` 存在
- `metricsNormalizer.summarize(perf_samples)` 生成 `stats` 注入 params

### 5.2 enrichContext

- 可选 HTTP 拉 testgen BFF `GET /api/test-runs/:id/results`（内部 Token）补充上下文
- 注入 `case_meta`、`env_name`、历史同类 run 摘要（memoryConfig P2）

### 5.3 persistResult

写入 `perf_bottleneck_runs`：

```sql
CREATE TABLE perf_bottleneck_runs (
  id            SERIAL PRIMARY KEY,
  run_id        INT NOT NULL,
  report_json   JSONB NOT NULL,
  risk_level    VARCHAR(16),
  created_at    TIMESTAMPTZ DEFAULT NOW()
);
```

### 5.4 formatResponse

返回 `{ reply, output: { report }, meta }`，与 testgen BFF `agentProxy` 解析一致。

---

## 6. Prompt 设计要点（react-system.md）

角色：**性能测试分析专家**。

分析维度（对齐 source.md §6.1.2）：

1. TPS 趋势与饱和度
2. P95 / 平均响应时间劣化窗口
3. 错误率突变与可能根因（DB、下游、限流、资源）
4. 可执行优化建议（按优先级排序）

**禁止**：生成新测试用例、修改用例步骤。

---

## 7. 主应用 BFF 集成

```bash
cd agent-management-master
ln -s ../../agent-management-sub/plugins/perf-bottleneck-skill plugins/perf-bottleneck-skill
npm run dev
```

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | `/api/skills/perf-bottleneck` | 声明路由 |
| POST | `/api/skills/perf-bottleneck-skill/invoke` | 通用 invoke |
| GET | `/api/plugins/perf-bottleneck-skill/skill-doc` | SKILL.md |

---

## 8. 与 testgen-skill 的关系

| 项 | testgen-skill | perf-bottleneck-skill |
|----|---------------|------------------------|
| 触发 | 用户创建 generation_job | 性能 test_run 完成 |
| 输入 | PRD / 文档 | perf_results 时序 |
| 输出 | testCases[] | bottlenecks 报告 |
| 本次迭代 | **不扩展** | **新建** |

两者 **独立插件**，共用主应用 BFF 编排，不互相调用。

---

## 9. 反模式（禁止）

- 在 perf Skill 内实现用例生成或 Loop 四阶段
- 在 Skill 内执行 HTTP 压测
- 前端直连 Skill / MCP
- 复制 testgen-skill 全量代码到 perf Skill

---

## 10. 实施阶段（方案级）

| 阶段 | 内容 |
|------|------|
| P1 | `perf-bottleneck-skill` + react 模板 + fixtures selftest |
| P2 | enrichContext 拉 testgen 历史 run；memoryConfig 向量去重建议 |
| P3 | 可选 loop 多轮深析；与 Grafana 指标对齐（外部） |

---

## 11. 验收清单（设计阶段）

- [ ] `action=analyze` 契约与 SKILL.md 一致
- [ ] 输出 JSON 可被 testgen BFF 直接写入 `perf_analysis`
- [ ] 无 generate / 用例相关 action
- [ ] 符合子 Agent 开发指南目录与 callbacks 规范

---

## 12. 相关文档

- [接口测试执行-服务端层设计](./接口测试执行-服务端层设计.md)
- [接口测试执行-前端层设计](./接口测试执行-前端层设计.md)
- [测试用例生成-Agent与BFF层设计](../testgen/测试用例生成-Agent与BFF层设计.md)（生成 Agent，本次不实施）
- [项目索引](./README.md)
