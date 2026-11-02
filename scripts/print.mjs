#!/usr/bin/env node
// Print package for print shops / 物料店:
//   card front & back (bleed PNG @600dpi, PDF with crop marks, PDF bleed-only),
//   batch backs from people.csv, lanyard strip, and a spec sheet (colours, sizes, fonts).
//   node scripts/print.mjs --config brand.json [--people people.csv] [--card 54x85.6] [--bleed 3] [--dpi 600] [--lanyard 20x900]
import fs from 'node:fs';
import path from 'node:path';
import { parseArgs, loadConfig, openEngine, slug, ROOT } from './lib.mjs';

const args = parseArgs(process.argv.slice(2));
if (!args.config) { console.log('usage: npm run print -- --config brand.json [--people people.csv] [--card 54x85.6] [--bleed 3] [--dpi 600] [--lanyard 20x900] [--out dir]'); process.exit(1); }
const cfg = loadConfig(args.config);
const [cw, ch] = (args.card || '54x85.6').split('x').map(Number);
const bleed = +(args.bleed ?? 3), dpi = +(args.dpi || 600);
const [lw, ll] = (args.lanyard || '20x900').split('x').map(Number);
const out = path.resolve(args.out || path.join(ROOT, 'out', slug(cfg.name)), 'print');
fs.mkdirSync(out, { recursive: true });

const { browser, page } = await openEngine(cfg);
const C = await page.evaluate(() => BadgeEngine.config);

async function cardPNG(side, person) {
  return page.evaluate(([s, o, p]) => BadgeEngine.printCard(s, o, p).toDataURL('image/png'), [side, { w: cw, h: ch, bleed, dpi }, person || null]);
}
const save = (f, dataURL) => { fs.writeFileSync(path.join(out, f), Buffer.from(dataURL.split(',')[1], 'base64')); return f; };

// ---------------------------------------------------------------- PDF helpers (Chromium prints exact mm page sizes)
const MARK = 8; // mm of margin for crop marks
function pageHTML(pages, wmm, hmm, withMarks, label) {
  const pw = wmm + 2 * bleed + (withMarks ? 2 * MARK : 0), ph = hmm + 2 * bleed + (withMarks ? 2 * MARK : 0), o = withMarks ? MARK : 0;
  const line = (x, y, w, h) => `<i style="left:${x}mm;top:${y}mm;width:${w}mm;height:${h}mm"></i>`;
  let marks = '';
  if (withMarks) {
    const xs = [o + bleed, o + bleed + wmm], ys = [o + bleed, o + bleed + hmm], L = MARK - 2, t = 0.08;
    xs.forEach(x => { marks += line(x - t / 2, 0, t, L) + line(x - t / 2, ph - L, t, L); });
    ys.forEach(y => { marks += line(0, y - t / 2, L, t) + line(pw - L, y - t / 2, L, t); });
  }
  const body = pages.map(p => `<section>${marks}<img src="${p.src}" style="left:${o}mm;top:${o}mm;width:${wmm + 2 * bleed}mm;height:${hmm + 2 * bleed}mm">
    ${withMarks ? `<b style="left:${o + bleed + 1.5}mm;top:${ph - MARK + 2.6}mm">${label} · ${p.caption || ''} · 成品 ${wmm}×${hmm}mm · 出血 ${bleed}mm · ${dpi}dpi</b>` : ''}</section>`).join('');
  return `<!doctype html><html><head><meta charset="utf-8"><style>
    @page{size:${pw}mm ${ph}mm;margin:0} html,body{margin:0}
    section{position:relative;width:${pw}mm;height:${ph}mm;overflow:hidden;page-break-after:always;background:#fff}
    section img,section i,section b{position:absolute;display:block} i{background:#000}
    b{font:500 4.2pt "Noto Sans CJK SC",sans-serif;color:#000;white-space:nowrap}
  </style></head><body>${body}</body></html>`;
}
const pdfSized = (...a) => pdf(...a);
async function pdf(file, pages, wmm, hmm, withMarks, label) {
  const p = await browser.newPage();
  await p.setContent(pageHTML(pages, wmm, hmm, withMarks, label), { waitUntil: 'load' });
  const pw = wmm + 2 * bleed + (withMarks ? 2 * MARK : 0), ph = hmm + 2 * bleed + (withMarks ? 2 * MARK : 0);
  await p.pdf({ path: path.join(out, file), width: `${pw}mm`, height: `${ph}mm`, printBackground: true });
  await p.close(); return file;
}

// ---------------------------------------------------------------- card front / back
console.log('• card front / back');
const front = await cardPNG('front'), back = await cardPNG('back');
save('01_工牌正面_出血_600dpi.png', front);
save('02_工牌背面_出血_600dpi.png', back);
await pdf('01_工牌正面_裁切线.pdf', [{ src: front, caption: '正面' }], cw, ch, true, cfg.name);
await pdf('02_工牌背面_裁切线.pdf', [{ src: back, caption: '背面' }], cw, ch, true, cfg.name);
await pdf('03_工牌正反面_出血版_无裁切线.pdf', [{ src: front }, { src: back }], cw, ch, false, cfg.name);

// ---------------------------------------------------------------- batch backs from CSV
if (args.people) {
  console.log('• batch backs');
  const rows = fs.readFileSync(path.resolve(args.people), 'utf8').replace(/^﻿/, '').split(/\r?\n/).filter(l => l.trim());
  const head = rows.shift().split(',').map(s => s.trim().toLowerCase());
  const people = rows.map(r => { const v = r.split(','); return Object.fromEntries(head.map((h, i) => [h, (v[i] || '').trim()])); });
  const dir = path.join(out, '批量背面'); fs.mkdirSync(dir, { recursive: true });
  const pages = [];
  for (const [i, p] of people.entries()) {
    const src = await cardPNG('back', p);
    fs.writeFileSync(path.join(dir, `${String(i + 1).padStart(3, '0')}_${slug(p.name)}.png`), Buffer.from(src.split(',')[1], 'base64'));
    pages.push({ src, caption: `${p.name} ${p.id || ''}` });
  }
  await pdf('04_工牌背面_批量_裁切线.pdf', pages, cw, ch, true, cfg.name);
  console.log(`  ${people.length} people`);
}

// ---------------------------------------------------------------- business cards (名片) 90×54 mm
{
  const style = args['namecard-style'] || (C.namecard && C.namecard.style) || 'grid';
  console.log(`• business cards (${style})`);
  const nc = (side, person) => page.evaluate(([sd, st, o, pp]) => BadgeEngine.printNameCard(sd, st, o, pp).toDataURL('image/png'), [side, style, { w: 90, h: 54, bleed, dpi }, person || null]);
  const f = await nc('front'), bk = await nc('back');
  save('07_名片正面_出血_600dpi.png', f); save('08_名片背面_出血_600dpi.png', bk);
  const pages = [{ src: f, caption: '名片正面' }];
  if (args.people) {
    const rows = fs.readFileSync(path.resolve(args.people), 'utf8').replace(/^\uFEFF/, '').split(/\r?\n/).filter(l => l.trim());
    const head = rows.shift().split(',').map(x => x.trim().toLowerCase());
    for (const r of rows) { const v = r.split(','), pp = Object.fromEntries(head.map((h, i) => [h, (v[i] || '').trim()])); pages.push({ src: await nc('back', pp), caption: `名片背面 ${pp.name}` }); }
  } else pages.push({ src: bk, caption: '名片背面' });
  await pdfSized('07_名片_正反面_裁切线.pdf', pages, 90, 54, true, cfg.name);
}

// ---------------------------------------------------------------- lanyard
console.log('• lanyard');
const lan = await page.evaluate(o => BadgeEngine.printLanyard(o).toDataURL('image/png'), { w: lw, len: ll, bleed: 2, dpi: 300 });
save(`05_挂绳_${lw}x${ll}mm_300dpi.png`, lan);
{
  const p = await browser.newPage();
  const W = ll + 4, H = lw + 4;
  await p.setContent(`<!doctype html><html><head><style>@page{size:${W + 16}mm ${H + 24}mm;margin:0}html,body{margin:0}
    img{position:absolute;left:8mm;top:8mm;width:${W}mm;height:${H}mm}b{position:absolute;left:8mm;top:${H + 12}mm;font:500 6pt "Noto Sans CJK SC",sans-serif}</style></head>
    <body><img src="${lan}"><b>${cfg.name} · 挂绳 · 成品 ${lw}×${ll}mm（含 2mm 出血）· 热转印 / 丝印请按实际工艺确认</b></body></html>`);
  await p.pdf({ path: path.join(out, `05_挂绳_${lw}x${ll}mm.pdf`), width: `${W + 16}mm`, height: `${H + 24}mm`, printBackground: true });
  await p.close();
}

// ---------------------------------------------------------------- spec sheet
console.log('• spec sheet');
const hex2rgb = h => { const n = parseInt(h.replace('#', ''), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; };
const cmyk = ([r, g, b]) => { const R = r / 255, G = g / 255, B = b / 255, K = 1 - Math.max(R, G, B); if (K >= 1) return [0, 0, 0, 100];
  return [(1 - R - K) / (1 - K), (1 - G - K) / (1 - K), (1 - B - K) / (1 - K), K].map(v => Math.round(v * 100)); };
const colors = [['主色 Accent', C.theme.accent], ['辅助色 Accent 2', C.theme.accent2], ['底色 Background', C.theme.bg], ['文字 Text', C.theme.text], ['弱文字 Mute', C.theme.mute]]
  .filter(([, h]) => /^#/.test(h || ''));
const fluoro = colors.some(([, h]) => { const [r, g, b] = hex2rgb(h); return Math.max(r, g, b) > 200 && Math.min(r, g, b) < 90 && (g > 220 || r > 220); });
const specRows = colors.map(([n, h]) => { const rgb = hex2rgb(h), k = cmyk(rgb);
  return `<tr><td><span class="sw" style="background:${h}"></span>${n}</td><td>${h.toUpperCase()}</td><td>${rgb.join(' / ')}</td><td>C${k[0]} M${k[1]} Y${k[2]} K${k[3]}</td></tr>`; }).join('');
const files = fs.readdirSync(out).filter(f => !f.startsWith('06_')).sort();
const spec = `<!doctype html><html><head><meta charset="utf-8"><style>
  @page{size:A4;margin:16mm} body{font:10pt/1.6 "Noto Sans CJK SC",sans-serif;color:#111}
  h1{font-size:20pt;margin:0 0 2mm} h2{page-break-after:avoid;break-after:avoid;font-size:12pt;margin:8mm 0 2mm;border-left:3mm solid ${C.theme.accent};padding-left:2mm}
  table{border-collapse:collapse;width:100%;break-inside:avoid} td,th{border:0.2mm solid #ccc;padding:1.6mm 2mm;text-align:left;font-size:9pt}
  .sw{display:inline-block;width:6mm;height:6mm;border:0.2mm solid #999;vertical-align:middle;margin-right:2mm}
  .row{display:flex;gap:8mm;align-items:flex-start} .row img{height:62mm;border:0.2mm solid #ddd}
  .note{background:#f6f6f6;padding:3mm;border-radius:2mm;font-size:9pt}
</style></head><body>
<h1>${cfg.name} · 工牌物料设计规范</h1>
<div>生成日期：${new Date().toISOString().slice(0, 10)} · 由 Lanyard Badge Studio 导出</div>
<h2>效果预览</h2><div class="row"><img src="${front}"><img src="${back}"></div>
<h2>尺寸</h2><table>
<tr><th>物料</th><th>成品尺寸</th><th>出血</th><th>分辨率</th><th>文件</th></tr>
<tr><td>工牌卡片（插卡）</td><td>${cw} × ${ch} mm（竖版）</td><td>四边各 ${bleed} mm</td><td>${dpi} dpi</td><td>01 / 02 / 03${args.people ? ' / 04' : ''}</td></tr>
<tr><td>名片</td><td>90 × 54 mm（横版）</td><td>四边各 ${bleed} mm</td><td>${dpi} dpi</td><td>07 / 08</td></tr>
<tr><td>挂绳</td><td>${lw} × ${ll} mm</td><td>四边各 2 mm</td><td>300 dpi</td><td>05</td></tr>
</table>
<h2>颜色</h2><table><tr><th>名称</th><th>HEX</th><th>RGB</th><th>CMYK（参考换算）</th></tr>${specRows}</table>
<p class="note">CMYK 为按公式换算的参考值，不同纸张、油墨和印刷机结果会有差异，<b>请务必先打样确认</b>。${fluoro ? '<br>⚠ 主色属于荧光 / 高饱和色，普通四色印刷（CMYK）印不出屏幕上的荧光效果，会偏暗偏黄。想要接近效果，请和印刷厂确认使用 <b>荧光专色油墨</b> 或指定潘通（Pantone）专色，并以实物色卡对色。' : ''}</p>
<h2>字体</h2><table><tr><th>用途</th><th>字体</th><th>授权</th></tr>
<tr><td>中文</td><td>${C.fonts.cjk}（思源黑体 / Noto Sans CJK SC）</td><td>SIL Open Font License，可商用</td></tr>
<tr><td>英文 / 数字</td><td>${C.fonts.latin}（Inter）</td><td>SIL Open Font License，可商用</td></tr></table>
<p class="note">导出文件中文字已转为图像，印刷厂无需另装字体。如需矢量文件（AI / CDR）二次修改，请用上述同名字体重排。</p>
<h2>工艺建议</h2><table>
<tr><td>卡片</td><td>PVC 卡 0.76 mm 或 300g 铜版纸覆哑膜；四角圆角 R3 mm（模切）；插入透明卡套使用</td></tr>
<tr><td>卡套</td><td>透明硬胶 / 亚克力竖版卡套，内径约 ${(cw + 2).toFixed(0)} × ${(ch + 2).toFixed(0)} mm，配伸缩易拉扣</td></tr>
<tr><td>名片</td><td>350g 特种纸 / 铜版纸覆膜，可加烫金或局部 UV</td></tr>
<tr><td>挂绳</td><td>${lw} mm 宽涤纶织带，热转印双面印；金属钩 + 伸缩扣</td></tr></table>
<h2>文件清单</h2><table>${files.map(f => `<tr><td>${f}</td></tr>`).join('')}<tr><td>06_设计规范.pdf（本文件）</td></tr></table>
</body></html>`;
{
  const p = await browser.newPage(); await p.setContent(spec, { waitUntil: 'load' });
  await p.pdf({ path: path.join(out, '06_设计规范.pdf'), format: 'A4', printBackground: true, margin: { top: '0', bottom: '0', left: '0', right: '0' } });
  await p.close();
}
fs.writeFileSync(path.join(out, '给印刷厂的说明.txt'),
`${cfg.name} 工牌物料印刷包
================================
1. 工牌卡片：成品 ${cw}×${ch}mm 竖版，四边出血 ${bleed}mm，${dpi}dpi。
   - 01/02 *_裁切线.pdf：带裁切线，直接拼版印刷
   - 03 出血版 PDF：无裁切线，正反两页
   - *_出血_600dpi.png：位图原图${args.people ? '\n   - 04 批量背面 PDF + 批量背面/ 文件夹：每人一张' : ''}
2. 名片：90×54mm 横版，见 07（正反面带裁切线 PDF，含每人背面）/ 08。\n3. 挂绳：${lw}×${ll}mm，300dpi，见 05。
4. 颜色、字体、工艺：见 06_设计规范.pdf。
${fluoro ? '5. 主色为荧光色，CMYK 无法还原，请用荧光专色或指定潘通色，务必先打样。\n' : ''}`);
await browser.close();
console.log(`\n✓ print package → ${out}`);
fs.readdirSync(out).forEach(f => console.log('  ' + f));
