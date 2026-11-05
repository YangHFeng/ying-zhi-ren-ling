/**
 * pbz-view.js — 把解密后的存档 JSON 折算成页面用的战绩视图
 *
 * 影之刃零的存档槽是一份 UTF-8 JSON，字段命名是 PascalCase。
 * 这里只依赖实际观测到的字段，并对缺失字段保持宽容。
 */
(function (global) {
  'use strict';

  var DAY_LIMIT = 66;

  var DIFFICULTY = {
    0: '轻舟',
    1: '江湖',
    2: '修罗',
    3: '修罗'
  };

  function num(v) {
    return typeof v === 'number' && isFinite(v) ? v : null;
  }

  function obj(v) {
    return v && typeof v === 'object' && !Array.isArray(v) ? v : null;
  }

  function formatDuration(sec) {
    if (sec == null || !isFinite(sec)) return '—';
    sec = Math.max(0, Math.round(sec));
    var h = Math.floor(sec / 3600);
    var m = Math.floor((sec % 3600) / 60);
    if (h <= 0) return m + ' 分钟';
    return h + ' 小时 ' + m + ' 分';
  }

  function formatClock(ms) {
    if (ms == null || !isFinite(ms) || ms <= 0) return null;
    var total = Math.round(ms / 1000);
    var m = Math.floor(total / 60);
    var s = total % 60;
    return m + ':' + (s < 10 ? '0' : '') + s;
  }

  /* ---------- 内部 ID 美化 ---------- */

  var ITEM_PREFIX = {
    Page: '残页',
    Book: '书卷',
    Weapon: '武器材料',
    R: '材料',
    F: '素材',
    I: '道具',
    K: '信物',
    Item: '道具',
    Medi: '丹药',
    AC: '饰品',
    Ac: '饰品材料',
    T: '令牌',
    FA: '食材',
    Return: '回城道具'
  };

  function itemCategory(key) {
    var head = String(key).split('_')[0];
    return ITEM_PREFIX[head] || '其他';
  }

  function prettyId(id) {
    return String(id)
      .replace(/^BP_Monster_/, '')
      .replace(/_/g, ' ')
      .replace(/([a-z])([A-Z])/g, '$1 $2')
      .trim();
  }

  /* 内部 ID 的逐段词根，用于「Weapon_Material_07」这类没有社区译名的条目 */
  var ID_WORDS = {
    weapon: '武器', material: '材料', shaqi: '杀气', return: '回城', item: '道具',
    page: '残页', book: '书卷', medi: '丹药', ac: '饰品', t: '令牌',
    traversing: '穿越', piece: '碎片', weaponmaterial: '武器材料',
    ironore: '铁矿石', blacksteel: '黑钢', solvent: '溶剂', copper: '铜',
    herb: '草药', coal: '煤', gear: '齿轮', wood: '木材', jade: '玉石'
  };

  /**
   * 把存档内部 ID 变成可读中文。
   * 1) 社区对照表（js/item-names.js）精确命中
   * 2) 逐段词根翻译：Weapon_Material_07 → 武器材料 07
   * 3) 全失败则拆驼峰
   */
  function translateId(id) {
    var key = String(id);
    var table = global.PBZItemNames;
    if (table && table[key]) return table[key];

    var parts = key.split('_').filter(Boolean);
    var last = parts[parts.length - 1] || '';
    var hasNum = /^\d+$/.test(last);

    // 分类前缀：R_01001 → 材料 01001，Weapon_Material_07 → 武器材料 07
    var lead = ITEM_PREFIX[parts[0]];
    if (lead && parts.length > 1) {
      // 中间段先翻词根；与分类前缀语义重复的部分（Weapon_Material 里的 Material）直接略掉
      var mid = parts.slice(1, hasNum ? -1 : undefined).map(function (p) {
        var w = ID_WORDS[p.toLowerCase()];
        if (w && lead.indexOf(w) >= 0) return '';
        return w || p;
      }).filter(Boolean);

      if (hasNum) {
        return lead + (mid.length ? ' · ' + mid.join(' ') : '') + ' ' + last;
      }
      return lead + (mid.length ? ' · ' + mid.join(' ') : '');
    }

    var words = hasNum ? parts.slice(0, -1) : parts;

    var cn = words.map(function (p) {
      return ID_WORDS[p.toLowerCase()] || null;
    });
    var translated = cn.filter(Boolean);

    if (translated.length) {
      var head = translated.join('');
      // 含英文残段时补在后面，保持信息完整
      var rest = words.filter(function (p, i) { return !cn[i]; });
      var tail = rest.length ? ' · ' + rest.join(' ') : '';
      return head + tail + (hasNum ? ' ' + last : '');
    }

    return prettyId(key);
  }

  /* ---------- Boss ---------- */

  /**
   * 从图鉴里找对应条目。
   * 存档键形如 BP_Monster_YuCong_P1，图鉴索引以小写保存，
   * 所以先精确（忽略大小写），再去掉 BP_Monster_ 前缀，最后做前缀匹配
   * 以处理 _P2 / _FirstTime 这类阶段后缀。
   */
  function lookupBoss(atlas, key) {
    if (!atlas || !atlas.list) return null;

    var lower = String(key).toLowerCase();
    if (atlas.byId && atlas.byId[lower]) return atlas.byId[lower];

    var base = lower.replace(/^bp_monster_/, '');
    if (atlas.byBase && atlas.byBase[base]) return atlas.byBase[base];

    // 最长前缀匹配
    var best = null;
    var bestLen = 0;
    for (var i = 0; i < atlas.list.length; i++) {
      var id = String(atlas.list[i].id).toLowerCase();
      if (lower.indexOf(id) === 0 && id.length > bestLen) {
        best = atlas.list[i];
        bestLen = id.length;
      }
    }
    return best;
  }

  function collectBosses(record, atlas) {
    var list = [];
    if (!obj(record)) return list;

    for (var key in record) {
      if (!Object.prototype.hasOwnProperty.call(record, key)) continue;
      var entry = obj(record[key]);
      if (!entry) continue;
      var records = obj(entry.Records) || {};

      var attempts = 0;
      var kills = 0;
      var bestMs = null;
      var cycles = {};

      for (var rk in records) {
        if (!Object.prototype.hasOwnProperty.call(records, rk)) continue;
        var r = obj(records[rk]);
        if (!r) continue;
        var a = num(r.AttemptCount) || 0;
        var k = num(r.KillCount) || 0;
        attempts += a;
        kills += k;
        if (num(r.BestTimeMs) && (bestMs == null || r.BestTimeMs < bestMs)) bestMs = r.BestTimeMs;
        var cycle = String(rk).split('_')[0];
        cycles[cycle] = true;
      }

      if (!attempts) continue;

      var meta = lookupBoss(atlas, key);
      var deaths = Math.max(0, attempts - kills);

      list.push({
        key: key,
        rawName: key,
        name: meta ? meta.name : prettyId(key),
        display: meta ? meta.name : prettyId(key),
        region: meta ? meta.region : '',
        img: meta ? meta.img : null,
        matched: !!meta,
        attempts: attempts,
        kills: kills,
        deaths: deaths,
        bestMs: bestMs,
        bestTime: formatClock(bestMs),
        defeated: attempts > 0 ? kills > 0 : null,
        cycles: Object.keys(cycles)
      });
    }

    list.sort(function (a, b) {
      if (b.deaths !== a.deaths) return b.deaths - a.deaths;
      if (b.attempts !== a.attempts) return b.attempts - a.attempts;
      return a.name.localeCompare(b.name, 'zh-Hans-CN');
    });
    return list;
  }

  /* ---------- 物品 / 武器 ---------- */

  function collectItems(inv) {
    var infos = obj(inv && inv.InventoryInfos) || {};
    var buckets = {};
    var items = [];
    var total = 0;

    for (var key in infos) {
      if (!Object.prototype.hasOwnProperty.call(infos, key)) continue;
      var e = obj(infos[key]);
      if (!e) continue;
      var count = num(e.CurrentAmount);
      if (count == null) count = 1;
      var cat = itemCategory(key);
      buckets[cat] = (buckets[cat] || 0) + 1;
      total += count;
      items.push({ name: translateId(key), raw: key, count: count, category: cat, named: !!(global.PBZItemNames && global.PBZItemNames[key]) });
    }

    items.sort(function (a, b) {
      if (a.named !== b.named) return a.named ? -1 : 1;
      if (b.count !== a.count) return b.count - a.count;
      return a.name.localeCompare(b.name, 'zh-Hans-CN');
    });

    return {
      count: items.length,
      total: total,
      buckets: buckets,
      items: items.slice(0, 60)
    };
  }

  function collectWeapons(inv) {
    var infos = obj(inv && inv.MainWeaponInfos) || {};
    var list = [];
    var maxLevel = 0;

    for (var key in infos) {
      if (!Object.prototype.hasOwnProperty.call(infos, key)) continue;
      var e = obj(infos[key]);
      var lvl = e ? num(e.WeaponLevel) : null;
      // 存档等级比界面上的 +n 多 1
      var plus = lvl && lvl > 1 ? lvl - 1 : 0;
      if (plus > maxLevel) maxLevel = plus;
      list.push({ name: translateId(key), raw: key, level: lvl, plus: plus });
    }

    list.sort(function (a, b) { return b.plus - a.plus; });

    var shaqi = Array.isArray(inv && inv.ShaqiWeapons) ? inv.ShaqiWeapons : [];

    return {
      count: list.length,
      maxPlus: maxLevel,
      items: list,
      edges: { count: shaqi.length, items: shaqi.map(function (s) { return { name: translateId(s), raw: s }; }) }
    };
  }

  /* ---------- 图鉴 ---------- */

  function collectCodex(codex, atlas) {
    var rows = [];

    function push(label, value, total) {
      if (value == null) return;
      rows.push({ label: label, value: value, total: total || null });
    }

    if (obj(codex)) {
      var enemies = Array.isArray(codex.DiscoveredEnemies) ? codex.DiscoveredEnemies : [];
      if (enemies.length) push('敌人', enemies.length, null);

      var keys = ['DiscoveredItems', 'DiscoveredWeapons', 'DiscoveredAccessory', 'DiscoveredMedicine', 'DiscoveredLore'];
      var labels = ['物品', '武器', '饰品', '丹药', '见闻'];
      keys.forEach(function (k, i) {
        if (Array.isArray(codex[k]) && codex[k].length) push(labels[i], codex[k].length, null);
      });
    }

    return rows;
  }

  /* 关卡代号 → 中文区域名 */
  var LEVEL_CN = {
    xigu: '西谷',
    fujizhilin: '伏击之林',
    zhengdaodaying: '正道大营',
    pangzhen: '庞镇',
    lujiacun: '陆家村',
    xuesesenslin: '血色森林',
    xuesesenlin: '血色森林',
    meiguhu: '梅谷湖',
    jialongshan: '枷笼山',
    duanhunshan: '断魂山',
    heishidong: '黑石洞'
  };

  function levelName(raw) {
    if (!raw) return null;
    var key = String(raw).replace(/^PBZ_/i, '').replace(/_WP.*$/i, '').toLowerCase();
    return LEVEL_CN[key] || prettyId(String(raw).replace(/^PBZ_/i, '').replace(/_WP$/i, ''));
  }

  /* ---------- 评语 ---------- */

  function makeVerdict(view) {
    var lines = [];
    var rank = '';

    var deaths = view.deathCount;
    if (deaths != null) {
      if (deaths === 0) { rank = '无伤通关'; lines.push('一次没死，江湖上没几个人做得到。'); }
      else if (deaths < 10) { rank = '身法如风'; lines.push('只死了 ' + deaths + ' 次，招式已经刻进骨子里。'); }
      else if (deaths < 40) { rank = '砥砺前行'; lines.push('死在刀下 ' + deaths + ' 次，每一道疤都换回一招。'); }
      else if (deaths < 100) { rank = '以命换刀'; lines.push('倒下 ' + deaths + ' 次，你比谁都清楚这游戏的重量。'); }
      else { rank = '百死不悔'; lines.push('死亡 ' + deaths + ' 次，这已经不是难度，是执念。'); }
    }

    var top = view.worstBoss;
    if (top && top.deaths > 0) {
      lines.push('「' + top.name + '」在你手里拿下 ' + top.deaths + ' 条命。');
    }

    if (view.bossTotal > 0) {
      lines.push('已击破 ' + view.bossDefeated + ' / ' + view.bossTotal + ' 名首领。');
    }

    if (!lines.length) lines.push('存档解析完成。');

    return { rank: rank, lines: lines };
  }

  /* ---------- 主函数 ---------- */

  function build(save, options) {
    var opts = options || {};
    var atlas = opts.atlas || (global.PBZBossAtlas || null);
    var json = save.json || save;

    var sys = obj(json.PBZGameSystem) || {};
    var player = obj(json.Player) || {};
    var meta = obj(json.PBZDeathMeta) || {};
    var inv = obj(json.Inventory) || {};
    var adv = obj(opts.advanced) || {};

    var playTimeSeconds = num(sys.CurrentCycleGameTime);
    if (playTimeSeconds == null) playTimeSeconds = num(sys.HasGameTime);

    var bosses = collectBosses(json.BossRecord, atlas);
    var defeated = bosses.filter(function (b) { return b.defeated === true; }).length;

    var remaining = num(player.RemainingDays);
    var day = remaining == null ? null : Math.max(0, DAY_LIMIT - remaining);

    var items = collectItems(inv);
    var weapons = collectWeapons(inv);
    var codex = collectCodex(adv.Codex, atlas);

    var achievements = opts.achievements && Array.isArray(opts.achievements.UnlockedIds)
      ? opts.achievements.UnlockedIds.length
      : null;

    var stats = codex.slice();
    if (achievements != null) stats.push({ label: '成就', value: achievements, total: null });
    if (items.count) stats.push({ label: '物品种类', value: items.count, total: null });
    if (weapons.count) stats.push({ label: '主武器', value: weapons.count, total: null });
    if (weapons.edges.count) stats.push({ label: '副武器', value: weapons.edges.count, total: null });

    var view = {
      playTimeSeconds: playTimeSeconds,
      playTimeText: formatDuration(playTimeSeconds),
      deathCount: num(meta.DiedTimes),
      currency: num(player.Dust),
      day: day,
      dayLimit: DAY_LIMIT,
      remainingDays: remaining,
      completion: bosses.length ? (defeated / bosses.length) * 100 : null,
      difficulty: num(sys.DifficultModeByte) != null ? (DIFFICULTY[sys.DifficultModeByte] || String(sys.DifficultModeByte)) : null,
      difficultyByte: num(sys.DifficultModeByte),
      playerName: '魂',
      region: sys.CurrentLevelName || null,
      newGamePlus: num(sys.CycleCount) != null ? sys.CycleCount > 0 : null,
      cycleCount: num(sys.CycleCount),
      sixtySixMode: null,
      finished: sys.bIsFinishGame === true,
      bosses: bosses,
      bossDefeated: defeated,
      bossTotal: bosses.length,
      worstBoss: bosses.length && bosses[0].deaths > 0 ? bosses[0] : null,
      items: items,
      weapons: weapons,
      edges: weapons.edges,
      collectibles: stats,
      achievements: achievements,
      savedAt: sys.DateTimeString || null,
      levelName: levelName(sys.CurrentLevelName)
    };

    view.verdict = makeVerdict(view);

    return {
      kind: 'pbzs',
      meta: {
        container: 'PBZS v3',
        slot: save.slotName || null,
        size: save.size || null,
        slotCount: save.slotCount || null
      },
      view: view
    };
  }

  var api = {
    build: build,
    DAY_LIMIT: DAY_LIMIT,
    formatDuration: formatDuration,
    prettyId: prettyId,
    levelName: levelName,
    translateId: translateId,
    itemCategory: itemCategory
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  } else {
    global.PBZ = global.PBZ || {};
    global.PBZ.View = api;
  }
})(typeof window !== 'undefined' ? window : globalThis);
