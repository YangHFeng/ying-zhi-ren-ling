/**
 * tools/test-variants.js — 变体存档容错测试
 * 覆盖：字段改名 / 无 PropertyGuid / 压缩档 / 截断档
 */
'use strict';
const zlib = require('zlib');
const parser = require('../js/gvas-parser.js');
const metrics = require('../js/metrics.js');

/* ---------- 迷你 GVAS 构造器 ---------- */
function fstring(s) {
  if (!s) return Buffer.alloc(4);
  const chars = [...s];
  const buf = Buffer.alloc((chars.length + 1) * 2);
  buf.write(s, 0, 'utf16le');
  const head = Buffer.alloc(4);
  head.writeInt32LE(chars.length + 1, 0);
  return Buffer.concat([head, buf]);
}
const i32 = (v) => { const b = Buffer.alloc(4); b.writeInt32LE(v); return b; };
const f32 = (v) => { const b = Buffer.alloc(4); b.writeFloatLE(v); return b; };
const NONE = fstring('None');

function make({ propertyGuid = true } = {}) {
  function tag(name, type, value, extra = {}) {
    const p = [fstring(name), fstring(type)];
    p.push(i32(type === 'BoolProperty' ? 0 : value.length));
    p.push(i32(0));
    if (type === 'StructProperty') {
      p.push(fstring(extra.structName || 'Struct'));
      p.push(Buffer.alloc(16));
    }
    if (type === 'BoolProperty') p.push(Buffer.from([value ? 1 : 0]));
    if (propertyGuid) p.push(Buffer.from([0]));
    if (type !== 'BoolProperty') p.push(value);
    return Buffer.concat(p);
  }
  const struct = (props) => Buffer.concat([...props, NONE]);

  const bossNames = ['Boss_QianYing', 'Boss_TieShou', 'Boss_YeShifu'];
  const bossDeaths = [6, 19, 3];

  const mapParts = [fstring('NameProperty'), fstring('StructProperty'), i32(0), i32(bossNames.length)];
  bossNames.forEach((n, i) => {
    mapParts.push(fstring(n));
    mapParts.push(struct([
      tag('Deaths', 'IntProperty', i32(bossDeaths[i])),
      tag('Attempts', 'IntProperty', i32(bossDeaths[i] + 4)),
      tag('FightTimeSeconds', 'IntProperty', i32(600 * (i + 1)))
    ]));
  });

  const props = [
    tag('PlayTimeMinutes', 'IntProperty', i32(2310)),
    tag('Deaths', 'IntProperty', i32(88)),
    tag('Money', 'IntProperty', i32(1200)),
    tag('CurrentDay', 'IntProperty', i32(17)),
    tag('Difficulty', 'NameProperty', fstring('Normal')),
    tag('BossRecord', 'MapProperty', Buffer.concat(mapParts)),
    tag('ItemBag', 'MapProperty', Buffer.concat([
      fstring('NameProperty'), fstring('IntProperty'), i32(0), i32(2),
      fstring('Pill'), i32(9), fstring('Stone'), i32(4)
    ])),
    tag('WeaponList', 'ArrayProperty', Buffer.concat([
      fstring('NameProperty'), i32(2), fstring('Sword_A'), fstring('Blade_B')
    ]))
  ];

  const header = Buffer.concat([
    Buffer.from('GVAS', 'ascii'),
    Buffer.alloc(4).fill(0).map((_, i) => [2, 0, 0, 0][i]), // version 2
    i32(522),                                              // package file version
    i32(3),                                                // custom format
    i32(0)                                                 // no custom versions
  ]);

  return Buffer.concat([header, fstring('/Script/Test.TestSaveGame'), ...props, NONE, i32(0)]);
}

function compressUE(buf) {
  const blockSize = 0x20000;
  const chunks = [];
  let offset = 0;
  while (offset < buf.length) {
    const slice = buf.subarray(offset, offset + blockSize);
    const comp = zlib.deflateSync(slice);
    const cSize = comp.length < slice.length ? comp.length : slice.length;
    const useComp = comp.length < slice.length;
    const head = Buffer.alloc(8);
    head.writeUInt32LE(cSize, 0);
    head.writeUInt32LE(slice.length, 4);
    chunks.push(head, useComp ? comp : slice);
    offset += blockSize;
  }
  const body = Buffer.concat(chunks);
  const head = Buffer.alloc(16);
  head.writeUInt32LE(0x9e2a83c1, 0);
  head.writeUInt32LE(blockSize, 4);
  head.writeUInt32LE(body.length, 8);
  head.writeUInt32LE(buf.length, 12);
  return Buffer.concat([head, body]);
}

(async () => {
  const results = [];
  const base = make();
  const noGuid = make({ propertyGuid: false });
  const compressed = compressUE(base);
  const truncated = base.subarray(0, 900);

  async function run(label, bytes, expect) {
    try {
      const parsed = await parser.parseSave(new Uint8Array(bytes));
      const m = metrics.build(parsed, {});
      const ok = expect(m, parsed);
      results.push({ label, ok, playTime: m.view.playTimeSeconds, deaths: m.view.deathCount, bosses: m.view.bosses.length, warnings: parsed.warnings.length, compressed: parsed.compressed });
    } catch (e) {
      results.push({ label, ok: false, error: e.message });
    }
  }

  await run('标准字段', base, (m) => m.view.deathCount === 88 && Math.round(m.view.playTimeSeconds) === 138600);
  await run('无 PropertyGuid', noGuid, (m) => m.view.deathCount === 88);
  await run('压缩存档', compressed, (m, p) => p.compressed === true && m.view.deathCount === 88);
  await run('截断存档', truncated, (m, p) => p.warnings.length > 0);

  console.log(JSON.stringify(results, null, 2));

  const allOk = results.every((r) => r.ok) &&
    results.find((r) => r.label === '标准字段').bosses === 3;
  console.log(allOk ? '\n全部通过' : '\n存在失败项');
  process.exit(allOk ? 0 : 1);
})();
