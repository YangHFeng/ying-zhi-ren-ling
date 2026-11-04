#!/usr/bin/env python3
"""
tools/fetch-boss-atlas.py — 重新生成 BOSS 图鉴数据

数据来源：游民星空《影之刃零》图鉴（BOSS 分类）
  https://m.gamersky.com/tools/game-wiki/wiki/16?category=1793009175006

抓取内容：首领中文名、所属区域、游戏内部蓝图名（BP_Monster_xxx）、立绘。
产出：
  js/boss-atlas.js       图鉴数据（前端匹配用）
  assets/bosses/*.png    立绘，按图鉴编号命名

立绘版权归 S-GAME 所有，此处仅用于非商业的玩家工具展示。

用法：python tools/fetch-boss-atlas.py
"""

import json
import os
import subprocess
import sys

WIKI_ID = 16
CATEGORY_ID = 1793009175006
API = ('https://renderer.gamersky.com/gameWiki/web/wikis/{wiki}'
       '/categories/{cat}/entries?cursor={cursor}')
REGION_FIELD = 'field-1793592000025-region'

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
IMG_DIR = os.path.join(ROOT, 'assets', 'bosses')
ATLAS = os.path.join(ROOT, 'js', 'boss-atlas.js')


def curl(url, binary=False):
    out = subprocess.run(['curl', '-s', '-A', 'Mozilla/5.0', url, '--max-time', '30'],
                         capture_output=True)
    if out.returncode != 0:
        raise RuntimeError('curl 失败: %s' % url)
    return out.stdout if binary else out.stdout.decode('utf-8')


def fetch_entries():
    rows, seen, cursor = [], set(), '0'
    while True:
        url = API.format(wiki=WIKI_ID, cat=CATEGORY_ID, cursor=cursor)
        payload = json.loads(curl(url))
        data = payload['data']
        for item in data['items']:
            name = item.get('name')
            if not name or name in seen:
                continue
            seen.add(name)
            values = item.get('values') or {}
            rows.append({
                'id': values.get('gameInternalId'),
                'name': name,
                'region': values.get(REGION_FIELD) or '',
                'code': str(values.get('codexId') or item.get('id')),
                'cover': item.get('coverUrl'),
            })
        cursor = data.get('nextCursor')
        if not cursor or str(cursor) == 'None':
            break
        cursor = str(cursor)
    return rows


def download(rows):
    os.makedirs(IMG_DIR, exist_ok=True)
    for r in rows:
        if not r['cover']:
            continue
        dst = os.path.join(IMG_DIR, '%s.png' % r['code'])
        if os.path.exists(dst) and os.path.getsize(dst) > 0:
            continue
        with open(dst, 'wb') as f:
            f.write(curl(r['cover'], binary=True))


def write_atlas(rows):
    def js(v):
        return json.dumps(v, ensure_ascii=False)

    lines = [
        '/**',
        ' * boss-atlas.js — 影之刃零 BOSS 图鉴',
        ' *',
        ' * %d 个首领条目：立绘、所属区域、游戏内部蓝图名。' % len(rows),
        ' * 立绘与命名整理自游民星空《影之刃零》图鉴，版权归 S-GAME 所有。',
        ' * 由 tools/fetch-boss-atlas.py 生成，请勿手改。',
        ' *',
        ' * 内部蓝图名（BP_Monster_xxx）是匹配存档字段的主键；',
        ' * 匹配不上时依次退回「去前缀名」「中文名片段」。',
        ' */',
        '(function (global) {',
        "  'use strict';",
        '',
        '  var ATLAS = [',
    ]
    for r in rows:
        lines.append('    { id: %s, name: %s, region: %s, img: %s },'
                     % (js(r['id']), js(r['name']), js(r['region']),
                        js('assets/bosses/%s.png' % r['code'])))
    lines += [
        '  ];',
        '',
        '  var byId = {};',
        '  var byBase = {};',
        '  for (var i = 0; i < ATLAS.length; i++) {',
        '    var b = ATLAS[i];',
        '    byId[String(b.id).toLowerCase()] = b;',
        '    var base = String(b.id).replace(/^BP_Monster_/i, "").toLowerCase();',
        '    if (!byBase[base]) byBase[base] = b;',
        '  }',
        '',
        "  global.PBZBossAtlas = { list: ATLAS, byId: byId, byBase: byBase,"
        " source: '游民星空《影之刃零》图鉴' };",
        '})(window);',
        '',
    ]
    with open(ATLAS, 'w', encoding='utf-8') as f:
        f.write('\n'.join(lines))


def main():
    rows = fetch_entries()
    if not rows:
        print('没有抓到条目，接口可能变了', file=sys.stderr)
        return 1
    missing = [r['name'] for r in rows if not r['id']]
    if missing:
        print('缺少内部 ID 的条目：%s' % missing[:5], file=sys.stderr)
    download(rows)
    write_atlas(rows)
    print('完成：%d 条图鉴，立绘 %d 个' % (len(rows), len(os.listdir(IMG_DIR))))
    return 0


if __name__ == '__main__':
    sys.exit(main())
