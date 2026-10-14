/*
 * ot-backdrop.js -- a tokenised, per-brand background WORLD. Every backdrop colour comes from the
 * brand (its own :root tokens, or an explicit --atmos-* var / OT_BRAND.atmos field); nothing is
 * hard-coded warm or purple. A small library of seek-safe treatments gives each brand its own look:
 *
 *   dots       dot grid in the world + depth-of-field bokeh   (the original look)
 *   stars      night sky: parallax star layers, flares, milky band, deterministic shooting stars
 *   topo       animated topographic contour lines (marching squares over a slow noise field)
 *   blueprint  drafting grid: minor/major lines, registration crosses, construction arcs, scan sweep
 *   paper      soft light world: fibres, creases, drifting soft shadows (for LIGHT brands)
 *   aurora     ribbon curtains of light (additive vertical gradients)
 *   halftone   rotated print-dot screen whose dot size follows a moving light field
 *
 * Contract: every treatment is a pure function of (t, cam, cfg) -- seeded integer hash (HS) only, no
 * Math.random / Date.now, no state carried between frames -- so any seek order renders the same picture.
 * No SVG filter is used. Decorative layers carry data-layout-ignore. The vignette's darkest stop is
 * clamped below alpha 0.6 (the layout auditor treats >= 0.6 as opaque).
 *
 * Config resolution, per field: explicit `--atmos-<k>` CSS var  >  OT_BRAND.atmos.<k>  >  derived from
 * the brand's own tokens (--bg, --ink, --accent, --accent-2)  >  NEUTRAL default (cool slate, never warm).
 * Fields: treatment, bg, glow, glow2, grid, gridAlpha, vignette, vignetteAlpha, bokeh, mode, corners, intensity.
 *
 * Old projects never load this file (their index.html/acts.js hard-code their own backdrop), so
 * sync-engine adding it changes nothing they render.
 */
(function (OT) {
  "use strict";
  var B = OT.backdrop = OT.backdrop || {};

  // ------------------------------------------------------------------ colour helpers (pure)
  B.NEUTRAL = { bg: "#111316", glow: "#8fa0b8", glow2: "#6b7a8f", ink: "#e6e9ee", accent: "#8fa0b8", accent2: "#6b7a8f" };
  B.TREATMENTS = ["dots", "stars", "topo", "blueprint", "paper", "aurora", "halftone"];

  function parseColor(s) {
    if (s == null) return null;
    if (Array.isArray(s)) return s.slice(0, 3).map(Number);
    s = String(s).trim();
    var m = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(s);
    if (m) {
      var h = m[1];
      if (h.length === 3) h = h.split("").map(function (c) { return c + c; }).join("");
      var n = parseInt(h, 16);
      return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
    }
    m = /^(\d+)\s*,\s*(\d+)\s*,\s*(\d+)$/.exec(s);
    if (m) return [+m[1], +m[2], +m[3]];
    return null;
  }
  function mix(a, b, k) { return [0, 1, 2].map(function (i) { return Math.round(a[i] + (b[i] - a[i]) * k); }); }
  function lum(c) { return (0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]) / 255; }
  function rgb(c) { return c[0] + "," + c[1] + "," + c[2]; }
  function rgba(c, a) { return "rgba(" + c[0] + "," + c[1] + "," + c[2] + "," + (+a).toFixed(3) + ")"; }
  function cssVar(name) {
    try { return getComputedStyle(document.documentElement).getPropertyValue(name).trim(); } catch (e) { return ""; }
  }
  B.util = { parseColor: parseColor, mix: mix, lum: lum, rgb: rgb, rgba: rgba };

  // Resolve the full config. `src` (optional) = {vars:{--name:value}, brand:{...}} lets tests inject
  // sources without a DOM; in the browser it reads :root and window.OT_BRAND.
  B.config = function config(src) {
    var vars = src && src.vars, brand = src ? src.brand : (typeof window !== "undefined" && window.OT_BRAND && window.OT_BRAND.atmos);
    brand = brand || {};
    function v(name) { return vars ? (vars[name] || "") : cssVar(name); }
    function pick(key, tokenNames) {
      var x = v("--atmos-" + key);
      if (x) return x;
      if (brand[key] != null && brand[key] !== "") return brand[key];
      for (var i = 0; i < (tokenNames || []).length; i++) { x = v(tokenNames[i]); if (x) return x; }
      return null;
    }
    var N = B.NEUTRAL;
    var treatment = String(pick("treatment") || "dots").replace(/["']/g, "");
    if (B.TREATMENTS.indexOf(treatment) < 0) treatment = "dots";

    var bg = parseColor(pick("bg", ["--bg"])) || parseColor(N.bg);
    var ink = parseColor(v("--ink")) || parseColor(N.ink);
    var mode = pick("mode");
    var light = mode ? String(mode) === "light" : lum(bg) > 0.55;
    var glow = parseColor(pick("glow", ["--accent"])) || parseColor(N.glow);
    var glow2 = parseColor(pick("glow2", ["--accent-2"])) || parseColor(N.glow2);

    var c0, c1, c2;
    if (light) { c0 = mix(bg, [255, 255, 255], 0.55); c1 = bg; c2 = mix(bg, ink, 0.12); }
    else { c0 = mix(bg, [255, 255, 255], 0.06); c1 = bg; c2 = mix(bg, [0, 0, 0], 0.5); }

    var gridC = parseColor(pick("grid")) || (light ? mix(bg, ink, 0.55) : mix(bg, ink, 0.6));
    var gridA = pick("gridAlpha"); gridA = gridA != null ? +gridA : (light ? 0.2 : 0.24);
    var vigC = parseColor(pick("vignette")) || (light ? mix(bg, ink, 0.3) : mix(bg, [0, 0, 0], 0.8));
    var vigA = pick("vignetteAlpha"); vigA = vigA != null ? +vigA : (light ? 0.42 : 0.52);
    vigA = Math.min(vigA, 0.58); // layout auditor: >= 0.6 counts as opaque
    var bokehRaw = brand.bokeh || null, bokeh;
    if (bokehRaw && bokehRaw.length) bokeh = bokehRaw.map(parseColor).filter(Boolean);
    if (!bokeh || !bokeh.length) bokeh = [glow, mix(glow, ink, 0.55)];
    var intensity = pick("intensity"); intensity = intensity != null ? +intensity : 1;
    var corners = pick("corners");

    return {
      treatment: treatment, light: light, bg: bg, ink: ink, glow: glow, glow2: glow2,
      stops: [c0, c1, c2], grid: gridC, gridAlpha: gridA, vignette: vigC, vignetteAlpha: vigA,
      bokeh: bokeh, intensity: intensity, corners: corners == null ? true : String(corners) !== "false" && corners !== false,
      glowAlpha: light ? 0.18 : 0.3, glow2Alpha: light ? 0.1 : 0.16,
    };
  };

  // ------------------------------------------------------------------ deterministic noise (pure)
  // Integer-mixing hash (deterministic, seeded by (i, salt)). OT.hash() is sin-based and its outputs
  // correlate when two calls use multiples of the same index (visible as clustered stars), so the
  // treatments scatter with this instead. Returns [0,1).
  function HS(i, salt) {
    var x = Math.imul((Math.round(i * 4096) | 0) ^ Math.imul(Math.round(salt * 1000) | 0, 0x9E3779B1), 0x85EBCA6B);
    x ^= x >>> 13; x = Math.imul(x, 0xC2B2AE35); x ^= x >>> 16; x = Math.imul(x, 0x27D4EB2F); x ^= x >>> 15;
    return (x >>> 0) / 4294967296;
  }
  B.hash = HS;
  function lat(ix, iy, iz) { return HS(Math.imul(ix, 73856093) ^ Math.imul(iy, 19349663) ^ Math.imul(iz, 83492791), 0.37) ; }
  function sm(x) { return x * x * (3 - 2 * x); }
  // value noise in [0,1], smooth in x,y,z
  function noise3(x, y, z) {
    var ix = Math.floor(x), iy = Math.floor(y), iz = Math.floor(z);
    var fx = sm(x - ix), fy = sm(y - iy), fz = sm(z - iz);
    function L(dz) {
      var a = lat(ix, iy, iz + dz), b = lat(ix + 1, iy, iz + dz), c = lat(ix, iy + 1, iz + dz), d = lat(ix + 1, iy + 1, iz + dz);
      var top = a + (b - a) * fx, bot = c + (d - c) * fx;
      return top + (bot - top) * fy;
    }
    var l0 = L(0), l1 = L(1);
    return l0 + (l1 - l0) * fz;
  }
  B.noise3 = noise3;
  function mod(a, n) { return ((a % n) + n) % n; }

  // world -> screen for a parallax layer of depth d: sx = cx + (wx - cam.x) * cam.s * d
  function sx(wx, cam, d) { return OT.fmt.cx + (wx - cam.x) * cam.s * d; }
  function sy(wy, cam, d) { return OT.fmt.cy + (wy - cam.y) * cam.s * d; }

  // ------------------------------------------------------------------ treatments
  // Each: { canvas: bool, build(cfg) -> state (pure data from hash), draw(ctx, t, cam, cfg, st) }
  var TR = {};

  // ---- dots: DOM dot grid (in #world) + bokeh; no canvas
  TR.dots = { canvas: false, dom: true };

  // ---- stars
  TR.stars = {
    canvas: true,
    build: function () {
      var W = OT.fmt.w, H = OT.fmt.h, layers = [], L, i, n = [170, 100, 44], dd = [0.05, 0.12, 0.26];
      for (L = 0; L < 3; L++) {
        var s = [];
        for (i = 0; i < n[L]; i++) {
          var k = i + L * 977;
          s.push({ x: HS(k, 3.1) * (W + 400), y: HS(k, 5.3) * (H + 400), r: 0.5 + HS(k, 7.7) * (0.9 + L * 0.7),
                   a: 0.35 + HS(k, 9.1) * 0.6, ph: HS(k, 2.7) * 6.283, f: 0.6 + HS(k, 4.1) * 1.8,
                   tint: HS(k, 6.1), flare: L === 2 && HS(k, 8.3) > 0.72 });
        }
        layers.push({ d: dd[L], s: s });
      }
      var band = [];
      for (i = 0; i < 16; i++) {
        var u = i / 15;
        band.push({ x: -0.1 + u * 1.2, y: 0.78 - u * 0.62 + (HS(i, 4.4) - 0.5) * 0.08, r: 260 + HS(i, 6.6) * 240, a: 0.5 + HS(i, 3.3) * 0.5 });
      }
      return { layers: layers, band: band };
    },
    draw: function (ctx, t, cam, cfg, st) {
      var W = OT.fmt.w, H = OT.fmt.h, k = cfg.intensity;
      ctx.globalCompositeOperation = "lighter";
      var g = cfg.glow, i, L;
      for (i = 0; i < st.band.length; i++) {
        var b = st.band[i], bx = b.x * W + (OT.fmt.cx - cam.x) * cam.s * 0.03, by = b.y * H + (OT.fmt.cy - cam.y) * cam.s * 0.03;
        var gr = ctx.createRadialGradient(bx, by, 0, bx, by, b.r);
        gr.addColorStop(0, rgba(g, 0.085 * b.a * k)); gr.addColorStop(1, rgba(g, 0));
        ctx.fillStyle = gr; ctx.fillRect(bx - b.r, by - b.r, b.r * 2, b.r * 2);
      }
      var star = mix(cfg.ink, [255, 255, 255], 0.5), warm = cfg.glow2;
      for (L = 0; L < st.layers.length; L++) {
        var lay = st.layers[L], TW = W + 400, TH = H + 400;
        for (i = 0; i < lay.s.length; i++) {
          var s = lay.s[i];
          var x = mod(s.x - (cam.x - OT.fmt.cx) * cam.s * lay.d + 200, TW) - 200, y = mod(s.y - (cam.y - OT.fmt.cy) * cam.s * lay.d + 200, TH) - 200;
          var tw = 0.62 + 0.38 * Math.sin(t * s.f + s.ph);
          var col = mix(star, warm, s.tint * 0.35), a = Math.min(1, s.a * tw * k);
          ctx.fillStyle = rgba(col, a);
          ctx.beginPath(); ctx.arc(x, y, s.r, 0, 6.2832); ctx.fill();
          if (s.flare) {
            var fl = 10 + 9 * tw;
            ctx.strokeStyle = rgba(col, a * 0.5); ctx.lineWidth = 1;
            ctx.beginPath(); ctx.moveTo(x - fl, y); ctx.lineTo(x + fl, y); ctx.moveTo(x, y - fl); ctx.lineTo(x, y + fl); ctx.stroke();
          }
        }
      }
      // shooting stars: period 5.3 s, each lives 0.55 s, start/angle from the cycle index
      for (var c = 0; c < 2; c++) {
        var per = 5.3 + c * 1.7, n = Math.floor((t - c * 2.1) / per), u = ((t - c * 2.1) - n * per) / 0.55;
        if (n < 0 || u < 0 || u > 1) continue;
        var x0 = HS(n * 3 + c, 3.3) * W * 0.7, y0 = HS(n * 3 + c, 7.1) * H * 0.4, ang = 0.35 + HS(n * 3 + c, 1.9) * 0.3;
        var len = 420, hx = x0 + Math.cos(ang) * len * u * 2, hy = y0 + Math.sin(ang) * len * u * 2;
        var tx = hx - Math.cos(ang) * len * 0.5, ty = hy - Math.sin(ang) * len * 0.5;
        var lg = ctx.createLinearGradient(tx, ty, hx, hy);
        lg.addColorStop(0, rgba(star, 0)); lg.addColorStop(1, rgba(star, 0.85 * Math.sin(u * 3.1416) * k));
        ctx.strokeStyle = lg; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(tx, ty); ctx.lineTo(hx, hy); ctx.stroke();
      }
    },
  };

  // ---- topo: contour lines via marching squares over a slow-drifting noise field
  var CELL = 30, LEVELS = 13;
  // segment table: for case index (tl=8,tr=4,br=2,bl=1), edge pairs; edges: 0=top,1=right,2=bottom,3=left
  var MS = [[], [[3, 2]], [[2, 1]], [[3, 1]], [[0, 1]], [[0, 3], [2, 1]], [[0, 2]], [[0, 3]], [[0, 3]], [[0, 2]], [[0, 1], [3, 2]], [[0, 1]], [[3, 1]], [[2, 1]], [[3, 2]], []];
  TR.topo = {
    canvas: true,
    build: function () { return {}; },
    draw: function (ctx, t, cam, cfg, st) {
      var W = OT.fmt.w, H = OT.fmt.h, d = 0.22, k = cfg.intensity;
      var cols = Math.ceil(W / CELL) + 2, rows = Math.ceil(H / CELL) + 2, F = new Array(cols * rows), i, j;
      var scale = 1 / 1500, z = t * 0.05;
      for (j = 0; j < rows; j++) for (i = 0; i < cols; i++) {
        var px = i * CELL - CELL, py = j * CELL - CELL;
        var wx = (px - OT.fmt.cx) / (cam.s * d) + cam.x, wy = (py - OT.fmt.cy) / (cam.s * d) + cam.y;
        var f = noise3(wx * scale, wy * scale, z) * 0.62 + noise3(wx * scale * 2.3 + 9.1, wy * scale * 2.3 + 4.7, z * 1.4) * 0.28 + noise3(wx * scale * 5, wy * scale * 5, z * 2) * 0.1;
        F[j * cols + i] = f;
      }
      var lo = 0.2, hi = 0.8, level, ci, cj;
      for (level = 0; level < LEVELS; level++) {
        var th = lo + (hi - lo) * (level / (LEVELS - 1)), major = level % 4 === 0;
        ctx.strokeStyle = rgba(cfg.grid, (major ? 0.5 : 0.24) * (cfg.light ? 0.9 : 1) * k);
        ctx.lineWidth = major ? 2 : 1.2;
        ctx.beginPath();
        for (cj = 0; cj < rows - 1; cj++) for (ci = 0; ci < cols - 1; ci++) {
          var a = F[cj * cols + ci], b = F[cj * cols + ci + 1], c = F[(cj + 1) * cols + ci + 1], dd = F[(cj + 1) * cols + ci];
          var idx = (a > th ? 8 : 0) | (b > th ? 4 : 0) | (c > th ? 2 : 0) | (dd > th ? 1 : 0);
          if (idx === 0 || idx === 15) continue;
          var x0 = ci * CELL - CELL, y0 = cj * CELL - CELL, segs = MS[idx];
          for (var s = 0; s < segs.length; s++) {
            var p = edgePt(segs[s][0], x0, y0, a, b, c, dd, th), q = edgePt(segs[s][1], x0, y0, a, b, c, dd, th);
            ctx.moveTo(p[0], p[1]); ctx.lineTo(q[0], q[1]);
          }
        }
        ctx.stroke();
      }
    },
  };
  function edgePt(e, x0, y0, a, b, c, d, th) {
    function u(p, q) { return (th - p) / ((q - p) || 1e-6); }
    if (e === 0) return [x0 + CELL * u(a, b), y0];
    if (e === 1) return [x0 + CELL, y0 + CELL * u(b, c)];
    if (e === 2) return [x0 + CELL * u(d, c), y0 + CELL];
    return [x0, y0 + CELL * u(a, d)];
  }

  // ---- blueprint
  TR.blueprint = {
    canvas: true,
    build: function () {
      var arcs = [], i;
      for (i = 0; i < 7; i++) arcs.push({ x: HS(i, 3.7) * 3200 - 400, y: HS(i, 5.9) * 1900 - 300, r: 160 + HS(i, 8.1) * 380, a0: HS(i, 2.2) * 6.28, span: 1.4 + HS(i, 6.3) * 3.6 });
      return { arcs: arcs };
    },
    draw: function (ctx, t, cam, cfg, st) {
      var W = OT.fmt.w, H = OT.fmt.h, k = cfg.intensity, col = cfg.grid, d = 0.38;
      var minor = 40, major = 200, s = cam.s * d;
      while (major * s < 16) { major *= 5; minor *= 5; } // extreme zoom-out: coarsen instead of drawing thousands of lines
      var wx0 = (0 - OT.fmt.cx) / s + cam.x, wx1 = (W - OT.fmt.cx) / s + cam.x, wy0 = (0 - OT.fmt.cy) / s + cam.y, wy1 = (H - OT.fmt.cy) / s + cam.y;
      var x, y, n;
      // minor lines (skip when they would be denser than ~9px on screen)
      if (minor * s >= 9) {
        ctx.strokeStyle = rgba(col, 0.1 * k); ctx.lineWidth = 1; ctx.beginPath();
        for (n = Math.floor(wx0 / minor); n <= wx1 / minor; n++) { if (n % 5 === 0) continue; x = sx(n * minor, cam, d) + 0.5; ctx.moveTo(x, 0); ctx.lineTo(x, H); }
        for (n = Math.floor(wy0 / minor); n <= wy1 / minor; n++) { if (n % 5 === 0) continue; y = sy(n * minor, cam, d) + 0.5; ctx.moveTo(0, y); ctx.lineTo(W, y); }
        ctx.stroke();
      }
      ctx.strokeStyle = rgba(col, 0.26 * k); ctx.lineWidth = 1.6; ctx.beginPath();
      for (n = Math.floor(wx0 / major); n <= wx1 / major; n++) { x = sx(n * major, cam, d); ctx.moveTo(x, 0); ctx.lineTo(x, H); }
      for (n = Math.floor(wy0 / major); n <= wy1 / major; n++) { y = sy(n * major, cam, d); ctx.moveTo(0, y); ctx.lineTo(W, y); }
      ctx.stroke();
      // registration crosses at every 2nd major intersection
      ctx.strokeStyle = rgba(cfg.ink, 0.34 * k); ctx.lineWidth = 1.8; ctx.beginPath();
      var nx, ny;
      for (nx = Math.floor(wx0 / major); nx <= wx1 / major; nx++) for (ny = Math.floor(wy0 / major); ny <= wy1 / major; ny++) {
        if ((nx + ny) % 2 !== 0) continue;
        x = sx(nx * major, cam, d); y = sy(ny * major, cam, d);
        ctx.moveTo(x - 9, y); ctx.lineTo(x + 9, y); ctx.moveTo(x, y - 9); ctx.lineTo(x, y + 9);
      }
      ctx.stroke();
      // construction arcs (dashed) on a slower layer
      var d2 = 0.2, i, a;
      ctx.setLineDash([14, 10]); ctx.strokeStyle = rgba(col, 0.32 * k); ctx.lineWidth = 1.4;
      for (i = 0; i < st.arcs.length; i++) {
        a = st.arcs[i];
        var ax = a.x * 0.55 - (cam.x - OT.fmt.cx) * cam.s * d2, ay = a.y * 0.55 - (cam.y - OT.fmt.cy) * cam.s * d2, ar = a.r * 0.6 * cam.s;
        ctx.beginPath(); ctx.arc(ax, ay, ar, a.a0 + t * 0.05, a.a0 + t * 0.05 + a.span); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(ax - 10, ay); ctx.lineTo(ax + 10, ay); ctx.moveTo(ax, ay - 10); ctx.lineTo(ax, ay + 10); ctx.stroke();
      }
      ctx.setLineDash([]);
      // scan sweep: a faint horizontal band travelling down every 7 s
      var u = mod(t / 7, 1), by = -60 + u * (H + 120);
      var lg = ctx.createLinearGradient(0, by - 90, 0, by);
      lg.addColorStop(0, rgba(col, 0)); lg.addColorStop(1, rgba(col, 0.11 * k));
      ctx.fillStyle = lg; ctx.fillRect(0, by - 90, W, 90);
      ctx.fillStyle = rgba(col, 0.3 * k); ctx.fillRect(0, by, W, 1.5);
    },
  };

  // ---- paper (light world)
  TR.paper = {
    canvas: true,
    build: function () {
      var fib = [], i;
      for (i = 0; i < 520; i++) fib.push({ x: HS(i, 3.3) * 2200, y: HS(i, 5.7) * 1300, l: 5 + HS(i, 7.9) * 16, a: HS(i, 2.9) * 3.1416, o: 0.25 + HS(i, 9.7) * 0.75 });
      var blobs = [];
      for (i = 0; i < 6; i++) blobs.push({ x: HS(i, 4.1) * 1.2 - 0.1, y: HS(i, 6.7) * 1.2 - 0.1, r: 320 + HS(i, 8.9) * 380, ph: HS(i, 1.7) * 6.28, sp: 0.12 + HS(i, 3.9) * 0.16, lite: i % 2 === 0 });
      return { fib: fib, blobs: blobs };
    },
    draw: function (ctx, t, cam, cfg, st) {
      var W = OT.fmt.w, H = OT.fmt.h, k = cfg.intensity, i;
      var shade = cfg.light ? cfg.ink : cfg.stops[2], hi = cfg.light ? [255, 255, 255] : cfg.ink;
      for (i = 0; i < st.blobs.length; i++) {
        var b = st.blobs[i], bx = b.x * W + Math.sin(t * b.sp + b.ph) * 60 + (OT.fmt.cx - cam.x) * cam.s * 0.04, by = b.y * H + Math.cos(t * b.sp * 0.8 + b.ph) * 40 + (OT.fmt.cy - cam.y) * cam.s * 0.04;
        var gr = ctx.createRadialGradient(bx, by, 0, bx, by, b.r), c = b.lite ? hi : shade;
        gr.addColorStop(0, rgba(c, (b.lite ? 0.3 : 0.05) * k)); gr.addColorStop(1, rgba(c, 0));
        ctx.fillStyle = gr; ctx.fillRect(bx - b.r, by - b.r, b.r * 2, b.r * 2);
      }
      // creases: two soft diagonal folds
      for (i = 0; i < 2; i++) {
        var cx0 = (i ? 0.7 : 0.28) * W + (OT.fmt.cx - cam.x) * cam.s * 0.06, gr2 = ctx.createLinearGradient(cx0 - 40, 0, cx0 + 40, 0);
        gr2.addColorStop(0, rgba(shade, 0)); gr2.addColorStop(0.5, rgba(shade, 0.03 * k)); gr2.addColorStop(0.52, rgba(hi, 0.12 * k)); gr2.addColorStop(1, rgba(hi, 0));
        ctx.save(); ctx.translate(W / 2, H / 2); ctx.rotate(0.21 - i * 0.4); ctx.translate(-W / 2, -H / 2);
        ctx.fillStyle = gr2; ctx.fillRect(cx0 - 40, -300, 80, H + 600); ctx.restore();
      }
      // fibres, tiled 2200x1300 with a whisper of parallax
      ctx.lineWidth = 1; ctx.strokeStyle = rgba(shade, 0.16 * k); ctx.beginPath();
      var ox = (OT.fmt.cx - cam.x) * cam.s * 0.05, oy = (OT.fmt.cy - cam.y) * cam.s * 0.05;
      for (i = 0; i < st.fib.length; i++) {
        var f = st.fib[i], x = mod(f.x + ox, 2200) - 100, y = mod(f.y + oy, 1300) - 100;
        ctx.moveTo(x, y); ctx.lineTo(x + Math.cos(f.a) * f.l, y + Math.sin(f.a) * f.l);
      }
      ctx.stroke();
    },
  };

  // ---- aurora
  TR.aurora = {
    canvas: true,
    build: function () {
      var rib = [], i;
      for (i = 0; i < 4; i++) rib.push({ y: 0.3 + i * 0.13 + HS(i, 5.1) * 0.08, amp: 70 + HS(i, 7.3) * 90, f: 0.0018 + HS(i, 2.9) * 0.0016, sp: 0.18 + HS(i, 4.7) * 0.22, ph: HS(i, 1.3) * 6.28, h: 170 + HS(i, 6.1) * 140, mixk: i / 3 });
      return { rib: rib };
    },
    draw: function (ctx, t, cam, cfg, st) {
      var W = OT.fmt.w, H = OT.fmt.h, k = cfg.intensity, r, x;
      ctx.globalCompositeOperation = "lighter";
      var STEP = 8, px = (cam.x - OT.fmt.cx) * 0.08;
      for (r = 0; r < st.rib.length; r++) {
        var R = st.rib[r], col = mix(cfg.glow, cfg.glow2, R.mixk), top = [], bot = [];
        for (x = -STEP; x <= W + STEP; x += STEP) {
          var wx = x + px, yc = R.y * H + R.amp * Math.sin(wx * R.f + t * R.sp + R.ph) + R.amp * 0.5 * Math.sin(wx * R.f * 2.3 - t * R.sp * 1.3) + (OT.fmt.cy - cam.y) * cam.s * 0.03;
          var hh = R.h * (0.65 + 0.55 * noise3(wx / 260, r * 3.1, t * 0.25));
          top.push([x, yc - hh]); bot.push([x, yc]);
        }
        var gr = ctx.createLinearGradient(0, R.y * H - R.amp - R.h, 0, R.y * H + R.amp + 40);
        gr.addColorStop(0, rgba(col, 0)); gr.addColorStop(0.72, rgba(col, (r % 2 ? 0.075 : 0.11) * k)); gr.addColorStop(0.88, rgba(mix(col, cfg.ink, 0.5), 0.15 * k)); gr.addColorStop(1, rgba(col, 0));
        ctx.fillStyle = gr; ctx.beginPath(); ctx.moveTo(top[0][0], top[0][1]);
        var i;
        for (i = 1; i < top.length; i++) ctx.lineTo(top[i][0], top[i][1]);
        for (i = bot.length - 1; i >= 0; i--) ctx.lineTo(bot[i][0], bot[i][1]);
        ctx.closePath(); ctx.fill();
        // curtain rays: hash-varied vertical hairlines under the crest
        ctx.strokeStyle = rgba(mix(col, cfg.ink, 0.35), 0.055 * k); ctx.lineWidth = 2; ctx.beginPath();
        for (i = 0; i < top.length; i += 3) {
          var ray = HS(Math.floor((top[i][0] + px) / STEP) + r * 7001, 1.3);
          if (ray < 0.45) continue;
          ctx.moveTo(top[i][0], bot[i][1] - (bot[i][1] - top[i][1]) * (0.35 + 0.6 * ray)); ctx.lineTo(top[i][0], bot[i][1]);
        }
        ctx.stroke();
      }
    },
  };

  // ---- halftone
  TR.halftone = {
    canvas: true,
    build: function () { return {}; },
    draw: function (ctx, t, cam, cfg, st) {
      var W = OT.fmt.w, H = OT.fmt.h, k = cfg.intensity, S = 26, ang = 0.2618, ca = Math.cos(ang), sa = Math.sin(ang), d = 0.18;
      // light field: a bright source drifting slowly, plus a slow travelling wave
      var lx = W * (0.3 + 0.06 * Math.sin(t * 0.2)), ly = H * (0.36 + 0.05 * Math.cos(t * 0.17));
      var ox = (cam.x - OT.fmt.cx) * cam.s * d, oy = (cam.y - OT.fmt.cy) * cam.s * d;
      var diag = Math.hypot(W, H), n = Math.ceil(diag / S) + 2, i, j;
      ctx.fillStyle = rgba(cfg.glow, 0.26 * k); ctx.beginPath();
      for (j = -n; j <= n; j++) for (i = -n; i <= n; i++) {
        var gx = (i * S - mod(ox, S)), gy = (j * S - mod(oy, S));
        var x = OT.fmt.cx + gx * ca - gy * sa, y = OT.fmt.cy + gx * sa + gy * ca;
        if (x < -S || x > W + S || y < -S || y > H + S) continue;
        var dist = Math.hypot(x - lx, y - ly) / (diag * 0.62);
        var f = Math.max(0, 1 - dist) * 0.9 + 0.22 * (0.5 + 0.5 * Math.sin(x * 0.006 + y * 0.004 - t * 0.5));
        var r = S * 0.5 * Math.min(1, f) * 0.68;
        if (r < 0.7) continue;
        ctx.moveTo(x + r, y); ctx.arc(x, y, r, 0, 6.2832);
      }
      ctx.fill();
    },
  };

  // ------------------------------------------------------------------ DOM wiring
  var state = { cfg: null, bokeh: null, bokehFront: null, ctx: null, canvas: null, st: null };
  B.state = state;

  // Apply the resolved config to the template's DOM. Idempotent; call from setup().
  B.init = function init(src) {
    var cfg = state.cfg = B.config(src);
    var q = function (s) { return document.querySelector(s); };
    var bg = q("#bg"), g1 = q("#glow1"), g2 = q("#glow2"), dots = q("#dots"), vig = q("#vignette"), world = q("#world"), stage = q("#stage");
    var s = cfg.stops;
    if (bg) bg.style.background = "radial-gradient(120% 95% at 50% 46%, " + rgba(s[0], 1) + " 0%, " + rgba(s[1], 1) + " 46%, " + rgba(s[2], 1) + " 100%)";
    var clear = rgba(s[1], 0);
    if (g1) g1.style.background = "radial-gradient(circle, " + rgba(cfg.glow, cfg.glowAlpha) + " 0%, " + rgba(cfg.glow, cfg.glowAlpha * 0.47) + " 32%, " + rgba(cfg.glow, cfg.glowAlpha * 0.12) + " 55%, " + clear + " 72%)";
    if (g2) g2.style.background = "radial-gradient(circle, " + rgba(cfg.glow2, cfg.glow2Alpha) + " 0%, " + rgba(cfg.glow2, cfg.glow2Alpha * 0.4) + " 40%, " + clear + " 70%)";
    if (vig) {
      vig.setAttribute("data-layout-ignore", "");
      vig.style.background = "radial-gradient(115% 100% at 50% 50%, " + rgba(cfg.vignette, 0) + " 55%, " + rgba(cfg.vignette, cfg.vignetteAlpha) + " 100%)";
    }
    B.dotsCSS = "radial-gradient(circle, " + rgba(cfg.grid, cfg.gridAlpha) + " 1.7px, " + rgba(cfg.grid, 0) + " 2.4px)";
    var tr = TR[cfg.treatment];
    if (dots) {
      if (tr.dom) dots.style.backgroundImage = B.dotsCSS; else dots.style.display = "none";
    }
    var corners = document.querySelectorAll(".corner");
    for (var i = 0; i < corners.length; i++) {
      if (!cfg.corners) corners[i].style.display = "none"; else corners[i].style.borderColor = rgba(cfg.ink, 0.32);
    }
    if (tr.canvas && stage && world && !state.canvas) {
      var cv = document.createElement("canvas");
      cv.id = "bgfx"; cv.width = OT.fmt.w; cv.height = OT.fmt.h;
      cv.setAttribute("data-layout-ignore", ""); cv.setAttribute("data-backdrop", "");
      cv.style.cssText = "position:absolute;left:0;top:0;width:100%;height:100%;display:block;pointer-events:none";
      stage.insertBefore(cv, world);
      state.canvas = cv; state.ctx = cv.getContext("2d");
      state.st = tr.build(cfg);
    }
    if (tr.dom && q("#bokeh") && OT.atmos && OT.atmos.bokeh) {
      state.bokeh = OT.atmos.bokeh({ total: 14, frontStart: 14, colors: cfg.bokeh.map(rgb), backEl: q("#bokeh"), frontEl: q("#bokehFront"),
        back: { d: [0.12, 0.28], wx: [-1500, 5200], wy: [-800, 2700], r: [26, 60], a: [0.05, 0.08] }, front: { d: [1, 0], wx: [0, 1], wy: [0, 1], r: [1, 1], a: [0, 0] } });
    }
    return cfg;
  };

  // Per-frame draw. Pure function of (t, cam) plus the config chosen in init().
  B.render = function render(t, cam) {
    var cfg = state.cfg || B.init(), tr = TR[cfg.treatment];
    if (tr.dom) {
      var dots = document.querySelector("#dots");
      if (dots && OT.atmos) OT.atmos.renderDots(dots, OT.cam && OT.cam.vel ? OT.cam.vel(t) : 0, B.dotsCSS, { color: rgb(cfg.grid) });
      if (state.bokeh && OT.atmos) OT.atmos.renderBokeh(state.bokeh, t, cam, OT.cam && OT.cam.vel ? OT.cam.vel(t) : 0);
      return;
    }
    B.drawTo(state.ctx, cfg.treatment, t, cam, cfg, state.st);
  };

  // Pure draw entry, also used by tests and tooling with a fake ctx.
  B.drawTo = function drawTo(ctx, name, t, cam, cfg, st) {
    var tr = TR[name];
    if (!tr || !tr.canvas) return;
    st = st || tr.build(cfg);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalCompositeOperation = "source-over";
    ctx.clearRect(0, 0, OT.fmt.w, OT.fmt.h);
    ctx.save();
    tr.draw(ctx, t, cam, cfg, st);
    ctx.restore();
    ctx.globalCompositeOperation = "source-over";
    return st;
  };
  B.build = function build(name, cfg) { var tr = TR[name]; return tr && tr.build ? tr.build(cfg) : null; };
})(window.OT);
