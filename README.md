# agent-management-sub

子 Agent（Skill）插件集合，通过热插拔注册到 [`agent-management-master`](../agent-management-master) 主应用。

## 定位

本子仓库维护 **轻量 Skill 插件**（配置 + callbacks + 可选表），**不是**独立 Agent 工程。主应用负责路由、LLM、Scheme 执行、DB 迁移与记忆。

## 文档

- [子 Agent 开发指南](./docs/子Agent开发指南.md) — 契约、回调流水线、方案选用、反模式
- [设计文档](./design-docs/testgen/README.md) — 测试用例生成（Agent / 服务端 / 前端 拆分，见 [组织规则](./design-docs/README.md)）
- [接口测试执行](./design-docs/apitest/README.md) — 用例编辑、执行、监控与性能瓶颈分析

## 示例 Skill

| Skill | scheme | 说明 |
|-------|--------|------|
| [testgen-skill](./plugins/testgen-skill/) | `loop` | 根据文档信息多步迭代生成测试用例 |
| [perf-bottleneck-skill](./plugins/perf-bottleneck-skill/) | `react` | 性能 run 完成后分析 TPS/P95/错误率，输出瓶颈报告 |

## 接入主应用

### 方式 1：符号链接

```bash
cd agent-management-master/plugins
ln -s ../../agent-management-sub/plugins/testgen-skill testgen-skill
npm run dev
```

### 方式 2：PLUGIN_DIR

在 `agent-management-master/.env` 中：

```env
PLUGIN_DIR=E:/AI_Projects/agent-management-sub/plugins
```

重启主应用后扫描加载。

## 验证

```bash
# 主应用 http://127.0.0.1:4001 已启动
curl http://127.0.0.1:4001/api/plugins | jq '.plugins[] | select(.name=="testgen-skill")'

# Skill 级 selftest
node scripts/selftest-testgen.js
```

## 快速调用

```bash
curl -X POST http://127.0.0.1:4001/api/skills/testgen \
  -H "Content-Type: application/json" \
  -d '{"doc_path":"fixtures/sample-user-api.md"}'
```

> 注意：`doc_path` 相对于 Skill 插件目录；也可直接传 `doc_content`。

## 目录结构

```
agent-management-sub/
├── docs/                    # 开发指南
├── design-docs/             # 项目设计（一项目一文件夹，见 design-docs/README.md）
│   └── testgen/
├── plugins/
│   └── testgen-skill/       # Loop 方案完整示例
│       ├── index.js
│       ├── SKILL.md
│       ├── db/
│       ├── lib/
│       ├── templates/
│       └── fixtures/
└── scripts/
    └── selftest-testgen.js
```

## 新增 Skill 检查清单

- [ ] `index.js` 含 `name`、`scheme`、`routes`、`callbacks`
- [ ] `SKILL.md` 含执行动作表格与入参/出参
- [ ] `db/init.sql` 与 `dbTables` 一致
- [ ] 不直连 LLM API Key，使用平台 `resolveLlm`
- [ ] 提供 selftest 或 curl 示例
