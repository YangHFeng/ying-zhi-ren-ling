# 影之刃零 · 存档解析

上传 Steam 存档 `PBZSaveGame.sav`，在浏览器里解开它的加密容器，解析出总时长、Boss 战死数、收集进度、武器与货币，并生成可分享的战绩长图。

> 全程在本地浏览器解析，存档不会上传到任何服务器。

## 在线使用

**https://YangHFeng.github.io/ying-zhi-ren-ling/**

没有存档也可以点「看示例」，用内置的示例存档跑通整个流程。

## 功能

- **时长与进度** — 总游玩时长、当前天数 / 66 天、首领击破率环形图
- **Boss 战死图鉴** — 每个交战过的首领一张卡片，带立绘、中文名、所属区域与死亡次数，按死亡次数排序，不受「前几名」限制
- **收集与装备** — 敌人图鉴、成就、物品种类、主武器与沙器武器（含强化等级）
- **存档槽切换** — 一份文件里打包的 6 个手动/自动档 + 2 个账户档可逐个查看
- **战绩长图** — Canvas 绘制 1080×1440 分享图，一键下载
- **原始数据浏览** — 解密后的完整 JSON 属性树，支持搜索
- **自定义密钥** — 游戏大版本更新导致内置密钥失效时，可在「解析信息」里覆盖

## 存档格式：PBZS v3

影之刃零**没有**使用 UE 默认的 GVAS 存档，而是自研的 PBZS 加密容器。本项目的解析链路：

```
PBZSaveGame.sav
  └─ PBZS 容器（明文 12 字节头 + 若干 AES-256-GCM 封存块）
       ├─ 目录块 → 8 个条目的名字 / 压缩算法 / 偏移 / 大小
       └─ 数据块 → 解密 → 按算法解压 → UTF-8 JSON
```

容器头 12 字节：

| 偏移 | 长度 | 含义 |
| --- | --- | --- |
| 0x00 | 4 | magic `PBZS` |
| 0x04 | 1 | 版本号（当前为 3） |
| 0x05 | 1 | flags |
| 0x06 | 2 | 槽位数量（uint16 LE） |
| 0x08 | 4 | 目录块长度（uint32 LE，含封包头） |

每个封存块的 36 字节前缀为 `PBZS` + 4 字节标记 + 12 字节 nonce + **16 字节 GCM 认证标签**，随后才是密文。也就是说标签在密文**之前**，而 WebCrypto 要求 `ciphertext || tag`，解密前需要重排。

目录块解密后是一张紧凑表，逐条为：

```
uint16 nameLen | name | uint8 algorithm | uint8 flag
| uint32 rawSize | uint32 offset | uint32 blockSize
```

`algorithm`：`0` 原始 JSON、`1` zlib、`2` Oodle Kraken。实测这份存档里 8 个块全部是 Oodle Kraken，因此项目内置了 Oodle 解码器的 WASM 版本（`js/vendor/ooz.mjs`，约 115 KB）。

解密与解压分别用 WebCrypto 的 `AES-GCM` 与 `DecompressionStream('deflate')`，Oodle 走 WASM，**没有任何后端参与**。

## 指标怎么算

| 指标 | 来源 |
| --- | --- |
| 游玩时长 | `PBZGameSystem.CurrentCycleGameTime`（秒） |
| 天数 | `Player.RemainingDays` / 天数上限 66 |
| 死亡总数 | `PBZDeathMeta.DiedTimes` |
| 单个 Boss 死亡率 | `BossRecord.<BP_Monster_X>.Records.<cycle>_<diff>.AttemptCount - KillCount` |
| 击破率 | 已击破首领数 / 图鉴内的首领总数 |
| 货币 | `Player.Dust` |
| 武器 | `Inventory.MainWeaponInfos` / `ShaqiWeapons`，等级存的是 UI 上的 `+n` 值加 1 |
| 收集 | `__Advanced__.Codex.DiscoveredEnemies`、`__Achievements__.UnlockedIds`、`Inventory.InventoryInfos` |

## 本地运行

纯静态页面，不需要构建，但因为用到了 WebCrypto、`DecompressionStream`、ES Module 与 `fetch`，必须用 HTTP 服务打开（`file://` 下 WebCrypto 不可用）：

```bash
python -m http.server 8765
# 或 npx serve .
```

然后访问 `http://127.0.0.1:8765/`。

## 项目结构

```
index.html                 页面骨架
assets/styles.css          全部样式
assets/bosses/             76 张首领立绘（256×256 PNG，共约 2.6 MB）
js/pbzs.js                 PBZS v3 容器解密 + 解压（zlib / Oodle）
js/pbz-view.js             解密后 JSON → 页面视图模型
js/item-names.js           物品 ID → 中文名对照表
js/boss-atlas.js           BOSS 图鉴数据（内部 ID / 中文名 / 区域 / 立绘）
js/share-card.js           Canvas 战绩卡绘制
js/app.js                  交互、渲染、槽位切换、原始数据树
js/vendor/ooz.mjs          Oodle Kraken WASM 解码器
samples/demo-pbzs.sav      示例存档（真实容器格式，7 个槽位）
samples/card-preview.png   战绩长图预览
tools/make-demo.js         生成示例存档
tools/fetch-boss-atlas.py  重新抓取 BOSS 图鉴数据与立绘
tools/fetch-item-names.py  重新抓取物品 ID 对照表
tools/test-real.js         命令行解析真实存档并打印关键指标
tools/test-ui.js           Playwright 界面自检（需另装 playwright-core）
```

### 自检

```bash
node tools/test-real.js /path/to/PBZSaveGame.sav   # 命令行跑通解密 + 指标
BASE=http://127.0.0.1:8765/index.html node tools/test-ui.js --real
```

`test-ui.js` 会走一遍「示例存档 → 概览 → 分享卡 → 原始数据搜索 → 槽位切换 → 真实存档 → 错误文件 → 移动端」，任何控制台报错都会以非零码退出。截图输出到 `shots/`。

## BOSS 立绘与图鉴

首领立绘、中文名与所属区域整理自**游民星空《影之刃零》图鉴**（BOSS 分类），版权归 S-GAME 所有，本项目仅作非商业展示。数据与图片可用 `tools/fetch-boss-atlas.py` 重新抓取。

存档里的首领标识通常是游戏内部蓝图名（如 `BP_Monster_YuCong_P1`）。匹配顺序：精确匹配 → 去 `BP_Monster_` / `Boss_` 前缀 → 最长前缀匹配（处理 `_P2`、`_FirstTime` 这类阶段后缀）→ 中文名包含匹配。全部失败时把内部名转成可读形式（`BP_Monster_YuCong_P1` → `Yu Cong P1`），卡片显示占位符而不是破图。

## 已知限制

- **密钥会随版本失效** — 内置密钥对应 Steam build 26266538（2026-10-29 发行版）。大版本更新后若提示「认证失败」，把社区给出的新密钥填进「解析信息 → 自定义密钥」即可，配置存在 localStorage
- 需要 HTTPS 或 localhost：WebCrypto 在 `file://` 下不可用
- Oodle 解码器是 115 KB 的 WASM 模块，首次解析需要加载，弱网下会有短暂等待
- 战绩卡依赖系统字体渲染，不同平台字形会有细微差异
- 图鉴收录 76 个首领条目（同一首领的不同阶段分开计），后续版本新增首领需要重新跑一次抓取脚本

## License

MIT
