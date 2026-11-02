#!/usr/bin/env node
// Render all social-media assets for one brand config.
//   node scripts/render.mjs --config examples/wqai/brand.json [--out out/xxx] [--res 1080|4k|both] [--gif-limit 10]
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { parseArgs, loadConfig, openEngine, saveCanvas, ff, slug, kb, ROOT } from './lib.mjs';

const args = parseArgs(process.argv.slice(2));
if (!args.config) { console.log('usage: npm run render -- --config brand.json [--out dir] [--res 1080|4k|both] [--fps 30] [--gif-limit 10] [--no-video]'); process.exit(1); }
const cfg = loadConfig(args.config);
const out = path.resolve(args.out || path.join(ROOT, 'out', slug(cfg.name)));
const fps = +(args.fps || 30), res = (args.res || '1080').toString(), gifLimit = +(args['gif-limit'] || 10);
fs.mkdirSync(out, { recursive: true });

const { browser, page, urls } = await openEngine(cfg);
if (urls.length) {
  console.warn('\n⚠  Config contains URL-like text (some platforms, e.g. 小红书, flag this):');
  urls.forEach(u => console.warn(`   ${u.path}: ${u.match.join(', ')}`));
  if (args['strict-url']) { await browser.close(); process.exit(2); }
  console.warn('');
}
const M = await page.evaluate(() => BadgeEngine.config.motion);

// ---------------------------------------------------------------- stills
console.log('• images');
const img = p => path.join(out, 'images', p);
await saveCanvas(page, 'E.still(1.5)', img('preview_1080x1920.png'));
await saveCanvas(page, "E.still(1.5,{side:'back'})", img('preview_back_1080x1920.png'));
await saveCanvas(page, 'E.badgeOnly(3)', img('badge_transparent.png'));
await saveCanvas(page, 'E.poster(1)', img('poster_1242x1660.png'));
await saveCanvas(page, 'E.banner(1)', img('banner_1440x600.png'));
await saveCanvas(page, 'E.banner(2)', img('banner_2880x1200.png'));
if (res === '4k' || res === 'both') await saveCanvas(page, 'E.still(3)', img('preview_2160x3840.png'));
for (const st of ['grid', 'neon', 'minimal']) for (const side of ['front', 'back'])
  await saveCanvas(page, `E.nameCardCanvas('${side}','${st}',2)`, img(`namecard_${st}_${side}.png`));

// ---------------------------------------------------------------- frames + video
async function renderFrames(scale, dir) {
  fs.rmSync(dir, { recursive: true, force: true }); fs.mkdirSync(dir, { recursive: true });
  const n = Math.round(M.duration * fps);
  for (let i = 0; i < n; i++) {
    const data = await page.evaluate(([t, f, s]) => BadgeEngine.frame(t, f, s).toDataURL('image/jpeg', 0.95), [i / fps, fps, scale]);
    fs.writeFileSync(path.join(dir, `f_${String(i).padStart(4, '0')}.jpg`), Buffer.from(data.split(',')[1], 'base64'));
    if (i % 30 === 0) process.stdout.write(`\r  frames ${i}/${n}`);
  }
  process.stdout.write(`\r  frames ${n}/${n}\n`);
  return n;
}
// concat list that starts on the calm "settled" frame -> iPhone/album thumbnail is the badge, not a blank page
function coverFirstList(dir, n, loops) {
  const start = Math.round(M.settleAt * fps) % n;
  const order = [...Array(n - start).keys()].map(i => i + start);
  for (let l = 1; l < loops; l++) order.push(...Array(n).keys());
  order.push(...Array(start).keys());
  const list = path.join(dir, `list_x${loops}.txt`);
  fs.writeFileSync(list, order.map(i => `file 'f_${String(i).padStart(4, '0')}.jpg'\nduration ${(1 / fps).toFixed(6)}`).join('\n') + `\nfile 'f_${String(order.at(-1)).padStart(4, '0')}.jpg'\n`);
  return list;
}
const vid = p => path.join(out, 'video', p), gif = p => path.join(out, 'gif', p);
const x264 = (crf) => ['-c:v', 'libx264', '-preset', 'veryfast', '-crf', String(crf), '-tune', 'animation', '-pix_fmt', 'yuv420p', '-movflags', '+faststart'];

if (!args['no-video']) {
  fs.mkdirSync(path.join(out, 'video'), { recursive: true }); fs.mkdirSync(path.join(out, 'gif'), { recursive: true });
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'badge-'));
  for (const r of (res === 'both' ? ['1080', '4k'] : [res])) {
    const scale = r === '4k' ? 3 : 1.5, dir = path.join(tmp, r);
    console.log(`• video ${r}`);
    const n = await renderFrames(scale, dir);
    const seq = ['-framerate', String(fps), '-i', path.join(dir, 'f_%04d.jpg')];
    const crf = r === '4k' ? 16 : 14;
    ff([...seq, ...x264(crf), vid(`badge_${r}p_single.mp4`.replace('4kp', '4k'))]);
    ff(['-f', 'concat', '-safe', '0', '-i', coverFirstList(dir, n, 3), '-fps_mode', 'cfr', '-r', String(fps), ...x264(crf), vid(`badge_${r}p_cover_x3.mp4`.replace('4kp', '4k'))]);
    ff(['-f', 'concat', '-safe', '0', '-i', coverFirstList(dir, n, 1), '-fps_mode', 'cfr', '-r', String(fps), ...x264(crf), vid(`badge_${r}p_cover_x1.mp4`.replace('4kp', '4k'))]);
    if (r === '1080') {
      console.log('• gif');
      const list1 = coverFirstList(dir, n, 1);
      const pal = (w, f, colors, dither) => ['-f', 'concat', '-safe', '0', '-i', list1, '-vf',
        `fps=${f},scale=${w}:-1:flags=lanczos,split[a][b];[a]palettegen=max_colors=${colors}:stats_mode=diff[p];[b][p]paletteuse=dither=${dither}:diff_mode=rectangle`, '-loop', '0'];
      ff([...pal(720, 20, 200, 'sierra2_4a'), gif('badge_hd.gif')]);
      // smallest-first quality ladder until it fits the size limit (公众号 GIF ≤ 10MB)
      const ladder = [[640, 15, 128, 'bayer:bayer_scale=4'], [640, 12, 96, 'none'], [560, 12, 96, 'none'], [480, 12, 64, 'none'], [400, 10, 64, 'none']];
      for (const [w, f, c, d] of ladder) {
        const file = gif(`badge_under_${gifLimit}MB.gif`); ff([...pal(w, f, c, d), file]);
        if (fs.statSync(file).size <= gifLimit * 1024 * 1024) break;
      }
    }
  }
  if (!args['keep-frames']) fs.rmSync(tmp, { recursive: true, force: true }); else console.log('  frames kept in', tmp);
}
await browser.close();

// ---------------------------------------------------------------- summary
const list = [];
(function walk(d) { for (const f of fs.readdirSync(d)) { const p = path.join(d, f); fs.statSync(p).isDirectory() ? walk(p) : list.push(p); } })(out);
console.log(`\n✓ done → ${out}`);
list.filter(f => !f.includes(`${path.sep}print${path.sep}`)).forEach(f => console.log(`  ${path.relative(out, f).padEnd(40)} ${kb(f)}`));
