/**
 * tools/test-parse.js — 解析器自检
 * 运行：node tools/test-parse.js
 */
'use strict';
const fs = require('fs');
const path = require('path');
const parser = require('../js/gvas-parser.js');

const file = path.join(__dirname, '..', 'samples', 'PBZSaveGame.sav');
const bytes = new Uint8Array(fs.readFileSync(file));

(async () => {
  const t0 = Date.now();
  const result = await parser.parseSave(bytes);
  const ms = Date.now() - t0;

  console.log('=== 头部 ===');
  console.log('GVAS 版本:', result.header.saveGameVersion);
  console.log('引擎:', result.header.engineVersion
    ? `${result.header.engineVersion.major}.${result.header.engineVersion.minor}.${result.header.engineVersion.patch}`
    : '(v2 头部)');
  console.log('存档类:', result.header.saveGameClassName);
  console.log('自定义版本:', result.header.customVersions.map(v => v.name + '=' + v.version).join(', '));
  console.log('消耗比例:', (result.consumedRatio * 100).toFixed(1) + '%', '| 叶子节点:', result.leafCount);
  console.log('警告:', result.warnings.length ? result.warnings : '无');
  console.log('耗时:', ms + 'ms');

  console.log('\n=== 顶层属性 ===');
  for (const p of result.root) {
    let brief;
    if (p.type === 'ArrayProperty') brief = `[${p.value.__array} × ${p.value.__children.length}]`;
    else if (p.type === 'MapProperty') brief = `{${p.value.__map}, ${p.value.__children.length} 项}`;
    else if (p.type === 'StructProperty' && p.value && p.value.__children) brief = `{${p.structName}, ${p.value.__children.length} 字段}`;
    else brief = JSON.stringify(p.value);
    console.log(`  ${p.name} : ${p.type.replace('Property', '')} = ${brief}${p.uncertain ? '  ⚠不确定' : ''}`);
  }

  console.log('\n=== Boss 记录 ===');
  const boss = result.root.find(p => p.name === 'BossRecords');
  if (boss) {
    for (const e of boss.value.__children) {
      const fields = {};
      for (const c of (e.value.__children || [])) fields[c.name] = c.value;
      console.log(`  ${e.key}:`, fields);
    }
  } else {
    console.log('  未找到 BossRecords');
  }

  console.log('\n=== 断言 ===');
  const flat = new Map();
  (function walk(list, prefix) {
    for (const n of list) {
      const p = prefix ? prefix + '.' + n.name : n.name;
      if (n.value && typeof n.value === 'object') {
        if (n.value.__children) walk(n.value.__children.map(c => Object.assign({}, c, { name: c.name || c.index })), p);
        else flat.set(p, n.value);
      } else flat.set(p, n.value);
    }
  })(result.root, '');

  const checks = [
    ['TotalPlayTimeSeconds', 138420],
    ['TotalDeathCount', 168],
    ['CurrentDay', 41],
    ['Currency', 24860],
    ['bIsSixtySixDayMode', false],
    ['Collectibles.Petals', 37],
  ];
  let ok = true;
  for (const [k, expect] of checks) {
    const actual = flat.get(k);
    const pass = actual === expect;
    if (!pass) ok = false;
    console.log(`  ${pass ? '✓' : '✗'} ${k} = ${JSON.stringify(actual)} (期望 ${JSON.stringify(expect)})`);
  }
  console.log(ok ? '\n全部通过' : '\n存在失败项');
  process.exit(ok ? 0 : 1);
})();
