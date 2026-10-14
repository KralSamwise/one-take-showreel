/*
 * ot-fx.js — time-keyed FX events (spark burst / expanding ring / radial flash), rendered every
 * frame into a fixed-size pool of pre-created SVG shapes so no elements are created after boot.
 * All colors and pool sizes are supplied by the brand at OT.fx.initPools(); nothing brand-specific
 * is hardcoded here. A canvas renderer is a later-batch addition (OT.fx.renderCanvas).
 */
(function (OT) {
  "use strict";
  OT.fx = OT.fx || {};

  var BURSTS = [], RINGS = [], FLASHES = [];
  var sparkSlots = [], ringSlots = [], flashSlots = [];
  var sparkAlt = "#ffffff";

  OT.fx.initPools = function initPools(opts) {
    opts = opts || {};
    var sparkN = opts.sparks != null ? opts.sparks : 90;
    var ringN = opts.rings != null ? opts.rings : 6;
    var flashN = opts.flashes != null ? opts.flashes : 3;
    sparkAlt = opts.sparkAltColor || "#ffffff";
    sparkSlots = [];
    for (var i = 0; i < sparkN; i++) sparkSlots.push(OT.el("circle", { r: "0", fill: opts.sparkFill || "#fff" }, opts.sparksEl));
    ringSlots = [];
    for (var j = 0; j < ringN; j++) ringSlots.push(OT.el("circle", { r: "0", fill: "none", stroke: opts.ringStroke || "#fff", "stroke-width": "3" }, opts.ringsEl));
    flashSlots = [];
    for (var k = 0; k < flashN; k++) flashSlots.push(OT.el("circle", { r: "0", fill: opts.flashFill || "url(#flashGrad)" }, opts.flashesEl));
  };

  OT.fx.burst = function burst(o) {
    BURSTS.push({ t0: o.t0, x: o.x, y: o.y, n: o.n, speed: o.speed, life: o.life, seed: o.seed, dir: o.dir == null ? null : o.dir, spread: o.spread || Math.PI, color: o.color || "#ffffff" });
  };
  OT.fx.ring = function ring(o) {
    RINGS.push({ t0: o.t0, x: o.x, y: o.y, r0: o.r0, r1: o.r1, life: o.life, w: o.w != null ? o.w : 4, inward: !!o.inward });
  };
  OT.fx.flash = function flash(o) {
    FLASHES.push({ t0: o.t0, x: o.x, y: o.y, r0: o.r0, r1: o.r1, life: o.life, peak: o.peak != null ? o.peak : 1 });
  };

  OT.fx.renderSVG = function renderSVG(t, cam) {
    var k = 0, e, i;
    for (i = 0; i < BURSTS.length; i++) {
      e = BURSTS[i];
      var tau = t - e.t0;
      if (tau < 0 || tau > e.life) continue;
      for (var b = 0; b < e.n && k < sparkSlots.length; b++, k++) {
        var h1 = OT.hash(e.seed * 31 + b * 7.13), h2 = OT.hash(e.seed * 17 + b * 3.71), h3 = OT.hash(e.seed * 5 + b * 11.3);
        var ang = e.dir == null ? h1 * Math.PI * 2 : e.dir + (h1 - 0.5) * 2 * e.spread;
        var sp = e.speed * (0.35 + 0.65 * h2), lifeI = e.life * (0.55 + 0.45 * h3);
        var q = OT.clamp(tau / lifeI, 0, 1);
        var travel = (sp * lifeI * (1 - Math.pow(1 - q, 2.2))) / 2.2;
        var x = e.x + Math.cos(ang) * travel, y = e.y + Math.sin(ang) * travel + 60 * q * q;
        var p = OT.w2s(x, y, cam);
        var c = sparkSlots[k];
        c.setAttribute("cx", p[0].toFixed(1)); c.setAttribute("cy", p[1].toFixed(1));
        c.setAttribute("r", ((1.6 + 3.2 * h2) * (1 - q) * cam.s).toFixed(2));
        c.setAttribute("fill", h3 > 0.55 ? e.color : sparkAlt);
        c.setAttribute("opacity", (q >= 1 ? 0 : 0.95 * (1 - q * q)).toFixed(3));
      }
    }
    for (; k < sparkSlots.length; k++) sparkSlots[k].setAttribute("r", "0");

    var r = 0;
    for (i = 0; i < RINGS.length; i++) {
      e = RINGS[i];
      var qr = (t - e.t0) / e.life;
      if (qr < 0 || qr > 1 || r >= ringSlots.length) continue;
      var pr = OT.w2s(e.x, e.y, cam), cr = ringSlots[r++];
      var qe = e.inward ? OT.ease("power2.in")(qr) : OT.ease("expo.out")(qr);
      cr.setAttribute("cx", pr[0].toFixed(1)); cr.setAttribute("cy", pr[1].toFixed(1));
      cr.setAttribute("r", (OT.lerp(e.r0, e.r1, qe) * cam.s).toFixed(1));
      cr.setAttribute("stroke-width", ((e.inward ? e.w * (0.4 + qr) : e.w * (1 - qr)) * cam.s + 0.3).toFixed(2));
      cr.setAttribute("opacity", (e.inward ? 0.75 * Math.pow(qr, 1.4) * (qr > 0.96 ? 0 : 1) : 0.9 * (1 - qr)).toFixed(3));
    }
    for (; r < ringSlots.length; r++) ringSlots[r].setAttribute("r", "0");

    var f = 0;
    for (i = 0; i < FLASHES.length; i++) {
      e = FLASHES[i];
      var qf = (t - e.t0) / e.life;
      if (qf < 0 || qf > 1 || f >= flashSlots.length) continue;
      var pf = OT.w2s(e.x, e.y, cam), cf = flashSlots[f++];
      cf.setAttribute("cx", pf[0].toFixed(1)); cf.setAttribute("cy", pf[1].toFixed(1));
      cf.setAttribute("r", (OT.lerp(e.r0, e.r1, OT.ease("power3.out")(qf)) * cam.s).toFixed(1));
      cf.setAttribute("opacity", (e.peak * Math.pow(1 - qf, 1.6)).toFixed(3));
    }
    for (; f < flashSlots.length; f++) flashSlots[f].setAttribute("r", "0");
  };

  // hex ("#fff"/"#ffffff") -> "r,g,b", for building rgba() strings (canvas colors are always hex here)
  function hexRGB(hex) {
    var h = (hex || "#ffffff").replace("#", "");
    if (h.length === 3) h = h.split("").map(function (c) { return c + c; }).join("");
    var n = parseInt(h, 16);
    return ((n >> 16) & 255) + "," + ((n >> 8) & 255) + "," + (n & 255);
  }
  function rgbaStr(hex, a) { return "rgba(" + hexRGB(hex) + "," + a.toFixed(3) + ")"; }
  var TAU = Math.PI * 2;

  // world<->canvas transform for a 2D context; must stay consistent with OT.cam.applyWorld (the
  // #world CSS transform) and OT.w2s — same translate+scale, just expressed as a canvas matrix.
  OT.fx.worldTf = function worldTf(ctx, cam) {
    ctx.setTransform(cam.s, 0, 0, cam.s, OT.fmt.cx - cam.x * cam.s, OT.fmt.cy - cam.y * cam.s);
  };

  // Canvas-pool FX renderer: draws the SAME registered burst/ring/flash events as renderSVG, in the
  // manner of the reference canvas-fx implementation this engine draws on (additive "lighter"
  // compositing; a radial-gradient flash; rings; and bursts with gravity + a two-color mix) — for a
  // brand that wants a <canvas> FX layer instead of (or alongside) the SVG pools. Pure function of
  // (t, cam) + the registered events; no pooling needed since canvas redraws from scratch every
  // frame. renderSVG ignores the optional fields below, so a brand mixing both renderers sees no
  // change to its SVG output.
  // Optional per-event fields (all colors are hex strings): burst.grav (world-units, default 260),
  // burst.col2 (secondary spark color, default the pool's sparkAltColor), ring.ringColor (default
  // "#ffffff"), flash.flashColor (default "#ffffff").
  OT.fx.renderCanvas = function renderCanvas(ctx, t, cam) {
    // Contract: renderCanvas must leave ctx exactly as it found it (transform AND
    // globalCompositeOperation). It sets a world-space transform via OT.fx.worldTf to draw, but a
    // caller's clearRect on the NEXT frame runs before this function runs again — any leftover
    // transform makes that clearRect clear the wrong (moved/scaled) screen rect, leaving FX drawn
    // outside it un-erased forever (a fan of stacked rings/bursts persisting through to the final
    // frame). ctx.save()/restore() around all drawing guarantees this regardless of what worldTf sets.
    ctx.save();
    OT.fx.worldTf(ctx, cam);
    var prevOp = ctx.globalCompositeOperation;
    ctx.globalCompositeOperation = "lighter";
    var i, e, q;
    for (i = 0; i < FLASHES.length; i++) {
      e = FLASHES[i];
      q = (t - e.t0) / e.life;
      if (q < 0 || q > 1) continue;
      var peak = e.peak != null ? e.peak : 1;
      var fcol = e.flashColor || "#ffffff";
      var r = Math.max(OT.lerp(e.r0, e.r1, OT.ease("power3.out")(q)), 0.001);
      var gr = ctx.createRadialGradient(e.x, e.y, 0, e.x, e.y, r);
      gr.addColorStop(0, rgbaStr(fcol, peak * Math.pow(1 - q, 1.6)));
      gr.addColorStop(0.35, rgbaStr(fcol, 0.4 * peak * Math.pow(1 - q, 1.6)));
      gr.addColorStop(1, rgbaStr(fcol, 0));
      ctx.fillStyle = gr;
      ctx.beginPath(); ctx.arc(e.x, e.y, r, 0, TAU); ctx.fill();
    }
    for (i = 0; i < RINGS.length; i++) {
      e = RINGS[i];
      q = (t - e.t0) / e.life;
      if (q < 0 || q > 1) continue;
      var qe = e.inward ? OT.ease("power2.in")(q) : OT.ease("expo.out")(q);
      var rcol = e.ringColor || "#ffffff";
      // divided by cam.s (matches the reference canvas-fx implementation this engine draws on) so
      // the on-screen stroke stays constant-width under zoom: the canvas transform (OT.fx.worldTf)
      // already scales world-space drawing by cam.s, so pre-dividing here cancels that scaling for
      // the stroke specifically.
      ctx.lineWidth = ((e.inward ? e.w * (0.4 + q) : e.w * (1 - q)) + 0.4) / cam.s;
      ctx.strokeStyle = rgbaStr(rcol, e.inward ? 0.75 * Math.pow(q, 1.4) * (q > 0.96 ? 0 : 1) : 0.9 * (1 - q));
      ctx.beginPath(); ctx.arc(e.x, e.y, OT.lerp(e.r0, e.r1, qe), 0, TAU); ctx.stroke();
    }
    for (i = 0; i < BURSTS.length; i++) {
      e = BURSTS[i];
      var tau = t - e.t0;
      if (tau < 0 || tau > e.life) continue;
      var grav = e.grav != null ? e.grav : 260;
      var col2 = e.col2 || sparkAlt;
      for (var b = 0; b < e.n; b++) {
        var h1 = OT.hash(e.seed * 31 + b * 7.13), h2 = OT.hash(e.seed * 17 + b * 3.71), h3 = OT.hash(e.seed * 5 + b * 11.3);
        var ang = e.dir == null ? h1 * TAU : e.dir + (h1 - 0.5) * 2 * e.spread;
        var sp = e.speed * (0.35 + 0.65 * h2), lifeI = e.life * (0.55 + 0.45 * h3);
        var bq = OT.clamp(tau / lifeI, 0, 1);
        if (bq >= 1) continue;
        var travel = (sp * lifeI * (1 - Math.pow(1 - bq, 2.4))) / 2.4;
        var x = e.x + Math.cos(ang) * travel, y = e.y + Math.sin(ang) * travel + grav * bq * bq;
        ctx.fillStyle = rgbaStr(h3 > 0.5 ? e.color : col2, 0.95 * (1 - bq * bq));
        var rad = ((1.4 + 2.8 * h2) * (1 - bq)) / Math.sqrt(cam.s);
        ctx.beginPath(); ctx.arc(x, y, rad, 0, TAU); ctx.fill();
      }
    }
    ctx.globalCompositeOperation = prevOp;
    ctx.restore();
  };
})(window.OT);
