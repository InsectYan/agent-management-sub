# 接口测试执行 — 设计文档索引

> 原《接口测试系统代码开发设计报告》已按 **职责边界** 拆分为三份独立设计。  
> **本次迭代范围**：测试用例 **执行** 与 **编辑**；用例 **生成** 与 **列表** 已在 `testgen-sub` 实现，本文档仅引用、不重复设计。

## 迭代边界

| 状态 | 能力 | 实现位置 |
|------|------|----------|
| ✅ 已完成 | 测试范围配置、Agent 生成任务、用例列表/筛选/导出/删除 | [testgen](../testgen/) · `testgen-sub` |
| 🎯 本次设计 | 用例编辑、单/批量执行、执行监控、结果分析、性能瓶颈 Agent | 本文档三层 |

## 文档拆分

| 文档 | 归属 | 读者 | 说明 |
|------|------|------|------|
| [接口测试执行-前端层设计.md](./接口测试执行-前端层设计.md) | `testgen-sub/frontend/` | Vue 开发者 | 编辑抽屉、执行入口、监控与结果页（**无 Agent 直连**） |
| [接口测试执行-服务端层设计.md](./接口测试执行-服务端层设计.md) | `testgen-sub/backend/` | Egg.js 开发者 | 执行引擎、队列、WebSocket、结果落库、Agent HTTP 代理 |
| [接口测试执行-Agent与BFF层设计.md](./接口测试执行-Agent与BFF层设计.md) | `agent-management-sub` + 主应用 BFF | Skill 作者 | **仅** 性能瓶颈预测 Skill（剔除用例自动生成） |

## 架构总览

```
┌──────────────────────────────────────────────────────────────────┐
│  前端层（Vue 3 + Element Plus + AntV G2Plot）                       │
│  用例编辑 · 执行触发 · 监控大盘 · 结果分析                            │
│  （复用 TestSuitePage 列表，新增 Run / Edit / Monitor 路由）        │
└────────────────────────────┬─────────────────────────────────────┘
                             │ REST + 可选 WS（BFF 转发）
┌────────────────────────────▼─────────────────────────────────────┐
│  服务端层（Egg.js · testgen-sub BFF）                               │
│  test_runs / func_results / perf_results · Bull 执行队列            │
│  env_configs · HTTP 断言引擎 · agentProxy（性能分析）               │
└────────────────────────────┬─────────────────────────────────────┘
                             │ HTTP invoke（性能测试完成后）
┌────────────────────────────▼─────────────────────────────────────┐
│  Agent + BFF 层（agent-management-master + perf-bottleneck-skill） │
│  分析 TPS / P95 / 错误率 → 瓶颈预测报告与优化建议                      │
└──────────────────────────────────────────────────────────────────┘
```

## 与 testgen 生成的关系

- **用例数据来源**：`generation_jobs` → `test_cases`（已有表，见 [测试用例生成-服务端层设计](../testgen/测试用例生成-服务端层设计.md) §4.4）
- **执行扩展**：在 `test_cases` 上增加 `http_config`（API 请求与断言）及 `env_configs`（多环境基址），不改变生成链路
- **列表页**：继续沿用 `TestSuitePage`，新增「编辑」「执行」操作列

## 规范引用

| 层级 | 规范 |
|------|------|
| 前端 / 服务端 | [admin-management-station](https://github.com/) · `vue-web.mdc`、`egg-backend.mdc`、`subapp-onboarding.mdc`、`database-schema-sync.mdc` |
| Agent / Skill | [子 Agent 开发指南](../../docs/子Agent开发指南.md) |
| 组织规则 | [design-docs 总览](../README.md) |

## 源文档

- 原始完整设计（归档）：[source.md](./source.md)

## 相关登记

| 项 | 位置 |
|----|------|
| 子应用 | `admin-management-station/project-sub/testgen-sub/`（`app_key=testgen`） |
| 用例生成 Skill | `plugins/testgen-skill/`（**本次不涉及**） |
| 性能分析 Skill（待建） | `plugins/perf-bottleneck-skill/` |
