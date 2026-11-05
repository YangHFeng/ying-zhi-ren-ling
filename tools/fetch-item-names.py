#!/usr/bin/env python3
"""
tools/fetch-item-names.py — 生成 js/item-names.js

数据来源：phantombladezerosaves.com/item-ids/ 的 Save ID 对照表
（社区整理，非官方）。只取其中文名，用于把存档里的内部 ID 显示成中文。

用法：python tools/fetch-item-names.py
"""
import html
import io
import json
import os
import re
import subprocess
import sys

URL = 'https://phantombladezerosaves.com/item-ids/'

# 社区表未收录、但能从拼音确定的武器与道具（标为补充，可随时删改）
SUPPLEMENT = {
    'GuiTouBlade': '鬼头刀',
    'Tang': '唐刀',
    'WoodenSwordHun': '木剑·魂',
    'Double': '双刀',
    'Long': '长刀',
    'ChiZheCanJian': '痴者残剑',
    'ZhanMaBlade': '斩马刀',
    'SnakeDual': '蛇形双刃',
    'RenOuQingTongJian': '人偶青铜剑',
    'SlitheringSword': '灵蛇软剑',
    'TieGongZhuQuanTao': '铁工铸拳套',
    'MiaoShouFeiDao': '妙手飞刀',
}
OUT = os.path.join(os.path.dirname(__file__), '..', 'js', 'item-names.js')


def fetch(url):
    out = subprocess.run(['curl', '-s', '-A', 'Mozilla/5.0', url, '--max-time', '30'], capture_output=True)
    if out.returncode != 0 or not out.stdout:
        sys.exit('抓取失败：' + url)
    return out.stdout.decode('utf-8', 'ignore')


def main():
    page = fetch(URL)
    pairs = re.findall(r'<code>([^<]+)</code>\s*</td>\s*<td>([^<]*)</td>', page)

    mapping = {}
    for save_id, label in pairs:
        label = html.unescape(label).strip()
        m = re.search(r'[（(]([^)）]*[\u4e00-\u9fff][^)）]*)[)）]', label)
        cn = m.group(1).strip() if m else label
        if not cn:
            continue
        mapping[save_id] = cn

    added = 0
    for k, v in SUPPLEMENT.items():
        if k not in mapping:
            mapping[k] = v
            added += 1

    lines = [
        '/**',
        ' * item-names.js — 存档内部 ID 的中文名',
        ' *',
        ' * %d 条（社区表 %d 条 + 拼音补充 %d 条）。' % (len(mapping), len(mapping) - added, added),
        ' * 主体整理自 phantombladezerosaves.com 的 Save ID 对照表（社区整理）。',
        ' * 找不到的 ID 会退回词根翻译（见 pbz-view.js 的 ID_WORDS）。',
        ' * 重新抓取：python tools/fetch-item-names.py',
        ' */',
        '(function (global) {',
        "  'use strict';",
        '',
        '  var NAMES = {',
    ]
    for k, v in mapping.items():
        lines.append('    %s: %s,' % (json.dumps(k, ensure_ascii=False), json.dumps(v, ensure_ascii=False)))
    lines += [
        '  };',
        '',
        '  global.PBZItemNames = NAMES;',
        '})(typeof window !== \'undefined\' ? window : globalThis);',
        '',
    ]

    io.open(OUT, 'w', encoding='utf-8').write('\n'.join(lines))
    print('已生成', OUT)
    print('  %d 条映射' % len(mapping))


if __name__ == '__main__':
    main()
