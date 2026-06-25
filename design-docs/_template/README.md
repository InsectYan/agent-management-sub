# {project_key} — 设计文档索引

> 将 `{project_key}`、`{显示名}` 替换为实际项目标识后使用。完整流程见 [design-docs 总览](../README.md)。

## 文档拆分

| 文档 | 归属 | 读者 | 说明 |
|------|------|------|------|
| [{显示名}-Agent与BFF层设计.md](./{显示名}-Agent与BFF层设计.md) | `agent-management-sub` + 主应用 | Skill 作者 | Agent 方案、Skill 回调 |
| [{显示名}-服务端层设计.md](./{显示名}-服务端层设计.md) | 业务子应用 `backend/` | Egg.js 开发者 | REST API、**无 Agent** |
| [{显示名}-前端层设计.md](./{显示名}-前端层设计.md) | 业务子应用 `frontend/` | Vue 开发者 | 页面与 BFF 对接，**无 Agent 直连** |

## 源文档

- 原始设计归档：[source.md](./source.md)

## 规范引用

- [子 Agent 开发指南](../../docs/子Agent开发指南.md)
- [design-docs 组织规则](../README.md)
