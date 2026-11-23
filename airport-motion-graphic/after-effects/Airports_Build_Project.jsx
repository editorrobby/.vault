/*  AIRPORTS — After Effects project builder
 *  ------------------------------------------------------------------
 *  Run inside After Effects:  File > Scripts > Run Script File...  and pick this file.
 *  (Keep it next to music.wav so the soundtrack is imported too.)
 *
 *  Builds a fully editable project:
 *    - "AIRPORTS - MAIN" master comp (38 s, 1920x1080, 30 fps) with the 10 scenes in sequence,
 *      column wipes, grade / bloom / vignette / grain adjustment layers, music, and voiceover markers.
 *    - One comp per scene, every element on its own native shape or text layer
 *      (sky, clouds, mountains, planes, mullions, seats, people, clocks, captions, light rays, bokeh...).
 *    - Window views are precomps ("Sxx ... Exterior"), the departures board is a reusable precomp.
 *    - Camera moves: each scene has a "CAMERA" null. Its "Pan" slider drives parallax
 *      (layers move by Pan x their depth factor via expressions); its Scale does the push-ins.
 *    - Walk cycles, clock hands, drifting clouds, blinking lights etc. are expressions;
 *      text reveals use text animators; everything else is keyframed.
 *
 *  Fonts: install the Montserrat TTFs in the "fonts" folder (Light, Regular, Medium) before running.
 */
#target aftereffects

(function () {

var W = 1920, H = 1080, FPS = 30, DUR = 38;
var CEIL = 150, FLOOR = 770, FH = FLOOR - CEIL;
var R2D = 180 / Math.PI;
var ROOT = File($.fileName).parent;
var FONT = { light: 'Montserrat-Light', regular: 'Montserrat-Regular', medium: 'Montserrat-Medium' };

// ───────────────────────── math & colour ─────────────────────────
function lerp(a, b, t) { return a + (b - a) * t; }
function clamp(v, a, b) { if (a === undefined) { a = 0; b = 1; } return v < a ? a : (v > b ? b : v); }
function ramp(a, b, v) { return clamp((v - a) / (b - a), 0, 1); }
function sine(t) { return 0.5 - 0.5 * Math.cos(Math.PI * t); }
function in2(t) { return t * t; }
function outc(t) { return 1 - Math.pow(1 - t, 3); }
function io(t) { return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2; }
function smooth(t) { return t * t * (3 - 2 * t); }
function hex(h) {
  if (typeof h !== 'string') return h;
  h = h.replace('#', '');
  return [parseInt(h.substr(0, 2), 16) / 255, parseInt(h.substr(2, 2), 16) / 255, parseInt(h.substr(4, 2), 16) / 255];
}
function mix(a, b, t) { a = hex(a); b = hex(b); return [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)]; }
function shade(c, k) { return k < 0 ? mix(c, [0, 0, 0], -k) : mix(c, [1, 1, 1], k); }
function c4(c) { c = hex(c); return [c[0], c[1], c[2], 1]; }
function imul(a, b) {
  var ah = (a >>> 16) & 0xffff, al = a & 0xffff, bh = (b >>> 16) & 0xffff, bl = b & 0xffff;
  return ((al * bl) + ((((ah * bl) + (al * bh)) << 16) >>> 0)) | 0;
}
function rng(a) {
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    var t = imul(a ^ (a >>> 15), 1 | a);
    t = (t + imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

var PAL = {
  golden: { sky: ['#86b2bd', '#d3dccb', '#f4e1ba', '#f6bf86'], cl: '#fbf1dc', cs: '#d8a690', night: 0, sun: 1, ground: '#9d917b', grass: '#b0a45c', far: '#c9a99a', mid: '#8f7c8c' },
  dusk: { sky: ['#3e4f80', '#977ea2', '#e59e85', '#f0a26c'], cl: '#f2c2a8', cs: '#8e6a8a', night: 0.35, sun: 0.6, ground: '#6e6274', grass: '#7a6e58', far: '#8a6f88', mid: '#5e4e6c' },
  night: { sky: ['#050a20', '#0d1840', '#1d2858', '#38386a'], cl: '#2f3a6a', cs: '#1b2350', night: 1, sun: 0, ground: '#181c32', grass: '#141a2c', far: '#252a50', mid: '#1a1f3e' },
  dawn: { sky: ['#56689c', '#ab9cba', '#f1b6a0', '#f9d39a'], cl: '#ffe3cf', cs: '#c2909f', night: 0.12, sun: 0.85, ground: '#8f8189', grass: '#9a8f6e', far: '#b99aa8', mid: '#7d6c86' }
};
function palMix(a, b, t) {
  var o = {}, k, i;
  for (k in a) {
    if (a[k] instanceof Array) { o[k] = []; for (i = 0; i < a[k].length; i++) o[k].push(mix(a[k][i], b[k][i], t)); }
    else if (typeof a[k] === 'number') o[k] = lerp(a[k], b[k], t);
    else o[k] = mix(a[k], b[k], t);
  }
  return o;
}
function palAt(p) { // time-lapse palette for the finale, p in 0..4
  var cyc = [PAL.golden, PAL.dusk, PAL.night, PAL.dawn, PAL.golden];
  var i = Math.min(Math.floor(p), 3);
  return palMix(cyc[i], cyc[i + 1], smooth(p - i));
}

// ───────────────────────── paths ─────────────────────────
function PB() { this.v = []; this.i = []; this.o = []; this.closed = false; }
PB.prototype.m = function (x, y) { this.v.push([x, y]); this.i.push([0, 0]); this.o.push([0, 0]); return this; };
PB.prototype.l = PB.prototype.m;
PB.prototype.c = function (c1x, c1y, c2x, c2y, x, y) {
  var n = this.v.length - 1, p = this.v[n];
  this.o[n] = [c1x - p[0], c1y - p[1]];
  this.v.push([x, y]); this.i.push([c2x - x, c2y - y]); this.o.push([0, 0]);
  return this;
};
PB.prototype.q = function (cx, cy, x, y) {
  var p = this.v[this.v.length - 1];
  return this.c(p[0] + 2 / 3 * (cx - p[0]), p[1] + 2 / 3 * (cy - p[1]), x + 2 / 3 * (cx - x), y + 2 / 3 * (cy - y), x, y);
};
PB.prototype.z = function () {
  this.closed = true;
  var n = this.v.length - 1;
  if (n > 0) {
    var a = this.v[0], b = this.v[n];
    if (Math.abs(a[0] - b[0]) < 0.01 && Math.abs(a[1] - b[1]) < 0.01) { this.i[0] = this.i[n]; this.v.pop(); this.i.pop(); this.o.pop(); }
  }
  return this;
};
PB.prototype.shape = function () { var s = new Shape(); s.vertices = this.v; s.inTangents = this.i; s.outTangents = this.o; s.closed = this.closed; return s; };
function polyPB(pts) { var p = new PB(), k; for (k = 0; k < pts.length; k += 2) p.m(pts[k], pts[k + 1]); return p.z(); }
function linePB(pts) { var p = new PB(), k; for (k = 0; k < pts.length; k += 2) p.m(pts[k], pts[k + 1]); return p; }
function rectPB(x, y, w, h) { return polyPB([x, y, x + w, y, x + w, y + h, x, y + h]); }
function ellPB(cx, cy, rx, ry) {
  var k = 0.5523, p = new PB();
  p.v = [[cx, cy - ry], [cx + rx, cy], [cx, cy + ry], [cx - rx, cy]];
  p.i = [[-rx * k, 0], [0, -ry * k], [rx * k, 0], [0, ry * k]];
  p.o = [[rx * k, 0], [0, ry * k], [-rx * k, 0], [0, -ry * k]];
  p.closed = true; return p;
}

// ───────────────────────── shape-layer tree ─────────────────────────
// A "node" is {L: layer, p: [indices]} — properties are re-resolved on every access so no stale references.
function SL(comp, name) {
  var l = comp.layers.addShape(); l.name = name;
  l.property('ADBE Transform Group').property('ADBE Position').setValue([0, 0]);
  return { L: l, p: [] };
}
function vecs(n) { var p = n.L.property('ADBE Root Vectors Group'), k; for (k = 0; k < n.p.length; k++) p = p.property(n.p[k]).property('ADBE Vectors Group'); return p; }
function gprop(n) { var p = n.L.property('ADBE Root Vectors Group'), k; for (k = 0; k < n.p.length; k++) { p = p.property(n.p[k]); if (k < n.p.length - 1) p = p.property('ADBE Vectors Group'); } return p; }
function GT(n) { return gprop(n).property('ADBE Vector Transform Group'); }
// new group, placed in FRONT of its earlier siblings (painter's order)
function G(n, name, x) {
  var g = vecs(n).addProperty('ADBE Vector Group');
  g.name = name || 'Group';
  g.moveTo(1);
  var c = { L: n.L, p: n.p.concat([1]) };
  if (x) gx(c, x);
  return c;
}
function gx(n, o) {
  var tr = GT(n);
  if (o.a) tr.property('ADBE Vector Anchor').setValue(o.a);
  if (o.p) tr.property('ADBE Vector Position').setValue(o.p);
  if (o.s) tr.property('ADBE Vector Scale').setValue(o.s);
  if (o.r) tr.property('ADBE Vector Rotation').setValue(o.r);
  if (o.o !== undefined) tr.property('ADBE Vector Group Opacity').setValue(o.o);
  if (o.pe) tr.property('ADBE Vector Position').expression = o.pe;
  if (o.re) tr.property('ADBE Vector Rotation').expression = o.re;
  if (o.se) tr.property('ADBE Vector Scale').expression = o.se;
  if (o.oe) tr.property('ADBE Vector Group Opacity').expression = o.oe;
}
function aPath(n, pb) { var s = vecs(n).addProperty('ADBE Vector Shape - Group'); s.property('ADBE Vector Shape').setValue(pb.shape()); }
function aRect(n, x, y, w, h, r) {
  var s = vecs(n).addProperty('ADBE Vector Shape - Rect');
  s.property('ADBE Vector Rect Size').setValue([w, h]);
  s.property('ADBE Vector Rect Position').setValue([x + w / 2, y + h / 2]);
  if (r) s.property('ADBE Vector Rect Roundness').setValue(Math.min(r, w / 2, h / 2));
}
function aEll(n, cx, cy, w, h) {
  var s = vecs(n).addProperty('ADBE Vector Shape - Ellipse');
  s.property('ADBE Vector Ellipse Size').setValue([w, h]);
  s.property('ADBE Vector Ellipse Position').setValue([cx, cy]);
}
function aFill(n, col, op) {
  var f = vecs(n).addProperty('ADBE Vector Graphic - Fill');
  f.property('ADBE Vector Fill Color').setValue(c4(col));
  if (op !== undefined && op < 100) f.property('ADBE Vector Fill Opacity').setValue(Math.max(0, op));
}
function aStroke(n, col, w, op) {
  var s = vecs(n).addProperty('ADBE Vector Graphic - Stroke');
  s.property('ADBE Vector Stroke Color').setValue(c4(col));
  s.property('ADBE Vector Stroke Width').setValue(w);
  s.property('ADBE Vector Stroke Line Cap').setValue(2);
  s.property('ADBE Vector Stroke Line Join').setValue(2);
  if (op !== undefined && op < 100) s.property('ADBE Vector Stroke Opacity').setValue(Math.max(0, op));
}
// filled group: fn(g) adds shapes, then a fill is appended
function F(n, name, col, fn, op, x) { var g = G(n, name, x); fn(g); aFill(g, col, op); return g; }
function S(n, name, col, w, fn, op, x) { var g = G(n, name, x); fn(g); aStroke(g, col, w, op); return g; }
function fillPath(n, name, col, pb, op) { return F(n, name, col, function (g) { aPath(g, pb); }, op); }
function strokeLine(n, name, col, w, pts, op) { return S(n, name, col, w, function (g) { aPath(g, linePB(pts)); }, op); }

// ───────────────────────── layers, effects, keys ─────────────────────────
function LT(l) { return l.property('ADBE Transform Group'); }
function lpos(l) { return LT(l).property('ADBE Position'); }
function lsc(l) { return LT(l).property('ADBE Scale'); }
function lrot(l) { return LT(l).property('ADBE Rotate Z'); }
function lop(l) { return LT(l).property('ADBE Opacity'); }
function lanc(l) { return LT(l).property('ADBE Anchor Point'); }
function nocam(l) { l.comment = 'nocam'; return l; }

function addFx(l, match, name) {
  l.property('ADBE Effect Parade').addProperty(match);
  var par = l.property('ADBE Effect Parade');
  var e = par.property(par.numProperties);
  if (name) e.name = name;
  return l.property('ADBE Effect Parade').property(l.property('ADBE Effect Parade').numProperties);
}
function setp(e, keys, v) {
  var k;
  for (k = 0; k < keys.length; k++) { try { var p = e.property(keys[k]); if (p) { p.setValue(v); return p; } } catch (err) { } }
  return null;
}
function blur(l, amt) { var e = addFx(l, 'ADBE Gaussian Blur 2'); setp(e, ['ADBE Gaussian Blur 2-0001', 'Blurriness'], amt); try { setp(e, ['ADBE Gaussian Blur 2-0003', 'Repeat Edge Pixels'], 0); } catch (x) { } return e; }
function rim(l, col, dir, dist, name) {
  var e = addFx(l, 'ADBE Drop Shadow', name || 'Rim Light');
  setp(e, ['ADBE Drop Shadow-0001', 'Shadow Color'], c4(col));
  setp(e, ['ADBE Drop Shadow-0002', 'Opacity'], 230);
  setp(e, ['ADBE Drop Shadow-0003', 'Direction'], dir);
  setp(e, ['ADBE Drop Shadow-0004', 'Distance'], dist);
  setp(e, ['ADBE Drop Shadow-0005', 'Softness'], 2);
  return e;
}
function keys(prop, arr, ease) {
  var k;
  for (k = 0; k < arr.length; k++) prop.setValueAtTime(arr[k][0], arr[k][1]);
  if (ease) easeKeys(prop, ease === true ? 60 : ease);
}
function easeKeys(prop, inf) {
  var k, d;
  for (k = 1; k <= prop.numKeys; k++) {
    var dims = 1;
    try { if (!prop.isSpatial && (prop.value instanceof Array)) dims = prop.value.length; } catch (e0) { }
    var arr = [];
    for (d = 0; d < dims; d++) arr.push(new KeyframeEase(0, inf));
    try { prop.setTemporalEaseAtKey(k, arr, arr); }
    catch (e1) { try { prop.setTemporalEaseAtKey(k, [new KeyframeEase(0, inf)], [new KeyframeEase(0, inf)]); } catch (e2) { } }
  }
}
function holdKeys(prop) { var k; for (k = 1; k <= prop.numKeys; k++) { try { prop.setInterpolationTypeAtKey(k, KeyframeInterpolationType.HOLD); } catch (e) { } } }
function sample(prop, t0, t1, step, fn) { var t; for (t = t0; t <= t1 + 1e-6; t += step) prop.setValueAtTime(t, fn(t)); }

function PX(F, cname) {
  return 'var cam = ' + (cname ? 'comp("' + cname + '")' : 'thisComp') + '.layer("CAMERA").effect("Pan")(1);\nvalue + [-cam * ' + F + ', 0];';
}
function par(l, F, cname) { if (F) lpos(l).expression = PX(F, cname); return l; }

function solid(comp, name, col, w, h, x, y) {
  var l = comp.layers.addSolid(hex(col), name, Math.max(4, Math.round(w)), Math.max(4, Math.round(h)), 1, comp.duration);
  lpos(l).setValue([x, y]);
  return l;
}
function rampFx(l, p0, col0, p1, col1, radial) {
  var e = addFx(l, 'ADBE Ramp');
  setp(e, ['ADBE Ramp-0001', 'Start of Ramp'], p0);
  setp(e, ['ADBE Ramp-0002', 'Start Color'], c4(col0));
  setp(e, ['ADBE Ramp-0003', 'End of Ramp'], p1);
  setp(e, ['ADBE Ramp-0004', 'End Color'], c4(col1));
  if (radial) setp(e, ['ADBE Ramp-0005', 'Ramp Shape'], 2);
  return e;
}
// vertical gradient solid covering x0..x0+w, y0..y1
function vgradSolid(comp, name, x0, w, y0, y1, colA, colB) {
  var h = Math.max(4, Math.ceil(y1 - y0) + 2);
  var l = solid(comp, name, colA, w, h, x0 + w / 2, y0 - 1 + h / 2);
  rampFx(l, [w / 2, 0], colA, [w / 2, h], colB);
  return l;
}
function addMask(l, pb, feather, inverted, name) {
  var m = l.property('ADBE Mask Parade').addProperty('ADBE Mask Atom');
  m.property('ADBE Mask Shape').setValue(pb.shape());
  if (feather) m.property('ADBE Mask Feather').setValue([feather, feather]);
  if (inverted) m.inverted = true;
  if (name) m.name = name;
  return m;
}
function glowL(comp, name, x, y, r, col, a, mode) {
  r = Math.max(8, Math.round(r));
  var l = solid(comp, name, col, 2 * r, 2 * r, x, y);
  addMask(l, ellPB(r, r, r * 0.6, r * 0.6), r * 0.9);
  lop(l).setValue(clamp(a, 0, 1) * 100);
  l.blendingMode = mode || BlendingMode.SCREEN;
  return l;
}
function compItem(name, dur, folder, w, h) {
  var c = app.project.items.addComp(name, w || W, h || H, 1, dur, FPS);
  c.bgColor = [0, 0, 0];
  if (folder) c.parentFolder = folder;
  return c;
}
// flipped, faded copy of a layer as a floor reflection
function reflectLayer(l, y0, k, op) {
  var d = l.duplicate();
  d.name = l.name + ' (reflection)';
  d.moveAfter(l);
  lanc(d).setValue([0, y0]);
  lpos(d).setValue([0, y0]);
  if (lpos(l).expression) lpos(d).expression = lpos(l).expression;
  lsc(d).setValue([100, -k * 100]);
  lop(d).setValue(op);
  try { var fxp = d.property('ADBE Effect Parade'); while (fxp.numProperties > 0) fxp.property(1).remove(); } catch (e) { }
  return d;
}
function camera(comp, cx, cy) {
  var n = comp.layers.addNull();
  n.name = 'CAMERA';
  n.label = 9;
  lpos(n).setValue([cx, cy]);
  var e = addFx(n, 'ADBE Slider Control', 'Pan');
  return n;
}
function panKeys(cam, arr, ease) { keys(cam.property('ADBE Effect Parade').property(1).property(1), arr, ease); }
function parentAll(comp, cam) {
  var i;
  for (i = 1; i <= comp.numLayers; i++) {
    var l = comp.layer(i);
    if (l === cam || l.name === 'CAMERA' || l.comment === 'nocam' || l.parent) continue;
    l.parent = cam;
  }
}

// ───────────────────────── text ─────────────────────────
function textLayer(comp, name, str, font, size, col, trackingPx, just, pos) {
  var l = comp.layers.addText(str);
  l.name = name;
  var p = l.property('ADBE Text Properties').property('ADBE Text Document');
  var d = p.value;
  try { d.resetCharStyle(); } catch (e0) { }
  d.font = font; d.fontSize = size;
  d.applyFill = true; d.fillColor = hex(col); d.applyStroke = false;
  d.tracking = Math.round(trackingPx / size * 1000);
  d.justification = just === 'center' ? ParagraphJustification.CENTER_JUSTIFY : just === 'right' ? ParagraphJustification.RIGHT_JUSTIFY : ParagraphJustification.LEFT_JUSTIFY;
  p.setValue(d);
  lpos(l).setValue(pos);
  return l;
}
var STY = {
  title: { font: FONT.regular, size: 76, ls: 9 },
  big: { font: FONT.light, size: 190, ls: 14 },
  sub: { font: FONT.medium, size: 34, ls: 12 },
  mid: { font: FONT.light, size: 56, ls: 8 }
};
function estWidth(str, st) { return str.length * st.size * 0.7 + (str.length - 1) * st.ls; }
// captions: per-character fade-up (text animator), soft scrim, fade-out
function titles(comp, groups) {
  var gi, li;
  for (gi = 0; gi < groups.length; gi++) {
    var g = groups[gi], align = g.align || 'center', y = g.y, hh = 0, ww = 0;
    for (li = 0; li < g.lines.length; li++) { var st0 = STY[g.lines[li].s || 'title']; ww = Math.max(ww, estWidth(g.lines[li].t, st0)); hh += st0.size * 1.24 + (g.lines[li].gap || 0); }
    var gxp = align === 'center' ? (g.x === undefined ? W / 2 : g.x) : g.x + ww / 2;
    var t1 = g.t1 === undefined ? comp.duration : g.t1;
    // scrim
    var sc = SL(comp, 'Caption scrim ' + (gi + 1));
    F(sc, 'Scrim', '#2d1814', function (n) { aEll(n, gxp, y + hh / 2, (ww * 0.75 + 120) * 1.7, (hh * 0.9 + 70) * 1.7); }, 100);
    blur(sc.L, 110);
    keys(lop(sc.L), [[g.t0, 0], [g.t0 + 0.8, 32], [t1, 32], [t1 + 0.5, 0]], true);
    sc.L.inPoint = g.t0; sc.L.outPoint = Math.min(comp.duration, t1 + 0.6);
    nocam(sc.L);
    for (li = 0; li < g.lines.length; li++) {
      var ln = g.lines[li], st = STY[ln.s || 'title'];
      y += st.size * (li === 0 ? 0.5 : 0.62) + (ln.gap || 0);
      var base = y + st.size * 0.36;
      var tx = align === 'center' ? gxp : g.x;
      var tl = textLayer(comp, 'TXT  ' + ln.t, ln.t, st.font, st.size, '#fffbf2', st.ls, align, [tx, base]);
      nocam(tl);
      var sh = addFx(tl, 'ADBE Drop Shadow', 'Text Shadow');
      setp(sh, ['ADBE Drop Shadow-0001'], c4('#28140f')); setp(sh, ['ADBE Drop Shadow-0002'], 150);
      setp(sh, ['ADBE Drop Shadow-0004'], 0); setp(sh, ['ADBE Drop Shadow-0005'], 24);
      // animator: opacity 0 + rise 26px, ramp-up range selector swept by Offset
      var start = g.t0 + (ln.d || 0) + li * 0.12, n = ln.t.length, total = (n - 1) * 0.022 + 0.7;
      var win = clamp(0.7 / total * 100, 12, 60);
      try {
        tl.property('ADBE Text Properties').property('ADBE Text Animators').addProperty('ADBE Text Animator');
        var an = function () { return tl.property('ADBE Text Properties').property('ADBE Text Animators').property(1); };
        an().name = 'Reveal';
        an().property('ADBE Text Animator Properties').addProperty('ADBE Text Opacity');
        an().property('ADBE Text Animator Properties').property('ADBE Text Opacity').setValue(0);
        an().property('ADBE Text Animator Properties').addProperty('ADBE Text Position 3D');
        try { an().property('ADBE Text Animator Properties').property('ADBE Text Position 3D').setValue([0, 26, 0]); }
        catch (e3) { an().property('ADBE Text Animator Properties').property('ADBE Text Position 3D').setValue([0, 26]); }
        an().property('ADBE Text Selectors').addProperty('ADBE Text Selector');
        var sel = function () { return an().property('ADBE Text Selectors').property(1); };
        sel().property('ADBE Text Percent Start').setValue(0);
        sel().property('ADBE Text Percent End').setValue(win);
        try { sel().property('ADBE Text Range Advanced').property('ADBE Text Range Shape').setValue(2); } catch (e4) { }
        keys(sel().property('ADBE Text Percent Offset'), [[start, -win], [start + total, 100]], 40);
      } catch (e5) {
        keys(lop(tl), [[start, 0], [start + 0.7, 100]], true);
      }
      keys(lop(tl), [[t1, 100], [t1 + 0.5, 0]], true);
      keys(lpos(tl), [[t1, [tx, base]], [t1 + 0.5, [tx, base - 14]]], true);
      tl.inPoint = Math.max(0, g.t0); tl.outPoint = Math.min(comp.duration, t1 + 0.6);
      y += st.size * 0.62;
    }
  }
}

// ───────────────────────── atmosphere ─────────────────────────
function makeCloud(r, w) {
  var n = 3 + Math.floor(r() * 3), rh = 12 + r() * 12, rows = [], i;
  for (i = 0; i < n; i++) {
    var ww = i === 0 ? w * (0.25 + r() * 0.3) : w * (0.55 + r() * 0.45);
    var x = (r() - 0.5) * w * 0.3 - ww / 2;
    var nub = r() * 0.25 * w, nubL = r() < 0.5;
    rows.push({ x: x, w: ww, y: i * rh, h: rh + 1, nub: nub, nubL: nubL });
  }
  return { rows: rows, h: n * rh, w: w };
}
function cloudField(seed, n, y0, y1, w0, w1) {
  var r = rng(seed), arr = [], i;
  for (i = 0; i < n; i++) {
    var cl = makeCloud(r, lerp(w0, w1, r()));
    var x = r() * 2600 - 300, y = lerp(y0, y1, r()), sp = 6 + r() * 14, s = 0.7 + r() * 0.6;
    arr.push({ cl: cl, x: x, y: y, sp: sp, s: s });
  }
  arr.sort(function (a, b) { return a.y - b.y; });
  return arr;
}
var CLOUDS_A = cloudField(3, 22, CEIL + 10, CEIL + 380, 160, 520);
var CLOUDS_OPEN = cloudField(9, 26, 40, 560, 200, 700);

// pixel-stepped clouds; each cloud a group drifting by expression (and parallax when camF given)
function cloudsLayer(comp, name, field, tOff, pal, alpha, yOff, camRef) {
  var n = SL(comp, name), i, j;
  for (i = 0; i < field.length; i++) {
    var f = field[i], x0 = ((f.x + tOff * f.sp) % 2800 + 2800) % 2800 - 400;
    var pe = camRef ? 'var cam = ' + camRef + '.effect("Pan")(1);\nvalue + [time * ' + f.sp.toFixed(3) + ' - cam * ' + (0.35 * 0.5 * f.s).toFixed(4) + ', 0];'
      : 'value + [time * ' + f.sp.toFixed(3) + ', 0];';
    var cg = G(n, 'Cloud ' + (i + 1), { p: [x0, f.y + (yOff || 0)], s: [f.s * 100, f.s * 100], pe: pe });
    var rows = f.cl.rows, nr = rows.length;
    for (j = nr - 1; j >= 0; j--) {
      var rw = rows[j], k = nr > 1 ? j / (nr - 1) : 0;
      F(cg, 'Row ' + (j + 1), mix(pal.cl, pal.cs, in2(k) * 0.9), function (g) {
        aRect(g, rw.x, rw.y, rw.w, rw.h);
        aRect(g, rw.nubL ? rw.x - rw.nub : rw.x + rw.w, rw.y + rw.h * 0.45, rw.nub, rw.h * 0.55);
      }, alpha * (0.92 - k * 0.15) * 100);
    }
  }
  return n.L;
}
function raysLayer(comp, name, o) {
  o = o || {};
  var ang = o.ang === undefined ? -0.62 : o.ang, a = o.a === undefined ? 0.12 : o.a, col = o.col || '#fff3d6';
  var bands = o.bands || [[-500, 160, 1], [-200, 60, 0.7], [150, 260, 0.8], [520, 90, 0.6], [820, 180, 0.7]];
  var n = SL(comp, name), i;
  var rg = G(n, 'Rays', { p: [o.cx === undefined ? 1100 : o.cx, o.cy === undefined ? 300 : o.cy], r: ang * R2D });
  var drift = o.drift === undefined ? 18 : o.drift;
  for (i = bands.length - 1; i >= 0; i--) {
    var b = bands[i];
    F(rg, 'Ray ' + (i + 1), col, function (g) { aRect(g, b[0], -2200, b[1], 4400); }, a * b[2] * 100 * 0.62,
      { pe: 'value + [time * ' + drift + ' + Math.sin(time * 0.7 + ' + b[0] + ') * 10, 0];' });
  }
  blur(n.L, 46);
  n.L.blendingMode = BlendingMode.SCREEN;
  return n.L;
}
function bokehLayer(comp, name, seed, count, o) {
  o = o || {};
  var r = rng(seed), n = SL(comp, name), i, col = o.col || '#fff0d0';
  for (i = 0; i < count; i++) {
    var bx = r() * W, by = (o.y0 === undefined ? 0 : o.y0) + r() * (o.yr === undefined ? H : o.yr);
    var rad = (o.r0 === undefined ? 20 : o.r0) + r() * (o.rr === undefined ? 70 : o.rr);
    var a = (o.a === undefined ? 0.12 : o.a) * (0.4 + r() * 0.6), ph = r() * 6.28, sp = 0.2 + r() * 0.4;
    var g = G(n, 'Bokeh ' + (i + 1), {
      p: [bx, by],
      pe: 'value + [Math.sin(time * ' + sp.toFixed(3) + ' + ' + ph.toFixed(3) + ') * 25 + ' + (o.dx || 0) + ' * time, Math.cos(time * ' + (sp * 0.8).toFixed(3) + ' + ' + ph.toFixed(3) + ') * 15];',
      oe: '70 + 30 * Math.sin(time * 1.3 + ' + ph.toFixed(3) + ');'
    });
    var gg = G(g, 'Disc'); aEll(gg, 0, 0, rad * 1.8, rad * 1.8); aFill(gg, col, a * 45); aStroke(gg, col, rad * 0.14, a * 70);
  }
  blur(n.L, 4);
  n.L.blendingMode = BlendingMode.SCREEN;
  return n.L;
}

// ───────────────────────── landscape ─────────────────────────
function mountainsInto(n, baseY, list, colL, colR, snow) {
  var i;
  for (i = 0; i < list.length; i++) {
    var m = list[i], x = m[0], y = m[1], w = m[2], mid = x + w * 0.06;
    var g = G(n, 'Mountain ' + (i + 1));
    fillPath(g, 'Lit face', colL, polyPB([x - w / 2, baseY, x, y, mid, baseY]));
    fillPath(g, 'Shadow face', colR, polyPB([x, y, x + w / 2, baseY, mid, baseY]));
    fillPath(g, 'Facet', shade(colR, -0.08), polyPB([x + w * 0.1, y + (baseY - y) * 0.35, x + w * 0.32, baseY, x + w * 0.16, baseY]));
    if (snow) {
      var sh = (baseY - y) * 0.22;
      fillPath(g, 'Snow', snow, polyPB([x, y, x - w * 0.11, y + sh, x - w * 0.05, y + sh * 0.8, x + w * 0.02, y + sh * 1.1, x + w * 0.1, y + sh * 0.85]));
    }
  }
}
function skylineInto(n, x0, x1, baseY, col, seed, density) {
  var r = rng(seed);
  F(n, 'Skyline', col, function (g) {
    var x = x0;
    while (x < x1) {
      var w = 18 + r() * 50, h = 10 + r() * 60 * density;
      aRect(g, x, baseY - h, w, h + 2);
      if (r() < 0.12) aRect(g, x + w * 0.4, baseY - h - 30, 4, 30);
      x += w + r() * 10;
    }
  });
}
function pineInto(n, name, x, y, h, col, pe) {
  var g = G(n, name, pe ? { pe: pe } : null), w = h * 0.36, i;
  F(g, 'Pine', col, function (gg) {
    for (i = 0; i < 4; i++) {
      var ty = y - h + i * h * 0.2, by = ty + h * 0.38, ww = w * (0.45 + i * 0.2);
      aPath(gg, polyPB([x, ty, x + ww / 2, by, x - ww / 2, by]));
    }
    aRect(gg, x - h * 0.02, y - h * 0.2, h * 0.04, h * 0.2);
  });
}
function towerInto(n, x, base, h, body, glass, night) {
  var g = G(n, 'Control tower');
  fillPath(g, 'Shaft', body, polyPB([x - h * 0.05, base, x - h * 0.03, base - h * 0.78, x + h * 0.03, base - h * 0.78, x + h * 0.05, base]));
  F(g, 'Deck', shade(body, -0.1), function (gg) { aRect(gg, x - h * 0.11, base - h * 0.8, h * 0.22, h * 0.04); });
  fillPath(g, 'Cab glass', glass, polyPB([x - h * 0.12, base - h * 0.8, x - h * 0.1, base - h * 0.93, x + h * 0.1, base - h * 0.93, x + h * 0.12, base - h * 0.8]));
  F(g, 'Roof + mast', shade(body, 0.1), function (gg) { aRect(gg, x - h * 0.09, base - h * 0.98, h * 0.18, h * 0.05); aRect(gg, x - 1.5, base - h * 1.1, 3, h * 0.12); });
  if (night > 0) F(g, 'Beacon', '#ff3c3c', function (gg) { aEll(gg, x, base - h * 1.1, 10, 10); }, night * 100,
    { oe: 'Math.sin(time * 5) > 0.3 ? 100 : 25;' });
}

// ───────────────────────── aircraft ─────────────────────────
// side view; nose to +x (dir 1). Built in 1000-unit space and scaled.
function planeSideInto(n, name, x, y, L, o) {
  o = o || {};
  var night = o.night || 0, dir = o.dir === undefined ? 1 : o.dir;
  var body = mix(o.body || '#eef0f0', '#2e3555', night * 0.85), belly = shade(body, -0.16);
  var tail = mix(o.tail || '#2f6fa6', '#1a2244', night * 0.7), dark = mix('#2c3442', '#0a0e1c', night);
  var g = G(n, name, { p: [x, y], s: [dir * L / 10, L / 10], r: (o.rot || 0) * R2D * dir, pe: o.pe, re: o.re });
  fillPath(g, 'Far wing', shade(body, -0.28), polyPB([60, -6, -10, -6, -150, -60, -120, -62]));
  fillPath(g, 'Fuselage', body, new PB().m(500, 6).c(500, -22, 468, -36, 420, -37).l(-300, -37).l(-485, -48).l(-500, -36).l(-490, -14).l(-250, 37).l(420, 37).c(470, 37, 498, 28, 500, 6).z());
  fillPath(g, 'Belly', belly, new PB().m(498, 14).c(490, 32, 465, 37, 420, 37).l(-250, 37).l(-420, 0).l(-200, 10).l(420, 12).z());
  fillPath(g, 'Tail fin', tail, polyPB([-320, -37, -445, -215, -508, -215, -485, -48]));
  fillPath(g, 'Fin highlight', shade(tail, 0.15), polyPB([-330, -37, -380, -110, -395, -110, -340, -37]));
  fillPath(g, 'Stabiliser', shade(body, -0.1), polyPB([-395, -18, -500, -40, -525, -32, -430, -4]));
  F(g, 'Windows', o.lit ? mix('#ffd88a', dark, 1 - o.lit) : dark, function (gg) { var wx; for (wx = 320; wx > -280; wx -= 26) aRect(gg, wx, -16, 12, 9); });
  fillPath(g, 'Cockpit', dark, polyPB([470, -14, 445, -24, 418, -24, 418, -12]));
  F(g, 'Cheatline', tail, function (gg) { aRect(gg, -300, 4, 720, 5); }, 85);
  fillPath(g, 'Near wing', shade(body, -0.06), polyPB([90, 18, -20, 18, -190, 110, -150, 114]));
  F(g, 'Engine', shade(body, 0.05), function (gg) { aRect(gg, 30, 30, 125, 46, 20); });
  F(g, 'Engine intake', dark, function (gg) { aRect(gg, 140, 33, 16, 40, 6); });
  if (o.gear) F(g, 'Landing gear', dark, function (gg) { aRect(gg, -60, 37, 8, 46); aEll(gg, -56, 88, 26, 26); aRect(gg, 392, 37, 6, 40); aEll(gg, 395, 82, 20, 20); }, 100, o.gearX);
  if (night > 0.3) {
    F(g, 'Beacon (tail)', '#ff463c', function (gg) { aEll(gg, -470, -210, 40, 40); }, 100, { oe: 'Math.sin(time * 6) > 0.6 ? 100 : 15;' });
    F(g, 'Strobe', '#ffffff', function (gg) { aEll(gg, 100, -40, 30, 30); }, 100, { oe: 'Math.sin(time * 6) > 0.6 ? 10 : 80;' });
  }
  return g;
}
// front view, flying at camera; span = 1000 units (scale the layer)
function planeFrontInto(n, name, o) {
  o = o || {};
  var s = 1000, body = hex(o.body || '#e9ebea'), dark = hex('#30343e');
  var g = G(n, name);
  fillPath(g, 'Tailplane', shade(body, -0.18), polyPB([-0.19 * s, -0.035 * s, 0, -0.05 * s, 0.19 * s, -0.035 * s, 0.19 * s, -0.025 * s, 0, -0.035 * s, -0.19 * s, -0.025 * s]));
  fillPath(g, 'Fin', shade(body, -0.1), polyPB([-0.012 * s, -0.04 * s, -0.004 * s, -0.2 * s, 0.004 * s, -0.2 * s, 0.012 * s, -0.04 * s]));
  fillPath(g, 'Wings', shade(body, -0.05), polyPB([-0.5 * s, -0.045 * s, -0.48 * s, -0.035 * s, -0.05 * s, 0.03 * s, 0.05 * s, 0.03 * s, 0.48 * s, -0.035 * s, 0.5 * s, -0.045 * s, 0.05 * s, 0, -0.05 * s, 0]));
  fillPath(g, 'Wing undersides', shade(body, -0.25), polyPB([-0.48 * s, -0.035 * s, -0.05 * s, 0.03 * s, 0.05 * s, 0.03 * s, 0.48 * s, -0.035 * s, 0.05 * s, 0.04 * s, -0.05 * s, 0.04 * s]));
  var ex, k;
  for (k = 0; k < 2; k++) {
    ex = k ? 0.18 : -0.18;
    var eg = G(g, 'Engine ' + (k ? 'R' : 'L'));
    F(eg, 'Nacelle', shade(body, -0.08), function (gg) { aEll(gg, ex * s, 0.045 * s, 0.084 * s, 0.084 * s); });
    F(eg, 'Intake', dark, function (gg) { aEll(gg, ex * s, 0.045 * s, 0.06 * s, 0.06 * s); });
    F(eg, 'Spinner', shade(dark, 0.2), function (gg) { aEll(gg, ex * s, 0.045 * s, 0.02 * s, 0.02 * s); });
  }
  F(g, 'Landing gear', dark, function (gg) { var i, gx2; for (i = 0; i < 3; i++) { gx2 = (i - 1) * 0.06; aRect(gg, gx2 * s - 0.004 * s, 0.04 * s, 0.008 * s, 0.06 * s); aRect(gg, gx2 * s - 0.01 * s, 0.095 * s, 0.02 * s, 0.018 * s); } });
  F(g, 'Fuselage', shade(body, 0.05), function (gg) { aEll(gg, 0, 0, 0.116 * s, 0.116 * s); });
  F(g, 'Fuselage shading', shade(body, -0.25), function (gg) { aPath(gg, new PB().m(0.058 * s, 0).c(0.058 * s, 0.032 * s, 0.032 * s, 0.058 * s, 0, 0.058 * s).c(-0.032 * s, 0.058 * s, -0.058 * s, 0.032 * s, -0.058 * s, 0).c(-0.03 * s, 0.03 * s, 0.03 * s, 0.03 * s, 0.058 * s, 0).z()); }, 70);
  F(g, 'Cockpit', dark, function (gg) { aEll(gg, 0, -0.058 * s * 0.35, 0.07 * s, 0.023 * s); });
  return g;
}

// ───────────────────────── people ─────────────────────────
function figurePose(h, o) {
  var P = { hipY: -0.5 * h, lean: o.lean || 0, legs: [[0.03, 0.03], [-0.03, -0.03]], arms: [[0.08, 0.12], [-0.06, -0.02]] };
  if (o.pose === 'sit') { P.hipY = -0.27 * h; P.legs = [[1.5, 0.05], [1.45, 0]]; P.lean = o.lean === undefined ? -0.08 : o.lean; P.arms = [[0.35, 1.3], [0.3, 1.2]]; }
  if (o.pose === 'walk') { P.legs = [[0, 0], [0, 0]]; P.arms = [[0, 0.3], [0, 0.3]]; if (o.bag) P.arms[1] = [-0.5, -0.5]; }
  if (o.arms) P.arms = o.arms;
  return P;
}
var DEG = 57.2958;
// side-view rigged figure. Origin = feet. Walk cycles are expressions on the joints.
function figureInto(n, name, x, y, h, o) {
  o = o || {};
  var P = figurePose(h, o), walk = o.pose === 'walk';
  var SP = (o.speed || 7).toFixed(3), PH = (o.phase || 0).toFixed(3);
  var phx = 'var ph = time * ' + SP + ' + ' + PH + ';\n';
  var col = hex(o.col || '#1e2230'), top = hex(o.top || o.col || '#1e2230'), head = hex(o.head || o.col || '#1e2230'), far = shade(col, -0.25);
  var lw = 0.075 * h, sw = 0.17 * h, hipY = P.hipY, shY = -0.31 * h;
  var rootPE = o.pe || (walk ? phx + 'value + [0, -(1 - Math.abs(Math.sin(ph))) * ' + (0.012 * h).toFixed(2) + '];' : null);
  var g = G(n, name, { p: [x, y], s: [o.flip ? -100 : 100, 100], pe: rootPE });
  var i;
  // legs: far then near
  for (i = 1; i >= 0; i--) {
    var c = i ? far : col, a1 = P.legs[i][0], a2 = P.legs[i][1];
    var thighE = walk ? phx + (i ? '' : '-') + '0.4 * Math.sin(ph) * ' + DEG + ';' : null;
    var shinE = walk ? phx + '0.6 * Math.max(0, ' + (i ? '-' : '') + 'Math.cos(ph)) * ' + DEG + ';' : null;
    var lg = G(g, i ? 'Leg (far)' : 'Leg (near)', { a: [0, hipY], p: [0, hipY], r: -a1 * R2D, re: thighE });
    strokeLine(lg, 'Thigh', c, lw, [0, hipY, 0, hipY + 0.25 * h]);
    var sg = G(lg, 'Shin', { a: [0, hipY + 0.25 * h], p: [0, hipY + 0.25 * h], r: -(a2 - a1) * R2D, re: shinE });
    strokeLine(sg, 'Shin', c, lw * 0.8, [0, hipY + 0.25 * h, 0, hipY + 0.49 * h]);
    F(sg, 'Foot', c, function (gg) { aRect(gg, -0.025 * h, hipY + 0.47 * h, 0.085 * h, 0.035 * h, 0.012 * h); });
  }
  var tg = G(g, 'Body', { a: [0, hipY], p: [0, hipY], r: P.lean * R2D, re: o.leanE });
  var S0 = [0, hipY + shY + 0.03 * h];
  var arm = function (k, colr) {
    var u = P.arms[k][0], f = P.arms[k][1];
    var upE = null, foE = null;
    if (walk && !(k === 1 && o.bag)) { upE = phx + (k ? '-' : '') + '0.32 * Math.sin(ph) * ' + DEG + ';'; }
    var ag = G(tg, k ? 'Arm (far)' : 'Arm (near)', { a: S0, p: S0, r: -u * R2D, re: upE });
    strokeLine(ag, 'Upper arm', colr, 0.05 * h, [S0[0], S0[1], S0[0], S0[1] + 0.17 * h]);
    var E0 = [S0[0], S0[1] + 0.17 * h];
    var fg = G(ag, 'Forearm', { a: E0, p: E0, r: -(f - u) * R2D, re: foE });
    strokeLine(fg, 'Forearm', colr, 0.05 * h, [E0[0], E0[1], E0[0], E0[1] + 0.16 * h]);
    if (o.cup && k === 0) F(fg, 'Cup', '#efe6d8', function (gg) { aRect(gg, E0[0] - 0.022 * h, E0[1] + 0.14 * h, 0.045 * h, 0.06 * h); });
  };
  arm(1, far);
  if (o.bag) {
    var u = P.arms[1][0], f = P.arms[1][1];
    var hx = S0[0] + Math.sin(u) * 0.17 * h + Math.sin(f) * 0.16 * h, hy = S0[1] + Math.cos(u) * 0.17 * h + Math.cos(f) * 0.16 * h;
    var bx = hx - 0.17 * h;
    var bg = G(tg, 'Suitcase');
    strokeLine(bg, 'Handle', '#2a2a33', 0.012 * h, [hx, hy, bx + 0.06 * h, hy + 0.2 * h]);
    var cg = G(bg, 'Case', { p: [bx, hy + 0.17 * h], r: -0.25 * R2D });
    F(cg, 'Case', o.bagCol || '#3a3f4a', function (gg) { aRect(gg, -0.02 * h, 0, 0.16 * h, 0.26 * h, 0.02 * h); });
  }
  if (o.pack) F(tg, 'Backpack', o.packCol || shade(top, 0.15), function (gg) { aRect(gg, -0.15 * h, hipY + shY + 0.03 * h, 0.09 * h, 0.21 * h, 0.03 * h); });
  fillPath(tg, 'Torso', top, new PB().m(-sw / 2, hipY + shY + 0.03 * h).q(-sw / 2, hipY + shY, -sw / 2 + 0.04 * h, hipY + shY)
    .l(sw / 2 - 0.04 * h, hipY + shY).q(sw / 2, hipY + shY, sw / 2, hipY + shY + 0.03 * h).l(0.075 * h, hipY + 0.03 * h).l(-0.075 * h, hipY + 0.03 * h).z());
  if (o.dress) fillPath(tg, 'Dress', top, polyPB([-0.08 * h, hipY - 0.05 * h, 0.08 * h, hipY - 0.05 * h, 0.15 * h, hipY + 0.27 * h, -0.15 * h, hipY + 0.27 * h]));
  var hy0 = hipY + shY - 0.105 * h;
  F(tg, 'Head', head, function (gg) {
    aRect(gg, -0.024 * h, hipY + shY - 0.05 * h, 0.048 * h, 0.06 * h);
    aEll(gg, 0, hy0, 0.136 * h, 0.136 * h);
    aPath(gg, polyPB([0.06 * h, hy0 - 0.01 * h, 0.082 * h, hy0 + 0.012 * h, 0.062 * h, hy0 + 0.02 * h]));
    if (o.hair === 'long') aPath(gg, new PB().m(-0.068 * h, hy0).q(-0.08 * h, hy0 + 0.13 * h, -0.01 * h, hy0 + 0.15 * h).l(0.02 * h, hy0).z());
    if (o.hair === 'bun') aEll(gg, -0.05 * h, hy0 - 0.065 * h, 0.07 * h, 0.07 * h);
  });
  arm(0, top);
  return g;
}
// back-view figure (standing / walking away)
function backFigureInto(n, name, x, y, h, o) {
  o = o || {};
  var col = hex(o.col || '#1e2230'), top = hex(o.top || '#2a3242'), head = hex(o.head || o.col || '#1e2230'), far = shade(col, -0.25);
  var walk = o.pose === 'walk', SP = (o.speed || 7.5).toFixed(3);
  var sw = 0.13 * h, ww = 0.085 * h, hw = 0.095 * h, shY = -0.81 * h, waY = -0.58 * h, hiY = -0.47 * h, i, sg;
  var g = G(n, name, { p: [x, y], pe: o.pe });
  for (i = 0; i < 2; i++) {
    sg = i ? 1 : -1;
    var lift = walk ? 'value + [0, -Math.max(0, ' + (i ? '-' : '') + 'Math.sin(time * ' + SP + ')) * ' + (0.05 * h).toFixed(2) + '];' : null;
    var lg = G(g, i ? 'Leg R' : 'Leg L', { pe: lift });
    F(lg, 'Leg', i ? col : far, function (gg) {
      aPath(gg, polyPB([sg * 0.004 * h, hiY, sg * (hw + 0.002 * h), hiY, sg * 0.068 * h, -0.05 * h, sg * 0.02 * h, -0.05 * h]));
      aRect(gg, sg > 0 ? 0.016 * h : -0.072 * h, -0.06 * h, 0.056 * h, 0.06 * h, 0.015 * h);
    });
  }
  if (o.dress) fillPath(g, 'Dress', top, polyPB([-ww, waY, ww, waY, 0.14 * h, -0.25 * h, -0.14 * h, -0.25 * h]));
  for (i = 0; i < 2; i++) {
    sg = i ? 1 : -1;
    var swing = walk ? 'value + [0, Math.sin(time * ' + SP + (i ? '' : ' + Math.PI') + ') * ' + (0.01 * h).toFixed(2) + '];' : null;
    var ag = G(g, i ? 'Arm R' : 'Arm L', { pe: swing });
    fillPath(ag, 'Sleeve', top, polyPB([sg * (sw - 0.03 * h), shY + 0.02 * h, sg * (sw + 0.012 * h), shY + 0.04 * h, sg * (sw + 0.01 * h), -0.47 * h, sg * (sw - 0.035 * h), -0.47 * h]));
    F(ag, 'Hand', head, function (gg) { aEll(gg, sg * (sw - 0.012 * h), -0.455 * h, 0.052 * h, 0.052 * h); });
  }
  fillPath(g, 'Torso', top, new PB().m(-sw, shY + 0.05 * h).q(-sw, shY, -sw + 0.05 * h, shY - 0.004 * h).l(sw - 0.05 * h, shY - 0.004 * h).q(sw, shY, sw, shY + 0.05 * h)
    .q(ww + 0.01 * h, waY - 0.05 * h, ww, waY).l(hw, hiY + 0.01 * h).l(-hw, hiY + 0.01 * h).l(-ww, waY).q(-ww - 0.01 * h, waY - 0.05 * h, -sw, shY + 0.05 * h).z());
  F(g, 'Belt', col, function (gg) { aRect(gg, -hw, hiY - 0.02 * h, hw * 2, 0.035 * h); });
  if (o.pack) {
    var pg = G(g, 'Backpack');
    F(pg, 'Bag', o.packCol || shade(top, 0.15), function (gg) { aRect(gg, -0.085 * h, shY + 0.03 * h, 0.17 * h, 0.22 * h, 0.035 * h); });
    F(pg, 'Pocket', shade(o.packCol || top, -0.15), function (gg) { aRect(gg, -0.06 * h, shY + 0.15 * h, 0.12 * h, 0.07 * h, 0.02 * h); });
  }
  F(g, 'Head', head, function (gg) {
    aRect(gg, -0.025 * h, shY - 0.05 * h, 0.05 * h, 0.06 * h);
    aEll(gg, 0, -0.9 * h, 0.116 * h, 0.132 * h);
    if (o.hair === 'long') aPath(gg, polyPB([-0.06 * h, -0.9 * h, 0.06 * h, -0.9 * h, 0.07 * h, -0.74 * h, -0.07 * h, -0.74 * h]));
    if (o.hair === 'bun') aEll(gg, 0, -0.97 * h, 0.06 * h, 0.06 * h);
  });
  return g;
}
// seated, seen from behind (head + shoulders above a seat back)
function sitBackInto(n, name, x, y, h, o) {
  var col = hex(o.col), top = hex(o.top), hipY = -0.27 * h, shY = hipY - 0.31 * h, sw = 0.27 * h;
  var g = G(n, name, { p: [x, y] });
  S(g, 'Arms', top, 0.05 * h, function (gg) {
    aPath(gg, linePB([-sw / 2 + 0.02 * h, shY + 0.03 * h, -sw / 2 - 0.01 * h, shY + 0.2 * h, -sw / 2 - 0.005 * h, shY + 0.35 * h]));
    aPath(gg, linePB([sw / 2 - 0.02 * h, shY + 0.03 * h, sw / 2 + 0.01 * h, shY + 0.2 * h, sw / 2 + 0.005 * h, shY + 0.35 * h]));
  });
  fillPath(g, 'Torso', top, new PB().m(-sw / 2, shY + 0.03 * h).q(-sw / 2, shY, -sw / 2 + 0.04 * h, shY).l(sw / 2 - 0.04 * h, shY).q(sw / 2, shY, sw / 2, shY + 0.03 * h).l(0.1 * h, hipY + 0.03 * h).l(-0.1 * h, hipY + 0.03 * h).z());
  F(g, 'Head', col, function (gg) { aRect(gg, -0.024 * h, shY - 0.05 * h, 0.048 * h, 0.06 * h); aEll(gg, 0, shY - 0.105 * h, 0.136 * h, 0.136 * h); if (o.hair === 'bun') aEll(gg, 0, shY - 0.17 * h, 0.07 * h, 0.07 * h); });
  return g;
}
// lying on the floor, knees up, head on a bag
function sleeperInto(n, name, x, y, s, o) {
  o = o || {};
  var col = hex(o.col || '#1f2433'), top = hex(o.top || '#4a3438'), pill = hex(o.pill || '#3f6a7a');
  var g = G(n, name);
  F(g, 'Bag pillow', pill, function (gg) { aRect(gg, x - 0.02 * s, y - 0.1 * s, 0.2 * s, 0.1 * s, 0.03 * s); });
  F(g, 'Bag strap', shade(pill, -0.2), function (gg) { aRect(gg, x + 0.02 * s, y - 0.06 * s, 0.12 * s, 0.015 * s); });
  strokeLine(g, 'Leg (far)', shade(col, -0.25), 0.07 * s, [x + 0.5 * s, y - 0.06 * s, x + 0.72 * s, y - 0.05 * s, x + 0.93 * s, y - 0.035 * s]);
  strokeLine(g, 'Leg (near, knee up)', col, 0.075 * s, [x + 0.5 * s, y - 0.07 * s, x + 0.67 * s, y - 0.22 * s, x + 0.82 * s, y - 0.035 * s]);
  F(g, 'Shoe', col, function (gg) { aRect(gg, x + 0.8 * s, y - 0.055 * s, 0.08 * s, 0.05 * s, 0.015 * s); });
  var bE = 'value + [0, Math.sin(time * 2.1 + ' + (o.ph || 0) + ') * 2.5];';
  var tg = G(g, 'Torso (breathing)', { a: [x + 0.35 * s, y], p: [x + 0.35 * s, y], se: '[100, 100 + Math.sin(time * 2.1 + ' + (o.ph || 0) + ') * 4];' });
  F(tg, 'Torso', top, function (gg) { aRect(gg, x + 0.15 * s, y - 0.14 * s, 0.4 * s, 0.13 * s, 0.055 * s); });
  if (o.jacket) fillPath(tg, 'Jacket', o.jacket, polyPB([x + 0.22 * s, y - 0.15 * s, x + 0.5 * s, y - 0.16 * s, x + 0.62 * s, y - 0.17 * s, x + 0.66 * s, y - 0.09 * s, x + 0.56 * s, y - 0.01 * s, x + 0.24 * s, y - 0.01 * s]));
  strokeLine(tg, 'Folded arm', shade(top, -0.22), 0.05 * s, [x + 0.22 * s, y - 0.09 * s, x + 0.38 * s, y - 0.07 * s, x + 0.3 * s, y - 0.135 * s]);
  F(g, 'Head', o.head || col, function (gg) {
    aEll(gg, x + 0.1 * s, y - 0.155 * s, 0.13 * s, 0.13 * s);
    if (o.hair === 'long') aPath(gg, polyPB([x + 0.04 * s, y - 0.16 * s, x + 0.08 * s, y - 0.1 * s, x - 0.04 * s, y - 0.09 * s]));
  }, 100, { pe: bE });
  return g;
}
// sitting on the floor, head on folded arms (front view)
function dozerInto(n, name, x, y, s, o) {
  o = o || {};
  var col = hex(o.col || '#20253a'), top = hex(o.top || '#304a5a');
  var g = G(n, name);
  F(g, 'Backpack', o.pack || '#6a4a3a', function (gg) { aRect(gg, x + 0.14 * s, y - 0.2 * s, 0.16 * s, 0.2 * s, 0.035 * s); });
  F(g, 'Torso', top, function (gg) { aRect(gg, x - 0.12 * s, y - 0.46 * s, 0.24 * s, 0.42 * s, 0.07 * s); });
  F(g, 'Legs', col, function (gg) {
    var k, sg;
    for (k = 0; k < 2; k++) { sg = k ? 1 : -1; aRect(gg, x + sg * 0.065 * s - 0.04 * s, y - 0.34 * s, 0.08 * s, 0.33 * s, 0.035 * s); aEll(gg, x + sg * 0.07 * s, y - 0.01 * s, 0.11 * s, 0.044 * s); }
  });
  F(g, 'Folded arms', shade(top, 0.08), function (gg) { aRect(gg, x - 0.15 * s, y - 0.37 * s, 0.3 * s, 0.075 * s, 0.035 * s); });
  F(g, 'Head (nodding)', o.head || col, function (gg) { aEll(gg, x, y - 0.42 * s, 0.14 * s, 0.14 * s); }, 100, { pe: 'value + [0, Math.sin(time * 1.6) * ' + (0.006 * s).toFixed(2) + '];' });
  return g;
}
// close-up profile (faces +x). x,y = shoulder centre, s = head radius
function profileInto(n, name, x, y, s, o) {
  var col = o.col || '#241e29';
  var g = G(n, name);
  var hx = x + 0.15 * s, hy = y - 1.75 * s;
  F(g, 'Body', col, function (gg) {
    aPath(gg, new PB().m(x - 2.2 * s, y + 0.3 * s).q(x - 1.6 * s, y - 0.5 * s, x - 0.2 * s, y - 0.55 * s).q(x + 1.3 * s, y - 0.5 * s, x + 1.7 * s, y + 0.8 * s).l(x + 1.9 * s, y + 8 * s).l(x - 2.6 * s, y + 8 * s).z());
    aRect(gg, x - 0.35 * s, y - 1.3 * s, 0.75 * s, 1.0 * s);
    aEll(gg, hx, hy, 1.9 * s, 2.1 * s);
    aPath(gg, polyPB([hx + 0.85 * s, hy - 0.25 * s, hx + 1.18 * s, hy + 0.2 * s, hx + 0.88 * s, hy + 0.32 * s]));
    if (o.hair === 'bun') aEll(gg, hx - 0.75 * s, hy - 0.75 * s, 0.9 * s, 0.9 * s);
    if (o.hair === 'short') {
      var p = new PB(), k, th;
      for (k = 0; k <= 24; k++) {
        th = Math.PI + k / 24 * 1.1 * Math.PI;
        var ex = Math.cos(th) * 1.0 * s, ey = Math.sin(th) * 0.75 * s, cr = Math.cos(-0.2), sr = Math.sin(-0.2);
        p.m(hx - 0.1 * s + ex * cr - ey * sr, hy - 0.45 * s + ex * sr + ey * cr);
      }
      aPath(gg, p.z());
    }
  });
  var cg = G(g, 'Chin', { p: [hx + 0.6 * s, hy + 0.75 * s], r: 0.4 * R2D });
  F(cg, 'Chin', col, function (gg) { aEll(gg, 0, 0, 0.8 * s, 0.64 * s); });
  return g;
}
function ik(sx, sy, tx, ty, a, b, bend) {
  var dx = tx - sx, dy = ty - sy, d = Math.min(Math.sqrt(dx * dx + dy * dy), a + b - 0.01);
  var ang = Math.atan2(dy, dx), cosA = clamp((a * a + d * d - b * b) / (2 * a * d), -1, 1), A = Math.acos(cosA) * bend;
  return [sx + Math.cos(ang + A) * a, sy + Math.sin(ang + A) * a];
}
// an IK arm whose hand follows handFn(t); path keyframes sampled over [t0,t1]
function ikArmInto(n, name, col, s, sx, sy, handFn, t0, t1, bend) {
  var g = G(n, name);
  var armShape = function (t) { var hnd = handFn(t), e = ik(sx, sy, hnd[0], hnd[1], 1.9 * s, 1.75 * s, bend || 1); return linePB([sx, sy, e[0], e[1], hnd[0], hnd[1]]).shape(); };
  var sg = G(g, 'Arm');
  var sp = vecs(sg).addProperty('ADBE Vector Shape - Group');
  sp = vecs(sg).property(1);
  if (t1 > t0) sample(sp.property('ADBE Vector Shape'), t0, t1, 1 / 15, armShape); else sp.property('ADBE Vector Shape').setValue(armShape(t0));
  aStroke(sg, col, 0.62 * s);
  var hg = G(g, 'Hand');
  aEll(hg, 0, 0, 0.72 * s, 0.72 * s);
  aFill(hg, col);
  var hp = GT(hg).property('ADBE Vector Position');
  if (t1 > t0) sample(hp, t0, t1, 1 / 15, handFn); else hp.setValue(handFn(t0));
  return g;
}
// animated stroked path (vertices from fn(t)) sampled as path keyframes
function animPathInto(n, name, col, w, fn, t0, t1, op, step) {
  var g = G(n, name);
  vecs(g).addProperty('ADBE Vector Shape - Group');
  var pp = vecs(g).property(1).property('ADBE Vector Shape');
  sample(pp, t0, t1, step || 1 / 15, function (t) { return linePB(fn(t)).shape(); });
  aStroke(g, col, w, op);
  return g;
}
function seatRowInto(n, name, x, y, cnt, s, col) {
  var sw = 0.19 * s, gap = 0.025 * s, bh = 0.19 * s, top = y - 0.42 * s, len = cnt * (sw + gap) - gap, i;
  var g = G(n, name);
  F(g, 'Frame', shade(col, -0.45), function (gg) {
    aRect(gg, x, y - 0.22 * s, len, 0.025 * s);
    var k, lx;
    for (k = 0; k < 2; k++) { lx = k ? x + len - 0.07 * s : x + 0.05 * s; aRect(gg, lx, y - 0.22 * s, 0.022 * s, 0.22 * s); aRect(gg, lx - 0.04 * s, y - 0.012 * s, 0.1 * s, 0.012 * s); }
  });
  F(g, 'Seat backs', col, function (gg) { for (i = 0; i < cnt; i++) aRect(gg, x + i * (sw + gap), top, sw, bh + 0.06 * s, 0.035 * s); });
  F(g, 'Highlights', shade(col, 0.18), function (gg) { for (i = 0; i < cnt; i++) aRect(gg, x + i * (sw + gap) + 0.01 * s, top + 0.006 * s, sw - 0.02 * s, 0.03 * s, 0.015 * s); });
  F(g, 'Seat edges', shade(col, -0.25), function (gg) { for (i = 0; i < cnt; i++) aRect(gg, x + i * (sw + gap), top + bh + 0.04 * s, sw, 0.03 * s); });
  return g;
}
var depthH = function (y) { return 230 + (y - 790) * 1.15; };

// ───────────────────────── project scaffolding ─────────────────────────
app.beginUndoGroup('Build Airports project');
if (!app.project) app.newProject();
var root = app.project.items.addFolder('AIRPORTS');
var fScenes = app.project.items.addFolder('Scenes'); fScenes.parentFolder = root;
var fPre = app.project.items.addFolder('Precomps'); fPre.parentFolder = root;

// departures board precomp (600 x 340 design + frame)
var FLIGHTS = [['LH 402', 'FRANKFURT', '03:15', 'DELAYED', 1], ['SQ 317', 'SINGAPORE', '03:40', 'BOARDING', 0], ['EK 006', 'DUBAI', '04:05', 'DELAYED', 1],
  ['QF 002', 'SYDNEY', '04:30', 'ON TIME', 2], ['JL 044', 'TOKYO', '05:10', 'DELAYED', 1], ['AF 279', 'PARIS', '05:45', 'ON TIME', 2]];
function boardComp(name, clock) {
  var c = compItem(name, DUR, fPre, 640, 380), bw = 600, bh = 340, ox = 20, oy = 20, i;
  var b = SL(c, 'Board panel');
  F(b, 'Frame', '#141b2a', function (g) { aRect(g, ox - 10, oy - 10, bw + 20, bh + 20, 14); });
  F(b, 'Screen', '#0d1a33', function (g) { aRect(g, ox, oy, bw, bh, 8); });
  F(b, 'Screen glow', '#4678dc', function (g) { aEll(g, ox + bw / 2, oy + bh / 2, bw * 1.1, bh * 1.1); }, 10);
  F(b, 'Divider', '#ffffff', function (g) { aRect(g, ox + 20, oy + 56, bw - 40, 2); }, 12);
  F(b, 'Row stripes', '#ffffff', function (g) { var rh = (bh - 76) / 6; for (i = 1; i < 6; i += 2) aRect(g, ox + 12, oy + 76 + rh * i, bw - 24, rh); }, 3);
  textLayer(c, 'Title', 'DEPARTURES', FONT.medium, 22, '#e9eef5', 4, 'left', [ox + 24, oy + 38]);
  if (clock) {
    var ck = textLayer(c, 'Clock', clock, FONT.medium, 30, '#ffc861', 2, 'right', [ox + bw - 24, oy + 41]);
    ck.property('ADBE Text Properties').property('ADBE Text Document').expression = 'Math.floor(time * 2) % 2 ? "' + clock.replace(':', ' ') + '" : "' + clock + '";';
  }
  var rh2 = (bh - 76) / 6;
  for (i = 0; i < 6; i++) {
    var ry = oy + 76 + rh2 * (i + 0.5) + 6, r = FLIGHTS[i];
    textLayer(c, 'Row ' + (i + 1) + ' flight', r[0], FONT.medium, 17, '#cfd8e6', 2, 'left', [ox + 24, ry]);
    textLayer(c, 'Row ' + (i + 1) + ' city', r[1], FONT.medium, 17, '#cfd8e6', 2, 'left', [ox + 140, ry]);
    textLayer(c, 'Row ' + (i + 1) + ' time', r[2], FONT.medium, 17, '#ffc861', 2, 'left', [ox + 330, ry]);
    var st = textLayer(c, 'Row ' + (i + 1) + ' status', r[3], FONT.medium, 17, r[4] === 1 ? '#ff6e5a' : r[4] === 0 ? '#78e6a0' : '#9fb3cc', 2, 'left', [ox + 430, ry]);
    if (r[4] === 0) lop(st).expression = 'Math.sin(time * 6) > 0 ? 100 : 35;';
  }
  return c;
}
var BOARD = boardComp('Departures Board', null);
var BOARD3 = boardComp('Departures Board 03-00', '03:00');
// place a board precomp: x,y,w = on-screen top-left of the screen area and its width
function placeBoard(comp, bc, x, y, w, F2) {
  var k = w / 600;
  var cab = SL(comp, 'Board cables');
  S(cab, 'Cables', '#2a2c33', 4, function (g) { aPath(g, linePB([x + w * 0.2, -50, x + w * 0.2, y])); aPath(g, linePB([x + w * 0.8, -50, x + w * 0.8, y])); });
  par(cab.L, F2);
  var l = comp.layers.add(bc);
  l.name = 'Departures board';
  lanc(l).setValue([20, 20]);
  lpos(l).setValue([x, y]);
  lsc(l).setValue([k * 100, k * 100]);
  par(l, F2);
  return l;
}

// ───────────────────────── window exterior (precomp) ─────────────────────────
function exteriorComp(sname, dur, pal, o) {
  o = o || {};
  var c = compItem(sname + ' Exterior', dur, fPre);
  var camRef = 'comp("' + sname + '").layer("CAMERA")';
  var P = function (l, f) { if (f) lpos(l).expression = 'var cam = ' + camRef + '.effect("Pan")(1);\nvalue + [-cam * ' + (0.35 * f).toFixed(4) + ', 0];'; return l; };
  var top = CEIL, hor = FLOOR - 120, bot = FLOOR, i;
  var night = o.timelapse ? 0 : pal.night;
  // sky
  var skyStops = [0, 0.45, 0.78, 1], skyL = [];
  for (i = 0; i < 3; i++) {
    var y0 = top - 40 + (hor - top + 40) * skyStops[i], y1 = top - 40 + (hor - top + 40) * skyStops[i + 1];
    skyL.push(vgradSolid(c, 'Sky band ' + (i + 1), -400, W + 800, y0, y1, pal.sky[i], pal.sky[i + 1]));
  }
  // stars, moon
  var stars = null, moon = null, moonGlow = null;
  if (pal.night > 0.4 || o.timelapse) {
    var r = rng(33), sn = SL(c, 'Stars'), grpN = 7, gi;
    var groups = [];
    for (gi = 0; gi < grpN; gi++) groups.push([]);
    for (i = 0; i < 140; i++) {
      var sx = r() * 2400 - 200, sy = top + r() * (hor - top) * 0.75; r(); var al = 0.25 + 0.6 * r(); var w2 = 2 + (r() < 0.1 ? 1 : 0), h2 = 2 + (r() < 0.1 ? 1 : 0);
      groups[i % grpN].push([sx, sy, w2, h2, al]);
    }
    for (gi = 0; gi < grpN; gi++) {
      var arr = groups[gi];
      F(sn, 'Stars ' + (gi + 1), '#fffaeb', function (g) { var k; for (k = 0; k < arr.length; k++) aRect(g, arr[k][0], arr[k][1], arr[k][2], arr[k][3]); }, 85,
        { oe: '50 + 50 * Math.sin(time * ' + (1 + gi * 0.45).toFixed(2) + ' + ' + gi + ');' });
    }
    P(sn.L, 0.15); stars = sn.L;
    var mx = o.moonX === undefined ? 1450 : o.moonX, my = o.moonY === undefined ? top + 120 : o.moonY;
    var mh = SL(c, 'Moon glow');
    F(mh, 'Glow', '#c8d2ff', function (g) { aEll(g, mx, my, 360, 360); }, 22);
    blur(mh.L, 90); P(mh.L, 0.2); moonGlow = mh.L;
    var mn = SL(c, 'Moon');
    F(mn, 'Moon', '#faf4de', function (g) { aEll(g, mx, my, 88, 88); });
    F(mn, 'Crescent shadow', pal.sky[0], function (g) { aEll(g, mx + 18, my - 10, 80, 80); });
    P(mn.L, 0.2); moon = mn.L;
    if (o.timelapse) { /* keyed later */ }
  }
  // sun
  var sunX = o.sunX === undefined ? 1250 : o.sunX, sunY = o.sunY === undefined ? hor - 150 : o.sunY;
  var sunGlow = null, sunDisc = null;
  if (pal.sun > 0.05 || o.timelapse) {
    sunGlow = P(glowL(c, 'Sun glow', sunX, sunY, 600, [1, 0.925, 0.784], 0.65 * pal.sun), 0.2);
    var sd = SL(c, 'Sun'); F(sd, 'Sun disc', [1, 0.965, 0.863], function (g) { aEll(g, sunX, sunY, 120, 120); }, 85 * pal.sun); P(sd.L, 0.2); sunDisc = sd.L;
  }
  var cl = cloudsLayer(c, 'Clouds', o.clouds || CLOUDS_A, 0, pal, 1 - pal.night * 0.4, top - CEIL, camRef);
  // horizon
  var mt = SL(c, 'Mountains');
  mountainsInto(mt, hor + 2, [[300, hor - 120, 700], [900, hor - 70, 600], [1700, hor - 140, 760], [-300, hor - 90, 700], [2400, hor - 100, 700]],
    mix(pal.far, pal.sky[3], 0.35), mix(pal.mid, pal.sky[3], 0.3), pal.night < 0.5 ? mix('#fff6ea', pal.sky[3], 0.3) : null);
  P(mt.L, 0.3);
  var skl = SL(c, 'City skyline'); skylineInto(skl, -600, 2800, hor + 2, mix(pal.mid, pal.sky[3], 0.15), 4, 0.7); P(skl.L, 0.45);
  var cityLights = null;
  if (pal.night > 0.2 || o.timelapse) {
    var rl = rng(11), cln = SL(c, 'City lights');
    F(cln, 'Lights', '#ffd68c', function (g) { var k; for (k = 0; k < 90; k++) { var lx = rl() * 3000 - 500, ly = hor - rl() * 40; rl(); aRect(g, lx, ly, 3, 3); } }, 80);
    lop(cln.L).setValue(pal.night * 100); P(cln.L, 0.45); cityLights = cln.L;
  }
  if (o.tower !== false) { var tw = SL(c, 'Control tower'); towerInto(tw, 1560, hor + 6, 170, mix('#e6ddd0', '#2a2f50', night), mix('#6fa8b8', '#ffcf7a', night * 0.8), night); P(tw.L, 0.55); }
  // tarmac
  var gH = bot - hor;
  vgradSolid(c, 'Grass verge', -400, W + 800, hor, hor + gH * 0.12, mix(pal.grass, pal.sky[3], 0.3), pal.grass);
  vgradSolid(c, 'Verge edge', -400, W + 800, hor + gH * 0.12, hor + gH * 0.16, pal.grass, pal.ground);
  vgradSolid(c, 'Tarmac', -400, W + 800, hor + gH * 0.16, bot + 2, pal.ground, shade(pal.ground, -0.12));
  var ds = SL(c, 'Taxiway markings');
  F(ds, 'Dashes', shade(pal.ground, 0.25), function (g) { var k; for (k = -6; k < 16; k++) aRect(g, k * 220, hor + 40, 110, 4); }, 60);
  P(ds.L, 0.9);
  var tint = null;
  if (o.timelapse) { tint = solid(c, 'Night tint', '#1a2048', W + 800, FH + 60, W / 2, (CEIL + FLOOR) / 2); tint.blendingMode = BlendingMode.MULTIPLY; lop(tint).setValue(0); }
  var rwl = null;
  if (pal.night > 0.1 || o.timelapse) {
    var rw = SL(c, 'Runway lights'), k2;
    for (k2 = 0; k2 < 46; k2++) {
      F(rw, 'Light ' + (k2 + 1), k2 % 2 ? [0.47, 0.67, 1] : [1, 0.78, 0.43], function (g) { aEll(g, k2 * 70 - 500, hor + 22, 9, 9); }, 100,
        { oe: '60 + 40 * Math.sin(time * 4 - ' + (k2 * 0.6).toFixed(2) + ');' });
    }
    lop(rw.L).setValue(Math.min(1, pal.night) * 100); P(rw.L, 0.75); rwl = rw.L;
  }
  if (o.extra) o.extra(c, P, hor, bot);
  // time-lapse keys (finale): sky colours, sun/moon arcs, night tint
  if (o.timelapse) {
    var d = dur, t, pAt = function (tt) { return clamp(tt / (d - 0.8)) * 4; };
    for (i = 0; i < 3; i++) {
      var efx = skyL[i].property('ADBE Effect Parade').property(1);
      var ii = i;
      sample(efx.property('ADBE Ramp-0002'), 0, d, 0.2, function (tt) { return c4(palAt(pAt(tt)).sky[ii]); });
      sample(efx.property('ADBE Ramp-0004'), 0, d, 0.2, function (tt) { return c4(palAt(pAt(tt)).sky[ii + 1]); });
    }
    var na = function (tt) { return ramp(0.4, 1, palAt(pAt(tt)).night); };
    sample(lop(stars), 0, d, 0.2, function (tt) { return na(tt) * 100; });
    sample(lop(moon), 0, d, 0.2, function (tt) { return na(tt) * 100; });
    sample(lop(moonGlow), 0, d, 0.2, function (tt) { return na(tt) * 100; });
    sample(LT(moonGlow).property('ADBE Position'), 0, d, 0.2, function (tt) { return [0, Math.abs(pAt(tt) - 2) * 200]; });
    sample(LT(moon).property('ADBE Position'), 0, d, 0.2, function (tt) { return [0, Math.abs(pAt(tt) - 2) * 200]; });
    sample(lop(sunGlow), 0, d, 0.2, function (tt) { return 65 * palAt(pAt(tt)).sun; });
    sample(lop(sunDisc), 0, d, 0.2, function (tt) { return 100 * palAt(pAt(tt)).sun; });
    var sunOff = function (tt) { var p = pAt(tt); return [-p * 400, Math.sin(p * Math.PI * 0.5) * 260 + 470 - sunY]; };
    sample(lpos(sunGlow), 0, d, 0.2, function (tt) { var so = sunOff(tt); return [sunX + so[0], sunY + so[1]]; });
    sample(LT(sunDisc).property('ADBE Position'), 0, d, 0.2, sunOff);
    sample(lop(tint), 0, d, 0.2, function (tt) { return palAt(pAt(tt)).night * 80; });
    sample(lop(rwl), 0, d, 0.2, function (tt) { return palAt(pAt(tt)).night * 100; });
    sample(lop(cityLights), 0, d, 0.2, function (tt) { return palAt(pAt(tt)).night * 100; });
    sample(lop(cl), 0, d, 0.2, function (tt) { return (1 - palAt(pAt(tt)).night * 0.55) * 100; });
  }
  return c;
}

// ───────────────────────── concourse interior ─────────────────────────
function concourse(comp, sname, o) {
  var dur = comp.duration, pal = o.pal, step = o.step || 300, i;
  solid(comp, 'Wall', o.wall || '#cdb69a', W + 400, H + 400, W / 2, H / 2);
  var ext = exteriorComp(sname, dur, pal, o.ext || {});
  var el = comp.layers.add(ext); el.name = 'Window view (precomp)';
  addMask(el, rectPB(0, CEIL, W, FH), 0, false, 'Window');
  var tint = SL(comp, 'Glass tint');
  F(tint, 'Tint', mix('#b9d3d8', pal.sky[0], 0.5), function (g) { aRect(g, -600, CEIL, W + 2400, FH); }, 7);
  // mullions
  var mcol = mix('#2c2f38', '#141625', pal.night * 0.5);
  var mu = SL(comp, 'Mullions');
  F(mu, 'Frames', mcol, function (g) {
    for (i = -3; i < (W + 1400) / step + 3; i++) aRect(g, i * step - 9, CEIL, 18, FH);
    aRect(g, -1000, CEIL + FH * 0.6, W + 3000, 8); aRect(g, -1000, FLOOR - 16, W + 3000, 16);
  });
  F(mu, 'Frame highlights', shade(mcol, 0.25), function (g) { for (i = -3; i < (W + 1400) / step + 3; i++) aRect(g, i * step - 9, CEIL, 4, FH); aRect(g, -1000, FLOOR - 16, W + 3000, 3); });
  par(mu.L, 1);
  // ceiling
  vgradSolid(comp, 'Ceiling', -400, W + 800, -300, CEIL, '#24262f', '#383a46');
  var sof = SL(comp, 'Ceiling soffit'); F(sof, 'Soffit', '#4a4c58', function (g) { aRect(g, -600, CEIL - 10, W + 1200, 10); });
  var lights = SL(comp, 'Ceiling lights'), glows = SL(comp, 'Ceiling light glow'), nL = 0;
  var lightCols = [];
  for (i = -3; i < (W + 1600) / step + 3; i++) {
    var lx = i * step, row;
    for (row = 0; row < 2; row++) {
      var ly = row ? CEIL - 34 : CEIL - 84, lw = row ? step * 0.7 : step * 0.55;
      var lg = F(lights, 'Strip ' + (i + 4) + (row ? 'b' : 'a'), '#fff6e0', function (g) { aRect(g, lx - lw / 2, ly, lw, row ? 7 : 5); });
      lightCols.push({ name: 'Strip ' + (i + 4) + (row ? 'b' : 'a'), i: i + 3 });
      F(glows, 'Glow ' + (i + 4) + (row ? 'b' : 'a'), '#fff0d2', function (g) { aEll(g, lx, ly + 4, lw * 1.2, 70); }, 20);
    }
  }
  blur(glows.L, 30); glows.L.blendingMode = BlendingMode.ADD;
  par(lights.L, 1.15); par(glows.L, 1.15);
  // floor
  vgradSolid(comp, 'Floor', -400, W + 800, FLOOR, H + 300, o.floorTop || '#c4ad94', o.floorBot || '#7e6a5b');
  var rl = comp.layers.add(ext); rl.name = 'Window reflection (precomp)';
  addMask(rl, rectPB(-400, CEIL + FH * 0.42, W + 800, FH * 0.58 + 300), 380, false, 'Fade');
  lanc(rl).setValue([W / 2, FLOOR]); lpos(rl).setValue([W / 2, FLOOR]); lsc(rl).setValue([100, -55]); lop(rl).setValue(33);
  var ff = solid(comp, 'Floor fade', o.floorBot || '#7e6a5b', W + 800, 900, W / 2, FLOOR + 450);
  addMask(ff, rectPB(-400, 260, W + 1600, 900), 520); lop(ff).setValue(80);
  var se = SL(comp, 'Floor seams');
  S(se, 'Seams', '#3c281e', 2, function (g) {
    for (i = 1; i < 7; i++) { var fy = FLOOR + Math.pow(i / 7, 1.7) * (H - FLOOR); aPath(g, linePB([-800, fy, W + 1600, fy])); }
    for (i = -14; i < 22; i++) { var fx = W / 2 + i * 160; aPath(g, linePB([W / 2 + (fx - W / 2) * 0.35, FLOOR, W / 2 + (fx - W / 2) * 2.2, H])); }
  }, 12);
  par(se.L, 1);
  if (o.mid) o.mid(comp);
  // interior darkness (for "lights off")
  var dark = null;
  if (o.darkness) {
    dark = solid(comp, 'Lights-off darkness (room)', '#0c1028', W + 800, H + 600, W / 2, H / 2);
    addMask(dark, rectPB(400, CEIL + 300, W, FH - 16), 0, true, 'Window cut-out');
    var dw = solid(comp, 'Lights-off darkness (glass)', '#0c1028', W, FH, W / 2, CEIL + FH / 2);
    keys(lop(dark), o.darkness[0]); keys(lop(dw), o.darkness[1]);
  }
  for (i = 0; i < (o.pillars || []).length; i++) {
    var p = o.pillars[i], pw = p.w || 150, pc = p.col || '#7d4740';
    var pl = SL(comp, 'Pillar ' + (i + 1));
    F(pl, 'Shadow L', shade(pc, -0.35), function (g) { aRect(g, p.x, -200, pw * 0.16, H + 400); });
    F(pl, 'Body', pc, function (g) { aRect(g, p.x + pw * 0.15, -200, pw * 0.4, H + 400); });
    F(pl, 'Highlight', shade(pc, 0.12), function (g) { aRect(g, p.x + pw * 0.54, -200, pw * 0.26, H + 400); });
    F(pl, 'Shadow R', shade(pc, -0.3), function (g) { aRect(g, p.x + pw * 0.79, -200, pw * 0.21, H + 400); });
    F(pl, 'Base', shade(pc, -0.4), function (g) { aRect(g, p.x - 6, H - 60, pw + 12, 120); });
    par(pl.L, p.par || 1.6);
  }
  if (o.lightKeys) o.lightKeys(lights.L, lightCols, glows.L);
  return { lights: lights.L, glows: glows.L, ext: ext };
}

// ═════════════════════════ SCENES ═════════════════════════
var SC = [['S01 Valley', 0.0, 4.4], ['S02 Gate', 4.4, 9.0], ['S03 Window', 9.0, 11.2], ['S04 Entrance', 11.2, 16.2], ['S05 Clocks', 16.2, 19.4],
  ['S06 3AM', 19.4, 24.0], ['S07 Sleepers', 24.0, 26.6], ['S08 Noodles', 26.6, 29.0], ['S09 Coffee', 29.0, 31.6], ['S10 Concourse', 31.6, 38.0]];
var COMPS = [];
function newScene(k) { var c = compItem(SC[k][0], SC[k][2] - SC[k][1], fScenes); COMPS.push(c); return c; }
function zoomKeys(cam, d, z0, z1, ease) { keys(lsc(cam), [[0, [z0, z0]], [d, [z1, z1]]], ease); }

// ── S01 — valley airport, jet climbs over the camera ──
(function () {
  var c = newScene(0), d = c.duration, pal = PAL.golden, hor = 740, i;
  var cam = camera(c, W / 2, 620);
  vgradSolid(c, 'Sky top', -200, W + 400, -200, -60 + (hor + 60) * 0.45, pal.sky[0], pal.sky[1]);
  vgradSolid(c, 'Sky middle', -200, W + 400, -60 + (hor + 60) * 0.45, -60 + (hor + 60) * 0.78, pal.sky[1], pal.sky[2]);
  vgradSolid(c, 'Sky horizon', -200, W + 400, -60 + (hor + 60) * 0.78, hor + 4, pal.sky[2], pal.sky[3]);
  glowL(c, 'Sun glow', 1260, 560, 900, [1, 0.925, 0.784], 0.7);
  var sun = SL(c, 'Sun'); F(sun, 'Sun disc', '#fff8e2', function (g) { aEll(g, 1260, 560, 140, 140); }, 90);
  cloudsLayer(c, 'Clouds', CLOUDS_OPEN, 20, pal, 0.95, 0, null);
  var m1 = SL(c, 'Mountains (far)'); mountainsInto(m1, hor + 4, [[180, 420, 900], [700, 520, 700], [1550, 360, 1000], [2050, 480, 700]], '#c49f92', '#8d7689', '#fbf1e2');
  var hz = SL(c, 'Haze'); F(hz, 'Haze', '#f6d7aa', function (g) { aRect(g, -200, 380, W + 400, hor - 376); }, 45);
  var m2 = SL(c, 'Hills (near)'); mountainsInto(m2, hor + 6, [[-80, 560, 800], [520, 610, 600], [1200, 590, 760], [1900, 540, 900]], '#9c8a5e', '#6f6a55', null);
  var sk = SL(c, 'Skyline'); skylineInto(sk, -200, W + 200, hor + 6, '#857a73', 2, 0.5);
  var tm = SL(c, 'Terminal');
  F(tm, 'Building', '#e8dccb', function (g) { aRect(g, 1000, hor - 46, 520, 52); });
  F(tm, 'Glass', '#6d8fa0', function (g) { aRect(g, 1010, hor - 34, 500, 18); });
  F(tm, 'Roof', '#c9b8a2', function (g) { aRect(g, 990, hor - 52, 540, 8); });
  var tw = SL(c, 'Control tower'); towerInto(tw, 1290, hor + 6, 220, '#ede3d5', '#6fa0b0', 0);
  vgradSolid(c, 'Fields', -200, W + 400, hor, hor + (H + 100 - hor) * 0.25, '#c7b36a', '#a59a55');
  vgradSolid(c, 'Fields (near)', -200, W + 400, hor + (H + 100 - hor) * 0.25, H + 300, '#a59a55', '#6d6a3f');
  var r = rng(5), st = SL(c, 'Field strips');
  for (i = 0; i < 40; i++) {
    var sy = hor + Math.pow(r(), 1.6) * 360, sw = 80 + r() * 300, light = r() < 0.5, sx = r() * W;
    F(st, 'Strip ' + (i + 1), light ? '#dcc86e' : '#5a6432', function (g) { aRect(g, sx, sy, sw, 6 + (sy - hor) * 0.05); }, light ? 35 : 25);
  }
  var rw = SL(c, 'Runway'), vx = 900;
  fillPath(rw, 'Runway', '#7d7469', polyPB([vx - 30, hor + 4, vx + 30, hor + 4, vx + 900, H + 100, vx - 900, H + 100]));
  F(rw, 'Centre line', '#fffaeb', function (g) {
    for (i = 0; i < 12; i++) {
      var a = Math.pow(i / 12, 2), b = Math.pow((i + 0.45) / 12, 2), y0 = hor + 4 + a * (H + 100 - hor), y1 = hor + 4 + b * (H + 100 - hor), w0 = 3 + a * 30, w1 = 3 + b * 30;
      aPath(g, polyPB([vx - w0 / 2, y0, vx + w0 / 2, y0, vx + w1 / 2, y1, vx - w1 / 2, y1]));
    }
  }, 85);
  parentAll(c, cam);
  zoomKeys(cam, d, 100, 108, 70);
  // jet (not affected by the push-in)
  var pl = SL(c, 'Jet (front view)'); planeFrontInto(pl, 'Jet', {});
  nocam(pl.L);
  var pk = function (t) { return clamp(t / d); };
  sample(lpos(pl.L), 0, d, 0.1, function (t) { var k = pk(t); return [lerp(880, 1180, in2(k)), lerp(700, -80, Math.pow(k, 2.4))]; });
  sample(lsc(pl.L), 0, d, 0.1, function (t) { var s = lerp(80, 2000, Math.pow(pk(t), 2.3)) / 10; return [s, s]; });
  sample(lrot(pl.L), 0, d, 0.1, function (t) { return lerp(0, -0.12, pk(t)) * R2D; });
  var gearOp = pl.L.property('ADBE Root Vectors Group').property(1).property('ADBE Vectors Group').property('Landing gear').property('ADBE Vector Transform Group').property('ADBE Vector Group Opacity');
  keys(gearOp, [[0, 100], [d * 0.5, 0]]); holdKeys(gearOp);
  var pn = SL(c, 'Pine trees (foreground)'), trees = [[60, 820], [210, 640], [-40, 560], [1830, 760], [1960, 600]];
  for (i = 0; i < trees.length; i++) pineInto(pn, 'Pine ' + (i + 1), trees[i][0], H + 40, trees[i][1], '#2a3b3a', 'value + [-time * ' + (26 * trees[i][1] / 700).toFixed(2) + ', 0];');
  nocam(pn.L);
  nocam(raysLayer(c, 'Light rays', { cx: 1260, cy: 560, a: 0.1, ang: -0.9 }));
  titles(c, [{ t0: 0.5, t1: d - 0.3, y: 250, lines: [{ t: "AIRPORTS DON'T FEEL" }, { t: 'LIKE REAL PLACES.' }] }]);
})();

// ── S02 — empty gate ──
(function () {
  var c = newScene(1), d = c.duration, sname = SC[1][0];
  var cam = camera(c, W / 2, H / 2);
  concourse(c, sname, {
    pal: PAL.golden,
    ext: { extra: function (ec, P, hor) {
      var p1 = SL(ec, 'Parked plane'); planeSideInto(p1, 'Plane', 520, hor + 40, 1100, { tail: '#2f6fa6' }); P(p1.L, 1.6);
      var jb = SL(ec, 'Jet bridge'); F(jb, 'Bridge base', '#9c8f80', function (g) { aRect(g, 1020, hor + 20, 380, 8); }); F(jb, 'Bridge', '#d9cfc1', function (g) { aRect(g, 1020, hor - 20, 380, 48); }); P(jb.L, 1.6);
      var p2 = SL(ec, 'Taxiing plane'); planeSideInto(p2, 'Plane', 1650, hor + 26, 520, { tail: '#c4473a', dir: -1, pe: 'value + [time * 40, 0];' }); P(p2.L, 1.2);
    } },
    mid: function (cc) {
      var by = 830;
      var r1 = SL(cc, 'Seat row (back)'); seatRowInto(r1, 'Seats', 260, by, 9, depthH(by), '#2f5d63'); par(r1.L, 1); reflectLayer(r1.L, by, 0.5, 18);
      var ps = SL(cc, 'Traveller (seated)'); sitBackInto(ps, 'Traveller', 1080, 905, depthH(905), { col: '#1f2533', top: '#3c3040', hair: 'bun' }); par(ps.L, 1);
      rim(ps.L, '#f2c48c', 0, 4);
      var r2 = SL(cc, 'Seat row (middle)'); seatRowInto(r2, 'Seats', 120, 905, 10, depthH(905), '#2a545a'); par(r2.L, 1.1); reflectLayer(r2.L, 905, 0.5, 18);
      placeBoard(cc, BOARD, 1560, 330, 360, 1.05);
      var r3 = SL(cc, 'Seat row (front)'); seatRowInto(r3, 'Seats', 1350, 1020, 6, depthH(1000), '#24484d'); par(r3.L, 1.3); reflectLayer(r3.L, 1020, 0.5, 12);
    },
    pillars: [{ x: 120, w: 170 }, { x: 1800, w: 200 }]
  });
  nocam(raysLayer(c, 'Light rays', { a: 0.11 }));
  nocam(bokehLayer(c, 'Bokeh', 21, 10, { a: 0.1, y0: 200, yr: 600 }));
  parentAll(c, cam);
  panKeys(cam, [[0, -80], [d, 260]], 70);
  titles(c, [{ t0: 0.35, t1: d - 0.35, y: 205, x: 820, lines: [{ t: 'THEY FEEL LIKE', s: 'sub' }, { t: 'WAITING ROOMS', gap: 6 }, { t: 'OUTSIDE OF REALITY.', s: 'sub', gap: 6 }] }]);
})();

// ── S03 — traveller at the window, take-off ──
(function () {
  var c = newScene(2), d = c.duration, sname = SC[2][0];
  var cam = camera(c, W * 0.65, H * 0.6);
  concourse(c, sname, {
    pal: PAL.golden, step: 520,
    ext: { sunX: 1600, extra: function (ec, P, hor) {
      var pl = SL(ec, 'Plane taking off');
      var g = planeSideInto(pl, 'Plane', -200, hor + 30, 560, { tail: '#2f6fa6', gear: true });
      var tr = function () { return pl.L.property('ADBE Root Vectors Group').property(1).property('ADBE Vector Transform Group'); };
      sample(tr().property('ADBE Vector Position'), 0, d, 0.1, function (t) { var k = clamp(t / d); return [lerp(-200, 1500, k), hor + 30 - Math.pow(clamp((k - 0.25) / 0.75), 1.6) * 330]; });
      sample(tr().property('ADBE Vector Rotation'), 0, d, 0.1, function (t) { var k = clamp(t / d); return -0.18 * clamp((k - 0.2) * 3) * R2D; });
      var gearOp = pl.L.property('ADBE Root Vectors Group').property(1).property('ADBE Vectors Group').property('Landing gear').property('ADBE Vector Transform Group').property('ADBE Vector Group Opacity');
      keys(gearOp, [[0, 100], [d * 0.5, 0]]); holdKeys(gearOp);
    } },
    mid: function (cc) {
      var fy = 1030, fh = 760;
      var man = SL(cc, 'Traveller at the window'); backFigureInto(man, 'Traveller', 1230, fy, fh, { col: '#1d2230', top: '#2a3242' });
      rim(man.L, '#f6c88f', 56, 6);
      reflectLayer(man.L, fy, 0.4, 25);
      var bc = SL(cc, 'Briefcase'); F(bc, 'Handle', '#2a1715', function (g) { aRect(g, 1320, fy - 165, 30, 18); }); F(bc, 'Case', '#5a2e2a', function (g) { aRect(g, 1300, fy - 150, 70, 110, 8); });
    },
    pillars: [{ x: 300, w: 220, par: 1.9 }]
  });
  parentAll(c, cam);
  panKeys(cam, [[0, 520], [d, 520 + 30 * d]]);
  zoomKeys(cam, d, 100, 106, 70);
  nocam(raysLayer(c, 'Light rays', { a: 0.14, cx: 1500, bands: [[-300, 220, 1], [100, 90, 0.8], [400, 300, 0.7]] }));
  nocam(bokehLayer(c, 'Bokeh', 31, 9, { a: 0.14, r0: 40, rr: 90 }));
  titles(c, [{ t0: 0.25, t1: d - 0.25, y: 420, x: 520, lines: [{ t: 'THINK ABOUT IT.', s: 'title' }] }]);
})();

// ── S04 — entrance; normal life dissolves ──
(function () {
  var c = newScene(3), d = c.duration, pal = PAL.golden, i;
  var cam = camera(c, W / 2, 640);
  vgradSolid(c, 'Sky top', -200, W + 400, -200, -40 + 600 * 0.45, pal.sky[0], pal.sky[1]);
  vgradSolid(c, 'Sky middle', -200, W + 400, -40 + 600 * 0.45, -40 + 600 * 0.78, pal.sky[1], pal.sky[2]);
  vgradSolid(c, 'Sky horizon', -200, W + 400, -40 + 600 * 0.78, 600, pal.sky[2], pal.sky[3]);
  glowL(c, 'Sky glow', 960, 300, 800, [1, 0.925, 0.784], 0.4);
  cloudsLayer(c, 'Clouds', CLOUDS_OPEN, 60, pal, 0.9, -40, null);
  var fy = 300, gy = 900, gx0 = 120, gx1 = 1800, gy0 = fy + 110;
  var fa = SL(c, 'Terminal facade');
  F(fa, 'Wall', '#e4d6c3', function (g) { aRect(g, -200, fy, W + 400, gy - fy); });
  F(fa, 'Cornice', '#cdbca6', function (g) { aRect(g, -200, fy, W + 400, 40); });
  F(fa, 'Cornice line', '#d7c6ae', function (g) { aRect(g, -200, fy + 40, W + 400, 10); });
  vgradSolid(c, 'Glass wall', gx0, gx1 - gx0, gy0, gy, '#9ebdc4', '#d8d0bc');
  var gl = SL(c, 'Glass reflections');
  F(gl, 'Glare', '#fff8e6', function (g) { aPath(g, polyPB([gx0 + 200, gy0, gx0 + 420, gy0, gx0 + 120, gy, gx0 - 100, gy])); aPath(g, polyPB([1300, gy0, 1380, gy0, 1080, gy, 1000, gy])); }, 35);
  F(gl, 'Mullions', '#5c5f68', function (g) { var x; for (x = gx0; x <= gx1; x += 140) aRect(g, x - 5, gy0, 10, gy - gy0); aRect(g, gx0, gy0 + 200, gx1 - gx0, 8); });
  var sign = textLayer(c, 'Sign  DEPARTURES', 'DEPARTURES', FONT.medium, 54, '#3a3f4b', 22, 'center', [970, fy + 97]);
  var dx0 = 780, dx1 = 1140, dy0 = 560, dw = (dx1 - dx0) / 2;
  var inner = SL(c, 'Doorway light'); F(inner, 'Light', '#fff4dc', function (g) { aRect(g, dx0, dy0, dx1 - dx0, gy - dy0); });
  var dg = glowL(c, 'Doorway glow', (dx0 + dx1) / 2, (dy0 + gy) / 2, 360, [1, 0.94, 0.8], 0.5);
  sample(lop(dg), 0, d, 0.2, function (t) { return (0.5 + ramp(0.6, 2.0, t) * 0.5) * 100; });
  var doors = SL(c, 'Sliding doors');
  F(doors, 'Header', '#4b4e57', function (g) { aRect(g, dx0 - 14, dy0 - 18, dx1 - dx0 + 28, 18); });
  var openF = function (t) { return io(ramp(1.1, 2.0, t)) * (1 - io(ramp(3.3, 4.0, t)) * 0.4); };
  for (i = 0; i < 2; i++) {
    var side = i ? 1 : -1, x0 = i ? dx0 + dw : dx0;
    var dgp = G(doors, i ? 'Door R' : 'Door L');
    F(dgp, 'Glass', '#a0bec8', function (g) { aRect(g, x0, dy0, dw, gy - dy0); }, 75);
    S(dgp, 'Frame', '#4b4e57', 8, function (g) { aRect(g, x0 + 4, dy0 + 4, dw - 8, gy - dy0 - 4); });
    var sd = side;
    sample(GT(dgp).property('ADBE Vector Position'), 0, d, 0.1, function (t) { return [sd * openF(t) * dw * 0.95, 0]; });
  }
  vgradSolid(c, 'Pavement', -200, W + 400, gy, H + 300, '#bdb3a4', '#8f8578');
  var kerb = SL(c, 'Kerb + paving lines');
  F(kerb, 'Kerb', '#d8cfc0', function (g) { aRect(g, -200, gy, W + 400, 10); });
  F(kerb, 'Paving', '#503c28', function (g) { for (i = 0; i < 6; i++) aRect(g, -200, gy + 30 + i * i * 6, W + 400, 3); }, 12);
  // normal life (precomp) — dissolves into blocks
  var nl = compItem('S04 Normal Life', d, fPre);
  (function () {
    var t1 = SL(nl, 'Tree (left)'); F(t1, 'Trunk', '#4a3a33', function (g) { aRect(g, 186, 600, 26, 300); });
    var cs = [[200, 520, 150, '#5f8a4c'], [140, 590, 100, '#4f7a40'], [270, 580, 110, '#6d9a55'], [200, 620, 120, '#557f45']], k;
    for (k = 0; k < cs.length; k++) { var cc = cs[k]; F(t1, 'Canopy ' + (k + 1), cc[3], function (g) { aEll(g, cc[0], cc[1], cc[2] * 2, cc[2] * 2); }); }
    var lp = SL(nl, 'Street lamp'); F(lp, 'Post', '#2f3138', function (g) { aRect(g, 420, 470, 14, 430); aRect(g, 420, 470, 70, 12); }); F(lp, 'Lamp', '#ffe2a8', function (g) { aRect(g, 470, 482, 30, 14); });
    var bn = SL(nl, 'Bench'); F(bn, 'Slats', '#7a5134', function (g) { aRect(g, 470, 820, 220, 18); aRect(g, 470, 780, 220, 14); }); F(bn, 'Legs', '#2f3138', function (g) { aRect(g, 485, 838, 10, 60); aRect(g, 665, 838, 10, 60); });
    var bs = SL(nl, 'Bus stop'); F(bs, 'Pole', '#2f3138', function (g) { aRect(g, 86, 730, 8, 170); }); F(bs, 'Sign', '#c64a3a', function (g) { aEll(g, 90, 700, 68, 68); });
    textLayer(nl, 'Bus stop text', 'BUS', FONT.medium, 30, '#ffffff', 0, 'center', [90, 711]);
    var tx = SL(nl, 'Taxi'), cx = 1330, cy = 900;
    F(tx, 'Body', '#e8b33a', function (g) { aRect(g, cx, cy - 150, 380, 100, 26); aPath(g, polyPB([cx + 70, cy - 150, cx + 120, cy - 220, cx + 270, cy - 220, cx + 320, cy - 150])); });
    F(tx, 'Windows', '#9fc4d0', function (g) { aPath(g, polyPB([cx + 92, cy - 152, cx + 128, cy - 206, cx + 190, cy - 206, cx + 190, cy - 152])); aPath(g, polyPB([cx + 200, cy - 152, cx + 200, cy - 206, cx + 262, cy - 206, cx + 298, cy - 152])); });
    F(tx, 'Tyres', '#2a2a2e', function (g) { aEll(g, cx + 85, cy - 45, 80, 80); aEll(g, cx + 300, cy - 45, 80, 80); });
    F(tx, 'Hubs', '#888888', function (g) { aEll(g, cx + 85, cy - 45, 32, 32); aEll(g, cx + 300, cy - 45, 32, 32); });
    F(tx, 'Roof sign', '#222222', function (g) { aRect(g, cx + 160, cy - 238, 70, 20); });
    F(tx, 'Headlight', '#fff1b8', function (g) { aRect(g, cx + 362, cy - 130, 16, 22); });
    var mb = SL(nl, 'Mailbox'); F(mb, 'Mailbox', '#3a6fa8', function (g) { aRect(g, 1780, 760, 80, 110, 30); aRect(g, 1810, 860, 20, 40); });
    var bk = SL(nl, 'Bicycle'); S(bk, 'Bicycle', '#2b2d33', 7, function (g) {
      aEll(g, 1135, 850, 96, 96); aEll(g, 1265, 850, 96, 96);
      aPath(g, linePB([1135, 850, 1185, 780, 1240, 780, 1265, 850])); aPath(g, linePB([1185, 780, 1200, 850, 1135, 850])); aPath(g, linePB([1240, 780, 1235, 760, 1255, 755]));
    });
    var t2 = SL(nl, 'Tree (right)'); F(t2, 'Trunk', '#4a3a33', function (g) { aRect(g, 1730, 560, 22, 340); });
    var cs2 = [[1740, 480, 130, '#6d9a55'], [1690, 540, 90, '#5f8a4c'], [1800, 540, 100, '#4f7a40']];
    for (k = 0; k < cs2.length; k++) { var c2 = cs2[k]; F(t2, 'Canopy ' + (k + 1), c2[3], function (g) { aEll(g, c2[0], c2[1], c2[2] * 2, c2[2] * 2); }); }
    var wr = SL(nl, 'Wire + birds');
    S(wr, 'Wire', '#2f3138', 3, function (g) { aPath(g, new PB().m(0, 360).q(300, 420, 700, 380)); });
    F(wr, 'Birds', '#2f3138', function (g) { aEll(g, 220, 382, 20, 20); aEll(g, 300, 388, 20, 20); aEll(g, 480, 386, 20, 20); });
  })();
  var nll = c.layers.add(nl); nll.name = 'Normal life (precomp)';
  var bd = addFx(nll, 'ADBE Block Dissolve', 'Pixel dissolve');
  var bdc = setp(bd, ['ADBE Block Dissolve-0001', 'Transition Completion'], 0);
  setp(bd, ['ADBE Block Dissolve-0002', 'Block Width'], 24); setp(bd, ['ADBE Block Dissolve-0003', 'Block Height'], 24); setp(bd, ['ADBE Block Dissolve-0004', 'Feather'], 0);
  try { keys(nll.property('ADBE Effect Parade').property(1).property(1), [[2.2, 0], [4.2, 100]], 30); } catch (e) { }
  var mo = addFx(nll, 'ADBE Mosaic', 'Pixelate');
  try { keys(nll.property('ADBE Effect Parade').property(2).property(1), [[2.2, 400], [3.6, 70]]); keys(nll.property('ADBE Effect Parade').property(2).property(2), [[2.2, 225], [3.6, 40]]); } catch (e2) { }
  lpos(nll).expression = '// drifts up while dissolving\nvalue + [0, -160 * ease(time, 2.2, 4.2, 0, 1)];';
  parentAll(c, cam);
  zoomKeys(cam, d, 100, 105, 70);
  // traveller walking into the light (not zoomed)
  var tv = SL(c, 'Traveller (walking in)');
  backFigureInto(tv, 'Traveller', 0, 0, 760, { pose: 'walk', speed: 7.5, col: '#1f2431', top: '#33293a', pack: true, packCol: '#5a3f3a' });
  F(tv, 'Suitcase', '#2d3240', function (g) { aRect(g, 0.16 * 760, -0.27 * 760, 0.17 * 760, 0.26 * 760, 0.02 * 760); });
  nocam(tv.L);
  var wk = function (t) { return clamp(t / 2.9); };
  sample(lpos(tv.L), 0, 3.2, 0.1, function (t) { return [lerp(900, 950, wk(t)), lerp(1260, 905, outc(wk(t)))]; });
  sample(lsc(tv.L), 0, 3.2, 0.1, function (t) { var s = lerp(760, 300, outc(wk(t))) / 7.6; return [s, s]; });
  keys(lop(tv.L), [[2.6, 100], [3.1, 0]]);
  tv.L.outPoint = 3.2;
  // white-out
  var wg = nocam(glowL(c, 'White-out glow', 960, 730, 1300, [1, 0.965, 0.894], 0.3));
  sample(lsc(wg), 3.9, d, 0.1, function (t) { var s = lerp(400, 2600, in2(ramp(3.9, d, t))) / 1300 * 100; return [s, s]; });
  lsc(wg).setValueAtTime(0, [400 / 13, 400 / 13]);
  sample(lop(wg), 3.9, d, 0.1, function (t) { return clamp(0.3 + in2(ramp(3.9, d, t))) * 100; });
  var wo = nocam(solid(c, 'White-out', '#fff8ec', W, H, W / 2, H / 2));
  sample(lop(wo), 3.9, d, 0.1, function (t) { return in2(ramp(3.9, d, t)) * 100; }); lop(wo).setValueAtTime(0, 0);
  nocam(raysLayer(c, 'Light rays', { cx: 960, cy: 600, a: 0.08, ang: -0.5 }));
  titles(c, [
    { t0: 0.2, t1: 2.5, y: 105, lines: [{ t: 'THE SECOND YOU', s: 'mid' }, { t: 'ENTER AN AIRPORT,', s: 'mid' }] },
    { t0: 2.4, t1: d - 0.25, y: 120, lines: [{ t: 'NORMAL LIFE', s: 'title' }, { t: 'KIND OF DISAPPEARS.', s: 'sub', gap: 8 }] }
  ]);
})();

// ── S05 — clocks of the world ──
(function () {
  var c = newScene(4), d = c.duration, i;
  var cam = camera(c, W / 2, H / 2);
  vgradSolid(c, 'Wall', -400, W + 1000, -200, 760, '#e9d7bd', '#d5bd9f');
  var sl = SL(c, 'Wall slats'); F(sl, 'Slats', '#966e50', function (g) { var x; for (x = -400; x < W + 600; x += 48) aRect(g, x, -200, 20, 960); }, 10);
  var lg = SL(c, 'Ledge'); F(lg, 'Ledge', '#b89e82', function (g) { aRect(g, -400, 760, W + 1000, 14); });
  vgradSolid(c, 'Floor', -400, W + 1000, 774, H + 300, '#c4ad94', '#8e7866');
  var cities = [['NEW YORK', -5, 1], ['LONDON', 0, 1.6], ['DUBAI', 4, -1.2], ['DELHI', 5.5, 2.4], ['TOKYO', 9, 0.6]];
  for (i = 0; i < cities.length; i++) {
    var cx = 330 + i * 345, cy = 470, R = 132, off = cities[i][1], sp = cities[i][2];
    var ck = SL(c, 'Clock ' + cities[i][0]);
    F(ck, 'Shadow', '#5a3c28', function (g) { aEll(g, cx + 14, cy + 18, (R + 8) * 2, (R + 8) * 2); }, 18);
    F(ck, 'Rim', '#3b2e2a', function (g) { aEll(g, cx, cy, (R + 10) * 2, (R + 10) * 2); });
    F(ck, 'Face', '#fbf6ec', function (g) { aEll(g, cx, cy, R * 2, R * 2); });
    var dial = G(ck, 'Dial (wobbles)', { a: [cx, cy], p: [cx, cy], re: 'Math.sin(time * 3 + ' + i + ') * 0.04 * Math.min(1, Math.max(0, (time - 1) / 2)) * ' + DEG + ';' });
    F(dial, 'Ticks', '#3b2e2a', function (g) {
      var m;
      for (m = 0; m < 12; m++) {
        var a = m * Math.PI / 6, len = m % 3 ? 14 : 24, r0 = R - 10, r1 = R - 10 - len;
        var ca = Math.cos(a), sa = Math.sin(a), px = function (rr, w) { return [cx + sa * rr + ca * w, cy - ca * rr + sa * w]; };
        var p1 = px(r0, -3), p2 = px(r0, 3), p3 = px(r1, 3), p4 = px(r1, -3);
        aPath(g, polyPB([p1[0], p1[1], p2[0], p2[1], p3[0], p3[1], p4[0], p4[1]]));
      }
    });
    var spinX = 'var t = time; var spin = (t * 0.6 + Math.pow(t, 2.4) * 0.35) * (' + sp + '); var hours = 3 + (' + off + ') + spin * 0.6;\n';
    var hh = G(dial, 'Hour hand', { a: [cx, cy], p: [cx, cy], re: spinX + 'hours / 12 * 360;' });
    strokeLine(hh, 'Hour hand', '#2b2220', 11, [cx, cy, cx, cy - R * 0.5]);
    var mh = G(dial, 'Minute hand', { a: [cx, cy], p: [cx, cy], re: spinX + 'var mins = (hours % 1) * 60 + spin * 30;\nmins / 60 * 360;' });
    strokeLine(mh, 'Minute hand', '#2b2220', 7, [cx, cy, cx, cy - R * 0.78]);
    var shd = G(dial, 'Second hand', { a: [cx, cy], p: [cx, cy], re: '(time * 6 * (' + sp + ') + ' + i + ') * ' + DEG + ';' });
    strokeLine(shd, 'Second hand', '#c44a36', 3, [cx, cy + 20, cx, cy - R * 0.85]);
    F(dial, 'Centre pin', '#c44a36', function (g) { aEll(g, cx, cy, 18, 18); });
    textLayer(c, 'Label ' + cities[i][0], cities[i][0], FONT.medium, 26, '#5a4136', 7, 'center', [cx + 4, cy + R + 66]);
  }
  parentAll(c, cam);
  var zf = function (t) { return lerp(1.04, 1.0, outc(t / d)); }, cf = function (t) { return lerp(0, 140, sine(t / d)); };
  sample(lsc(cam), 0, d, 0.1, function (t) { return [zf(t) * 100, zf(t) * 100]; });
  sample(lpos(cam), 0, d, 0.1, function (t) { return [W / 2 - zf(t) * cf(t), H / 2]; });
  nocam(raysLayer(c, 'Light rays', { a: 0.16, cx: 800, cy: 100, ang: -0.7 }));
  var wkr = SL(c, 'Passer-by (foreground, blurred)');
  figureInto(wkr, 'Passer-by', 0, 1180, 1000, { pose: 'walk', speed: 6.2, flip: true, col: '#221c22', top: '#2b2230', bag: true });
  keys(lpos(wkr.L), [[0, [2100, 0]], [d, [-300, 0]]]);
  blur(wkr.L, 18); nocam(wkr.L);
  nocam(bokehLayer(c, 'Bokeh', 51, 8, { a: 0.1 }));
  var wash = nocam(solid(c, 'White wash (from previous scene)', '#fff8ec', W, H, W / 2, H / 2));
  keys(lop(wash), [[0, 100], [0.6, 0]], 50);
  titles(c, [{ t0: 0.4, t1: d - 0.25, y: 92, lines: [{ t: 'TIME ZONES', s: 'title' }, { t: 'STOP MAKING SENSE.', s: 'sub', gap: 6 }] }]);
})();

// ── S06 — 3 a.m.; lights snap on ──
(function () {
  var c = newScene(5), d = c.duration, sname = SC[5][0], ON = 1.5;
  var cam = camera(c, W / 2, H / 2);
  var lightsF = function (t) { return clamp(0.08 + ramp(ON, ON + 0.6, t) * 0.92); };
  concourse(c, sname, {
    pal: PAL.night, floorTop: '#d7c8b2', floorBot: '#8a7967',
    ext: { moonX: 1820, moonY: 220, extra: function (ec, P, hor) {
      var pl = SL(ec, 'Taxiing plane (night)'); planeSideInto(pl, 'Plane', 1100, hor + 40, 760, { night: 1, dir: -1, lit: 0.8, pe: 'value + [-time * 30, 0];' }); P(pl.L, 1);
    } },
    mid: function (cc) {
      placeBoard(cc, BOARD3, 160, 210, 560, 0);
      var sr = SL(cc, 'Seat row'); seatRowInto(sr, 'Seats', 820, 860, 7, depthH(860), '#2f5d63'); reflectLayer(sr.L, 860, 0.5, 15);
      var tv = SL(cc, 'Traveller reading the board'); backFigureInto(tv, 'Traveller', 520, 960, depthH(960), { col: '#1d2130', top: '#3a2c3c' });
      rim(tv.L, '#a8b8ff', 0, 3); reflectLayer(tv.L, 960, 0.5, 20);
      var bg = SL(cc, 'Suitcase'); F(bg, 'Suitcase', '#333845', function (g) { aRect(g, 580, 850, 58, 100, 8); });
    },
    darkness: [[[0, 72 * 0.92], [ON, 72 * 0.92], [ON + 0.6, 0]], [[0, 12 * 0.92], [ON, 12 * 0.92], [ON + 0.6, 0]]],
    lightKeys: function (lightsL, list, glowL2) {
      var k;
      for (k = 0; k < list.length; k++) {
        var fillC = lightsL.property('ADBE Root Vectors Group').property(list[k].name).property('ADBE Vectors Group').property('ADBE Vector Graphic - Fill').property('ADBE Vector Fill Color');
        var tOn = ON + (list[k].i) * 0.07;
        fillC.setValueAtTime(0, c4(mix('#55565f', '#fff6e0', 0.06)));
        fillC.setValueAtTime(Math.max(0.01, tOn), c4('#fff6e0'));
        holdKeys(fillC);
      }
      keys(lop(glowL2), [[0, 6], [ON, 6], [ON + 0.6, 100]]);
    }
  });
  parentAll(c, cam);
  panKeys(cam, [[0, 0], [d, 90]]);
  zoomKeys(cam, d, 100, 105, 70);
  var fl = nocam(solid(c, 'Lights-on flash', '#fffaeb', W, H, W / 2, H / 2));
  keys(lop(fl), [[0, 0], [ON - 0.05, 0], [ON + 0.25, 18], [ON + 0.55, 0]]);
  var bk = nocam(bokehLayer(c, 'Bokeh', 61, 8, { a: 0.08, y0: 0, yr: 300 }));
  keys(lop(bk), [[0, 0], [ON + 0.3, 0], [ON + 0.6, 100]]);
  titles(c, [
    { t0: 0.25, t1: ON + 0.5, y: 250, x: 1380, lines: [{ t: 'IT CAN BE', s: 'sub' }, { t: '3 A.M.', s: 'big', gap: 10 }] },
    { t0: ON + 0.75, t1: d - 0.25, y: 250, x: 1300, lines: [{ t: 'AND IT WILL BE', s: 'sub' }, { t: 'FULLY BRIGHT', s: 'title', gap: 6 }, { t: 'INSIDE.', s: 'title' }] }
  ]);
})();

// ── S07 — sleeping on the floor ──
(function () {
  var c = newScene(6), d = c.duration, sname = SC[6][0], i;
  var cam = camera(c, W / 2, H / 2);
  concourse(c, sname, {
    pal: PAL.night, floorTop: '#d7c8b2', floorBot: '#8a7967',
    ext: { moonX: 1680, moonY: 250 },
    mid: function (cc) {
      var sr = SL(cc, 'Seat row'); seatRowInto(sr, 'Seats', 300, 860, 12, depthH(860), '#2f5d63'); par(sr.L, 1); reflectLayer(sr.L, 860, 0.5, 15);
      var px = 1500;
      var pl = SL(cc, 'Pillar (mid)'); F(pl, 'Pillar', '#9a6a5a', function (g) { aRect(g, px, CEIL, 120, 870 - CEIL); }); F(pl, 'Pillar shade', '#7b5144', function (g) { aRect(g, px + 90, CEIL, 30, 870 - CEIL); }); par(pl.L, 1.1);
      var dz = SL(cc, 'Dozing against the pillar'); dozerInto(dz, 'Dozer', px - 10, 905, depthH(905), {}); par(dz.L, 1.1); reflectLayer(dz.L, 905, 0.5, 15);
      var s1 = SL(cc, 'Sleeper 1'); sleeperInto(s1, 'Sleeper', 330, 975, 560, { top: '#5a3438', pill: '#3f6a7a' }); par(s1.L, 1.2); reflectLayer(s1.L, 975, 0.4, 12);
      var s2 = SL(cc, 'Sleeper 2'); sleeperInto(s2, 'Sleeper', 940, 1045, 640, { ph: 1.7, col: '#1e2232', top: '#3c4a3a', pill: '#8a5a3a', hair: 'long', jacket: '#7a5a3a' }); par(s2.L, 1.25); reflectLayer(s2.L, 1045, 0.4, 12);
      for (i = 0; i < 6; i++) {
        var j = i % 3, second = i >= 3;
        var z = textLayer(cc, 'z ' + (i + 1), 'z', FONT.regular, 36, '#ffffff', 0, 'left', [0, 0]);
        var x0 = second ? 1010 : 400 + j * 6, y0 = second ? 920 - j * 4 : 860, kx = second ? 50 : 40, ky = second ? 130 : 120, F2 = second ? 1.25 : 1.2;
        lpos(z).expression = 'var cam = thisComp.layer("CAMERA").effect("Pan")(1);\nvar k = (time * 0.5 + ' + (j / 3).toFixed(4) + ') % 1;\nvalue + [' + x0 + ' + k * ' + kx + ' - cam * ' + F2 + ', ' + (y0 + 12) + ' - k * ' + ky + '];';
        lop(z).expression = 'var k = (time * 0.5 + ' + (j / 3).toFixed(4) + ') % 1;\nMath.sin(k * Math.PI) * 70;';
      }
    },
    pillars: [{ x: -60, w: 180 }]
  });
  parentAll(c, cam);
  panKeys(cam, [[0, 0], [d, 160]], 70);
  nocam(bokehLayer(c, 'Bokeh', 71, 8, { a: 0.07, y0: 0, yr: 320 }));
  titles(c, [{ t0: 0.25, t1: d - 0.2, y: 230, lines: [{ t: 'PEOPLE ARE SLEEPING', s: 'title' }, { t: 'ON THE FLOOR,', s: 'title' }] }]);
})();

// ── S08 — noodles for breakfast ──
(function () {
  var c = newScene(7), d = c.duration, sname = SC[7][0], i;
  var cam = camera(c, 1150, 600);
  concourse(c, sname, {
    pal: PAL.dawn, step: 460,
    ext: { sunX: 700, sunY: 560, extra: function (ec, P, hor) {
      var pl = SL(ec, 'Plane climbing'); planeSideInto(pl, 'Plane', 200, hor - 60, 300, { rot: -0.15, tail: '#c4473a', pe: 'value + [time * 50, -time * 25];' }); P(pl.L, 1);
    } }
  });
  var ct = SL(c, 'Counter');
  F(ct, 'Front', '#1e1414', function (g) { aRect(g, -200, 890, W + 400, 600); }, 85);
  F(ct, 'Top edge', '#58403a', function (g) { aRect(g, -200, 860, W + 400, 8); });
  F(ct, 'Top', '#3b2b28', function (g) { aRect(g, -200, 860, W + 400, 30); });
  var s = 92, sx = 1200, sy = 640, cupX = 1420, cupY = 760;
  var liftF = function (t) { return sine((Math.sin(t * 2.6 - 1.2) + 1) / 2); };
  var chopY = function (t) { return lerp(cupY - 30, cupY - 190, liftF(t)); };
  var body = SL(c, 'Traveller (profile)');
  profileInto(body, 'Body', sx, sy, s, { col: '#2a2130', hair: 'bun' });
  ikArmInto(body, 'Arm holding the cup', '#2a2130', s, sx - 0.2 * s, sy + 0.4 * s, function () { return [cupX - 20, cupY + 40]; }, 0, 0, 1);
  rim(body.L, '#ffcf9e', 305, 8, 'Rim light L'); rim(body.L, '#ffcf9e', 45, 8, 'Rim light R');
  var cup = SL(c, 'Ramen cup');
  fillPath(cup, 'Cup', '#f6efe2', polyPB([cupX - 70, cupY - 70, cupX + 70, cupY - 70, cupX + 52, cupY + 80, cupX - 52, cupY + 80]));
  fillPath(cup, 'Band', '#d24a3a', polyPB([cupX - 64, cupY - 30, cupX + 64, cupY - 30, cupX + 60, cupY + 6, cupX - 60, cupY + 6]));
  F(cup, 'Broth', '#e9c27a', function (g) { aEll(g, cupX, cupY - 70, 140, 28); });
  textLayer(c, 'Cup label', 'RAMEN', FONT.medium, 22, '#ffffff', 3, 'center', [cupX, cupY - 4]);
  var nd = SL(c, 'Noodles');
  for (i = 0; i < 5; i++) {
    var ii = i;
    animPathInto(nd, 'Noodle ' + (i + 1), '#f2cf7c', 5, function (t) {
      var pts = [], k, x0 = cupX - 18 + ii * 8, cy2 = chopY(t);
      for (k = 0; k <= 16; k++) { var p = k / 16; pts.push(x0 + Math.sin(p * 9 + ii + t * 3) * 6 * (1 - p) + (cupX + 10 - x0) * p * 0.3, lerp(cupY - 70, cy2 + 10, p)); }
      return pts;
    }, 0, d);
  }
  var arm = SL(c, 'Arm with chopsticks');
  ikArmInto(arm, 'Arm', '#2a2130', s, sx + 0.4 * s, sy + 0.3 * s, function (t) { return [cupX + 40, chopY(t) - 40]; }, 0, d, 1);
  var chop = SL(c, 'Chopsticks');
  animPathInto(chop, 'Chopstick 1', '#c99a5f', 7, function (t) { var hy = chopY(t) - 40; return [cupX + 50, hy - 10, cupX + 2, chopY(t) + 14]; }, 0, d);
  animPathInto(chop, 'Chopstick 2', '#c99a5f', 7, function (t) { var hy = chopY(t) - 40; return [cupX + 62, hy - 4, cupX + 16, chopY(t) + 16]; }, 0, d);
  var stm = SL(c, 'Steam');
  for (i = 0; i < 3; i++) {
    var jj = i;
    animPathInto(stm, 'Wisp ' + (i + 1), '#ffffff', 7.7, function (t) {
      var pts = [], k, sc = 1.1;
      for (k = 0; k <= 20; k++) { var p = k / 20; pts.push(cupX + (jj - 1) * 26 * sc + Math.sin(p * 6 + t * 2.5 + jj * 2) * 14 * sc, cupY - 90 - p * 170 * sc - ((t * 40) % 30) * sc); }
      return pts;
    }, 0, d, 25);
  }
  blur(stm.L, 5);
  parentAll(c, cam);
  panKeys(cam, [[0, 200], [d, 200 + 25 * d]]);
  zoomKeys(cam, d, 100, 106, 70);
  nocam(raysLayer(c, 'Light rays', { a: 0.12, cx: 700, cy: 520, ang: -0.95, col: '#ffe6cc' }));
  nocam(bokehLayer(c, 'Bokeh', 81, 10, { a: 0.13, col: '#ffe0c8' }));
  titles(c, [{ t0: 0.2, t1: d - 0.2, y: 230, x: 560, lines: [{ t: 'EATING NOODLES', s: 'title' }, { t: 'FOR BREAKFAST,', s: 'title' }] }]);
})();

// ── S09 — coffee at midnight ──
(function () {
  var c = newScene(8), d = c.duration, sname = SC[8][0];
  var cam = camera(c, 700, 600);
  concourse(c, sname, {
    pal: PAL.night, step: 460, floorTop: '#d7c8b2', floorBot: '#8a7967',
    ext: { moonX: 300, moonY: 300, extra: function (ec, P, hor) {
      var pl = SL(ec, 'Plane (night)'); planeSideInto(pl, 'Plane', 300, hor + 30, 600, { night: 1, lit: 0.8, pe: 'value + [time * 60, 0];' }); P(pl.L, 0.5);
    } }
  });
  var kx = 1240, ky = 560;
  var hc = SL(c, 'Hanging clock');
  S(hc, 'Cables', '#2a2c33', 4, function (g) { aPath(g, linePB([kx + 60, -100, kx + 60, ky])); aPath(g, linePB([kx + 340, -100, kx + 340, ky])); });
  F(hc, 'Housing', '#141b2a', function (g) { aRect(g, kx, ky, 400, 150, 16); });
  F(hc, 'Glow', '#ff7850', function (g) { aEll(g, kx + 200, ky + 75, 380, 150); }, 14);
  var ck = textLayer(c, 'Clock 00:00', '00:00', FONT.medium, 96, '#ff7a5c', 8, 'center', [kx + 208, ky + 114]);
  ck.property('ADBE Text Properties').property('ADBE Text Document').expression = 'Math.floor(time * 2) % 2 ? "00 00" : "00:00";';
  var ct = SL(c, 'Counter');
  F(ct, 'Front', '#1e1414', function (g) { aRect(g, -200, 910, W + 400, 600); }, 88);
  F(ct, 'Top edge', '#58403a', function (g) { aRect(g, -200, 880, W + 400, 8); });
  F(ct, 'Top', '#3b2b28', function (g) { aRect(g, -200, 880, W + 400, 30); });
  var s = 95, sx = 760, sy = 640;
  var rk = function (t) { return io(ramp(0.3, 1.3, t)) * (1 - io(ramp(2.0, 2.6, t)) * 0.6); };
  var cupXY = function (t) { var k = rk(t); return [lerp(470, 560, k), lerp(840, 520, k)]; };
  var pr = SL(c, 'Traveller (profile, facing left)');
  profileInto(pr, 'Body', sx, sy, s, { col: '#1f1c2a', hair: 'short' });
  ikArmInto(pr, 'Arm raising the cup', '#1f1c2a', s, sx + 0.3 * s, sy + 0.35 * s, function (t) { var cp = cupXY(t); return [2 * sx - cp[0] - 10, cp[1] + 40]; }, 0, d, 1);
  lanc(pr.L).setValue([sx, 0]); lpos(pr.L).setValue([sx, 0]); lsc(pr.L).setValue([-100, 100]);
  rim(pr.L, '#a9b6ff', 305, 8, 'Rim light L'); rim(pr.L, '#a9b6ff', 45, 8, 'Rim light R');
  var cup = SL(c, 'Coffee cup');
  var cg = G(cup, 'Cup');
  fillPath(cg, 'Paper cup', '#f2ece2', polyPB([-50, -80, 50, -80, 40, 70, -40, 70]));
  fillPath(cg, 'Sleeve', '#7a4a32', polyPB([-47, -30, 47, -30, 43, 25, -43, 25]));
  F(cg, 'Lid', '#e7dccb', function (g) { aRect(g, -56, -98, 112, 22, 8); });
  sample(GT(cg).property('ADBE Vector Position'), 0, d, 1 / 15, cupXY);
  sample(GT(cg).property('ADBE Vector Rotation'), 0, d, 1 / 15, function (t) { return lerp(0, -0.45, rk(t)) * R2D; });
  var stm = SL(c, 'Steam'), i;
  for (i = 0; i < 2; i++) {
    var jj = i;
    animPathInto(stm, 'Wisp ' + (i + 1), '#ffffff', 6.3, function (t) {
      var pts = [], k, sc = 0.9, cp = cupXY(t);
      for (k = 0; k <= 20; k++) { var p = k / 20; pts.push(cp[0] + (jj - 1) * 26 * sc + Math.sin(p * 6 + t * 2.5 + jj * 2) * 14 * sc, cp[1] - 110 - p * 170 * sc - ((t * 40) % 30) * sc); }
      return pts;
    }, 0, d, 22);
  }
  blur(stm.L, 5);
  keys(lop(stm.L), [[0, 100], [0.95, 100], [1.1, 0], [2.3, 0], [2.5, 100]]);
  parentAll(c, cam);
  panKeys(cam, [[0, 900], [d, 900 - 25 * d]]);
  zoomKeys(cam, d, 104, 100, 70);
  nocam(bokehLayer(c, 'Bokeh', 91, 8, { a: 0.08, y0: 0, yr: 400 }));
  titles(c, [{ t0: 0.2, t1: d - 0.2, y: 210, x: 1440, lines: [{ t: 'DRINKING COFFEE', s: 'title' }, { t: 'AT MIDNIGHT.', s: 'title' }] }]);
})();

// ── S10 — the concourse goes on; day and night race past ──
(function () {
  var c = newScene(9), d = c.duration, sname = SC[9][0], i;
  var cam = camera(c, W / 2, H * 0.55);
  var r = rng(101), walkers = [], tops = ['#3a2c3c', '#24394a', '#5b2a2e', '#2f3b2c', '#40342a'];
  for (i = 0; i < 9; i++) {
    var wy = 820 + r() * 250, wx = r() * 2400 - 200, wv = (r() < 0.5 ? -1 : 1) * (60 + r() * 90), wph = r() * 6, wbag = r() < 0.6;
    var hr = r() < 0.3 ? 'long' : (r() < 0.5 ? 'bun' : null), wdress = r() < 0.2;
    walkers.push({ y: wy, x: wx, v: wv, ph: wph, bag: wbag, top: tops[i % 5], hair: hr, dress: wdress });
  }
  walkers.sort(function (a, b) { return a.y - b.y; });
  concourse(c, sname, {
    pal: PAL.golden, floorTop: '#d2c0a8', floorBot: '#857262',
    ext: { timelapse: true, sunX: 1500, sunY: 470, moonX: 1500, moonY: 260, clouds: CLOUDS_A },
    mid: function (cc) {
      placeBoard(cc, BOARD, 1520, 300, 360, 0);
      var sr = SL(cc, 'Seat row'); seatRowInto(sr, 'Seats', 120, 850, 6, depthH(850), '#2f5d63'); reflectLayer(sr.L, 850, 0.5, 15);
      var sl = SL(cc, 'Sleeper on the seats'); sleeperInto(sl, 'Sleeper', 200, 850 - depthH(850) * 0.24, depthH(850) * 0.95, { top: '#5a3438', pill: '#3f6a7a' });
      var sr2 = SL(cc, 'Seat row (front copy)'); seatRowInto(sr2, 'Seats', 120, 850, 6, depthH(850), '#2f5d63');
      var cd = SL(cc, 'Coffee drinker'); figureInto(cd, 'Coffee drinker', 1080, 880, depthH(880), { col: '#1f2331', top: '#2f3b2c', arms: [[0.35, 2.75], [0.1, 0.05]], cup: true });
      for (i = 0; i < walkers.length; i++) {
        var w = walkers[i], hh = depthH(w.y);
        var wl = SL(cc, 'Walker ' + (i + 1));
        var spd = Math.abs(w.v) / hh * 9;
        var pe = 'var ph = time * ' + spd.toFixed(4) + ' + ' + w.ph.toFixed(3) + ';\nvar x = ((' + w.x.toFixed(1) + ' + ' + w.v.toFixed(2) + ' * time) % 2500 + 2500) % 2500 - 300;\n[x, ' + w.y.toFixed(1) + ' - (1 - Math.abs(Math.sin(ph))) * ' + (0.012 * hh).toFixed(2) + '];';
        figureInto(wl, 'Walker', 0, 0, hh, { pose: 'walk', speed: spd, phase: w.ph, flip: w.v < 0, col: '#1d2130', top: w.top, bag: w.bag, hair: w.hair, dress: w.dress, pe: pe });
        reflectLayer(wl.L, w.y, 0.45, 14);
      }
    },
    pillars: [{ x: 600, w: 160, par: 1.3 }]
  });
  parentAll(c, cam);
  panKeys(cam, [[0, 0], [d, 120]]);
  sample(lsc(cam), 0, d, 0.2, function (t) { var z = lerp(1.1, 1.0, outc(t / d)) * 100; return [z, z]; });
  var ry = nocam(raysLayer(c, 'Light rays', { a: 0.1 }));
  sample(lop(ry), 0, d, 0.2, function (t) { return (1 - palAt(clamp(t / (d - 0.8)) * 4).night * 0.6) * 100; });
  nocam(bokehLayer(c, 'Bokeh', 111, 10, { a: 0.1 }));
  titles(c, [{ t0: 0.8, t1: d - 0.7, y: 230, x: 860, lines: [{ t: 'NOBODY QUESTIONS IT.', s: 'title' }] }]);
  var fo = nocam(solid(c, 'Fade to black', '#0e0a0e', W, H, W / 2, H / 2));
  sample(lop(fo), d - 1.0, d, 0.1, function (t) { return in2(ramp(d - 1.0, d, t)) * 100; }); lop(fo).setValueAtTime(0, 0);
})();

// ═════════════════════════ MAIN COMP ═════════════════════════
var main = compItem('AIRPORTS - MAIN', DUR, root);
var si;
for (si = 0; si < COMPS.length; si++) {
  var sl = main.layers.add(COMPS[si]);
  sl.startTime = SC[si][1];
  sl.inPoint = SC[si][1]; sl.outPoint = SC[si][2];
}
// column wipes hiding two cuts
var cuts = [9.0, 29.0];
for (si = 0; si < cuts.length; si++) {
  var tc = cuts[si], ww = W * 1.5;
  var wp = SL(main, 'Column wipe ' + (si + 1));
  F(wp, 'Column', '#3a2224', function (g) { aRect(g, 0, -400, ww, H + 800); });
  F(wp, 'Column core', '#46282a', function (g) { aRect(g, ww * 0.2, -400, ww * 0.6, H + 800); });
  blur(wp.L, 140);
  var pp = lpos(wp.L);
  pp.setValueAtTime(tc - 0.7, [W + 150, 0]); pp.setValueAtTime(tc + 0.7, [-ww - 150, 0]);
  easeKeys(pp, 75);
  wp.L.inPoint = tc - 0.75; wp.L.outPoint = tc + 0.75;
}
// look: bloom, warm grade, vignette, grain
var bl = main.layers.addSolid([1, 1, 1], 'LOOK  Bloom (adjustment)', W, H, 1, DUR); bl.adjustmentLayer = true;
var gl2 = addFx(bl, 'ADBE Glo2', 'Bloom');
setp(gl2, ['ADBE Glo2-0003', 'Glow Radius'], 60); setp(gl2, ['ADBE Glo2-0004', 'Glow Intensity'], 0.5);
var gr = main.layers.addSolid([1, 1, 1], 'LOOK  Warm grade', W, H, 1, DUR);
rampFx(gr, [W / 2, 0], '#ffd9a0', [W / 2, H], '#7a5a7a');
gr.blendingMode = BlendingMode.SOFT_LIGHT; lop(gr).setValue(35);
var vg = main.layers.addSolid(hex('#1e0f19'), 'LOOK  Vignette', W, H, 1, DUR);
addMask(vg, ellPB(W / 2, H / 2, W * 0.62, H * 0.72), 520, true);
lop(vg).setValue(55);
var gn = main.layers.addSolid([1, 1, 1], 'LOOK  Grain (adjustment)', W, H, 1, DUR); gn.adjustmentLayer = true;
var nz = addFx(gn, 'ADBE Noise', 'Grain');
setp(nz, ['ADBE Noise-0001', 'Amount of Noise'], 4); setp(nz, ['ADBE Noise-0002', 'Noise Type'], 0);
// soundtrack
var mfile = new File(ROOT.fsName + '/music.wav');
if (!mfile.exists) mfile = new File(ROOT.parent.fsName + '/output/music.wav');
if (mfile.exists) {
  try { var mi = app.project.importFile(new ImportOptions(mfile)); mi.parentFolder = root; var al = main.layers.add(mi); al.name = 'Soundtrack'; al.moveToEnd(); } catch (e) { }
}
// voiceover markers
var LINES = [[0.3, "Airports don't feel like real places."], [4.6, 'They feel like waiting rooms outside of reality.'], [9.2, 'Think about it.'],
  [11.4, 'The second you enter an airport, normal life kind of disappears.'], [16.5, 'Time zones stop making sense.'],
  [19.6, 'It can be 3 a.m. and it will be fully bright inside.'], [24.2, 'People are sleeping on the floor,'], [26.8, 'eating noodles for breakfast,'],
  [29.2, 'drinking coffee at midnight.'], [32.3, 'Nobody questions it.']];
for (si = 0; si < LINES.length; si++) { try { main.markerProperty.setValueAtTime(LINES[si][0], new MarkerValue(LINES[si][1])); } catch (e) { } }
main.openInViewer();
app.endUndoGroup();
alert('Airports project built.\n\nOpen "AIRPORTS - MAIN" and press Space (or render with Composition > Add to Render Queue).\nSave the project: File > Save As.');

})();
