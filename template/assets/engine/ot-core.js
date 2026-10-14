/*
 * ot-core.js — One-Take engine core.
 * Math + easing + track evaluators, vec3 helpers, DOM/SVG factories, composition format,
 * palette readers, font-readiness check, and the boot sequence. Classic script; defines the
 * single global namespace `OT`. Contains no brand data (no colors, copy, path data, or
 * resolution/duration literals) — everything here is generic and reused by every brand.
 */
(function (global) {
  "use strict";
  var OT = global.OT || (global.OT = {});

  // ------------------------------------------------------------------ math / easing / tracks
  var EZ = {};
  OT.ease = function ease(n) { return EZ[n] || (EZ[n] = gsap.parseEase(n)); };
  OT.clamp = function clamp(v, a, b) { return v < a ? a : v > b ? b : v; };
  OT.lerp = function lerp(a, b, t) { return a + (b - a) * t; };
  OT.lerpV = function lerpV(a, b, t) { return typeof a === "number" ? OT.lerp(a, b, t) : a.map(function (v, i) { return OT.lerp(v, b[i], t); }); };
  OT.prog = function prog(t, t0, t1, e) { var p = OT.clamp((t - t0) / (t1 - t0), 0, 1); return e ? OT.ease(e)(p) : p; };

  // piecewise linear/eased keyframe track: keys [t, value, easeName?]
  OT.trk = function trk(t, k) {
    if (t <= k[0][0]) return k[0][1];
    for (var i = 1; i < k.length; i++) {
      if (t <= k[i][0]) {
        var p = (t - k[i - 1][0]) / (k[i][0] - k[i - 1][0]);
        return OT.lerpV(k[i - 1][1], k[i][1], k[i][2] ? OT.ease(k[i][2])(p) : p);
      }
    }
    return k[k.length - 1][1];
  };
  // cubic-Hermite track: keys [t, value, velocity]
  OT.herm = function herm(t, k) {
    if (t <= k[0][0]) return k[0][1];
    for (var i = 1; i < k.length; i++) {
      if (t <= k[i][0]) {
        var t0 = k[i - 1][0], p0 = k[i - 1][1], m0 = k[i - 1][2];
        var t1 = k[i][0], p1 = k[i][1], m1 = k[i][2];
        var d = t1 - t0, s = (t - t0) / d, s2 = s * s, s3 = s2 * s;
        return (2 * s3 - 3 * s2 + 1) * p0 + (s3 - 2 * s2 + s) * d * m0 + (-2 * s3 + 3 * s2) * p1 + (s3 - s2) * d * m1;
      }
    }
    return k[k.length - 1][1];
  };
  OT.hash = function hash(n) { var x = Math.sin(n * 127.1 + 311.7) * 43758.5453123; return x - Math.floor(x); };
  OT.angLerp = function angLerp(a, b, t) { var d = ((b - a + Math.PI) % (2 * Math.PI) + 2 * Math.PI) % (2 * Math.PI) - Math.PI; return a + d * t; };
  OT.bez = function bez(P, u) { var v = 1 - u; return [0, 1].map(function (i) { return v * v * v * P[0][i] + 3 * v * v * u * P[1][i] + 3 * v * u * u * P[2][i] + u * u * u * P[3][i]; }); };
  OT.bezD = function bezD(P, u) { var v = 1 - u; return [0, 1].map(function (i) { return 3 * v * v * (P[1][i] - P[0][i]) + 6 * v * u * (P[2][i] - P[1][i]) + 3 * u * u * (P[3][i] - P[2][i]); }); };

  // ------------------------------------------------------------------ vec3
  OT.sub = function sub(a, b) { return [a[0] - b[0], a[1] - b[1], a[2] - b[2]]; };
  OT.cross = function cross(a, b) { return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]; };
  OT.dot = function dot(a, b) { return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]; };
  OT.norm = function norm(a) { var l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };
  OT.rotX = function rotX(p, a) { var c = Math.cos(a), s = Math.sin(a); return [p[0], p[1] * c - p[2] * s, p[1] * s + p[2] * c]; };
  OT.rotY = function rotY(p, a) { var c = Math.cos(a), s = Math.sin(a); return [p[0] * c + p[2] * s, p[1], -p[0] * s + p[2] * c]; };
  OT.rotZ = function rotZ(p, a) { var c = Math.cos(a), s = Math.sin(a); return [p[0] * c - p[1] * s, p[0] * s + p[1] * c, p[2]]; };
  OT.rotAxis = function rotAxis(p, o, u, a) {
    var v = OT.sub(p, o), c = Math.cos(a), s = Math.sin(a), d = OT.dot(u, v), cr = OT.cross(u, v);
    return [o[0] + v[0] * c + cr[0] * s + u[0] * d * (1 - c), o[1] + v[1] * c + cr[1] * s + u[1] * d * (1 - c), o[2] + v[2] * c + cr[2] * s + u[2] * d * (1 - c)];
  };
  OT.DEG = Math.PI / 180;

  // ------------------------------------------------------------------ DOM / SVG
  OT.$ = function $(s) { return document.querySelector(s); };
  var NS = "http://www.w3.org/2000/svg";
  OT.el = function el(tag, attrs, parent) {
    var e = document.createElementNS(NS, tag);
    for (var k in attrs) e.setAttribute(k, attrs[k]);
    if (parent) parent.appendChild(e);
    return e;
  };

  // ------------------------------------------------------------------ format (read once from the root)
  // title-safe box per aspect, as margin FRACTIONS of w/h (never pixel/resolution literals — see the
  // banned-literal rule). 16:9 uses a flat 5% on every side. 9:16's box is a conservative union of the
  // TikTok/Reels/Shorts chrome (top capture bar + caption stack, bottom action rail + caption safe area).
  var SAFE_FRAC = {
    "16:9": { l: 0.05, t: 0.05, r: 0.05, b: 0.05 },
    "9:16": { l: 0.05926, t: 0.12, r: 0.11481, b: 0.22 },
  };
  function computeSafe(w, h, aspect) {
    var f = SAFE_FRAC[aspect];
    var l = f.l * w, t = f.t * h, r = f.r * w, b = f.b * h;
    return { l: l, t: t, r: r, b: b, x: l, y: t, w: w - l - r, h: h - t - b, frac: { l: f.l, t: f.t, r: f.r, b: f.b } };
  }
  var builtInSections = {
    6: [{ name: "action", t0: 0, t1: 2 }, { name: "journey", t0: 2, t1: 4 }, { name: "lockup", t0: 4, t1: 6 }],
    15: [{ name: "action", t0: 0, t1: 4 }, { name: "outcomes", t0: 4, t1: 8 }, { name: "proof", t0: 8, t1: 12 }, { name: "lockup", t0: 12, t1: 15 }],
    30: [{ name: "action", t0: 0, t1: 8 }, { name: "outcomes", t0: 8, t1: 16 }, { name: "proof", t0: 16, t1: 24 }, { name: "lockup", t0: 24, t1: 30 }],
  };
  function readFormat() {
    // w/h/dur are required root attributes per the HyperFrames composition contract (no generic
    // fallback would be meaningful here — an engine default resolution/duration would silently
    // mis-size or mis-time every brand that forgot to set one). Only fps has a spec-given default.
    var root = document.querySelector("[data-composition-id]") || document.getElementById("root");
    var w = parseFloat(root.getAttribute("data-width"));
    var h = parseFloat(root.getAttribute("data-height"));
    var dur = parseFloat(root.getAttribute("data-duration"));
    var fps = parseFloat(root.getAttribute("data-fps")) || 30;
    var bpm = 120, beat = 60 / bpm, bar = 4 * beat;
    var aspect = w > h ? "16:9" : "9:16";
    var len = Math.round(dur);
    var fmt = { w: w, h: h, dur: dur, fps: fps, cx: w / 2, cy: h / 2, aspect: aspect, bpm: bpm, beat: beat, bar: bar, len: len };
    var builtInAnchors = { 6: { launch: 2, impact: 4 }, 15: { launch: 4, turn: 8, impact: 12 }, 30: { launch: 8, turn: 16, impact: 24 } };
    fmt.anchors = builtInAnchors[len] || null;
    var anchorsAttr = root.getAttribute("data-ot-anchors");
    if (anchorsAttr) { try { fmt.anchors = JSON.parse(anchorsAttr); } catch (e) { /* ignore malformed override */ } }
    fmt.sections = builtInSections[len] || null;
    var sectionsAttr = root.getAttribute("data-ot-sections");
    if (sectionsAttr) { try { fmt.sections = JSON.parse(sectionsAttr); } catch (e) { /* ignore malformed override */ } }
    fmt.safe = computeSafe(w, h, aspect);
    fmt.layout = aspect === "9:16" ? "stack" : "row";
    var layoutAttr = root.getAttribute("data-ot-layout");
    if (layoutAttr === "row" || layoutAttr === "stack") fmt.layout = layoutAttr;
    return fmt;
  }
  // Lazy + memoized (NOT computed eagerly at script-load time): HyperFrames' render/check pipeline
  // may evaluate an externally-sourced <script src> before the body DOM is fully attached, even
  // though script tags execute in document order in a normal browser. GSAP tolerates this because
  // it never touches the DOM at load time; reading #root's attributes does not, so it is deferred
  // to first access instead (which happens from OT.boot() or later, once #root certainly exists).
  var _fmt = null;
  Object.defineProperty(OT, "fmt", {
    configurable: true,
    get: function () { return _fmt || (_fmt = readFormat()); },
  });
  OT.B = function B(n) { return n * OT.fmt.beat; };

  // ------------------------------------------------------------------ palette (read once from :root)
  OT.pal = function pal(name) { return getComputedStyle(document.documentElement).getPropertyValue(name).trim(); };
  OT.rgb = function rgb(name) {
    var hex = OT.pal(name).replace("#", "");
    if (hex.length === 3) hex = hex.split("").map(function (c) { return c + c; }).join("");
    var n = parseInt(hex, 16);
    return ((n >> 16) & 255) + "," + ((n >> 8) & 255) + "," + (n & 255);
  };

  // ------------------------------------------------------------------ fonts
  // document.fonts.check() reports true for an unresolved family (silent fallback), so verify by
  // forcing a fallback-to-"serif" in the probe string and comparing measured widths against two
  // different generic families. If the probe matches EITHER generic exactly, it silently fell back.
  function fontReallyLoaded(family, weight) {
    var probe = "mmmmmmmmmmMMMMMMMMMMil000";
    var c = document.createElement("canvas").getContext("2d");
    function widthOf(fam) { c.font = (weight || 400) + ' 72px ' + fam; return c.measureText(probe).width; }
    var target = widthOf('"' + family + '", serif');
    var serifW = widthOf("serif");
    var monoW = widthOf("monospace");
    return Math.abs(target - serifW) > 0.5 && Math.abs(target - monoW) > 0.5;
  }
  var FONT_SPEC_RE = /^\s*(?:(\S+)\s+)?[\d.]+\w*\s+"?([^"]+?)"?\s*$/;
  OT.fontsReady = function fontsReady(specs, onMissingFont) {
    var mode = onMissingFont || "warn";
    return Promise.all((specs || []).map(function (s) { return document.fonts.load(s); }))
      .catch(function () {})
      .then(function () {
        var missing = [];
        (specs || []).forEach(function (s) {
          var m = FONT_SPEC_RE.exec(s);
          var weight = m ? m[1] : null, family = m ? m[2] : s;
          if (!fontReallyLoaded(family, weight)) missing.push(s);
        });
        if (missing.length) {
          var msg = "OT.fontsReady: font(s) not resolved at render time: " + missing.join(", ");
          if (mode === "throw") throw new Error(msg);
          console.warn(msg);
        }
        return missing;
      });
  };

  // ------------------------------------------------------------------ boot
  // fonts -> setup(pools/measurement) -> build(tl) -> pin length at fmt.dur -> register -> seek(0) -> renderAll()
  OT.boot = function boot(cfg) {
    var tl = gsap.timeline({ paused: true, onUpdate: OT.renderAll });
    OT.tl = tl;
    OT._render = cfg.render;
    return OT.fontsReady(cfg.fonts, cfg.onMissingFont).then(function () {
      if (cfg.setup) cfg.setup();
      cfg.build(tl);
      tl.set({}, {}, OT.fmt.dur); // no-op tween at OT.fmt.dur: a FLOOR on tl.duration(), not a pin — a tween
      // that starts late enough can still push tl.duration() past this (confirmed: a 6s cut's sheen tween
      // ends ~6.36s, so tl.duration() > 6). The render's actual length always comes from the root's
      // data-duration (OT.fmt.dur), never from tl.duration() — nothing reads tl.duration() to decide length.
      window.__timelines = window.__timelines || {};
      window.__timelines.main = tl;
      tl.seek(0);
      OT.renderAll();
    });
  };

  // t -> cam -> apply #world transform -> brand render(t, cam). Pure function of tl.time().
  OT.renderAll = function renderAll() {
    if (!OT.tl) return;
    var t = OT.tl.time();
    var cam = OT.cam.at(t);
    OT.cam.applyWorld(cam, OT.$("#world"));
    if (OT._render) OT._render(t, cam);
  };
})(window);
