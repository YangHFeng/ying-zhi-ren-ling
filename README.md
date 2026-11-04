# 影之刃零 · 存档解析

上传 Steam 存档，在浏览器里解析出你的游戏数据：总时长、Boss 战死数、收集进度、武器与货币，并生成可分享的战绩长图。

> 全程在本地浏览器解析，存档不会上传到任何服务器。

## 在线使用

**https://YangHFeng.github.io/ying-zhi-ren-ling/**

没有存档也可以点「看示例」，用内置的示例存档跑通整个流程。

## 功能

- **时长与进度** — 总时长、游玩天数、主线/支线完成度环形图
- **Boss 战死图鉴** — 每个交战过的首领一张卡片，带立绘、名字、死亡次数与挑战次数，按死亡次数排序，不受"前几名"限制
- **收集与装备** — 收集品明细、已解锁武器与副武器
- **战绩长图** — Canvas 绘制 1080×1440 分享图，一键下载
- **原始数据浏览** — 完整的属性树、搜索、类型标注
- **字段校准** — 不同版本存档字段名不同，可手动把任意字段绑定到指标上，配置存 localStorage 下次自动套用

## 支持格式

- UE4 / UE5 的 GVAS 存档（`.sav`）
- 带 PropertyGuid 与不带 PropertyGuid 两种变体
- 无压缩与 zlib 分块压缩的存档（通过 `DecompressionStream` 解压）
- 支持一次选择整个存档文件夹，自动挑出主存档，备份文件可选

## 本地运行

纯静态页面，不需要构建，但因为用到了 ES Module 与 `fetch`，需要用 HTTP 服务打开而不是双击 `index.html`：

```bash
python -m http.server 8765
# 或 npx serve .
```

然后访问 `http://127.0.0.1:8765/`。

## 项目结构

```
index.html                 页面骨架
assets/styles.css          全部样式
assets/bosses/             75 张首领立绘（256×256 PNG，共约 2.6 MB）
js/gvas-reader.js          二进制读取原语（FString / GUID / 定长数值）
js/gvas-parser.js          GVAS 解析器，含多版本容错
js/metrics.js              指标提取：命名规则 + 结构启发 + 手动绑定
js/boss-atlas.js           BOSS 图鉴数据（内部 ID / 中文名 / 区域 / 立绘）
js/share-card.js           Canvas 战绩卡绘制
js/app.js                  交互、渲染、字段校准
js/sample-save.js          内置示例存档
samples/                   示例存档与卡片预览
tools/make-sample.js       生成示例存档
tools/fetch-boss-atlas.py  重新抓取 BOSS 图鉴数据与立绘
tools/test-parse.js        解析器断言测试
tools/test-variants.js     字段改名 / 压缩 / 截断等容错测试
tools/test-ui.js           Playwright 界面自检（需另装 playwright-core）
```

## 解析思路

1. 按 GVAS 规范读 header（EngineVersion、CustomVersions、SaveGameClassName），再逐条读 tagged property
2. 每个属性按声明的 `size` 强制对齐，单条失败不影响整份存档
3. 用「叶子数字段数 / 字节覆盖率 / 警告数」在不同解析变体间择优
4. 指标提取不硬编码单一字段名：先按命名约定匹配，再按结构特征识别（例如「子字段含 death/attempt 的 struct 集合」就是 Boss 表），最后留手动绑定兜底

## BOSS 立绘与图鉴

首领立绘、中文名与所属区域整理自**游民星空《影之刃零》图鉴**（BOSS 分类），版权归 S-GAME 所有，本项目仅作非商业展示。数据与图片可用 `tools/fetch-boss-atlas.py` 重新抓取。

存档里的首领标识通常是游戏内部蓝图名（如 `BP_Monster_YuCong_P1`）。匹配时按以下顺序尝试，命中即用图鉴里的立绘与中文名：

1. 内部蓝图名精确匹配
2. 去掉 `BP_Monster_` / `Boss_` 前缀后匹配
3. 前缀最长匹配（处理 `_P2`、`_FirstTime` 这类阶段后缀）
4. 中文名包含匹配

全部失败时退回把内部名转成可读形式（`BP_Monster_YuCong_P1` → `Yu Cong P1`），卡片显示占位符而不是破图。

## 已知限制

- 存档里若使用了本项目尚未覆盖的序列化形式（例如自定义 `NetSerialize` 的 struct），可能出现字段缺失
- 指标字段名基于通用命名约定推断，个别游戏版本需要到「原始数据」里核对并手动绑定
- 战绩卡依赖系统字体渲染，不同平台字形会有细微差异
- 图鉴收录 75 个首领条目（同一首领的不同阶段分开计），若后续版本新增首领需要重新跑一次抓取脚本

## License

MIT
