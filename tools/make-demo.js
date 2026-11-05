/**
 * tools/make-demo.js — 生成演示用的 PBZS v3 存档
 *
 * 结构与真实存档一致（12 字节头 + 目录块 + 每槽一个封存块），
 * 槽内容用 zlib 压缩（algorithm = 1）。游戏加载器原生接受 zlib，
 * 本项目的解析器也支持，所以不需要 Oodle 编码器。
 *
 * 用法：node tools/make-demo.js
 * 输出：samples/demo-pbzs.sav
 */
'use strict';

const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const crypto = require('crypto');

const KEY = Buffer.from('15a1fe0f55e0eb298e7c9461548351696a2a0700ed2d17ba1f871457e8f93e2d', 'hex');

/* ---------------- 造数据 ---------------- */

function boss(name, attempts, kills, bestMs) {
  const rec = { AttemptCount: attempts };
  if (kills) rec.KillCount = kills;
  if (bestMs) rec.BestTimeMs = bestMs;
  return { ClassPath: '/PBZCombatAsset/ActorData/Mobs/' + name + '/BP_Monster_' + name + '.BP_Monster_' + name + '_C', Records: { '0_3': rec } };
}

const BOSSES = {
  BP_Monster_ZuoShang: boss('ZuoShang', 1, 1, 276000),
  BP_Monster_HookMan_HorseCartCombat: boss('HookMan_HorseCartCombat', 1, 1, 63000),
  BP_Monster_MobMan_Elite_Sword: boss('MobMan_Elite_Sword', 9, 1, 118000),
  BP_Monster_PengMeng_Axe: boss('PengMeng_Axe', 4, 1, 172000),
  BP_Monster_AHua_GuiTouDao: boss('AHua_GuiTouDao', 21, 1, 176000),
  BP_Monster_HookMan: boss('HookMan', 6, 1, 117000),
  BP_Monster_HookMan_P2: boss('HookMan_P2', 12, 1, 173000),
  BP_Monster_HuaQianXIao: boss('HuaQianXIao', 8, 1, 216000),
  BP_Monster_JingYe: boss('JingYe', 5, 1, 243000),
  BP_Monster_LuanShi: boss('LuanShi', 4, 1, 140000),
  BP_Monster_ChiLian: boss('ChiLian', 15, 1, 200000),
  BP_Monster_ChiLian_P2: boss('ChiLian_P2', 6, 1, 180000),
  BP_Monster_Zhuobi: boss('Zhuobi', 7, 1, 153000),
  BP_Monster_BiYuan: boss('BiYuan', 2, 1, 110000),
  BP_Monster_CanQu_BiHai: boss('CanQu_BiHai', 5, 1, 203000)
};

const ITEMS = {};
[
  ['R_IronOre', 24], ['R_BlackSteel', 11], ['R_Solvent', 6], ['R_CopperIngot', 9],
  ['Weapon_Material_Blade', 3], ['Weapon_Material_Hilt', 2], ['Item_Herb', 17],
  ['Medi_NingFengDan', 4], ['K_OldToken', 2], ['Page_XC_01', 1], ['Page_CS_01', 1],
  ['Book_Lore_01', 1], ['F_Coal', 13], ['F_Gear', 8], ['T_BellPass', 1]
].forEach(([id, n]) => {
  ITEMS[id] = { CurrentAmount: n, MaxAmount: n * 2, FirstAddTime: '2026.10.30-23.05.38', AcquiredCycle: 0 };
});

const WEAPONS = {};
[
  ['Tang', 2], ['WoodenSwordHun', 1], ['Double', 4], ['IronBlade', 8],
  ['GuiTouBlade', 5], ['SnowBlade', 3]
].forEach(([id, lvl]) => {
  WEAPONS[id] = { DateTime: '2026.10.30-23.32.01', WeaponLevel: lvl, AlreadySnapSoul: 0, AcquiredCycle: 0 };
});

function gameSlot(opts) {
  const o = Object.assign({
    time: 41000,
    deaths: 92,
    dust: 41200,
    days: 57,
    date: '2026.11.04-22.10.00',
    cycle: 0,
    level: 'PBZ_Xigu_WP'
  }, opts);

  return {
    PBZGameSystem: {
      DifficultModeByte: 3,
      NightmareSlotIndex: -1,
      PackageVersion: '1.0.3',
      HasGameTime: o.time,
      CurrentCycleGameTime: o.time,
      CycleCount: o.cycle,
      CurrentLevelName: o.level,
      DateTimeString: o.date,
      bIsFinishGame: false,
      NarrativePercentage: 0,
      bCanSelectNightMare: true,
      CycleRecords: {}
    },
    BellManager: {
      ActivateBellIDs: ['Bell_XGC_01_01', 'Bell_SXC_02_01'],
      SaveBellID: 'Bell_SXC_02_01',
      TeleportSaveBellID: 'Bell_SXC_02_01'
    },
    MapSubsystem: { AlreadyOpenMapUI: ['PBZ_Xigu_WP'], UnLockMaskInfos: [], EndedLockObjGuids: [] },
    PBZDeathMeta: { _v: 1, DiedTimes: o.deaths },
    BossRecord: JSON.parse(JSON.stringify(BOSSES)),
    Player: {
      RemainingDays: o.days,
      Dust: o.dust,
      UltimateCharge: 3,
      UltimateChargeCount: 1,
      SpiritShadow: 4,
      IsCompleteRespawnSequence: true
    },
    Inventory: {
      InventoryInfos: JSON.parse(JSON.stringify(ITEMS)),
      MainWeapons: ['GuiTouBlade', 'IronBlade'],
      MainWeaponInfos: JSON.parse(JSON.stringify(WEAPONS)),
      ShaqiWeapons: ['TieGongZhuQuanTao', 'MiaoShouFeiDao'],
      AccessoryIDs: ['AC_Loot', 'AC_ActHit', 'AC_Attack'],
      AccessoryInfos: {
        AC_Loot: { CurrentLevel: 1, AcquiredCycle: 0 },
        AC_ActHit: { CurrentLevel: 0, AcquiredCycle: 0 },
        AC_Attack: { CurrentLevel: 2, AcquiredCycle: 0 }
      },
      MedicineInfos: { Hulu: { CurrentLevel: 1, MaxTime: 3, AcquiredCycle: 0 } },
      AllCodexID: []
    },
    Narrative: {
      CurrentMainQuestPath: '/Game/PBZstory/PBZQuest/Main/Main_Xigu_03.Main_Xigu_03_C',
      QuestGameTimes: [{ QuestClass: '/Game/PBZstory/Tutorial_ZLGW_Attack.Tutorial_ZLGW_Attack_C', GameTime: 892 }],
      NarrativeSavedQuests: {}
    },
    BellSaveID: 'Bell_SXC_02_01'
  };
}

/* ---------------- 容器封装 ---------------- */

function sealBlock(plaintext) {
  const nonce = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', KEY, nonce);
  const ct = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([Buffer.from('PBZS', 'latin1'), Buffer.from([1, 1, 0, 0]), nonce, tag, ct]);
}

function packSlots(slots) {
  // slots: [{ name, json }]
  const sealed = slots.map(s => {
    const raw = Buffer.from(JSON.stringify(s.json), 'utf8');
    const packed = zlib.deflateSync(raw, { level: 9 });
    return { name: s.name, rawSize: raw.length, algorithm: 1, flag: 1, block: sealBlock(packed) };
  });

  let offset = 0;
  const headerEcho = Buffer.alloc(12);
  headerEcho.write('PBZS', 0, 4, 'latin1');
  headerEcho.writeUInt8(3, 4);
  headerEcho.writeUInt8(1, 5);
  headerEcho.writeUInt16LE(slots.length, 6);
  headerEcho.writeUInt32LE(0, 8);

  const records = [headerEcho];
  sealed.forEach(s => {
    const nameBuf = Buffer.from(s.name, 'utf8');
    const head = Buffer.alloc(2);
    head.writeUInt16LE(nameBuf.length, 0);
    const tail = Buffer.alloc(14);
    tail.writeUInt8(s.algorithm, 0);
    tail.writeUInt8(s.flag, 1);
    tail.writeUInt32LE(s.rawSize, 2);
    tail.writeUInt32LE(offset, 6);
    tail.writeUInt32LE(s.block.length, 10);
    records.push(head, nameBuf, tail);
    offset += s.block.length;
  });

  const dirPlain = Buffer.concat(records);
  const dirBlock = sealBlock(dirPlain);

  const fileHeader = Buffer.alloc(12);
  fileHeader.write('PBZS', 0, 4, 'latin1');
  fileHeader.writeUInt8(3, 4);
  fileHeader.writeUInt8(1, 5);
  fileHeader.writeUInt16LE(slots.length, 6);
  fileHeader.writeUInt32LE(dirBlock.length, 8);

  return Buffer.concat([fileHeader, dirBlock].concat(sealed.map(s => s.block)));
}

/* ---------------- 组装 ---------------- */

const slots = [
  { name: '__Advanced__', json: {
    FirstClearRecordSchema: 1,
    EntitlementRecordScope: 'Steam/76561190000000000',
    ConfirmedOwnedEntitlements: ['PreorderBonus'],
    ConfirmedNotOwnedEntitlements: [],
    Codex: {
      DiscoveredEnemies: Object.keys(BOSSES).concat(['BP_Monster_MobMan_Grunt', 'BP_Monster_MobMan_Archer', 'BP_Monster_MobMan_Shield']),
      DiscoveredItems: Object.keys(ITEMS)
    },
    LastContinueSlot: 'ManualSave1'
  } },
  { name: '__Achievements__', json: { UnlockedIds: ['ACH_001', 'ACH_004', 'ACH_009', 'ACH_014', 'ACH_051'] } },
  { name: 'AutoSave0', json: gameSlot({ time: 41022, deaths: 92, dust: 41200, days: 57, date: '2026.11.04-21.44.10' }) },
  { name: 'AutoSave1', json: gameSlot({ time: 41480, deaths: 94, dust: 42100, days: 57, date: '2026.11.04-22.31.52' }) },
  { name: 'ManualSave1', json: gameSlot({ time: 41860, deaths: 96, dust: 43800, days: 56, date: '2026.11.05-00.12.30' }) },
  { name: 'ManualSave2', json: gameSlot({ time: 33440, deaths: 121, dust: 9800, days: 59, date: '2026.11.03-23.11.21' }) },
  { name: 'ManualSave3', json: gameSlot({ time: 24510, deaths: 148, dust: 3100, days: 60, date: '2026.11.02-20.05.44' }) }
];

const out = packSlots(slots);
const dest = path.join(__dirname, '..', 'samples', 'demo-pbzs.sav');
fs.mkdirSync(path.dirname(dest), { recursive: true });
fs.writeFileSync(dest, out);

console.log('已生成', dest);
console.log('  ' + out.length + ' 字节 · ' + slots.length + ' 个槽位');
console.log('  SHA-256 ' + crypto.createHash('sha256').update(out).digest('hex').slice(0, 32) + '…');
