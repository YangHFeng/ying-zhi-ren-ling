/**
 * tools/make-sample.js
 * 生成一个结构完整的 GVAS 示例存档，用于验证解析器 / 页面演示。
 * 运行：node tools/make-sample.js
 */
'use strict';

const fs = require('fs');
const path = require('path');

function u8(v) { return Buffer.from([v & 0xff]); }
function i8(v) { const b = Buffer.alloc(1); b.writeInt8(v); return b; }
function u16(v) { const b = Buffer.alloc(2); b.writeUInt16LE(v); return b; }
function i32(v) { const b = Buffer.alloc(4); b.writeInt32LE(v); return b; }
function u32(v) { const b = Buffer.alloc(4); b.writeUInt32LE(v >>> 0); return b; }
function i64(v) { const b = Buffer.alloc(8); b.writeBigInt64LE(BigInt(v)); return b; }
function f32(v) { const b = Buffer.alloc(4); b.writeFloatLE(v); return b; }
function f64(v) { const b = Buffer.alloc(8); b.writeDoubleLE(v); return b; }

function fstring(s) {
  if (!s) return i32(0);
  const chars = [...s];
  const buf = Buffer.alloc((chars.length + 1) * 2);
  buf.write(s, 0, 'utf16le');
  return Buffer.concat([i32(chars.length + 1), buf]);
}

function guidBytes(hex) {
  const clean = hex.replace(/-/g, '');
  const b = Buffer.alloc(16);
  for (let i = 0; i < 16; i++) b[i] = parseInt(clean.substr(i * 2, 2), 16);
  return b;
}

const OPTIONS = { propertyGuid: true };

function tag(name, type, value, extra) {
  const parts = [fstring(name), fstring(type)];
  parts.push(i32(type === 'BoolProperty' ? 0 : value.length));
  parts.push(i32(0));
  if (type === 'StructProperty') {
    parts.push(fstring(extra.structName));
    parts.push(guidBytes('00000000000000000000000000000000'));
  }
  if (type === 'BoolProperty') {
    parts.push(u8(value ? 1 : 0));
  }
  if (OPTIONS.propertyGuid) parts.push(u8(0));
  if (type !== 'BoolProperty') parts.push(value);
  return Buffer.concat(parts);
}

const NONE = fstring('None');

function structValue(props) {
  return Buffer.concat([...props, NONE]);
}

function pInt(name, v) { return tag(name, 'IntProperty', i32(v)); }
function pInt64(name, v) { return tag(name, 'Int64Property', i64(v)); }
function pFloat(name, v) { return tag(name, 'FloatProperty', f32(v)); }
function pBool(name, v) { return tag(name, 'BoolProperty', v); }
function pStr(name, v) { return tag(name, 'StrProperty', fstring(v)); }
function pName(name, v) { return tag(name, 'NameProperty', fstring(v)); }

function pStruct(name, structName, props) {
  const body = structValue(props);
  return tag(name, 'StructProperty', body, { structName });
}

function pArray(name, innerType, values) {
  const parts = [fstring(innerType), i32(values.length)];
  for (const v of values) {
    if (innerType === 'StructProperty') parts.push(structValue(v));
    else if (innerType === 'StrProperty' || innerType === 'NameProperty') parts.push(fstring(v));
    else if (innerType === 'IntProperty') parts.push(i32(v));
    else if (innerType === 'ByteProperty') parts.push(u8(v));
  }
  return tag(name, 'ArrayProperty', Buffer.concat(parts));
}

function pMap(name, keyType, valueType, entries) {
  const parts = [fstring(keyType), fstring(valueType), i32(0), i32(entries.length)];
  for (const [k, v] of entries) {
    parts.push(fstring(k));
    if (valueType === 'StructProperty') parts.push(structValue(v));
    else if (valueType === 'IntProperty') parts.push(i32(v));
    else if (valueType === 'FloatProperty') parts.push(f32(v));
    else if (valueType === 'StrProperty' || valueType === 'NameProperty') parts.push(fstring(v));
    else if (valueType === 'BoolProperty') parts.push(u8(v ? 1 : 0));
  }
  return tag(name, 'MapProperty', Buffer.concat(parts));
}

/* ---------------- 存档内容 ---------------- */
const bossEntries = [
  ['Boss_JaggedSteel', [
    pInt('DeathCount', 14), pInt('Attempts', 19), pInt64('TotalFightTimeSeconds', 4280), pBool('bDefeated', true)
  ]],
  ['Boss_FrenziedBrute', [
    pInt('DeathCount', 7), pInt('Attempts', 11), pInt64('TotalFightTimeSeconds', 2110), pBool('bDefeated', true)
  ]],
  ['Boss_BrideAhua', [
    pInt('DeathCount', 23), pInt('Attempts', 30), pInt64('TotalFightTimeSeconds', 7620), pBool('bDefeated', true)
  ]],
  ['Boss_AxemasterPengMeng', [
    pInt('DeathCount', 9), pInt('Attempts', 12), pInt64('TotalFightTimeSeconds', 3140), pBool('bDefeated', true)
  ]],
  ['Boss_ThreeFacePuppet', [
    pInt('DeathCount', 31), pInt('Attempts', 38), pInt64('TotalFightTimeSeconds', 9880), pBool('bDefeated', false)
  ]]
];

const props = [
  pStr('PlayerName', '影'),
  pInt('CurrentDay', 41),
  pInt('TotalDayLimit', 66),
  pInt64('TotalPlayTimeSeconds', 138420),
  pInt('TotalDeathCount', 168),
  pInt('Currency', 24860),
  pFloat('CompletionRate', 0.63),
  pName('Difficulty', 'Hard'),
  pName('CurrentRegion', 'Region_Suzhou'),
  pName('LastCheckpoint', 'CP_Chapter4_Bridge'),
  pBool('bIsSixtySixDayMode', false),
  pBool('bNewGamePlus', false),
  pStruct('Collectibles', 'CollectibleData', [
    pInt('Petals', 37),
    pInt('PetalsTotal', 60),
    pInt('Shards', 118),
    pInt('ShardsTotal', 200),
    pInt('Scrolls', 9),
    pInt('ScrollsTotal', 16)
  ]),
  pArray('UnlockedWeapons', 'NameProperty', [
    'Weapon_LongSword_01', 'Weapon_DualBlades_01', 'Weapon_Broadsword_01', 'Weapon_Spear_01', 'Weapon_Whip_01'
  ]),
  pArray('PhantomEdges', 'NameProperty', [
    'Edge_Axe', 'Edge_Cannon', 'Edge_DragonHead'
  ]),
  pArray('InventoryItems', 'StrProperty', [
    'Item_HealingPill', 'Item_SharpeningStone', 'Item_Antidote'
  ]),
  pMap('BossRecords', 'NameProperty', 'StructProperty', bossEntries),
  pMap('ItemCounts', 'NameProperty', 'IntProperty', [
    ['Item_HealingPill', 12], ['Item_SharpeningStone', 5], ['Item_Antidote', 3]
  ]),
  (function () {
    var ticks = (Date.UTC(2026, 10, 3, 13, 40) + 62135596800000) * 10000;
    return tag('LastSaveTime', 'StructProperty', i64(ticks), { structName: 'DateTime' });
  })()
];

/* Vector / DateTime 是原生结构，直接写二进制 body */
props.push(tag('LastLocation', 'StructProperty',
  Buffer.concat([f32(1024.5), f32(-320.25), f32(88)]),
  { structName: 'Vector' }));

/* ---------------- 头部 ---------------- */
const header = Buffer.concat([
  Buffer.from('GVAS', 'ascii'),
  u32(3),
  u16(5), u16(4), u16(0), u32(0), fstring(''),
  u32(0),
  u32(3),
  u32(1),
  guidBytes('0c8e0b7c2f9a4a3e9b1d6a5c8e7f0123'),
  i32(3),
  fstring('PBZCustomVersion')
]);

const className = fstring('/Script/ProjectPBZ.PBZSaveGame');
const body = Buffer.concat([...props, NONE, i32(0)]);
const file = Buffer.concat([header, className, body]);

const outDir = path.join(__dirname, '..', 'samples');
fs.mkdirSync(outDir, { recursive: true });
const outPath = path.join(outDir, 'PBZSaveGame.sav');
fs.writeFileSync(outPath, file);

const b64 = file.toString('base64');
fs.writeFileSync(
  path.join(__dirname, '..', 'js', 'sample-save.js'),
  '/**\n * sample-save.js — 内置示例存档（由 tools/make-sample.js 生成，非真实玩家数据）\n */\n(function (global) {\n  \'use strict\';\n  var B64 = \'' + b64 + '\';\n  function decode() {\n    var bin = atob(B64);\n    var out = new Uint8Array(bin.length);\n    for (var i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);\n    return out;\n  }\n  if (typeof module !== \'undefined\' && module.exports) {\n    module.exports = { decode: decode };\n  } else {\n    global.PBZ = global.PBZ || {};\n    global.PBZ.SampleSave = { decode: decode };\n  }\n})(typeof window !== \'undefined\' ? window : globalThis);\n'
);

console.log('生成完成：' + outPath + '（' + file.length + ' 字节）');
console.log('base64 长度：' + b64.length);
