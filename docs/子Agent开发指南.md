# 子 Agent（Skill）开发指南

> **读者**：子 Agent 插件作者  
> **主应用仓库**：[`agent-management-master`](../agent-management-master)  
> **本子仓库**：`agent-management-sub` — 独立维护的 Skill 插件集合，通过热插拔注册到主应用

---

## 1. 定位与边界

子 Agent **不是** fitness-agent / cartoon-agent 级别的完整工程，而是 **轻量 Skill 插件**：

| 子 Agent 包含 | 子 Agent 不包含 |
|---------------|----------------|
| `index.js` 元数据 + `callbacks` | 独立 `server/`、BFF Pipeline |
| `SKILL.md` 业务契约 | 多套 workspace 多角色模板 |
| 可选 `db/`、`templates/`、`lib/` | 前端 UI、独立部署单元 |
| 声明 `scheme` 选用主应用执行方案 | 在 Skill 内硬编码 apiKey / 直连 LLM |

主应用负责：路由挂载、LLM 解析（`resolveLlm`）、Scheme 执行、DB 迁移、记忆、SSE。

子 Agent 负责：业务配置、入参校验、上下文 enrich、结果格式化与落库。

---

## 2. 目录结构（推荐）

```
plugins/{skill-name}/
├── index.js              # ★ 必须：元数据 + callbacks
├── SKILL.md              # ★ 强烈建议：用途、动作、入参/出参（启动时解析）
├── db/
│   ├── init.sql          # SQLite 建表
│   └── init.pg.sql       # PostgreSQL 建表（可选，优先于 init.sql）
├── templates/            # 可选：Prompt 模板
├── lib/                  # 可选：业务工具（解析、落库封装）
├── fixtures/             # 可选：示例输入 / 文档
└── scripts/              # 可选：Skill 级 selftest
```

---

## 3. index.js 契约

```javascript
module.exports = {
  name: 'my-skill',                    // 全局唯一
  version: '1.0.0',
  description: '业务说明',
  scheme: 'loop',                      // pi | langchain | loop | react
  riskLevel: 'normal',                 // normal | high（high 可走沙箱）
  routes: [{
    path: '/api/skills/my',
    method: 'POST',
    description: '业务入口',
    requiresAuth: false,
  }],
  dbTables: ['my_table'],
  memoryConfig: {
    enabled: true,
    type: 'vector',                    // file | vector
    table: 'my_memory',
  },
  config: {
    llmDefaultProfile: 'ollama-qwen',  // P2 模型默认
    actionDefaults: { POST: 'run' },   // HTTP 方法 → 默认 action
    loop: { maxSteps: 5, stopWhen: 'llm-done' },  // scheme 相关
  },
  callbacks: {
    async beforeExecute(ctx, params) { /* 校验 / 规范化 */ },
    async enrichContext(ctx, params) { /* 拼执行输入 */ },
    async persistResult(ctx, payload) { /* 落库 */ },
    async formatResponse(ctx, result) { /* HTTP 响应 */ },
    async onEnable(app) {},
    async onDisable(app) {},
  },
};
```

### 3.1 字段说明

| 字段 | 必填 | 说明 |
|------|------|------|
| `name` | 是 | Skill 唯一标识，与目录名建议一致 |
| `scheme` | 是 | 选用主应用 Agent 方案，见 [方案索引](../agent-management-master/docs/schemes/README.md) |
| `routes` | 否 | 自定义 HTTP 路由；也可用通用 `POST /api/skills/:name/invoke` |
| `dbTables` | 否 | 业务表名；启动时执行 `db/init.sql` |
| `memoryConfig` | 否 | 启用后平台注入 `_memoryContext` |
| `config.llmDefaultProfile` | 建议 | Skill 级 LLM 默认（P2） |
| `callbacks` | 建议 | 业务钩子，见 §4 |

兼容旧字段 `agentType`，但请统一使用 `scheme`。

---

## 4. 回调流水线

主应用对 **所有 Skill** 使用统一编排：

```
HTTP 请求
  → RouteManager 匹配路由
  → resolveLlm（请求 llm_profile > Skill 默认 > 平台 Ollama）
  → callbacks.beforeExecute
  → SKILL.md resolveAction（校验 action / 必填参数）
  → callbacks.enrichContext
  → memoryEngine.getContext（若启用记忆）
  → SchemeRegistry.get(scheme).executeTask
  → callbacks.persistResult
  → callbacks.formatResponse
  → JSON 响应
```

### 4.1 beforeExecute(ctx, params)

- 规范化字段名（如 `message` / `text`）
- 校验业务规则
- 返回新的 `params` 对象

### 4.2 enrichContext(ctx, params)

- 查库、读文件、拼文档上下文
- 返回的对象作为 Executor 的 `input`
- **list / get 等只读动作** 在此组装查询结果

### 4.3 persistResult(ctx, payload)

`payload` 含 `{ params, output, text, llm, meta }`。

- 写 `dbTables` 对应表
- 只读动作返回 `{ persisted: false, reason: '...' }`

### 4.4 formatResponse(ctx, result)

默认返回 `{ reply, output, meta }` 即可。

---

## 5. SKILL.md 规范

平台启动时解析 `SKILL.md`，用于：

- 提取 **用途** 段落 → `skillDoc.purpose`
- 解析 **执行动作** 表格 → 校验 `action` 与必填参数
- 通过 `GET /api/plugins/:name/skill-doc` 对外暴露

### 5.1 动作表格格式

```markdown
## 执行动作

| action | 说明 | 必填参数 |
| generate | 根据文档生成测试用例 | doc_content |
| list | 列出历史记录 | |
```

### 5.2 建议章节

- 用途
- 执行动作
- 入参说明
- 出参说明
- 数据库表
- 调用示例

---

## 6. Agent 方案选用

| scheme | 适用场景 | Skill 配置要点 |
|--------|----------|----------------|
| `pi` | 文件工作区、tools、outbox | `SKILL.md`、`tools/*.mjs` |
| `langchain` | Chain / Tool 编排 | `config.chain` |
| `loop` | 多步迭代、自我修正 | `config.loop`、`templates/` |
| `react` | Thought-Action-Observation | `config.react` |

本仓库示例 **testgen-skill** 选用 **`loop` 方案**：在 `maxSteps` 内循环调用 LLM，逐步完善测试用例集。

Loop 配置项（`config.loop`）：

| 字段 | 说明 | 默认 |
|------|------|------|
| `maxSteps` | 最大迭代步数（1–10） | 5 |
| `stopWhen` | 终止策略 | `llm-done` |
| `systemPrompt` | 系统 Prompt（覆盖方案默认） | 调研助手模板 |
| `jsonSchemaHint` | 每步 LLM 应输出的 JSON 结构说明 | 见 loop/runLoop.js |
| `stateMerge` | LLM 字段如何合并进 state | `{ note: 'append', summary: 'replace' }` |

---

## 7. 接入主应用

### 7.1 方式 A：符号链接 / 复制

```bash
# 将本子仓库 plugins 链入主应用
cd agent-management-master
mkdir -p plugins
ln -s ../../agent-management-sub/plugins/testgen-skill plugins/testgen-skill
npm run dev
```

### 7.2 方式 B：PLUGIN_DIR 环境变量

```bash
# .env
PLUGIN_DIR=E:/AI_Projects/agent-management-sub/plugins
```

主应用会扫描该目录下所有含 `index.js` 的子目录。

### 7.3 验证

```bash
curl http://127.0.0.1:4001/api/plugins
curl http://127.0.0.1:4001/api/plugins/testgen-skill/skill-doc
```

---

## 8. 数据库与落库

1. 在 `dbTables` 声明表名
2. 编写 `db/init.sql`（及可选 `init.pg.sql`）
3. 在 `persistResult` 中写入

Skill 内可通过 `ctx.app.config.appSettings.root` 定位主应用根目录，引用 `app/lib/db/pool` 执行 SQL（见 testgen-skill 的 `lib/store.js`）。

---

## 9. LLM 使用规范

- **禁止** 在 Skill 内读取 `process.env.OPENAI_API_KEY`
- 模型由平台 `resolveLlm` 注入，Executor 与 hooks 使用 `llm` 对象
- 请求可传 `llm_profile` 覆盖 Skill 默认

---

## 10. 反模式（禁止）

- 复制 fitness/cartoon 全套 BFF + agent 目录
- 在 Skill 内写大段 scheme 分支编排（应扩展 scheme 或收紧 callbacks）
- BFF 用关键词替 Skill 做意图路由
- 缺少 SKILL.md 导致 action 无法校验

---

## 11. 示例 Skill

| Skill | scheme | 说明 |
|-------|--------|------|
| [testgen-skill](../plugins/testgen-skill/) | `loop` | 根据文档信息多步生成测试用例 |

运行 selftest：

```bash
# 主应用已启动
node scripts/selftest-testgen.js
```

---

## 12. 参考文档（主应用）

- [主应用完整开发方案 §5](../agent-management-master/docs-design/主应用完整开发方案.md) — Skill 契约
- [Loop 方案](../agent-management-master/docs/schemes/loop/README.md) — Loop 执行说明
- [方案索引](../agent-management-master/docs/schemes/README.md) — 全部 Agent 方案

---

## 13. 项目设计文档

业务 Skill 的完整方案（含前端 / 服务端 / Agent 拆分）放在 [`design-docs/`](../design-docs/README.md)：

- **一项目一文件夹**：`design-docs/{project_key}/`
- 索引：`README.md`；源稿归档：`source.md`
- 示例：[testgen/](../design-docs/testgen/README.md)（`testgen-skill` 对应项目）

用户提供未拆分的源设计文档时，按 [design-docs 梳理流程](../design-docs/README.md#源设计文档优化流程) 执行。
