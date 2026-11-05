/**
 * app.js — 页面交互
 *
 * 数据流：File → PBZ.Save.open()（解密容器）→ readJson()（解压每个槽）
 *        → PBZ.View.build()（折算战绩）→ 渲染
 */
(function () {
  'use strict';

  var P = window.PBZ;
  var $ = function (sel) { return document.querySelector(sel); };

  var KEY_STORAGE = 'pbz.customKey.v1';
  var MAX_TREE_CHILDREN = 200;

  var SLOT_LABEL = {
    __Advanced__: '账户数据',
    __Achievements__: '成就',
    ManualSave: '手动存档',
    AutoSave: '自动存档',
    NightmareRun: '噩梦模式'
  };

  var state = {
    file: null,
    save: null,
    slots: [],
    active: 0,
    view: null,
    meta: null,
    tab: 'overview',
    search: '',
    parseMs: 0,
    key: ''
  };

  /* ------------------------------------------------------------------ *
   * 工具
   * ------------------------------------------------------------------ */
  function escapeHtml(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function fmtBytes(n) {
    if (n == null) return '';
    if (n < 1024) return n + ' B';
    if (n < 1024 * 1024) return (n / 1024).toFixed(1) + ' KB';
    return (n / 1024 / 1024).toFixed(2) + ' MB';
  }

  function fmtInt(n) {
    if (n == null || !isFinite(n)) return '—';
    return Math.round(n).toLocaleString('en-US');
  }

  function fmtNum(n) {
    if (n == null || !isFinite(n)) return '—';
    if (Math.abs(n) >= 1000) return n.toLocaleString('en-US');
    return Number.isInteger(n) ? String(n) : String(Number(n.toFixed(3)));
  }

  function duration(sec) {
    if (sec == null || !isFinite(sec)) return '—';
    var s = Math.max(0, Math.round(sec));
    var h = Math.floor(s / 3600);
    var m = Math.floor((s % 3600) / 60);
    if (h === 0) return m + ' 分';
    return h + ' 小时 ' + m + ' 分';
  }

  function countUp(el, to, suffix) {
    if (!el) return;
    if (to == null || !isFinite(to)) { el.textContent = '—'; return; }
    var start = performance.now();
    var dur = 620;
    function step(now) {
      var t = Math.min(1, (now - start) / dur);
      var e = 1 - Math.pow(1 - t, 3);
      el.textContent = Math.round(to * e).toLocaleString('en-US') + (suffix || '');
      if (t < 1) requestAnimationFrame(step);
    }
    requestAnimationFrame(step);
  }

  function showStage(name) {
    ['stageUpload', 'stageLoading', 'stageError', 'stageResult'].forEach(function (id) {
      var el = $('#' + id);
      if (el) el.hidden = id !== name;
    });
  }

  function showError(title, msg) {
    $('#errTitle').textContent = title;
    $('#errMsg').innerHTML = msg;
    showStage('stageError');
    window.scrollTo({ top: 0, behavior: 'auto' });
  }

  /* ------------------------------------------------------------------ *
   * 读取文件
   * ------------------------------------------------------------------ */
  function walkEntry(entry, out, depth) {
    return new Promise(function (resolve) {
      if (depth > 6 || !entry) return resolve();
      if (entry.isFile) {
        entry.file(function (file) { out.push(file); resolve(); }, function () { resolve(); });
        return;
      }
      if (entry.isDirectory) {
        var reader = entry.createReader();
        var all = [];
        function readBatch() {
          reader.readEntries(function (entries) {
            if (!entries.length) {
              Promise.all(all.map(function (e) { return walkEntry(e, out, depth + 1); })).then(function () { resolve(); });
              return;
            }
            all = all.concat(Array.prototype.slice.call(entries));
            readBatch();
          }, function () { resolve(); });
        }
        readBatch();
        return;
      }
      resolve();
    });
  }

  async function filesFromDrop(dt) {
    var items = dt.items ? Array.prototype.slice.call(dt.items) : [];
    var entries = items.map(function (i) { return i.webkitGetAsEntry ? i.webkitGetAsEntry() : null; }).filter(Boolean);
    if (!entries.length) return Array.prototype.slice.call(dt.files || []);
    var out = [];
    for (var i = 0; i < entries.length; i++) await walkEntry(entries[i], out, 0);
    return out.length ? out : Array.prototype.slice.call(dt.files || []);
  }

  /** 从一堆文件里挑出存档候选，主存档优先 */
  function pickSaves(list) {
    var files = Array.prototype.slice.call(list).filter(function (f) {
      return f && f.size > 4096 && !/\.(ini|log|png|jpg|jpeg|txt|dll|exe)$/i.test(f.name);
    });
    files.sort(function (a, b) {
      var sa = /^PBZSaveGame\.sav$/i.test(a.name) ? 2 : /\.sav$/i.test(a.name) ? 1 : 0;
      var sb = /^PBZSaveGame\.sav$/i.test(b.name) ? 2 : /\.sav$/i.test(b.name) ? 1 : 0;
      if (sa !== sb) return sb - sa;
      return b.size - a.size;
    });
    return files;
  }

  /* ------------------------------------------------------------------ *
   * 主流程
   * ------------------------------------------------------------------ */
  async function handleFileList(list) {
    var files = pickSaves(list);
    if (!files.length) {
      showError('没有可解析的文件', '请选择 <code>PBZSaveGame.sav</code>（约 200KB ~ 2MB）。');
      return;
    }

    $('#loaderText').textContent = '正在剖开存档…';
    $('#loaderSub').textContent = files[0].name;
    showStage('stageLoading');

    var file = files[0];
    var t0 = performance.now();

    try {
      var buf = await file.arrayBuffer();
      var save = await P.Save.open(buf, { key: state.key || undefined });

      $('#loaderText').textContent = '正在解压存档槽…';
      $('#loaderSub').textContent = save.header.slotCount + ' 个槽位';

      var slots = [];
      for (var i = 0; i < save.slots.length; i++) {
        var slot = save.slots[i];
        var rec = {
          name: slot.name,
          algorithm: slot.algorithm,
          rawSize: slot.rawSize,
          blockSize: slot.blockSize,
          json: null,
          error: null
        };
        try {
          rec.json = await save.readJson(slot);
        } catch (e) {
          rec.error = e.message;
        }
        slots.push(rec);
      }

      state.file = file;
      state.save = save;
      state.slots = slots;
      state.parseMs = Math.round(performance.now() - t0);
      state.active = pickDefaultSlot(slots);

      var ok = slots.filter(function (s) { return s.json; }).length;
      if (!ok) throw new Error('所有存档槽都解压失败');

      await new Promise(function (r) { setTimeout(r, 260); });

      renderResult();
      showStage('stageResult');
      window.scrollTo({ top: 0, behavior: 'auto' });
    } catch (err) {
      var msg = err.message || String(err);
      var extra = '';
      if (/密钥/.test(msg)) {
        extra = '<br><br>这份存档可能来自更新后的游戏版本。到「解析信息」里填入新的 64 位密钥，或换回旧版存档。';
      } else if (/Oodle/i.test(msg)) {
        extra = '<br><br>Oodle 解码器没能加载，请检查网络后刷新页面。';
      }
      showError('没能解析这份存档', '文件：<code>' + escapeHtml(file.name) + '</code><br><br>' + escapeHtml(msg) + extra);
    }
  }

  /** 默认选中「最近一次游玩」的槽 */
  function pickDefaultSlot(slots) {
    var best = -1;
    var bestTime = '';
    slots.forEach(function (s, i) {
      if (!s.json) return;
      var t = (s.json.PBZGameSystem || {}).DateTimeString || '';
      if (!/^__/.test(s.name) && t > bestTime) { bestTime = t; best = i; }
    });
    if (best >= 0) return best;
    for (var i = 0; i < slots.length; i++) if (slots[i].json) return i;
    return 0;
  }

  function currentSlot() {
    return state.slots[state.active];
  }

  /* ------------------------------------------------------------------ *
   * 渲染
   * ------------------------------------------------------------------ */
  function renderResult() {
    var slot = currentSlot();
    if (!slot || !slot.json) return;

    var built = P.View.build(
      { json: slot.json, slotName: slot.name, size: state.file.size, slotCount: state.save.header.slotCount },
      {
        atlas: window.PBZBossAtlas,
        advanced: (byName('__Advanced__') || {}).json,
        achievements: (byName('__Achievements__') || {}).json
      }
    );

    state.view = built.view;
    state.meta = built.meta;

    var bits = [fmtBytes(state.file.size), 'PBZS v' + state.save.header.version, state.save.header.slotCount + ' 槽'];
    bits.push('解析 ' + state.parseMs + 'ms');
    $('#fileName').textContent = state.file.name;
    $('#fileMeta').textContent = bits.join(' · ');

    renderSlots();
    renderHero(state.view);
    renderStats(state.view);
    renderBosses(state.view);
    renderCollectibles(state.view);
    renderChips('#weaponList', '#weaponEmpty', '#weaponNote', weaponsAsChips(state.view), '把');
    renderChips('#itemList', '#itemEmpty', '#itemNote', state.view.items, '种');

    var notice = $('#parseNotice');
    if (state.view.bosses.length === 0) {
      notice.hidden = false;
      $('#noticeText').innerHTML = '这个槽位里没有 Boss 记录，通常表示还没有打过首领，或这是账户数据 / 成就槽。切换到存档槽里的其他条目看看。';
    } else {
      notice.hidden = true;
    }

    state.search = '';
    $('#rawSearch').value = '';
    renderRaw();
    renderMeta();
  }

  function byName(name) {
    for (var i = 0; i < state.slots.length; i++) {
      if (state.slots[i].name === name) return state.slots[i];
    }
    return null;
  }

  function slotTitle(name) {
    var m = String(name).match(/^(ManualSave|AutoSave|NightmareRun)(\d+)$/);
    if (m) return (SLOT_LABEL[m[1]] || m[1]) + ' ' + m[2];
    return SLOT_LABEL[name] || name;
  }

  function renderSlots() {
    var box = $('#slotGrid');
    var note = $('#slotNote');
    var playable = state.slots.filter(function (s) { return s.json && !/^__/.test(s.name); });
    var account = state.slots.filter(function (s) { return s.json && /^__/.test(s.name); });

    note.textContent = playable.length + ' 个游玩档 · ' + account.length + ' 个账户档';

    box.innerHTML = state.slots.map(function (s, i) {
      var g = s.json ? (s.json.PBZGameSystem || {}) : {};
      var deaths = s.json ? (s.json.PBZDeathMeta || {}).DiedTimes : null;
      var isMeta = /^__/.test(s.name);
      var meta = s.error
        ? '<span class="slot-err">解压失败</span>'
        : isMeta
          ? '<span>' + (s.json.__Achievements__ ? '' : slotSummaryMeta(s)) + '</span>'
          : '<span>' + (g.DateTimeString || '—') + '</span><span>死亡 ' + (deaths != null ? deaths : '—') + '</span>';

      return '<button type="button" class="slot-card' + (i === state.active ? ' is-active' : '') + (isMeta ? ' is-meta' : '') + '" data-slot="' + i + '"' + (s.error ? ' disabled' : '') + '>' +
        '<span class="slot-name">' + escapeHtml(slotTitle(s.name)) + '</span>' +
        '<span class="slot-meta">' + meta + '</span>' +
        '<span class="slot-size">' + fmtBytes(s.rawSize) + '</span>' +
        '</button>';
    }).join('');
  }

  function slotSummaryMeta(slot) {
    var j = slot.json || {};
    if (slot.name === '__Achievements__') {
      var ids = Array.isArray(j.UnlockedIds) ? j.UnlockedIds.length : null;
      return ids != null ? '已解锁 ' + ids + ' 个' : '—';
    }
    if (slot.name === '__Advanced__') {
      var codex = (j.Codex || {}).DiscoveredEnemies;
      return Array.isArray(codex) ? '敌人图鉴 ' + codex.length : '账户与外观';
    }
    return '';
  }

  function renderHero(view) {
    $('#playerName').textContent = view.playerName || '魂';

    var tagDiff = $('#tagDifficulty');
    if (view.difficulty) {
      tagDiff.hidden = false;
      tagDiff.textContent = view.difficulty;
    } else tagDiff.hidden = true;

    $('#tagSixtySix').hidden = !(view.dayLimit === 66 && view.finished);
    $('#tagNgPlus').hidden = !view.newGamePlus;
    if (view.newGamePlus && view.cycleCount != null) {
      $('#tagNgPlus').textContent = (view.cycleCount + 1) + ' 周目';
    }

    $('#regionLine').textContent = view.levelName
      ? '当前区域 · ' + view.levelName
      : '存档解析完成 · PBZS v3';

    var dayLine = $('#dayLine');
    if (view.day != null) {
      dayLine.hidden = false;
      $('#dayNow').textContent = view.day;
      $('#dayMax').textContent = view.dayLimit != null ? view.dayLimit : '—';
    } else {
      dayLine.hidden = true;
    }

    $('#verdictRank').textContent = view.verdict.rank ? '「' + view.verdict.rank + '」' : '';

    var saveLine = $('#saveTimeLine');
    if (view.savedAt) {
      saveLine.hidden = false;
      saveLine.textContent = '最后存档 · ' + String(view.savedAt).replace('-', ' ');
    } else {
      saveLine.hidden = true;
    }

    var hours = view.playTimeSeconds != null ? Math.floor(view.playTimeSeconds / 3600) : null;
    var minutes = view.playTimeSeconds != null ? Math.floor((view.playTimeSeconds % 3600) / 60) : null;
    countUp($('#playTimeH'), hours);
    $('#playTimeM').textContent = minutes == null ? '—' : minutes;

    var pct = view.bossTotal ? (view.bossDefeated / view.bossTotal) * 100 : 0;
    $('#completionVal').textContent = view.bossTotal ? Math.round(pct) + '%' : '—';
    var ring = $('#ringFg');
    requestAnimationFrame(function () {
      ring.style.strokeDashoffset = String(327 * (1 - pct / 100));
    });

    var lines = view.verdict.lines.length ? view.verdict.lines : ['存档解析完成。'];
    $('#verdictLine').innerHTML = lines.map(function (l) { return '<span>' + escapeHtml(l) + '</span>'; }).join('');
  }

  function renderStats(view) {
    var perHour = null;
    if (view.deathCount != null && view.playTimeSeconds > 0) {
      perHour = view.deathCount / Math.max(view.playTimeSeconds / 3600, 0.5);
    }

    var stats = [
      {
        label: '死亡次数',
        value: view.deathCount,
        unit: '次',
        sub: perHour != null ? '平均每小时 ' + perHour.toFixed(1) + ' 次' : '存档未记录',
        accent: true
      },
      {
        label: 'Boss 击破',
        value: view.bossTotal ? view.bossDefeated : null,
        unit: view.bossTotal ? '/ ' + view.bossTotal : '',
        sub: view.worstBoss ? '最难关：' + view.worstBoss.name : (view.bossTotal ? '全部击破' : '未记录')
      },
      {
        label: '意识之尘',
        value: view.currency,
        unit: '',
        sub: '存档内持有量',
        gold: true
      },
      {
        label: '当前天数',
        value: view.day,
        unit: view.dayLimit ? '/ ' + view.dayLimit + ' 天' : '天',
        sub: view.remainingDays != null ? '剩余 ' + view.remainingDays + ' 天' : '存档未记录'
      },
      {
        label: '武器',
        value: view.weapons ? view.weapons.count : null,
        unit: '把',
        sub: view.weapons ? '最高强化 +' + view.weapons.maxPlus : '存档未记录'
      },
      {
        label: '行囊',
        value: view.items ? view.items.count : null,
        unit: '种',
        sub: view.items && view.items.total ? '合计 ' + view.items.total + ' 件' : '物品条目数'
      }
    ];

    $('#statGrid').innerHTML = stats.map(function (s) {
      var missing = s.value == null;
      return '' +
        '<div class="stat' + (s.accent ? ' is-accent' : '') + (s.gold ? ' is-gold' : '') + '">' +
        '<span class="stat-label">' + s.label + '</span>' +
        '<span class="stat-value' + (missing ? ' is-missing' : '') + '">' +
        '<b data-count="' + (missing ? '' : s.value) + '">' + (missing ? '—' : '0') + '</b>' +
        (s.unit ? '<span class="unit">' + s.unit + '</span>' : '') +
        '</span>' +
        '<span class="stat-sub">' + escapeHtml(s.sub) + '</span>' +
        '</div>';
    }).join('');

    Array.prototype.forEach.call(document.querySelectorAll('[data-count]'), function (el) {
      var v = el.getAttribute('data-count');
      if (v === '') return;
      countUp(el, Number(v));
    });
  }

  function renderBosses(view) {
    var list = $('#bossList');
    var empty = $('#bossEmpty');
    var note = $('#bossNote');

    if (!view.bosses.length) {
      list.innerHTML = '';
      list.hidden = true;
      empty.hidden = false;
      note.textContent = '未记录';
      return;
    }

    list.hidden = false;
    empty.hidden = true;
    note.textContent = view.bossDefeated + ' / ' + view.bossTotal + ' 已击破';

    list.innerHTML = view.bosses.map(function (b, i) {
      var art = b.img
        ? '<img src="' + escapeHtml(b.img) + '" alt="" loading="lazy" decoding="async">'
        : '<span class="boss-card-ghost">' + escapeHtml(String(b.display || '?').slice(0, 1)) + '</span>';

      var meta = b.region || '';
      if (b.attempts != null) meta += (meta ? ' · ' : '') + '挑战 ' + b.attempts + ' 次';

      var lost = b.defeated === false ? '<span class="boss-card-lost">未击破</span>' : '';

      var title = b.display;
      if (b.rawName && b.rawName !== b.display) title += ' · ' + b.rawName;
      if (b.bestTime) title += ' · 最快 ' + b.bestTime;

      var zero = b.deaths === 0 ? ' is-zero' : '';
      var count = b.deaths != null ? b.deaths : '—';

      return '<article class="boss-card' + (i === 0 ? ' is-top' : '') + '" title="' + escapeHtml(title) + '">' +
        '<div class="boss-card-art">' + art + lost + '</div>' +
        '<div class="boss-card-info">' +
          '<div class="boss-card-name">' + escapeHtml(b.display) + '</div>' +
          '<div class="boss-card-foot">' +
            '<span class="boss-card-meta">' + escapeHtml(meta) + '</span>' +
            '<span class="boss-card-count' + zero + '"><b>' + count + '</b><i>次</i></span>' +
          '</div>' +
        '</div>' +
        '</article>';
    }).join('');
  }

  function renderCollectibles(view) {
    var list = $('#collectList');
    var empty = $('#collectEmpty');
    var note = $('#collectNote');

    var rows = view.collectibles.slice();

    if (!rows.length) {
      list.innerHTML = '';
      list.hidden = true;
      empty.hidden = false;
      note.textContent = '未记录';
      return;
    }

    list.hidden = false;
    empty.hidden = true;
    note.textContent = rows.length + ' 项统计';

    list.innerHTML = rows.map(function (c) {
      return '' +
        '<div class="collect-item">' +
        '<div class="collect-top">' +
        '<span class="collect-name">' + escapeHtml(c.label) + '</span>' +
        '<span class="collect-val">' + fmtInt(c.value) + (c.total ? '<small>/ ' + c.total + '</small>' : '') + '</span>' +
        '</div>' +
        '</div>';
    }).join('');
  }

  /** 武器列表转成 chip 结构 */
  function weaponsAsChips(view) {
    if (!view.weapons || !view.weapons.count) return null;
    return {
      items: view.weapons.items.map(function (w) {
        return { name: w.name + (w.plus ? ' +' + w.plus : ''), raw: w.raw, count: null };
      })
    };
  }

  function renderChips(listSel, emptySel, noteSel, data, unit) {
    var el = $(listSel);
    var empty = $(emptySel);
    var note = $(noteSel);

    if (!data || !data.items || !data.items.length) {
      el.innerHTML = '';
      el.hidden = true;
      empty.hidden = false;
      note.textContent = '未记录';
      return;
    }

    el.hidden = false;
    empty.hidden = true;
    note.textContent = data.items.length + ' ' + unit;

    var cap = unit === '种' ? 30 : 48;
    el.innerHTML = data.items.slice(0, cap).map(function (item) {
      var count = item.count != null && item.count > 1 ? '<span class="n">×' + item.count + '</span>' : '';
      return '<span class="chip" title="' + escapeHtml(item.raw || item.name) + '">' + escapeHtml(item.name) + count + '</span>';
    }).join('') + (data.items.length > cap
      ? '<span class="chip">… 另有 ' + (data.items.length - cap) + ' 项</span>'
      : '');
  }

  /* ------------------------------------------------------------------ *
   * 原始数据（JSON 树）
   * ------------------------------------------------------------------ */
  function isContainer(v) {
    return v && typeof v === 'object';
  }

  function containerSize(v) {
    return Array.isArray(v) ? v.length : Object.keys(v).length;
  }

  function typeOf(v) {
    if (Array.isArray(v)) return 'array';
    if (v === null) return 'null';
    if (isContainer(v)) return 'object';
    return typeof v;
  }

  function valueText(v) {
    if (v === null) return 'null';
    if (typeof v === 'boolean') return String(v);
    if (typeof v === 'number') return fmtNum(v);
    if (typeof v === 'string') return v.length > 220 ? v.slice(0, 220) + '…' : v;
    return '';
  }

  function valueClass(v) {
    if (typeof v === 'string') return ' is-str';
    if (typeof v === 'boolean') return ' is-bool';
    if (v === null) return ' is-null';
    return '';
  }

  /** 深度优先收集所有叶子路径，供搜索使用 */
  function flatten(value, prefix, out) {
    if (out.length > 40000) return;
    if (isContainer(value)) {
      var keys = Object.keys(value);
      for (var i = 0; i < keys.length; i++) {
        var k = keys[i];
        var path = prefix ? prefix + '.' + k : k;
        var v = value[k];
        if (isContainer(v)) flatten(v, path, out);
        else out.push({ path: path, value: v });
      }
    }
  }

  function buildJsonTree(value, depth, prefix, out) {
    var keys = Array.isArray(value) ? value.map(function (_, i) { return i; }) : Object.keys(value);
    var limit = Math.min(keys.length, MAX_TREE_CHILDREN);

    for (var i = 0; i < limit; i++) {
      var k = keys[i];
      var v = value[k];
      var name = String(k);
      var path = prefix ? prefix + '.' + name : name;
      var isBox = isContainer(v);
      var count = isBox ? containerSize(v) : 0;

      var row = document.createElement('div');
      row.className = 'tree-row' + (isBox && depth < 1 ? ' is-open' : '');
      row.style.paddingLeft = depth * 15 + 6 + 'px';
      row.dataset.path = path;
      row.innerHTML =
        '<span class="tree-caret' + (isBox && count ? '' : ' leaf') + '">▶</span>' +
        '<span class="tree-name">' + escapeHtml(name) + '</span>' +
        '<span class="tree-type">' + escapeHtml(typeOf(v)) + '</span>' +
        (isBox
          ? '<span class="tree-val is-null">' + count + ' 项</span>'
          : '<span class="tree-val' + valueClass(v) + '">' + escapeHtml(valueText(v)) + '</span>');
      out.appendChild(row);

      if (isBox && count) {
        var wrap = document.createElement('div');
        wrap.className = 'tree-children' + (depth < 1 ? ' is-open' : '');
        out.appendChild(wrap);
        buildJsonTree(v, depth + 1, path, wrap);

        if (count > MAX_TREE_CHILDREN) {
          var more = document.createElement('div');
          more.className = 'tree-row';
          more.style.paddingLeft = (depth + 1) * 15 + 6 + 'px';
          more.innerHTML = '<span class="tree-caret leaf"></span><span class="tree-val is-null">… 省略 ' + (count - MAX_TREE_CHILDREN) + ' 项</span>';
          wrap.appendChild(more);
        }
      }
    }
  }

  function renderRaw() {
    var wrap = $('#rawTree');
    var slot = currentSlot();
    if (!slot || !slot.json) return;

    var search = state.search.trim().toLowerCase();
    wrap.innerHTML = '';

    if (search) {
      var flat = [];
      flatten(slot.json, '', flat);
      var hits = flat.filter(function (f) { return f.path.toLowerCase().indexOf(search) >= 0; });

      $('#rawStat').textContent = hits.length + ' 条匹配';

      if (!hits.length) {
        wrap.innerHTML = '<div class="tree-row"><span class="tree-caret leaf"></span><span class="tree-val is-null">没有匹配的字段</span></div>';
        return;
      }

      hits.slice(0, 300).forEach(function (f) {
        var row = document.createElement('div');
        row.className = 'tree-row';
        row.dataset.path = f.path;
        row.innerHTML =
          '<span class="tree-caret leaf"></span>' +
          '<span class="tree-name">' + highlight(f.path, search) + '</span>' +
          '<span class="tree-val' + valueClass(f.value) + '">' + escapeHtml(valueText(f.value)) + '</span>';
        wrap.appendChild(row);
      });

      if (hits.length > 300) {
        var more = document.createElement('div');
        more.className = 'tree-row';
        more.innerHTML = '<span class="tree-caret leaf"></span><span class="tree-val is-null">… 还有 ' + (hits.length - 300) + ' 条</span>';
        wrap.appendChild(more);
      }
      return;
    }

    var all = [];
    flatten(slot.json, '', all);
    $('#rawStat').textContent = all.length + ' 个字段';
    buildJsonTree(slot.json, 0, '', wrap);
  }

  function highlight(text, q) {
    var idx = text.toLowerCase().indexOf(q);
    if (idx < 0) return escapeHtml(text);
    return escapeHtml(text.slice(0, idx)) +
      '<mark>' + escapeHtml(text.slice(idx, idx + q.length)) + '</mark>' +
      escapeHtml(text.slice(idx + q.length));
  }

  function renderMeta() {
    var h = state.save.header;
    var slot = currentSlot();
    var rows = [
      ['容器', 'PBZS v' + h.version + '（flags 0x' + h.flags.toString(16) + '）'],
      ['槽位总数', String(h.slotCount)],
      ['目录长度', h.directorySize + ' 字节'],
      ['当前槽位', slot ? slot.name : '—'],
      ['压缩算法', slot ? ({ 0: '原始 JSON', 1: 'zlib', 2: 'Oodle Kraken' }[slot.algorithm] || '未知 ' + slot.algorithm) : '—'],
      ['解压后', slot ? fmtBytes(slot.rawSize) : '—'],
      ['文件大小', fmtBytes(state.file.size)],
      ['解密密钥', state.key ? '自定义' : '内置（build 26266538）'],
      ['解析耗时', state.parseMs + ' ms']
    ];

    $('#metaList').innerHTML = rows.map(function (r) {
      return '<dt>' + escapeHtml(r[0]) + '</dt><dd>' + escapeHtml(r[1]) + '</dd>';
    }).join('');

    var failed = state.slots.filter(function (s) { return s.error; });
    var warn = $('#warnBox');
    if (failed.length) {
      warn.hidden = false;
      warn.innerHTML = '<b>有 ' + failed.length + ' 个槽位解压失败</b><br>' +
        failed.map(function (s) { return escapeHtml(s.name + '：' + s.error); }).join('<br>');
    } else {
      warn.hidden = true;
    }
  }

  /* ------------------------------------------------------------------ *
   * 交互
   * ------------------------------------------------------------------ */
  function switchSlot(index) {
    if (index === state.active) return;
    state.active = index;
    renderResult();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function setTab(name) {
    state.tab = name;
    Array.prototype.forEach.call(document.querySelectorAll('.tab'), function (t) {
      t.classList.toggle('is-active', t.getAttribute('data-tab') === name);
    });
    $('#panelOverview').hidden = name !== 'overview';
    $('#panelRaw').hidden = name !== 'raw';
    if (name === 'raw') renderRaw();
  }

  function bindEvents() {
    var dz = $('#dropzone');
    var input = $('#fileInput');
    var dirInput = $('#dirInput');

    $('#btnPickFile').addEventListener('click', function (e) { e.stopPropagation(); input.click(); });
    $('#btnPickDir').addEventListener('click', function (e) { e.stopPropagation(); dirInput.click(); });
    dz.addEventListener('click', function () { input.click(); });
    dz.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); input.click(); }
    });

    input.addEventListener('change', function () {
      if (this.files && this.files.length) handleFileList(this.files);
      this.value = '';
    });
    dirInput.addEventListener('change', function () {
      if (this.files && this.files.length) handleFileList(this.files);
      this.value = '';
    });

    ['dragenter', 'dragover'].forEach(function (ev) {
      dz.addEventListener(ev, function (e) {
        e.preventDefault();
        e.stopPropagation();
        dz.classList.add('is-over');
      });
    });
    ['dragleave', 'drop'].forEach(function (ev) {
      dz.addEventListener(ev, function (e) {
        e.preventDefault();
        e.stopPropagation();
        if (ev === 'dragleave' && dz.contains(e.relatedTarget)) return;
        dz.classList.remove('is-over');
      });
    });
    dz.addEventListener('drop', async function (e) {
      var files = await filesFromDrop(e.dataTransfer);
      if (files.length) handleFileList(files);
    });

    // 阻止浏览器在页面其它位置打开拖入的文件
    ['dragover', 'drop'].forEach(function (ev) {
      window.addEventListener(ev, function (e) { e.preventDefault(); }, false);
    });

    $('#btnErrBack').addEventListener('click', function () { showStage('stageUpload'); });
    $('#btnAgain').addEventListener('click', function () {
      state.save = null;
      state.slots = [];
      showStage('stageUpload');
    });

    Array.prototype.forEach.call(document.querySelectorAll('.tab'), function (t) {
      t.addEventListener('click', function () { setTab(t.getAttribute('data-tab')); });
    });

    $('#slotGrid').addEventListener('click', function (e) {
      var card = e.target.closest('.slot-card');
      if (!card || card.disabled) return;
      switchSlot(Number(card.getAttribute('data-slot')));
    });

    var searchTimer = null;
    $('#rawSearch').addEventListener('input', function () {
      var v = this.value;
      clearTimeout(searchTimer);
      searchTimer = setTimeout(function () {
        state.search = v;
        renderRaw();
      }, 160);
    });

    // 展开/收起
    $('#rawTree').addEventListener('click', function (e) {
      var row = e.target.closest('.tree-row');
      if (!row) return;
      var caret = row.querySelector('.tree-caret');
      if (!caret || caret.classList.contains('leaf')) return;
      row.classList.toggle('is-open');
      var next = row.nextElementSibling;
      if (next && next.classList.contains('tree-children')) next.classList.toggle('is-open');
    });

    // 导出 JSON
    $('#btnExport').addEventListener('click', function () {
      var slot = currentSlot();
      if (!slot || !slot.json) return;
      var blob = new Blob([JSON.stringify(slot.json, null, 2)], { type: 'application/json' });
      var url = URL.createObjectURL(blob);
      var a = document.createElement('a');
      a.href = url;
      a.download = slot.name.replace(/^__|__$/g, '') + '.json';
      a.click();
      setTimeout(function () { URL.revokeObjectURL(url); }, 4000);
    });

    // 战绩卡
    $('#btnShare').addEventListener('click', function () {
      if (!state.view) return;
      var canvas = P.ShareCard.draw(state.view);
      P.ShareCard.download(canvas, 'yingzhi-ling-zhanji.png');
    });

    // 自定义密钥
    $('#btnKeyApply').addEventListener('click', function () {
      var raw = $('#keyInput').value.trim();
      if (!raw) {
        state.key = '';
        localStorage.removeItem(KEY_STORAGE);
        if (state.file) handleFileList([state.file]);
        return;
      }
      try {
        P.Save.hexToBytes(raw);
      } catch (err) {
        alert(err.message);
        return;
      }
      state.key = raw;
      localStorage.setItem(KEY_STORAGE, raw);
      if (state.file) handleFileList([state.file]);
    });

    // 示例存档
    var sampleBtn = $('#btnSample');
    if (sampleBtn) {
      sampleBtn.addEventListener('click', async function () {
        try {
          $('#loaderText').textContent = '正在载入示例…';
          $('#loaderSub').textContent = '内置演示存档';
          showStage('stageLoading');
          var res = await fetch('samples/demo-pbzs.sav');
          if (!res.ok) throw new Error('示例存档加载失败（HTTP ' + res.status + '）');
          var buf = await res.arrayBuffer();
          var file = new File([buf], 'PBZSaveGame.sav', { type: 'application/octet-stream' });
          handleFileList([file]);
        } catch (err) {
          showError('示例没能载入', escapeHtml(err.message) + '<br><br>本地直接双击打开 HTML 时浏览器会拦截读取，请用 <code>python -m http.server</code> 或线上地址访问。');
        }
      });
    }

    // 引导弹层
    var modal = $('#guideModal');
    $('#btnGuide').addEventListener('click', function () { modal.hidden = false; });
    modal.addEventListener('click', function (e) {
      if (e.target.dataset.close) modal.hidden = true;
    });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') modal.hidden = true;
    });
  }

  /* ------------------------------------------------------------------ *
   * 启动
   * ------------------------------------------------------------------ */
  function init() {
    bindEvents();

    try {
      var saved = localStorage.getItem(KEY_STORAGE);
      if (saved && /^[0-9a-fA-F]{64}$/.test(saved)) {
        state.key = saved;
        $('#keyInput').value = saved;
      }
    } catch (e) { /* 隐私模式下忽略 */ }

    // 暴露只读接口，便于调试
    window.PBZApp = {
      getView: function () { return state.view; },
      getSlots: function () { return state.slots.map(function (s) { return { name: s.name, ok: !!s.json, error: s.error }; }); },
      getCurrent: function () { return currentSlot(); }
    };
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
