/**
 * @file selftest-testgen.js
 * @description testgen-skill 冒烟测试（需主应用已启动并加载本 Skill）
 *
 * 用法：
 *   cd agent-management-sub
 *   node scripts/selftest-testgen.js
 *
 * 环境变量：
 *   BASE_URL  默认 http://127.0.0.1:3001
 *   PLUGIN_DIR  若 Skill 未链入主应用，请先设置 PLUGIN_DIR 指向本仓库 plugins 并重启主应用
 */

'use strict';

const fs = require('fs');
const path = require('path');

const BASE = process.env.BASE_URL || 'http://127.0.0.1:3001';
const FIXTURE = path.join(__dirname, '../plugins/testgen-skill/fixtures/sample-user-api.md');

async function postJson(urlPath, data) {
  const res = await fetch(`${BASE}${urlPath}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  const text = await res.text();
  let body;
  try {
    body = JSON.parse(text);
  } catch {
    body = { raw: text.slice(0, 300) };
  }
  return { status: res.status, body };
}

async function getJson(urlPath) {
  const res = await fetch(`${BASE}${urlPath}`);
  const body = await res.json();
  return { status: res.status, body };
}

async function main() {
  console.log('=== testgen-skill selftest ===\n');

  const plugins = await getJson('/api/plugins');
  const skill = plugins.body.plugins?.find(p => p.name === 'testgen-skill');
  if (!skill) {
    console.error('[FAIL] testgen-skill 未加载。请将 plugins 链入主应用或设置 PLUGIN_DIR 后重启。');
    process.exit(1);
  }
  console.log('[plugin]', { scheme: skill.scheme, dbTables: skill.dbTables, hasSkillDoc: skill.hasSkillDoc });

  const doc = fs.readFileSync(FIXTURE, 'utf8');

  const register = await postJson('/api/skills/testgen-skill/invoke', {
    action: 'register-doc',
    doc_title: '用户管理 API（selftest）',
    doc_content: doc,
    tags: [ 'api', 'selftest' ],
  });
  console.log('[register-doc]', register.status, {
    doc_id: register.body?.output?.doc_id ?? register.body?.meta?.doc_id,
    reply: register.body?.reply?.slice(0, 60),
  });

  const generate = await postJson('/api/skills/testgen', {
    action: 'generate',
    doc_content: doc,
    doc_title: '用户管理 API',
  });
  console.log('[generate]', generate.status, {
    reply: generate.body?.reply?.slice(0, 100),
    test_case_count: generate.body?.output?.test_case_count,
    stepsRun: generate.body?.meta?.stepsRun,
    run_id: generate.body?.meta?.run_id,
    stoppedReason: generate.body?.output?.stoppedReason,
  });

  const list = await postJson('/api/skills/testgen-skill/invoke', { action: 'list' });
  console.log('[list]', list.status, list.body?.reply?.slice(0, 120));

  const runId = generate.body?.meta?.run_id;
  if (runId) {
    const get = await postJson('/api/skills/testgen-skill/invoke', {
      action: 'get',
      run_id: runId,
    });
    const cases = get.body?.output?.test_cases || [];
    console.log('[get]', get.status, {
      run_id: runId,
      case_count: cases.length,
      sample: cases[0]?.title,
    });
  }

  const ok = generate.status === 200 && list.status === 200;
  console.log(ok ? '\n[OK] testgen-skill selftest passed' : '\n[WARN] 部分请求异常，请检查 LLM 配置');
  process.exit(ok ? 0 : 1);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
