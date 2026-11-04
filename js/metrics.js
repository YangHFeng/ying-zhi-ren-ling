/**
 * metrics.js — 从 GVAS 属性树中提取玩家战绩指标
 *
 * 策略分三层：
 *  1. 精确规则：常见命名（PlayTime / DeathCount / Currency …）直接命中；
 *  2. 结构启发：Boss 记录表、道具表、收集品按"形状"识别，不依赖字段名；
 *  3. 手动绑定：调用方可通过 overrides 把任意字段路径指定给某个指标。
 *
 * 之所以这样设计：不同版本 / 平台的字段命名会变，硬编码单一字段名极易失效。
 */
(function (global) {
  'use strict';

  var DURATION_HINTS_MS = /(ms|msec|millisecond)/i;
  var DURATION_HINTS_MIN = /(minute|minutes|_min$|^min$)/i;
  var DURATION_HINTS_HOUR = /(hour|hours|_hrs?$|_h$)/i;

  var RULES = {
    playTime: {
      label: '游玩时长',
      type: 'duration',
      include: [/^(total)?playtime/i, /^play_?time/i, /^totalgametime/i, /^gametime/i, /^timeplayed/i, /^playedtime/i, /^elapsedtime/i],
      exclude: [/boss/i, /fight/i, /battle/i, /combat/i, /session/i, /enemy/i, /level/i, /chapter/i, /last/i]
    },
    deathCount: {
      label: '死亡次数',
      include: [/^totaldeath/i, /^deathcount/i, /^deaths?$/i, /^totaldeaths/i, /^diecount/i, /^deathtimes?/i],
      exclude: [/boss/i, /enemy/i, /npc/i, /last/i, /max/i]
    },
    currency: {
      label: '持有货币',
      include: [/^currency/i, /^money$/i, /^gold$/i, /^coin(s)?$/i, /^copper/i, /^silver/i, /^cash/i, /^yuanbao/i],
      exclude: [/total/i, /earned/i, /spent/i]
    },
    currentDay: {
      label: '当前天数',
      include: [/^currentday/i, /^gameday/i, /^daycount/i, /^days?$/i, /^day$/i],
      exclude: [/total/i, /limit/i, /max/i, /remain/i]
    },
    dayLimit: {
      label: '天数上限',
      include: [/^totaldaylimit/i, /^daylimit/i, /^maxday/i, /^totaldays$/i, /^dayslimit/i],
      exclude: []
    },
    completion: {
      label: '完成度',
      include: [/^completionrate/i, /^completion/i, /^progress$/i, /^progresspercent/i, /^explorationrate/i],
      exclude: [/boss/i]
    },
    difficulty: {
      label: '难度',
      include: [/^difficulty/i, /^gamedifficulty/i, /^difficultymode/i],
      exclude: []
    },
    playerName: {
      label: '角色名',
      include: [/^playername/i, /^charactername/i, /^heroname/i],
      exclude: []
    },
    region: {
      label: '当前区域',
      include: [/^currentregion/i, /^currentarea/i, /^currentmap/i, /^regionname/i],
      exclude: []
    },
    newGamePlus: {
      label: '二周目',
      include: [/newgameplus/i, /^b?isnewgameplus/i, /^ngplus/i],
      exclude: []
    },
    sixtySixMode: {
      label: '六十六天模式',
      include: [/sixtysix/i, /^b?is66day/i, /sixtysixday/i],
      exclude: []
    },
    saveTime: {
      label: '存档时间',
      include: [/^lastsavetime/i, /^savetimestamp/i, /^savedate/i],
      exclude: []
    }
  };

  /* ------------------------------------------------------------------ *
   * 通用工具
   * ------------------------------------------------------------------ */
  function isNumericType(t) {
    return /^(Byte|Int|UInt|Float|Double|Int64)/.test(String(t || ''));
  }

  function num(v) {
    if (typeof v === 'number' && isFinite(v)) return v;
    if (typeof v === 'boolean') return v ? 1 : 0;
    if (typeof v === 'string' && /^-?\d+(\.\d+)?$/.test(v)) return Number(v);
    return null;
  }

  function displayKey(k) {
    if (k == null) return '';
    if (typeof k === 'string') return k;
    if (typeof k === 'number') return String(k);
    if (typeof k === 'object') {
      if (k.__children && k.__children.length) {
        var first = k.__children[0];
        if (typeof first.value === 'string') return first.value;
        return first.name + '=' + String(first.value);
      }
      return JSON.stringify(k).slice(0, 40);
    }
    return String(k);
  }

  function prettifyName(raw) {
    if (typeof raw !== 'string') return String(raw);
    var s = raw
      .replace(/^Boss_/i, '')
      .replace(/^Enemy_/i, '')
      .replace(/^Character_/i, '')
      .replace(/_/g, ' ')
      .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
      .trim();
    return s || raw;
  }

  /* ------------------------------------------------------------------ *
   * 扁平化
   * ------------------------------------------------------------------ */
  function toNodes(list) {
    // map 的 children 是 {key, value}，统一成节点
    return list.map(function (item, i) {
      if (item && (item.key !== undefined || item.value !== undefined) && item.name === undefined) {
        return { name: '[' + displayKey(item.key) + ']', type: 'Entry', value: item.value, mapKey: displayKey(item.key) };
      }
      return item;
    });
  }

  function flatten(list, prefix, depth, out) {
    var nodes = toNodes(list || []);
    for (var i = 0; i < nodes.length; i++) {
      var node = nodes[i];
      if (!node) continue;
      var path = prefix ? prefix + '.' + node.name : node.name;
      var v = node.value;

      if (v && typeof v === 'object') {
        if (v.__children) {
          var childPrefix = v.__map ? path : path;
          flatten(v.__children, childPrefix, depth + 1, out);
        } else if (node.raw) {
          out.push({ path: path, key: node.name, value: null, type: node.type, depth: depth });
        }
      } else {
        out.push({
          path: path,
          key: node.name,
          mapKey: node.mapKey,
          value: v,
          type: node.type,
          depth: depth
        });
      }
    }
    return out;
  }

  /* ------------------------------------------------------------------ *
   * 规则匹配
   * ------------------------------------------------------------------ */
  function matchRule(field, rule) {
    var key = field.key.replace(/^\[|\]$/g, '');
    var hit = false;
    for (var i = 0; i < rule.include.length; i++) {
      if (rule.include[i].test(key)) { hit = true; break; }
    }
    if (!hit) return 0;

    for (var j = 0; j < rule.exclude.length; j++) {
      if (rule.exclude[j].test(field.path)) return 0;
    }

    var score = 10;
    score += Math.max(0, 6 - field.depth * 2);
    if (rule.include[0].test(key)) score += 4;
    if (rule.type === 'duration' && !isNumericType(field.type) && typeof field.value !== 'number') {
      score -= 6;
    }
    if (typeof field.value === 'boolean') score -= 2;
    return score;
  }

  function pickBest(fields, ruleKey, overrides) {
    var rule = RULES[ruleKey];
    if (!rule) return null;

    if (overrides && overrides[ruleKey]) {
      for (var i = 0; i < fields.length; i++) {
        if (fields[i].path === overrides[ruleKey]) {
          return { field: fields[i], manual: true, score: 999 };
        }
      }
    }

    var best = null;
    for (var k = 0; k < fields.length; k++) {
      var f = fields[k];
      if (typeof f.value === 'object' && f.value !== null) continue;
      var s = matchRule(f, rule);
      if (s > 0 && (!best || s > best.score)) best = { field: f, score: s, manual: false };
    }
    return best;
  }

  /* ------------------------------------------------------------------ *
   * 时长换算
   * ------------------------------------------------------------------ */
  function toSeconds(value, key) {
    var v = num(value);
    if (v == null) return null;
    var k = String(key);
    if (DURATION_HINTS_MS.test(k)) return v / 1000;
    if (DURATION_HINTS_MIN.test(k)) return v * 60;
    if (DURATION_HINTS_HOUR.test(k)) return v * 3600;
    if (/second|sec/i.test(k)) return v;
    // 无数值单位信息时按量级推测
    if (v > 2e7) return v / 1000;      // 毫秒级
    if (v > 3 * 86400) return v;       // 秒级
    if (v > 500) return v;             // 秒级
    return v * 3600;                   // 多半按小时存
  }

  function formatDuration(seconds) {
    if (seconds == null || !isFinite(seconds)) return '—';
    var s = Math.max(0, Math.round(seconds));
    var h = Math.floor(s / 3600);
    var m = Math.floor((s % 3600) / 60);
    if (h >= 100) return h + ' 小时';
    return h + ' 小时 ' + m + ' 分';
  }

  /* ------------------------------------------------------------------ *
   * 结构识别：Boss 记录
   * ------------------------------------------------------------------ */
  function collectChildNames(entries) {
    var set = {};
    for (var i = 0; i < entries.length; i++) {
      var v = entries[i].value;
      if (!v || !v.__children) continue;
      for (var j = 0; j < v.__children.length; j++) {
        set[String(v.__children[j].name).toLowerCase()] = true;
      }
    }
    return set;
  }

  function scoreBossShape(names) {
    var s = 0;
    var keys = Object.keys(names);
    function has(re) {
      return keys.some(function (k) { return re.test(k); });
    }
    if (has(/death|die|dead/)) s += 3;
    if (has(/attempt|try|retry|challenge/)) s += 2;
    if (has(/fighttime|fightduration|elapsed|duration|timespent/)) s += 1;
    if (has(/defeat|clear|kill|win|complete/)) s += 1;
    return s;
  }

  function findBossTable(parsed) {
    var best = null;

    (function walk(list, prefix) {
      var nodes = toNodes(list || []);
      for (var i = 0; i < nodes.length; i++) {
        var node = nodes[i];
        var v = node.value;
        var path = prefix ? prefix + '.' + node.name : node.name;
        if (!v || typeof v !== 'object') continue;
        if (!v.__children) continue;

        var entries = v.__children;
        if (entries.length >= 2) {
          var structCount = entries.filter(function (e) { return e.value && e.value.__children; }).length;
          if (structCount >= Math.max(2, entries.length * 0.6)) {
            var names = collectChildNames(entries);
            var s = scoreBossShape(names);
            if (s >= 3) {
              var bonus = /boss/i.test(path) ? 4 : 0;
              if (!best || s + bonus > best.score) {
                best = { path: path, entries: entries, score: s + bonus };
              }
            }
          }
        }
        walk(entries, path);
      }
    })(parsed.root, '');

    return best;
  }

  function readBossEntries(table) {
    return table.entries.map(function (e) {
      var v = e.value;
      var fields = {};
      var children = (v && v.__children) || [];
      for (var i = 0; i < children.length; i++) {
        fields[String(children[i].name).toLowerCase()] = children[i].value;
      }
      function pick(re) {
        for (var k in fields) {
          if (re.test(k)) {
            var n = num(fields[k]);
            if (n != null) return n;
            if (typeof fields[k] === 'boolean') return fields[k] ? 1 : 0;
          }
        }
        return null;
      }
      var name = e.key !== undefined ? displayKey(e.key) : (e.name || '');
      // 数组形式的记录没有 key，尝试从结构体内的名称字段取名
      if (!name || /^\[\d+\]$/.test(name)) {
        for (var fk in fields) {
          if (/boss(name)?$|^name$|displayname|enemyname|^id$|^row$/i.test(fk) && typeof fields[fk] === 'string') {
            name = fields[fk];
            break;
          }
        }
      }
      return {
        rawName: name,
        name: prettifyName(name),
        deaths: pick(/death|die/),
        attempts: pick(/attempt|try|retry|challenge/),
        timeSeconds: (function () {
          for (var k in fields) {
            if (/fighttime|duration|timespent|elapsed/.test(k)) {
              var n = num(fields[k]);
              return n == null ? null : toSeconds(n, k);
            }
          }
          return null;
        })(),
        defeated: (function () {
          for (var k in fields) {
            if (/defeat|clear|kill|win|complete/.test(k)) {
              return fields[k] === true || fields[k] === 1;
            }
          }
          return null;
        })()
      };
    });
  }

  /* ------------------------------------------------------------------ *
   * 结构识别：道具 / 武器 / 收集品
   * ------------------------------------------------------------------ */
  function findNamedList(parsed, re, kind) {
    var found = [];
    (function walk(list, prefix) {
      var nodes = toNodes(list || []);
      for (var i = 0; i < nodes.length; i++) {
        var node = nodes[i];
        var v = node.value;
        var path = prefix ? prefix + '.' + node.name : node.name;
        if (!v || typeof v !== 'object' || !v.__children) continue;

        if (re.test(path)) {
          var entries = v.__children;
          var strish = entries.filter(function (e) {
            return typeof e.value === 'string' || (e.value && typeof e.value === 'object' && !e.value.__children);
          }).length;
          if (v.__map) {
            found.push({ path: path, kind: kind, entries: entries, isMap: true });
          } else if (strish === entries.length && entries.length) {
            found.push({ path: path, kind: kind, entries: entries, isMap: false });
          }
        }
        walk(v.__children, path);
      }
    })(parsed.root, '');
    return found;
  }

  function summarizeNamedList(list) {
    if (!list || !list.length) return null;
    var items = [];
    var total = 0;
    var hasCount = false;
    var source = list[0];
    for (var i = 0; i < source.entries.length; i++) {
      var e = source.entries[i];
      var label;
      if (typeof e.value === 'string') {
        label = e.value;
      } else if (e.key !== undefined) {
        label = displayKey(e.key);
      } else {
        label = String(e.name || '').replace(/^\[|\]$/g, '');
      }
      label = String(label).replace(/^\[|\]$/g, '');
      var count = num(e.value);
      if (count != null && source.isMap) {
        total += count;
        hasCount = true;
      }
      items.push({
        name: prettifyName(label.replace(/^(Item|Weapon|Edge|Material|Consumable)_/i, '')),
        raw: label,
        count: count
      });
    }
    return {
      path: source.path,
      count: items.length,
      total: hasCount ? total : null,
      items: items
    };
  }

  function findCollectibles(parsed, fields) {
    var groups = {};
    for (var i = 0; i < fields.length; i++) {
      var f = fields[i];
      if (!isNumericType(f.type)) continue;
      var v = num(f.value);
      if (v == null || v > 1e9) continue;
      var key = f.key.replace(/^\[|\]$/g, '');
      if (!/petal|shard|scroll|fragment|collect|relic|memory|soul|essence|leaf|flower/i.test(key)) continue;

      var base = key.replace(/(total|max|_total|_max)$/i, '');
      var isTotal = /total$|max$/i.test(key);
      var entry = groups[base] || (groups[base] = { label: base, value: null, total: null, path: f.path });
      if (isTotal) entry.total = v;
      else entry.value = v;
    }
    var out = [];
    for (var k in groups) {
      var g = groups[k];
      if (g.value == null && g.total == null) continue;
      out.push({
        label: prettifyName(g.label.replace(/_/g, ' ')),
        value: g.value,
        total: g.total,
        path: g.path,
        percent: g.value != null && g.total ? Math.min(100, (g.value / g.total) * 100) : null
      });
    }
    return out;
  }

  /* ------------------------------------------------------------------ *
   * 评语
   * ------------------------------------------------------------------ */
  function makeVerdict(view) {
    var hours = (view.playTimeSeconds || 0) / 3600;
    var deaths = view.deathCount;
    var rank = '';
    if (hours >= 60) rank = '江湖宿老';
    else if (hours >= 30) rank = '刀法大成';
    else if (hours >= 15) rank = '渐入佳境';
    else if (hours >= 5) rank = '初窥门径';
    else rank = '初入江湖';

    var lines = [];
    if (view.worstBoss) {
      lines.push('在「' + view.worstBoss.name + '」面前倒下 ' + view.worstBoss.deaths + ' 次，是这条路上最硬的一道坎。');
    }
    if (deaths != null && hours > 0) {
      var perHour = deaths / Math.max(hours, 0.5);
      if (perHour > 10) lines.push('平均每小时死 ' + perHour.toFixed(1) + ' 次，血与刃平分秋色。');
      else if (perHour > 4) lines.push('平均每小时死 ' + perHour.toFixed(1) + ' 次，节奏稳健。');
      else if (deaths > 0) lines.push('死亡率极低，招式判断相当老练。');
    }
    if (view.day && view.dayLimit) {
      lines.push('第 ' + view.day + ' / ' + view.dayLimit + ' 天，时间仍在流走。');
    }
    return { rank: rank, lines: lines };
  }

  /* ------------------------------------------------------------------ *
   * 主入口
   * ------------------------------------------------------------------ */
  function build(parsed, overrides) {
    var fields = flatten(parsed.root, '', 0, []);

    var found = {};
    ['playTime', 'deathCount', 'currency', 'currentDay', 'dayLimit', 'completion', 'difficulty',
      'playerName', 'region', 'newGamePlus', 'sixtySixMode', 'saveTime'].forEach(function (key) {
      found[key] = pickBest(fields, key, overrides);
    });

    var playTimeSeconds = null;
    if (found.playTime) {
      playTimeSeconds = toSeconds(found.playTime.field.value, found.playTime.field.key);
    }

    var completion = null;
    if (found.completion) {
      var c = num(found.completion.field.value);
      if (c != null) completion = c <= 1 ? c * 100 : c;
    }

    var bossTable = findBossTable(parsed);
    var bosses = bossTable ? readBossEntries(bossTable) : [];
    bosses = bosses.filter(function (b) { return b.deaths != null || b.attempts != null; });
    bosses.sort(function (a, b) { return (b.deaths || 0) - (a.deaths || 0); });

    var items = summarizeNamedList(findNamedList(parsed, /item|inventory|backpack|material|consumable|storage|props/i, 'item'));
    var weapons = summarizeNamedList(findNamedList(parsed, /weapon|arsenal|equipment|armory/i, 'weapon'));
    var edges = summarizeNamedList(findNamedList(parsed, /edge|phantom|secondary/i, 'edge'));

    var collectibles = findCollectibles(parsed, fields);
    var defeatedCount = bosses.filter(function (b) { return b.defeated; }).length;

    var view = {
      playTimeSeconds: playTimeSeconds,
      playTimeText: formatDuration(playTimeSeconds),
      deathCount: found.deathCount ? num(found.deathCount.field.value) : null,
      currency: found.currency ? num(found.currency.field.value) : null,
      day: found.currentDay ? num(found.currentDay.field.value) : null,
      dayLimit: found.dayLimit ? num(found.dayLimit.field.value) : null,
      completion: completion,
      difficulty: found.difficulty ? String(found.difficulty.field.value) : null,
      playerName: found.playerName ? String(found.playerName.field.value) : null,
      region: found.region ? String(found.region.field.value) : null,
      newGamePlus: found.newGamePlus ? found.newGamePlus.field.value === true : null,
      sixtySixMode: found.sixtySixMode ? found.sixtySixMode.field.value === true : null,
      bosses: bosses,
      bossDefeated: defeatedCount,
      bossTotal: bosses.length,
      worstBoss: bosses.length && bosses[0].deaths ? bosses[0] : null,
      items: items,
      weapons: weapons,
      edges: edges,
      collectibles: collectibles
    };

    view.verdict = makeVerdict(view);

    return {
      version: 1,
      header: parsed.header,
      meta: {
        className: parsed.header.saveGameClassName,
        engine: parsed.header.engineVersion
          ? parsed.header.engineVersion.major + '.' + parsed.header.engineVersion.minor
          : 'UE4',
        gameVersion: parsed.header.saveGameVersion,
        compressed: !!parsed.compressed,
        size: parsed.originalSize || parsed.size,
        parsedLeaves: parsed.leafCount,
        consumedRatio: parsed.consumedRatio
      },
      warnings: parsed.warnings || [],
      fields: fields,
      found: found,
      bossTablePath: bossTable ? bossTable.path : null,
      view: view
    };
  }

  var api = {
    build: build,
    flatten: function (parsed) { return flatten(parsed.root, '', 0, []); },
    formatDuration: formatDuration,
    toSeconds: toSeconds,
    prettifyName: prettifyName,
    RULES: RULES
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  } else {
    global.PBZ = global.PBZ || {};
    global.PBZ.Metrics = api;
  }
})(typeof window !== 'undefined' ? window : globalThis);
