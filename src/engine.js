/*!
 * Lanyard Badge Studio — render engine
 * One brand config  →  badge animation frames, stills, poster, banner,
 * print-ready card faces (front / back) and lanyard strip.
 * Pure Canvas 2D. Runs in any modern browser and in headless Chromium (Playwright).
 * MIT License.
 */
(function (global) {
  'use strict';

  // ---------------------------------------------------------------- defaults
  const DEFAULT_CONFIG = {
    name: '湾区AI日历',
    theme: {
      accent: '#D8FF3E',      // main brand colour (lanyard, highlights)
      accent2: '#A8E62E',     // secondary accent
      bg: '#0A0A0A',          // page / card background
      text: '#FFFFFF',
      mute: '#8A8579',
      dim: '#C2BDB1',
      holder: 'rgba(235,240,230,.94)', // clear plastic card holder tint
      giant: null,            // colour of the giant background word (defaults to accent)
      mode: 'dark'            // dark | light
    },
    fonts: { cjk: 'Noto Sans CJK SC', latin: 'Inter Display' },
    logo: null,               // data URL / image URL, shown on the card header
    header: {
      title: '湾区AI日历',
      sub: '01 / AI PASS · GBA',
      right: ['记录大湾区 AI 活动、赛事', '与每一位 AI 开发者的故事']
    },
    giantWord: 'WQAI',
    tags: ['今日 AI 活动', '黑客松现场', '全城赛事，日日更新', '从想法到产品', '一个湾区、许多故事', '一起创造、一起学习',
      '本周报名中', '深·广·港·澳', '湾区 AI 人', '活动不迷路，赛事不错过', '开发者的日常', '你的 AI 工牌已到账'],
    strap: ['WQAI · GBA', '湾区AI日历'],
    card: {
      brand: '湾区AI日历',
      corner: 'NO. 2026',
      kicker: '01 / AI PASS',
      headline: ['AI EVENTS', 'IN THE '],
      highlight: 'BAY',
      hero: { type: 'calendar', highlights: [3, 9, 12, 17, 24], today: 26, image: null },
      bandTitle: '湾区 AI 日历',
      bandSub: 'GBA · AI EVENTS & CONTESTS'
    },
    back: {
      name: '姓名 NAME',
      title: '职位 / TITLE',
      id: 'NO. 0001',
      note: '凭此卡出入活动现场 · 请妥善保管'
    },
    pulse: '湾区 AI 日历',
    credit: 'Created by 湾区AI日历 · Greater Bay Area AI Events Calendar',
    poster: {
      kicker: '01 / GBA AI EVENTS CALENDAR',
      title: ['湾区', 'AI 日历'],
      sub: ['AI 活动 · 赛事 · 黑客松', '深广港澳 · 每周更新'],
      handle: '@湾区AI日历',
      channels: '公众号 · 小红书 · 日历订阅',
      tags: ['今日 AI 活动', '黑客松现场', '一人公司 OPC', '湾区 AI 人', '赛事报名中', '深·广·港·澳']
    },
    motion: {
      duration: 7.6,     // seconds per loop
      dropAt: 2.0,       // when the badge starts falling
      fall: 0.36,        // fall time
      swing: 0.36,       // lanyard swing amplitude (rad)
      cardLag: 0.44,     // card rotation relative to the lanyard (rad)
      twist: 0.55,       // 3D yaw twist amplitude (rad)
      damping: 1.45,     // bigger = settles faster
      pulseAt: 4.55,     // brand text zoom-in / zoom-out
      exitAt: 6.5,       // badge pulled back up
      settleAt: 4.2      // a calm frame: used for previews & cover-first videos
    }
  };

  const W = 720, H = 1280;

  // ---------------------------------------------------------------- state
  let C = clone(DEFAULT_CONFIG);
  const IMG = {};        // loaded images: logo, hero
  let YAW = 0;

  function clone(o) { return JSON.parse(JSON.stringify(o)); }
  function merge(base, over) {
    if (over === null || over === undefined) return base;
    if (Array.isArray(over) || typeof over !== 'object') return over;
    const out = Array.isArray(base) ? [] : Object.assign({}, base);
    for (const k of Object.keys(over)) out[k] = merge(base ? base[k] : undefined, over[k]);
    return out;
  }
  const T = () => C.theme;
  const CJK = () => `"${C.fonts.cjk}","Noto Sans CJK SC","Noto Sans SC","PingFang SC","Microsoft YaHei",sans-serif`;
  const LAT = () => `"${C.fonts.latin}","Inter",Arial,sans-serif`;
  const MIX = () => `"${C.fonts.latin}","Inter","${C.fonts.cjk}","Noto Sans CJK SC","Noto Sans SC","PingFang SC",sans-serif`;
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const easeOutBack = t => { const s = 1.9; t -= 1; return t * t * ((s + 1) * t + s) + 1; };
  const easeOutCubic = t => 1 - Math.pow(1 - t, 3);
  const easeInCubic = t => t * t * t;

  function hexToRgb(hex) {
    const h = hex.replace('#', '');
    const n = parseInt(h.length === 3 ? h.split('').map(c => c + c).join('') : h, 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  }
  const A = (hex, a) => { const [r, g, b] = hexToRgb(hex); return `rgba(${r},${g},${b},${a})`; };
  const dark = () => T().mode !== 'light';

  function rr(c, x, y, w, h, r) {
    r = Math.min(r, w / 2, h / 2);
    c.beginPath(); c.moveTo(x + r, y); c.arcTo(x + w, y, x + w, y + h, r); c.arcTo(x + w, y + h, x, y + h, r);
    c.arcTo(x, y + h, x, y, r); c.arcTo(x, y, x + w, y, r); c.closePath();
  }

  function loadImage(src) {
    return new Promise((res) => {
      if (!src) return res(null);
      const im = new Image(); im.crossOrigin = 'anonymous';
      im.onload = () => res(im); im.onerror = () => res(null); im.src = src;
    });
  }

  async function setConfig(cfg) {
    C = merge(clone(DEFAULT_CONFIG), cfg || {});
    if (!C.theme.giant) C.theme.giant = dark() ? C.theme.accent : C.theme.bg;
    IMG.logo = await loadImage(C.logo);
    IMG.hero = await loadImage(C.card.hero && C.card.hero.image);
    if (global.document && document.fonts) {
      const fams = [CJK(), LAT()];
      await Promise.all([400, 500, 600, 700, 800, 900].flatMap(w => fams.map(f => document.fonts.load(`${w} 40px ${f}`, '湾区AI日历 ABC').catch(() => 0))));
    }
    return C;
  }

  // ---------------------------------------------------------------- tags
  const SLOTS = [[520, 250], [150, 300], [530, 345], [140, 380], [535, 425], [130, 460],
    [120, 900], [610, 862], [605, 940], [125, 985], [600, 1030], [125, 1070]];
  function tagLayout() {
    const tags = (C.tags || []).slice(0, 12), n = tags.length;
    const nTop = Math.ceil(n / 2), nBot = n - nTop, out = [];
    for (let i = 0; i < nTop; i++) out.push([...SLOTS[i], tags[i], true]);
    for (let i = 0; i < nBot; i++) out.push([...SLOTS[6 + i], tags[nTop + i], false]);
    return out;
  }

  function pill(c, x, y, text, s, a) {
    if (s <= 0.001 || a <= 0.001) return;
    c.save(); c.globalAlpha = a; c.translate(x, y); c.scale(s, s);
    c.font = `600 19px ${CJK()}`;
    const w = c.measureText(text).width + 46, h = 38;
    rr(c, -w / 2, -h / 2, w, h, h / 2); c.fillStyle = dark() ? '#111' : '#fff'; c.fill();
    c.lineWidth = 1.6; c.strokeStyle = dark() ? T().accent : T().bg; c.stroke();
    c.fillStyle = dark() ? T().accent : T().accent2; c.beginPath(); c.arc(-w / 2 + 18, 0, 4, 0, 7); c.fill();
    if (dark()) { c.shadowColor = T().accent; c.shadowBlur = 8; c.fill(); c.shadowBlur = 0; }
    c.fillStyle = dark() ? T().accent : T().bg; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText(text, 7, 1);
    c.restore();
  }

  function dotGrid(c, w, h, step, size, color) {
    c.fillStyle = color; for (let y = step / 2; y < h; y += step) for (let x = step / 2; x < w; x += step) c.fillRect(x, y, size, size);
  }
  function glowBlob(c, w, h, x, y, r, a) {
    const g = c.createRadialGradient(x, y, 0, x, y, r); g.addColorStop(0, A(T().accent, a)); g.addColorStop(1, A(T().accent, 0));
    c.fillStyle = g; c.fillRect(0, 0, w, h);
  }

  // ---------------------------------------------------------------- background scene
  function background(c, t) {
    const M = C.motion, th = T();
    c.fillStyle = dark() ? th.bg : '#F4F6FB'; c.fillRect(0, 0, W, H);
    if (dark()) { glowBlob(c, W, H, 150, 180, 360, .16); glowBlob(c, W, H, 600, 1050, 420, .12); }
    dotGrid(c, W, H, 40, 2, dark() ? A(th.accent, .07) : 'rgba(10,10,10,.06)');
    c.textBaseline = 'alphabetic';
    c.fillStyle = dark() ? th.accent : th.bg; c.beginPath(); c.arc(42, 56, 5, 0, 7); c.fill();
    c.fillStyle = dark() ? th.text : th.bg; c.font = `800 18px ${CJK()}`; c.textAlign = 'left'; c.fillText(C.header.title, 56, 62);
    c.fillStyle = th.mute; c.font = `600 13px ${MIX()}`; c.fillText(C.header.sub, 36, 88);
    c.textAlign = 'right'; c.font = `500 16px ${CJK()}`;
    (C.header.right || []).forEach((l, i) => c.fillText(l, W - 36, 62 + i * 24));

    // giant word — letters rise one by one
    const end = M.exitAt + 0.45;
    c.save(); c.fillStyle = th.giant; c.textAlign = 'left';
    let fs = 236; c.font = `900 ${fs}px ${MIX()}`;
    let tw = c.measureText(C.giantWord).width;
    if (tw > 680) { fs = Math.floor(fs * 680 / tw); c.font = `900 ${fs}px ${MIX()}`; tw = c.measureText(C.giantWord).width; }
    let x = W / 2 - tw / 2; const outA = 1 - clamp((t - end) / 0.3, 0, 1);
    [...C.giantWord].forEach((ch, i) => {
      const cw = c.measureText(ch).width, u = clamp((t - 1.2 - i * 0.08) / 0.5, 0, 1), e = easeOutCubic(u);
      if (u > 0) {
        c.save(); c.globalAlpha = Math.min(1, u * 1.6) * outA; c.translate(x + cw / 2, 800 + 70 * (1 - e));
        const sc = 0.82 + 0.18 * easeOutBack(u); c.scale(sc, sc); c.fillText(ch, -cw / 2, 0); c.restore();
      }
      x += cw;
    });
    c.restore();

    c.fillStyle = th.mute; c.textAlign = 'center'; c.font = `500 15px ${CJK()}`; c.fillText(C.credit || '', W / 2, 1246);

    // brand pulse (zoom in → zoom out)
    let sc = 1, glow = 0;
    if (t > M.pulseAt && t < M.pulseAt + 0.9) { const u = (t - M.pulseAt) / 0.9, e = Math.sin(Math.PI * u); sc += 0.62 * e * e * (3 - 2 * e); glow = e; }
    if (t > end) sc *= Math.max(0, 1 - (t - end) / 0.3);
    sc *= easeOutBack(clamp((t - 1.55) / 0.45, 0, 1));
    if (sc > 0.001 && C.pulse) {
      c.save(); c.translate(W / 2, 1170); c.scale(sc, sc);
      c.font = `900 40px ${MIX()}`; c.textAlign = 'center'; c.textBaseline = 'middle';
      const pw = c.measureText(C.pulse).width;
      c.fillStyle = dark() ? th.accent : th.bg; c.beginPath(); c.arc(-pw / 2 - 22, 2, 6, 0, 7); c.fill();
      c.shadowColor = th.accent; c.shadowBlur = dark() ? 10 + 26 * glow : 0; c.fillText(C.pulse, 0, 2); c.shadowBlur = 0;
      c.strokeStyle = A(th.accent, .5); c.lineWidth = 1.5; c.beginPath(); c.moveTo(-pw / 2, 28); c.lineTo(pw / 2, 28); c.stroke();
      c.restore();
    }

    // tags float in (top group from above, bottom group from below), drift, then leave
    tagLayout().forEach(([px, py, text, top], i) => {
      const order = top ? (5 - i) : (i - 6);
      const st = 0.3 + order * 0.08, u = clamp((t - st) / 0.6, 0, 1), e = easeOutCubic(u);
      let a = Math.min(1, u * 1.5), off = (top ? -60 : 60) * (1 - e);
      const uo = clamp((t - (end + order * 0.03)) / 0.3, 0, 1); a *= 1 - uo; off += (top ? -40 : 40) * easeInCubic(uo);
      pill(c, px + Math.cos(t * 1.1 + i) * 1.6, py + off + Math.sin(t * 1.6 + i * 1.3) * 3.2, text, 1, a);
    });
  }

  // ---------------------------------------------------------------- lanyard parts
  function strapTexture(c, w, len, opt) {
    // draws a vertical strap from y=-len to 0, centred on x=0
    const th = T(); opt = opt || {};
    c.fillStyle = th.accent; c.fillRect(-w / 2, -len, w, len);
    if (!opt.flat) {
      const g = c.createLinearGradient(-w / 2, 0, w / 2, 0);
      g.addColorStop(0, 'rgba(0,0,0,.16)'); g.addColorStop(.35, 'rgba(255,255,255,.18)'); g.addColorStop(1, 'rgba(0,0,0,.12)');
      c.fillStyle = g; c.fillRect(-w / 2, -len, w, len);
    }
    const k = w / 50, words = C.strap && C.strap.length ? C.strap : [C.name];
    c.fillStyle = th.bg; c.textAlign = 'center'; c.textBaseline = 'middle';
    let i = 0;
    for (let y = -80 * k; y > -len; y -= 135 * k) {
      c.save(); c.translate(0, y); c.rotate(Math.PI / 2);
      c.font = `900 ${(i % 2 ? 17 : 21) * k}px ${MIX()}`; c.fillText(words[i % words.length], 0, 1); c.restore(); i++;
    }
  }
  function strap(c, len) {
    c.save(); c.beginPath(); c.rect(-25, -len, 50, len - 30); c.clip();
    strapTexture(c, 50, len); c.restore();
    c.fillStyle = '#B9BDB0'; rr(c, -20, -36, 40, 22, 6); c.fill();
  }
  function reel(c) {
    c.save(); c.shadowColor = 'rgba(0,0,0,.45)'; c.shadowBlur = 16; c.shadowOffsetY = 6;
    c.beginPath(); c.arc(0, 0, 40, 0, 7); c.fillStyle = '#1A1A1A'; c.fill(); c.restore();
    const g = c.createRadialGradient(-12, -14, 4, 0, 0, 40); g.addColorStop(0, '#3A3A3A'); g.addColorStop(1, '#141414');
    c.beginPath(); c.arc(0, 0, 40, 0, 7); c.fillStyle = g; c.fill();
    c.beginPath(); c.arc(0, 0, 26, 0, 7); c.strokeStyle = A(T().accent, .6); c.lineWidth = 2; c.stroke();
    c.fillStyle = T().accent; c.beginPath(); c.arc(0, 0, 5, 0, 7); c.fill();
    c.fillStyle = '#1A1A1A'; c.fillRect(-9, 36, 18, 22); c.strokeStyle = '#333'; c.strokeRect(-9, 36, 18, 22);
  }

  // ---------------------------------------------------------------- card faces
  // Card face designed on a 272 x 370 reference box; scales to any size.
  // opt.print: square corners + no glare.  opt.bleed: px of bleed drawn around (x,y,w,h).
  function cardFront(c, x, y, w, h, opt) {
    opt = opt || {}; const th = T(), b = opt.bleed || 0, k = w / 272, cd = C.card;
    c.save();
    if (!opt.print) { rr(c, x, y, w, h, 12 * k); c.clip(); } else { c.beginPath(); c.rect(x - b, y - b, w + 2 * b, h + 2 * b); c.clip(); }
    c.fillStyle = th.bg; c.fillRect(x - b, y - b, w + 2 * b, h + 2 * b);
    const gw = c.createRadialGradient(x + w, y, 0, x + w, y, 240 * k); gw.addColorStop(0, A(th.accent, .22)); gw.addColorStop(1, A(th.accent, 0));
    c.fillStyle = gw; c.fillRect(x - b, y - b, w + 2 * b, h + 2 * b);
    c.strokeStyle = 'rgba(255,255,255,.05)'; c.lineWidth = 1 * k;
    for (let gx = x - b; gx < x + w + b; gx += 17 * k) { c.beginPath(); c.moveTo(gx, y - b); c.lineTo(gx, y + h + b); c.stroke(); }
    for (let gy = y - b; gy < y + h + b; gy += 17 * k) { c.beginPath(); c.moveTo(x - b, gy); c.lineTo(x + w + b, gy); c.stroke(); }

    // header
    c.textBaseline = 'middle'; c.textAlign = 'left';
    let hx = x + 24 * k;
    if (IMG.logo) {
      const lh = 22 * k, lw = lh * IMG.logo.width / IMG.logo.height; c.drawImage(IMG.logo, x + 18 * k, y + 30 * k - lh / 2, lw, lh); hx = x + 18 * k + lw + 8 * k;
    } else {
      c.fillStyle = th.accent; c.beginPath(); c.arc(hx, y + 30 * k, 5 * k, 0, 7); c.fill();
      c.shadowColor = th.accent; c.shadowBlur = 10 * k; c.fill(); c.shadowBlur = 0; hx += 14 * k;
    }
    c.fillStyle = '#fff'; c.font = `900 ${18 * k}px ${CJK()}`; c.fillText(cd.brand, hx, y + 30 * k);
    c.fillStyle = th.mute; c.font = `700 ${11 * k}px ${MIX()}`; c.textAlign = 'right'; c.fillText(cd.corner || '', x + w - 18 * k, y + 30 * k);
    c.strokeStyle = 'rgba(255,255,255,.14)'; c.lineWidth = 1 * k; c.beginPath(); c.moveTo(x + 18 * k, y + 52 * k); c.lineTo(x + w - 18 * k, y + 52 * k); c.stroke();

    // kicker + headline
    c.textAlign = 'left'; c.fillStyle = th.accent; c.fillRect(x + 20 * k, y + 76 * k, 18 * k, 2 * k);
    c.font = `700 ${11 * k}px ${MIX()}`; c.fillText(cd.kicker || '', x + 46 * k, y + 77 * k);
    c.textBaseline = 'alphabetic';
    const lines = cd.headline || [];
    let hs = 38 * k; c.font = `900 ${hs}px ${LAT()}`;
    const maxW = w - 36 * k;
    const widest = Math.max(...lines.map((l, i) => c.measureText(l + (i === lines.length - 1 ? (cd.highlight || '') : '')).width), 1);
    if (widest > maxW) { hs = hs * maxW / widest; c.font = `900 ${hs}px ${MIX()}`; } else c.font = `900 ${hs}px ${MIX()}`;
    let ly = y + 124 * k;
    lines.forEach((l, i) => {
      c.fillStyle = '#fff'; c.fillText(l, x + 18 * k, ly);
      if (i === lines.length - 1 && cd.highlight) { c.fillStyle = th.accent; c.fillText(cd.highlight, x + 18 * k + c.measureText(l).width, ly); }
      ly += hs * 1.05;
    });

    // band
    const bandH = 78 * k, by = y + h - bandH;
    // hero area
    const heroTop = ly - hs * 1.05 + 22 * k, heroBot = by - 8 * k;
    const hero = cd.hero || { type: 'none' };
    if (hero.type === 'calendar') drawCalendar(c, x, heroTop, w, heroBot - heroTop, k, hero);
    else if (hero.type === 'image' && IMG.hero) {
      const ah = heroBot - heroTop, aw = w - 36 * k, s = Math.min(aw / IMG.hero.width, ah / IMG.hero.height);
      const iw = IMG.hero.width * s, ih = IMG.hero.height * s; c.drawImage(IMG.hero, x + (w - iw) / 2, heroTop + (ah - ih) / 2, iw, ih);
    }

    c.fillStyle = th.accent; c.fillRect(x - b, by, w + 2 * b, bandH + b);
    c.fillStyle = th.bg; c.textAlign = 'left'; c.textBaseline = 'alphabetic';
    let bt = 27 * k; c.font = `900 ${bt}px ${CJK()}`;
    const btw = c.measureText(cd.bandTitle).width, room = w - 36 * k - 90 * k;
    if (btw > room) { bt *= room / btw; c.font = `900 ${bt}px ${CJK()}`; }
    c.fillText(cd.bandTitle, x + 18 * k, by + 38 * k);
    c.font = `700 ${11 * k}px ${MIX()}`; c.fillText(cd.bandSub || '', x + 18 * k, by + 60 * k);
    let bx = x + w - 78 * k; for (let i = 0; i < 22; i++) { const bw = ((i * 7) % 3 + 1) * k; c.fillRect(bx, by + 18 * k, bw, 42 * k); bx += bw + 1.6 * k; }
    c.restore();
  }

  function drawCalendar(c, x, top, w, areaH, k, hero) {
    const th = T(), cs = 24 * k, step = 34.6 * k, rowH = 24 * k, gx = x + 20 * k;
    const gridH = 12 * k + 4 * rowH;
    const gy = top + Math.max(0, (areaH - gridH) / 2) + 2 * k;
    c.textBaseline = 'middle'; c.textAlign = 'center'; c.font = `700 ${10 * k}px ${LAT()}`; c.fillStyle = th.mute;
    ['M', 'T', 'W', 'T', 'F', 'S', 'S'].forEach((d, i) => c.fillText(d, gx + i * step + cs / 2, gy));
    const hot = hero.highlights || [], today = hero.today;
    for (let r = 0; r < 4; r++) for (let q = 0; q < 7; q++) {
      const n = r * 7 + q + 1, cx = gx + q * step, cy = gy + 12 * k + r * rowH, ch = cs - 4 * k;
      rr(c, cx, cy, cs, ch, 5 * k);
      if (n === today) { c.fillStyle = th.accent; c.fill(); c.fillStyle = th.bg; }
      else if (hot.includes(n)) { c.strokeStyle = th.accent; c.lineWidth = 1.4 * k; c.stroke(); c.fillStyle = th.accent; }
      else { c.fillStyle = 'rgba(255,255,255,.06)'; c.fill(); c.fillStyle = '#8f8f8f'; }
      c.font = `700 ${10 * k}px ${LAT()}`; c.fillText(String(n), cx + cs / 2, cy + ch / 2 + 1 * k);
    }
  }

  function cardBack(c, x, y, w, h, opt, person) {
    opt = opt || {}; person = Object.assign({}, C.back, person || {});
    const th = T(), b = opt.bleed || 0, k = w / 272;
    c.save();
    if (!opt.print) { rr(c, x, y, w, h, 12 * k); c.clip(); } else { c.beginPath(); c.rect(x - b, y - b, w + 2 * b, h + 2 * b); c.clip(); }
    c.fillStyle = th.bg; c.fillRect(x - b, y - b, w + 2 * b, h + 2 * b);
    const g = c.createRadialGradient(x, y + h, 0, x, y + h, 300 * k); g.addColorStop(0, A(th.accent, .2)); g.addColorStop(1, A(th.accent, 0));
    c.fillStyle = g; c.fillRect(x - b, y - b, w + 2 * b, h + 2 * b);
    c.fillStyle = A(th.accent, .08); for (let gy = y + 10 * k; gy < y + h; gy += 17 * k) for (let gx = x + 10 * k; gx < x + w; gx += 17 * k) c.fillRect(gx, gy, 1.6 * k, 1.6 * k);
    // top accent strip
    c.fillStyle = th.accent; c.fillRect(x - b, y - b, w + 2 * b, 46 * k + b);
    c.fillStyle = th.bg; c.textBaseline = 'middle'; c.textAlign = 'left'; c.font = `900 ${16 * k}px ${CJK()}`; c.fillText(C.card.brand, x + 18 * k, y + 23 * k);
    c.textAlign = 'right'; c.font = `800 ${11 * k}px ${MIX()}`; c.fillText(person.id || '', x + w - 18 * k, y + 23 * k);
    // giant watermark word
    c.save(); c.translate(x + w / 2, y + h * 0.56); c.rotate(-Math.PI / 2); c.textAlign = 'center';
    let gs = 120 * k; c.font = `900 ${gs}px ${MIX()}`; const gw = c.measureText(C.giantWord).width; if (gw > h * 0.8) { gs *= h * 0.8 / gw; c.font = `900 ${gs}px ${MIX()}`; }
    c.lineWidth = 1.2 * k; c.strokeStyle = A(th.accent, .25); c.strokeText(C.giantWord, 0, 0); c.restore();
    // holder info
    c.textAlign = 'left'; c.textBaseline = 'alphabetic';
    const iy = y + h - 150 * k;
    c.fillStyle = th.accent; c.fillRect(x + 18 * k, iy - 60 * k, 18 * k, 2 * k);
    c.fillStyle = th.mute; c.font = `700 ${10 * k}px ${MIX()}`; c.fillText('HOLDER', x + 44 * k, iy - 56 * k);
    let ns = 34 * k; c.font = `900 ${ns}px ${CJK()}`; const nw = c.measureText(person.name).width; if (nw > w - 36 * k) { ns *= (w - 36 * k) / nw; c.font = `900 ${ns}px ${CJK()}`; }
    c.fillStyle = '#fff'; c.fillText(person.name, x + 18 * k, iy);
    c.fillStyle = th.dim; c.font = `600 ${14 * k}px ${CJK()}`; c.fillText(person.title || '', x + 18 * k, iy + 28 * k);
    c.strokeStyle = 'rgba(255,255,255,.14)'; c.lineWidth = 1 * k; c.beginPath(); c.moveTo(x + 18 * k, iy + 50 * k); c.lineTo(x + w - 18 * k, iy + 50 * k); c.stroke();
    c.fillStyle = th.mute; c.font = `500 ${10 * k}px ${CJK()}`; c.fillText(person.note || '', x + 18 * k, iy + 72 * k);
    // bottom band
    c.fillStyle = th.accent; c.fillRect(x - b, y + h - 40 * k, w + 2 * b, 40 * k + b);
    c.fillStyle = th.bg; c.font = `800 ${11 * k}px ${MIX()}`; c.textBaseline = 'middle'; c.fillText(C.card.bandSub || '', x + 18 * k, y + h - 20 * k);
    c.restore();
  }

  // the clear plastic holder with the front face inside
  function holder(c, side, person) {
    const w = 316, h = 436, dk = dark();
    c.save();
    c.translate(0, h / 2); c.transform(Math.cos(YAW), Math.sin(YAW) * 0.10, 0, 1, 0, 0); c.translate(0, -h / 2);
    c.save(); c.shadowColor = dk ? A(T().accent, .18) : 'rgba(10,10,10,.28)'; c.shadowBlur = 36; c.shadowOffsetY = 16;
    rr(c, -w / 2, 0, w, h, 26); c.fillStyle = T().holder; c.fill(); c.restore();
    rr(c, -w / 2, 0, w, h, 26); c.strokeStyle = 'rgba(255,255,255,.7)'; c.lineWidth = 3; c.stroke();
    rr(c, -40, 16, 80, 14, 7); c.fillStyle = 'rgba(10,10,10,.12)'; c.fill();
    if (side === 'back') cardBack(c, -136, 46, 272, 370, {}, person); else cardFront(c, -136, 46, 272, 370);
    c.save(); rr(c, -w / 2, 0, w, h, 26); c.clip();
    const gl = c.createLinearGradient(-w / 2, 0, w / 2, h), gq = clamp(.5 + YAW * 0.9, .12, .88);
    gl.addColorStop(gq - .08, 'rgba(255,255,255,0)'); gl.addColorStop(gq, `rgba(255,255,255,${0.18 + Math.abs(YAW) * 0.35})`); gl.addColorStop(gq + .08, 'rgba(255,255,255,0)');
    c.fillStyle = gl; c.fillRect(-w / 2, 0, w, h); c.restore();
    c.restore();
  }

  // ---------------------------------------------------------------- physics (hand-tuned, see docs/DESIGN_NOTES.md)
  const PX = W / 2, PY = -120, L = 560;
  function pose(t) {
    const M = C.motion; let dy = 0, th = 0, ph = 0, yaw = 0, cord = 0;
    const T0 = M.dropAt, F = M.fall;
    if (t < T0) dy = -1600;
    else if (t < T0 + F) { const u = (t - T0) / F; dy = -1600 * (1 - u * u); th = -0.10 * u; ph = 0.12 * (1 - u); yaw = 0.25 * (1 - u); }
    else {
      const tau = t - T0 - F, w = 7.6, d = M.damping;
      dy = 38 * Math.exp(-7 * tau) * Math.sin(15 * tau);                       // rope catch overshoot
      cord = 58 * (tau / 0.11) * Math.exp(1 - tau / 0.11);                      // reel cord pulled out then retracts
      th = M.swing * Math.exp(-d * tau) * Math.sin(w * tau - 0.28);             // two big left-right swings
      ph = M.cardLag * Math.exp(-d * 1.31 * tau) * Math.sin(w * tau - 1.25);    // card lags behind the lanyard
      yaw = M.twist * Math.exp(-d * 1.1 * tau) * Math.sin(1.32 * w * tau + 0.4); // 3D twist
      const idle = clamp((tau - 1.6) / 1.0, 0, 1);                               // gentle breathing sway
      th += idle * 0.014 * Math.sin(1.9 * t); ph += idle * 0.02 * Math.sin(1.9 * t - 0.8); yaw += idle * 0.05 * Math.sin(1.3 * t);
    }
    if (t > M.exitAt) { const u = clamp((t - M.exitAt) / 0.42, 0, 1); dy = -1800 * easeInCubic(u); th *= 1 - u; yaw *= 1 - u; }
    return { dy, th, ph, yaw, cord };
  }
  function drawBadge(c, P, side) {
    P = Object.assign({ dy: 0, th: 0, ph: 0, yaw: 0, cord: 0 }, P); YAW = P.yaw;
    c.save(); c.translate(PX, PY + P.dy); c.rotate(P.th); c.translate(0, L);
    strap(c, L + 40);
    c.save(); c.translate(0, 56); c.rotate(P.ph);
    c.strokeStyle = '#9A9E92'; c.lineWidth = 3; c.beginPath(); c.moveTo(0, 0); c.lineTo(0, 22 + P.cord); c.stroke();
    c.fillStyle = '#B9BDB0'; c.beginPath(); c.arc(0, 20 + P.cord, 5, 0, 7); c.fill();
    c.translate(0, 20 + P.cord); holder(c, side); c.restore();
    reel(c); c.restore(); YAW = 0;
  }
  function scene(c, t, withBg) { if (withBg !== false) background(c, t); drawBadge(c, pose(t)); }

  // ---------------------------------------------------------------- public renderers
  function mk(w, h) { const cv = document.createElement('canvas'); cv.width = Math.round(w); cv.height = Math.round(h); return cv; }

  // motion-blurred animation frame
  const _fb = {};
  function frame(t, fps, sc) {
    sc = sc || 1; fps = fps || 30;
    if (_fb.sc !== sc) { _fb.sc = sc; _fb.a = mk(W * sc, H * sc); _fb.b = mk(W * sc, H * sc); }
    const a = _fb.a, b = _fb.b, A_ = a.getContext('2d'), B = b.getContext('2d'), N = 8, sh = 0.65 / fps, D = C.motion.duration;
    A_.setTransform(1, 0, 0, 1, 0, 0); A_.clearRect(0, 0, a.width, a.height);
    for (let k = 0; k < N; k++) {
      const ts = t - sh * (k / (N - 1));
      B.setTransform(1, 0, 0, 1, 0, 0); B.clearRect(0, 0, b.width, b.height); B.setTransform(sc, 0, 0, sc, 0, 0);
      scene(B, ((ts % D) + D) % D);
      A_.globalAlpha = 1 / (k + 1); A_.drawImage(b, 0, 0);
    }
    A_.globalAlpha = 1; return a;
  }
  // sharp settled still (no motion blur)
  function still(sc, opt) {
    sc = sc || 1; opt = opt || {}; const cv = mk(W * sc, H * sc), c = cv.getContext('2d'); c.scale(sc, sc);
    if (!opt.transparent) background(c, C.motion.settleAt);
    drawBadge(c, { th: opt.tilt || 0, yaw: opt.yaw || 0 }, opt.side);
    return cv;
  }
  // just the plastic holder + card (front or back), for the interactive 3D viewer
  function holderCanvas(side, sc, person) {
    sc = sc || 2; const cv = mk(380 * sc, 500 * sc), c = cv.getContext('2d'); c.scale(sc, sc); c.translate(190, 24);
    YAW = 0; holder(c, side, person); return cv;
  }
  function badgeOnly(sc) { return trim(still(sc, { transparent: true })); }
  function trim(cv) {
    const c = cv.getContext('2d'), d = c.getImageData(0, 0, cv.width, cv.height).data;
    let x0 = cv.width, x1 = 0, y1 = 0;
    for (let y = 0; y < cv.height; y += 2) for (let x = 0; x < cv.width; x += 2) if (d[(y * cv.width + x) * 4 + 3] > 8) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y > y1) y1 = y; }
    const pad = Math.round(cv.width * 0.03), o = mk(x1 - x0 + 2 * pad, y1 + pad);
    o.getContext('2d').drawImage(cv, x0 - pad, 0, o.width, o.height, 0, 0, o.width, o.height); return o;
  }

  // 3:4 poster (e.g. social profile background)
  function poster(sc) {
    sc = sc || 1; const CW = 1242, CH = 1660, cv = mk(CW * sc, CH * sc), x = cv.getContext('2d'); x.scale(sc, sc);
    const th = T(), P = C.poster;
    x.fillStyle = th.bg; x.fillRect(0, 0, CW, CH);
    glowBlob(x, CW, CH, 250, 300, 700, .20); glowBlob(x, CW, CH, 1050, 1300, 800, .14);
    dotGrid(x, CW, CH, 48, 3, A(th.accent, .07));
    x.save(); x.font = `900 420px ${LAT()}`; x.textAlign = 'center'; x.lineWidth = 3; x.strokeStyle = A(th.accent, .35); x.strokeText(C.giantWord, CW / 2, 1150); x.restore();
    x.textAlign = 'left'; x.textBaseline = 'alphabetic';
    x.fillStyle = th.accent; x.fillRect(80, 250, 40, 4); x.font = `800 28px ${MIX()}`; x.fillText(P.kicker, 140, 262);
    x.fillStyle = '#fff'; x.font = `900 120px ${CJK()}`; (P.title || []).forEach((l, i) => x.fillText(l, 76, 420 + i * 140));
    x.fillStyle = th.accent; x.fillRect(80, 600, 520, 6);
    x.fillStyle = th.dim; x.font = `600 40px ${CJK()}`; x.fillText(P.sub[0] || '', 80, 680);
    x.fillStyle = th.mute; x.font = `500 34px ${CJK()}`; x.fillText(P.sub[1] || '', 80, 735);
    x.save(); x.translate(420, 40); x.scale(1.45, 1.45); drawBadge(x, { dy: -120, th: 0.04, ph: -0.05, yaw: 0.12 }); x.restore();
    const pos = [[250, 880], [230, 980], [270, 1080], [240, 1180], [760, 1390], [1040, 1390]];
    [...new Set([...(P.tags || []), ...(C.tags || [])])].slice(0, 6).forEach((t, i) => { x.save(); x.translate(...pos[i]); x.scale(1.5, 1.5); pill(x, 0, 0, t, 1, 1); x.restore(); });
    x.textAlign = 'center'; x.fillStyle = th.accent; x.font = `900 72px ${MIX()}`; x.shadowColor = th.accent; x.shadowBlur = 24; x.fillText(P.handle.replace(/^@/, '') || C.name, CW / 2, 1540); x.shadowBlur = 0;
    x.fillStyle = th.mute; x.font = `500 28px ${CJK()}`; x.fillText(P.channels || '', CW / 2, 1600);
    return cv;
  }

  // compact 12:5 banner
  function banner(sc) {
    sc = sc || 1; const CW = 1440, CH = 600, cv = mk(CW * sc, CH * sc), x = cv.getContext('2d'); x.scale(sc, sc);
    const th = T(), P = C.poster;
    x.fillStyle = th.bg; x.fillRect(0, 0, CW, CH);
    glowBlob(x, CW, CH, 260, 150, 560, .20); glowBlob(x, CW, CH, 1100, 560, 620, .14);
    dotGrid(x, CW, CH, 40, 3, A(th.accent, .07));
    x.save(); x.font = `900 380px ${LAT()}`; x.textAlign = 'center'; x.lineWidth = 2.5; x.strokeStyle = A(th.accent, .28); x.strokeText(C.giantWord, 930, 480); x.restore();
    x.textAlign = 'left'; x.textBaseline = 'alphabetic';
    x.fillStyle = th.accent; x.fillRect(90, 140, 36, 4); x.font = `800 24px ${MIX()}`; x.fillText(P.kicker, 140, 151);
    x.fillStyle = '#fff'; let ts = 104; x.font = `900 ${ts}px ${CJK()}`; const title = (P.title || []).join(' ');
    const tw = x.measureText(title).width; if (tw > 620) { ts *= 620 / tw; x.font = `900 ${ts}px ${CJK()}`; } x.fillText(title, 84, 280);
    x.fillStyle = th.accent; x.fillRect(90, 312, 560, 5);
    x.fillStyle = th.dim; x.font = `600 38px ${CJK()}`; x.fillText(P.sub[0] || '', 90, 378);
    x.fillStyle = th.mute; x.font = `500 32px ${CJK()}`; x.fillText(P.sub[1] || '', 90, 428);
    x.save(); x.fillStyle = th.accent; x.font = `900 40px ${CJK()}`; x.shadowColor = th.accent; x.shadowBlur = 18; x.fillText(P.handle || '', 90, 506);
    const hw = x.measureText(P.handle || '').width; x.restore();
    x.fillStyle = th.mute; x.font = `500 24px ${CJK()}`; x.fillText(P.channels || '', 90 + hw + 30, 500);
    x.save(); x.translate(930 - 360 * 0.9, -230); x.scale(0.9, 0.9); drawBadge(x, { dy: -120, th: 0.04, ph: -0.07, yaw: 0.1 }); x.restore();
    P.tags.slice(0, 4).forEach((t, i) => { x.save(); x.translate(1250, 150 + i * 100); x.scale(1.3, 1.3); pill(x, 0, 0, t, 1, 1); x.restore(); });
    return cv;
  }

  // ---------------------------------------------------------------- print faces
  // mm → px at a given dpi
  const mm = (v, dpi) => Math.round(v / 25.4 * dpi);
  // card insert: trim size w×h mm with bleed mm on each side
  function printCard(side, o, person) {
    o = Object.assign({ w: 54, h: 85.6, bleed: 3, dpi: 600 }, o || {});
    const tw = mm(o.w, o.dpi), thh = mm(o.h, o.dpi), b = mm(o.bleed, o.dpi);
    const cv = mk(tw + 2 * b, thh + 2 * b), c = cv.getContext('2d');
    if (side === 'back') cardBack(c, b, b, tw, thh, { print: true, bleed: b }, person);
    else cardFront(c, b, b, tw, thh, { print: true, bleed: b });
    return cv;
  }
  // lanyard strip: width × length mm, horizontal artwork (as printers expect for heat-transfer straps)
  function printLanyard(o) {
    o = Object.assign({ w: 20, len: 900, bleed: 2, dpi: 300 }, o || {});
    const wpx = mm(o.w + 2 * o.bleed, o.dpi), lpx = mm(o.len + 2 * o.bleed, o.dpi);
    const cv = mk(lpx, wpx), c = cv.getContext('2d');
    c.translate(0, wpx / 2); c.rotate(-Math.PI / 2); // draw vertical strap then lay it flat
    c.translate(0, lpx); strapTexture(c, wpx, lpx, { flat: true });
    return cv;
  }

  // ---------------------------------------------------------------- url guard
  function findUrls(obj) {
    const hits = [], re = /\b(?:https?:\/\/|www\.)\S+|\b[a-z0-9-]+\.(?:com|cn|net|org|ltd|io|ai|co|app|dev|xyz|top|vip|me|cc)\b/ig;
    (function walk(v, path) {
      if (typeof v === 'string') { if (!v.startsWith('data:')) { const m = v.match(re); if (m) hits.push({ path, match: m }); } }
      else if (v && typeof v === 'object') for (const k of Object.keys(v)) { if (k === 'logo' || k === 'image') continue; walk(v[k], path ? path + '.' + k : k); }
    })(obj, '');
    return hits;
  }

  global.BadgeEngine = {
    W, H, DEFAULT_CONFIG, setConfig, get config() { return C; },
    frame, still, badgeOnly, holderCanvas, scene, poster, banner, printCard, printLanyard,
    cardFront, cardBack, holder, pose, drawBadge, background, findUrls, mm
  };
})(typeof window !== 'undefined' ? window : globalThis);
