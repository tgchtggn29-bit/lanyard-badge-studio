#!/usr/bin/env node
// Zero-dependency server for the studio.
//
//   node scripts/serve.mjs [--port 5173] [--host 127.0.0.1] [--no-open]
//
// Optional hosted AI (visitors can chat with the AI designer without their own key).
// The key stays on the server and is never sent to the browser. Set environment variables:
//   LLM_API_KEY=sk-...            required to enable hosted AI
//   LLM_PROVIDER=deepseek         deepseek | qwen | kimi | glm | siliconflow | openai | claude | openrouter | custom
//   LLM_MODEL=deepseek-chat       optional, defaults per provider
//   LLM_API_URL=https://...       only for LLM_PROVIDER=custom (OpenAI-compatible chat/completions)
//   LLM_PER_IP_DAY=20             requests per visitor IP per day          (default 20)
//   LLM_DAILY_CAP=500             requests per day for the whole site      (default 500)
//   LLM_COOLDOWN_SEC=4            minimum seconds between requests per IP  (default 4)
//   TRUST_PROXY=1                 read the visitor IP from X-Forwarded-For (when behind Nginx / a CDN)
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { exec } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const argv = process.argv.slice(2);
const opt = (k, d) => (argv.includes('--' + k) ? argv[argv.indexOf('--' + k) + 1] : d);
const port = +opt('port', 5173), host = opt('host', '127.0.0.1'), noOpen = argv.includes('--no-open');
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8', '.css': 'text/css; charset=utf-8', '.png': 'image/png', '.jpg': 'image/jpeg',
  '.gif': 'image/gif', '.svg': 'image/svg+xml', '.webp': 'image/webp', '.csv': 'text/csv; charset=utf-8', '.md': 'text/markdown; charset=utf-8' };

// ---------------------------------------------------------------- providers
const PROVIDERS = {
  deepseek: { url: 'https://api.deepseek.com/chat/completions', model: 'deepseek-chat' },
  qwen: { url: 'https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions', model: 'qwen-plus' },
  kimi: { url: 'https://api.moonshot.cn/v1/chat/completions', model: 'moonshot-v1-8k' },
  glm: { url: 'https://open.bigmodel.cn/api/paas/v4/chat/completions', model: 'glm-4-flash' },
  siliconflow: { url: 'https://api.siliconflow.cn/v1/chat/completions', model: 'Qwen/Qwen2.5-72B-Instruct' },
  openai: { url: 'https://api.openai.com/v1/chat/completions', model: 'gpt-4o-mini' },
  claude: { url: 'https://api.anthropic.com/v1/messages', model: 'claude-haiku-5-5', anthropic: true },
  openrouter: { url: 'https://openrouter.ai/api/v1/chat/completions', model: 'openai/gpt-4o-mini' },
  custom: { url: process.env.LLM_API_URL || '', model: process.env.LLM_MODEL || '' }
};
const ALLOWED_HOSTS = new Set([...Object.values(PROVIDERS).map(p => p.url && new URL(p.url).host).filter(Boolean),
  ...(process.env.LLM_PROXY_HOSTS || '').split(',').map(s => s.trim()).filter(Boolean)]);

const HOSTED = process.env.LLM_API_KEY ? (() => {
  const name = process.env.LLM_PROVIDER || 'deepseek', P = PROVIDERS[name] || PROVIDERS.deepseek;
  return { name, key: process.env.LLM_API_KEY, url: process.env.LLM_API_URL || P.url, model: process.env.LLM_MODEL || P.model, anthropic: !!P.anthropic };
})() : null;
const LIMIT = { perIpDay: +(process.env.LLM_PER_IP_DAY || 20), dailyCap: +(process.env.LLM_DAILY_CAP || 500), cooldown: +(process.env.LLM_COOLDOWN_SEC || 4) * 1000,
  maxUserChars: 400, maxBodyBytes: 60000, maxTokens: 1500, maxMessages: 20 };

// ---------------------------------------------------------------- rate limiting
const today = () => new Date().toISOString().slice(0, 10);
let site = { day: today(), n: 0 }; const ips = new Map();
function clientIp(req) { return (process.env.TRUST_PROXY && (req.headers['x-forwarded-for'] || '').split(',')[0].trim()) || req.socket.remoteAddress || '?'; }
function take(req) {
  const d = today(); if (site.day !== d) { site = { day: d, n: 0 }; ips.clear(); }
  const ip = clientIp(req), e = ips.get(ip) || { n: 0, last: 0 }, now = Date.now();
  if (site.n >= LIMIT.dailyCap) return { ok: false, msg: '今天的体验额度已经用完啦，明天再来，或在 ⚙ 里填你自己的 API Key。' };
  if (e.n >= LIMIT.perIpDay) return { ok: false, msg: `每人每天可以免费使用 ${LIMIT.perIpDay} 次 AI 设计，今天的次数用完了。可以在 ⚙ 里填你自己的 API Key 继续。` };
  if (now - e.last < LIMIT.cooldown) return { ok: false, msg: '发得太快啦，稍等几秒再试。' };
  e.n++; e.last = now; ips.set(ip, e); site.n++;
  return { ok: true, remaining: LIMIT.perIpDay - e.n };
}
const json = (res, code, obj) => { res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8' }); res.end(JSON.stringify(obj)); };
async function readBody(req) { let raw = '', n = 0; for await (const ch of req) { n += ch.length; if (n > LIMIT.maxBodyBytes) throw new Error('请求太大'); raw += ch; } return raw; }
const isLocal = req => ['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(req.socket.remoteAddress) && !req.headers['x-forwarded-for'];

// POST /api/ai  { messages }  → hosted AI with the server's own key (rate-limited)
async function hostedAI(req, res) {
  if (!HOSTED) return json(res, 404, { error: { message: '这个站点没有开启体验额度，请在 ⚙ 里填你自己的 API Key。' } });
  let messages;
  try {
    messages = JSON.parse(await readBody(req)).messages;
    if (!Array.isArray(messages) || !messages.length || messages.length > LIMIT.maxMessages) throw new Error('bad messages');
    const last = messages[messages.length - 1];
    const userText = String(last.content || '').split('用户：').pop();
    if (userText.length > LIMIT.maxUserChars) throw new Error(`一次最多 ${LIMIT.maxUserChars} 字`);
  } catch (e) { return json(res, 400, { error: { message: String(e.message || e) } }); }
  const t = take(req); if (!t.ok) return json(res, 429, { error: { message: t.msg } });
  try {
    let r;
    if (HOSTED.anthropic) {
      const system = messages.filter(m => m.role === 'system').map(m => m.content).join('\n');
      r = await fetch(HOSTED.url, { method: 'POST', headers: { 'content-type': 'application/json', 'x-api-key': HOSTED.key, 'anthropic-version': '2023-06-01' },
        body: JSON.stringify({ model: HOSTED.model, max_tokens: LIMIT.maxTokens, system, messages: messages.filter(m => m.role !== 'system') }) });
    } else {
      r = await fetch(HOSTED.url, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + HOSTED.key },
        body: JSON.stringify({ model: HOSTED.model, messages, temperature: 0.7, max_tokens: LIMIT.maxTokens }) });
    }
    const j = await r.json();
    if (!r.ok || j.error) return json(res, 502, { error: { message: (j.error && (j.error.message || j.error.type)) || 'AI 服务出错' } });
    const content = HOSTED.anthropic ? (j.content || []).map(c => c.text || '').join('') : j.choices?.[0]?.message?.content || '';
    json(res, 200, { content, remaining: t.remaining });
  } catch (e) { json(res, 502, { error: { message: String(e.message || e) } }); }
}

// POST /api/llm  { url, headers, body }  → forwards a request made with the visitor's OWN key.
// Many model APIs block direct browser calls (CORS); this avoids that. Only known AI provider hosts are allowed,
// and when the server is public it is rate-limited like the hosted AI.
async function byokProxy(req, res) {
  try {
    const { url, headers, body } = JSON.parse(await readBody(req));
    const u = new URL(url);
    if (u.protocol !== 'https:' || !ALLOWED_HOSTS.has(u.host)) throw new Error('不支持的接口地址：' + u.host + '（可用环境变量 LLM_PROXY_HOSTS 放行）');
    if (!isLocal(req)) { const t = take(req); if (!t.ok) return json(res, 429, { error: { message: t.msg } }); }
    const b = typeof body === 'string' ? JSON.parse(body) : body;
    if (b.max_tokens) b.max_tokens = Math.min(b.max_tokens, LIMIT.maxTokens);
    const r = await fetch(url, { method: 'POST', headers, body: JSON.stringify(b) });
    res.writeHead(r.status, { 'Content-Type': r.headers.get('content-type') || 'application/json' }); res.end(await r.text());
  } catch (e) { json(res, 400, { error: { message: String(e.message || e) } }); }
}

http.createServer((req, res) => {
  if (req.url === '/api/ping') return json(res, 200, { ok: true, hosted: HOSTED ? { provider: HOSTED.name, model: HOSTED.model, perDay: LIMIT.perIpDay } : null, maxChars: LIMIT.maxUserChars });
  if (req.url === '/api/ai' && req.method === 'POST') return hostedAI(req, res);
  if (req.url === '/api/llm' && req.method === 'POST') return byokProxy(req, res);
  let p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  if (p === '/') { res.writeHead(302, { Location: '/studio/' }); return res.end(); }
  if (p.endsWith('/')) p += 'index.html';
  const file = path.join(ROOT, path.normalize(p));
  if (!file.startsWith(ROOT) || /[\\/]\.(git|env)/.test(file)) { res.writeHead(403); return res.end(); }
  fs.readFile(file, (err, buf) => {
    if (err) { res.writeHead(404); return res.end('not found'); }
    res.writeHead(200, { 'Content-Type': TYPES[path.extname(file).toLowerCase()] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
    res.end(buf);
  });
}).listen(port, host, () => {
  const url = `http://localhost:${port}/studio/`;
  console.log(`\n  Lanyard Badge Studio → ${url}`);
  console.log(HOSTED ? `  体验额度 AI：${HOSTED.name} / ${HOSTED.model} · 每 IP 每天 ${LIMIT.perIpDay} 次 · 全站每天 ${LIMIT.dailyCap} 次` : '  AI：访客需在 ⚙ 里填自己的 Key（设置 LLM_API_KEY 可开启体验额度）');
  console.log('  (Ctrl+C 停止)\n');
  if (!noOpen) exec(process.platform === 'win32' ? `start "" "${url}"` : process.platform === 'darwin' ? `open "${url}"` : `xdg-open "${url}"`);
});
