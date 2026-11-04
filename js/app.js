/**
 * app.js — 页面交互
 */
(function () {
  'use strict';

  var P = window.PBZ;
  var $ = function (sel) { return document.querySelector(sel); };

  var STORAGE_KEY = 'pbz.saveOverrides.v1';
  var MAX_FILES = 12;
  var MAX_TREE_CHILDREN = 200;

  var DIFFICULTY_CN = {
    easy: '简单', story: '剧情', normal: '普通', standard: '普通',
    hard: '困难', nightmare: '噩梦', brutal: '残酷', extreme: '极难',
    'very hard': '极难', hell: '修罗'
  };

  var BOSS_DISPLAY = {
    'Three Face Puppet': '三脸魔偶',
    'Bride Ahua': '新娘阿花',
    'Jagged Steel': '裂钢',
    'Frenzied Brute': '狂血莽夫',
    'Axemaster Peng Meng': '彭猛 · 斧匠'
  };

  var COLLECT_CN = {
    petal: '花瓣', shard: '碎片', scroll: '卷轴', flower: '花', leaf: '叶',
    fragment: '残片', relic: '遗物', memory: '记忆', soul: '魂', essence: '精魄',
    coin: '铜钱', key: '钥匙', gem: '宝石', herb: '草药', bone: '骨',
    blueprint: '图纸', material: '材料', token: '信物', charm: '护符', seal: '印记'
  };

  var BINDABLE = [
    { key: 'playTime', label: '游玩时长' },
    { key: 'deathCount', label: '死亡次数' },
    { key: 'currency', label: '持有货币' },
    { key: 'currentDay', label: '当前天数' },
    { key: 'dayLimit', label: '天数上限' },
    { key: 'completion', label: '完成度' },
    { key: 'playerName', label: '角色名' },
    { key: 'difficulty', label: '难度' },
    { key: 'region', label: '当前区域' }
  ];

  var state = {
    entries: [],
    active: 0,
    overrides: {},
    tab: 'overview',
    fields: [],
    search: ''
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
    return Number.isInteger(n) ? String(n) : n.toFixed(2);
  }

  function duration(sec) {
    if (sec == null || !isFinite(sec)) return '—';
    var s = Math.max(0, Math.round(sec));
    var h = Math.floor(s / 3600);
    var m = Math.floor((s % 3600) / 60);
    if (h === 0) return m + ' 分';
    return h + ' 小时 ' + m + ' 分';
  }

  function collectLabel(raw) {
    var k = String(raw).toLowerCase().replace(/[^a-z]/g, '');
    var cn = COLLECT_CN[k] || COLLECT_CN[k.replace(/s$/, '')];
    return cn || P.Metrics.prettifyName(raw);
  }

  function toDate(v) {
    var n = Number(v);
    if (!n || !isFinite(n)) return null;
    var ms;
    if (n > 1e15) ms = n / 10000 - 62135596800000;   // .NET DateTime ticks
    else if (n > 1e11) ms = n;                        // 毫秒时间戳
    else if (n > 1e9) ms = n * 1000;                  // 秒时间戳
    else return null;
    var d = new Date(ms);
    if (isNaN(d.getTime()) || d.getFullYear() < 2000 || d.getFullYear() > 2100) return null;
    return d;
  }

  function fmtDate(d) {
    return d.getFullYear() + '.' +
      String(d.getMonth() + 1).padStart(2, '0') + '.' +
      String(d.getDate()).padStart(2, '0') + ' ' +
      String(d.getHours()).padStart(2, '0') + ':' +
      String(d.getMinutes()).padStart(2, '0');
  }

  function loadOverrides() {
    try {
      return JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}') || {};
    } catch (e) {
      return {};
    }
  }

  function saveOverrides() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state.overrides));
    } catch (e) { /* 隐私模式下忽略 */ }
  }

  function countUp(el, to, suffix) {
    if (!el) return;
    if (to == null || !isFinite(to)) {
      el.textContent = '—';
      return;
    }
    var start = performance.now();
    var dur = 750;
    var from = 0;
    function step(now) {
      var t = Math.min(1, (now - start) / dur);
      var eased = 1 - Math.pow(1 - t, 3);
      var v = from + (to - from) * eased;
      el.textContent = fmtInt(v);
      if (t < 1) requestAnimationFrame(step);
      else el.textContent = fmtInt(to) + (suffix || '');
    }
    requestAnimationFrame(step);
  }

  function fileRank(file) {
    var path = (file.webkitRelativePath || file.name || '').toLowerCase();
    var score = 0;
    if (/pbzsavegame\.sav$/.test(path)) score += 100;
    else if (/\.sav$/.test(path)) score += 40;
    if (/realtime/.test(path)) score += 20;
    else if (/hourly/.test(path)) score += 12;
    else if (/daily/.test(path)) score += 8;
    return score;
  }

  /* ------------------------------------------------------------------ *
   * 页面切换
   * ------------------------------------------------------------------ */
  function showStage(name) {
    ['stageUpload', 'stageLoading', 'stageError', 'stageResult'].forEach(function (id) {
      var el = document.getElementById(id);
      if (el) el.hidden = id !== name;
    });
  }

  function showError(title, msg) {
    $('#errTitle').textContent = title;
    $('#errMsg').innerHTML = msg;
    showStage('stageError');
  }

  /* ------------------------------------------------------------------ *
   * 文件处理
   * ------------------------------------------------------------------ */
  function walkEntry(entry, out, depth) {
    return new Promise(function (resolve) {
      if (depth > 6 || !entry) return resolve();
      if (entry.isFile) {
        entry.file(function (file) {
          out.push(file);
          resolve();
        }, function () { resolve(); });
        return;
      }
      if (entry.isDirectory) {
        var reader = entry.createReader();
        var all = [];
        function readBatch() {
          reader.readEntries(function (entries) {
            if (!entries.length) {
              Promise.all(all.map(function (e) { return walkEntry(e, out, depth + 1); }))
                .then(function () { resolve(); });
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
    var entries = items
      .map(function (i) { return i.webkitGetAsEntry ? i.webkitGetAsEntry() : null; })
      .filter(Boolean);
    if (!entries.length) return Array.prototype.slice.call(dt.files || []);
    var out = [];
    for (var i = 0; i < entries.length; i++) {
      await walkEntry(entries[i], out, 0);
    }
    return out.length ? out : Array.prototype.slice.call(dt.files || []);
  }

  async function handleFileList(list) {
    var files = Array.prototype.slice.call(list).filter(function (f) {
      return f && f.size > 0 && !/\.(ini|log|png|jpg|txt)$/i.test(f.name);
    });

    if (!files.length) {
      showError('没有可解析的文件', '请选择 <code>PBZSaveGame.sav</code>，或直接拖入整个存档文件夹。');
      return;
    }

    files.sort(function (a, b) { return fileRank(b) - fileRank(a); });
    files = files.slice(0, MAX_FILES);

    $('#loaderText').textContent = '正在剖开存档…';
    $('#loaderSub').textContent = files.length > 1 ? files.length + ' 个文件待解析' : files[0].name;
    showStage('stageLoading');

    var entries = [];
    var t0 = performance.now();

    for (var i = 0; i < files.length; i++) {
      var f = files[i];
      try {
        var buf = await f.arrayBuffer();
        var parsed = await P.GvasParser.parseSave(new Uint8Array(buf));
        entries.push({
          name: f.name,
          path: f.webkitRelativePath || f.name,
          size: f.size,
          parsed: parsed,
          warningCount: (parsed.warnings || []).length
        });
      } catch (err) {
        entries.push({ name: f.name, path: f.webkitRelativePath || f.name, size: f.size, error: err.message });
      }
    }

    var elapsed = performance.now() - t0;
    var okIndex = entries.findIndex(function (e) { return !e.error; });

    if (okIndex < 0) {
      var reason = entries[0] && entries[0].error ? entries[0].error : '未知错误';
      showError(
        '没能解析这份存档',
        '文件：<code>' + escapeHtml(entries[0].name) + '</code><br><br>' + escapeHtml(reason) +
        '<br><br>常见原因：文件被 Steam 云同步占用、选了配置文件、或该版本使用了不支持的压缩方式。'
      );
      return;
    }

    state.entries = entries;
    state.active = okIndex;
    state.overrides = loadOverrides();
    state.parseMs = Math.round(elapsed);

    var minDelay = new Promise(function (r) { setTimeout(r, 380); });
    await minDelay;

    renderResult();
    showStage('stageResult');
    window.scrollTo({ top: 0, behavior: 'auto' });
  }

  /* ------------------------------------------------------------------ *
   * 渲染：结果
   * ------------------------------------------------------------------ */
  function current() {
    return state.entries[state.active];
  }

  function buildMetrics() {
    var entry = current();
    if (!entry || entry.error) return null;
    return P.Metrics.build(entry.parsed, state.overrides);
  }

  function difficultyText(raw) {
    if (!raw) return null;
    var key = String(raw).toLowerCase();
    return DIFFICULTY_CN[key] || P.Metrics.prettifyName(raw);
  }

  function bossName(b) {
    if (!b) return '未知';
    if (BOSS_DISPLAY[b.name]) return BOSS_DISPLAY[b.name];
    return b.name || b.rawName || '未知';
  }

  function renderResult() {
    var entry = current();
    var metrics = buildMetrics();
    if (!metrics) return;

    state.fields = metrics.fields;

    var view = JSON.parse(JSON.stringify(metrics.view));
    view.bosses = view.bosses.map(function (b) {
      return Object.assign({}, b, { display: bossName(b) });
    });
    view.worstBoss = view.bosses[0] && view.bosses[0].deaths ? view.bosses[0] : null;
    if (view.worstBoss) view.worstBoss = Object.assign({}, view.worstBoss, { name: view.worstBoss.display });
    view.collectibles = view.collectibles.map(function (c) {
      return Object.assign({}, c, { label: collectLabel(c.label) });
    });

    view.verdict = JSON.parse(JSON.stringify(metrics.view.verdict));
    if (view.worstBoss && metrics.view.worstBoss) {
      view.verdict.lines = view.verdict.lines.map(function (l) {
        return l.replace(metrics.view.worstBoss.name, view.worstBoss.name);
      });
    }
    state.view = view;

    // 顶部文件信息
    $('#fileName').textContent = entry.name;
    var bits = [fmtBytes(entry.size)];
    if (entry.parsed.compressed) bits.push('已解压');
    bits.push('UE ' + metrics.meta.engine);
    bits.push('解析 ' + (state.parseMs || 0) + 'ms');
    $('#fileMeta').textContent = bits.join(' · ');

    // 文件切换
    renderFileSwitch();

    // 主卡
    renderHero(view, metrics);

    // 指标
    renderStats(view, metrics);

    // Boss
    renderBosses(view);

    // 收集
    renderCollectibles(view);

    // 武器 / 道具
    renderChips('#weaponList', '#weaponEmpty', '#weaponNote', view.weapons, '件');
    renderChips('#itemList', '#itemEmpty', '#itemNote', view.items, '件');

    // 校准
    renderCalibrate(metrics);

    // 解析质量提示
    var notice = $('#parseNotice');
    var ratio = metrics.meta.consumedRatio;
    if (metrics.warnings.length > 4 || ratio < 0.92) {
      notice.hidden = false;
      $('#noticeText').innerHTML =
        '解析覆盖 <b>' + (ratio * 100).toFixed(1) + '%</b> 字节，' +
        (metrics.warnings.length ? '有 ' + metrics.warnings.length + ' 条提示' : '部分字段可能未识别') +
        '。可到「原始数据」核对，或用下方「字段校准」手动指定指标。';
    } else {
      notice.hidden = true;
    }

    // 原始数据
    $('#rawCount').textContent = metrics.fields.length ? '(' + metrics.fields.length + ')' : '';
    renderRaw();
    renderMeta(metrics);
  }

  function renderFileSwitch() {
    var box = $('#fileSwitch');
    if (state.entries.length <= 1) {
      box.hidden = true;
      return;
    }
    box.hidden = false;
    box.innerHTML = state.entries.map(function (e, i) {
      var cls = 'file-pill' + (i === state.active ? ' is-active' : '');
      var label = escapeHtml(e.name);
      var tail = e.error ? '<small>失败</small>' : '<small>' + fmtBytes(e.size) + '</small>';
      return '<button type="button" class="' + cls + '" data-index="' + i + '">' + label + tail + '</button>';
    }).join('');
  }

  function renderHero(view, metrics) {
    $('#playerName').textContent = view.playerName || '无名剑客';

    var diff = difficultyText(view.difficulty);
    var tagDiff = $('#tagDifficulty');
    if (diff) {
      tagDiff.hidden = false;
      tagDiff.textContent = diff;
    } else tagDiff.hidden = true;

    var tag66 = $('#tagSixtySix');
    tag66.hidden = !view.sixtySixMode;

    var tagNg = $('#tagNgPlus');
    tagNg.hidden = !view.newGamePlus;

    var region = view.region ? P.Metrics.prettifyName(String(view.region).replace(/^(Region|Area|Map)_/, '')) : '';
    $('#regionLine').textContent = region ? region : '存档解析完成 · ' + metrics.meta.className.replace('/Script/', '');

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
    var savedAt = metrics.found.saveTime ? toDate(metrics.found.saveTime.field.value) : null;
    if (savedAt) {
      saveLine.hidden = false;
      saveLine.textContent = '最后存档 · ' + fmtDate(savedAt);
    } else {
      saveLine.hidden = true;
    }

    var hours = view.playTimeSeconds != null ? Math.floor(view.playTimeSeconds / 3600) : null;
    var minutes = view.playTimeSeconds != null ? Math.floor((view.playTimeSeconds % 3600) / 60) : null;
    countUp($('#playTimeH'), hours);
    $('#playTimeM').textContent = minutes == null ? '—' : minutes;

    var ring = $('#ringFg');
    var pct = view.completion != null ? Math.max(0, Math.min(100, view.completion)) : 0;
    $('#completionVal').textContent = view.completion != null ? Math.round(view.completion) + '%' : '—';
    requestAnimationFrame(function () {
      ring.style.strokeDashoffset = String(327 * (1 - pct / 100));
    });

    var lines = view.verdict.lines.length ? view.verdict.lines : ['存档解析完成。'];
    $('#verdictLine').innerHTML = lines.map(function (l) {
      return '<span>' + escapeHtml(l) + '</span>';
    }).join('');
  }

  function renderStats(view, metrics) {
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
        accent: true,
        kind: 'int'
      },
      {
        label: 'Boss 击破',
        value: view.bossTotal ? view.bossDefeated : null,
        unit: view.bossTotal ? '/ ' + view.bossTotal : '',
        sub: view.worstBoss ? '最难关：' + view.worstBoss.name : (view.bossTotal ? '全部击破' : '未记录'),
        kind: 'int'
      },
      {
        label: '持有货币',
        value: view.currency,
        unit: '',
        sub: '存档内货币总量',
        kind: 'int',
        gold: true
      },
      {
        label: '当前天数',
        value: view.day,
        unit: view.dayLimit ? '/ ' + view.dayLimit + ' 天' : '天',
        sub: view.dayLimit && view.day != null ? '剩余 ' + Math.max(0, view.dayLimit - view.day) + ' 天' : '存档未记录',
        kind: 'int'
      },
      {
        label: '武器',
        value: view.weapons ? view.weapons.count : null,
        unit: '件',
        sub: view.edges ? '副武器 ' + view.edges.count + ' 件' : (view.weapons ? '已解锁主武器' : '存档未记录'),
        kind: 'int'
      },
      {
        label: '行囊',
        value: view.items ? view.items.count : null,
        unit: '种',
        sub: view.items && view.items.total ? '合计 ' + view.items.total + ' 件' : '物品条目数',
        kind: 'int'
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
      note.textContent = '未识别';
      return;
    }

    list.hidden = false;
    empty.hidden = true;
    note.textContent = view.bossDefeated + ' / ' + view.bossTotal + ' 已击破';

    var max = view.bosses[0].deaths || 1;
    var shown = view.bosses.slice(0, 10);

    list.innerHTML = shown.map(function (b, i) {
      var ratio = Math.max(2, ((b.deaths || 0) / max) * 100);
      var badge = b.defeated === true
        ? '<span class="cleared">已击破</span>'
        : b.defeated === false
          ? '<span class="uncleared">未击破</span>'
          : '';
      var meta = [];
      if (b.attempts != null) meta.push('挑战 ' + b.attempts + ' 次');
      if (b.timeSeconds != null) meta.push('耗时 ' + duration(b.timeSeconds));
      return '' +
        '<div class="boss-row' + (i === 0 ? ' is-top' : '') + '">' +
        '<span class="boss-rank">' + String(i + 1).padStart(2, '0') + '</span>' +
        '<div class="boss-main">' +
        '<div class="boss-line">' +
        '<span class="boss-name" title="' + escapeHtml(b.rawName) + '">' + escapeHtml(b.display) + badge + '</span>' +
        '<span class="boss-deaths">' + (b.deaths != null ? b.deaths : '—') + '<small>次</small></span>' +
        '</div>' +
        '<div class="boss-bar"><i data-w="' + ratio + '"></i></div>' +
        (meta.length ? '<div class="boss-meta">' + meta.map(function (m) { return '<span>' + escapeHtml(m) + '</span>'; }).join('') + '</div>' : '') +
        '</div>' +
        '</div>';
    }).join('');

    setTimeout(function () {
      Array.prototype.forEach.call(list.querySelectorAll('.boss-bar i'), function (bar) {
        bar.style.width = bar.getAttribute('data-w') + '%';
      });
    }, 60);
  }

  function renderCollectibles(view) {
    var list = $('#collectList');
    var empty = $('#collectEmpty');
    var note = $('#collectNote');

    if (!view.collectibles.length) {
      list.innerHTML = '';
      list.hidden = true;
      empty.hidden = false;
      note.textContent = '未识别';
      return;
    }

    list.hidden = false;
    empty.hidden = true;

    var done = view.collectibles.filter(function (c) {
      return c.total && c.value != null && c.value >= c.total;
    }).length;
    note.textContent = done + ' / ' + view.collectibles.length + ' 已集满';

    list.innerHTML = view.collectibles.map(function (c) {
      var pct = c.percent == null ? 0 : c.percent;
      return '' +
        '<div class="collect-item">' +
        '<div class="collect-top">' +
        '<span class="collect-name">' + escapeHtml(collectLabel(c.label)) + '</span>' +
        '<span class="collect-val">' + (c.value != null ? c.value : '—') +
        (c.total ? '<small>/ ' + c.total + '</small>' : '') + '</span>' +
        '</div>' +
        '<div class="collect-bar"><i data-w="' + pct + '"></i></div>' +
        '</div>';
    }).join('');

    setTimeout(function () {
      Array.prototype.forEach.call(list.querySelectorAll('.collect-bar i'), function (bar) {
        bar.style.width = bar.getAttribute('data-w') + '%';
      });
    }, 60);
  }

  function renderChips(listSel, emptySel, noteSel, data, unit) {
    var el = $(listSel);
    var empty = $(emptySel);
    var note = $(noteSel);

    if (!data || !data.items.length) {
      el.innerHTML = '';
      el.hidden = true;
      empty.hidden = false;
      note.textContent = '未识别';
      return;
    }

    el.hidden = false;
    empty.hidden = true;
    note.textContent = data.items.length + ' ' + unit;

    el.innerHTML = data.items.slice(0, 48).map(function (item) {
      var count = item.count != null ? '<span class="n">×' + item.count + '</span>' : '';
      return '<span class="chip" title="' + escapeHtml(item.raw) + '">' + escapeHtml(item.name) + count + '</span>';
    }).join('') + (data.items.length > 48
      ? '<span class="chip">… 另有 ' + (data.items.length - 48) + ' 项</span>'
      : '');
  }

  function renderCalibrate(metrics) {
    var grid = $('#calibrateGrid');
    var numeric = metrics.fields.filter(function (f) {
      return typeof f.value === 'number' && isFinite(f.value);
    });

    grid.innerHTML = BINDABLE.map(function (item) {
      var rule = P.Metrics.RULES[item.key];
      var currentPath = metrics.found[item.key] ? metrics.found[item.key].field.path : '';

      var candidates = numeric.slice();
      candidates.sort(function (a, b) {
        return relevance(b, rule) - relevance(a, rule);
      });
      candidates = candidates.slice(0, 60);

      var hasCurrent = candidates.some(function (c) { return c.path === currentPath; });
      if (currentPath && !hasCurrent) {
        var hit = metrics.fields.filter(function (f) { return f.path === currentPath; })[0];
        candidates.unshift(hit || { path: currentPath, value: '' });
      }

      var options = ['<option value="">自动识别</option>'].concat(candidates.map(function (c) {
        var sel = c.path === currentPath ? ' selected' : '';
        var text = c.path.length > 42 ? '…' + c.path.slice(-41) : c.path;
        return '<option value="' + escapeHtml(c.path) + '"' + sel + ' title="' + escapeHtml(c.path) + '">' +
          escapeHtml(text) + '</option>';
      })).join('');

      return '' +
        '<div class="calib-row">' +
        '<label>' + item.label + '</label>' +
        '<select data-bind-key="' + item.key + '">' + options + '</select>' +
        '</div>';
    }).join('');
  }

  function relevance(field, rule) {
    if (!rule) return 0;
    var score = Math.max(0, 6 - field.depth) * 2;
    for (var i = 0; i < rule.include.length; i++) {
      if (rule.include[i].test(field.key)) score += 12;
    }
    return score;
  }

  /* ------------------------------------------------------------------ *
   * 渲染：原始数据
   * ------------------------------------------------------------------ */
  function keyToText(k) {
    if (k == null) return '';
    if (typeof k === 'string') return k;
    if (typeof k === 'number') return String(k);
    if (typeof k === 'object') {
      if (k.__children && k.__children.length) {
        var f = k.__children[0];
        return String(f.value != null ? f.value : f.name);
      }
      return '[结构]';
    }
    return String(k);
  }

  function childNodes(node) {
    var v = node.value;
    if (!v || !v.__children) return null;
    if (v.__map) {
      return v.__children.map(function (e) {
        return {
          name: '[' + keyToText(e.key) + ']',
          type: 'Entry',
          value: e.value,
          mapKey: keyToText(e.key)
        };
      });
    }
    return v.__children;
  }

  function isScalar(v) {
    return v == null || typeof v !== 'object';
  }

  function valueText(node) {
    var v = node.value;
    if (v && typeof v === 'object' && !v.__children) {
      if (v.hex) return '0x' + v.hex;
      return '[原始数据]';
    }
    if (v == null) return 'null';
    if (typeof v === 'boolean') return v ? 'true' : 'false';
    if (typeof v === 'number') return fmtNum(v);
    if (Array.isArray(v)) return v.map(function (n) { return fmtNum(n); }).join(', ');
    return String(v);
  }

  function buildTree(nodes, depth, parentPath, out) {
    var limit = Math.min(nodes.length, MAX_TREE_CHILDREN);

    for (var i = 0; i < limit; i++) {
      var node = nodes[i];
      if (!node) continue;
      var name = node.name || String(i);
      var path = parentPath ? parentPath + '.' + name : name;
      var children = childNodes(node);
      var hasChildren = !!(children && children.length);

      var valueCls = '';
      if (isScalar(node.value)) {
        if (typeof node.value === 'string') valueCls = ' is-str';
        else if (typeof node.value === 'boolean') valueCls = ' is-bool';
        else if (node.value == null) valueCls = ' is-null';
      }

      var row = document.createElement('div');
      row.className = 'tree-row' + (hasChildren && depth < 1 ? ' is-open' : '');
      row.style.paddingLeft = depth * 15 + 6 + 'px';
      row.dataset.path = path;
      row.innerHTML =
        '<span class="tree-caret' + (hasChildren ? '' : ' leaf') + '">▶</span>' +
        '<span class="tree-name">' + escapeHtml(name) + '</span>' +
        '<span class="tree-type">' + escapeHtml(String(node.type || '').replace('Property', '')) + '</span>' +
        (hasChildren
          ? '<span class="tree-val is-null">' + children.length + ' 项</span>'
          : '<span class="tree-val' + valueCls + '">' + escapeHtml(valueText(node)) + '</span>') +
        (isScalar(node.value) && typeof node.value === 'number'
          ? '<button type="button" class="tree-bind" data-bind="' + escapeHtml(path) + '">绑定…</button>'
          : '');

      out.appendChild(row);

      if (hasChildren) {
        var wrap = document.createElement('div');
        wrap.className = 'tree-children';
        if (depth < 1) wrap.classList.add('is-open');
        out.appendChild(wrap);
        buildTree(children, depth + 1, path, wrap);

        if (children.length > MAX_TREE_CHILDREN) {
          var more = document.createElement('div');
          more.className = 'tree-row';
          more.style.paddingLeft = (depth + 1) * 15 + 6 + 'px';
          more.innerHTML = '<span class="tree-caret leaf"></span><span class="tree-val is-null">… 省略 ' +
            (children.length - MAX_TREE_CHILDREN) + ' 项</span>';
          wrap.appendChild(more);
        }
      }
    }

    if (nodes.length > MAX_TREE_CHILDREN) {
      var more2 = document.createElement('div');
      more2.className = 'tree-row';
      more2.style.paddingLeft = depth * 15 + 6 + 'px';
      more2.innerHTML = '<span class="tree-caret leaf"></span><span class="tree-val is-null">… 省略 ' +
        (nodes.length - MAX_TREE_CHILDREN) + ' 项</span>';
      out.appendChild(more2);
    }
  }

  function renderRaw() {
    var wrap = $('#rawTree');
    var search = state.search.trim();
    var entry = current();
    if (!entry || entry.error) return;

    var rootChildren = entry.parsed.root;

    if (search) {
      var fields = state.fields.filter(function (f) {
        return f.path.toLowerCase().indexOf(search.toLowerCase()) >= 0;
      });
      $('#rawStat').textContent = fields.length + ' 条匹配';
      wrap.innerHTML = '';

      if (!fields.length) {
        wrap.innerHTML = '<div class="tree-row"><span class="tree-caret leaf"></span><span class="tree-val is-null">没有匹配的字段</span></div>';
        return;
      }

      fields.slice(0, 300).forEach(function (f) {
        var row = document.createElement('div');
        row.className = 'tree-row';
        row.dataset.path = f.path;
        var valText = typeof f.value === 'string' ? f.value : (typeof f.value === 'boolean' ? String(f.value) : fmtNum(f.value));
        var cls = typeof f.value === 'string' ? ' is-str' : typeof f.value === 'boolean' ? ' is-bool' : '';
        row.innerHTML =
          '<span class="tree-caret leaf"></span>' +
          '<span class="tree-name">' + highlight(f.path, search) + '</span>' +
          '<span class="tree-val' + cls + '">' + escapeHtml(valText) + '</span>' +
          (typeof f.value === 'number'
            ? '<button type="button" class="tree-bind" data-bind="' + escapeHtml(f.path) + '">绑定…</button>'
            : '');
        wrap.appendChild(row);
      });

      if (fields.length > 300) {
        var more = document.createElement('div');
        more.className = 'tree-row';
        more.innerHTML = '<span class="tree-caret leaf"></span><span class="tree-val is-null">… 还有 ' + (fields.length - 300) + ' 条</span>';
        wrap.appendChild(more);
      }
      return;
    }

    $('#rawStat').textContent = state.fields.length + ' 个字段';
    wrap.innerHTML = '';
    buildTree(rootChildren, 0, '', wrap);
  }

  function highlight(text, q) {
    var idx = text.toLowerCase().indexOf(q.toLowerCase());
    if (idx < 0) return escapeHtml(text);
    return escapeHtml(text.slice(0, idx)) +
      '<mark>' + escapeHtml(text.slice(idx, idx + q.length)) + '</mark>' +
      escapeHtml(text.slice(idx + q.length));
  }

  function renderMeta(metrics) {
    var h = metrics.header;
    var rows = [
      ['存档类', metrics.meta.className || '—'],
      ['GVAS 版本', String(h.saveGameVersion)],
      ['引擎版本', metrics.meta.engine + (h.engineVersion
        ? '.' + h.engineVersion.patch + (h.engineVersion.branch ? ' · ' + h.engineVersion.branch : '')
        : '')],
      ['压缩', metrics.meta.compressed ? '是（已解压）' : '否'],
      ['文件大小', fmtBytes(metrics.meta.size)],
      ['解析字段', metrics.meta.parsedLeaves + ' 个叶子节点'],
      ['字节覆盖率', (metrics.meta.consumedRatio * 100).toFixed(1) + '%'],
      ['自定义版本', (h.customVersions || []).map(function (v) {
        return (v.name || v.guid.slice(0, 8)) + '=' + v.version;
      }).join(', ') || '—']
    ];

    $('#metaList').innerHTML = rows.map(function (r) {
      return '<dt>' + escapeHtml(r[0]) + '</dt><dd>' + escapeHtml(r[1]) + '</dd>';
    }).join('');

    var warn = $('#warnBox');
    if (metrics.warnings && metrics.warnings.length) {
      warn.hidden = false;
      warn.innerHTML = '<b>解析提示（' + metrics.warnings.length + '）</b><br>' +
        metrics.warnings.slice(0, 30).map(function (w) { return escapeHtml(w); }).join('<br>');
    } else {
      warn.hidden = true;
    }
  }

  /* ------------------------------------------------------------------ *
   * 交互：绑定
   * ------------------------------------------------------------------ */
  function beginBind(btn, path) {
    var sel = document.createElement('select');
    sel.className = 'tree-bind-select';
    sel.innerHTML = '<option value="">绑定到…</option>' + BINDABLE.map(function (b) {
      var bound = state.overrides[b.key] === path ? ' selected' : '';
      return '<option value="' + b.key + '"' + bound + '>' + b.label + '</option>';
    }).join('');

    btn.style.display = 'none';
    btn.parentNode.insertBefore(sel, btn.nextSibling);
    sel.focus();

    function cleanup() {
      sel.remove();
      btn.style.display = '';
    }

    sel.addEventListener('change', function () {
      var key = sel.value;
      if (key) {
        state.overrides[key] = path;
        saveOverrides();
        document.dispatchEvent(new CustomEvent('pbz:refresh'));
      }
      cleanup();
    });

    sel.addEventListener('blur', function () {
      setTimeout(cleanup, 120);
    });
  }

  /* ------------------------------------------------------------------ *
   * 导出
   * ------------------------------------------------------------------ */
  function exportJson() {
    var metrics = buildMetrics();
    if (!metrics) return;
    var found = {};
    Object.keys(metrics.found).forEach(function (k) {
      if (metrics.found[k]) {
        found[k] = { path: metrics.found[k].field.path, value: metrics.found[k].field.value };
      }
    });
    var payload = {
      tool: 'pbz-save-inspector',
      generatedAt: new Date().toISOString(),
      meta: metrics.meta,
      view: metrics.view,
      foundFields: found,
      warnings: metrics.warnings
    };
    var blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = 'pbz-save-' + new Date().toISOString().slice(0, 10) + '.json';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(function () { URL.revokeObjectURL(url); }, 3000);
  }

  async function exportCard() {
    if (!state.view) return;
    var btn = $('#btnShare');
    var old = btn.innerHTML;
    btn.disabled = true;
    btn.textContent = '生成中…';
    try {
      var d = new Date();
      var dateText = d.getFullYear() + '.' +
        String(d.getMonth() + 1).padStart(2, '0') + '.' +
        String(d.getDate()).padStart(2, '0');
      var canvas = P.ShareCard.draw(state.view, { dateText: dateText });
      var ok = await P.ShareCard.download(canvas, '影之刃零存档战绩_' + dateText + '.png');
      if (!ok) throw new Error('图片生成失败');
    } catch (err) {
      alert('生成图片失败：' + err.message);
    } finally {
      btn.disabled = false;
      btn.innerHTML = old;
    }
  }

  /* ------------------------------------------------------------------ *
   * 事件
   * ------------------------------------------------------------------ */
  function init() {
    state.overrides = loadOverrides();

    var dropzone = $('#dropzone');
    var fileInput = $('#fileInput');
    var dirInput = $('#dirInput');

    function pick(input) {
      input.value = '';
      input.click();
    }

    dropzone.addEventListener('click', function (e) {
      if (e.target.closest('button')) return;
      pick(fileInput);
    });

    dropzone.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        pick(fileInput);
      }
    });

    $('#btnPickFile').addEventListener('click', function (e) {
      e.stopPropagation();
      pick(fileInput);
    });

    $('#btnPickDir').addEventListener('click', function (e) {
      e.stopPropagation();
      pick(dirInput);
    });

    fileInput.addEventListener('change', function () {
      if (fileInput.files.length) handleFileList(fileInput.files);
    });

    dirInput.addEventListener('change', function () {
      if (dirInput.files.length) handleFileList(dirInput.files);
    });

    var dragDepth = 0;
    dropzone.addEventListener('dragenter', function (e) {
      e.preventDefault();
      dragDepth++;
      dropzone.classList.add('is-drag');
    });
    dropzone.addEventListener('dragover', function (e) {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'copy';
    });
    dropzone.addEventListener('dragleave', function (e) {
      e.preventDefault();
      dragDepth = Math.max(0, dragDepth - 1);
      if (!dragDepth) dropzone.classList.remove('is-drag');
    });
    dropzone.addEventListener('drop', async function (e) {
      e.preventDefault();
      dragDepth = 0;
      dropzone.classList.remove('is-drag');
      var files = await filesFromDrop(e.dataTransfer);
      if (files.length) handleFileList(files);
    });

    // 整页拖拽兜底
    window.addEventListener('dragover', function (e) { e.preventDefault(); });
    window.addEventListener('drop', function (e) {
      if (e.target.closest && e.target.closest('#dropzone')) return;
      e.preventDefault();
      filesFromDrop(e.dataTransfer).then(function (files) {
        if (files.length) handleFileList(files);
      });
    });

    $('#btnSample').addEventListener('click', function () {
      var bytes = P.SampleSave.decode();
      var file = new File([bytes], 'PBZSaveGame.sav', { type: 'application/octet-stream' });
      handleFileList([file]);
    });

    $('#btnAgain').addEventListener('click', function () {
      state.entries = [];
      state.fields = [];
      state.search = '';
      $('#rawSearch').value = '';
      showStage('stageUpload');
      window.scrollTo({ top: 0, behavior: 'smooth' });
    });

    $('#btnErrBack').addEventListener('click', function () {
      showStage('stageUpload');
    });

    $('#btnExport').addEventListener('click', exportJson);
    $('#btnShare').addEventListener('click', exportCard);

    $('#btnResetCalib').addEventListener('click', function () {
      state.overrides = {};
      saveOverrides();
      renderResult();
    });

    // tab
    Array.prototype.forEach.call(document.querySelectorAll('.tab'), function (tab) {
      tab.addEventListener('click', function () {
        var name = tab.dataset.tab;
        state.tab = name;
        Array.prototype.forEach.call(document.querySelectorAll('.tab'), function (t) {
          t.classList.toggle('is-active', t === tab);
        });
        $('#panelOverview').hidden = name !== 'overview';
        $('#panelRaw').hidden = name !== 'raw';
      });
    });

    // 树：展开 / 折叠 & 绑定
    $('#rawTree').addEventListener('click', function (e) {
      var bindBtn = e.target.closest('.tree-bind');
      if (bindBtn) {
        e.stopPropagation();
        beginBind(bindBtn, bindBtn.getAttribute('data-bind'));
        return;
      }

      var row = e.target.closest('.tree-row');
      if (!row) return;
      var children = row.nextElementSibling;
      if (children && children.classList.contains('tree-children')) {
        children.classList.toggle('is-open');
        row.classList.toggle('is-open', children.classList.contains('is-open'));
      }
    });

    // 搜索
    var searchTimer = null;
    $('#rawSearch').addEventListener('input', function (e) {
      clearTimeout(searchTimer);
      var v = e.target.value;
      searchTimer = setTimeout(function () {
        state.search = v;
        renderRaw();
      }, 160);
    });

    // 校准
    $('#calibrateGrid').addEventListener('change', function (e) {
      var sel = e.target.closest('select[data-bind-key]');
      if (!sel) return;
      var key = sel.getAttribute('data-bind-key');
      if (sel.value) state.overrides[key] = sel.value;
      else delete state.overrides[key];
      saveOverrides();
      renderResult();
    });

    // 文件切换
    $('#fileSwitch').addEventListener('click', function (e) {
      var pill = e.target.closest('.file-pill');
      if (!pill) return;
      var idx = Number(pill.getAttribute('data-index'));
      var entry = state.entries[idx];
      if (entry.error) {
        showError('这个文件解析失败', escapeHtml(entry.name) + '：' + escapeHtml(entry.error));
        return;
      }
      state.active = idx;
      state.search = '';
      $('#rawSearch').value = '';
      renderResult();
    });

    document.addEventListener('pbz:refresh', function () {
      renderResult();
    });

    // 暴露只读接口，便于调试 / 二次开发
    window.PBZApp = {
      getView: function () { return state.view; },
      getMetrics: function () { return buildMetrics(); },
      getFields: function () { return state.fields; },
      setOverride: function (key, path) {
        state.overrides[key] = path;
        saveOverrides();
        renderResult();
      }
    };

    // 说明弹层
    var modal = $('#guideModal');
    $('#btnGuide').addEventListener('click', function () { modal.hidden = false; });
    modal.addEventListener('click', function (e) {
      if (e.target.closest('[data-close]')) modal.hidden = true;
    });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') modal.hidden = true;
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
