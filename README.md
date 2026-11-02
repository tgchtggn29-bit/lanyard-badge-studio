# Lanyard Badge Studio · 工牌工作室

> 上传你的品牌资料，聊几句，就能拿到：**会掉下来、左右晃两下的挂绳工牌动画**（MP4 / GIF / 4K）、**海报和横幅**，以及**可以直接交给印刷厂的工牌印刷包**（带裁切线的 PDF、批量员工背面、挂绳、设计规范）。
>
> Brand config in → animated lanyard-badge video & GIF, posters, banners, and a print-ready badge package out. Plus an interactive 3D badge you can drag, spin and flip in the browser.

<p align="center">
  <img src="docs/images/demo.gif" width="260" alt="工牌掉落动画">
  &nbsp;
  <img src="docs/images/preview.png" width="260" alt="停稳预览图">
  &nbsp;
  <img src="docs/images/poster.png" width="260" alt="3:4 海报">
</p>

<p align="center"><img src="docs/images/studio.png" width="860" alt="网页工作台：可拖拽 / 旋转 / 翻面的 3D 工牌"></p>

---

## 能做什么

| 你给的 | 你拿到的 |
|---|---|
| 品牌名、品牌色、Logo、几句标语 | **工牌动画**：空白页开场 → 标签上下浮现 → 品牌大字弹出 → 工牌带动态模糊掉落、被挂绳拉住回弹、左右晃两下 → 停稳轻晃 → 品牌字放大缩回 → 收起循环 |
| | **MP4**：1080P / 4K，单次 & 循环 3 次；**首帧即封面**（存到 iPhone 相册缩略图就是工牌，不是空白页） |
| | **GIF**：高清版 + 自动压到 **10MB 以内**（公众号上限） |
| | **图片**：停稳清晰预览图（正 / 背面）、透明底工牌、3:4 海报、紧凑横幅 |
| 员工名单 `people.csv`（可选） | **印刷包**：工牌正面 / 背面（54×85.6 mm，3 mm 出血，600 dpi）、带裁切线 PDF、出血版 PDF、**每人一张的批量背面**、挂绳 20×900 mm、**设计规范 PDF**（色值 HEX / RGB / CMYK 参考、字体授权、工艺建议） |
| 浏览器 | **3D 工牌**：拖着甩、右键 / Shift 拖动旋转、双击翻面、滚轮放大、「看细节」查看高清卡面 |

内置的平台避坑：
- **网址检测**：配置里出现 `xxx.com / .ltd` 等网址会提醒（小红书等平台可能判定违规）。
- **首帧即封面**：成片从「工牌停稳」那一帧开始播，相册缩略图不再是空白。
- **GIF 大小阶梯压缩**：自动找到 10MB 以内画质最好的一档。
- **荧光色印刷提醒**：主色是荧光 / 高饱和色时，设计规范里会提醒印刷厂用专色油墨并打样。

## 三种用法

### 1. 网页工作台（不用写代码）

```bash
git clone https://github.com/tgchtggn29-bit/lanyard-badge-studio
cd lanyard-badge-studio
npm run studio        # 打开 http://localhost:5173/studio/
```

左边填品牌资料（名称、颜色、Logo、标语、标签、背面姓名职位），右边实时看：
- **3D 工牌**：拖拽、旋转、翻面、放大看细节
- **动画预览**：可直接录一段 WebM
- **海报 & 横幅**、**印刷稿**：一键下载 PNG
- 改好后点「导出 brand.json」，交给命令行出成片

### 2. 命令行出全套成片

需要 Node.js 18+ 和 [ffmpeg](https://ffmpeg.org/download.html)。

```bash
npm install                                   # 会自动下载 Chromium
npm run render -- --config examples/wqai/brand.json             # 视频 + GIF + 图片（1080P）
npm run render -- --config brand.json --res both                 # 同时出 4K
npm run print  -- --config brand.json --people people.csv        # 印刷包
npm run all                                                      # 用示例跑一遍全部
```

输出在 `out/<品牌名>/`：

```
out/湾区AI日历/
├── video/   badge_1080p_cover_x3.mp4   badge_1080p_cover_x1.mp4   badge_1080p_single.mp4   (badge_4k_*.mp4)
├── gif/     badge_hd.gif               badge_under_10MB.gif
├── images/  preview_1080x1920.png  preview_back_1080x1920.png  badge_transparent.png  poster_1242x1660.png  banner_*.png
└── print/   01_工牌正面_裁切线.pdf  02_工牌背面_裁切线.pdf  03_工牌正反面_出血版_无裁切线.pdf
             04_工牌背面_批量_裁切线.pdf  05_挂绳_20x900mm.pdf  06_设计规范.pdf  给印刷厂的说明.txt  批量背面/*.png
```

常用参数：`--res 1080|4k|both`、`--fps 30`、`--gif-limit 10`、`--strict-url`（发现网址直接报错）、`--card 54x85.6`、`--bleed 3`、`--dpi 600`、`--lanyard 20x900`。

### 3. 让 AI 助手通过对话帮你做

仓库自带技能说明 [`.claude/skills/badge-studio/SKILL.md`](.claude/skills/badge-studio/SKILL.md)（Claude Code 打开本仓库会自动识别；其他 Agent 见 [`AGENTS.md`](AGENTS.md)）。对它说：

> 帮我做一套公司工牌，这是我们的官网和 Logo，员工名单在 people.csv

它会：读官网 / Logo 提取品牌色 → 问你几个问题（标语、标签、要发哪些平台、要不要印刷）→ 写好 `brand.json` → 渲染 → 把预览图给你审 → 按你的意见改 → 交付成片和印刷包。

## brand.json

完整示例见 [`examples/wqai/brand.json`](examples/wqai/brand.json)，所有字段都有默认值，只写想改的即可：

```json
{
  "name": "你的品牌",
  "theme": { "accent": "#D8FF3E", "accent2": "#A8E62E", "bg": "#0A0A0A" },
  "logo": "logo.png",
  "giantWord": "BRAND",
  "tags": ["今日活动", "报名中", "..."],
  "strap": ["BRAND · 2026", "你的品牌"],
  "card": {
    "brand": "你的品牌", "corner": "NO. 2026", "kicker": "01 / STAFF PASS",
    "headline": ["MAKE IT", "HAPPEN "], "highlight": "TODAY",
    "hero": { "type": "calendar", "highlights": [3, 9, 12], "today": 26 },
    "bandTitle": "你的品牌", "bandSub": "SLOGAN · 2026"
  },
  "back": { "name": "姓名", "title": "职位", "id": "NO. 0001", "note": "凭此卡出入" },
  "pulse": "你的品牌",
  "poster": { "title": ["你的", "品牌"], "sub": ["一句话介绍", "第二句"], "handle": "@你的账号", "channels": "公众号 · 小红书" }
}
```

- `card.hero.type`：`calendar`（日历格子）/ `image`（放吉祥物、产品图，配合 `card.hero.image`）/ `none`
- `theme.mode`：`dark`（默认）/ `light`
- `motion`：掉落时间、晃动幅度、阻尼等都能调，见 [`docs/DESIGN_NOTES.md`](docs/DESIGN_NOTES.md)

## 交给印刷厂

`npm run print` 生成的 `print/` 文件夹可以整包发给印刷厂 / 物料店。尺寸、出血、色值、工艺和对接注意事项见 [`docs/PRINT_GUIDE.md`](docs/PRINT_GUIDE.md)。

<p align="center"><img src="docs/images/print-package.png" width="860" alt="印刷包：裁切线 PDF、批量背面、设计规范"></p>

## 与现有方案的区别

[Vercel Ship 的 3D 工牌](https://vercel.com/blog/building-an-interactive-3d-event-badge-with-react-three-fiber) 和 React Bits / 21st.dev 的 Lanyard 组件都是**网页交互组件**，需要前端开发、3D 模型，也不导出成片。本项目面向运营和活动方：**一份配置 → 社媒成片 + 印刷文件**，纯 Canvas 2D，无需建模，结果可复现。

## 技术

- `src/engine.js`：纯 Canvas 2D 渲染引擎（浏览器 & 无头 Chromium 共用）。手调的阻尼振动模型 + 8 次子采样动态模糊。
- `studio/`：零依赖网页；3D 工牌 = Verlet 绳子 + CSS 3D 翻面卡片。
- `scripts/`：Playwright 逐帧渲染 → ffmpeg 编码；Chromium 按毫米尺寸输出 PDF。
- 字体：思源黑体（Noto Sans CJK SC）+ Inter，均为 SIL OFL 可商用。

## License

MIT · 由 [@湾区AI日历](https://github.com/tgchtggn29-bit) 出品。欢迎 PR：新卡面模板、新动效、更多印刷规格。
