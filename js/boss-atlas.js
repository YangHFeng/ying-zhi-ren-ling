/**
 * boss-atlas.js — 影之刃零 BOSS 图鉴
 *
 * 75 个首领条目：立绘、所属区域、游戏内部蓝图名。
 * 立绘与命名整理自游民星空《影之刃零》图鉴，版权归 S-GAME 所有。
 * 由 tools/fetch-boss-atlas.py 生成，请勿手改。
 *
 * 内部蓝图名（BP_Monster_xxx）是匹配存档字段的主键；
 * 匹配不上时依次退回「去前缀名」「中文名片段」。
 */
(function (global) {
  'use strict';

  var ATLAS = [
    { id: "BP_Monster_ZuoShang_Young_Tutorial", name: "少年左殇", region: "序章", img: "assets/bosses/80010.png" },
    { id: "BP_Monster_ZuoShang", name: "“组织”冥主：左殇", region: "序章", img: "assets/bosses/80020.png" },
    { id: "BP_Monster_HookMan_HorseCartCombat", name: "“组织”猎杀者：追命", region: "序章", img: "assets/bosses/80050.png" },
    { id: "BP_Monster_MobMan_Elite_Sword", name: "痴狂暴徒：残钢", region: "悲泣溪谷", img: "assets/bosses/80160.png" },
    { id: "BP_Monster_PengMeng_Axe", name: "斧老大：彭猛", region: "悲泣溪谷", img: "assets/bosses/80170.png" },
    { id: "BP_Monster_YuCong_FirstTime", name: "三张脸的诡异魔偶", region: "悲泣溪谷", img: "assets/bosses/80180.png" },
    { id: "BP_Monster_YouLong_SecondBrother", name: "水行帮主：游龙", region: "庞镇", img: "assets/bosses/81770.png" },
    { id: "BP_Monster_HookMan_P2", name: "追命：六绝凶镰", region: "悲泣溪谷", img: "assets/bosses/80260.png" },
    { id: "BP_Monster_AHua_GuiTouDao", name: "新娘阿花", region: "悲泣溪谷", img: "assets/bosses/80270.png" },
    { id: "BP_Monster_Scavenger", name: "活人偶清道夫", region: "悲泣溪谷", img: "assets/bosses/80280.png" },
    { id: "BP_Monster_QiShu_Bing", name: "灭法之法：寒岁", region: "悲泣溪谷", img: "assets/bosses/80290.png" },
    { id: "BP_Monster_MoTian_LongZhu_01", name: "金面具黑衣人", region: "悲泣溪谷", img: "assets/bosses/80300.png" },
    { id: "BP_Monster_MoTian", name: "暗魔天堡之主：魔渊", region: "戏梦山庄", img: "assets/bosses/80310.png" },
    { id: "BP_Monster_HuaQianXIao", name: "剑痴：花千笑", region: "血色森林", img: "assets/bosses/80490.png" },
    { id: "BP_Monster_LuanShi", name: "拳痴：铁狂", region: "血色森林", img: "assets/bosses/80500.png" },
    { id: "BP_Monster_JingYe", name: "亡命徒：荆野", region: "血色森林", img: "assets/bosses/80510.png" },
    { id: "BP_Monster_ChiLian", name: "双蛇夫人：白赤练", region: "血色森林", img: "assets/bosses/80520.png" },
    { id: "BP_Monster_ChiLian_P2", name: "白赤练：献祭之蛇", region: "血色森林", img: "assets/bosses/80530.png" },
    { id: "BP_Monster_Zhuobi", name: "守门人拙壁", region: "陆家村", img: "assets/bosses/80660.png" },
    { id: "BP_Monster_CanQu_BiHai", name: "苦叶寺：碧海大师残躯", region: "陆家村", img: "assets/bosses/80670.png" },
    { id: "BP_Monster_BiYuan", name: "天玄派：毕远掌门残躯", region: "陆家村", img: "assets/bosses/80680.png" },
    { id: "BP_Monster_FemaleVessel_YuZan", name: "三号·乐师偶：“玉瓒”", region: "陆家村", img: "assets/bosses/80690.png" },
    { id: "BP_Monster_QiShu_Huo", name: "灭法之法：炎茹", region: "陆家村", img: "assets/bosses/80700.png" },
    { id: "BP_Monster_Danghui", name: "操偶师：荡秽", region: "陆家村", img: "assets/bosses/80710.png" },
    { id: "BP_Monster_MuXiaoKui", name: "“组织”少主：沐小葵", region: "陆家村", img: "assets/bosses/80720.png" },
    { id: "BP_Monster_MuXiaoKui_P2", name: "沐小葵：铁玉女王", region: "陆家村", img: "assets/bosses/80730.png" },
    { id: "BP_Monster_Yuu", name: "少主护卫：玉妖", region: "陆家村", img: "assets/bosses/80740.png" },
    { id: "BP_Monster_TieGui", name: "少主护卫：铁鬼", region: "陆家村", img: "assets/bosses/80750.png" },
    { id: "BP_Monster_GuiChai_Red", name: "鬼差队长：火流星", region: "庞镇", img: "assets/bosses/80900.png" },
    { id: "BP_Monster_GuiChai_Red_P2", name: "火流星：磷火意识", region: "庞镇", img: "assets/bosses/80910.png" },
    { id: "BP_Monster_GuiChai_Yellow_MoDao", name: "鬼差高手：斩骑", region: "庞镇", img: "assets/bosses/80920.png" },
    { id: "BP_Monster_GuiChai_Yellow_ShuangGou", name: "鬼差高手：勾魂", region: "庞镇", img: "assets/bosses/80930.png" },
    { id: "BP_Monster_HuoDaoDuiZhang", name: "火刀：祝原", region: "庞镇", img: "assets/bosses/80940.png" },
    { id: "BP_Monster_WuXuan", name: "堕落将军：武轩", region: "庞镇", img: "assets/bosses/81030.png" },
    { id: "BP_Monster_GuWanYue", name: "女妖骨婉约", region: "庞镇", img: "assets/bosses/81040.png" },
    { id: "BP_Monster_Maddoctor_Elite", name: "神医：谢秋冬", region: "庞镇", img: "assets/bosses/81050.png" },
    { id: "BP_Monster_QiShu_Lei", name: "灭法之法：雷婷", region: "庞镇", img: "assets/bosses/81060.png" },
    { id: "BP_Monster_ChangHong_Spear", name: "“雷枪”：长鸿", region: "庞镇", img: "assets/bosses/81070.png" },
    { id: "BP_Monster_ChangHong_P2", name: "长鸿：雷电枪骑", region: "庞镇", img: "assets/bosses/81080.png" },
    { id: "BP_Monster_LionDancer", name: "被面具控制的舞狮尊主：烈焰", region: "庞镇", img: "assets/bosses/81090.png" },
    { id: "BP_Monster_LionDancer_P2", name: "舞狮尊主的最后一舞", region: "庞镇", img: "assets/bosses/81100.png" },
    { id: "BP_Monster_XiaoXue", name: "吞噬尸体的小雪", region: "正道大营", img: "assets/bosses/81130.png" },
    { id: "BP_Monster_WanJun_JinGua", name: "巨锤客：万钧", region: "正道大营", img: "assets/bosses/81140.png" },
    { id: "BP_Monster_EMei_Sword_Top", name: "红衣女剑客", region: "正道大营", img: "assets/bosses/81150.png" },
    { id: "BP_Monster_HuaShan_Blue", name: "七星剑阵：大师兄", region: "正道大营", img: "assets/bosses/81160.png" },
    { id: "BP_Monster_HuaShan_JianOu", name: "大师兄的绝望剑意", region: "正道大营", img: "assets/bosses/81170.png" },
    { id: "BP_Monster_WuLengShuang", name: "软剑：乌冷霜", region: "正道大营", img: "assets/bosses/81180.png" },
    { id: "BP_Monster_YuBi", name: "廿一号·剑偶：“玉璧”", region: "正道大营", img: "assets/bosses/81190.png" },
    { id: "BP_Monster_MobMan_Elite", name: "癫狂暴徒：铁杀", region: "枷笼山", img: "assets/bosses/81230.png" },
    { id: "BP_Monster_GreatBladeMan", name: "横刀：毕峰", region: "枷笼山", img: "assets/bosses/81240.png" },
    { id: "BP_Monster_YanYan_Club", name: "疯婆子奎艳艳", region: "枷笼山", img: "assets/bosses/81250.png" },
    { id: "BP_Monster_JadeMaskMan", name: "玉面郎君", region: "枷笼山", img: "assets/bosses/81260.png" },
    { id: "BP_Monster_MBoss", name: "昆仑叛教者：荒行子", region: "枷笼山", img: "assets/bosses/81270.png" },
    { id: "BP_Monster_MBossVariants", name: "荒行子：撕裂锯轮", region: "枷笼山", img: "assets/bosses/81280.png" },
    { id: "BP_Monster_GuiChai_Cyan_ShuangYue", name: "鬼差高手：断肠", region: "梅谷湖", img: "assets/bosses/81380.png" },
    { id: "BP_Monster_QiShu_Du", name: "灭法之法：蛊鹤", region: "梅谷湖", img: "assets/bosses/81390.png" },
    { id: "BP_Monster_HuaShan_RedTroop_BigBro", name: "悲痛欲绝的阿瑾", region: "梅谷湖", img: "assets/bosses/81400.png" },
    { id: "BP_Monster_DuYanBoss", name: "独眼弓客", region: "梅谷湖", img: "assets/bosses/81410.png" },
    { id: "BP_Monster_YouLong_Harpoon", name: "发狂的水行帮主：游龙", region: "梅谷湖", img: "assets/bosses/81420.png" },
    { id: "BP_Monster_YanQianSui", name: "琴女烟千岁", region: "梅谷湖", img: "assets/bosses/81430.png" },
    { id: "BP_Monster_YingMei_RedShadowBoneBlade", name: "赤影骨刃：囚锋", region: "戏梦山庄", img: "assets/bosses/81520.png" },
    { id: "BP_Monster_FemaleVessel_YuDing", name: "十二号·偃月刀偶：“玉鼎”", region: "戏梦山庄", img: "assets/bosses/81530.png" },
    { id: "BP_Monster_LeiDang", name: "“虎炮”：雷当", region: "戏梦山庄", img: "assets/bosses/81540.png" },
    { id: "BP_Monster_LeiDang_P2", name: "雷当：独臂虎", region: "戏梦山庄", img: "assets/bosses/81550.png" },
    { id: "BP_Monster_FengXueDaoKe", name: "风雪刀客", region: "梅谷湖", img: "assets/bosses/81600.png" },
    { id: "BP_Monster_YuCong_P1", name: "卅四号·混沌魔偶：“玉琮”", region: "血色森林", img: "assets/bosses/81670.png" },
    { id: "BP_Monster_YuCong_WuLi", name: "“玉琮”：钢刃", region: "血色森林", img: "assets/bosses/81680.png" },
    { id: "BP_Monster_YuCong_Bing", name: "“玉琮”：寒冰", region: "血色森林", img: "assets/bosses/81690.png" },
    { id: "BP_Monster_YuCong_HunDun", name: "“玉琮”：混沌", region: "血色森林", img: "assets/bosses/81700.png" },
    { id: "BP_Monster_PowerMan", name: "力者和锯者", region: "断魂山", img: "assets/bosses/81710.png" },
    { id: "BP_Monster_PowerMan_P2", name: "力者：石破天惊之态", region: "断魂山", img: "assets/bosses/81720.png" },
    { id: "BP_Monster_LengTu", name: "梦差：冷荼", region: "断魂山", img: "assets/bosses/81730.png" },
    { id: "BP_Monster_MengHua", name: "救苦救难梦华圣母娘娘", region: "断魂山", img: "assets/bosses/81740.png" },
    { id: "BP_Monster_ZuoShang_Ending", name: "“组织”冥主：左殇（银发）", region: "断魂山", img: "assets/bosses/81750.png" },
    { id: "BP_Monster_ZuoShang_P2", name: "左殇：真龙之躯", region: "断魂山", img: "assets/bosses/81760.png" },
  ];

  var byId = {};
  var byBase = {};
  for (var i = 0; i < ATLAS.length; i++) {
    var b = ATLAS[i];
    byId[String(b.id).toLowerCase()] = b;
    var base = String(b.id).replace(/^BP_Monster_/i, "").toLowerCase();
    if (!byBase[base]) byBase[base] = b;
  }

  global.PBZBossAtlas = { list: ATLAS, byId: byId, byBase: byBase, source: '游民星空《影之刃零》图鉴' };
})(window);
