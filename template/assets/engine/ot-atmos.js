/*
 * ot-atmos.js — background atmosphere: hash-seeded depth-of-field bokeh, camera-speed dot-grid
 * streak, per-frame film-grain jitter, and a tiny world-tracked glow setter. Counts, colors and
 * ranges are brand config; the hash-decorrelation seed constants are engine-internal (arbitrary,
 * not brand data) and reproduce the source's exact particle placement.
 */
(function (OT) {
  "use strict";
  OT.atmos = OT.atmos || {};

  // opts: {total, frontStart, colors:[...], backEl, frontEl,
  //        back:{d:[base,span], wx:[base,span], wy:[base,span], r:[base,span], a:[base,span]}, front:{...same shape}}
  OT.atmos.bokeh = function bokeh(opts) {
    var total = opts.total, splitAt = opts.frontStart, cols = opts.colors;
    var back = opts.back, front = opts.front;
    var list = [];
    for (var i = 0; i < total; i++) {
      var isF = i >= splitAt;
      var R = isF ? front : back;
      var d = R.d[0] + OT.hash(i * (isF ? 3.1 : 5.7)) * R.d[1];
      var wx = R.wx[0] + OT.hash(i * 1.7) * R.wx[1];
      var wy = R.wy[0] + OT.hash(i * 2.3) * R.wy[1];
      var r = R.r[0] + OT.hash(i * (isF ? 4.4 : 6.6)) * R.r[1];
      var a = R.a[0] + OT.hash(i * (isF ? 8.8 : 9.9)) * R.a[1];
      var c = cols[i % cols.length];
      var e = document.createElement("i");
      e.style.width = e.style.height = 2 * r + "px";
      e.style.marginLeft = e.style.marginTop = -r + "px";
      e.style.background = "radial-gradient(circle, rgba(" + c + "," + a.toFixed(3) + ") 0%, rgba(" + c + "," + (a * 0.5).toFixed(3) + ") 42%, rgba(" + c + ",0) 70%)";
      (isF ? opts.frontEl : opts.backEl).appendChild(e);
      list.push({ e: e, d: d, wx: wx, wy: wy, ph: OT.hash(i * 12.1) * 6.283 });
    }
    return list;
  };

  OT.atmos.renderBokeh = function renderBokeh(list, t, cam, vx, opts) {
    opts = opts || {};
    var swayX = opts.swayX != null ? opts.swayX : 34, freqX = opts.freqX != null ? opts.freqX : 0.42;
    var swayY = opts.swayY != null ? opts.swayY : 26, freqY = opts.freqY != null ? opts.freqY : 0.31;
    var vk = opts.vk != null ? opts.vk : 0.018, vMax = opts.vMax != null ? opts.vMax : 3.2;
    var stretchK = opts.stretchK != null ? opts.stretchK : 0.8;
    var margin = opts.margin != null ? opts.margin : 500;
    var st = 1 + Math.min(vx * vk, vMax);
    for (var i = 0; i < list.length; i++) {
      var b = list[i];
      var x = OT.fmt.cx + (b.wx + swayX * Math.sin(t * freqX + b.ph) - cam.x) * cam.s * b.d;
      var y = OT.fmt.cy + (b.wy + swayY * Math.cos(t * freqY + b.ph) - cam.y) * cam.s * b.d;
      if (x < -margin || x > OT.fmt.w + margin || y < -margin || y > OT.fmt.h + margin) { b.e.style.opacity = "0"; continue; }
      var sc = cam.s * (0.55 + 0.45 * b.d);
      var sx = sc * (1 + (st - 1) * b.d * stretchK);
      b.e.style.opacity = (1 / Math.sqrt(sx / sc)).toFixed(3);
      b.e.style.transform = "translate(" + x.toFixed(1) + "px, " + y.toFixed(1) + "px) scale(" + sx.toFixed(3) + ", " + sc.toFixed(3) + ")";
    }
  };

  // camera-speed dot-grid streak; caches per-element so a redundant identical style write is skipped
  // (a performance cache only — it never changes what a given (el,bl) pair renders).
  var _dotsCache = typeof WeakMap !== "undefined" ? new WeakMap() : null;
  OT.atmos.renderDots = function renderDots(el, bl, baseCSS, opts) {
    opts = opts || {};
    var cap = opts.cap != null ? opts.cap : 60;
    var rxBase = opts.rxBase != null ? opts.rxBase : 2.2, rxK = opts.rxK != null ? opts.rxK : 0.55, rxMax = opts.rxMax != null ? opts.rxMax : 24;
    var aBase = opts.aBase != null ? opts.aBase : 0.26, aK = opts.aK != null ? opts.aK : 0.35, aMin = opts.aMin != null ? opts.aMin : 0.28;
    var color = opts.color || "255,255,255";
    var key = bl < 1.5 ? "0" : Math.min(bl, cap).toFixed(0);
    if (_dotsCache && _dotsCache.get(el) === key) return;
    if (_dotsCache) _dotsCache.set(el, key);
    if (key === "0") { el.style.backgroundImage = baseCSS; return; }
    var b = Math.min(bl, cap), rx = Math.min(rxMax, rxBase + b * rxK), a = aBase * OT.clamp(5 / (5 + b * aK), aMin, 1);
    el.style.backgroundImage = "radial-gradient(" + rx.toFixed(1) + "px 2.1px at 50% 50%, rgba(" + color + ", " + a.toFixed(3) + ") 0%, rgba(" + color + ", " + (a * 0.55).toFixed(3) + ") 55%, rgba(" + color + ", 0) 100%)";
  };

  OT.atmos.grainJitter = function grainJitter(el, frame, opts) {
    opts = opts || {};
    var amp = opts.amp != null ? opts.amp : 18, seedB = opts.seedB != null ? opts.seedB : 7;
    el.style.transform = "translate(" + ((OT.hash(frame) - 0.5) * amp).toFixed(2) + "%, " + ((OT.hash(frame + seedB) - 0.5) * amp).toFixed(2) + "%)";
  };

  // Canvas dust motes (hash-seeded, screen-space, parallax-wrapped — same lineage as the atmos-fx
  // reference this engine draws on). The wrap box is OT.fmt.w/h plus a margin (the reference hardcodes
  // a fixed box with fixed offsets for its own 16:9 frame — expressed here generally as
  // fmt.w/h + 2*margin, offset by -margin, so it fits any format). opts: {margin (default 140, both
  // axes), marginX, marginY, r:[base,span], d:[base,span], sp:[base,span]}. `seed` decorrelates
  // multiple independent mote fields from each other.
  OT.atmos.makeMotes = function makeMotes(n, seed, opts) {
    opts = opts || {};
    var margin = opts.margin != null ? opts.margin : 140;
    var mx = opts.marginX != null ? opts.marginX : margin;
    var my = opts.marginY != null ? opts.marginY : margin;
    var ww = OT.fmt.w + 2 * mx, wh = OT.fmt.h + 2 * my;
    var rR = opts.r || [0.8, 2.6], dR = opts.d || [0.15, 0.7], spR = opts.sp || [8, 22];
    var list = [];
    var s = seed || 0;
    for (var i = 0; i < n; i++) {
      // i + seed*7919 (7919 is just a large prime -- picked to push different seeds' index ranges
      // far enough apart that OT.hash's periodicity never re-collides them): seed 0 still reduces
      // to k=i exactly (unchanged from before), but seed 1, 2, ... now land on a disjoint range of
      // hash inputs instead of overlapping all-but-one index with seed 0 (the old `seed + i` bug).
      var k = i + s * 7919;
      list.push({
        x: OT.hash(k * 3.7) * ww - mx,
        y: OT.hash(k * 5.1) * wh - my,
        d: dR[0] + OT.hash(k * 7.3) * dR[1],
        r: rR[0] + OT.hash(k * 9.1) * rR[1],
        ph: OT.hash(k * 1.3) * Math.PI * 2,
        sp: spR[0] + OT.hash(k * 2.9) * spR[1],
      });
    }
    list.w = ww; list.h = wh; list.mx = mx; list.my = my;
    return list;
  };

  // Per-frame draw for a makeMotes() list onto a 2D canvas context — additive, screen-space, with a
  // light camera-parallax drift and a slow per-mote twinkle. Pure function of (t, cam, motes, opts);
  // no state persists between calls (seek-safe). opts: {color:"r,g,b" (no default brand color — always
  // pass your own), alpha, swayX, freqX, driftY, freqY, parallax, fadeFrom, fadeTo}.
  OT.atmos.drawMotes = function drawMotes(ctx, t, cam, motes, opts) {
    opts = opts || {};
    var color = opts.color || "255,255,255";
    var alpha = opts.alpha != null ? opts.alpha : 0.34;
    var swayX = opts.swayX != null ? opts.swayX : 26, freqX = opts.freqX != null ? opts.freqX : 0.35;
    var driftY = opts.driftY != null ? opts.driftY : 12, freqY = opts.freqY != null ? opts.freqY : 0.5;
    var parallax = opts.parallax != null ? opts.parallax : 0.35;
    var fadeFrom = opts.fadeFrom != null ? opts.fadeFrom : 0.1, fadeTo = opts.fadeTo != null ? opts.fadeTo : 1.2;
    var ww = motes.w != null ? motes.w : OT.fmt.w, wh = motes.h != null ? motes.h : OT.fmt.h;
    var mx = motes.mx || 0, my = motes.my || 0;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    var prevOp = ctx.globalCompositeOperation;
    ctx.globalCompositeOperation = "lighter";
    var a0 = OT.prog(t, fadeFrom, fadeTo);
    for (var i = 0; i < motes.length; i++) {
      var m = motes[i];
      var x = m.x + swayX * Math.sin(t * freqX + m.ph) - (cam.x - OT.fmt.cx) * m.d * parallax * cam.s;
      var y = m.y - m.sp * t - (cam.y - OT.fmt.cy) * m.d * parallax * cam.s + driftY * Math.cos(t * freqY + m.ph);
      x = ((x % ww) + ww) % ww - mx;
      y = ((y % wh) + wh) % wh - my;
      var tw = 0.55 + 0.45 * Math.sin(t * (1.1 + m.d) + m.ph * 3);
      ctx.fillStyle = "rgba(" + color + "," + (alpha * m.d * tw * a0).toFixed(3) + ")";
      ctx.beginPath();
      ctx.arc(x, y, m.r * (0.6 + m.d), 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalCompositeOperation = prevOp;
  };

  // thin transform/opacity setter shared by any world-tracked glow element (brand computes sx/sy/opacity/scale)
  OT.atmos.applyGlow = function applyGlow(el, sx, sy, opacity, scale) {
    el.style.transform = scale != null
      ? "translate(" + sx.toFixed(1) + "px, " + sy.toFixed(1) + "px) scale(" + scale.toFixed(3) + ")"
      : "translate(" + sx.toFixed(1) + "px, " + sy.toFixed(1) + "px)";
    el.style.opacity = opacity.toFixed(3);
  };
})(window.OT);
