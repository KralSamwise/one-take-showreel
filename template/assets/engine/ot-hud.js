/*
 * ot-hud.js — HUD primitives: SMPTE-style timecode text, a blinking rec dot, a cascading
 * status-meter label driver, N-dot status indicators, and the caption slide-in/out (capIn).
 * Brand strings/colors/selectors are always parameters; nothing brand-specific is hardcoded here.
 */
(function (OT) {
  "use strict";
  OT.hud = OT.hud || {};

  OT.hud.timecode = function timecode(t, fps) {
    var fr = Math.floor(t * fps + 1e-4), ss = Math.floor(fr / fps), ff = fr % fps;
    return "00:00:" + String(ss).padStart(2, "0") + ":" + String(ff).padStart(2, "0");
  };

  OT.hud.recBlink = function recBlink(t, opts) {
    opts = opts || {};
    var period = opts.period != null ? opts.period : 1.0, duty = opts.duty != null ? opts.duty : 0.62;
    var onOp = opts.on != null ? opts.on : 1, offOp = opts.off != null ? opts.off : 0.25;
    return (t % period) < duty ? onOp : offOp;
  };

  // rules: ordered [{test:()=>bool, label:string|()=>string}, ...]; later matches win (mirrors an
  // imperative if-cascade where each condition can overwrite the previous label).
  OT.hud.cascadeLabel = function cascadeLabel(rules, fallback) {
    var label = fallback;
    for (var i = 0; i < rules.length; i++) {
      if (rules[i].test()) label = typeof rules[i].label === "function" ? rules[i].label() : rules[i].label;
    }
    return label;
  };

  OT.hud.statusDots = function statusDots(dotEls, onFlags, onColor, offColor, onShadow) {
    dotEls.forEach(function (el, i) {
      var on = onFlags[i];
      el.style.background = on ? onColor : "transparent";
      el.style.borderColor = on ? onColor : offColor;
      el.style.boxShadow = on ? onShadow : "none";
    });
  };

  // Per-aspect HUD layout: a pure function of OT.fmt (no time dependence), writes inline px
  // left/top/right/bottom onto whatever elements are passed. Call once from setup(). Any part may
  // be null (skipped). parts = {corners:[tl,tr,bl,br], brand, timecode, meter, captions}.
  //   16:9 — corners sit on the safe-box corners; brand/timecode/meter/captions reproduce the
  //   proven reference 16:9 reel's HUD placement (~6.46% side inset; ~5.93% top / 6.11% meter-bottom /
  //   8.52% caption-bottom of frame height) — comfortably inside the 5%-margin safe box.
  //   9:16 (method.md §7) — brand at the safe top-left, timecode at the safe top-right, the meter
  //   dropped below the timecode, captions in the safe bottom band, left-aligned.
  // opts overrides any inset: {xInset, topInset, meterBottom, captionBottom} for 16:9;
  // {meterTop} for 9:16.
  OT.hud.layout = function layout(parts, opts) {
    parts = parts || {};
    opts = opts || {};
    var safe = OT.fmt.safe;
    function place(el, css) {
      if (!el) return;
      el.style.left = css.left != null ? css.left.toFixed(1) + "px" : "";
      el.style.right = css.right != null ? css.right.toFixed(1) + "px" : "";
      el.style.top = css.top != null ? css.top.toFixed(1) + "px" : "";
      el.style.bottom = css.bottom != null ? css.bottom.toFixed(1) + "px" : "";
    }
    if (parts.corners) {
      var c = parts.corners;
      place(c[0], { left: safe.l, top: safe.t });
      place(c[1], { right: safe.r, top: safe.t });
      place(c[2], { left: safe.l, bottom: safe.b });
      place(c[3], { right: safe.r, bottom: safe.b });
    }
    if (OT.fmt.aspect === "9:16") {
      place(parts.brand, { left: safe.l, top: safe.t });
      place(parts.timecode, { right: safe.r, top: safe.t });
      place(parts.meter, { right: safe.r, top: opts.meterTop != null ? opts.meterTop : safe.t + 0.05 * OT.fmt.h });
      place(parts.captions, { left: safe.l, bottom: safe.b });
    } else {
      var xIn = opts.xInset != null ? opts.xInset : 0.0645833 * OT.fmt.w;
      var topIn = opts.topInset != null ? opts.topInset : 0.0592593 * OT.fmt.h;
      var meterB = opts.meterBottom != null ? opts.meterBottom : 0.0611111 * OT.fmt.h;
      var capB = opts.captionBottom != null ? opts.captionBottom : 0.0851852 * OT.fmt.h;
      place(parts.brand, { left: xIn, top: topIn });
      place(parts.timecode, { right: xIn, top: topIn });
      place(parts.meter, { right: xIn, bottom: meterB });
      place(parts.captions, { left: xIn, bottom: capB });
    }
    return { safe: safe };
  };

  // caption reveal: small label slides in, the line clips up-in then clips up-out. Verbatim behaviour.
  OT.hud.capIn = function capIn(tl, sel, t0, t1) {
    tl.fromTo(sel + " small", { opacity: 0, x: -16 }, { opacity: 1, x: 0, duration: 0.35, ease: "power3.out" }, t0);
    tl.fromTo(sel + " .ln span", { yPercent: 110 }, { yPercent: 0, duration: 0.55, ease: "expo.out" }, t0 + 0.05);
    tl.to(sel + " .ln span", { yPercent: -110, duration: 0.32, ease: "power3.in" }, t1 - 0.3);
    tl.to(sel + " small", { opacity: 0, duration: 0.25 }, t1 - 0.22);
  };
})(window.OT);
