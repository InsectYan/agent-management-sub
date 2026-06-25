# 测试用例生成 — 设计文档索引

> 原《健身系统测试用例生成Agent开发方案》已按 **职责边界** 拆分为三份独立设计，避免 Agent、业务 BFF、前端 UI 混写在同一文档。

## 文档拆分

| 文档 | 归属 | 读者 | 说明 |
|------|------|------|------|
| [测试用例生成-Agent与BFF层设计.md](./测试用例生成-Agent与BFF层设计.md) | `agent-management-sub` + `agent-management-master` | Skill 作者 | Loop 方案、`testgen-skill`、主应用 BFF 编排 |
| [测试用例生成-服务端层设计.md](./测试用例生成-服务端层设计.md) | 业务子应用 `backend/` | Egg.js 开发者 | REST API、知识库、生成任务代理（**无 Agent**） |
| [测试用例生成-前端层设计.md](./测试用例生成-前端层设计.md) | 业务子应用 `frontend/` | Vue 开发者 | 配置/进度/用例展示（**无 MCP 客户端**） |

## 架构总览

```
┌─────────────────────────────────────────────────────────────┐
│  前端层（Vue 3 + Element Plus + AntV）                        │
│  测试范围配置 · 进度展示 · 用例可视化                          │
└───────────────────────────┬─────────────────────────────────┘
                            │ REST
┌───────────────────────────▼─────────────────────────────────┐
│  服务端层（Egg.js 业务 BFF）                                  │
│  文档/知识库 CRUD · generation_jobs · 代理调用 Agent 平台     │
└───────────────────────────┬─────────────────────────────────┘
                            │ HTTP invoke
┌───────────────────────────▼─────────────────────────────────┐
│  Agent + BFF 层（agent-management-master + testgen-skill）    │
│  Loop 多步生成 · Skill 回调 · testgen_runs 落库               │
└───────────────────────────────────────────────────────────────┘
```

## 规范引用

- Agent / Skill：[子 Agent 开发指南](../../docs/子Agent开发指南.md)
- Agent 方案：[方案索引](../../../agent-management-master/docs/schemes/README.md)（选用 **loop**）
- 子应用 BFF / 前端：[admin-management-station](../../../admin-management-station) 开发规范
- 组织规则：[design-docs 总览](../README.md)

## 业务背景（摘要）

健身系统测试用例生成需覆盖：功能流程、边界值、GDPR 合规、课程预约冲突、会员权限联动等场景。Agent 通过知识库与多步 Loop 生成结构化用例；业务数据与 UI 由独立服务端与前端承担。

## 示例 Skill

实现参考：[plugins/testgen-skill](../../plugins/testgen-skill/)

## 相关登记

| 项 | 位置 |
|----|------|
| 子应用 | `admin-management-station/testgen-sub/`（`app_key=testgen`） |
| Skill | `plugins/testgen-skill/` |
