# For AI agents

This repo turns a brand config into an animated lanyard badge (video / GIF / images) and a print package.

- Conversational workflow: follow [`.claude/skills/badge-studio/SKILL.md`](.claude/skills/badge-studio/SKILL.md).
- Config schema & defaults: `DEFAULT_CONFIG` at the top of [`src/engine.js`](src/engine.js); example in [`examples/wqai/brand.json`](examples/wqai/brand.json).
- Render: `node scripts/render.mjs --config path/brand.json [--res 1080|4k|both]`
- Print: `node scripts/print.mjs --config path/brand.json [--people people.csv]`
- Always inspect the rendered PNGs yourself before handing them to the user.
- Requirements: Node 18+, ffmpeg on PATH (or `FFMPEG=/path`), `npm install` (downloads Chromium for Playwright).
