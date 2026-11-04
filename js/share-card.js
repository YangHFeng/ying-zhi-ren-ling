/**
 * share-card.js — 生成可分享的战绩长图（Canvas 2D → PNG）
 */
(function (global) {
  'use strict';

  var W = 1080;
  var H = 1440;
  var PAD = 76;

  var C = {
    bg: '#0a0a0c',
    line: 'rgba(255,255,255,0.09)',
    text: '#ece9e4',
    dim: '#8a8783',
    faint: '#5d5a56',
    red: '#e8503f',
    redDeep: '#b8302c',
    gold: '#d3b078',
    green: '#7fae8a'
  };

  var SERIF = '"Songti SC", "STSong", "Source Han Serif SC", "Noto Serif SC", "SimSun", Georgia, serif';
  var SANS = '-apple-system, "Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif';
  var MONO = '"SFMono-Regular", "JetBrains Mono", Consolas, monospace';

  function withSpacing(ctx, text, x, y, spacing, align) {
    var chars = Array.from(String(text));
    var widths = [];
    var total = 0;
    for (var i = 0; i < chars.length; i++) {
      var w = ctx.measureText(chars[i]).width;
      widths.push(w);
      total += w + spacing;
    }
    total -= spacing;
    var start = align === 'center' ? x - total / 2 : align === 'right' ? x - total : x;
    var prev = ctx.textAlign;
    ctx.textAlign = 'left';
    for (var j = 0; j < chars.length; j++) {
      ctx.fillText(chars[j], start, y);
      start += widths[j] + spacing;
    }
    ctx.textAlign = prev;
    return total;
  }

  function line(ctx, x1, y1, x2, y2, color) {
    ctx.save();
    ctx.strokeStyle = color || C.line;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.stroke();
    ctx.restore();
  }

  function fmtInt(n) {
    if (n == null || !isFinite(n)) return '—';
    return Math.round(n).toLocaleString('en-US');
  }

  function drawNoise(ctx) {
    ctx.save();
    ctx.fillStyle = 'rgba(255,255,255,0.025)';
    for (var i = 0; i < 2600; i++) {
      var x = Math.random() * W;
      var y = Math.random() * H;
      ctx.fillRect(x, y, 1, 1);
    }
    ctx.restore();
  }

  function draw(view, opts) {
    opts = opts || {};
    var canvas = document.createElement('canvas');
    canvas.width = W;
    canvas.height = H;
    var ctx = canvas.getContext('2d');

    /* 背景 */
    ctx.fillStyle = C.bg;
    ctx.fillRect(0, 0, W, H);

    var glow = ctx.createRadialGradient(W * 0.5, -260, 0, W * 0.5, -260, 980);
    glow.addColorStop(0, 'rgba(205,52,48,0.30)');
    glow.addColorStop(0.55, 'rgba(205,52,48,0.07)');
    glow.addColorStop(1, 'rgba(205,52,48,0)');
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, W, 760);

    var glow2 = ctx.createRadialGradient(W * 0.94, H * 0.12, 0, W * 0.94, H * 0.12, 520);
    glow2.addColorStop(0, 'rgba(211,176,120,0.10)');
    glow2.addColorStop(1, 'rgba(211,176,120,0)');
    ctx.fillStyle = glow2;
    ctx.fillRect(0, 0, W, H);

    drawNoise(ctx);

    /* 页眉 */
    ctx.fillStyle = C.faint;
    ctx.font = '500 13px ' + SANS;
    withSpacing(ctx, 'PHANTOM BLADE ZERO', PAD, 88, 6);
    ctx.textAlign = 'right';
    ctx.fillStyle = C.red;
    ctx.font = '500 13px ' + SANS;
    withSpacing(ctx, '本地解析 · 未上传', W - PAD, 88, 2, 'right');
    ctx.textAlign = 'left';

    line(ctx, PAD, 116, W - PAD, 116, 'rgba(255,255,255,0.08)');

    /* 标题 */
    var y = 186;
    ctx.fillStyle = C.red;
    ctx.fillRect(PAD, y - 34, 3, 40);
    ctx.fillStyle = C.text;
    ctx.font = '600 42px ' + SERIF;
    ctx.fillText('存档战绩', PAD + 20, y);

    ctx.fillStyle = C.faint;
    ctx.font = '400 14px ' + SANS;
    ctx.textAlign = 'right';
    ctx.fillText(opts.dateText || '', W - PAD, y - 6);
    ctx.textAlign = 'left';

    /* 角色信息 */
    y = 258;
    ctx.fillStyle = C.text;
    ctx.font = '600 34px ' + SERIF;
    var name = view.playerName || '无名剑客';
    ctx.fillText(name, PAD, y);

    var nameW = ctx.measureText(name).width;
    var tagX = PAD + nameW + 16;
    var tags = [];
    if (view.difficulty) tags.push(String(view.difficulty).toUpperCase());
    if (view.sixtySixMode) tags.push('六十六天');
    if (view.newGamePlus) tags.push('二周目');
    ctx.font = '500 12px ' + SANS;
    for (var t = 0; t < tags.length; t++) {
      var label = tags[t];
      var tw = ctx.measureText(label).width + 20;
      ctx.strokeStyle = 'rgba(255,255,255,0.16)';
      ctx.lineWidth = 1;
      ctx.strokeRect(tagX, y - 22, tw, 28);
      ctx.fillStyle = C.dim;
      ctx.fillText(label, tagX + 10, y - 2);
      tagX += tw + 10;
    }

    /* 时长主视觉 */
    y = 356;
    ctx.fillStyle = C.faint;
    ctx.font = '500 13px ' + SANS;
    withSpacing(ctx, '游玩时长', PAD, y, 5);

    var totalSeconds = view.playTimeSeconds;
    var hours = totalSeconds != null ? Math.floor(totalSeconds / 3600) : null;
    var minutes = totalSeconds != null ? Math.floor((totalSeconds % 3600) / 60) : null;

    ctx.fillStyle = C.text;
    ctx.font = '600 148px ' + SERIF;
    var mainText = hours == null ? '—' : String(hours);
    ctx.fillText(mainText, PAD - 6, y + 148);
    var mainW = ctx.measureText(mainText).width;

    ctx.font = '400 26px ' + SANS;
    ctx.fillStyle = C.dim;
    var hoursW = ctx.measureText('小时').width;
    ctx.fillText('小时', PAD + mainW + 14, y + 136);

    if (minutes != null) {
      var minText = String(minutes);
      var minX = PAD + mainW + 14 + hoursW + 20;
      ctx.font = '600 64px ' + SERIF;
      ctx.fillStyle = C.dim;
      ctx.fillText(minText, minX, y + 148);
      var minW = ctx.measureText(minText).width;
      ctx.font = '400 22px ' + SANS;
      ctx.fillStyle = C.faint;
      ctx.fillText('分', minX + minW + 9, y + 147);
    }

    /* 右上：完成度环 */
    var ringCx = W - PAD - 66;
    var ringCy = 400;
    var ringR = 62;
    ctx.strokeStyle = 'rgba(255,255,255,0.08)';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(ringCx, ringCy, ringR, 0, Math.PI * 2);
    ctx.stroke();

    if (view.completion != null) {
      var pct = Math.max(0, Math.min(100, view.completion)) / 100;
      ctx.strokeStyle = C.red;
      ctx.lineWidth = 3;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.arc(ringCx, ringCy, ringR, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * pct);
      ctx.stroke();
      ctx.lineCap = 'butt';
    }
    ctx.textAlign = 'center';
    ctx.fillStyle = C.text;
    ctx.font = '600 30px ' + SERIF;
    ctx.fillText(view.completion != null ? Math.round(view.completion) + '%' : '—', ringCx, ringCy + 2);
    ctx.fillStyle = C.faint;
    ctx.font = '400 11px ' + SANS;
    withSpacing(ctx, '完成度', ringCx, ringCy + 24, 2, 'center');
    ctx.textAlign = 'left';

    line(ctx, PAD, 566, W - PAD, 566, 'rgba(255,255,255,0.08)');

    /* 四宫格 */
    var stats = [
      { label: '死亡次数', value: fmtInt(view.deathCount), unit: '次', accent: false },
      { label: 'Boss 击破', value: view.bossTotal ? view.bossDefeated + '/' + view.bossTotal : '—', unit: '', accent: true },
      { label: '持有货币', value: fmtInt(view.currency), unit: '', accent: false },
      { label: '当前天数', value: view.day != null ? String(view.day) : '—', unit: view.dayLimit ? '/ ' + view.dayLimit : '天', accent: false }
    ];

    var cellW = (W - PAD * 2) / 4;
    for (var i = 0; i < stats.length; i++) {
      var cx = PAD + cellW * i;
      if (i > 0) line(ctx, cx - 1, 610, cx - 1, 700, 'rgba(255,255,255,0.06)');
      ctx.fillStyle = C.faint;
      ctx.font = '500 11px ' + SANS;
      withSpacing(ctx, stats[i].label, cx + 18, 622, 3);
      ctx.fillStyle = stats[i].accent ? C.red : C.text;
      ctx.font = '600 42px ' + SERIF;
      ctx.fillText(stats[i].value, cx + 16, 676);
      if (stats[i].unit) {
        var vw = ctx.measureText(stats[i].value).width;
        ctx.fillStyle = C.faint;
        ctx.font = '400 12px ' + SANS;
        ctx.fillText(stats[i].unit, cx + 20 + vw, 674);
      }
    }

    line(ctx, PAD, 736, W - PAD, 736, 'rgba(255,255,255,0.08)');

    /* Boss 榜 */
    y = 796;
    ctx.fillStyle = C.text;
    ctx.font = '600 22px ' + SERIF;
    ctx.fillText('Boss 战死亡榜', PAD, y);

    ctx.textAlign = 'right';
    ctx.fillStyle = C.faint;
    ctx.font = '400 12px ' + MONO;
    ctx.fillText(view.bossTotal ? view.bossDefeated + ' / ' + view.bossTotal + ' 已击破' : '', W - PAD, y);
    ctx.textAlign = 'left';

    var bosses = (view.bosses || []).slice(0, 5);
    var maxDeaths = 1;
    for (var b = 0; b < bosses.length; b++) {
      maxDeaths = Math.max(maxDeaths, bosses[b].deaths || 0);
    }

    var rowY = 846;
    for (var k = 0; k < bosses.length; k++) {
      var boss = bosses[k];
      var isTop = k === 0;

      ctx.fillStyle = isTop ? C.red : C.faint;
      ctx.font = '500 12px ' + MONO;
      ctx.fillText(String(k + 1).padStart(2, '0'), PAD, rowY + 14);

      var bx = PAD + 38;
      var bw = W - PAD - bx - 96;

      ctx.fillStyle = C.text;
      ctx.font = '500 20px ' + SANS;
      var nm = boss.display || boss.name || boss.rawName || '未知';
      if (ctx.measureText(nm).width > bw - 60) {
        while (ctx.measureText(nm + '…').width > bw - 60 && nm.length > 2) nm = nm.slice(0, -1);
        nm += '…';
      }
      var nmW = ctx.measureText(nm).width;
      ctx.fillText(nm, bx, rowY + 12);

      if (boss.defeated === true) {
        ctx.fillStyle = C.green;
        ctx.font = '400 11px ' + SANS;
        ctx.fillText('已击破', bx + nmW + 10, rowY + 11);
      }

      ctx.fillStyle = 'rgba(255,255,255,0.06)';
      ctx.fillRect(bx, rowY + 24, bw, 3);
      var ratio = (boss.deaths || 0) / maxDeaths;
      var grad = ctx.createLinearGradient(bx, 0, bx + bw, 0);
      grad.addColorStop(0, 'rgba(205,52,48,0.5)');
      grad.addColorStop(1, isTop ? '#ff7a63' : C.red);
      ctx.fillStyle = grad;
      ctx.fillRect(bx, rowY + 24, Math.max(2, bw * ratio), 3);

      ctx.textAlign = 'right';
      ctx.fillStyle = C.text;
      ctx.font = '600 26px ' + SERIF;
      ctx.fillText(boss.deaths != null ? String(boss.deaths) : '—', W - PAD - 26, rowY + 20);
      ctx.fillStyle = C.faint;
      ctx.font = '400 11px ' + SANS;
      ctx.fillText('次', W - PAD, rowY + 19);
      ctx.textAlign = 'left';

      rowY += 62;
    }

    if (!bosses.length) {
      ctx.fillStyle = C.faint;
      ctx.font = '400 15px ' + SANS;
      ctx.fillText('未在本存档中找到 Boss 战斗记录', PAD, rowY + 10);
      rowY += 44;
    }

    /* 收集进度 */
    var colY = Math.max(rowY + 30, 1128);
    if (view.collectibles && view.collectibles.length && colY < H - 190) {
      line(ctx, PAD, colY - 24, W - PAD, colY - 24, 'rgba(255,255,255,0.08)');
      var cols = view.collectibles.slice(0, 3);
      var cw = (W - PAD * 2) / Math.max(cols.length, 1);

      for (var c2 = 0; c2 < cols.length; c2++) {
        var col = cols[c2];
        var cx2 = PAD + cw * c2;
        ctx.fillStyle = C.dim;
        ctx.font = '400 12px ' + SANS;
        withSpacing(ctx, String(col.label), cx2 + 12, colY + 8, 3);

        ctx.fillStyle = C.gold;
        ctx.font = '600 26px ' + SERIF;
        ctx.fillText(String(col.value != null ? col.value : '—'), cx2 + 12, colY + 42);
        var vw2 = ctx.measureText(String(col.value != null ? col.value : '—')).width;
        if (col.total) {
          ctx.fillStyle = C.faint;
          ctx.font = '400 13px ' + SANS;
          ctx.fillText('/ ' + col.total, cx2 + 18 + vw2, colY + 40);
        }

        ctx.fillStyle = 'rgba(255,255,255,0.06)';
        ctx.fillRect(cx2 + 12, colY + 54, cw - 40, 2);
        if (col.percent != null) {
          ctx.fillStyle = C.gold;
          ctx.fillRect(cx2 + 12, colY + 54, Math.max(2, (cw - 40) * (col.percent / 100)), 2);
        }
      }
    }

    /* 页脚 */
    line(ctx, PAD, H - 116, W - PAD, H - 116, 'rgba(255,255,255,0.08)');

    ctx.fillStyle = C.faint;
    ctx.font = '400 12px ' + SANS;
    ctx.fillText('影之刃零 · 存档解析', PAD, H - 78);

    ctx.textAlign = 'right';
    ctx.fillStyle = '#4a4744';
    ctx.font = '400 11px ' + MONO;
    ctx.fillText('parsed locally in browser', W - PAD, H - 78);
    ctx.textAlign = 'left';

    return canvas;
  }

  function download(canvas, filename) {
    return new Promise(function (resolve) {
      canvas.toBlob(function (blob) {
        if (!blob) return resolve(false);
        var url = URL.createObjectURL(blob);
        var a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        setTimeout(function () { URL.revokeObjectURL(url); }, 4000);
        resolve(true);
      }, 'image/png');
    });
  }

  global.PBZ = global.PBZ || {};
  global.PBZ.ShareCard = { draw: draw, download: download, width: W, height: H };
})(typeof window !== 'undefined' ? window : globalThis);
