/*
 * ot-3d.js — lit-polygon 3D rendering for a projected hero object: a configurable directional
 * light + material (shade), a pool of z-sorted <polygon> faces, a convex-hull cast shadow, and a
 * motion-blur trail ribbon. The hero object's own fold/geometry (e.g. a paper plane's fold states)
 * is brand data and lives in the brand's hero file — this module only projects and paints faces it is given.
 */
(function (OT) {
  "use strict";
  OT.threeD = OT.threeD || {};

  // a directional light + two-tone material; returns { shade(n), creaseRGB, strokeWidthK }
  OT.threeD.material = function material(cfg) {
    var LIGHT = OT.norm(cfg.dir);
    var HALF = OT.norm([LIGHT[0], LIGHT[1], LIGHT[2] + 1]);
    var LIT = cfg.lit, SHADE = cfg.shade;
    var ambient = cfg.ambient != null ? cfg.ambient : 0.42;
    var diffuse = cfg.diffuse != null ? cfg.diffuse : 0.75;
    var specPow = cfg.specPow != null ? cfg.specPow : 40;
    var specK = cfg.spec != null ? cfg.spec : 0.5;
    function shade(n) {
      if (n[2] < 0) n = [-n[0], -n[1], -n[2]];
      var df = Math.max(0, OT.dot(n, LIGHT));
      var b = OT.clamp(ambient + diffuse * df, 0, 1);
      var g = Math.pow(Math.max(0, OT.dot(n, HALF)), specPow) * specK;
      var c = LIT.map(function (v, i) { return OT.clamp(Math.round(OT.lerp(SHADE[i], v, b) + 255 * g), 0, 255); });
      return "rgb(" + c[0] + "," + c[1] + "," + c[2] + ")";
    }
    return { shade: shade, creaseRGB: cfg.creaseRGB || "128,128,128", strokeWidthK: cfg.strokeWidthK != null ? cfg.strokeWidthK : 1.4 };
  };

  // a pool of `count` <g> wrappers, each holding `facesPerItem` <polygon> children
  OT.threeD.makePool = function makePool(parent, count, facesPerItem, faceAttrs) {
    var slots = [];
    for (var i = 0; i < count; i++) {
      var g = OT.el("g", {}, parent), faces = [];
      for (var j = 0; j < facesPerItem; j++) faces.push(OT.el("polygon", faceAttrs || {}, g));
      slots.push({ g: g, faces: faces });
    }
    return slots;
  };

  // rawFaces: array of {pts:[[x,y,z],...], flap?, fold?} in world space (brand-supplied geometry).
  // Projects, z-sorts (painter's algorithm), and paints each face via material.shade(normal).
  OT.threeD.drawFaces = function drawFaces(slot, rawFaces, cam, opacity, mat) {
    if (!rawFaces || opacity <= 0.001) { slot.g.setAttribute("display", "none"); return; }
    slot.g.setAttribute("display", "inline");
    slot.g.setAttribute("opacity", opacity.toFixed(3));
    var faces = rawFaces.map(function (f) {
      var n = OT.norm(OT.cross(OT.sub(f.pts[1], f.pts[0]), OT.sub(f.pts[2], f.pts[0])));
      var z = f.pts.reduce(function (a, p) { return a + p[2]; }, 0) / f.pts.length + (f.flap ? 0.8 : 0);
      return { scr: f.pts.map(function (p) { return OT.project(p, cam); }), n: n, z: z, flap: f.flap, fold: f.fold || 0 };
    });
    faces.sort(function (a, b) { return a.z - b.z; });
    for (var j = 0; j < slot.faces.length; j++) {
      var poly = slot.faces[j], f = faces[j];
      if (!f) { poly.setAttribute("display", "none"); continue; }
      poly.setAttribute("display", "inline");
      poly.setAttribute("points", f.scr.map(function (p) { return p[0].toFixed(1) + "," + p[1].toFixed(1); }).join(" "));
      poly.setAttribute("fill", mat.shade(f.n));
      var creased = faces.length > 1 ? 1 : 0;
      poly.setAttribute("stroke", "rgba(" + mat.creaseRGB + "," + (0.55 * creased).toFixed(2) + ")");
      poly.setAttribute("stroke-width", (mat.strokeWidthK * cam.s).toFixed(2));
    }
  };

  // convex hull (monotone chain) of the flattened, offset silhouette of rawFaces, cast as a drop shadow.
  OT.threeD.drawShadow = function drawShadow(poly, rawFaces, z, cam, opts) {
    if (!rawFaces) { poly.setAttribute("display", "none"); return; }
    opts = opts || {};
    var zOff = opts.zOff != null ? opts.zOff : 70;
    var dxK = opts.dxK != null ? opts.dxK : 0.34, dyK = opts.dyK != null ? opts.dyK : 0.62;
    var pxK = opts.pxK != null ? opts.pxK : 0.3, pyK = opts.pyK != null ? opts.pyK : 0.5;
    var opBase = opts.opBase != null ? opts.opBase : 0.55, opK = opts.opK != null ? opts.opK : 0.0022;
    var opMin = opts.opMin != null ? opts.opMin : 0.18, opMax = opts.opMax != null ? opts.opMax : 0.55;
    var h = z + zOff, dx = h * dxK, dy = h * dyK;
    var pts = [];
    rawFaces.forEach(function (f) { f.pts.forEach(function (p) { pts.push(OT.w2s(p[0] + dx + p[2] * pxK, p[1] + dy + p[2] * pyK, cam)); }); });
    pts.sort(function (a, b) { return a[0] - b[0] || a[1] - b[1]; });
    function cr(o, a, b) { return (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]); }
    var lo = [], up = [], p, i;
    for (i = 0; i < pts.length; i++) { p = pts[i]; while (lo.length >= 2 && cr(lo[lo.length - 2], lo[lo.length - 1], p) <= 0) lo.pop(); lo.push(p); }
    for (i = pts.length - 1; i >= 0; i--) { p = pts[i]; while (up.length >= 2 && cr(up[up.length - 2], up[up.length - 1], p) <= 0) up.pop(); up.push(p); }
    var hull = lo.slice(0, -1).concat(up.slice(0, -1));
    poly.setAttribute("display", "inline");
    poly.setAttribute("points", hull.map(function (pt) { return pt[0].toFixed(1) + "," + pt[1].toFixed(1); }).join(" "));
    poly.setAttribute("opacity", OT.clamp(opBase - z * opK, opMin, opMax).toFixed(3));
  };

  // motion-blur ribbon: fn(tt) -> {x,y,psi,sc,z}|null samples a moving object's pose over [t0,t1].
  OT.threeD.drawTrail = function drawTrail(slot, fn, t0, t1, t, cam, opts) {
    opts = opts || {};
    var width = opts.width, tailLen = opts.tailLen != null ? opts.tailLen : 0, zFlatten = opts.zFlatten != null ? opts.zFlatten : 0.8;
    var N = opts.N != null ? opts.N : 26, minSpan = opts.minSpan != null ? opts.minSpan : 0.02, lookback = opts.lookback != null ? opts.lookback : 0.4;
    var a = Math.max(t0, t - lookback), b = Math.min(t, t1);
    if (b - a < minSpan) { slot.path.setAttribute("d", ""); return; }
    var pts = [];
    for (var i = 0; i <= N; i++) {
      var tt = a + ((b - a) * i) / N, s = fn(tt);
      if (!s) continue;
      var back = tailLen * s.sc;
      pts.push(OT.project([s.x - Math.cos(s.psi) * back, s.y - Math.sin(s.psi) * back, s.z * zFlatten], cam));
    }
    if (pts.length < 3) { slot.path.setAttribute("d", ""); return; }
    var L = [], R = [];
    for (i = 0; i < pts.length; i++) {
      var p0 = pts[Math.max(0, i - 1)], p1 = pts[Math.min(pts.length - 1, i + 1)];
      var dx = p1[0] - p0[0], dy = p1[1] - p0[1]; var l = Math.hypot(dx, dy) || 1; dx /= l; dy /= l;
      var u = i / (pts.length - 1), w = width * cam.s * Math.pow(u, 0.9) * 0.5;
      L.push([pts[i][0] - dy * w, pts[i][1] + dx * w]); R.push([pts[i][0] + dy * w, pts[i][1] - dx * w]);
    }
    var d = "M" + L.map(function (p) { return p[0].toFixed(1) + " " + p[1].toFixed(1); }).join(" L") + " L" + R.slice().reverse().map(function (p) { return p[0].toFixed(1) + " " + p[1].toFixed(1); }).join(" L") + " Z";
    slot.path.setAttribute("d", d);
    var f = pts[0], last = pts[pts.length - 1];
    slot.lg.setAttribute("x1", f[0].toFixed(1)); slot.lg.setAttribute("y1", f[1].toFixed(1));
    slot.lg.setAttribute("x2", last[0].toFixed(1)); slot.lg.setAttribute("y2", last[1].toFixed(1));
  };

  // a pool of `count` gradient-filled <path> ribbons for drawTrail, each with its own <linearGradient>
  OT.threeD.makeTrailPool = function makeTrailPool(parent, count, gradStops, defsParent) {
    var slots = [];
    for (var i = 0; i < count; i++) {
      var lg = OT.el("linearGradient", { id: "tg" + i, gradientUnits: "userSpaceOnUse" }, defsParent);
      (gradStops || []).forEach(function (st) { OT.el("stop", st, lg); });
      var path = OT.el("path", { fill: "url(#tg" + i + ")" }, parent);
      slots.push({ lg: lg, path: path });
    }
    return slots;
  };
})(window.OT);
