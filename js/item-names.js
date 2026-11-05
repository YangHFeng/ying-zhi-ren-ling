/**
 * item-names.js — 存档内部 ID 的中文名
 *
 * 67 条（社区表 56 条 + 拼音补充 11 条）。
 * 主体整理自 phantombladezerosaves.com 的 Save ID 对照表（社区整理）。
 * 找不到的 ID 会退回词根翻译（见 pbz-view.js 的 ID_WORDS）。
 * 重新抓取：python tools/fetch-item-names.py
 */
(function (global) {
  'use strict';

  var NAMES = {
    "IronBlade": "玄铁刃",
    "SlitheringSword": "软蛇剑",
    "BlackWound": "黑伤",
    "Dragon吟Blade": "龙吟双刃",
    "BloodShadowSword": "血影长剑",
    "WhiteJadeSword": "白玉刺",
    "SeveringCleaver": "断魂重剑",
    "GhostWeepBlade": "鬼泣刀",
    "HuoLiuXing": "火流星",
    "BrutalAxe": "狂战巨斧",
    "ShachiHook": "杀气锁镰",
    "LionRoarCannon": "狮吼火铳",
    "PuppetStrings": "傀儡丝",
    "ThunderBow": "惊雷大弓",
    "AC_ResistRanged": "避箭护符",
    "AC_ResistFire": "避火坠",
    "AC_ShaChiMastery": "残火笼",
    "AC_PrayerBeads": "沉香念珠",
    "AC_MothersTalisman": "慈母护符",
    "AC_Livingwood": "活木符",
    "AC_FineThread": "金丝线",
    "Weapon_Material_01": "锻铁",
    "Weapon_Material_02": "精炼锻铁",
    "Weapon_Material_03": "玄铁锭",
    "Weapon_Material_04": "融魂玉",
    "Medi_Material_01": "泣溪草",
    "Medi_Material_02": "百年山参",
    "Ac_Material_01": "朱砂丝",
    "Memory_Flower_01": "记忆之花",
    "Skill_Point_Stone": "杀气石",
    "Hulu": "疗伤葫芦",
    "GuiShen": "鬼神酿",
    "RongQi": "融气丹",
    "NingFengDan": "宁风丹",
    "Medicine_Duration": "延效散",
    "Medicine_Recover": "回春丸",
    "Medicine_ResistanceElement": "五气辟邪丹",
    "Medicine_Interrupt": "破势饮",
    "Medicine_ShachiAttack": "杀气烈酒",
    "Medicine_AdditionalRecover": "长生露",
    "KuYe": "枯叶酒",
    "FeiJiu": "沸血酒",
    "Medicine_Ghost": "鬼步散",
    "Medicine_Element": "附魔刃油",
    "Medicine_UltimateCharge": "醒神丹",
    "JinJiHeJi": "金肌合剂",
    "Medicine_Attack": "狂攻散",
    "Hun_OutFit_Default": "默认黑衣",
    "Hun_OutFit_Climax": "黑伤战袍",
    "Hun_OutFit_MoTian": "狩猎者",
    "Hun_OutFit_YaYu": "同袍",
    "Hun_OutFit_FengXue": "风雪",
    "Hun_OutFit_ZhuiMing": "宿命",
    "Hun_OutFit_GuYou": "蜃楼华服",
    "Hun_OutFit_JiGuanMoQu": "机关魔躯",
    "Hun_OutFit_Climax_Hat": "泣雨斗笠",
    "GuiTouBlade": "鬼头刀",
    "Tang": "唐刀",
    "WoodenSwordHun": "木剑·魂",
    "Double": "双刀",
    "Long": "长刀",
    "ChiZheCanJian": "痴者残剑",
    "ZhanMaBlade": "斩马刀",
    "SnakeDual": "蛇形双刃",
    "RenOuQingTongJian": "人偶青铜剑",
    "TieGongZhuQuanTao": "铁工铸拳套",
    "MiaoShouFeiDao": "妙手飞刀",
  };

  global.PBZItemNames = NAMES;
})(typeof window !== 'undefined' ? window : globalThis);
