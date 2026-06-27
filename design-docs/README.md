# design-docs — 项目设计文档库

> **规则**：**一个项目一个文件夹**。禁止在 `design-docs/` 根目录直接堆放 `.md` 文件。

## 目录结构

```
design-docs/
├── README.md                 # 本文件：组织规则与梳理流程
├── {project_key}/            # 一个项目一个目录（小写英文，与 app_key / Skill 名对齐）
│   ├── README.md             # 项目索引：架构总览、文档拆分表、规范引用
│   ├── source.md             # （可选）用户提供的原始设计文档，只读归档
│   ├── {project}-Agent与BFF层设计.md
│   ├── {project}-服务端层设计.md
│   └── {project}-前端层设计.md
└── _template/                # 新项目骨架（复制后改名）
```

## 命名约定

| 项 | 规则 | 示例 |
|----|------|------|
| 项目目录 `{project_key}` | 小写英文，与 `app_key` 或 Skill 前缀一致 | `testgen` |
| 索引文件 | 固定 `README.md` | `testgen/README.md` |
| 原始文档 | 固定 `source.md` | 用户扔进来的源稿归档于此 |
| 拆分文档 | `{中文项目名}-{层级}设计.md` | `测试用例生成-服务端层设计.md` |

## 职责拆分（默认三层）

收到混合职责的源设计文档时，按边界拆成三份（可增减，但须在索引 README 中声明）：

| 文档 | 归属 | 边界 |
|------|------|------|
| Agent与BFF层设计 | `agent-management-sub` + 主应用 BFF | Skill、Loop/Scheme、回调、**无**业务 CRUD UI |
| 服务端层设计 | 业务子应用 `backend/` | REST API、数据库、Agent HTTP 代理，**无** LLM/MCP |
| 前端层设计 | 业务子应用 `frontend/` | 页面、组件、BFF REST 对接，**无** Agent 直连 |

## 源设计文档优化流程

当用户提供一份**未拆分**的源设计文档并要求优化时，Agent 须按以下顺序执行：

### 1. 立项

- 确定 `{project_key}`（若无则与用户确认或使用语义缩写）
- 创建 `design-docs/{project_key}/`
- 将源文档保存为 `source.md`（不改写原文，仅归档）

### 2. 分析

- 通读 `source.md`，标注：前端 / 业务 BFF / Agent / 基础设施 职责
- 列出混写问题（如 MCP 放在 Egg.js、前端直连 LLM 等）
- 选定 Agent 方案（见主应用 [方案索引](../../agent-management-master/docs/schemes/README.md)）

### 3. 拆分撰写

- 编写 `{project_key}/README.md` 索引（架构图 + 文档表 + 规范链接）
- 按三层（或项目实际需要）生成独立 `.md`，每份文档头部须含：
  - **读者**、**归属**、**边界**（本层包含 / 不包含）
  - 对 `source.md` 章节的对照引用（如 `source.md §3.2`）

### 4. 交叉引用

- 索引 README 链到各层文档
- 各层文档末尾「相关文档」互链，并链回索引
- 规范链接使用相对路径（从 `{project_key}/` 出发）

### 5. 登记

- 若对应子应用：在 `admin-management-station` 登记 `app_key` 与 `project-developer/{app_key}/`
- 若对应 Skill：在 `plugins/{skill-name}/` 实现并在索引中链接

## 已登记项目

| project_key | 显示名 | 索引 |
|-------------|--------|------|
| `testgen` | 测试用例生成 / AI智能测试平台 | [testgen/README.md](./testgen/README.md) |
| `apitest` | 接口测试执行（编辑 · 执行 · 监控 · 性能 Agent） | [apitest/README.md](./apitest/README.md) |

## 禁止

- 在 `design-docs/` 根目录新增业务设计 `.md`（仅允许本 README）
- 在 Skill 或子应用仓库重复粘贴完整源稿（源稿只保留在 `source.md`）
- 拆分文档混写 Agent 实现与 Vue 页面细节于同一文件
