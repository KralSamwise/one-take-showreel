/*
 * ot-lockup.js — logo-lockup mechanics: stroke-dasharray mask draw-on, comet heads riding a path
 * via getPointAtLength, tile bloom-in, mark exit + wordmark stagger-reveal, generic fade/slam
 * reveal primitives (tagline/url), and an attr-sweep sheen. Every time/color/selector/offset is a
 * parameter; a brand's actual values live in its own acts file, not here.
 */
(function (OT) {
  "use strict";
  OT.lockup = OT.lockup || {};

  // measures each path once, sets a dasharray of [L, L+40] so a dashoffset sweep draws it on
  OT.lockup.initMask = function initMask(selectors) {
    return selectors.map(function (sel) {
      var p = OT.$(sel);
      var L = p.getTotalLength();
      p.setAttribute("stroke-dasharray", (L + 4).toFixed(1) + " " + (L + 40).toFixed(1));
      return { p: p, L: L + 4 };
    });
  };
  OT.lockup.drawMask = function drawMask(mask, progresses) {
    mask.forEach(function (m, i) { m.p.setAttribute("stroke-dashoffset", (m.L * (1 - progresses[i])).toFixed(1)); });
  };

  // a glowing head riding pathEntry (from initMask) at progress q, with a radius ramp-in
  OT.lockup.comet = function comet(el, pathEntry, q, opts) {
    opts = opts || {};
    var backOff = opts.backOff != null ? opts.backOff : 4;
    var rMax = opts.rMax, rMin = opts.rMin != null ? opts.rMin : 0.35;
    var rampT0 = opts.rampT0 != null ? opts.rampT0 : 0, rampT1 = opts.rampT1 != null ? opts.rampT1 : 0.18;
    var ease = opts.ease || "power2.out";
    var on = q > 0 && q < 1;
    if (!on) { el.setAttribute("r", "0"); return; }
    var pt = pathEntry.p.getPointAtLength(Math.max(0, pathEntry.L * q - backOff));
    el.setAttribute("cx", pt.x.toFixed(1)); el.setAttribute("cy", pt.y.toFixed(1));
    var ramp = OT.prog(q, rampT0, rampT1, ease);
    el.setAttribute("r", (rMax * (rMin + (1 - rMin) * ramp)).toFixed(1));
  };

  OT.lockup.tileBloom = function tileBloom(tl, sel, t0, opts) {
    opts = opts || {};
    tl.fromTo(sel,
      { opacity: 0, scale: opts.fromScale != null ? opts.fromScale : 0.22, svgOrigin: opts.svgOrigin },
      { opacity: 1, scale: 1, duration: opts.duration != null ? opts.duration : 0.5, ease: opts.ease || "back.out(1.7)", svgOrigin: opts.svgOrigin },
      t0);
  };

  // the mark slides/scales away, exposing the wordmark clip area beside it
  OT.lockup.markExit = function markExit(tl, sel, t0, opts) {
    opts = opts || {};
    tl.fromTo(sel, { x: 0, y: 0, scale: 1 }, { x: opts.dx, y: opts.dy, scale: opts.scale, duration: opts.duration != null ? opts.duration : 0.5, ease: opts.ease || "power3.inOut" }, t0);
  };

  // per-letter stagger reveal inside an overflow:hidden clip (the "slide from behind" look).
  // opts.layout ("row"|"stack"): row (default, and the ONLY behavior when opts.layout is omitted —
  // preserves the original xPercent -130 -> 0 exactly) slides in horizontally from behind the mark;
  // stack rises up from behind it (yPercent +110 -> 0) — see method.md §7.
  OT.lockup.wordmarkReveal = function wordmarkReveal(tl, sel, t0, opts) {
    opts = opts || {};
    var duration = opts.duration != null ? opts.duration : 0.5;
    var ease = opts.ease || "power4.out";
    var stagger = opts.stagger != null ? opts.stagger : 0.034;
    if (opts.layout === "stack") {
      tl.fromTo(sel + " span",
        { yPercent: opts.yPercentFrom != null ? opts.yPercentFrom : 110, opacity: 0 },
        { yPercent: 0, opacity: 1, duration: duration, ease: ease, stagger: stagger },
        t0);
    } else {
      tl.fromTo(sel + " span",
        { xPercent: opts.xPercentFrom != null ? opts.xPercentFrom : -130, opacity: 0 },
        { xPercent: 0, opacity: 1, duration: duration, ease: ease, stagger: stagger },
        t0);
    }
  };

  // generic fade + vertical-slide reveal (tagline first line, url, ...)
  OT.lockup.reveal = function reveal(tl, sel, t0, opts) {
    opts = opts || {};
    tl.fromTo(sel, { opacity: 0, y: opts.fromY != null ? opts.fromY : 20 }, { opacity: 1, y: 0, duration: opts.duration != null ? opts.duration : 0.5, ease: opts.ease || "power3.out" }, t0);
  };

  // kinetic-beat-slam: blur + oversize pop down to rest (tagline accent word, ...)
  OT.lockup.slamIn = function slamIn(tl, sel, t0, opts) {
    opts = opts || {};
    tl.fromTo(sel,
      { opacity: 0, scale: opts.fromScale != null ? opts.fromScale : 1.35, filter: "blur(" + (opts.fromBlur != null ? opts.fromBlur : 12) + "px)" },
      { opacity: 1, scale: 1, filter: "blur(0px)", duration: opts.duration != null ? opts.duration : 0.5, ease: opts.ease || "expo.out", transformOrigin: opts.transformOrigin || "50% 50%" },
      t0);
  };

  // gradient-text sheen: sweeps an attr (typically an SVG rect's x) across the wordmark
  OT.lockup.sheenSweep = function sheenSweep(tl, sel, t0, opts) {
    opts = opts || {};
    tl.fromTo(sel, { attr: { x: opts.xFrom } }, { attr: { x: opts.xTo }, duration: opts.duration != null ? opts.duration : 0.75, ease: opts.ease || "power2.inOut" }, t0);
  };

  // ------------------------------------------------------------------ format-driven lockup (row/stack)
  // PURE geometry, no DOM/time. cfg: {markW, markH, wordW, wordH, gap?, vGap?, taglineH?, taglineW?,
  // urlH?, urlW?, layout?} (layout defaults to OT.fmt.layout). Sizes are what the brand measured once in setup()
  // (the mark/wordmark's OWN resting pixel size — any choreographic shrink is a separate `play()`
  // concern, see markScale below). All positions are in full-frame px, the same space as OT.fmt.safe.
  // Returns {layout, scale, mark:{cx,cy}, word:{x,y,w,h}, tagline:{cx,y}|null, url:{cx,y}|null,
  // group:{x,y,w,h}} where `scale` is a uniform <=1 factor applied ONLY when the configured sizes
  // would overflow OT.fmt.safe (a title-safe-box fit correction, on top of whatever size the brand
  // already chose).
  OT.lockup.plan = function plan(cfg) {
    cfg = cfg || {};
    var layout = cfg.layout || OT.fmt.layout;
    var markW = cfg.markW || 0, markH = cfg.markH || 0, wordW = cfg.wordW || 0, wordH = cfg.wordH || 0;
    var gap = cfg.gap != null ? cfg.gap : 0;
    var vGap = cfg.vGap != null ? cfg.vGap : gap;
    var taglineH = cfg.taglineH || 0, urlH = cfg.urlH || 0;
    var taglineW = cfg.taglineW || 0, urlW = cfg.urlW || 0;
    var safe = OT.fmt.safe;

    var groupW, groupH, markLocal, wordLocal;
    if (layout === "stack") {
      groupW = Math.max(markW, wordW);
      groupH = markH + gap + wordH;
      markLocal = { cx: groupW / 2, cy: markH / 2 };
      wordLocal = { x: (groupW - wordW) / 2, y: markH + gap };
    } else {
      layout = "row";
      groupW = markW + gap + wordW;
      groupH = Math.max(markH, wordH);
      markLocal = { cx: markW / 2, cy: groupH / 2 };
      wordLocal = { x: markW + gap, y: (groupH - wordH) / 2 };
    }
    var stackH = groupH + (taglineH > 0 ? vGap + taglineH : 0) + (urlH > 0 ? vGap + urlH : 0);
    // stackW folds in the tagline/url's OWN measured width too, not just the mark+wordmark group --
    // a tagline wider than that group (common once it wraps into 9:16's narrower safe box) must
    // still drive the uniform fit-scale, or it overflows OT.fmt.safe while the group above it fits.
    var stackW = Math.max(groupW, taglineW, urlW, 1);
    var scale = Math.min(1, safe.w / stackW, safe.h / stackH);

    var gW = groupW * scale, gH = groupH * scale;
    var groupX = safe.x + (safe.w - gW) / 2;
    var groupY = safe.y + (safe.h - stackH * scale) / 2;
    var groupCx = groupX + gW / 2;

    var mark = { cx: groupX + markLocal.cx * scale, cy: groupY + markLocal.cy * scale };
    var word = { x: groupX + wordLocal.x * scale, y: groupY + wordLocal.y * scale, w: wordW * scale, h: wordH * scale };

    var cursorY = groupY + gH;
    var tagline = null, url = null;
    if (taglineH > 0) {
      cursorY += vGap * scale;
      tagline = { cx: groupCx, y: cursorY };
      cursorY += taglineH * scale;
    }
    if (urlH > 0) {
      cursorY += vGap * scale;
      url = { cx: groupCx, y: cursorY };
    }
    return {
      layout: layout,
      scale: scale,
      mark: mark,
      word: word,
      tagline: tagline,
      url: url,
      group: { x: groupX, y: groupY, w: gW, h: stackH * scale },
    };
  };

  // Schedules a lockup using the EXISTING primitives, driven entirely by an OT.lockup.plan() result.
  // els = {mark, wordmark, tagline?, url?, sheen?} — selectors, passed straight through to the
  // primitives below. opts:
  //   markFrom: {cx,cy} the mark's CURRENT center (world/frame space, same units as plan.mark) at t0
  //     — default = plan.mark itself, i.e. no translation, only the scale below is applied.
  //   markScale: the brand's own pre-safe-fit scale factor for the mark (default 1); the actual GSAP
  //     scale target is markScale * plan.scale.
  //   markDuration/markEase, wordDelay/word{...wordmarkReveal opts, layout forced from plan},
  //   taglineDelay/tagline{...reveal opts}, urlDelay/url{...reveal opts},
  //   sheenDelay/sheen{xFrom,xTo,...} — sheen only plays if opts.sheen is supplied (xFrom/xTo are
  //   element-local SVG coordinates plan() cannot know).
  OT.lockup.play = function play(tl, els, plan, t0, opts) {
    opts = opts || {};
    els = els || {};
    var from = opts.markFrom || plan.mark;
    var markScale = (opts.markScale != null ? opts.markScale : 1) * plan.scale;
    if (els.mark) {
      OT.lockup.markExit(tl, els.mark, t0, {
        dx: plan.mark.cx - from.cx, dy: plan.mark.cy - from.cy, scale: markScale,
        duration: opts.markDuration, ease: opts.markEase,
      });
    }
    if (els.wordmark) {
      var wordOpts = {};
      for (var k in (opts.word || {})) wordOpts[k] = opts.word[k];
      wordOpts.layout = plan.layout;
      OT.lockup.wordmarkReveal(tl, els.wordmark, t0 + (opts.wordDelay != null ? opts.wordDelay : 0.12), wordOpts);
    }
    if (els.tagline && plan.tagline) {
      OT.lockup.reveal(tl, els.tagline, t0 + (opts.taglineDelay != null ? opts.taglineDelay : 0.46), opts.tagline || {});
    }
    if (els.url && plan.url) {
      OT.lockup.reveal(tl, els.url, t0 + (opts.urlDelay != null ? opts.urlDelay : 0.78), opts.url || {});
    }
    if (els.sheen && opts.sheen) {
      OT.lockup.sheenSweep(tl, els.sheen, t0 + (opts.sheenDelay != null ? opts.sheenDelay : 1.11), opts.sheen);
    }
  };
})(window.OT);
