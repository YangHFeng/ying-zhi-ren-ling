/**
 * tools/test-real.js — 用真实存档验证 PBZS 解密与指标提取
 *
 * 用法：node tools/test-real.js [存档路径]
 * 默认读取 $USERPROFILE/Desktop/PBZSaveGame.sav
 */
'use strict';

const fs = require('fs');
const path = require('path');

globalThis.window = globalThis;   // boss-atlas 以 window 为宿主
require('../js/boss-atlas.js');

const Save = require('../js/pbzs.js');
const View = require('../js/pbz-view.js');
const atlas = globalThis.PBZBossAtlas;

const file = process.argv[2] || path.join(process.env.USERPROFILE, 'Desktop', 'PBZSaveGame.sav');

(async () => {
  const buf = fs.readFileSync(file);
  console.log('文件：', file, '（' + buf.length + ' 字节）');

  const save = await Save.open(buf);
  console.log('容器：PBZS v' + save.header.version, '| 槽位', save.header.slotCount, '| 目录', save.header.directorySize, '字节');
  console.table(save.slots.map(s => ({ 名称: s.name, 算法: s.algorithm, 原始大小: s.rawSize, 偏移: s.offset, 块大小: s.blockSize })));

  // 每个槽都解一遍，确认没有坏块
  const parsed = {};
  for (const slot of save.slots) {
    const json = await save.readJson(slot);
    parsed[slot.name] = json;
    const g = json.PBZGameSystem || {};
    console.log('  ✓', slot.name.padEnd(18), '时间', String(g.CurrentCycleGameTime || '-').padStart(7), '死亡', String((json.PBZDeathMeta || {}).DiedTimes || '-').padStart(4), 'Boss', Object.keys(json.BossRecord || {}).length);
  }

  // 取最新的游玩槽
  const playable = save.slots.filter(s => !/^__/.test(s.name));
  const latest = playable.reduce((a, b) => {
    const ta = parsed[a.name].PBZGameSystem.DateTimeString;
    const tb = parsed[b.name].PBZGameSystem.DateTimeString;
    return ta > tb ? a : b;
  });

  const result = View.build(
    Object.assign({ json: parsed[latest.name], slotName: latest.name, size: buf.length, slotCount: save.header.slotCount }),
    { atlas, advanced: parsed.__Advanced__, achievements: parsed.__Achievements__ }
  );

  const v = result.view;
  console.log('\n=== 选用槽位：' + latest.name + ' ===');
  console.log('游戏时长  ', v.playTimeText, '(' + v.playTimeSeconds + ' 秒)');
  console.log('死亡次数  ', v.deathCount);
  console.log('尘土      ', v.currency);
  console.log('进度      ', '第 ' + v.day + ' / ' + v.dayLimit + ' 天，剩余 ' + v.remainingDays + ' 天');
  console.log('难度      ', v.difficulty, '(byte ' + v.difficultyByte + ')');
  console.log('周目      ', v.cycleCount, '| 通关', v.finished);
  console.log('存档时间  ', v.savedAt);
  console.log('Boss      ', v.bossDefeated + ' / ' + v.bossTotal + ' 已击破');
  console.log('物品      ', v.items.count, '种，合计', v.items.total, '| 分类', JSON.stringify(v.items.buckets));
  console.log('武器      ', v.weapons.count, '把，最高 +' + v.weapons.maxPlus, '| 副武器', v.edges.count);
  console.log('图鉴      ', JSON.stringify(v.collectibles));
  console.log('成就      ', v.achievements);
  console.log('评语      ', v.verdict.rank, '|', v.verdict.lines.join(' '));

  console.log('\n=== Boss 明细 ===');
  v.bosses.forEach(b => {
    console.log(
      (b.matched ? '●' : '○'),
      b.display.padEnd(22),
      ('死 ' + b.deaths).padStart(5),
      ('挑战 ' + b.attempts).padStart(8),
      (b.region || '-').padEnd(10),
      b.bestTime || ''
    );
  });
  const unmatched = v.bosses.filter(b => !b.matched);
  console.log('\n图鉴未匹配：', unmatched.length, unmatched.map(b => b.rawName).join(', ') || '（无）');
})().catch(err => {
  console.error('失败：', err.message);
  if (err.stack) console.error(err.stack.split('\n').slice(1, 4).join('\n'));
  process.exit(1);
});
