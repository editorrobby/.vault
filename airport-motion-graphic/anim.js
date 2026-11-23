/* Airports — motion graphic.
 * Deterministic canvas renderer: renderAt(t) draws the frame at time t (seconds).
 * Open index.html to preview in real time; render.js captures frames for video.
 * Add ?notext to the URL for a clean (caption-free) version.
 */
'use strict';

// ───────────────────────────── core ─────────────────────────────
const W = 1920, H = 1080;
const cv = document.getElementById('c');
cv.width = W; cv.height = H;
const X = cv.getContext('2d');
const SHOW_TEXT = !/notext/.test(location.search);

const clamp = (v, a = 0, b = 1) => (v < a ? a : v > b ? b : v);
const lerp = (a, b, t) => a + (b - a) * t;
const ramp = (a, b, v) => clamp((v - a) / (b - a));
const E = {
  io: t => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2),
  out: t => 1 - Math.pow(1 - t, 3),
  out5: t => 1 - Math.pow(1 - t, 5),
  in: t => t * t * t,
  in2: t => t * t,
  s: t => t * t * (3 - 2 * t),
  sine: t => 0.5 - 0.5 * Math.cos(Math.PI * t),
};
function rng(a) {
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function mk(w, h) { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; }
function rgb(c) {
  if (Array.isArray(c)) return c;
  const h = c.replace('#', '');
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
}
function mix(a, b, t) { a = rgb(a); b = rgb(b); return [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)]; }
function css(c, a = 1) { c = rgb(c); return `rgba(${c[0] | 0},${c[1] | 0},${c[2] | 0},${a})`; }
function shade(c, k) { return k < 0 ? mix(c, [0, 0, 0], -k) : mix(c, [255, 255, 255], k); }

function rrect(c, x, y, w, h, r) {
  r = Math.min(r, w / 2, h / 2);
  c.beginPath();
  c.moveTo(x + r, y); c.lineTo(x + w - r, y); c.quadraticCurveTo(x + w, y, x + w, y + r);
  c.lineTo(x + w, y + h - r); c.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  c.lineTo(x + r, y + h); c.quadraticCurveTo(x, y + h, x, y + h - r);
  c.lineTo(x, y + r); c.quadraticCurveTo(x, y, x + r, y); c.closePath();
}
function poly(c, pts) { c.beginPath(); c.moveTo(pts[0], pts[1]); for (let i = 2; i < pts.length; i += 2) c.lineTo(pts[i], pts[i + 1]); c.closePath(); }
function circle(c, x, y, r) { c.beginPath(); c.arc(x, y, Math.max(0.01, r), 0, Math.PI * 2); }
function vgrad(c, y0, y1, stops) { const g = c.createLinearGradient(0, y0, 0, y1); stops.forEach(([o, col]) => g.addColorStop(o, typeof col === 'string' && col.startsWith('rgba') ? col : css(col))); return g; }
function glow(c, x, y, r, col, a) {
  if (a <= 0) return;
  const g = c.createRadialGradient(x, y, 0, x, y, r);
  g.addColorStop(0, css(col, a)); g.addColorStop(0.25, css(col, a * 0.5)); g.addColorStop(1, css(col, 0));
  c.fillStyle = g; c.fillRect(x - r, y - r, r * 2, r * 2);
}
// two-bone IK, returns elbow point. bend = +1/-1 chooses side
function ik(sx, sy, tx, ty, a, b, bend) {
  const dx = tx - sx, dy = ty - sy;
  let d = Math.hypot(dx, dy);
  d = Math.min(d, a + b - 0.01);
  const ang = Math.atan2(dy, dx);
  const cosA = clamp((a * a + d * d - b * b) / (2 * a * d), -1, 1);
  const A = Math.acos(cosA) * bend;
  return [sx + Math.cos(ang + A) * a, sy + Math.sin(ang + A) * a];
}
function stroke2(c, pts, w) { c.lineWidth = w; c.beginPath(); c.moveTo(pts[0], pts[1]); for (let i = 2; i < pts.length; i += 2) c.lineTo(pts[i], pts[i + 1]); c.stroke(); }

// ───────────────────────────── palettes ─────────────────────────────
const PAL = {
  golden: { sky: ['#86b2bd', '#d3dccb', '#f4e1ba', '#f6bf86'], cl: '#fbf1dc', cs: '#d8a690', night: 0, sun: 1, ground: '#9d917b', grass: '#b0a45c', far: '#c9a99a', mid: '#8f7c8c' },
  dusk:   { sky: ['#3e4f80', '#977ea2', '#e59e85', '#f0a26c'], cl: '#f2c2a8', cs: '#8e6a8a', night: 0.35, sun: 0.6, ground: '#6e6274', grass: '#7a6e58', far: '#8a6f88', mid: '#5e4e6c' },
  night:  { sky: ['#050a20', '#0d1840', '#1d2858', '#38386a'], cl: '#2f3a6a', cs: '#1b2350', night: 1, sun: 0, ground: '#181c32', grass: '#141a2c', far: '#252a50', mid: '#1a1f3e' },
  dawn:   { sky: ['#56689c', '#ab9cba', '#f1b6a0', '#f9d39a'], cl: '#ffe3cf', cs: '#c2909f', night: 0.12, sun: 0.85, ground: '#8f8189', grass: '#9a8f6e', far: '#b99aa8', mid: '#7d6c86' },
};
function palMix(a, b, t) {
  const o = {};
  for (const k in a) {
    if (Array.isArray(a[k])) o[k] = a[k].map((c, i) => mix(c, b[k][i], t));
    else if (typeof a[k] === 'number') o[k] = lerp(a[k], b[k], t);
    else o[k] = mix(a[k], b[k], t);
  }
  return o;
}
function skyGrad(c, y0, y1, pal) {
  return vgrad(c, y0, y1, [[0, pal.sky[0]], [0.45, pal.sky[1]], [0.78, pal.sky[2]], [1, pal.sky[3]]]);
}

// ───────────────────────────── stepped "pixel" clouds ─────────────────────────────
function makeCloud(r, w) {
  const n = 3 + Math.floor(r() * 3), rh = 12 + r() * 12;
  const rows = [];
  for (let i = 0; i < n; i++) {
    const ww = i === 0 ? w * (0.25 + r() * 0.3) : w * (0.55 + r() * 0.45);
    rows.push({ x: (r() - 0.5) * w * 0.3 - ww / 2, w: ww, y: i * rh, h: rh + 1, nub: r() * 0.25 * w, nubL: r() < 0.5 });
  }
  return { rows, h: n * rh, w };
}
function cloudField(seed, n, y0, y1, w0, w1) {
  const r = rng(seed), arr = [];
  for (let i = 0; i < n; i++) arr.push({ cl: makeCloud(r, lerp(w0, w1, r())), x: r() * 2600 - 300, y: lerp(y0, y1, r()), sp: 6 + r() * 14, s: 0.7 + r() * 0.6 });
  return arr.sort((a, b) => a.y - b.y);
}
function drawClouds(c, field, t, ox, pal, alpha = 1, yOff = 0) {
  const wrap = 2800;
  for (const f of field) {
    let x = ((f.x + t * f.sp + ox * f.s * 0.5) % wrap + wrap) % wrap - 400;
    const y = f.y + yOff, cl = f.cl, n = cl.rows.length;
    cl.rows.forEach((rw, i) => {
      const k = n > 1 ? i / (n - 1) : 0;
      c.fillStyle = css(mix(pal.cl, pal.cs, E.in2(k) * 0.9), alpha * (0.92 - k * 0.15));
      c.fillRect(x + rw.x * f.s, y + rw.y * f.s, rw.w * f.s, rw.h * f.s);
      c.fillRect(x + (rw.nubL ? rw.x - rw.nub : rw.x + rw.w) * f.s, y + (rw.y + rw.h * 0.45) * f.s, rw.nub * f.s, rw.h * 0.55 * f.s);
    });
  }
}

// ───────────────────────────── light & atmosphere ─────────────────────────────
function rays(c, t, o = {}) {
  const ang = o.ang ?? -0.62, a = o.a ?? 0.12, col = o.col || '#fff3d6';
  const bands = o.bands || [[-500, 160, 1], [-200, 60, 0.7], [150, 260, 0.8], [520, 90, 0.6], [820, 180, 0.7]];
  c.save();
  c.globalCompositeOperation = 'screen';
  c.translate(o.cx ?? 1100, o.cy ?? 300);
  c.rotate(ang);
  const drift = (o.drift ?? 18) * t;
  for (const [off, w, k] of bands) {
    const x = off + drift + Math.sin(t * 0.7 + off) * 10;
    const g = c.createLinearGradient(x, 0, x + w, 0);
    g.addColorStop(0, css(col, 0)); g.addColorStop(0.5, css(col, a * k)); g.addColorStop(1, css(col, 0));
    c.fillStyle = g; c.fillRect(x, -2200, w, 4400);
  }
  c.restore();
}
function bokeh(c, t, seed, n, o = {}) {
  const r = rng(seed);
  c.save(); c.globalCompositeOperation = 'screen';
  const col = o.col || '#fff0d0';
  for (let i = 0; i < n; i++) {
    const bx = r() * W, by = (o.y0 ?? 0) + r() * (o.yr ?? H), rad = (o.r0 ?? 20) + r() * (o.rr ?? 70), a = (o.a ?? 0.12) * (0.4 + r() * 0.6), ph = r() * 6.28, sp = 0.2 + r() * 0.4;
    const x = bx + Math.sin(t * sp + ph) * 25 + (o.dx ?? 0) * t, y = by + Math.cos(t * sp * 0.8 + ph) * 15;
    const pulse = 0.7 + 0.3 * Math.sin(t * 1.3 + ph);
    const g = c.createRadialGradient(x, y, 0, x, y, rad);
    g.addColorStop(0, css(col, a * 0.35 * pulse)); g.addColorStop(0.82, css(col, a * 0.6 * pulse)); g.addColorStop(0.9, css(col, a * 0.75 * pulse)); g.addColorStop(1, css(col, 0));
    c.fillStyle = g; c.fillRect(x - rad, y - rad, rad * 2, rad * 2);
  }
  c.restore();
}
const VIG = (() => {
  const c = mk(W, H), g = c.getContext('2d');
  const gr = g.createRadialGradient(W / 2, H / 2, H * 0.35, W / 2, H / 2, H * 1.05);
  gr.addColorStop(0, 'rgba(30,15,25,0)'); gr.addColorStop(1, 'rgba(30,15,25,0.55)');
  g.fillStyle = gr; g.fillRect(0, 0, W, H);
  return c;
})();
const GRAIN = (() => {
  const tiles = [], r = rng(7);
  for (let k = 0; k < 6; k++) {
    const c = mk(256, 256), g = c.getContext('2d'), d = g.createImageData(256, 256);
    for (let i = 0; i < d.data.length; i += 4) { const v = 128 + (r() - 0.5) * 255; d.data[i] = d.data[i + 1] = d.data[i + 2] = v; d.data[i + 3] = 255; }
    g.putImageData(d, 0, 0); tiles.push(c);
  }
  return tiles;
})();
const BLOOM = mk(480, 270), BLX = BLOOM.getContext('2d');
function post(c, t, o = {}) {
  BLX.filter = 'blur(5px) brightness(1.1) contrast(1.7)';
  BLX.clearRect(0, 0, 480, 270); BLX.drawImage(c.canvas, 0, 0, 480, 270); BLX.filter = 'none';
  c.save(); c.globalCompositeOperation = 'screen'; c.globalAlpha = o.bloom ?? 0.28; c.drawImage(BLOOM, 0, 0, W, H); c.restore();
  // warm grade
  c.save();
  c.globalCompositeOperation = 'soft-light';
  c.fillStyle = vgrad(c, 0, H, [[0, o.gradeTop || '#ffd9a0'], [1, o.gradeBot || '#7a5a7a']]);
  c.globalAlpha = o.grade ?? 0.35; c.fillRect(0, 0, W, H);
  c.restore();
  c.drawImage(VIG, 0, 0);
  c.save();
  c.globalCompositeOperation = 'overlay'; c.globalAlpha = 0.05;
  const tile = GRAIN[Math.floor(t * 12) % GRAIN.length];
  c.fillStyle = c.createPattern(tile, 'repeat'); c.fillRect(0, 0, W, H);
  c.restore();
}

// ───────────────────────────── landscape pieces ─────────────────────────────
function mountains(c, baseY, list, colL, colR, snow) {
  for (const m of list) {
    const [x, y, w] = m, mid = x + w * 0.06;
    c.fillStyle = css(colL); poly(c, [x - w / 2, baseY, x, y, mid, baseY]); c.fill();
    c.fillStyle = css(colR); poly(c, [x, y, x + w / 2, baseY, mid, baseY]); c.fill();
    // facet steps
    c.fillStyle = css(shade(colR, -0.08)); poly(c, [x + w * 0.1, y + (baseY - y) * 0.35, x + w * 0.32, baseY, x + w * 0.16, baseY]); c.fill();
    if (snow) {
      const sh = (baseY - y) * 0.22;
      c.fillStyle = css(snow); poly(c, [x, y, x - w * 0.11, y + sh, x - w * 0.05, y + sh * 0.8, x + w * 0.02, y + sh * 1.1, x + w * 0.1, y + sh * 0.85]); c.fill();
    }
  }
}
function skyline(c, ox, baseY, col, seed, density = 1) {
  const r = rng(seed);
  c.fillStyle = css(col);
  let x = -200 + ox;
  while (x < W + 200) {
    const w = 18 + r() * 50, h = 10 + r() * 60 * density;
    c.fillRect(x, baseY - h, w, h + 2);
    if (r() < 0.12) c.fillRect(x + w * 0.4, baseY - h - 30, 4, 30);
    x += w + r() * 10;
  }
}
function pine(c, x, y, h, col) {
  c.fillStyle = css(col);
  const w = h * 0.36;
  for (let i = 0; i < 4; i++) {
    const ty = y - h + i * h * 0.2, by = ty + h * 0.38, ww = w * (0.45 + i * 0.2);
    poly(c, [x, ty, x + ww / 2, by, x - ww / 2, by]); c.fill();
  }
  c.fillRect(x - h * 0.02, y - h * 0.2, h * 0.04, h * 0.2);
}
function tower(c, x, base, h, body, glass, night = 0) {
  c.fillStyle = css(body);
  poly(c, [x - h * 0.05, base, x - h * 0.03, base - h * 0.78, x + h * 0.03, base - h * 0.78, x + h * 0.05, base]); c.fill();
  c.fillStyle = css(shade(body, -0.1)); c.fillRect(x - h * 0.11, base - h * 0.8, h * 0.22, h * 0.04);
  c.fillStyle = css(glass); poly(c, [x - h * 0.12, base - h * 0.8, x - h * 0.1, base - h * 0.93, x + h * 0.1, base - h * 0.93, x + h * 0.12, base - h * 0.8]); c.fill();
  c.fillStyle = css(shade(body, 0.1)); c.fillRect(x - h * 0.09, base - h * 0.98, h * 0.18, h * 0.05);
  c.fillRect(x - 1.5, base - h * 1.1, 3, h * 0.12);
  if (night > 0) glow(c, x, base - h * 1.1, 14, [255, 60, 60], night);
}

// ───────────────────────────── aircraft ─────────────────────────────
// side view, nose toward +x (dir=1). L = length in px. y = fuselage centre.
function planeSide(c, x, y, L, o = {}) {
  const night = o.night ?? 0;
  const body = mix(o.body || '#eef0f0', '#2e3555', night * 0.85), belly = shade(body, -0.16), tail = mix(o.tail || '#2f6fa6', '#1a2244', night * 0.7), dark = mix('#2c3442', '#0a0e1c', night);
  c.save(); c.translate(x, y); c.scale((o.dir ?? 1) * L / 1000, L / 1000); c.rotate(o.rot || 0);
  // far wing
  c.fillStyle = css(shade(body, -0.28)); poly(c, [60, -6, -10, -6, -150, -60, -120, -62]); c.fill();
  // fuselage
  c.fillStyle = css(body);
  c.beginPath(); c.moveTo(500, 6);
  c.bezierCurveTo(500, -22, 468, -36, 420, -37); c.lineTo(-300, -37); c.lineTo(-485, -48);
  c.lineTo(-500, -36); c.lineTo(-490, -14); c.lineTo(-250, 37); c.lineTo(420, 37);
  c.bezierCurveTo(470, 37, 498, 28, 500, 6); c.closePath(); c.fill();
  c.fillStyle = css(belly);
  c.beginPath(); c.moveTo(498, 14); c.bezierCurveTo(490, 32, 465, 37, 420, 37); c.lineTo(-250, 37); c.lineTo(-420, 0); c.lineTo(-200, 10); c.lineTo(420, 12); c.closePath(); c.fill();
  // fin + stabiliser
  c.fillStyle = css(tail); poly(c, [-320, -37, -445, -215, -508, -215, -485, -48]); c.fill();
  c.fillStyle = css(shade(tail, 0.15)); poly(c, [-330, -37, -380, -110, -395, -110, -340, -37]); c.fill();
  c.fillStyle = css(shade(body, -0.1)); poly(c, [-395, -18, -500, -40, -525, -32, -430, -4]); c.fill();
  // windows
  c.fillStyle = css(o.lit ? mix('#ffd88a', dark, 1 - o.lit) : dark);
  for (let wx = 320; wx > -280; wx -= 26) c.fillRect(wx, -16, 12, 9);
  c.fillStyle = css(dark); poly(c, [470, -14, 445, -24, 418, -24, 418, -12]); c.fill();
  // stripe
  c.fillStyle = css(tail, 0.85); c.fillRect(-300, 4, 720, 5);
  // near wing + engine
  c.fillStyle = css(shade(body, -0.06)); poly(c, [90, 18, -20, 18, -190, 110, -150, 114]); c.fill();
  c.fillStyle = css(shade(body, 0.05)); rrect(c, 30, 30, 125, 46, 20); c.fill();
  c.fillStyle = css(dark); rrect(c, 140, 33, 16, 40, 6); c.fill();
  // gear
  if (o.gear) { c.fillStyle = css(dark); c.fillRect(-60, 37, 8, 46); circle(c, -56, 88, 13); c.fill(); c.fillRect(392, 37, 6, 40); circle(c, 395, 82, 10); c.fill(); }
  if (night > 0.3) {
    const bl = (Math.sin((o.t || 0) * 6) > 0.6) ? 1 : 0.15;
    c.restore();
    const s = L / 1000, d = o.dir ?? 1;
    glow(c, x - d * 470 * s, y - 210 * s, 26, [255, 70, 60], night * bl);
    glow(c, x + d * 100 * s, y - 40 * s, 22, [255, 255, 255], night * (1 - bl) * 0.8);
    return;
  }
  c.restore();
}
// front view (flying toward camera). span = wingspan px
function planeFront(c, x, y, span, o = {}) {
  const s = span, body = rgb(o.body || '#e9ebea'), dark = rgb('#30343e');
  c.save(); c.translate(x, y); c.rotate(o.bank || 0);
  // tail plane + fin (behind)
  c.fillStyle = css(shade(body, -0.18));
  poly(c, [-0.19 * s, -0.035 * s, 0, -0.05 * s, 0.19 * s, -0.035 * s, 0.19 * s, -0.025 * s, 0, -0.035 * s, -0.19 * s, -0.025 * s]); c.fill();
  c.fillStyle = css(shade(body, -0.1)); poly(c, [-0.012 * s, -0.04 * s, -0.004 * s, -0.2 * s, 0.004 * s, -0.2 * s, 0.012 * s, -0.04 * s]); c.fill();
  // wings
  c.fillStyle = css(shade(body, -0.05));
  poly(c, [-0.5 * s, -0.045 * s, -0.48 * s, -0.035 * s, -0.05 * s, 0.03 * s, 0.05 * s, 0.03 * s, 0.48 * s, -0.035 * s, 0.5 * s, -0.045 * s, 0.05 * s, 0.0, -0.05 * s, 0.0]); c.fill();
  c.fillStyle = css(shade(body, -0.25));
  poly(c, [-0.48 * s, -0.035 * s, -0.05 * s, 0.03 * s, 0.05 * s, 0.03 * s, 0.48 * s, -0.035 * s, 0.05 * s, 0.04 * s, -0.05 * s, 0.04 * s]); c.fill();
  // engines
  for (const ex of [-0.18, 0.18]) {
    c.fillStyle = css(shade(body, -0.08)); circle(c, ex * s, 0.045 * s, 0.042 * s); c.fill();
    c.fillStyle = css(dark); circle(c, ex * s, 0.045 * s, 0.03 * s); c.fill();
    c.fillStyle = css(shade(dark, 0.2)); circle(c, ex * s, 0.045 * s, 0.01 * s); c.fill();
  }
  // gear
  c.fillStyle = css(dark);
  if (o.gear) for (const gx of [-0.06, 0, 0.06]) { c.fillRect(gx * s - 0.004 * s, 0.04 * s, 0.008 * s, 0.06 * s); c.fillRect(gx * s - 0.01 * s, 0.095 * s, 0.02 * s, 0.018 * s); }
  // fuselage
  const fr = 0.058 * s;
  const g = c.createRadialGradient(-fr * 0.3, -fr * 0.4, fr * 0.1, 0, 0, fr * 1.1);
  g.addColorStop(0, css(shade(body, 0.2))); g.addColorStop(1, css(shade(body, -0.25)));
  c.fillStyle = g; circle(c, 0, 0, fr); c.fill();
  c.fillStyle = css(dark); c.beginPath(); c.ellipse(0, -fr * 0.35, fr * 0.6, fr * 0.2, 0, 0, Math.PI * 2); c.fill();
  c.restore();
}

// ───────────────────────────── people ─────────────────────────────
// Silhouette figure. Origin = feet on floor. h = standing height. Faces +x (side) unless view='back'.
function figure(c, x, y, h, o = {}) {
  c.save(); c.translate(x, y);
  if (o.flip) c.scale(-1, 1);
  if (o.rot) c.rotate(o.rot);
  if (o.rim) {
    c.save(); c.translate((o.rimDx ?? -0.012) * h, (o.rimDy ?? -0.006) * h);
    figureShape(c, h, o, o.rim);
    c.restore();
  }
  figureShape(c, h, o, null);
  c.restore();
}
function figurePose(h, o) {
  const P = { hipY: -0.5 * h, lean: o.lean || 0, legs: [[0.03, 0.03], [-0.03, -0.03]], arms: [[0.08, 0.12], [-0.06, -0.02]], bob: 0, lift: [0, 0] };
  const ph = o.phase || 0, s = Math.sin(ph);
  switch (o.pose) {
    case 'walk': {
      const a = 0.4 * s;
      P.legs = [[a, a - 0.6 * Math.max(0, Math.cos(ph))], [-a, -a - 0.6 * Math.max(0, -Math.cos(ph))]];
      P.arms = [[-0.32 * s, -0.32 * s + 0.3], [0.32 * s, 0.32 * s + 0.3]];
      P.bob = -(1 - Math.abs(s)) * 0.012 * h;
      P.lift = [Math.max(0, s) * 0.05 * h, Math.max(0, -s) * 0.05 * h];
      if (o.bag) P.arms[1] = [-0.5, -0.5];
      break;
    }
    case 'sit': P.hipY = -0.27 * h; P.legs = [[1.5, 0.05], [1.45, 0]]; P.lean = (o.lean ?? -0.08); P.arms = [[0.35, 1.3], [0.3, 1.2]]; break;
    case 'floor': P.hipY = -0.045 * h; P.legs = [[2.35, 0.25], [2.2, 0.15]]; P.lean = (o.lean ?? -0.12); P.arms = [[0.9, 1.9], [0.8, 1.8]]; break;
    case 'lie': P.legs = [[0.55, -0.25], [0.35, -0.05]]; P.arms = [[0.15, 0.9], [0.25, 1.3]]; break;
    case 'curl': P.legs = [[1.25, 0.15], [1.1, 0.05]]; P.arms = [[1.1, 2.1], [1.0, 1.9]]; P.lean = 0.25; break;
  }
  if (o.arms) P.arms = o.arms;
  return P;
}
function figureShape(c, h, o, mono) {
  const P = figurePose(h, o), back = o.view === 'back';
  const col = mono || o.col || '#1e2230', top = mono || o.top || col, head = mono || o.head || col, far = mono || shade(col, -0.25);
  const lw = 0.075 * h, sw = back ? 0.27 * h : 0.17 * h;
  c.lineCap = 'round'; c.lineJoin = 'round';
  c.save(); c.translate(0, P.bob);
  const hip = [0, P.hipY];
  if (back && o.pose !== 'sitBack') { backBody(c, h, o, P, { col, top, head, far, mono }); c.restore(); return; }
  // legs
  if (o.pose !== 'sitBack') {
    if (back) {
      for (let i = 0; i < 2; i++) {
        const lx = (i ? 1 : -1) * 0.055 * h;
        c.strokeStyle = css(i ? col : far); c.lineWidth = lw;
        stroke2(c, [lx, P.hipY + 0.02 * h, lx * 1.05, -0.03 * h - P.lift[i]], lw);
        c.fillStyle = css(i ? col : far); c.fillRect(lx - lw * 0.5, -0.04 * h - P.lift[i], lw, 0.04 * h);
      }
    } else {
      [1, 0].forEach(i => {
        c.strokeStyle = css(i ? far : col);
        const [a1, a2] = P.legs[i];
        const kx = hip[0] + Math.sin(a1) * 0.25 * h, ky = hip[1] + Math.cos(a1) * 0.25 * h;
        const fx = kx + Math.sin(a2) * 0.24 * h, fy = ky + Math.cos(a2) * 0.24 * h;
        stroke2(c, [hip[0], hip[1], kx, ky], lw);
        stroke2(c, [kx, ky, fx, fy], lw * 0.8);
        c.fillStyle = css(i ? far : col);
        c.save(); c.translate(fx, fy); c.rotate(-a2); rrect(c, -0.025 * h, -0.02 * h, 0.085 * h, 0.035 * h, 0.012 * h); c.fill(); c.restore();
      });
    }
  }
  // torso group
  c.save(); c.translate(hip[0], hip[1]); c.rotate(P.lean);
  const shY = -0.31 * h;
  const armRoot = back ? [[-sw / 2 + 0.02 * h, shY + 0.03 * h], [sw / 2 - 0.02 * h, shY + 0.03 * h]] : [[0, shY + 0.03 * h], [0, shY + 0.03 * h]];
  const drawArm = (i, color) => {
    const [u, f] = P.arms[i];
    c.strokeStyle = css(color);
    const [sx, sy] = armRoot[i];
    if (back) {
      const sgn = i ? 1 : -1;
      stroke2(c, [sx, sy, sx + sgn * 0.03 * h + Math.sin(u) * 0.02 * h, sy + 0.17 * h, sx + sgn * 0.035 * h, sy + 0.32 * h], 0.05 * h);
      return [sx + sgn * 0.035 * h, sy + 0.32 * h];
    }
    const ex = sx + Math.sin(u) * 0.17 * h, ey = sy + Math.cos(u) * 0.17 * h;
    const hx = ex + Math.sin(f) * 0.16 * h, hy = ey + Math.cos(f) * 0.16 * h;
    stroke2(c, [sx, sy, ex, ey, hx, hy], 0.05 * h);
    return [hx, hy];
  };
  let farHand = drawArm(1, back ? top : far);
  // suitcase (pulled behind, side view)
  if (o.bag && !back) {
    const [hx, hy] = farHand;
    const bx = hx - 0.17 * h, by = -P.hipY - 0.27 * h + 0.0;
    c.strokeStyle = css(mono || '#2a2a33'); c.lineWidth = 0.012 * h; c.beginPath(); c.moveTo(hx, hy); c.lineTo(bx + 0.06 * h, hy + 0.2 * h); c.stroke();
    c.fillStyle = css(mono || o.bagCol || '#3a3f4a');
    c.save(); c.translate(bx, hy + 0.17 * h); c.rotate(-0.25); rrect(c, -0.02 * h, 0, 0.16 * h, 0.26 * h, 0.02 * h); c.fill(); c.restore();
  }
  // backpack
  if (o.pack) { c.fillStyle = css(mono || o.packCol || shade(top, 0.15)); rrect(c, back ? -0.1 * h : -0.15 * h, shY + 0.03 * h, back ? 0.2 * h : 0.09 * h, 0.21 * h, 0.03 * h); c.fill(); }
  // torso
  c.fillStyle = css(top);
  c.beginPath();
  c.moveTo(-sw / 2, shY + 0.03 * h); c.quadraticCurveTo(-sw / 2, shY, -sw / 2 + 0.04 * h, shY);
  c.lineTo(sw / 2 - 0.04 * h, shY); c.quadraticCurveTo(sw / 2, shY, sw / 2, shY + 0.03 * h);
  c.lineTo(back ? 0.1 * h : 0.075 * h, 0.03 * h); c.lineTo(back ? -0.1 * h : -0.075 * h, 0.03 * h); c.closePath(); c.fill();
  if (o.dress) { poly(c, [-0.08 * h, -0.05 * h, 0.08 * h, -0.05 * h, 0.15 * h, 0.27 * h, -0.15 * h, 0.27 * h]); c.fill(); }
  if (o.pack && back) { c.fillStyle = css(mono || o.packCol || shade(top, 0.15)); rrect(c, -0.1 * h, shY + 0.04 * h, 0.2 * h, 0.22 * h, 0.03 * h); c.fill(); }
  // neck + head
  c.fillStyle = css(head);
  c.fillRect(-0.024 * h, shY - 0.05 * h, 0.048 * h, 0.06 * h);
  const hy = shY - 0.105 * h;
  circle(c, 0, hy, 0.068 * h); c.fill();
  if (!back) { poly(c, [0.06 * h, hy - 0.01 * h, 0.082 * h, hy + 0.012 * h, 0.062 * h, hy + 0.02 * h]); c.fill(); }
  if (o.hair === 'long') { c.beginPath(); c.moveTo(-0.068 * h, hy); c.quadraticCurveTo(-0.08 * h, hy + 0.13 * h, back ? 0.06 * h : -0.01 * h, hy + 0.15 * h); c.lineTo(back ? 0.065 * h : 0.02 * h, hy); c.closePath(); c.fill(); if (back) { c.beginPath(); c.moveTo(0.068 * h, hy); c.quadraticCurveTo(0.08 * h, hy + 0.13 * h, -0.06 * h, hy + 0.15 * h); c.lineTo(-0.065 * h, hy); c.fill(); } }
  if (o.hair === 'bun') { circle(c, back ? 0 : -0.05 * h, hy - 0.065 * h, 0.035 * h); c.fill(); }
  // near arm
  drawArm(0, top);
  c.restore();
  c.restore();
}
// Back-view body with proper tapering (walking away / standing facing a window)
function backBody(c, h, o, P, k) {
  const { col, top, head, far, mono } = k;
  const sw = 0.13 * h, ww = 0.085 * h, hw = 0.095 * h;
  const shY = -0.81 * h, waY = -0.58 * h, hiY = -0.47 * h;
  // legs (tapered, with lift for walking)
  for (let i = 0; i < 2; i++) {
    const sg = i ? 1 : -1, lift = P.lift[i];
    c.fillStyle = css(i ? col : far);
    poly(c, [sg * 0.004 * h, hiY, sg * (hw + 0.002 * h), hiY, sg * 0.068 * h, -0.05 * h - lift, sg * 0.02 * h, -0.05 * h - lift]); c.fill();
    rrect(c, sg > 0 ? 0.016 * h : -0.072 * h, -0.06 * h - lift, 0.056 * h, 0.06 * h, 0.015 * h); c.fill();
  }
  if (o.dress) { c.fillStyle = css(top); poly(c, [-ww, waY, ww, waY, 0.14 * h, -0.25 * h, -0.14 * h, -0.25 * h]); c.fill(); }
  // arms
  c.fillStyle = css(top);
  for (const sg of [-1, 1]) {
    const sw2 = o.pose === 'walk' ? Math.sin((o.phase || 0) + (sg > 0 ? 0 : Math.PI)) * 0.02 * h : 0;
    poly(c, [sg * (sw - 0.03 * h), shY + 0.02 * h, sg * (sw + 0.012 * h), shY + 0.04 * h, sg * (sw + 0.01 * h), -0.47 * h + sw2, sg * (sw - 0.035 * h), -0.47 * h + sw2]); c.fill();
    c.fillStyle = css(head); circle(c, sg * (sw - 0.012 * h), -0.455 * h + sw2, 0.026 * h); c.fill(); c.fillStyle = css(top);
  }
  // torso
  c.beginPath();
  c.moveTo(-sw, shY + 0.05 * h); c.quadraticCurveTo(-sw, shY, -sw + 0.05 * h, shY - 0.004 * h);
  c.lineTo(sw - 0.05 * h, shY - 0.004 * h); c.quadraticCurveTo(sw, shY, sw, shY + 0.05 * h);
  c.quadraticCurveTo(ww + 0.01 * h, waY - 0.05 * h, ww, waY); c.lineTo(hw, hiY + 0.01 * h); c.lineTo(-hw, hiY + 0.01 * h); c.lineTo(-ww, waY);
  c.quadraticCurveTo(-ww - 0.01 * h, waY - 0.05 * h, -sw, shY + 0.05 * h); c.closePath(); c.fill();
  c.fillStyle = css(col); c.fillRect(-hw, hiY - 0.02 * h, hw * 2, 0.035 * h);
  if (o.pack) { c.fillStyle = css(mono || o.packCol || shade(top, 0.15)); rrect(c, -0.085 * h, shY + 0.03 * h, 0.17 * h, 0.22 * h, 0.035 * h); c.fill(); c.fillStyle = css(mono || shade(o.packCol || top, -0.15)); rrect(c, -0.06 * h, shY + 0.15 * h, 0.12 * h, 0.07 * h, 0.02 * h); c.fill(); }
  // head
  c.fillStyle = css(head);
  c.fillRect(-0.025 * h, shY - 0.05 * h, 0.05 * h, 0.06 * h);
  c.beginPath(); c.ellipse(0, -0.9 * h, 0.058 * h, 0.066 * h, 0, 0, Math.PI * 2); c.fill();
  if (o.hair === 'long') { poly(c, [-0.06 * h, -0.9 * h, 0.06 * h, -0.9 * h, 0.07 * h, -0.74 * h, -0.07 * h, -0.74 * h]); c.fill(); }
  if (o.hair === 'bun') { circle(c, 0, -0.97 * h, 0.03 * h); c.fill(); }
}
// Sleeping on the floor: lying on back, knees up, head on a bag. x = head end, y = floor, s = body length
function sleeper(c, x, y, s, o = {}) {
  const col = o.col || '#1f2433', top = o.top || '#4a3438', br = Math.sin((o.t || 0) * 2.1 + (o.ph || 0)) * 0.006 * s;
  c.lineCap = 'round'; c.lineJoin = 'round';
  c.fillStyle = css(o.pill || '#3f6a7a'); rrect(c, x - 0.02 * s, y - 0.1 * s, 0.2 * s, 0.1 * s, 0.03 * s); c.fill();
  c.fillStyle = css(shade(o.pill || '#3f6a7a', -0.2)); c.fillRect(x + 0.02 * s, y - 0.06 * s, 0.12 * s, 0.015 * s);
  // far leg (straight-ish)
  c.strokeStyle = css(shade(col, -0.25)); stroke2(c, [x + 0.5 * s, y - 0.06 * s, x + 0.72 * s, y - 0.05 * s, x + 0.93 * s, y - 0.035 * s], 0.07 * s);
  // near leg, knee up
  c.strokeStyle = css(col); stroke2(c, [x + 0.5 * s, y - 0.07 * s, x + 0.67 * s, y - 0.22 * s, x + 0.82 * s, y - 0.035 * s], 0.075 * s);
  c.fillStyle = css(col); rrect(c, x + 0.8 * s, y - 0.055 * s, 0.08 * s, 0.05 * s, 0.015 * s); c.fill();
  // torso
  c.fillStyle = css(top); rrect(c, x + 0.15 * s, y - 0.14 * s - br, 0.4 * s, 0.13 * s + br, 0.055 * s); c.fill();
  if (o.jacket) { c.fillStyle = css(o.jacket); poly(c, [x + 0.22 * s, y - 0.15 * s - br, x + 0.5 * s, y - 0.16 * s - br, x + 0.62 * s, y - 0.17 * s, x + 0.66 * s, y - 0.09 * s, x + 0.56 * s, y - 0.01 * s, x + 0.24 * s, y - 0.01 * s]); c.fill(); }
  // folded arm across chest
  c.strokeStyle = css(shade(top, -0.22)); stroke2(c, [x + 0.22 * s, y - 0.09 * s, x + 0.38 * s, y - 0.07 * s, x + 0.3 * s, y - 0.135 * s - br], 0.05 * s);
  // head
  c.fillStyle = css(o.head || col); circle(c, x + 0.1 * s, y - 0.155 * s, 0.065 * s); c.fill();
  if (o.hair === 'long') { poly(c, [x + 0.04 * s, y - 0.16 * s, x + 0.08 * s, y - 0.1 * s, x - 0.04 * s, y - 0.09 * s]); c.fill(); }
}
// Sitting on the floor, knees up, head resting on folded arms (front view)
function dozer(c, x, y, s, o = {}) {
  const col = o.col || '#20253a', top = o.top || '#304a5a', nod = Math.sin((o.t || 0) * 1.6) * 0.006 * s;
  c.fillStyle = css(o.pack || '#6a4a3a'); rrect(c, x + 0.14 * s, y - 0.2 * s, 0.16 * s, 0.2 * s, 0.035 * s); c.fill();
  c.fillStyle = css(top); rrect(c, x - 0.12 * s, y - 0.46 * s, 0.24 * s, 0.42 * s, 0.07 * s); c.fill();
  c.fillStyle = css(col);
  for (const sg of [-1, 1]) { rrect(c, x + sg * 0.065 * s - 0.04 * s, y - 0.34 * s, 0.08 * s, 0.33 * s, 0.035 * s); c.fill(); c.beginPath(); c.ellipse(x + sg * 0.07 * s, y - 0.01 * s, 0.055 * s, 0.022 * s, 0, 0, Math.PI * 2); c.fill(); }
  c.fillStyle = css(shade(top, 0.08)); rrect(c, x - 0.15 * s, y - 0.37 * s, 0.3 * s, 0.075 * s, 0.035 * s); c.fill();
  c.fillStyle = css(o.head || col); circle(c, x, y - 0.42 * s + nod, 0.07 * s); c.fill();
}
// mirror an object about its floor line
function reflect(c, y0, a, k, fn) {
  c.save(); c.globalAlpha *= a; c.translate(0, y0 * (1 + k)); c.scale(1, -k); fn(); c.restore();
  fn();
}

// ───────────────────────────── interior ─────────────────────────────
const CEIL = 150, FLOOR = 770, FH = FLOOR - CEIL;
const depthH = y => 230 + (y - 790) * 1.15; // standing height of a person whose feet are at y
const LAYER = mk(W, H), LX = LAYER.getContext('2d');
const SNAP = mk(W, FH), SX = SNAP.getContext('2d');

function exterior(c, ox, t, pal, o = {}) {
  const top = o.top ?? CEIL, hor = o.hor ?? (FLOOR - 120), bot = o.bot ?? FLOOR;
  c.fillStyle = skyGrad(c, top - 40, hor, pal); c.fillRect(0, top - 40, W, hor - top + 42);
  // stars + moon
  if (pal.night > 0.4) {
    const r = rng(33), na = ramp(0.4, 1, pal.night);
    for (let i = 0; i < 140; i++) {
      const sx = (r() * 2400 + ox * 0.15) % 2400 - 200, sy = top + r() * (hor - top) * 0.75, tw = 0.5 + 0.5 * Math.sin(t * (1 + r() * 3) + i);
      c.fillStyle = `rgba(255,250,235,${na * (0.25 + 0.6 * r()) * tw})`; c.fillRect(sx, sy, 2 + (r() < 0.1), 2 + (r() < 0.1));
    }
    const mx = (o.moonX ?? 1450) + ox * 0.2, my = o.moonY ?? top + 120;
    glow(c, mx, my, 220, [200, 210, 255], 0.25 * na);
    c.fillStyle = `rgba(250,244,222,${na})`; circle(c, mx, my, 44); c.fill();
    c.fillStyle = css(pal.sky[0], na); circle(c, mx + 18, my - 10, 40); c.fill();
  }
  if (pal.sun > 0.05) glow(c, (o.sunX ?? 1250) + ox * 0.2, o.sunY ?? hor - 150, 600, [255, 236, 200], 0.65 * pal.sun);
  if (pal.sun > 0.05 && o.sunDisc !== false) { c.fillStyle = css([255, 246, 220], 0.85 * pal.sun); circle(c, (o.sunX ?? 1250) + ox * 0.2, o.sunY ?? hor - 150, 60); c.fill(); }
  drawClouds(c, o.clouds || CLOUDS_A, t, ox, pal, 1 - pal.night * 0.4, top - CEIL);
  // horizon
  mountains(c, hor + 2, [[300 + ox * 0.3, hor - 120, 700], [900 + ox * 0.3, hor - 70, 600], [1700 + ox * 0.3, hor - 140, 760]], mix(pal.far, pal.sky[3], 0.35), mix(pal.mid, pal.sky[3], 0.3), pal.night < 0.5 ? mix('#fff6ea', pal.sky[3], 0.3) : null);
  skyline(c, ox * 0.45, hor + 2, mix(pal.mid, pal.sky[3], 0.15), 4, 0.7);
  if (pal.night > 0.2) {
    const r = rng(11);
    for (let i = 0; i < 60; i++) { const lx = (r() * 2200 + ox * 0.45) % 2200 - 150, ly = hor - r() * 40; c.fillStyle = `rgba(255,214,140,${pal.night * (0.4 + 0.6 * r())})`; c.fillRect(lx, ly, 3, 3); }
  }
  if (o.tower !== false) tower(c, 1560 + ox * 0.55, hor + 6, 170, mix('#e6ddd0', '#2a2f50', pal.night), mix('#6fa8b8', '#ffcf7a', pal.night * 0.8), pal.night);
  // tarmac
  c.fillStyle = vgrad(c, hor, bot, [[0, mix(pal.grass, pal.sky[3], 0.3)], [0.12, pal.grass], [0.16, pal.ground], [1, shade(pal.ground, -0.12)]]);
  c.fillRect(0, hor, W, bot - hor + 1);
  c.fillStyle = css(shade(pal.ground, 0.25), 0.6);
  for (let i = -2; i < 14; i++) c.fillRect(((i * 220 + ox * 0.9) % 2600 + 2600) % 2600 - 300, hor + 40, 110, 4);
  // runway lights
  const lights = pal.night;
  for (let i = 0; i < 40; i++) {
    const lx = ((i * 70 + ox * 0.75) % 2800 + 2800) % 2800 - 300;
    const on = 0.5 + 0.5 * Math.sin(t * 4 - i * 0.6);
    if (lights > 0.1) glow(c, lx, hor + 22, 10, i % 2 ? [120, 170, 255] : [255, 200, 110], lights * (0.6 + 0.4 * on));
  }
  if (o.extra) o.extra(c, ox, hor, bot);
}

function concourse(c, t, o) {
  const cam = o.cam || 0, pal = o.pal, lights = o.lights ?? 1;
  const wall = o.wall || '#cdb69a';
  c.fillStyle = css(wall); c.fillRect(0, 0, W, H);
  // window view
  c.save(); c.beginPath(); c.rect(0, CEIL, W, FH); c.clip();
  exterior(c, -cam * 0.35, t, pal, o.ext || {});
  // glass tint & glare
  c.fillStyle = css(mix('#b9d3d8', pal.sky[0], 0.5), 0.07); c.fillRect(0, CEIL, W, FH);
  c.restore();
  // mullions
  const step = o.step || 300;
  const mcol = mix('#2c2f38', '#141625', pal.night * 0.5);
  for (let i = -1; i < W / step + 2; i++) {
    const mx = i * step - (cam % step);
    c.fillStyle = css(mcol); c.fillRect(mx - 9, CEIL, 18, FH);
    c.fillStyle = css(shade(mcol, 0.25)); c.fillRect(mx - 9, CEIL, 4, FH);
  }
  c.fillStyle = css(mcol); c.fillRect(0, CEIL + FH * 0.6, W, 8); c.fillRect(0, FLOOR - 16, W, 16);
  c.fillStyle = css(shade(mcol, 0.3)); c.fillRect(0, FLOOR - 16, W, 3);
  // ceiling
  c.fillStyle = vgrad(c, 0, CEIL, [[0, mix('#24262f', '#15161e', 0)], [1, '#383a46']]); c.fillRect(0, 0, W, CEIL);
  c.fillStyle = '#4a4c58'; c.fillRect(0, CEIL - 10, W, 10);
  for (let i = -1; i < W / step + 2; i++) {
    const lx = i * step - ((cam * 1.15) % step);
    const on = o.lightOn ? o.lightOn(i) : lights;
    for (let row = 0; row < 2; row++) {
      const ly = row ? CEIL - 34 : CEIL - 84, lw = row ? step * 0.7 : step * 0.55;
      c.fillStyle = css(mix('#55565f', '#fff6e0', on)); c.fillRect(lx - lw / 2, ly, lw, row ? 7 : 5);
      if (on > 0.05) glow(c, lx, ly + 4, lw * 0.6, [255, 240, 210], on * 0.18);
    }
  }
  // floor
  c.fillStyle = vgrad(c, FLOOR, H, [[0, o.floorTop || '#c4ad94'], [1, o.floorBot || '#7e6a5b']]); c.fillRect(0, FLOOR, W, H - FLOOR);
  SX.clearRect(0, 0, W, FH); SX.drawImage(c.canvas, 0, CEIL, W, FH, 0, 0, W, FH);
  c.save(); c.globalAlpha = 0.33; c.translate(0, FLOOR + FH * 0.55); c.scale(1, -0.55); c.drawImage(SNAP, 0, 0); c.restore();
  c.fillStyle = vgrad(c, FLOOR, H, [[0, css(o.floorTop || '#c4ad94', 0)], [1, css(o.floorBot || '#7e6a5b', 0.8)]]); c.fillRect(0, FLOOR, W, H - FLOOR);
  // floor seams
  c.strokeStyle = 'rgba(60,40,30,0.12)'; c.lineWidth = 2;
  for (let i = 1; i < 7; i++) { const fy = FLOOR + Math.pow(i / 7, 1.7) * (H - FLOOR); c.beginPath(); c.moveTo(0, fy); c.lineTo(W, fy); c.stroke(); }
  for (let i = -12; i < 14; i++) { const fx = W / 2 + i * 160 - cam; c.beginPath(); c.moveTo(W / 2 + (fx - W / 2) * 0.35, FLOOR); c.lineTo(W / 2 + (fx - W / 2) * 2.2, H); c.stroke(); }
  if (o.mid) o.mid(c);
  // interior darkness (lights off)
  if (lights < 1) {
    c.save(); c.fillStyle = `rgba(12,16,40,${0.72 * (1 - lights)})`;
    c.beginPath(); c.rect(0, 0, W, H); c.rect(0, CEIL, W, FH - 16); c.fill('evenodd');
    c.fillStyle = `rgba(12,16,40,${0.12 * (1 - lights)})`; c.fillRect(0, CEIL, W, FH); c.restore();
  }
  // foreground pillars
  for (const p of (o.pillars || [])) {
    const px = p.x - cam * (p.par ?? 1.6), pw = p.w || 150;
    if (px + pw < -50 || px > W + 50) continue;
    const pc = p.col || '#7d4740';
    const g = c.createLinearGradient(px, 0, px + pw, 0);
    g.addColorStop(0, css(shade(pc, -0.35))); g.addColorStop(0.3, css(pc)); g.addColorStop(0.6, css(shade(pc, 0.12))); g.addColorStop(1, css(shade(pc, -0.3)));
    c.fillStyle = g; c.fillRect(px, 0, pw, H);
    c.fillStyle = css(shade(pc, -0.4)); c.fillRect(px - 6, H - 60, pw + 12, 60);
  }
  if (o.front) o.front(c);
}

// ───────────────────────────── furniture & signage ─────────────────────────────
function seatRow(c, x, y, n, s, col) {
  const sw = 0.19 * s, gap = 0.025 * s, bh = 0.19 * s, top = y - 0.42 * s;
  const len = n * (sw + gap) - gap;
  c.fillStyle = css(shade(col, -0.45));
  c.fillRect(x, y - 0.22 * s, len, 0.025 * s);
  for (const lx of [x + 0.05 * s, x + len - 0.07 * s]) { c.fillRect(lx, y - 0.22 * s, 0.022 * s, 0.22 * s); c.fillRect(lx - 0.04 * s, y - 0.012 * s, 0.1 * s, 0.012 * s); }
  for (let i = 0; i < n; i++) {
    const sx = x + i * (sw + gap);
    c.fillStyle = css(col); rrect(c, sx, top, sw, bh + 0.06 * s, 0.035 * s); c.fill();
    c.fillStyle = css(shade(col, 0.18)); rrect(c, sx + 0.01 * s, top + 0.006 * s, sw - 0.02 * s, 0.03 * s, 0.015 * s); c.fill();
    c.fillStyle = css(shade(col, -0.25)); c.fillRect(sx, top + bh + 0.04 * s, sw, 0.03 * s);
  }
}
const FLIGHTS = [
  ['LH 402', 'FRANKFURT', '03:15', 'DELAYED', 1],
  ['SQ 317', 'SINGAPORE', '03:40', 'BOARDING', 0],
  ['EK 006', 'DUBAI', '04:05', 'DELAYED', 1],
  ['QF 002', 'SYDNEY', '04:30', 'ON TIME', 2],
  ['JL 044', 'TOKYO', '05:10', 'DELAYED', 1],
  ['AF 279', 'PARIS', '05:45', 'ON TIME', 2],
];
function board(c, x, y, w, h, t, o = {}) {
  c.strokeStyle = '#2a2c33'; c.lineWidth = 4;
  c.beginPath(); c.moveTo(x + w * 0.2, 0); c.lineTo(x + w * 0.2, y); c.moveTo(x + w * 0.8, 0); c.lineTo(x + w * 0.8, y); c.stroke();
  c.fillStyle = '#141b2a'; rrect(c, x - 10, y - 10, w + 20, h + 20, 14); c.fill();
  c.fillStyle = '#0d1a33'; rrect(c, x, y, w, h, 8); c.fill();
  glow(c, x + w / 2, y + h / 2, w * 0.7, [70, 120, 220], 0.12 * (o.glow ?? 1));
  const s = w / 600;
  c.textBaseline = 'middle';
  c.font = `500 ${22 * s}px Montserrat`; c.letterSpacing = `${4 * s}px`;
  c.fillStyle = '#e9eef5'; c.textAlign = 'left'; c.fillText(o.title || 'DEPARTURES', x + 24 * s, y + 30 * s);
  if (o.clock) {
    c.font = `500 ${30 * s}px Montserrat`; c.textAlign = 'right'; c.letterSpacing = `${2 * s}px`;
    const col = Math.floor(t * 2) % 2 ? ' ' : ':';
    c.fillStyle = '#ffc861'; c.fillText(o.clock.replace(':', col), x + w - 24 * s, y + 31 * s);
  }
  c.fillStyle = 'rgba(255,255,255,0.12)'; c.fillRect(x + 20 * s, y + 56 * s, w - 40 * s, 2 * s);
  c.font = `500 ${17 * s}px Montserrat`; c.letterSpacing = `${2 * s}px`; c.textAlign = 'left';
  const rows = o.rows || FLIGHTS, rh = (h - 76 * s) / rows.length;
  rows.forEach((r, i) => {
    const ry = y + 76 * s + rh * (i + 0.5);
    c.fillStyle = i % 2 ? 'rgba(255,255,255,0.03)' : 'rgba(255,255,255,0)'; c.fillRect(x + 12 * s, ry - rh / 2, w - 24 * s, rh);
    c.fillStyle = '#cfd8e6'; c.fillText(r[0], x + 24 * s, ry); c.fillText(r[1], x + 140 * s, ry);
    c.fillStyle = '#ffc861'; c.fillText(r[2], x + 330 * s, ry);
    const blink = r[4] === 0 ? (Math.sin(t * 6) > 0 ? 1 : 0.35) : 1;
    c.fillStyle = r[4] === 1 ? `rgba(255,110,90,${blink})` : r[4] === 0 ? `rgba(120,230,160,${blink})` : '#9fb3cc';
    c.fillText(r[3], x + 430 * s, ry);
  });
  c.letterSpacing = '0px';
}

// ───────────────────────────── titles ─────────────────────────────
const STY = {
  title: { font: '400', size: 76, ls: 9 },
  big: { font: '300', size: 190, ls: 14 },
  sub: { font: '500', size: 34, ls: 12 },
  mid: { font: '300', size: 56, ls: 8 },
};
function titles(c, lt, groups) {
  if (!SHOW_TEXT) return;
  for (const g of groups) {
    const tin = lt - g.t0, tout = (g.t1 ?? 99) - lt;
    if (tin < 0 || tout < -0.6) continue;
    const outK = tout < 0 ? E.in2(clamp(-tout / 0.5)) : 0;
    let y = g.y;
    const align = g.align || 'center';
    // soft scrim behind the text block for legibility on pale skies
    if (g.scrim !== 0) {
      let hh = 0, ww = 0;
      g.lines.forEach((ln, li) => { const st = STY[ln.s || 'title']; c.font = `${st.font} ${st.size}px Montserrat`; c.letterSpacing = `${st.ls}px`; ww = Math.max(ww, c.measureText(ln.t).width); hh += st.size * 1.24 + (ln.gap || 0); });
      const gx = align === 'center' ? (g.x ?? W / 2) : align === 'right' ? g.x - ww / 2 : g.x + ww / 2;
      const ga = E.out(clamp(tin / 0.8)) * (1 - outK) * (g.scrim ?? 0.4);
      c.save(); c.translate(gx, y + hh / 2); c.scale(ww * 0.75 + 120, hh * 0.9 + 70);
      const rg = c.createRadialGradient(0, 0, 0, 0, 0, 1);
      rg.addColorStop(0, `rgba(45,24,20,${ga})`); rg.addColorStop(0.55, `rgba(45,24,20,${ga * 0.55})`); rg.addColorStop(1, 'rgba(45,24,20,0)');
      c.fillStyle = rg; c.fillRect(-1, -1, 2, 2); c.restore();
    }
    g.lines.forEach((ln, li) => {
      const st = STY[ln.s || 'title'];
      c.font = `${st.font} ${st.size}px Montserrat`; c.letterSpacing = `${st.ls}px`;
      const txt = ln.t;
      const widths = [];
      for (let i = 0; i <= txt.length; i++) widths.push(c.measureText(txt.slice(0, i)).width);
      const total = widths[txt.length] - st.ls;
      const x0 = align === 'center' ? g.x ?? W / 2 : g.x;
      const sx = align === 'center' ? x0 - total / 2 : align === 'right' ? x0 - total : x0;
      y += st.size * (li === 0 ? 0.5 : 0.62) + (ln.gap || 0);
      c.textBaseline = 'middle'; c.textAlign = 'left';
      for (let i = 0; i < txt.length; i++) {
        if (txt[i] === ' ') continue;
        const d = (ln.d || 0) + li * 0.12 + i * 0.022;
        const k = E.out(clamp((tin - d) / 0.7));
        if (k <= 0) continue;
        const a = k * (1 - outK);
        c.save();
        c.shadowColor = `rgba(40,20,15,${0.6 * a})`; c.shadowBlur = 22;
        c.fillStyle = `rgba(255,251,242,${a})`;
        c.fillText(txt[i], sx + widths[i], y + (1 - k) * 26 - outK * 14);
        c.restore();
      }
      y += st.size * 0.62;
    });
  }
  c.letterSpacing = '0px';
}

// ───────────────────────────── scenes ─────────────────────────────
const CLOUDS_A = cloudField(3, 22, CEIL + 10, CEIL + 380, 160, 520);
const CLOUDS_OPEN = cloudField(9, 26, 40, 560, 200, 700);

// S1 — exterior establishing, plane climbing toward camera
function s1(c, t, d) {
  const pal = PAL.golden, k = t / d;
  const z = lerp(1, 1.08, E.sine(k));
  c.save(); c.translate(W / 2, 620); c.scale(z, z); c.translate(-W / 2, -620);
  const hor = 740;
  c.fillStyle = skyGrad(c, -60, hor, pal); c.fillRect(-100, -100, W + 200, hor + 102);
  glow(c, 1260, 560, 900, [255, 236, 200], 0.7);
  c.fillStyle = 'rgba(255,248,226,0.9)'; circle(c, 1260, 560, 70); c.fill();
  drawClouds(c, CLOUDS_OPEN, t + 20, 0, pal, 0.95);
  mountains(c, hor + 4, [[180, 420, 900], [700, 520, 700], [1550, 360, 1000], [2050, 480, 700]], '#c49f92', '#8d7689', '#fbf1e2');
  c.fillStyle = 'rgba(246,215,170,0.45)'; c.fillRect(-100, 380, W + 200, hor - 376);
  mountains(c, hor + 6, [[-80, 560, 800], [520, 610, 600], [1200, 590, 760], [1900, 540, 900]], '#9c8a5e', '#6f6a55', null);
  skyline(c, 0, hor + 6, '#857a73', 2, 0.5);
  // terminal + tower
  c.fillStyle = '#e8dccb'; c.fillRect(1000, hor - 46, 520, 52); c.fillStyle = '#6d8fa0'; c.fillRect(1010, hor - 34, 500, 18); c.fillStyle = '#c9b8a2'; c.fillRect(990, hor - 52, 540, 8);
  tower(c, 1290, hor + 6, 220, '#ede3d5', '#6fa0b0', 0);
  // ground
  c.fillStyle = vgrad(c, hor, H + 100, [[0, '#c7b36a'], [0.25, '#a59a55'], [1, '#6d6a3f']]); c.fillRect(-100, hor, W + 200, H - hor + 100);
  const r = rng(5);
  for (let i = 0; i < 40; i++) { const sy = hor + Math.pow(r(), 1.6) * 360, sw = 80 + r() * 300; c.fillStyle = r() < 0.5 ? 'rgba(220,200,110,0.35)' : 'rgba(90,100,50,0.25)'; c.fillRect(r() * W, sy, sw, 6 + (sy - hor) * 0.05); }
  // runway in perspective
  const vx = 900;
  c.fillStyle = '#7d7469'; poly(c, [vx - 30, hor + 4, vx + 30, hor + 4, vx + 900, H + 100, vx - 900, H + 100]); c.fill();
  c.fillStyle = 'rgba(255,250,235,0.85)';
  for (let i = 0; i < 12; i++) {
    const a = Math.pow(i / 12, 2), b = Math.pow((i + 0.45) / 12, 2);
    const y0 = hor + 4 + a * (H + 100 - hor), y1 = hor + 4 + b * (H + 100 - hor);
    const w0 = 3 + a * 30, w1 = 3 + b * 30;
    poly(c, [vx - w0 / 2, y0, vx + w0 / 2, y0, vx + w1 / 2, y1, vx - w1 / 2, y1]); c.fill();
  }
  c.restore();
  // plane climbing toward camera
  const pk = clamp(t / d);
  const px = lerp(880, 1180, E.in2(pk)), py = lerp(700, -80, Math.pow(pk, 2.4)), span = lerp(80, 2000, Math.pow(pk, 2.3));
  planeFront(c, px, py, span, { bank: lerp(0, -0.12, pk), gear: pk < 0.5 });
  // foreground pines (parallax)
  const fx = -t * 26;
  for (const [x, hh] of [[60, 820], [210, 640], [-40, 560], [1830, 760], [1960, 600]]) pine(c, x + fx * (hh / 700), H + 40, hh, '#2a3b3a');
  rays(c, t, { cx: 1260, cy: 560, a: 0.1, ang: -0.9 });
  titles(c, t, [{ t0: 0.5, t1: d - 0.3, y: 250, lines: [{ t: "AIRPORTS DON'T FEEL" }, { t: 'LIKE REAL PLACES.' }] }]);
}

// S2 — empty gate, waiting room
function s2(c, t, d) {
  const cam = lerp(-80, 260, E.sine(t / d));
  concourse(c, t, {
    cam, pal: PAL.golden,
    ext: { extra: (c, ox, hor) => { planeSide(c, 520 + ox * 1.6, hor + 40, 1100, { tail: '#2f6fa6' }); c.fillStyle = '#d9cfc1'; c.fillRect(1020 + ox * 1.6, hor - 20, 380, 48); c.fillStyle = '#9c8f80'; c.fillRect(1020 + ox * 1.6, hor + 20, 380, 8); planeSide(c, 1650 + t * 40 + ox * 1.2, hor + 26, 520, { tail: '#c4473a', dir: -1 }); } },
    mid: c => {
      const by = 830, s = depthH(by);
      reflect(c, by, 0.18, 0.5, () => seatRow(c, 260 - cam, by, 9, s, '#2f5d63'));
      figure(c, 1080 - cam, 905, depthH(905), { pose: 'sitBack', view: 'back', col: '#1f2533', top: '#3c3040', hair: 'bun', rim: '#f2c48c', rimDy: -0.01 });
      reflect(c, 905, 0.18, 0.5, () => seatRow(c, 120 - cam * 1.1, 905, 10, depthH(905), '#2a545a'));
      board(c, 1560 - cam * 1.05, 330, 360, 215, t, { title: 'DEPARTURES', rows: FLIGHTS.slice(0, 5) });
      const ty = 1000, th = depthH(ty);
      reflect(c, ty, 0.12, 0.5, () => seatRow(c, 1350 - cam * 1.3, ty + 20, 6, th, '#24484d'));
    },
    pillars: [{ x: 120, w: 170 }, { x: 1800, w: 200 }],
  });
  rays(c, t, { a: 0.11 });
  bokeh(c, t, 21, 10, { a: 0.1, y0: 200, yr: 600 });
  titles(c, t, [{ t0: 0.35, t1: d - 0.35, y: 205, x: 820, lines: [{ t: 'THEY FEEL LIKE', s: 'sub' }, { t: 'WAITING ROOMS', gap: 6 }, { t: 'OUTSIDE OF REALITY.', s: 'sub', gap: 6 }] }]);
}

// S3 — traveller at the window, plane takes off
function s3(c, t, d) {
  const z = lerp(1.0, 1.06, E.sine(t / d));
  c.save(); c.translate(W * 0.65, H * 0.6); c.scale(z, z); c.translate(-W * 0.65, -H * 0.6);
  concourse(c, t, {
    cam: 520 + t * 30, pal: PAL.golden, step: 520,
    ext: {
      sunX: 1600, extra: (c, ox, hor) => {
        const k = clamp(t / d);
        const px = lerp(-200, 1500, k), py = hor + 30 - Math.pow(clamp((k - 0.25) / 0.75), 1.6) * 330;
        planeSide(c, px, py, 560, { rot: -0.18 * clamp((k - 0.2) * 3), gear: k < 0.5, tail: '#2f6fa6' });
      }
    },
    mid: c => {
      const fy = 1030, fh = 760;
      reflect(c, fy, 0.25, 0.4, () => figure(c, 1230, fy, fh, { view: 'back', col: '#1d2230', top: '#2a3242', rim: '#f6c88f', rimDx: 0.006, rimDy: -0.004 }));
      c.fillStyle = '#5a2e2a'; rrect(c, 1300, fy - 150, 70, 110, 8); c.fill(); c.fillStyle = '#2a1715'; c.fillRect(1320, fy - 165, 30, 18);
    },
    pillars: [{ x: 300, w: 220, par: 1.9 }],
  });
  c.restore();
  rays(c, t, { a: 0.14, cx: 1500, bands: [[-300, 220, 1], [100, 90, 0.8], [400, 300, 0.7]] });
  bokeh(c, t, 31, 9, { a: 0.14, r0: 40, rr: 90 });
  titles(c, t, [{ t0: 0.25, t1: d - 0.25, y: 420, x: 520, lines: [{ t: 'THINK ABOUT IT.', s: 'title' }] }]);
}

// S4 — enter the terminal; normal life dissolves into pixels
const PROPS = mk(W, H), PROP_BLOCKS = [];
(function buildProps() {
  const c = PROPS.getContext('2d');
  // left: tree, lamp, bench, bus stop
  c.fillStyle = '#4a3a33'; c.fillRect(186, 600, 26, 300);
  [[200, 520, 150, '#5f8a4c'], [140, 590, 100, '#4f7a40'], [270, 580, 110, '#6d9a55'], [200, 620, 120, '#557f45']].forEach(([x, y, r, col]) => { c.fillStyle = col; circle(c, x, y, r); c.fill(); });
  c.fillStyle = '#2f3138'; c.fillRect(420, 470, 14, 430); c.fillRect(420, 470, 70, 12); c.fillStyle = '#ffe2a8'; c.fillRect(470, 482, 30, 14);
  c.fillStyle = '#7a5134'; c.fillRect(470, 820, 220, 18); c.fillRect(470, 780, 220, 14); c.fillStyle = '#2f3138'; c.fillRect(485, 838, 10, 60); c.fillRect(665, 838, 10, 60);
  c.fillStyle = '#c64a3a'; circle(c, 90, 700, 34); c.fill(); c.fillStyle = '#2f3138'; c.fillRect(86, 730, 8, 170); c.fillStyle = '#fff'; c.font = '600 30px Montserrat'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText('BUS', 90, 701);
  // right: taxi, mailbox, bicycle, tree
  const cx = 1330, cy = 900;
  c.fillStyle = '#e8b33a'; rrect(c, cx, cy - 150, 380, 100, 26); c.fill(); poly(c, [cx + 70, cy - 150, cx + 120, cy - 220, cx + 270, cy - 220, cx + 320, cy - 150]); c.fill();
  c.fillStyle = '#9fc4d0'; poly(c, [cx + 92, cy - 152, cx + 128, cy - 206, cx + 190, cy - 206, cx + 190, cy - 152]); c.fill(); poly(c, [cx + 200, cy - 152, cx + 200, cy - 206, cx + 262, cy - 206, cx + 298, cy - 152]); c.fill();
  c.fillStyle = '#2a2a2e'; circle(c, cx + 85, cy - 45, 40); c.fill(); circle(c, cx + 300, cy - 45, 40); c.fill(); c.fillStyle = '#888'; circle(c, cx + 85, cy - 45, 16); c.fill(); circle(c, cx + 300, cy - 45, 16); c.fill();
  c.fillStyle = '#222'; c.fillRect(cx + 160, cy - 238, 70, 20); c.fillStyle = '#fff1b8'; c.fillRect(cx + 362, cy - 130, 16, 22);
  c.fillStyle = '#3a6fa8'; rrect(c, 1780, 760, 80, 110, 30); c.fill(); c.fillRect(1810, 860, 20, 40);
  c.strokeStyle = '#2b2d33'; c.lineWidth = 7; circle(c, 1135, 850, 48); c.stroke(); circle(c, 1265, 850, 48); c.stroke();
  stroke2(c, [1135, 850, 1185, 780, 1240, 780, 1265, 850], 7); stroke2(c, [1185, 780, 1200, 850, 1135, 850], 7); stroke2(c, [1240, 780, 1235, 760, 1255, 755], 7);
  c.fillStyle = '#4a3a33'; c.fillRect(1730, 560, 22, 340);
  [[1740, 480, 130, '#6d9a55'], [1690, 540, 90, '#5f8a4c'], [1800, 540, 100, '#4f7a40']].forEach(([x, y, r, col]) => { c.fillStyle = col; circle(c, x, y, r); c.fill(); });
  // birds on wire
  c.strokeStyle = '#2f3138'; c.lineWidth = 3; c.beginPath(); c.moveTo(0, 360); c.quadraticCurveTo(300, 420, 700, 380); c.stroke();
  c.fillStyle = '#2f3138'; [[220, 392], [300, 398], [480, 396]].forEach(([x, y]) => { circle(c, x, y - 10, 10); c.fill(); });
  const d = c.getImageData(0, 0, W, H).data, B = 24;
  for (let by = 0; by < H; by += B) for (let bx = 0; bx < W; bx += B) {
    let on = false;
    for (let yy = by; yy < by + B && !on; yy += 6) for (let xx = bx; xx < bx + B; xx += 6) if (d[(yy * W + xx) * 4 + 3] > 20) { on = true; break; }
    if (on) PROP_BLOCKS.push([bx, by, Math.random()]);
  }
})();
function s4(c, t, d) {
  const pal = PAL.golden;
  const z = lerp(1, 1.05, E.sine(t / d));
  c.save(); c.translate(W / 2, 640); c.scale(z, z); c.translate(-W / 2, -640);
  c.fillStyle = skyGrad(c, -40, 560, pal); c.fillRect(-60, -60, W + 120, 640);
  glow(c, 960, 300, 800, [255, 236, 200], 0.4);
  drawClouds(c, CLOUDS_OPEN, t + 60, 0, pal, 0.9, -40);
  // terminal facade
  const fy = 300, gy = 900;
  c.fillStyle = '#e4d6c3'; c.fillRect(-60, fy, W + 120, gy - fy);
  c.fillStyle = '#cdbca6'; c.fillRect(-60, fy, W + 120, 40);
  c.fillStyle = '#d7c6ae'; c.fillRect(-60, fy + 40, W + 120, 10);
  // big glass
  const gx0 = 120, gx1 = 1800, gy0 = fy + 110;
  c.fillStyle = vgrad(c, gy0, gy, [[0, '#9ebdc4'], [1, '#d8d0bc']]); c.fillRect(gx0, gy0, gx1 - gx0, gy - gy0);
  c.fillStyle = 'rgba(255,248,230,0.35)'; poly(c, [gx0 + 200, gy0, gx0 + 420, gy0, gx0 + 120, gy, gx0 - 100, gy]); c.fill(); poly(c, [1300, gy0, 1380, gy0, 1080, gy, 1000, gy]); c.fill();
  c.fillStyle = '#5c5f68'; for (let x = gx0; x <= gx1; x += 140) c.fillRect(x - 5, gy0, 10, gy - gy0); c.fillRect(gx0, gy0 + 200, gx1 - gx0, 8);
  // sign
  c.font = '500 54px Montserrat'; c.letterSpacing = '22px'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillStyle = '#3a3f4b'; c.fillText('DEPARTURES', 970, fy + 78); c.letterSpacing = '0px';
  // doors
  const dx0 = 780, dx1 = 1140, dy0 = 560, dw = (dx1 - dx0) / 2;
  const open = E.io(ramp(1.1, 2.0, t)) * (1 - E.io(ramp(3.3, 4.0, t)) * 0.4);
  const inner = ramp(0.6, 2.0, t);
  c.fillStyle = '#fff4dc'; c.fillRect(dx0, dy0, dx1 - dx0, gy - dy0);
  glow(c, (dx0 + dx1) / 2, (dy0 + gy) / 2, 360, [255, 240, 205], 0.5 + inner * 0.5);
  c.fillStyle = '#4b4e57'; c.fillRect(dx0 - 14, dy0 - 18, dx1 - dx0 + 28, 18);
  for (const side of [-1, 1]) {
    const pxp = side < 0 ? dx0 - open * dw * 0.95 : dx0 + dw + open * dw * 0.95;
    c.fillStyle = 'rgba(160,190,200,0.75)'; c.fillRect(pxp, dy0, dw, gy - dy0);
    c.strokeStyle = '#4b4e57'; c.lineWidth = 8; c.strokeRect(pxp + 4, dy0 + 4, dw - 8, gy - dy0 - 4);
  }
  // pavement
  c.fillStyle = vgrad(c, gy, H + 60, [[0, '#bdb3a4'], [1, '#8f8578']]); c.fillRect(-60, gy, W + 120, H - gy + 60);
  c.fillStyle = '#d8cfc0'; c.fillRect(-60, gy, W + 120, 10);
  c.fillStyle = 'rgba(80,60,40,0.12)'; for (let i = 0; i < 6; i++) c.fillRect(-60, gy + 30 + i * i * 6, W + 120, 3);
  c.restore();
  // normal life: pixel dissolve
  const dk = ramp(2.2, 4.2, t);
  c.save(); c.translate(W / 2, 640); c.scale(z, z); c.translate(-W / 2, -640);
  if (dk <= 0) c.drawImage(PROPS, 0, 0);
  else {
    for (const [bx, by, rr] of PROP_BLOCKS) {
      const local = clamp((dk - rr * 0.55) / 0.45);
      if (local >= 1) continue;
      const e = E.in2(local);
      const a = 1 - e;
      const dx = (bx - 960) * 0.08 * e, dy = -e * (140 + rr * 220);
      c.globalAlpha = a;
      const bs = 24 * (1 - e * 0.5);
      c.drawImage(PROPS, bx, by, 24, 24, bx + dx + (24 - bs) / 2, by + dy, bs, bs);
    }
    c.globalAlpha = 1;
  }
  c.restore();
  // traveller walking into the light
  const wk = clamp(t / 2.9);
  if (t < 3.2) {
    const ty = lerp(1260, 905, E.out(wk)), th = lerp(760, 300, E.out(wk));
    const fade = 1 - ramp(2.6, 3.1, t);
    c.save(); c.globalAlpha = fade;
    const tx = lerp(900, 950, wk);
    figure(c, tx, ty, th, { view: 'back', pose: 'walk', phase: t * 7.5, col: '#1f2431', top: '#33293a', pack: true, packCol: '#5a3f3a' });
    c.fillStyle = '#2d3240'; rrect(c, tx + th * 0.16, ty - th * 0.27, th * 0.17, th * 0.26, th * 0.02); c.fill();
    c.restore();
  }
  // white-out into the terminal
  const wo = E.in2(ramp(3.9, d, t));
  glow(c, 960, 730, lerp(400, 2600, wo), [255, 246, 228], 0.3 + wo);
  c.fillStyle = `rgba(255,248,236,${wo})`; c.fillRect(0, 0, W, H);
  rays(c, t, { cx: 960, cy: 600, a: 0.08, ang: -0.5 });
  titles(c, t, [
    { t0: 0.2, t1: 2.5, y: 105, lines: [{ t: 'THE SECOND YOU', s: 'mid' }, { t: 'ENTER AN AIRPORT,', s: 'mid' }] },
    { t0: 2.4, t1: d - 0.25, y: 120, lines: [{ t: 'NORMAL LIFE', s: 'title' }, { t: 'KIND OF DISAPPEARS.', s: 'sub', gap: 8 }] },
  ]);
}

// S5 — clocks of the world spin out of sync
function s5(c, t, d) {
  const cam = lerp(0, 140, E.sine(t / d));
  const z = lerp(1.04, 1.0, E.out(t / d));
  c.save(); c.translate(W / 2, H / 2); c.scale(z, z); c.translate(-W / 2 - cam, -H / 2);
  c.fillStyle = vgrad(c, 0, H, [[0, '#e9d7bd'], [1, '#d5bd9f']]); c.fillRect(-200, -100, W + 600, H + 200);
  c.fillStyle = 'rgba(150,110,80,0.10)'; for (let x = -200; x < W + 400; x += 48) c.fillRect(x, 0, 20, 760);
  c.fillStyle = '#b89e82'; c.fillRect(-200, 760, W + 600, 14);
  c.fillStyle = vgrad(c, 774, H, [[0, '#c4ad94'], [1, '#8e7866']]); c.fillRect(-200, 774, W + 600, H);
  const cities = [['NEW YORK', -5, 1], ['LONDON', 0, 1.6], ['DUBAI', 4, -1.2], ['DELHI', 5.5, 2.4], ['TOKYO', 9, 0.6]];
  cities.forEach(([name, off, sp], i) => {
    const cx = 330 + i * 345, cy = 470, R = 132;
    const wob = Math.sin(t * 3 + i) * 0.04 * ramp(1, 3, t);
    c.fillStyle = 'rgba(90,60,40,0.18)'; circle(c, cx + 14, cy + 18, R + 8); c.fill();
    c.fillStyle = '#3b2e2a'; circle(c, cx, cy, R + 10); c.fill();
    c.fillStyle = '#fbf6ec'; circle(c, cx, cy, R); c.fill();
    c.save(); c.translate(cx, cy); c.rotate(wob);
    c.fillStyle = '#3b2e2a';
    for (let m = 0; m < 12; m++) { c.save(); c.rotate(m * Math.PI / 6); c.fillRect(-3, -R + 10, 6, m % 3 ? 14 : 24); c.restore(); }
    // time runs at different, accelerating rates
    const spin = (t * 0.6 + Math.pow(t, 2.4) * 0.35) * sp;
    const hours = 3 + off + spin * 0.6, mins = (hours % 1) * 60 + spin * 30;
    const ha = hours / 12 * Math.PI * 2, ma = mins / 60 * Math.PI * 2;
    c.lineCap = 'round'; c.strokeStyle = '#2b2220';
    c.lineWidth = 11; c.beginPath(); c.moveTo(0, 0); c.lineTo(Math.sin(ha) * R * 0.5, -Math.cos(ha) * R * 0.5); c.stroke();
    c.lineWidth = 7; c.beginPath(); c.moveTo(0, 0); c.lineTo(Math.sin(ma) * R * 0.78, -Math.cos(ma) * R * 0.78); c.stroke();
    const sa = (t * 6 * sp + i) ; c.strokeStyle = '#c44a36'; c.lineWidth = 3; c.beginPath(); c.moveTo(-Math.sin(sa) * 20, Math.cos(sa) * 20); c.lineTo(Math.sin(sa) * R * 0.85, -Math.cos(sa) * R * 0.85); c.stroke();
    c.fillStyle = '#c44a36'; circle(c, 0, 0, 9); c.fill();
    c.restore();
    c.font = '500 26px Montserrat'; c.letterSpacing = '7px'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillStyle = '#5a4136';
    c.fillText(name, cx + 4, cy + R + 56); c.letterSpacing = '0px';
  });
  c.restore();
  rays(c, t, { a: 0.16, cx: 800, cy: 100, ang: -0.7 });
  // foreground walker
  const wx = lerp(2100, -300, t / d);
  c.save(); c.filter = 'blur(9px)';
  figure(c, wx, 1180, 1000, { pose: 'walk', phase: t * 6.2, flip: true, col: '#221c22', top: '#2b2230', bag: true });
  c.restore();
  bokeh(c, t, 51, 8, { a: 0.1 });
  const wash = 1 - E.out(ramp(0, 0.6, t));
  c.fillStyle = `rgba(255,248,236,${wash})`; c.fillRect(0, 0, W, H);
  titles(c, t, [{ t0: 0.4, t1: d - 0.25, y: 92, lines: [{ t: 'TIME ZONES', s: 'title' }, { t: 'STOP MAKING SENSE.', s: 'sub', gap: 6 }] }]);
}

// S6 — 3 a.m. outside, lights snap on inside
function s6(c, t, d) {
  const z = lerp(1.0, 1.05, E.sine(t / d));
  c.save(); c.translate(W / 2, H / 2); c.scale(z, z); c.translate(-W / 2, -H / 2);
  const ON = 1.5;
  const lightOn = i => { const tt = ON + (i + 1) * 0.07; return t < tt ? 0.06 : 1; };
  const lights = clamp(0.08 + ramp(ON, ON + 0.6, t) * 0.92);
  concourse(c, t, {
    cam: lerp(0, 90, t / d), pal: PAL.night, lights, lightOn,
    floorTop: '#d7c8b2', floorBot: '#8a7967',
    ext: { moonX: 1820, moonY: 220, extra: (c, ox, hor) => planeSide(c, 1100 - t * 30 + ox, hor + 40, 760, { night: 1, t, dir: -1, lit: 0.8 }) },
    mid: c => {
      board(c, 160, 210, 560, 320, t, { clock: '03:00', glow: 1 });
      reflect(c, 860, 0.15, 0.5, () => seatRow(c, 820, 860, 7, depthH(860), '#2f5d63'));
      reflect(c, 960, 0.2, 0.5, () => figure(c, 520, 960, depthH(960), { view: 'back', col: '#1d2130', top: '#3a2c3c', bag: false, rim: '#a8b8ff', rimDy: -0.008 }));
      c.fillStyle = '#333845'; rrect(c, 580, 960 - 110, 58, 100, 8); c.fill();
    },
  });
  c.restore();
  // flash of the lights switching on
  const fl = Math.max(0, 1 - Math.abs(t - (ON + 0.25)) / 0.3) * 0.18;
  if (fl > 0) { c.fillStyle = `rgba(255,250,235,${fl})`; c.fillRect(0, 0, W, H); }
  if (lights > 0.5) bokeh(c, t, 61, 8, { a: 0.08 * lights, y0: 0, yr: 300 });
  titles(c, t, [
    { t0: 0.25, t1: ON + 0.5, y: 250, x: 1380, lines: [{ t: 'IT CAN BE', s: 'sub' }, { t: '3 A.M.', s: 'big', gap: 10 }] },
    { t0: ON + 0.75, t1: d - 0.25, y: 250, x: 1300, lines: [{ t: 'AND IT WILL BE', s: 'sub' }, { t: 'FULLY BRIGHT', s: 'title', gap: 6 }, { t: 'INSIDE.', s: 'title' }] },
  ]);
}

// S7 — sleeping on the floor
function s7(c, t, d) {
  const cam = lerp(0, 160, E.sine(t / d));
  concourse(c, t, {
    cam, pal: PAL.night, lights: 1,
    floorTop: '#d7c8b2', floorBot: '#8a7967',
    ext: { moonX: 1680, moonY: 250 },
    mid: c => {
      reflect(c, 860, 0.15, 0.5, () => seatRow(c, 300 - cam, 860, 12, depthH(860), '#2f5d63'));
      // pillar against which someone sleeps sitting
      const px = 1500 - cam * 1.1;
      c.fillStyle = '#9a6a5a'; c.fillRect(px, CEIL, 120, 870 - CEIL); c.fillStyle = '#7b5144'; c.fillRect(px + 90, CEIL, 30, 870 - CEIL);
      reflect(c, 905, 0.15, 0.5, () => dozer(c, px - 10, 905, depthH(905), { t }));
      // lying people
      reflect(c, 975, 0.12, 0.4, () => sleeper(c, 330 - cam * 1.2, 975, 560, { t, top: '#5a3438', pill: '#3f6a7a' }));
      reflect(c, 1045, 0.12, 0.4, () => sleeper(c, 940 - cam * 1.25, 1045, 640, { t, ph: 1.7, col: '#1e2232', top: '#3c4a3a', pill: '#8a5a3a', hair: 'long', jacket: '#7a5a3a' }));
      // zzz
      c.font = '400 36px Montserrat';
      for (let i = 0; i < 3; i++) {
        const k = ((t * 0.5 + i / 3) % 1);
        c.fillStyle = `rgba(255,255,255,${Math.sin(k * Math.PI) * 0.7})`;
        c.fillText('z', 400 - cam * 1.2 + k * 40 + i * 6, 860 - k * 120);
        c.fillText('z', 1010 - cam * 1.25 + k * 50, 920 - k * 130 - i * 4);
      }
    },
    pillars: [{ x: -60, w: 180 }],
  });
  bokeh(c, t, 71, 8, { a: 0.07, y0: 0, yr: 320 });
  titles(c, t, [{ t0: 0.25, t1: d - 0.2, y: 230, lines: [{ t: 'PEOPLE ARE SLEEPING', s: 'title' }, { t: 'ON THE FLOOR,', s: 'title' }] }]);
}

// close-up profile for S8 / S9
function profile(c, x, y, s, o) {
  // x,y = shoulder centre; s = head radius
  const col = o.col || '#241e29', rim = o.rim;
  const draw = (fill) => {
    c.fillStyle = css(fill); c.strokeStyle = css(fill);
    c.lineCap = 'round'; c.lineJoin = 'round';
    // torso
    c.beginPath(); c.moveTo(x - 2.2 * s, y + 0.3 * s);
    c.quadraticCurveTo(x - 1.6 * s, y - 0.5 * s, x - 0.2 * s, y - 0.55 * s);
    c.quadraticCurveTo(x + 1.3 * s, y - 0.5 * s, x + 1.7 * s, y + 0.8 * s);
    c.lineTo(x + 1.9 * s, y + 8 * s); c.lineTo(x - 2.6 * s, y + 8 * s); c.closePath(); c.fill();
    // neck + head
    c.fillRect(x - 0.35 * s, y - 1.3 * s, 0.75 * s, 1.0 * s);
    const hx = x + 0.15 * s, hy = y - 1.75 * s;
    c.beginPath(); c.ellipse(hx, hy, 0.95 * s, 1.05 * s, 0, 0, Math.PI * 2); c.fill();
    poly(c, [hx + 0.85 * s, hy - 0.25 * s, hx + 1.18 * s, hy + 0.2 * s, hx + 0.88 * s, hy + 0.32 * s]); c.fill();
    c.beginPath(); c.ellipse(hx + 0.6 * s, hy + 0.75 * s, 0.4 * s, 0.32 * s, 0.4, 0, Math.PI * 2); c.fill();
    if (o.hair === 'bun') { circle(c, hx - 0.75 * s, hy - 0.75 * s, 0.45 * s); c.fill(); }
    if (o.hair === 'short') { c.beginPath(); c.ellipse(hx - 0.1 * s, hy - 0.45 * s, 1.0 * s, 0.75 * s, -0.2, Math.PI, Math.PI * 2.1); c.fill(); }
    // arms via IK
    for (const arm of o.arms || []) {
      const sx = x + arm.sx * s, sy = y + arm.sy * s;
      const [ex, ey] = ik(sx, sy, arm.hx, arm.hy, 1.9 * s, 1.75 * s, arm.bend ?? 1);
      c.lineWidth = 0.62 * s; stroke2(c, [sx, sy, ex, ey, arm.hx, arm.hy], 0.62 * s);
      circle(c, arm.hx, arm.hy, 0.36 * s); c.fill();
    }
  };
  if (rim) { c.save(); c.translate(-0.07 * s, -0.05 * s); draw(rim); c.restore(); c.save(); c.translate(0.06 * s, -0.06 * s); draw(rim); c.restore(); }
  draw(col);
}
function steam(c, x, y, t, n = 3, a = 0.5, scale = 1) {
  c.lineCap = 'round';
  for (let i = 0; i < n; i++) {
    c.strokeStyle = `rgba(255,255,255,${a})`; c.lineWidth = 7 * scale;
    c.beginPath();
    for (let k = 0; k <= 20; k++) {
      const p = k / 20, yy = y - p * 170 * scale - ((t * 40) % 30) * scale, xx = x + (i - 1) * 26 * scale + Math.sin(p * 6 + t * 2.5 + i * 2) * 14 * scale;
      if (k === 0) c.moveTo(xx, yy); else c.lineTo(xx, yy);
    }
    const g = c.createLinearGradient(0, y, 0, y - 190 * scale);
    g.addColorStop(0, `rgba(255,255,255,0)`); g.addColorStop(0.3, `rgba(255,255,255,${a})`); g.addColorStop(1, 'rgba(255,255,255,0)');
    c.strokeStyle = g; c.stroke();
  }
}

// S8 — noodles for breakfast (dawn)
function s8(c, t, d) {
  const z = lerp(1.0, 1.06, E.sine(t / d));
  c.save(); c.translate(1150, 600); c.scale(z, z); c.translate(-1150, -600);
  concourse(c, t, {
    cam: 200 + t * 25, pal: PAL.dawn, step: 460,
    ext: { sunX: 700, sunY: 560, extra: (c, ox, hor) => planeSide(c, 200 + ox + t * 50, hor - 60 - t * 25, 300, { rot: -0.15, tail: '#c4473a' }) },
  });
  // counter
  c.fillStyle = '#3b2b28'; c.fillRect(-20, 860, W + 40, 30); c.fillStyle = '#58403a'; c.fillRect(-20, 860, W + 40, 8);
  c.fillStyle = 'rgba(30,20,20,0.85)'; c.fillRect(-20, 890, W + 40, H);
  // person
  const s = 92, sx = 1200, sy = 640;
  const lift = E.sine((Math.sin(t * 2.6 - 1.2) + 1) / 2);
  const cupX = 1420, cupY = 760;
  const chopY = lerp(cupY - 30, cupY - 190, lift);
  profile(c, sx, sy, s, { col: '#2a2130', rim: '#ffcf9e', hair: 'bun', arms: [{ sx: -0.2, sy: 0.4, hx: cupX - 20, hy: cupY + 40, bend: 1 }] });
  // cup
  c.fillStyle = '#f6efe2'; poly(c, [cupX - 70, cupY - 70, cupX + 70, cupY - 70, cupX + 52, cupY + 80, cupX - 52, cupY + 80]); c.fill();
  c.fillStyle = '#d24a3a'; poly(c, [cupX - 64, cupY - 30, cupX + 64, cupY - 30, cupX + 60, cupY + 6, cupX - 60, cupY + 6]); c.fill();
  c.fillStyle = '#fff'; c.font = '600 22px Montserrat'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.letterSpacing = '3px'; c.fillText('RAMEN', cupX, cupY - 12); c.letterSpacing = '0px';
  c.fillStyle = '#e9c27a'; c.beginPath(); c.ellipse(cupX, cupY - 70, 70, 14, 0, 0, Math.PI * 2); c.fill();
  // noodles from cup to chopsticks
  c.strokeStyle = '#f2cf7c'; c.lineWidth = 5; c.lineCap = 'round';
  for (let i = 0; i < 5; i++) {
    c.beginPath();
    const x0 = cupX - 18 + i * 8;
    for (let k = 0; k <= 16; k++) { const p = k / 16, yy = lerp(cupY - 70, chopY + 10, p), xx = x0 + Math.sin(p * 9 + i + t * 3) * 6 * (1 - p) + (cupX + 10 - x0) * p * 0.3; if (k) c.lineTo(xx, yy); else c.moveTo(xx, yy); }
    c.stroke();
  }
  // near arm + chopsticks
  const hand = [cupX + 40, chopY - 40];
  profile(c, sx, sy, s, { col: '#2a2130', arms: [{ sx: 0.4, sy: 0.3, hx: hand[0], hy: hand[1], bend: 1 }] });
  c.strokeStyle = '#c99a5f'; c.lineWidth = 7;
  stroke2(c, [hand[0] + 10, hand[1] - 10, cupX + 2, chopY + 14], 7); stroke2(c, [hand[0] + 22, hand[1] - 4, cupX + 16, chopY + 16], 7);
  steam(c, cupX, cupY - 90, t, 3, 0.35, 1.1);
  c.restore();
  rays(c, t, { a: 0.12, cx: 700, cy: 520, ang: -0.95, col: '#ffe6cc' });
  bokeh(c, t, 81, 10, { a: 0.13, col: '#ffe0c8' });
  titles(c, t, [{ t0: 0.2, t1: d - 0.2, y: 230, x: 560, lines: [{ t: 'EATING NOODLES', s: 'title' }, { t: 'FOR BREAKFAST,', s: 'title' }] }]);
}

// S9 — coffee at midnight
function s9(c, t, d) {
  const z = lerp(1.04, 1.0, E.sine(t / d));
  c.save(); c.translate(700, 600); c.scale(z, z); c.translate(-700, -600);
  concourse(c, t, {
    cam: 900 - t * 25, pal: PAL.night, step: 460, lights: 1,
    floorTop: '#d7c8b2', floorBot: '#8a7967',
    ext: { moonX: 300, moonY: 300, extra: (c, ox, hor) => planeSide(c, 300 + t * 60 + ox * 0.5, hor + 30, 600, { night: 1, t, lit: 0.8 }) },
  });
  // hanging clock
  const kx = 1240, ky = 560;
  c.strokeStyle = '#2a2c33'; c.lineWidth = 4; stroke2(c, [kx + 60, 0, kx + 60, ky], 4); stroke2(c, [kx + 340, 0, kx + 340, ky], 4);
  c.fillStyle = '#141b2a'; rrect(c, kx, ky, 400, 150, 16); c.fill();
  glow(c, kx + 200, ky + 75, 300, [255, 120, 80], 0.14);
  c.font = '500 96px Montserrat'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.letterSpacing = '8px';
  c.fillStyle = '#ff7a5c'; c.fillText(Math.floor(t * 2) % 2 ? '00 00' : '00:00', kx + 204, ky + 80); c.letterSpacing = '0px';
  // counter
  c.fillStyle = '#3b2b28'; c.fillRect(-20, 880, W + 40, 30); c.fillStyle = '#58403a'; c.fillRect(-20, 880, W + 40, 8);
  c.fillStyle = 'rgba(30,20,20,0.88)'; c.fillRect(-20, 910, W + 40, H);
  // person (faces left), raising cup
  const s = 95, sx = 760, sy = 640;
  const rk = E.io(ramp(0.3, 1.3, t)) * (1 - E.io(ramp(2.0, 2.6, t)) * 0.6);
  const cx = lerp(470, 560, rk), cy = lerp(840, 520, rk), tilt = lerp(0, -0.45, rk);
  c.save(); c.translate(2 * sx, 0); c.scale(-1, 1);
  profile(c, sx, sy, s, { col: '#1f1c2a', rim: '#a9b6ff', hair: 'short', arms: [{ sx: 0.3, sy: 0.35, hx: 2 * sx - cx - 10, hy: cy + 40, bend: 1 }] });
  c.restore();
  // cup
  c.save(); c.translate(cx, cy); c.rotate(tilt);
  c.fillStyle = '#f2ece2'; poly(c, [-50, -80, 50, -80, 40, 70, -40, 70]); c.fill();
  c.fillStyle = '#7a4a32'; poly(c, [-47, -30, 47, -30, 43, 25, -43, 25]); c.fill();
  c.fillStyle = '#e7dccb'; rrect(c, -56, -98, 112, 22, 8); c.fill();
  c.restore();
  if (rk < 0.7) steam(c, cx, cy - 110, t, 2, 0.3, 0.9);
  c.restore();
  bokeh(c, t, 91, 8, { a: 0.08, y0: 0, yr: 400 });
  titles(c, t, [{ t0: 0.2, t1: d - 0.2, y: 210, x: 1440, lines: [{ t: 'DRINKING COFFEE', s: 'title' }, { t: 'AT MIDNIGHT.', s: 'title' }] }]);
}

// S10 — the concourse goes on; outside, day and night race past
const WALKERS = (() => {
  const r = rng(101), a = [];
  for (let i = 0; i < 9; i++) a.push({ y: 820 + r() * 250, x: r() * 2400 - 200, v: (r() < 0.5 ? -1 : 1) * (60 + r() * 90), ph: r() * 6, bag: r() < 0.6, top: ['#3a2c3c', '#24394a', '#5b2a2e', '#2f3b2c', '#40342a'][i % 5], hair: r() < 0.3 ? 'long' : r() < 0.5 ? 'bun' : null, dress: r() < 0.2 });
  return a.sort((p, q) => p.y - q.y);
})();
function s10(c, t, d) {
  const z = lerp(1.1, 1.0, E.out(t / d));
  c.save(); c.translate(W / 2, H * 0.55); c.scale(z, z); c.translate(-W / 2, -H * 0.55);
  const cyc = [PAL.golden, PAL.dusk, PAL.night, PAL.dawn, PAL.golden];
  const p = clamp(t / (d - 0.8)) * (cyc.length - 1), i = Math.min(Math.floor(p), cyc.length - 2);
  const pal = palMix(cyc[i], cyc[i + 1], E.s(p - i));
  const sunA = p * Math.PI * 0.5;
  concourse(c, t, {
    cam: lerp(0, 120, t / d), pal, lights: 1,
    floorTop: '#d2c0a8', floorBot: '#857262',
    ext: { sunX: 1500 - p * 400, sunY: 470 + Math.sin(sunA) * 260, moonX: 1500, moonY: 260 + Math.abs(p - 2) * 200, clouds: CLOUDS_A },
    mid: c => {
      board(c, 1520, 300, 360, 210, t, {});
      reflect(c, 850, 0.15, 0.5, () => seatRow(c, 120, 850, 6, depthH(850), '#2f5d63'));
      // sleeping on seats
      sleeper(c, 200, 850 - depthH(850) * 0.24, depthH(850) * 0.95, { t, top: '#5a3438', pill: '#3f6a7a' });
      reflect(c, 850, 0.15, 0.5, () => seatRow(c, 120, 850, 6, depthH(850), '#2f5d63'));
      // coffee drinker
      const ch = depthH(880);
      figure(c, 1080, 880, ch, { col: '#1f2331', top: '#2f3b2c', arms: [[0.35, 2.75], [0.1, 0.05]] });
      c.fillStyle = '#efe6d8'; c.fillRect(1080 + ch * 0.07, 880 - ch * 0.73, ch * 0.045, ch * 0.06);
      for (const w of WALKERS) {
        const span = 2500;
        const x = (((w.x + w.v * t) % span) + span) % span - 300;
        const hh = depthH(w.y);
        reflect(c, w.y, 0.14, 0.45, () => figure(c, x, w.y, hh, { pose: 'walk', phase: w.ph + t * Math.abs(w.v) / hh * 9, flip: w.v < 0, col: '#1d2130', top: w.top, bag: w.bag, hair: w.hair, dress: w.dress }));
      }
    },
    pillars: [{ x: 600, w: 160, par: 1.3 }],
  });
  c.restore();
  rays(c, t, { a: 0.1 * (1 - pal.night * 0.6) });
  bokeh(c, t, 111, 10, { a: 0.1 });
  titles(c, t, [{ t0: 0.8, t1: d - 0.7, y: 230, x: 860, lines: [{ t: 'NOBODY QUESTIONS IT.', s: 'title' }] }]);
  const fo = E.in2(ramp(d - 1.0, d, t));
  c.fillStyle = `rgba(14,10,14,${fo})`; c.fillRect(0, 0, W, H);
}

// ───────────────────────────── timeline ─────────────────────────────
const SCENES = [
  { f: s1, t0: 0.0, t1: 4.4 },
  { f: s2, t0: 4.4, t1: 9.0 },
  { f: s3, t0: 9.0, t1: 11.2 },
  { f: s4, t0: 11.2, t1: 16.2 },
  { f: s5, t0: 16.2, t1: 19.4 },
  { f: s6, t0: 19.4, t1: 24.0 },
  { f: s7, t0: 24.0, t1: 26.6 },
  { f: s8, t0: 26.6, t1: 29.0 },
  { f: s9, t0: 29.0, t1: 31.6 },
  { f: s10, t0: 31.6, t1: 38.0 },
];
const DURATION = 38.0;
// foreground column wipes that hide some cuts (time of the cut)
const WIPES = [9.0, 29.0];

function wipe(c, t) {
  for (const tc of WIPES) {
    const k = (t - tc) / 0.7; // -1..1 around the cut
    if (k < -1 || k > 1) continue;
    const p = (k + 1) / 2;
    const w = W * 1.5, x = lerp(W + 150, -w - 150, E.io(p));
    const g = c.createLinearGradient(x, 0, x + w, 0);
    g.addColorStop(0, 'rgba(40,24,26,0)'); g.addColorStop(0.12, 'rgba(48,28,30,0.97)'); g.addColorStop(0.5, 'rgba(70,40,38,1)'); g.addColorStop(0.88, 'rgba(48,28,30,0.97)'); g.addColorStop(1, 'rgba(40,24,26,0)');
    c.fillStyle = g; c.fillRect(x, 0, w, H);
  }
}

function renderAt(t) {
  t = clamp(t, 0, DURATION - 1e-4);
  const sc = SCENES.find(s => t >= s.t0 && t < s.t1) || SCENES[SCENES.length - 1];
  LX.setTransform(1, 0, 0, 1, 0, 0);
  LX.globalAlpha = 1; LX.globalCompositeOperation = 'source-over';
  LX.clearRect(0, 0, W, H);
  sc.f(LX, t - sc.t0, sc.t1 - sc.t0);
  wipe(LX, t);
  post(LX, t);
  X.drawImage(LAYER, 0, 0);
}
window.renderAt = renderAt;
window.DURATION = DURATION;
window.FONTS_READY = document.fonts.load('300 40px Montserrat').then(() => document.fonts.load('400 40px Montserrat')).then(() => document.fonts.load('500 40px Montserrat'));

if (/render/.test(location.search)) document.body.classList.add('render');
else {
  window.FONTS_READY.then(() => {
    const start = performance.now();
    const loop = () => { renderAt(((performance.now() - start) / 1000) % DURATION); requestAnimationFrame(loop); };
    loop();
  });
}
