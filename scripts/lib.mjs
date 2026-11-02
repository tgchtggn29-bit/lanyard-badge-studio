// Shared helpers: load a brand config into the headless render page.
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

export function parseArgs(argv) {
  const a = {};
  for (let i = 0; i < argv.length; i++) {
    const k = argv[i];
    if (!k.startsWith('--')) continue;
    const key = k.slice(2), v = argv[i + 1];
    if (v === undefined || v.startsWith('--')) a[key] = true; else { a[key] = v; i++; }
  }
  return a;
}

const MIME = { '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.svg': 'image/svg+xml', '.webp': 'image/webp' };
function toDataURL(p, baseDir) {
  if (!p || p.startsWith('data:') || /^https?:/.test(p)) return p;
  const abs = path.resolve(baseDir, p);
  if (!fs.existsSync(abs)) { console.warn(`! image not found: ${abs}`); return null; }
  return `data:${MIME[path.extname(abs).toLowerCase()] || 'application/octet-stream'};base64,${fs.readFileSync(abs).toString('base64')}`;
}

export function loadConfig(file) {
  const abs = path.resolve(file);
  const cfg = JSON.parse(fs.readFileSync(abs, 'utf8'));
  const dir = path.dirname(abs);
  if (cfg.logo) cfg.logo = toDataURL(cfg.logo, dir);
  if (cfg.card && cfg.card.hero && cfg.card.hero.image) cfg.card.hero.image = toDataURL(cfg.card.hero.image, dir);
  return cfg;
}

export async function openEngine(cfg) {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  page.on('pageerror', e => console.error('page error:', e.message));
  await page.goto(pathToFileURL(path.join(ROOT, 'src', 'page.html')).href);
  const urls = await page.evaluate(async c => { await BadgeEngine.setConfig(c); return BadgeEngine.findUrls(c); }, cfg);
  return { browser, page, urls };
}

// evaluate an engine expression that returns a canvas, save it
export async function saveCanvas(page, expr, file, type = 'image/png', q) {
  const data = await page.evaluate(([e, t, qq]) => (new Function('E', 'return ' + e))(BadgeEngine).toDataURL(t, qq), [expr, type, q]);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, Buffer.from(data.split(',')[1], 'base64'));
  return file;
}

export function ffmpegBin() {
  if (process.env.FFMPEG) return process.env.FFMPEG;
  const probe = spawnSync('ffmpeg', ['-version']);
  if (probe.status === 0) return 'ffmpeg';
  throw new Error('ffmpeg not found. Install it (brew install ffmpeg / apt install ffmpeg / winget install ffmpeg) or set FFMPEG=/path/to/ffmpeg');
}

export function ff(args) {
  const r = spawnSync(ffmpegBin(), ['-v', 'error', '-y', ...args], { stdio: 'inherit' });
  if (r.status !== 0) throw new Error('ffmpeg failed: ' + args.join(' '));
}

export const slug = s => (s || 'badge').toString().trim().replace(/[\\/:*?"<>|\s]+/g, '-');
export const kb = f => (fs.statSync(f).size / 1024 / 1024).toFixed(1) + 'MB';
