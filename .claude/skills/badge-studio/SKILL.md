---
name: badge-studio
description: Make a branded animated lanyard badge (工牌) from a short conversation — social video/GIF, posters, banners and a print-ready badge package for print shops. Use when the user wants a 工牌 / badge / ID card / lanyard animation or badge print files for their company, event or brand.
---

# Badge Studio — conversational workflow

You turn a user's brand materials into a `brand.json`, render everything with this repo's scripts, review the results with the user, and deliver. Talk to the user in their language (Chinese by default for this project).

## 1. Collect materials (ask once, in one message)

Ask only for what you can't find yourself:

1. **Brand basics** — name (Chinese + English if any), website, logo file, existing 工牌 / brand guide if they have one.
2. **Tone** — one-line slogan, 6–12 short tags (2–10 characters each) that describe what they do.
3. **Where it will be used** — 小红书 / 公众号 / 视频号 / 抖音 / X / printed 工牌.
4. **Print?** — do they need physical badges; if yes, a staff list (name, title, ID) → `people.csv`.

Skip any question the materials already answer. If the user is away, take sensible defaults and say which ones you took.

## 2. Extract brand facts yourself

- **Colours**: if a website is given, read its CSS (look for `--accent`, `--brand`, `--primary`, `--lime`, theme-color meta, the most frequent saturated hex). From a logo image, sample the dominant saturated colour. Pick `accent` (main), `accent2` (slightly darker/shifted), `bg` (usually the site's dark/light base). Show the user the hex values you picked.
- **Copy**: reuse their own wording from the site / about page for `header.right`, `poster.sub`, `credit`.
- **giantWord**: 2–6 latin letters (brand initials or domain letters without the TLD).

## 3. Write brand.json

Start from `examples/wqai/brand.json`. Keep every string short — the card is small:

| field | rule of thumb |
|---|---|
| `card.headline` + `card.highlight` | 2 lines, ≤ 10 latin chars per line; highlight word in accent colour |
| `card.bandTitle` | ≤ 8 Chinese chars |
| `tags` | 12 max, ≤ 12 chars each; first half float in from the top, second half from the bottom |
| `strap` | 1–2 short phrases repeated along the lanyard |
| `back` | default holder name/title/ID; per-person values come from `people.csv` |

**No URLs** (`xxx.com`, `.ltd`, `www.`) anywhere if the target includes 小红书 or similar platforms — use the brand name or `@handle` instead. `render.mjs` warns; `--strict-url` makes it fail.

## 4. Render & review

```bash
npm run render -- --config <dir>/brand.json            # video, GIF, images (1080P)
npm run print  -- --config <dir>/brand.json --people <dir>/people.csv   # print package
```

Then **look at the outputs before showing the user** (read `images/preview_1080x1920.png`, `images/poster_1242x1660.png`, `images/banner_1440x600.png`, and a few frames of the video). Check: text not overflowing the card, nothing overlapping, colours readable on the background, no URLs. Fix and re-render if needed.

Send the user the preview images first for approval (fast), then the video/GIF, then the print package.

## 5. Iterate — common requests and where to change them

| user says | change |
|---|---|
| 背景字看不清 / 视频糊 | `--res both` for 4K; send `images/preview_*` as the cover |
| 存到手机封面是空白 | use `video/*_cover_*.mp4` / `gif/*` (they start on the settled frame) |
| 公众号 GIF 超 10MB | use `gif/badge_under_10MB.gif` or `--gif-limit 8` |
| 晃得太猛 / 太弱 | `motion.swing`, `motion.cardLag`, `motion.twist`, `motion.damping` |
| 想多停一会儿 | raise `motion.exitAt` and `motion.duration` together |
| 提示网址违规 | remove URLs from every string (strap, corner, pulse, poster.handle…) |
| 换中间图案 | `card.hero.type: "image"` + `card.hero.image: "mascot.png"` |
| 浅色版 | `theme.mode: "light"` |

## 6. Deliver

- Social: `video/badge_1080p_cover_x3.mp4` (小红书 / 视频号), `gif/badge_under_10MB.gif` (公众号), `images/preview_1080x1920.png` (cover).
- Print: the whole `print/` folder — tell the user to forward it to the print shop as is; point out `06_设计规范.pdf` and that fluorescent colours need a spot-colour ink + proof (打样).
- Interactive: `npm run studio` lets them drag / spin / flip the 3D badge and export PNGs.
