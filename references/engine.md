# One-Take engine (`OT`) API reference

The engine is 8 classic `<script>` files under `assets/engine/`, all defining one global
namespace `OT`. It has no brand data — no colors, copy, path data, or resolution/duration
literals. A brand supplies two files (`assets/brand/<brand>-hero.js`, `assets/brand/<brand>-acts.js`)
that call into `OT.*` with its own numbers. The public demo exercises these interfaces; custom brands require fresh render review.

**F7 honesty note — three engine constants are literals, not derived from `OT.fmt`/root `data-*`:**
`OT.fmt.bpm` (`ot-core.js`, `var bpm = 120`), `OT.cam.persp` (`ot-camera.js`, `OT.cam.persp = 1700`), and
the 16:9 HUD insets and the 9:16 meter-top offset (`ot-hud.js`'s `0.0645833`/`0.0592593`/`0.0611111`/
`0.0851852` and `0.05` fractions of `OT.fmt.w`/`h`, reproducing the proven reference reel's placement).
These are engine-wide defaults, not per-brand data read off the root element. Two have a documented
override path: `OT.cam.persp = N` set before the camera's first use (see `ot-camera.js`'s own comment),
and every HUD inset via `OT.hud.layout(parts, opts)`'s `opts` (`{xInset, topInset, meterBottom,
captionBottom}` for 16:9, `{meterTop}` for 9:16 — see `ot-hud.js` below). `OT.fmt.bpm` has **no** override
mechanism as shipped — a brand that needs a different tempo grid must either accept 120 or edit the
engine file directly (which then needs `sync-engine` reconciling by hand, same as any other engine
change).

## Frame flow

1. `index.html` loads `gsap.min.js`, then the 8 `assets/engine/ot-*.js` files (order matters:
   `ot-core.js` first, since everything else extends `window.OT`), then the brand's
   `<brand>-hero.js` then `<brand>-acts.js` (hero before acts: acts' `render()`/`build()` call the
   hero's `fanState`/`retState`/`planeFaces`; hero's flight math reads the acts' `T`/`CARDS` tables
   lazily — see "Porting / new brand" below), then a small inline script calls `OT.boot({...})`.
2. `OT.boot(cfg)` — loads fonts, calls `cfg.setup()` (build pools, measure DOM), calls
   `cfg.build(tl)` (register every GSAP tween on the paused timeline), pins the timeline length,
   registers `window.__timelines.main`, seeks to 0, and does the first `OT.renderAll()`.
3. Every subsequent frame: HyperFrames seeks `tl` → GSAP fires `onUpdate` → `OT.renderAll()` runs:
   read `t = tl.time()`, compute `cam = OT.cam.at(t)`, apply the `#world` CSS transform, then call
   the brand's `render(t, cam)` — which is a **pure function of `(t, cam)`**, redrawing every layer
   (planes, FX, HUD, lockup, atmosphere) from scratch. No state persists between frames except
   memoized pure look-ups (e.g. hero flight-path constants, camera tracks) and non-visual DOM-write
   dedup caches (`OT.atmos.renderDots`'s cache — see its entry).

## `ot-core.js` — math, vec3, DOM/SVG, format, palette, fonts, boot

Math (all pure, no engine state): `OT.clamp(v,a,b)`, `OT.lerp(a,b,t)`, `OT.lerpV(a,b,t)` (vector-or-scalar
lerp), `OT.prog(t,t0,t1,ease?)` → windowed 0-1 progress, optionally eased, `OT.hash(n)` → deterministic
sine-hash `[0,1)` (never use `Math.random`), `OT.angLerp(a,b,t)` → shortest-path angle lerp,
`OT.ease(gsapEaseName)` → cached `gsap.parseEase` lookup.
```js
OT.prog(6.2, 6.0, 6.5, "power2.out")   // -> 0.83-ish
OT.hash(42)                            // -> same float every call, every render
```
- `OT.trk(t, keys)` — piecewise linear/eased keyframe track. `keys = [[t0,val,ease?], [t1,val,ease?], ...]`.
- `OT.herm(t, keys)` — cubic-Hermite spline track. `keys = [[t0,val,velocity], ...]`. Used for camera.
```js
OT.trk(t, [[0, 0], [1, 100, "power2.out"]])       // ramps 0->100 over t in [0,1]
OT.herm(t, [[0, 960, 0], [4, 3100, 0]])            // smooth camera-x with zero velocity at both ends
```
- Vec3 (arrays `[x,y,z]`): `OT.sub`, `OT.cross`, `OT.dot`, `OT.norm`, `OT.rotX/Y/Z(p, angleRad)`,
  `OT.rotAxis(p, origin, unitAxis, angleRad)`, `OT.bez(P4, u)` / `OT.bezD(P4, u)` (cubic Bezier
  position/derivative, `P4` = 4 control points, 2D or 3D). `OT.DEG` = `Math.PI/180`.
- `OT.$(sel)` = `document.querySelector`. `OT.el(tag, attrs, parent?)` — SVG element factory (NS-aware).
- `OT.fmt` — lazily computed on first access (not at script-load time — see "Rules" below), read once
  from the root composition element: `{w, h, dur, fps, cx, cy, aspect, bpm:120, beat, bar, len, anchors,
  sections, safe, layout}`. `aspect` is `'16:9'` or `'9:16'` from `w > h`. `len` is `Math.round(dur)`.
  See "## Formats" below for `anchors`/`sections`/`safe`/`layout` and their `data-ot-*` overrides.
  `OT.B(n)` = `n * OT.fmt.beat` (n beats -> seconds on the 120 BPM grid).
- `OT.pal('--brand')` → `'#hex'`, read once per call from `:root`. `OT.rgb('--brand')` → `'r,g,b'`.
- `OT.fontsReady(specs, onMissingFont)` — `specs` = array like `['600 116px "Space Grotesk"']`. Loads via
  `document.fonts.load`, then verifies each family *really* resolved: `document.fonts.check()` returns
  `true` even for an unresolved family (silent fallback), so this forces the probe string to fall back to
  `"serif"` and compares measured width against both `serif` and `monospace` — only "loaded" if it
  matches **neither**. `onMissingFont`: `'warn'` (console.warn, keep going — used for fidelity ports) or
  `'throw'` (new reels' default). Returns a Promise resolving to the array of missing specs.
- `OT.boot(cfg)` — `cfg = {fonts, onMissingFont, setup(), build(tl), render(t,cam)}`. See "Frame flow".
  Sets `OT.tl` synchronously (before fonts resolve) so other code can reference the timeline early.
- `OT.renderAll()` — the GSAP `onUpdate` target; do not call this yourself.

## `ot-camera.js` — Hermite camera, shake, projection

- `OT.cam.tracks({x, y, s})` — register the Hermite key arrays (see `OT.herm`). Call once, in `setup()`.
- `OT.cam.addShake(t0, dur, amp)` — a post-event jitter window; call once per window (multiple allowed).
  Hash-seeded per rendered frame (`Math.round(t*fps)`), decays as `((1 - (t-t0)/dur))^2`.
```js
OT.cam.tracks({ x: CAMX, y: CAMY, s: CAMS });
OT.cam.addShake(T.impact, 0.5, 16); // 0.5s window, +-16 world units at peak, decaying
```
- `OT.cam.at(t)` → `{x, y, s}` (world position + scale), tracks + all active shakes summed.
- `OT.cam.persp` — perspective distance for `OT.project` (default `1700`; set before first use to change).
- `OT.project([x,y,z], cam)` → `[screenX, screenY, perspectiveK]`. `OT.w2s(x, y, cam)` → `[screenX, screenY]`
  (no perspective divide — for 2D-plane world objects). Both always use `OT.fmt.cx/cy`, never a literal.
- `OT.s2w(sx, sy, cam)` → `[x, y]`, the exact inverse of `OT.w2s` (same `cx/cy`, no perspective term).
  Use it to home a world-space object onto a SCREEN-space target — e.g. the lockup mark, which lives
  outside `#world` — by converting that target back into the world coordinates the object's own flight
  math already works in: `home = OT.s2w(plan.mark.cx, plan.mark.cy, OT.cam.at(T.impact))`.
- `OT.cam.applyWorld(cam, el)` — sets `el.style.transform` (translate+scale) for the `#world` layer.
  Called by `OT.renderAll` itself; a brand never calls this directly.
- `OT.cam.vel(t)` — one-frame finite-difference screen-space x-velocity magnitude (`|cam.x-prevX|*cam.s`,
  not divided by dt). Feeds whip-blur signals (`OT.atmos.renderDots`/`renderBokeh`'s `vx` argument).

## `ot-fx.js` — pooled spark/ring/flash events

Fixed-size SVG pools, created once; per-frame just re-attributes existing nodes (no create/destroy).
- `OT.fx.initPools({sparksEl, ringsEl, flashesEl, sparks?, rings?, flashes?, sparkFill?, ringStroke?,
  flashFill?, sparkAltColor?})` — call once in `setup()`. Defaults: 90/6/3 pool sizes, white sparks,
  `url(#flashGrad)` flash fill (define that gradient in your DOM). `sparkAltColor` is the color used on
  ~45% of a burst's sparks regardless of the burst's own `color` (matches the original hand-tuned look).
- `OT.fx.burst({t0,x,y,n,speed,life,seed,dir?,spread?,color?})` — queues a radial particle burst.
  `dir` omitted = full 360° spray; `seed` drives per-spark hash variance (keep bursts' seeds distinct).
- `OT.fx.ring({t0,x,y,r0,r1,life,w?,inward?})` — an expanding (or `inward:true` contracting) ring.
- `OT.fx.flash({t0,x,y,r0,r1,life,peak?})` — a radial flash (opacity ramps by `peak`).
```js
OT.fx.burst({ t0: T.launch, x: L0.x, y: L0.y, n: 20, speed: 900, life: 0.55, seed: 3, color: "#fff" });
OT.fx.ring({ t0: T.launch, x: L0.x, y: L0.y, r0: 30, r1: 260, life: 0.6, w: 5 });
```
- `OT.fx.renderSVG(t, cam)` — draws all queued events into the pools for this frame; call once per
  `render(t,cam)`.
- `OT.fx.worldTf(ctx, cam)` — sets a 2D context's transform to match `#world`'s camera transform (same
  math as `OT.cam.applyWorld`/`OT.w2s`, expressed as a canvas matrix). Call before any world-space
  canvas drawing.
- `OT.fx.renderCanvas(ctx, t, cam)` — draws the SAME registered burst/ring/flash events onto a 2D
  canvas instead of the SVG pools: additive `"lighter"` compositing, a radial-gradient flash, rings,
  and bursts with gravity plus a two-color mix. `renderSVG` ignores the extra per-event fields below,
  so using both renderers off the same registered events is safe. Optional per-event fields (hex
  colors): `burst.grav` (world-units, default `260`), `burst.col2` (secondary spark color, default the
  pool's `sparkAltColor`), `ring.ringColor` (default `"#ffffff"`), `flash.flashColor` (default
  `"#ffffff"`). A ring's `lineWidth` is divided by `cam.s` before being set on the context: since
  `OT.fx.worldTf`'s canvas transform already scales world-space drawing by `cam.s`, pre-dividing keeps
  the ring's STROKE a constant on-screen width under zoom (the ring's own radius still scales normally,
  since it's drawn at its true world radius through that same transform).
  **Contract: `renderCanvas` calls `OT.fx.worldTf` internally and always leaves `ctx` exactly as it found
  it** (`ctx.save()`/`ctx.restore()` around all of its drawing, restoring `globalCompositeOperation` too)
  — a caller must be able to `clearRect` the full canvas on the very next frame without first resetting
  the transform itself. Before this was fixed, the leftover world-space transform made a caller's
  `clearRect(0,0,FMT.w,FMT.h)` clear the wrong (moved/scaled) screen rect on the next frame, so FX drawn
  outside that rect never got erased — a fan of stacked rings/bursts persisting all the way to the final
  lockup in a real render. Callers should still reset to identity before their own `clearRect` as a second,
  defensive line of protection (`ctx.setTransform(1,0,0,1,0,0)`, as `template/assets/brand/acts.js` and
  `examples/demo/assets/brand/acts.js` both now do) rather than relying on this contract alone.
```js
OT.fx.burst({ t0: T.launch, x: 0, y: 0, n: 20, speed: 900, life: 0.55, seed: 3, color: "#fff", grav: 320, col2: "#ffd27a" });
OT.fx.worldTf(ctx, cam);        // once per frame, before any world-space canvas drawing
OT.fx.renderCanvas(ctx, t, cam);
```

## `ot-3d.js` — lit polygon faces, shadow, trail

The hero object's own geometry (its fold states, e.g. a paper plane's `planeFaces(s)`) is brand code —
this module only projects/paints/pools faces it is handed.
- `OT.threeD.material({dir, lit, shade, ambient?, diffuse?, specPow?, spec?, creaseRGB?, strokeWidthK?})`
  → `{shade(normal), creaseRGB, strokeWidthK}`. `dir` = light direction vec3, `lit`/`shade` = `[r,g,b]`
  the material lerps between by diffuse term. Build once per hero material.
- `OT.threeD.makePool(parentEl, count, facesPerItem, faceAttrs?)` → `[{g, faces:[...]}]`, `count` groups
  each with `facesPerItem` pooled `<polygon>` children.
- `OT.threeD.drawFaces(slot, rawFaces, cam, opacity, material)` — `rawFaces` = your geometry function's
  output, `[{pts:[[x,y,z],...], flap?, fold?}, ...]` in world space. Projects, z-sorts (painter's
  algorithm), paints each face via `material.shade(faceNormal)`, strokes creases via `material.creaseRGB`.
```js
const faces = s ? planeFaces(s) : null;            // brand geometry, world space
OT.threeD.drawFaces(planeSlots[i], faces, cam, 1, MATERIAL);
```
- `OT.threeD.drawShadow(poly, rawFaces, z, cam, opts?)` — convex-hull (monotone chain) cast shadow of
  the flattened, z-offset silhouette. `opts`: `{zOff,dxK,dyK,pxK,pyK,opBase,opK,opMin,opMax}`, all default
  to the values the the original demo port uses (safe to omit).
- `OT.threeD.drawTrail(slot, fn, t0, t1, t, cam, opts)` — motion-blur ribbon. `fn(tt) -> {x,y,psi,sc,z}|null`
  samples a moving object's pose (`psi` = heading rad). `opts: {width, tailLen, zFlatten?, N?, minSpan?,
  lookback?}`. `tailLen` is in world units at `sc=1` (the original derived it from the hero's own sheet
  height — pass your own hero's equivalent constant).
- `OT.threeD.makeTrailPool(parentEl, count, gradStops, defsParentEl)` — `gradStops` = array of `<stop>`
  attribute objects (your brand's trail gradient colors), one `<linearGradient>`+`<path>` per slot.

## `ot-atmos.js` — bokeh, dot-grid streak, grain, world-tracked glow

- `OT.atmos.bokeh({total, frontStart, colors, backEl, frontEl, back:{d,wx,wy,r,a}, front:{d,wx,wy,r,a}})`
  → array of particle handles, already appended as `<i>` elements. Each of `d/wx/wy/r/a` is `[base,span]`;
  actual value = `base + OT.hash(i*seed)*span`. Hash seed constants are engine-internal (arbitrary,
  reproduce the source's placement) — only the ranges/colors/counts are brand config. Call once in `setup()`.
- `OT.atmos.renderBokeh(list, t, cam, vx, opts?)` — per-frame position/opacity/stretch. `opts`:
  `{swayX,freqX,swayY,freqY,vk,vMax,stretchK,margin}`, default to the the original demo port's tuning.
- `OT.atmos.renderDots(el, bl, baseCSS, opts?)` — camera-speed dot-grid streak via `background-image`.
  `baseCSS` is the resting (no-streak) background-image string. `opts.color` = `'r,g,b'` (**no default
  brand color** — always pass your own). Caches per-element so an unchanged `bl` bucket skips a redundant
  style write — this is a perf cache only, it never changes what renders for a given `(el, bl)`.
- `OT.atmos.grainJitter(el, frame, opts?)` — per-frame film-grain `translate()` jitter (`opts: {amp,seedB}`).
- `OT.atmos.applyGlow(el, screenX, screenY, opacity, scale?)` — thin transform/opacity setter for a
  world-tracked glow. Brand computes the world position (via `OT.w2s`) and its own choreography/clamp;
  omit `scale` for a glow that shouldn't breathe/scale (matches the original's secondary glow).
- `OT.atmos.makeMotes(n, seed, opts?)` → array of `n` particles (hash-seeded, deterministic), for a
  canvas dust-mote layer. The wrap box is `OT.fmt.w/h` plus a margin (default `140` both axes,
  overridable via `opts.margin`/`marginX`/`marginY`) — express any fixed reference box as `w/h +
  2*margin` rather than a literal. `opts`: `{margin, marginX, marginY, r:[base,span], d:[base,span],
  sp:[base,span]}` (depth `d`, radius `r`, vertical drift speed `sp`). `seed` decorrelates multiple
  independent mote fields. The returned array carries its own wrap geometry (`.w/.h/.mx/.my`).
- `OT.atmos.drawMotes(ctx, t, cam, motes, opts?)` — per-frame draw of a `makeMotes()` list onto a 2D
  context: additive, screen-space, with camera parallax and a slow per-mote twinkle. Pure function of
  its arguments (seek-safe). `opts`: `{color:"r,g,b"` (no default brand color — always pass your own)
  `, alpha, swayX, freqX, driftY, freqY, parallax, fadeFrom, fadeTo}`.
- Mote seeds are decorrelated as `k = i + seed*7919` (a large-prime multiplier keeps each seed's index
  range from re-colliding with another's in `OT.hash`), so two `makeMotes()` calls with different seeds
  are independent fields, not near-duplicates — `seed:0` is unchanged from `k = i`.
```js
var motes = OT.atmos.makeMotes(70, 1, { r: [0.8, 2.6] });   // once in setup()
OT.atmos.drawMotes(ctx, t, cam, motes, { color: "255,255,255" });  // every frame, after OT.fx.worldTf/renderCanvas
```

## `ot-backdrop.js` — the per-brand background world (tokenised)

Loaded after `ot-atmos.js`. Old projects never load it (their own `index.html`/`acts.js` hard-code the backdrop), so
`sync-engine` adding the file changes nothing they render (proved with `frame-compare.py`: 900 frames, min PSNR
50.35 dB, min SSIM 0.994, identical to encoder noise). It does not modify any other engine file.

- `OT.backdrop.config(src?)` -> the resolved config. Per field: explicit `--atmos-<k>` CSS var > `OT_BRAND.atmos.<k>` >
  derived from the brand's tokens (`--bg` -> the 3 gradient stops, `--accent`/`--accent-2` -> glow/glow2, `--ink` ->
  grid/ink) > **neutral** default (`B.NEUTRAL`, cool slate; never warm). Fields: `treatment bg glow glow2 grid gridAlpha
  vignette vignetteAlpha mode corners intensity` (+ `OT_BRAND.atmos.bokeh:["#hex",...]`). `vignetteAlpha` is clamped to
  0.58 (auditor: >= 0.6 is opaque). `mode` auto = light when `--bg` luminance > 0.55.
- `OT.backdrop.init(src?)` -- call once in `setup()`. Paints `#bg`, `#glow1/2`, `#vignette`, the `#dots` colour and
  the corner-bracket colour from the config, sets `data-layout-ignore` on the vignette, and (for canvas treatments)
  inserts `<canvas id="bgfx" data-layout-ignore data-backdrop>` before `#world` (hides `#dots`). `dots` builds bokeh.
- `OT.backdrop.render(t, cam)` -- call every frame from `render()`. Pure function of `(t, cam)`; no state carried.
- Treatments (`OT.backdrop.TREATMENTS`): `dots` (DOM dot grid with camera-speed streak + bokeh), `stars` (3 parallax
  layers, flares, milky band, deterministic shooting stars), `topo` (marching-squares contours over a drifting noise
  field), `blueprint` (minor/major grid, registration crosses, dashed construction arcs, scan sweep), `paper` (fibres,
  creases, drifting soft shadows/lights; for light brands), `aurora` (additive ribbon curtains + rays), `halftone`
  (rotated print-dot screen following a moving light). All scatter with the integer hash `OT.backdrop.hash(i, salt)`
  (`OT.hash` is sin-based and clusters when two calls use multiples of one index). No `Math.random`/`Date.now`, no SVG filter.
- `OT.backdrop.drawTo(ctx, name, t, cam, cfg, state?)` / `OT.backdrop.build(name, cfg)` are the pure entry points the tests use.
- The probe's fx-clean gate skips canvases marked `data-backdrop` (a persistent backdrop is not stuck FX); the `pure`
  gate still checks it.
- Scaffold: `new-reel.mjs new ... --atmos <t> --frame frame.md [--base --glow --glow2] [--register]`; pitch check
  `new-reel.mjs atmos-check`. Tests: `scripts/tests/test_backdrop.sh`.

## `ot-hud.js` — timecode, rec blink, status meter/dots, caption reveal

- `OT.hud.timecode(t, fps)` → `"00:00:SS:FF"` string (SMPTE-style, no HH:MM — under a minute always).
- `OT.hud.recBlink(t, opts?)` → opacity number. `opts: {period,duty,on,off}` default `{1.0, 0.62, 1, 0.25}`.
- `OT.hud.cascadeLabel(rules, fallback)` — `rules = [{test:()=>bool, label:string|()=>string}, ...]`
  evaluated in order; the **last** passing rule's label wins (mirrors an if-cascade where later
  conditions overwrite earlier ones — not a sorted time-track, since conditions can be arbitrary booleans).
```js
OT.hud.cascadeLabel([
  { test: () => t >= T.press, label: "SENDING" },
  { test: () => t >= T.launch, label: () => "DISPATCHING " + landed + "/5" },
], "DRAFT");
```
- `OT.hud.layout(parts, opts?)` — per-aspect HUD placement: a PURE function of `OT.fmt` (no time
  dependence), writes inline px `left/top/right/bottom` onto whatever elements are passed. Call once
  from `setup()`. `parts = {corners:[tl,tr,bl,br], brand, timecode, meter, captions}`; any part may be
  `null`. **16:9**: corners sit on the safe-box corners; brand/timecode/meter/captions reproduce the
  proven 16:9 reference reel's HUD placement. **9:16** (method.md §7): brand at the safe top-left,
  timecode at the safe top-right, the meter dropped below the timecode, captions in the safe bottom
  band, left-aligned. `opts` overrides any inset — 16:9: `{xInset, topInset, meterBottom,
  captionBottom}`; 9:16: `{meterTop}`.
```js
OT.hud.layout({ corners: [tl, tr, bl, br], brand: hudBrandEl, timecode: hudTcEl, meter: hudMeterEl, captions: capEl });
```
- `OT.hud.statusDots(dotEls, onFlags, onColor, offColor, onShadow)` — N boolean-driven status lights.
- `OT.hud.capIn(tl, sel, t0, t1)` — caption reveal: small label slides in, the line clips up-in then
  clips up-out at `t1`. Registers 4 tweens on `tl`. Expects `sel + " small"` and `sel + " .ln span"`.

## `ot-lockup.js` — logo lockup mechanics

- `OT.lockup.initMask(selectors)` → `[{p, L}]` where `L` is `getTotalLength() + 4`, one per path: sets
  `stroke-dasharray` to `[L, L+40]` (i.e. `[getTotalLength()+4, getTotalLength()+40]`) so a
  `stroke-dashoffset` sweep draws it on. Call once in `setup()`.
- `OT.lockup.drawMask(mask, progresses)` — `progresses[i]` (0-1) sets `mask[i]`'s dashoffset to
  `mask[i].L * (1 - progresses[i])`; a finished draw-on (`progresses[i] === 1`) is dashoffset `0`. Per-frame.
- `OT.lockup.comet(el, pathEntry, q, {rMax, rMin?, backOff?, rampT0?, rampT1?, ease?})` — a glowing head
  riding `pathEntry` (from `initMask`) at progress `q` (0 when off), radius ramps in over `[rampT0,rampT1]`.
- `OT.lockup.tileBloom(tl, sel, t0, {fromScale?,svgOrigin,duration?,ease?})` — back-out scale/opacity pop-in.
- `OT.lockup.markExit(tl, sel, t0, {dx,dy,scale,duration?,ease?})` — the mark slides/scales away.
- `OT.lockup.wordmarkReveal(tl, sel, t0, {xPercentFrom?,duration?,ease?,stagger?,layout?})` — per-letter
  (`sel + " span"`) stagger reveal inside an `overflow:hidden` clip — the "slide from behind the mark"
  look. `opts.layout` omitted (or `"row"`) reproduces the original behavior exactly (`xPercent -130 ->
  0`, horizontal slide); `layout:"stack"` rises up instead (`yPercent` from `opts.yPercentFrom ?? 110`
  to `0`) — see method.md §7.
- `OT.lockup.plan(cfg)` — PURE geometry, no DOM/time: given the mark/wordmark sizes a brand measured
  once in `setup()` plus spacing, returns where the lockup group should sit for the current
  `OT.fmt.layout` (or `cfg.layout`). `cfg: {markW, markH, wordW, wordH, gap?, vGap?, taglineH?,
  taglineW?, urlH?, urlW?, layout?}`. **row** (16:9): wordmark sits right of the mark, vertically
  centered. **stack** (9:16): the
  mark sits above the wordmark, both horizontally centered. Either way the mark+wordmark group is
  centered in `OT.fmt.safe`, and a single `scale <= 1`
  shrinks the WHOLE group (mark, wordmark, gap, tagline, url) uniformly whenever the configured sizes
  would overflow the safe box. The fit width is `stackW = max(groupW, taglineW, urlW)` — pass your
  measured `taglineW`/`urlW` (default 0, i.e. not considered) whenever the tagline/url text could be
  wider than the mark+wordmark group, e.g. a long line in 9:16's narrower safe box, or it can overflow
  `OT.fmt.safe` even though the group above it fits. `taglineH`/`urlH` still drive the stack's height and
  `tagline`/`url`'s vertical position either way; only the WIDTH used for the fit-scale changes. Returns
  `{layout, scale, mark:{cx,cy}, word:{x,y,w,h},
  tagline:{cx,y}|null, url:{cx,y}|null, group:{x,y,w,h}}` — all positions are SCREEN-space px, the same
  space as `OT.fmt.safe` (title-safe is inherently a screen concept). If your lockup elements live
  outside `#world` (like the HUD — recommended for a brand-new reel's lockup, since it decouples the
  hold from wherever the camera happens to be), these are their final `left/top`/`cx,cy` directly. If
  they live INSIDE `#world` (e.g. the mark is the same DOM node as your flying hero object, continuing
  its world-space presence — the existing port's approach, whose camera track does NOT settle to
  neutral at the lockup: it tracks the hero's own landed position), convert through the camera's
  inverse transform at `t0` before feeding `opts.markFrom`/computing deltas.
- `OT.lockup.play(tl, els, plan, t0, opts?)` — schedules a lockup using the EXISTING primitives above,
  driven by a `plan()` result. `els = {mark, wordmark, tagline?, url?, sheen?}` (selectors, passed
  straight through). `opts.markFrom:{cx,cy}` is the mark's CURRENT center at `t0` (default = `plan.mark`,
  i.e. no translation — only `opts.markScale ?? 1` times `plan.scale` is applied); `opts.markScale` is
  the brand's own pre-safe-fit shrink for the mark. `opts.word/tagline/url` pass through to
  `wordmarkReveal`/`reveal` (layout is forced from `plan.layout`); `opts.sheen:{xFrom,xTo,...}` plays an
  optional sheen (skipped if omitted — sheen coordinates are element-local SVG space, which `plan()`
  cannot know). `opts.*Delay` overrides each step's offset from `t0`.
```js
var plan = OT.lockup.plan({ markW: markBox.w, markH: markBox.h, wordW: wordBox.w, wordH: wordBox.h, gap: 24, taglineH: 70, urlH: 30 });
OT.lockup.play(tl, { mark: "#mark", wordmark: "#wordmark", tagline: "#tag1", url: "#url" }, plan, T.impact + 0.5, { markFrom: { cx: MARK.cx, cy: MARK.cy } });
```
- `OT.lockup.reveal(tl, sel, t0, {fromY?,duration?,ease?})` — generic fade+slide-up (tagline line 1, url).
- `OT.lockup.slamIn(tl, sel, t0, {fromScale?,fromBlur?,duration?,ease?,transformOrigin?})` — blur+oversize
  pop down to rest (a "kinetic-beat-slam" emphasis reveal — tagline accent word).
- `OT.lockup.sheenSweep(tl, sel, t0, {xFrom,xTo,duration?,ease?})` — sweeps an SVG attr (typically a
  gradient rect's `x`) across text for a light-sheen pass.

## DOM contract the engine expects

- `#root[data-composition-id][data-width][data-height][data-duration][data-fps]` — required; `OT.fmt`
  reads these once (lazily). No silent 1920×1080/15s fallback: a missing attribute is a real error.
- `#world` — the camera-tracked layer; `OT.cam.applyWorld` sets its `transform` every frame. **Never put
  an SVG `filter:url()` on `#world`** — its filter region clips content positioned off-canvas in world
  space (this is why dot-grid/bokeh streak themselves instead of using a motion-blur filter).
- `#fx` (SVG) with pool group children your brand creates via `OT.threeD.makePool` / `OT.fx.initPools` /
  `OT.threeD.makeTrailPool` — group ids are your choice (e.g. `#planes`, `#ghosts`, `#trails`, `#shadows`,
  `#sparks`, `#rings`, `#flashes`); the engine takes element references, not ids.
- HUD parts: whatever elements you pass to `OT.hud.*` — no fixed ids required by the engine itself.
- Lockup: whatever elements you pass to `OT.lockup.*`. `initMask` needs valid, measurable SVG `<path>` d
  attributes already in the DOM (draw the end-state in static markup first, per the layout contract).
- `window.__timelines.main` — `OT.boot` registers this internally. HyperFrames' static contract guard
  scans **index.html's own inline script text** for the registration pattern and does not resolve
  external `<script src>` files, so the tiny inline boot script must *also* contain the literal pattern
  (`window.__timelines["main"] = OT.tl;` after `OT.boot(...).then(...)`) even though it is redundant with
  what `OT.boot` already did. See the the original demo port's `index.html` for the exact copy-pasteable snippet.

### The template's layer stack (`template/index.html`)
(The backdrop layers `#bg`, `#glow1/2`, `#dots`, `#vignette` and the corners are painted from tokens by `OT.backdrop.init()`; the CSS colours in `index.html` are only a neutral fallback.)

- **World space vs. screen space.** `#world` (camera-transformed by `OT.cam.applyWorld`) contains only
  `#dots` (the dot-grid streak) and `#brandWorld` (the hero's container — the template's `#heroToken` lives
  here). Everything else under `#stage` is a screen-space sibling of `#world`, never camera-transformed:
  `#hud` and `#lockup` sit outside it, and so does the `#fx` canvas. A brand's flying geometry belongs
  inside `#brandWorld`'s subtree so the camera transform carries it for free; anything meant to hold a
  fixed screen position (HUD, lockup, captions) belongs outside `#world` instead.
- **Why the lockup lives outside `#world`.** `OT.lockup.plan` returns pure screen-space geometry — the same
  px space as `OT.fmt.safe` — so keeping `#lockup` a sibling of `#world` means those returned positions are
  final `left/top` with no camera-inverse conversion needed, and the hold reads correctly no matter what the
  camera is doing when it lands. (A brand can instead keep its mark *inside* `#world`, continuing a flying
  hero's own DOM node into the lockup — see `OT.lockup.plan`'s note above on `opts.markFrom` — but that
  camera track then can't settle to neutral, since the mark's world position is what's landing on screen.)
- **The `#fx` canvas is screen space too, drawn to look like world space.** The template's `#fx` is a plain
  `<canvas>` (a sibling of `#world`, `position:absolute; inset:0`), not the SVG-with-pool-children shape the
  bullet above describes for `OT.fx.initPools`/`OT.threeD.makePool`/`makeTrailPool` — a `<canvas>` can't host
  DOM pool children. Instead, every frame, `OT.fx.worldTf(ctx, cam)` sets the canvas 2D context's transform
  to match `#world`'s own camera transform, and `OT.fx.renderCanvas(ctx, t, cam)` then draws the same
  registered burst/ring/flash events (world-space `x,y`) through it. The DOM element never moves; what's
  painted onto it is positioned as if it lived inside `#world`.
- **`data-layout-ignore`** marks decorative full-frame overlays the layout auditor should skip entirely —
  the template puts it on `#vignette` and `#grain` (SKILL.md "Hard-won rules" covers the vignette-alpha and
  occlusion-hatch details for content that *isn't* skipped).
- **`<!-- SFX:BEGIN --> … <!-- SFX:END -->`** bracket the generated `<audio>` block. They sit right after
  `#stage`'s closing tag and before the `<script>` includes, immediately below the comment marking where a
  `<audio id="bgm">` mounts (sound.md §6). `sfx-cues.mjs html --write` replaces everything between the two
  markers and throws if either is missing — never hand-edit inside them.
- **Script include order**: `assets/vendor/gsap.min.js`, then the 8 `assets/engine/ot-*.js` files (core →
  camera → fx → 3d → atmos → hud → lockup, per "Frame flow" above), then `assets/logo/logo.js`, then
  `assets/brand/brand.js`, then `assets/brand/acts.js`, then the inline boot script. Logo/brand data must
  load before the brand's own hero/acts files, since their `setup()` reads `window.OT_LOGO`/`window.OT_BRAND`.
- **The inline boot script** is not trimmable boilerplate: besides calling `OT.boot({fonts, onMissingFont,
  setup, build, render})`, it must contain the literal `window.__timelines["main"] = OT.tl;` textually (see
  the bullet above) — a lint scans the inline script's own source text, not what running it produces.
- **`window.OT_BRAND`** shape (`assets/brand/brand.js`): `{name, url, tagline:[line1,line2], hudLabel}` —
  the flat JSON object the template's `setup()` reads verbatim for the wordmark, url, tagline and HUD label.
- **`window.OT_LOGO`** shape (`assets/logo/logo.js`): `{viewBox:[x,y,w,h], tile?:{color,bbox,rx},
  components:[{id,color,d,bbox,area_frac,iou}, ...]}` — the same shape `trace-logo.py`'s `logo-paths.json`
  writes and `new-reel.mjs logo` validates before wrapping it as `window.OT_LOGO = {...}`.
- **Fonts**: the template ships Geist + Geist Mono as local `.woff2` files under `assets/fonts/` (with their
  license, `OFL.txt`), declared via `@font-face` in `index.html`'s `<style>` and named in `OT.boot`'s `fonts`
  array so `OT.fontsReady` can verify they actually resolved (see "Rules" below).

## Rules

- **Seek-safety**: every `OT.*` render function is a pure function of its arguments (`t`, `cam`, pool
  refs). No `Math.random`, `Date.now()`, `performance.now()`, or state written during render that a later
  frame reads. The only "state" is: pools created once in `setup()`, and memoized pure lookups.
- **`OT.fmt` is a lazy getter, not a value computed at script-load time.** HyperFrames' render/check
  pipeline may evaluate an externally-sourced `<script src>` before the body DOM is fully attached (GSAP
  itself tolerates this because it never touches the DOM at load time). Any engine code that reads the
  DOM at module-load time will intermittently see a null `#root` — defer it (a lazy getter, or code
  inside a function only called from `OT.boot`'s callbacks).
- **No SVG filter on `#world`** (see DOM contract above).
- **Fonts**: always call `OT.fontsReady` (via `OT.boot`'s `fonts` option) before `build()`/first paint.
  `document.fonts.check()` lies for silently-fallen-back fonts — trust `OT.fontsReady`'s measurement
  check, not `document.fonts.check()`, when you need to know if a family really resolved. Note:
  HyperFrames' own compiler auto-fetches and injects `@font-face` rules for Google Fonts it detects in
  use, even ones with no explicit `@font-face` in your CSS (confirmed via the the original demo port: "Space Mono"
  has no local `@font-face`/file, yet renders correctly and pixel-identically in both the pre-port and
  ported renders — see PORT-NOTES.md "Space Mono finding" for the evidence).
- Every visual number (color, position, timing, pool size) a brand cares about should be a parameter into
  an `OT.*` call, not a literal inside `assets/engine/*.js`. If you find yourself editing an engine file
  to make a new brand look right, that value should have been a parameter — file it as an engine gap.
- **A `%` height on an absolutely positioned box inside an unsized parent resolves to 0.** The template's
  `#wordmark` is `position:absolute` inside `#wmClip`; `setup()` measures `#wordmark`'s natural size to
  build the lockup plan *before* `#wmClip` has been given a size, so a `height:100%` there would resolve to
  0 and clip every letter. The fix is `height:auto` on `#wordmark` (`template/index.html`, the `#wordmark`
  rule and its comment), plus a `setup()` guard that throws if any measured lockup part is 0 in either
  dimension (`template/assets/brand/acts.js`, the `guard:` comment) — fail loudly on a collapsed box rather
  than build `OT.lockup.plan` from one.
- **A lagged progress on someone else's end-time never reaches 1 on its own.** `OT.lockup.comet` only zeros
  its radius at `q <= 0` or `q >= 1`. A second, trailing comet computed as `ringQ - 0.08` caps at `0.92` and
  never crosses 1, so it parks lit on the finished ring forever. Give a lagged comet its own `OT.prog`
  window that *ends* at the same time as the one it trails, so both reach exactly 1 at the same moment
  (`template/assets/brand/acts.js`, the `cometB` comment).
- **Define a hero's path in SCREEN space, not world space.** Compute one screen point per `t` and convert it
  through that frame's own camera with `OT.s2w(sx, sy, cam)` — the object is framed by construction,
  whatever the camera does that frame. Start it BEHIND its target along the camera's travel direction so it
  only moves forward in world space; a world-space lerp gets outrun by a camera whip and strands the hero
  off-frame (`template/assets/brand/acts.js`, the "hero path, in SCREEN space" comment).
- **`OT.lerp` is scalar-only and silently wrong on arrays.** `OT.lerp = (a, b, t) => a + (b - a) * t`
  (`template/assets/engine/ot-core.js:16`) does arithmetic directly on `a`/`b`; pass it a vec2/vec3 array
  and `b - a` on arrays produces `NaN` with no error. Use `OT.lerpV(a, b, t)`
  (`template/assets/engine/ot-core.js:17`) for vectors/arrays — it branches on `typeof a === "number"` and
  otherwise maps `OT.lerp` component-wise; it's also safe to call on plain scalars.

## Porting / new-brand checklist

1. Copy `assets/engine/*.js` from this skill's `template/assets/engine/` verbatim (do not edit).
2. Author `<brand>-hero.js`: your hero object's pose/flight functions and its `planeFaces`-equivalent
   geometry function (state -> `[{pts, flap?, fold?}]` in world space), plus an `OT.threeD.material(...)`.
   Do **not** wrap it in an IIFE — see "brand file scoping" below.
3. Author `<brand>-acts.js`: your timing table, data tables (cards/tracks/whatever your story needs),
   `setup()` (register `OT.cam.tracks`/`addShake`, build pools via `OT.threeD.makePool` /
   `OT.fx.initPools` / `OT.threeD.makeTrailPool` / `OT.atmos.bokeh` / `OT.lockup.initMask`, grab DOM
   refs), `build(tl)` (every GSAP tween + FX event registration), `render(t,cam)` (redraw everything,
   in the same order your `renderAll` used to run: world already applied by the engine, then atmosphere,
   then 3D objects, then FX, then interactive/text elements, then HUD last).
4. Wire `index.html`: DOM+CSS+SFX block stay hand-authored per the [hyperframes-core] composition
   contract; script includes are the 7 engine files, then `<brand>-hero.js`, then `<brand>-acts.js`, then
   the inline `OT.boot({...})` call (copy the `window.__timelines` redundant-registration snippet — see
   DOM contract above).
5. Run `hyperframes check`; fix `missing_timeline_registry` first if it appears (see DOM contract).
6. Render, `snapshot` a contact sheet at your story's beat times, eyeball it.

**Brand file scoping**: `<brand>-hero.js` and `<brand>-acts.js` are **not** IIFE-wrapped — they share
identifiers as top-level globals, the same way the original single-file reel shared one closure. This is
a deliberate, minimal deviation from the engine files' `OT`-namespaced IIFE pattern (see PORT-NOTES.md
"Deviations" for why). Two consequences: (a) if your hero file needs a math alias engine files don't
already expose as a bare global (only your hero file's own `var`-aliases carry over), redeclare it with
`var`, never `const`/`let` — a `let`/`const` redeclaration of a name a sibling script already declared
via `var` is a `SyntaxError`; (b) pick identifier names that won't collide between your two brand files
(the port's hero/acts files don't overlap — see engine.md's source for the exact name lists if you want
a template).

## Formats" below for `anchors`/`sections`/`safe`/`layout` and their `data-ot-*` overrides.
  `OT.B(n)` = `n * OT.fmt.beat` (n beats -> seconds on the 120 BPM grid).
- `OT.pal('--brand')` → `'#hex'`, read once per call from `:root`. `OT.rgb('--brand')` → `'r,g,b'`.
- `OT.fontsReady(specs, onMissingFont)` — `specs` = array like `['600 116px "Space Grotesk"']`. Loads via
  `document.fonts.load`, then verifies each family *really* resolved: `document.fonts.check()` returns
  `true` even for an unresolved family (silent fallback), so this forces the probe string to fall back to
  `"serif"` and compares measured width against both `serif` and `monospace` — only "loaded" if it
  matches **neither**. `onMissingFont`: `'warn'` (console.warn, keep going — used for fidelity ports) or
  `'throw'` (new reels' default). Returns a Promise resolving to the array of missing specs.
- `OT.boot(cfg)` — `cfg = {fonts, onMissingFont, setup(), build(tl), render(t,cam)}`. See "Frame flow".
  Sets `OT.tl` synchronously (before fonts resolve) so other code can reference the timeline early.
- `OT.renderAll()` — the GSAP `onUpdate` target; do not call this yourself.

## `ot-camera.js` — Hermite camera, shake, projection

- `OT.cam.tracks({x, y, s})` — register the Hermite key arrays (see `OT.herm`). Call once, in `setup()`.
- `OT.cam.addShake(t0, dur, amp)` — a post-event jitter window; call once per window (multiple allowed).
  Hash-seeded per rendered frame (`Math.round(t*fps)`), decays as `((1 - (t-t0)/dur))^2`.
```js
OT.cam.tracks({ x: CAMX, y: CAMY, s: CAMS });
OT.cam.addShake(T.impact, 0.5, 16); // 0.5s window, +-16 world units at peak, decaying
```
- `OT.cam.at(t)` → `{x, y, s}` (world position + scale), tracks + all active shakes summed.
- `OT.cam.persp` — perspective distance for `OT.project` (default `1700`; set before first use to change).
- `OT.project([x,y,z], cam)` → `[screenX, screenY, perspectiveK]`. `OT.w2s(x, y, cam)` → `[screenX, screenY]`
  (no perspective divide — for 2D-plane world objects). Both always use `OT.fmt.cx/cy`, never a literal.
- `OT.s2w(sx, sy, cam)` → `[x, y]`, the exact inverse of `OT.w2s` (same `cx/cy`, no perspective term).
  Use it to home a world-space object onto a SCREEN-space target — e.g. the lockup mark, which lives
  outside `#world` — by converting that target back into the world coordinates the object's own flight
  math already works in: `home = OT.s2w(plan.mark.cx, plan.mark.cy, OT.cam.at(T.impact))`.
- `OT.cam.applyWorld(cam, el)` — sets `el.style.transform` (translate+scale) for the `#world` layer.
  Called by `OT.renderAll` itself; a brand never calls this directly.
- `OT.cam.vel(t)` — one-frame finite-difference screen-space x-velocity magnitude (`|cam.x-prevX|*cam.s`,
  not divided by dt). Feeds whip-blur signals (`OT.atmos.renderDots`/`renderBokeh`'s `vx` argument).

## `ot-fx.js` — pooled spark/ring/flash events

Fixed-size SVG pools, created once; per-frame just re-attributes existing nodes (no create/destroy).
- `OT.fx.initPools({sparksEl, ringsEl, flashesEl, sparks?, rings?, flashes?, sparkFill?, ringStroke?,
  flashFill?, sparkAltColor?})` — call once in `setup()`. Defaults: 90/6/3 pool sizes, white sparks,
  `url(#flashGrad)` flash fill (define that gradient in your DOM). `sparkAltColor` is the color used on
  ~45% of a burst's sparks regardless of the burst's own `color` (matches the original hand-tuned look).
- `OT.fx.burst({t0,x,y,n,speed,life,seed,dir?,spread?,color?})` — queues a radial particle burst.
  `dir` omitted = full 360° spray; `seed` drives per-spark hash variance (keep bursts' seeds distinct).
- `OT.fx.ring({t0,x,y,r0,r1,life,w?,inward?})` — an expanding (or `inward:true` contracting) ring.
- `OT.fx.flash({t0,x,y,r0,r1,life,peak?})` — a radial flash (opacity ramps by `peak`).
```js
OT.fx.burst({ t0: T.launch, x: L0.x, y: L0.y, n: 20, speed: 900, life: 0.55, seed: 3, color: "#fff" });
OT.fx.ring({ t0: T.launch, x: L0.x, y: L0.y, r0: 30, r1: 260, life: 0.6, w: 5 });
```
- `OT.fx.renderSVG(t, cam)` — draws all queued events into the pools for this frame; call once per
  `render(t,cam)`.
- `OT.fx.worldTf(ctx, cam)` — sets a 2D context's transform to match `#world`'s camera transform (same
  math as `OT.cam.applyWorld`/`OT.w2s`, expressed as a canvas matrix). Call before any world-space
  canvas drawing.
- `OT.fx.renderCanvas(ctx, t, cam)` — draws the SAME registered burst/ring/flash events onto a 2D
  canvas instead of the SVG pools: additive `"lighter"` compositing, a radial-gradient flash, rings,
  and bursts with gravity plus a two-color mix. `renderSVG` ignores the extra per-event fields below,
  so using both renderers off the same registered events is safe. Optional per-event fields (hex
  colors): `burst.grav` (world-units, default `260`), `burst.col2` (secondary spark color, default the
  pool's `sparkAltColor`), `ring.ringColor` (default `"#ffffff"`), `flash.flashColor` (default
  `"#ffffff"`). A ring's `lineWidth` is divided by `cam.s` before being set on the context: since
  `OT.fx.worldTf`'s canvas transform already scales world-space drawing by `cam.s`, pre-dividing keeps
  the ring's STROKE a constant on-screen width under zoom (the ring's own radius still scales normally,
  since it's drawn at its true world radius through that same transform).
  **Contract: `renderCanvas` calls `OT.fx.worldTf` internally and always leaves `ctx` exactly as it found
  it** (`ctx.save()`/`ctx.restore()` around all of its drawing, restoring `globalCompositeOperation` too)
  — a caller must be able to `clearRect` the full canvas on the very next frame without first resetting
  the transform itself. Before this was fixed, the leftover world-space transform made a caller's
  `clearRect(0,0,FMT.w,FMT.h)` clear the wrong (moved/scaled) screen rect on the next frame, so FX drawn
  outside that rect never got erased — a fan of stacked rings/bursts persisting all the way to the final
  lockup in a real render. Callers should still reset to identity before their own `clearRect` as a second,
  defensive line of protection (`ctx.setTransform(1,0,0,1,0,0)`, as `template/assets/brand/acts.js` and
  `examples/demo/assets/brand/acts.js` both now do) rather than relying on this contract alone.
```js
OT.fx.burst({ t0: T.launch, x: 0, y: 0, n: 20, speed: 900, life: 0.55, seed: 3, color: "#fff", grav: 320, col2: "#ffd27a" });
OT.fx.worldTf(ctx, cam);        // once per frame, before any world-space canvas drawing
OT.fx.renderCanvas(ctx, t, cam);
```

## `ot-3d.js` — lit polygon faces, shadow, trail

The hero object's own geometry (its fold states, e.g. a paper plane's `planeFaces(s)`) is brand code —
this module only projects/paints/pools faces it is handed.
- `OT.threeD.material({dir, lit, shade, ambient?, diffuse?, specPow?, spec?, creaseRGB?, strokeWidthK?})`
  → `{shade(normal), creaseRGB, strokeWidthK}`. `dir` = light direction vec3, `lit`/`shade` = `[r,g,b]`
  the material lerps between by diffuse term. Build once per hero material.
- `OT.threeD.makePool(parentEl, count, facesPerItem, faceAttrs?)` → `[{g, faces:[...]}]`, `count` groups
  each with `facesPerItem` pooled `<polygon>` children.
- `OT.threeD.drawFaces(slot, rawFaces, cam, opacity, material)` — `rawFaces` = your geometry function's
  output, `[{pts:[[x,y,z],...], flap?, fold?}, ...]` in world space. Projects, z-sorts (painter's
  algorithm), paints each face via `material.shade(faceNormal)`, strokes creases via `material.creaseRGB`.
```js
const faces = s ? planeFaces(s) : null;            // brand geometry, world space
OT.threeD.drawFaces(planeSlots[i], faces, cam, 1, MATERIAL);
```
- `OT.threeD.drawShadow(poly, rawFaces, z, cam, opts?)` — convex-hull (monotone chain) cast shadow of
  the flattened, z-offset silhouette. `opts`: `{zOff,dxK,dyK,pxK,pyK,opBase,opK,opMin,opMax}`, all default
  to the values the the original demo port uses (safe to omit).
- `OT.threeD.drawTrail(slot, fn, t0, t1, t, cam, opts)` — motion-blur ribbon. `fn(tt) -> {x,y,psi,sc,z}|null`
  samples a moving object's pose (`psi` = heading rad). `opts: {width, tailLen, zFlatten?, N?, minSpan?,
  lookback?}`. `tailLen` is in world units at `sc=1` (the original derived it from the hero's own sheet
  height — pass your own hero's equivalent constant).
- `OT.threeD.makeTrailPool(parentEl, count, gradStops, defsParentEl)` — `gradStops` = array of `<stop>`
  attribute objects (your brand's trail gradient colors), one `<linearGradient>`+`<path>` per slot.

## `ot-atmos.js` — bokeh, dot-grid streak, grain, world-tracked glow

- `OT.atmos.bokeh({total, frontStart, colors, backEl, frontEl, back:{d,wx,wy,r,a}, front:{d,wx,wy,r,a}})`
  → array of particle handles, already appended as `<i>` elements. Each of `d/wx/wy/r/a` is `[base,span]`;
  actual value = `base + OT.hash(i*seed)*span`. Hash seed constants are engine-internal (arbitrary,
  reproduce the source's placement) — only the ranges/colors/counts are brand config. Call once in `setup()`.
- `OT.atmos.renderBokeh(list, t, cam, vx, opts?)` — per-frame position/opacity/stretch. `opts`:
  `{swayX,freqX,swayY,freqY,vk,vMax,stretchK,margin}`, default to the the original demo port's tuning.
- `OT.atmos.renderDots(el, bl, baseCSS, opts?)` — camera-speed dot-grid streak via `background-image`.
  `baseCSS` is the resting (no-streak) background-image string. `opts.color` = `'r,g,b'` (**no default
  brand color** — always pass your own). Caches per-element so an unchanged `bl` bucket skips a redundant
  style write — this is a perf cache only, it never changes what renders for a given `(el, bl)`.
- `OT.atmos.grainJitter(el, frame, opts?)` — per-frame film-grain `translate()` jitter (`opts: {amp,seedB}`).
- `OT.atmos.applyGlow(el, screenX, screenY, opacity, scale?)` — thin transform/opacity setter for a
  world-tracked glow. Brand computes the world position (via `OT.w2s`) and its own choreography/clamp;
  omit `scale` for a glow that shouldn't breathe/scale (matches the original's secondary glow).
- `OT.atmos.makeMotes(n, seed, opts?)` → array of `n` particles (hash-seeded, deterministic), for a
  canvas dust-mote layer. The wrap box is `OT.fmt.w/h` plus a margin (default `140` both axes,
  overridable via `opts.margin`/`marginX`/`marginY`) — express any fixed reference box as `w/h +
  2*margin` rather than a literal. `opts`: `{margin, marginX, marginY, r:[base,span], d:[base,span],
  sp:[base,span]}` (depth `d`, radius `r`, vertical drift speed `sp`). `seed` decorrelates multiple
  independent mote fields. The returned array carries its own wrap geometry (`.w/.h/.mx/.my`).
- `OT.atmos.drawMotes(ctx, t, cam, motes, opts?)` — per-frame draw of a `makeMotes()` list onto a 2D
  context: additive, screen-space, with camera parallax and a slow per-mote twinkle. Pure function of
  its arguments (seek-safe). `opts`: `{color:"r,g,b"` (no default brand color — always pass your own)
  `, alpha, swayX, freqX, driftY, freqY, parallax, fadeFrom, fadeTo}`.
- Mote seeds are decorrelated as `k = i + seed*7919` (a large-prime multiplier keeps each seed's index
  range from re-colliding with another's in `OT.hash`), so two `makeMotes()` calls with different seeds
  are independent fields, not near-duplicates — `seed:0` is unchanged from `k = i`.
```js
var motes = OT.atmos.makeMotes(70, 1, { r: [0.8, 2.6] });   // once in setup()
OT.atmos.drawMotes(ctx, t, cam, motes, { color: "255,255,255" });  // every frame, after OT.fx.worldTf/renderCanvas
```

## `ot-backdrop.js` — the per-brand background world (tokenised)

Loaded after `ot-atmos.js`. Old projects never load it (their own `index.html`/`acts.js` hard-code the backdrop), so
`sync-engine` adding the file changes nothing they render (proved with `frame-compare.py`: 900 frames, min PSNR
50.35 dB, min SSIM 0.994, identical to encoder noise). It does not modify any other engine file.

- `OT.backdrop.config(src?)` -> the resolved config. Per field: explicit `--atmos-<k>` CSS var > `OT_BRAND.atmos.<k>` >
  derived from the brand's tokens (`--bg` -> the 3 gradient stops, `--accent`/`--accent-2` -> glow/glow2, `--ink` ->
  grid/ink) > **neutral** default (`B.NEUTRAL`, cool slate; never warm). Fields: `treatment bg glow glow2 grid gridAlpha
  vignette vignetteAlpha mode corners intensity` (+ `OT_BRAND.atmos.bokeh:["#hex",...]`). `vignetteAlpha` is clamped to
  0.58 (auditor: >= 0.6 is opaque). `mode` auto = light when `--bg` luminance > 0.55.
- `OT.backdrop.init(src?)` -- call once in `setup()`. Paints `#bg`, `#glow1/2`, `#vignette`, the `#dots` colour and
  the corner-bracket colour from the config, sets `data-layout-ignore` on the vignette, and (for canvas treatments)
  inserts `<canvas id="bgfx" data-layout-ignore data-backdrop>` before `#world` (hides `#dots`). `dots` builds bokeh.
- `OT.backdrop.render(t, cam)` -- call every frame from `render()`. Pure function of `(t, cam)`; no state carried.
- Treatments (`OT.backdrop.TREATMENTS`): `dots` (DOM dot grid with camera-speed streak + bokeh), `stars` (3 parallax
  layers, flares, milky band, deterministic shooting stars), `topo` (marching-squares contours over a drifting noise
  field), `blueprint` (minor/major grid, registration crosses, dashed construction arcs, scan sweep), `paper` (fibres,
  creases, drifting soft shadows/lights; for light brands), `aurora` (additive ribbon curtains + rays), `halftone`
  (rotated print-dot screen following a moving light). All scatter with the integer hash `OT.backdrop.hash(i, salt)`
  (`OT.hash` is sin-based and clusters when two calls use multiples of one index). No `Math.random`/`Date.now`, no SVG filter.
- `OT.backdrop.drawTo(ctx, name, t, cam, cfg, state?)` / `OT.backdrop.build(name, cfg)` are the pure entry points the tests use.
- The probe's fx-clean gate skips canvases marked `data-backdrop` (a persistent backdrop is not stuck FX); the `pure`
  gate still checks it.
- Scaffold: `new-reel.mjs new ... --atmos <t> --frame frame.md [--base --glow --glow2] [--register]`; pitch check
  `new-reel.mjs atmos-check`. Tests: `scripts/tests/test_backdrop.sh`.

## `ot-hud.js` — timecode, rec blink, status meter/dots, caption reveal

- `OT.hud.timecode(t, fps)` → `"00:00:SS:FF"` string (SMPTE-style, no HH:MM — under a minute always).
- `OT.hud.recBlink(t, opts?)` → opacity number. `opts: {period,duty,on,off}` default `{1.0, 0.62, 1, 0.25}`.
- `OT.hud.cascadeLabel(rules, fallback)` — `rules = [{test:()=>bool, label:string|()=>string}, ...]`
  evaluated in order; the **last** passing rule's label wins (mirrors an if-cascade where later
  conditions overwrite earlier ones — not a sorted time-track, since conditions can be arbitrary booleans).
```js
OT.hud.cascadeLabel([
  { test: () => t >= T.press, label: "SENDING" },
  { test: () => t >= T.launch, label: () => "DISPATCHING " + landed + "/5" },
], "DRAFT");
```
- `OT.hud.layout(parts, opts?)` — per-aspect HUD placement: a PURE function of `OT.fmt` (no time
  dependence), writes inline px `left/top/right/bottom` onto whatever elements are passed. Call once
  from `setup()`. `parts = {corners:[tl,tr,bl,br], brand, timecode, meter, captions}`; any part may be
  `null`. **16:9**: corners sit on the safe-box corners; brand/timecode/meter/captions reproduce the
  proven 16:9 reference reel's HUD placement. **9:16** (method.md §7): brand at the safe top-left,
  timecode at the safe top-right, the meter dropped below the timecode, captions in the safe bottom
  band, left-aligned. `opts` overrides any inset — 16:9: `{xInset, topInset, meterBottom,
  captionBottom}`; 9:16: `{meterTop}`.
```js
OT.hud.layout({ corners: [tl, tr, bl, br], brand: hudBrandEl, timecode: hudTcEl, meter: hudMeterEl, captions: capEl });
```
- `OT.hud.statusDots(dotEls, onFlags, onColor, offColor, onShadow)` — N boolean-driven status lights.
- `OT.hud.capIn(tl, sel, t0, t1)` — caption reveal: small label slides in, the line clips up-in then
  clips up-out at `t1`. Registers 4 tweens on `tl`. Expects `sel + " small"` and `sel + " .ln span"`.

## `ot-lockup.js` — logo lockup mechanics

- `OT.lockup.initMask(selectors)` → `[{p, L}]` where `L` is `getTotalLength() + 4`, one per path: sets
  `stroke-dasharray` to `[L, L+40]` (i.e. `[getTotalLength()+4, getTotalLength()+40]`) so a
  `stroke-dashoffset` sweep draws it on. Call once in `setup()`.
- `OT.lockup.drawMask(mask, progresses)` — `progresses[i]` (0-1) sets `mask[i]`'s dashoffset to
  `mask[i].L * (1 - progresses[i])`; a finished draw-on (`progresses[i] === 1`) is dashoffset `0`. Per-frame.
- `OT.lockup.comet(el, pathEntry, q, {rMax, rMin?, backOff?, rampT0?, rampT1?, ease?})` — a glowing head
  riding `pathEntry` (from `initMask`) at progress `q` (0 when off), radius ramps in over `[rampT0,rampT1]`.
- `OT.lockup.tileBloom(tl, sel, t0, {fromScale?,svgOrigin,duration?,ease?})` — back-out scale/opacity pop-in.
- `OT.lockup.markExit(tl, sel, t0, {dx,dy,scale,duration?,ease?})` — the mark slides/scales away.
- `OT.lockup.wordmarkReveal(tl, sel, t0, {xPercentFrom?,duration?,ease?,stagger?,layout?})` — per-letter
  (`sel + " span"`) stagger reveal inside an `overflow:hidden` clip — the "slide from behind the mark"
  look. `opts.layout` omitted (or `"row"`) reproduces the original behavior exactly (`xPercent -130 ->
  0`, horizontal slide); `layout:"stack"` rises up instead (`yPercent` from `opts.yPercentFrom ?? 110`
  to `0`) — see method.md §7.
- `OT.lockup.plan(cfg)` — PURE geometry, no DOM/time: given the mark/wordmark sizes a brand measured
  once in `setup()` plus spacing, returns where the lockup group should sit for the current
  `OT.fmt.layout` (or `cfg.layout`). `cfg: {markW, markH, wordW, wordH, gap?, vGap?, taglineH?,
  taglineW?, urlH?, urlW?, layout?}`. **row** (16:9): wordmark sits right of the mark, vertically
  centered. **stack** (9:16): the
  mark sits above the wordmark, both horizontally centered. Either way the mark+wordmark group is
  centered in `OT.fmt.safe`, and a single `scale <= 1`
  shrinks the WHOLE group (mark, wordmark, gap, tagline, url) uniformly whenever the configured sizes
  would overflow the safe box. The fit width is `stackW = max(groupW, taglineW, urlW)` — pass your
  measured `taglineW`/`urlW` (default 0, i.e. not considered) whenever the tagline/url text could be
  wider than the mark+wordmark group, e.g. a long line in 9:16's narrower safe box, or it can overflow
  `OT.fmt.safe` even though the group above it fits. `taglineH`/`urlH` still drive the stack's height and
  `tagline`/`url`'s vertical position either way; only the WIDTH used for the fit-scale changes. Returns
  `{layout, scale, mark:{cx,cy}, word:{x,y,w,h},
  tagline:{cx,y}|null, url:{cx,y}|null, group:{x,y,w,h}}` — all positions are SCREEN-space px, the same
  space as `OT.fmt.safe` (title-safe is inherently a screen concept). If your lockup elements live
  outside `#world` (like the HUD — recommended for a brand-new reel's lockup, since it decouples the
  hold from wherever the camera happens to be), these are their final `left/top`/`cx,cy` directly. If
  they live INSIDE `#world` (e.g. the mark is the same DOM node as your flying hero object, continuing
  its world-space presence — the existing port's approach, whose camera track does NOT settle to
  neutral at the lockup: it tracks the hero's own landed position), convert through the camera's
  inverse transform at `t0` before feeding `opts.markFrom`/computing deltas.
- `OT.lockup.play(tl, els, plan, t0, opts?)` — schedules a lockup using the EXISTING primitives above,
  driven by a `plan()` result. `els = {mark, wordmark, tagline?, url?, sheen?}` (selectors, passed
  straight through). `opts.markFrom:{cx,cy}` is the mark's CURRENT center at `t0` (default = `plan.mark`,
  i.e. no translation — only `opts.markScale ?? 1` times `plan.scale` is applied); `opts.markScale` is
  the brand's own pre-safe-fit shrink for the mark. `opts.word/tagline/url` pass through to
  `wordmarkReveal`/`reveal` (layout is forced from `plan.layout`); `opts.sheen:{xFrom,xTo,...}` plays an
  optional sheen (skipped if omitted — sheen coordinates are element-local SVG space, which `plan()`
  cannot know). `opts.*Delay` overrides each step's offset from `t0`.
```js
var plan = OT.lockup.plan({ markW: markBox.w, markH: markBox.h, wordW: wordBox.w, wordH: wordBox.h, gap: 24, taglineH: 70, urlH: 30 });
OT.lockup.play(tl, { mark: "#mark", wordmark: "#wordmark", tagline: "#tag1", url: "#url" }, plan, T.impact + 0.5, { markFrom: { cx: MARK.cx, cy: MARK.cy } });
```
- `OT.lockup.reveal(tl, sel, t0, {fromY?,duration?,ease?})` — generic fade+slide-up (tagline line 1, url).
- `OT.lockup.slamIn(tl, sel, t0, {fromScale?,fromBlur?,duration?,ease?,transformOrigin?})` — blur+oversize
  pop down to rest (a "kinetic-beat-slam" emphasis reveal — tagline accent word).
- `OT.lockup.sheenSweep(tl, sel, t0, {xFrom,xTo,duration?,ease?})` — sweeps an SVG attr (typically a
  gradient rect's `x`) across text for a light-sheen pass.

## DOM contract the engine expects

- `#root[data-composition-id][data-width][data-height][data-duration][data-fps]` — required; `OT.fmt`
  reads these once (lazily). No silent 1920×1080/15s fallback: a missing attribute is a real error.
- `#world` — the camera-tracked layer; `OT.cam.applyWorld` sets its `transform` every frame. **Never put
  an SVG `filter:url()` on `#world`** — its filter region clips content positioned off-canvas in world
  space (this is why dot-grid/bokeh streak themselves instead of using a motion-blur filter).
- `#fx` (SVG) with pool group children your brand creates via `OT.threeD.makePool` / `OT.fx.initPools` /
  `OT.threeD.makeTrailPool` — group ids are your choice (e.g. `#planes`, `#ghosts`, `#trails`, `#shadows`,
  `#sparks`, `#rings`, `#flashes`); the engine takes element references, not ids.
- HUD parts: whatever elements you pass to `OT.hud.*` — no fixed ids required by the engine itself.
- Lockup: whatever elements you pass to `OT.lockup.*`. `initMask` needs valid, measurable SVG `<path>` d
  attributes already in the DOM (draw the end-state in static markup first, per the layout contract).
- `window.__timelines.main` — `OT.boot` registers this internally. HyperFrames' static contract guard
  scans **index.html's own inline script text** for the registration pattern and does not resolve
  external `<script src>` files, so the tiny inline boot script must *also* contain the literal pattern
  (`window.__timelines["main"] = OT.tl;` after `OT.boot(...).then(...)`) even though it is redundant with
  what `OT.boot` already did. See the the original demo port's `index.html` for the exact copy-pasteable snippet.

### The template's layer stack (`template/index.html`)
(The backdrop layers `#bg`, `#glow1/2`, `#dots`, `#vignette` and the corners are painted from tokens by `OT.backdrop.init()`; the CSS colours in `index.html` are only a neutral fallback.)

- **World space vs. screen space.** `#world` (camera-transformed by `OT.cam.applyWorld`) contains only
  `#dots` (the dot-grid streak) and `#brandWorld` (the hero's container — the template's `#heroToken` lives
  here). Everything else under `#stage` is a screen-space sibling of `#world`, never camera-transformed:
  `#hud` and `#lockup` sit outside it, and so does the `#fx` canvas. A brand's flying geometry belongs
  inside `#brandWorld`'s subtree so the camera transform carries it for free; anything meant to hold a
  fixed screen position (HUD, lockup, captions) belongs outside `#world` instead.
- **Why the lockup lives outside `#world`.** `OT.lockup.plan` returns pure screen-space geometry — the same
  px space as `OT.fmt.safe` — so keeping `#lockup` a sibling of `#world` means those returned positions are
  final `left/top` with no camera-inverse conversion needed, and the hold reads correctly no matter what the
  camera is doing when it lands. (A brand can instead keep its mark *inside* `#world`, continuing a flying
  hero's own DOM node into the lockup — see `OT.lockup.plan`'s note above on `opts.markFrom` — but that
  camera track then can't settle to neutral, since the mark's world position is what's landing on screen.)
- **The `#fx` canvas is screen space too, drawn to look like world space.** The template's `#fx` is a plain
  `<canvas>` (a sibling of `#world`, `position:absolute; inset:0`), not the SVG-with-pool-children shape the
  bullet above describes for `OT.fx.initPools`/`OT.threeD.makePool`/`makeTrailPool` — a `<canvas>` can't host
  DOM pool children. Instead, every frame, `OT.fx.worldTf(ctx, cam)` sets the canvas 2D context's transform
  to match `#world`'s own camera transform, and `OT.fx.renderCanvas(ctx, t, cam)` then draws the same
  registered burst/ring/flash events (world-space `x,y`) through it. The DOM element never moves; what's
  painted onto it is positioned as if it lived inside `#world`.
- **`data-layout-ignore`** marks decorative full-frame overlays the layout auditor should skip entirely —
  the template puts it on `#vignette` and `#grain` (SKILL.md "Hard-won rules" covers the vignette-alpha and
  occlusion-hatch details for content that *isn't* skipped).
- **`<!-- SFX:BEGIN --> … <!-- SFX:END -->`** bracket the generated `<audio>` block. They sit right after
  `#stage`'s closing tag and before the `<script>` includes, immediately below the comment marking where a
  `<audio id="bgm">` mounts (sound.md §6). `sfx-cues.mjs html --write` replaces everything between the two
  markers and throws if either is missing — never hand-edit inside them.
- **Script include order**: `assets/vendor/gsap.min.js`, then the 8 `assets/engine/ot-*.js` files (core →
  camera → fx → 3d → atmos → hud → lockup, per "Frame flow" above), then `assets/logo/logo.js`, then
  `assets/brand/brand.js`, then `assets/brand/acts.js`, then the inline boot script. Logo/brand data must
  load before the brand's own hero/acts files, since their `setup()` reads `window.OT_LOGO`/`window.OT_BRAND`.
- **The inline boot script** is not trimmable boilerplate: besides calling `OT.boot({fonts, onMissingFont,
  setup, build, render})`, it must contain the literal `window.__timelines["main"] = OT.tl;` textually (see
  the bullet above) — a lint scans the inline script's own source text, not what running it produces.
- **`window.OT_BRAND`** shape (`assets/brand/brand.js`): `{name, url, tagline:[line1,line2], hudLabel}` —
  the flat JSON object the template's `setup()` reads verbatim for the wordmark, url, tagline and HUD label.
- **`window.OT_LOGO`** shape (`assets/logo/logo.js`): `{viewBox:[x,y,w,h], tile?:{color,bbox,rx},
  components:[{id,color,d,bbox,area_frac,iou}, ...]}` — the same shape `trace-logo.py`'s `logo-paths.json`
  writes and `new-reel.mjs logo` validates before wrapping it as `window.OT_LOGO = {...}`.
- **Fonts**: the template ships Geist + Geist Mono as local `.woff2` files under `assets/fonts/` (with their
  license, `OFL.txt`), declared via `@font-face` in `index.html`'s `<style>` and named in `OT.boot`'s `fonts`
  array so `OT.fontsReady` can verify they actually resolved (see "Rules" below).

## Rules

- **Seek-safety**: every `OT.*` render function is a pure function of its arguments (`t`, `cam`, pool
  refs). No `Math.random`, `Date.now()`, `performance.now()`, or state written during render that a later
  frame reads. The only "state" is: pools created once in `setup()`, and memoized pure lookups.
- **`OT.fmt` is a lazy getter, not a value computed at script-load time.** HyperFrames' render/check
  pipeline may evaluate an externally-sourced `<script src>` before the body DOM is fully attached (GSAP
  itself tolerates this because it never touches the DOM at load time). Any engine code that reads the
  DOM at module-load time will intermittently see a null `#root` — defer it (a lazy getter, or code
  inside a function only called from `OT.boot`'s callbacks).
- **No SVG filter on `#world`** (see DOM contract above).
- **Fonts**: always call `OT.fontsReady` (via `OT.boot`'s `fonts` option) before `build()`/first paint.
  `document.fonts.check()` lies for silently-fallen-back fonts — trust `OT.fontsReady`'s measurement
  check, not `document.fonts.check()`, when you need to know if a family really resolved. Note:
  HyperFrames' own compiler auto-fetches and injects `@font-face` rules for Google Fonts it detects in
  use, even ones with no explicit `@font-face` in your CSS (confirmed via the the original demo port: "Space Mono"
  has no local `@font-face`/file, yet renders correctly and pixel-identically in both the pre-port and
  ported renders — see PORT-NOTES.md "Space Mono finding" for the evidence).
- Every visual number (color, position, timing, pool size) a brand cares about should be a parameter into
  an `OT.*` call, not a literal inside `assets/engine/*.js`. If you find yourself editing an engine file
  to make a new brand look right, that value should have been a parameter — file it as an engine gap.
- **A `%` height on an absolutely positioned box inside an unsized parent resolves to 0.** The template's
  `#wordmark` is `position:absolute` inside `#wmClip`; `setup()` measures `#wordmark`'s natural size to
  build the lockup plan *before* `#wmClip` has been given a size, so a `height:100%` there would resolve to
  0 and clip every letter. The fix is `height:auto` on `#wordmark` (`template/index.html`, the `#wordmark`
  rule and its comment), plus a `setup()` guard that throws if any measured lockup part is 0 in either
  dimension (`template/assets/brand/acts.js`, the `guard:` comment) — fail loudly on a collapsed box rather
  than build `OT.lockup.plan` from one.
- **A lagged progress on someone else's end-time never reaches 1 on its own.** `OT.lockup.comet` only zeros
  its radius at `q <= 0` or `q >= 1`. A second, trailing comet computed as `ringQ - 0.08` caps at `0.92` and
  never crosses 1, so it parks lit on the finished ring forever. Give a lagged comet its own `OT.prog`
  window that *ends* at the same time as the one it trails, so both reach exactly 1 at the same moment
  (`template/assets/brand/acts.js`, the `cometB` comment).
- **Define a hero's path in SCREEN space, not world space.** Compute one screen point per `t` and convert it
  through that frame's own camera with `OT.s2w(sx, sy, cam)` — the object is framed by construction,
  whatever the camera does that frame. Start it BEHIND its target along the camera's travel direction so it
  only moves forward in world space; a world-space lerp gets outrun by a camera whip and strands the hero
  off-frame (`template/assets/brand/acts.js`, the "hero path, in SCREEN space" comment).
- **`OT.lerp` is scalar-only and silently wrong on arrays.** `OT.lerp = (a, b, t) => a + (b - a) * t`
  (`template/assets/engine/ot-core.js:16`) does arithmetic directly on `a`/`b`; pass it a vec2/vec3 array
  and `b - a` on arrays produces `NaN` with no error. Use `OT.lerpV(a, b, t)`
  (`template/assets/engine/ot-core.js:17`) for vectors/arrays — it branches on `typeof a === "number"` and
  otherwise maps `OT.lerp` component-wise; it's also safe to call on plain scalars.

## Porting / new-brand checklist

1. Copy `assets/engine/*.js` from this skill's `template/assets/engine/` verbatim (do not edit).
2. Author `<brand>-hero.js`: your hero object's pose/flight functions and its `planeFaces`-equivalent
   geometry function (state -> `[{pts, flap?, fold?}]` in world space), plus an `OT.threeD.material(...)`.
   Do **not** wrap it in an IIFE — see "brand file scoping" below.
3. Author `<brand>-acts.js`: your timing table, data tables (cards/tracks/whatever your story needs),
   `setup()` (register `OT.cam.tracks`/`addShake`, build pools via `OT.threeD.makePool` /
   `OT.fx.initPools` / `OT.threeD.makeTrailPool` / `OT.atmos.bokeh` / `OT.lockup.initMask`, grab DOM
   refs), `build(tl)` (every GSAP tween + FX event registration), `render(t,cam)` (redraw everything,
   in the same order your `renderAll` used to run: world already applied by the engine, then atmosphere,
   then 3D objects, then FX, then interactive/text elements, then HUD last).
4. Wire `index.html`: DOM+CSS+SFX block stay hand-authored per the [hyperframes-core] composition
   contract; script includes are the 7 engine files, then `<brand>-hero.js`, then `<brand>-acts.js`, then
   the inline `OT.boot({...})` call (copy the `window.__timelines` redundant-registration snippet — see
   DOM contract above).
5. Run `hyperframes check`; fix `missing_timeline_registry` first if it appears (see DOM contract).
6. Render, `snapshot` a contact sheet at your story's beat times, eyeball it.

**Brand file scoping**: `<brand>-hero.js` and `<brand>-acts.js` are **not** IIFE-wrapped — they share
identifiers as top-level globals, the same way the original single-file reel shared one closure. This is
a deliberate, minimal deviation from the engine files' `OT`-namespaced IIFE pattern (see PORT-NOTES.md
"Deviations" for why). Two consequences: (a) if your hero file needs a math alias engine files don't
already expose as a bare global (only your hero file's own `var`-aliases carry over), redeclare it with
`var`, never `const`/`let` — a `let`/`const` redeclaration of a name a sibling script already declared
via `var` is a `SyntaxError`; (b) pick identifier names that won't collide between your two brand files
(the port's hero/acts files don't overlap — see engine.md's source for the exact name lists if you want
a template).

## Scaffolding (`new-reel.mjs`)

Five commands, run as `node scripts/new-reel.mjs <command> ...`. Exit
codes throughout: `0` ok, `1` usage error, `2` refusal — every refusal is checked, and reported, **before**
any write. Template-dir resolution (every command that takes `--template`): `--template <dir>` (if passed)
> `$OT_TEMPLATE_DIR` (if set) > `<skill>/template` (default).

- **`new <dir> --brand "<Name>" --format <fmt> [--url <domain>] [--tagline "<a>|<b>"] [--demo] [--template <dir>]`**
  — copies the template into `<dir>`, then rewrites the root's `data-width/height/duration/fps`, `OT_BRAND`
  (`name` uppercased into `hudLabel` too), and, if passed, the tagline/url. `--demo` overlays
  `examples/demo/` over the template *before* that rewrite. `--url` defaults to `example.com`; `--tagline`
  defaults to keeping the template's own. Refuses (exit 2): `<dir>` exists and is non-empty; the template or
  its SFX library is missing; `--demo` given while `examples/demo` isn't built yet; the template (or, with
  `--demo`, `examples/demo`) is an ancestor or descendant of `<dir>`; any symlink is found anywhere in the
  source tree being copied.
- **`derive <master> <new> --format <fmt>`** — copies `<master>` into `<new>` (`<master>`'s `index.html`
  root must carry `data-composition-id`), excluding `renders/`, `snapshots/`, `.thumbnails/`,
  `.hyperframes/`, `node_modules/` and `audio/mix-check*.wav`; rewrites the format on both the copied
  `index.html` and `BRIEF.md`'s frontmatter; never writes under `<master>`. Refuses (exit 2, before any
  write) if `<new>` is nested inside `<master>` or vice versa — e.g. `derive . ./vertical` — or if `<master>`
  contains a symlink. Prints a 7-item re-author checklist: the `T` table + anchors (method.md §6), new
  camera tracks, the layout change (row→stack + vertical travel for 9:16, or the 16:9 outcome-row layout,
  per method.md §6/§7), a `music-fit.py` re-fit command, retiming `audio/cues.mjs`, regenerating the SFX
  block (`sfx-cues.mjs html --write`), and the phase 8 gates. The printed `music-fit.py` line correctly uses
  two different tokens: the bare integer `{6,15,30}` for the `--format` flag (`--format 6s` would be
  rejected with `invalid int value`) and the `<len>s` form (e.g. `bed-6s.wav`) only in the output filename,
  per sound.md's `<brand>-bed-<len>s.wav` convention. It points the source argument at a `<source-take.wav>`
  placeholder (or the path recorded in the master's `BRIEF.md` `music:` frontmatter field, if one looks like
  a file path) — never at `assets/music/`'s own contents, which only ever hold the already-fitted bed, not
  the original take to re-fit from.
- **`sync-engine <dir> [--template <dir>]`** — re-copies `<template>/assets/engine/*.js` into
  `<dir>/assets/engine/`, comparing by sha256, and prints one line per file: `unchanged` / `updated` /
  `added`. `<dir>` must already contain `index.html`.
- **`logo <logo-paths.json> <dir>`** — validates a `trace-logo.py` manifest (`viewBox` is an array of
  exactly 4 numbers; `components` is a non-empty array, each with a string `d`) and writes
  `<dir>/assets/logo/logo.js` as `window.OT_LOGO = {...};`, stripping the manifest's `source` field to its
  basename so no local filesystem path leaks into the project. Refuses (exit 2) on a failed validation.
- **`formats`** — lists the 6 supported format tokens with width/height/duration/fps (see "## Formats"
  below for the same numbers plus anchors/sections).

## QA probe (`probe-reel.mjs`)

`probe-reel.mjs` is a real-browser QA gate for a scaffolded project — it renders the actual page in headless
Chrome and reads the live DOM, rather than parsing source or trusting a screenshot skim:

```
node scripts/probe-reel.mjs <projectDir> [--hero <sel>[,<sel>...]] [--strict]
                                                                [--absent <sel>[,<sel>...]] [--no-comets] [--json]
```

It loads `<projectDir>/index.html` via `file://`, waits (15s timeout) for `window.__timelines.main` to
appear, then seeks the paused GSAP timeline on its own sampling grid (`t = k/30`, independent of the
project's own fps) and checks six numeric gates against the rendered DOM:

- **(a) lockup**, at `t = len − 0.2`: `#wmClip` has a real (`w>0, h>0`) box; if `#wordmark` has span
  children, every `#wordmark span` has computed opacity ≥ 0.99, overflows `#wmClip` by ≤ 1.0px, and
  overflows `OT.fmt.safe` by ≤ 0.5px — zero span children FAILS unless `#wordmark` itself is an `<svg>`/
  `<img>`, in which case that element's own effective opacity/safe-overflow is checked instead;
  `#tagline`/`#url` are opacity ≥ 0.99 and overflow safe by ≤ 0.5px; `#mark` overflows safe by ≤ 0.5px AND
  has effective opacity ≥ 0.99, as does its tile group `#tileG`; `#ringPath`'s `stroke-dashoffset` is ≤ 1.0
  (i.e. its draw-on, from `OT.lockup.initMask`/`drawMask`, has actually completed by this gate time, not
  just started).
- **(b) comets**, every frame from `anchors.impact + 1.0` to `len`: every `circle[id^="comet"]` has
  `r <= 0.001` — nothing left glowing on a ring that already finished drawing. Zero matching elements FAILS
  (a selector typo or a comet that was never built is not the same as "extinguished") unless `--no-comets`
  is given, for a reel that genuinely has none.
- **(c) hero**, from the first frame any `--hero` selector match has computed opacity > 0.05 through
  `anchors.impact`: that element's `getBoundingClientRect()` stays inside `OT.fmt.safe` by ≤ 0.5px overflow,
  checked at the bbox CENTER by default or across the WHOLE bbox with `--strict`. `--hero` (default
  `#heroToken`) takes comma-separated selectors, checked as one unit, so a multi-part hero (e.g. a card plus
  separate tiles) can be gated together: `--hero '#card,.tile'`.
- **(d) absent**, only when `--absent` is given, over the whole reel (`t=0` to `len`): none of the given
  comma-separated selectors is ever visible. "Visible" always means EFFECTIVE opacity: the element's own
  opacity times every ancestor's up to `#root`, with `display:none`/`visibility:hidden` anywhere in that
  chain counting as 0 — so a hidden or faded ancestor (e.g. `#lockup`) is never missed. Not checked when
  `--absent` is omitted.
- **(e) fx-clean**, at `t = len − 0.2` (the same lockup-complete time gate (a) uses) and `t = len − 0.05`:
  every `<canvas>` under `#root` must have no pixel with alpha > `200/255`. This targets the "leftover
  world-space `ctx` transform" class of bug (see `OT.fx.renderCanvas`'s contract above): if a caller's
  `clearRect` runs under a stale, camera-shifted transform, part of the canvas never gets cleared and an
  old `"lighter"`-composited draw sits there for many consecutive frames, saturating toward fully opaque
  as later partial draws keep adding into it (observed as exactly `255/255`, frozen at the same pixel
  across both sampled times, in the real defect this gate was added for — a fan of stacked rings still
  visible over the final lockup). The threshold is deliberately not near-zero: a `<canvas>` may legitimately
  host a CONTINUOUS ambient layer alongside transient FX — e.g. the template's `OT.atmos.drawMotes` dust,
  which is still visible at the lockup by design — and a single correctly-cleared frame's ambient composite
  stays well under `200/255` (observed 58-70/255 at worst-case mote overlap) even though it's well above a
  strict "must be zero" bar. `200/255` sits above legitimate single-frame ambient content and below the
  accumulation signature, so it flags the leak without failing on intentional atmosphere.
- **(f) pure**, at K sample times (every `sections` entry's midpoint, plus `impact + 0.3` and `len − 0.05`,
  de-duplicated and clamped to `[0, len]`): the render reached by a COLD seek (`seek(0,false)` then straight
  to `t`) must match BOTH (i) the render reached by stepping FORWARD through the prior ~1s at the project's
  own `fps` (`seek(t,false)` once per frame, starting from `max(0, t-1)`), and (ii) the render reached by
  stepping BACKWARD down from `t+1` (one frame at a time, down to `t`) — for every `<canvas>` under `#root`
  (max abs per-channel pixel diff ≤ `2/255`) and for every `--hero` element's `getBoundingClientRect()`/
  effective opacity/computed `transform` (must be identical). A `getImageData` call that throws (a tainted
  canvas) is an explicit FAIL, not a silently-skipped comparison. Checking both directions catches a render
  that's pure only going forward (e.g. an FX accumulator that never resets/rewinds cleanly), which the
  forward-only check alone would miss. This directly tests "every visual is a pure function of `tl.time()`":
  gate (e) only
  checks a single frame's peak alpha, so a stale-but-sub-saturated leftover (e.g. one uncleared ring frozen
  at alpha 150/255) passes (e) while still being a real history-dependent bug — gate (f) catches it because
  the COLD path never draws that stale ring at all, so the two paths diverge. `probe-reel.mjs` also computes
  a repeat-cold-seek (same `t`, twice) diff at each sample time and reports it as `noise` alongside the
  cold-vs-stepped diff, so a nonzero-but-tiny result can be judged against real engine/GSAP jitter rather
  than an assumed-zero baseline (observed noise floor: `0/255` canvas, `0px`/`0.000` hero, on a clean
  scaffold — any nonzero noise floor is itself worth investigating). All pixel buffers are diffed INSIDE the
  page (one `page.evaluate` per sample time does cold+cold2+stepped capture and diffing together) so raw
  `ImageData` never crosses the Puppeteer serialization boundary — only small summary numbers come back;
  this keeps the gate's added wall time to roughly the render cost of the extra seeks, not JSON-serializing
  a handful of ~8MB 1080p buffers per sample. Hero elements are matched between the two captures by
  **querySelectorAll order (index), not by id/class label** — several real heroes (e.g. a repeated
  `.demoTile` selector) share the same fallback label across every match, so an id-keyed comparison would
  silently diff arbitrary unrelated instances against each other instead of each instance against itself.

**Browser resolution** — never installs anything itself. It scans `~/.npm/_npx/*/node_modules/hyperframes`
for a cached `hyperframes` install (preferring the pinned `0.8.79`, falling back to any other cached
version) to load that install's own `puppeteer-core`, then resolves a Chrome executable in order: (1) the
exact path `npx hyperframes@0.8.79 browser path` prints for that install; (2) a scan of
`~/.cache/puppeteer/chrome-headless-shell`, `~/.cache/hyperframes/chrome/chrome-headless-shell` and
`~/.cache/puppeteer/chrome` (newest mtime first); (3) common system Chrome install paths. A missing browser
or install throws a one-line error to stderr and exits 2 rather than trying to install one.

**`seek(t, false)`**: every seek in this probe calls `.seek(t, false)`, never the bare `.seek(t)`. GSAP's
`timeline.seek()` defaults `suppressEvents` to `true`, which skips `onUpdate` — so `OT.renderAll()` never
runs and the DOM would silently keep showing whatever frame was last rendered (typically the `t=0` boot
frame) instead of `t`. Any other tooling that seeks this timeline must do the same (SKILL.md "Hard-won
rules").

**Flags** (from `probe-reel.mjs --help`):
- `--hero <sel>[,<sel>...]` — comma-separated CSS selector(s) for gate (c); default `#heroToken`.
- `--strict` — gate (c) requires the hero's WHOLE bbox inside safe, not just its center point.
- `--absent <sel>[,<sel>...]` — comma-separated CSS selector(s) that must never be visible (see gate (d)
  above); not checked when omitted.
- `--no-comets` — accept zero matching `circle[id^="comet"]` elements as a pass for gate (b), for a reel
  that genuinely has none. Without it, zero matches FAILS (see gate (b) above).
- `--json` — print one JSON result object (adds `exitCode`) instead of human-readable lines.
- `--help` — print usage and exit 0.

Gates (e) fx-clean and (f) pure have no flag of their own — they always run, over every `<canvas>` found under `#root`
(zero canvases found is a vacuous pass, not an error).

Exit codes: `0` every gate passed; `1` at least one gate failed (read the printed problem/worst-case lines,
or `gates.*.pass` in `--json` output); `2` tool error — bad args, no resolvable browser, `index.html` has no
`data-width`/`data-height`, `window.__timelines.main` never appeared within 15s, or `OT.fmt.anchors` is
`null` (a non-standard-length project outside 6/15/30s — this probe requires `anchors.impact`).

## Formats

`OT.fmt.len` is `Math.round(dur)`. For 6/15/30s reels, `anchors` and `sections` resolve from the
built-in tables below (method.md §6); for any other length both are `null` (no throw — a brand outside
the three proven lengths owns its own timing).

| len | sections (name: t0–t1, seconds) | anchors |
|---|---|---|
| 6  | action 0–2 · journey 2–4 · lockup 4–6 | `{launch:2, impact:4}` |
| 15 | action 0–4 · outcomes 4–8 · proof 8–12 · lockup 12–15 | `{launch:4, turn:8, impact:12}` |
| 30 | action 0–8 · outcomes 8–16 · proof 16–24 · lockup 24–30 | `{launch:8, turn:16, impact:24}` |

Each `sections` entry is `{name, t0, t1}`. Both tables are overridable per-composition via a JSON
attribute on the root, the same pattern as each other: `data-ot-anchors='{"launch":4,...}'`,
`data-ot-sections='[{"name":"action","t0":0,"t1":4},...]'` (malformed JSON is silently ignored, same as
the existing anchors override).

`OT.fmt.safe` — the title-safe box, `{l, t, r, b, x, y, w, h, frac:{l,t,r,b}}`: `l/t/r/b` are margins in
px from each edge, `x/y/w/h` is the box itself in px (`x=l, y=t, w=fmt.w-l-r, h=fmt.h-t-b`), `frac`
holds the margin fractions the px values were computed from. Keep the hero, all copy, and the lockup
inside this box (method.md §7).
- **16:9** — a flat 5% margin on every side (`frac = {l:0.05, t:0.05, r:0.05, b:0.05}`).
- **9:16** — `frac = {l:0.05926, t:0.12, r:0.11481, b:0.22}`, a conservative union of the
  TikTok/Reels/Shorts chrome: the top capture bar + caption stack (top 12%), the bottom action rail +
  caption safe area (bottom 22%), and the side margins used by their action-button rails (left 5.926% ≈
  64px, right 11.481% ≈ 124px, at a 1080-wide frame) — see method.md §7. Both aspects' constants are
  written as decimal FRACTIONS of `w`/`h`, never pixel or resolution literals, so they scale to any
  frame size of that aspect (and never trip the banned-literal check).

`OT.fmt.layout` — `'row'` for 16:9, `'stack'` for 9:16 (overridable via `data-ot-layout`, which accepts
ONLY the literal strings `"row"` or `"stack"` — any other value, e.g. a typo like `"stacked"`, is
ignored and `OT.fmt.layout` keeps the aspect's own default; there is no throw, since a stray/misspelled
override should silently fall back rather than break the render). It's the
default for `OT.lockup.plan`'s `cfg.layout` and what a brand forces into `wordmarkReveal`'s
`opts.layout` for a 9:16 reel: **row** lays the mark and wordmark side by side; **stack** lays the mark
above the wordmark. See `OT.lockup.plan`/`play` and `OT.hud.layout` above for how both consume these
`OT.fmt` fields — neither takes a resolution or aspect parameter directly, by design, so a brand's
`setup()`/`render()` never needs an `if (aspect === ...)` branch of its own.
