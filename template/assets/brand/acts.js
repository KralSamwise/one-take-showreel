/*
 * acts.js -- the one-take-showreel DEMO act. Format-adaptive on OT.fmt alone (len/aspect/layout/
 * anchors/sections/safe) -- no per-format branch beyond reading those fields. Not IIFE-wrapped,
 * same reason as the template (engine.md "Brand file scoping").
 *
 * Chain (method.md style, 8 links): a card TYPES the brand's first line -> FOLDS into a lit 3D
 * token (a thick square prism whose top face carries the mark's own core shape) -> LAUNCHes with a
 * camera whip and spins in flight -> SPLITs into 3 outcome tiles at true aspect ratios (16:9, 9:16,
 * 1:1), shapes only -> COLLAPSEs into 3 growth bars (no numbers) -> FUSEs back into the token ->
 * HOMEs onto the mark as its ring draws on -> LOCKUP.
 *
 * Every handoff is a real transformation with a match point (see the "MATCH POINT" comments at
 * each transition):
 *   fold    : the card squashes to a zero-width sliver (scaleX -> ~0, a real geometric squash, not
 *             a fade) then the token appears at the SAME world point, same size, depth 0 -> 1.
 *   launch  : no position jump -- the token is already at the card's point; FX + camera whip cover it.
 *   split   : the 3 tiles are born AT the token's last point and fly out to their slots.
 *   collapse: each bar starts at its OWN tile's slot (same x, same footprint) as the tile fades.
 *   fuse    : the bars converge back on the center point where the token reforms (depth stays 1).
 *   home    : a continuous screen-space path (pattern 2) lands the token exactly on the mark's
 *             point at impact; the token's core diamond sits on the mark's own (still-hidden)
 *             diamond, so "fuse into the mark" is the same shape/color/position, not a dissolve.
 * 6s drops outcomes+proof entirely (method.md: "saying nothing is truthful") and flies the token
 * straight from launch to home. 30s spends the extra time on holds inside each section, not on
 * more links. 9:16 re-blocks: travel axis flips to Y (whip-tilt), outcomes stack in a column.
 */
var T = {}, FMT = null, els = {}, PLAN = null, RING = null;
var CENTER = null, SLOTS = null, PSTART = null, LEG1_TARGET_S = null, STEADY_CAM = null;
var CARD_WORLD = null, HOME_WORLD = null, LAUNCH_WORLD = null, FUSE_WORLD = null;
var TOKEN_MATERIAL = null, CORE_MATERIAL = null, tokenSlots = null, coreSlots = null, tokenShadowPoly = null;
var CORE_LOCAL = null; // the mark's core shape, parsed once, centered on (0,0) in token-local units
var chars = []; // per-character <text> nodes for the typed line
var hasOutcomes = false, hasProof = false;
var CARD_HW = 160; // half-width of the card/token square, world units (shared so the fold has no size jump)
// the token's face is a faceW x faceW square (world units) -- the exact size both SPLIT (tiles are born
// at this size) and FUSE (bars converge to this size before the token extrudes) match against.
var TOKEN_FACE_W = CARD_HW * 2;
// FOLD_SLIVER: the face-width fraction (of CARD_HW) both the card's own end-of-squash scaleX AND the
// token's own start-of-grow width use -- so the handoff has one continuous silhouette width, never a
// jump from a squashed sliver to a full-size face.
var FOLD_SLIVER = 0.02;
// FOLD_FILL_BLEND: seconds before T.foldEnd over which the card's own fill blends from CARD_RGB toward
// TOKEN_FACE_RGB (the token's flat/frontal shade) -- same pattern as splitSettleK/TOKEN_FACE_RGB at
// split/fuse -- so the fold's hard cut lands on matching color instead of a dark card hard-cutting to a
// near-white token face in one frame (F5a).
var FOLD_FILL_BLEND = 0.15;
var CARD_RGB = null; // the card's own --surface fill, resolved once in setup() for the fold color blend
var TILE_RGB = null, BAR_RGB = null; // tile/bar fill colors, for COLLAPSE's continuous (non-opacity) color morph
var CAP_TEXT = { journey: "In motion.", outcomes: "Every screen.", proof: "Every time." };
// SPLIT_SETTLE / FUSE_SETTLE: the window (seconds, set from OT.B in setup()) over which the token
// stops spinning-and-tilted-3D and settles to a flat, frontal, axis-aligned square BEFORE T.splitAt
// (so it is geometrically identical to the 3 born tiles at the cut) and, symmetrically, the window
// AFTER T.fuseAt over which it re-tilts/extrudes back into a free 3D object once it has reformed.
// Both share tokenDepth()'s own fuseAt-side window (T.fuseAt .. T.fuseAt+OT.B(1)) so depth and tilt
// finish flattening/extruding together -- see tokenTiltK()'s comment for why tilt (not just depth)
// has to reach 0 for the flat face to read as an unskewed rect, not a foreshortened parallelogram.
var SPLIT_SETTLE = null;
var TOKEN_FACE_RGB = null; // TOKEN_MATERIAL's own flat/frontal shade -- the fixed target color the
// COLLAPSE bars morph into on their way to FUSE, so bar and reformed-token color are identical at
// T.fuseAt (see render()'s bar fillRgb blend and D3 in the batch report).
var FLAT_TILE_MATERIAL = null; // a normal-independent material (shade(n) always == TILE_RGB) used to
// blend the token's own face color toward the tiles' flat fill during the pre-split settle window.

// blend two materials' shade() output (not their lit/shade inputs -- drawFaces only ever calls
// .shade(n), so blending the OUTPUT color is the one thing guaranteed to work for any material shape)
function blendMaterial(matA, matB, k) {
  if (k <= 0) return matA;
  if (k >= 1) return matB;
  return {
    shade: function (n) {
      var a = (matA.shade(n).match(/[\d.]+/g) || [0, 0, 0]).map(Number);
      var b = (matB.shade(n).match(/[\d.]+/g) || [0, 0, 0]).map(Number);
      var c = [0, 1, 2].map(function (i) { return Math.round(OT.lerp(a[i], b[i], k)); });
      return "rgb(" + c.join(",") + ")";
    },
    creaseRGB: k < 0.5 ? matA.creaseRGB : matB.creaseRGB,
    strokeWidthK: OT.lerp(matA.strokeWidthK, matB.strokeWidthK, k),
  };
}

// ------------------------------------------------------------------ small pure helpers
function hexToRgb(hex) {
  var n = parseInt(String(hex).replace("#", ""), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
function scaleRgb(rgb, k) { return rgb.map(function (v) { return OT.clamp(Math.round(v * k), 0, 255); }); }
// parses a simple "M x,y L x,y L x,y ... Z" path (exactly the shape OT_LOGO's placeholder core
// uses) into a flat list of [x,y] points -- good enough for any straight-edged polygon core.
function parseSimplePolyPath(d) {
  var nums = (d.match(/-?[\d.]+/g) || []).map(Number), pts = [];
  for (var i = 0; i + 1 < nums.length; i += 2) pts.push([nums[i], nums[i + 1]]);
  return pts;
}

function setup() {
  FMT = OT.fmt;
  var A = FMT.anchors, sections = FMT.sections || [], S = {};
  sections.forEach(function (s) { S[s.name] = s; });
  hasOutcomes = !!S.outcomes;
  hasProof = !!S.proof;

  els = {
    glow1: OT.$("#glow1"), glow2: OT.$("#glow2"), dots: OT.$("#dots"), grain: OT.$("#grain"),
    hudBrand: OT.$("#hudBrand"), timecode: OT.$("#timecode"), tc: OT.$("#tc"), rec: OT.$("#rec"),
    meter: OT.$("#meter"), meterTxt: OT.$("#meterTxt"), captions: OT.$("#captions"),
    mark: OT.$("#mark"), wmClip: OT.$("#wmClip"), wordmark: OT.$("#wordmark"), tagline: OT.$("#tagline"), url: OT.$("#url"),
    corners: [OT.$(".c-tl"), OT.$(".c-tr"), OT.$(".c-bl"), OT.$(".c-br")],
    fx: OT.$("#fx"),
  };
  els.ctx = els.fx.getContext("2d");

  // ---- text, only from OT_BRAND ----
  var b = window.OT_BRAND, frag = "", i;
  els.hudBrand.innerHTML = "<b>" + b.hudLabel + "</b> <i>/</i> ONE-TAKE DEMO";
  for (i = 0; i < b.name.length; i++) frag += "<span>" + (b.name[i] === " " ? "&nbsp;" : b.name[i]) + "</span>";
  els.wordmark.innerHTML = frag;
  els.tagline.innerHTML = '<span id="tag0">' + b.tagline[0] + '</span><span id="tag1">' + b.tagline[1] + "</span>";
  els.url.textContent = b.url;

  // ---- mark SVG, built from OT_LOGO: tile, ring-mask draw-on path, 2 comets, sheen (identical
  // pattern to the template's "hello" act -- this part is brand/story-agnostic, see method.md
  // pattern 1) ----
  var L = window.OT_LOGO, svg = els.mark.querySelector("svg");
  svg.setAttribute("viewBox", L.viewBox.join(" "));
  var defs = OT.el("defs", {}, svg);
  var tileGrad = OT.el("radialGradient", { id: "tileGrad", cx: "0.32", cy: "0.24", r: "0.95" }, defs);
  OT.el("stop", { offset: "0", "stop-color": OT.pal("--accent") }, tileGrad);
  OT.el("stop", { offset: "1", "stop-color": OT.pal("--bg-deep") }, tileGrad);
  var sheenGrad = OT.el("linearGradient", { id: "sheenGrad", x1: "0", y1: "0", x2: "1", y2: "0" }, defs);
  OT.el("stop", { offset: "0", "stop-color": "#fff", "stop-opacity": "0" }, sheenGrad);
  OT.el("stop", { offset: "0.5", "stop-color": "#fff", "stop-opacity": "0.42" }, sheenGrad);
  OT.el("stop", { offset: "1", "stop-color": "#fff", "stop-opacity": "0" }, sheenGrad);
  var tile = L.tile, ring = L.components[0], core = L.components[1];
  var tileG = OT.el("g", { id: "tileG" }, svg);
  if (tile) OT.el("rect", { x: tile.bbox[0], y: tile.bbox[1], width: tile.bbox[2] - tile.bbox[0], height: tile.bbox[3] - tile.bbox[1], rx: tile.rx, fill: "url(#tileGrad)" }, tileG);
  OT.el("path", { d: core.d, fill: core.color }, tileG);
  OT.el("path", { id: "ringPath", d: ring.d, fill: "none", stroke: ring.color, "stroke-width": "14", "stroke-linecap": "round" }, svg);
  OT.el("circle", { id: "cometA", r: "0", fill: core.color }, svg);
  OT.el("circle", { id: "cometB", r: "0", fill: ring.color }, svg);
  var clip = OT.el("clipPath", { id: "tileClip" }, defs);
  if (tile) OT.el("rect", { x: tile.bbox[0], y: tile.bbox[1], width: tile.bbox[2] - tile.bbox[0], height: tile.bbox[3] - tile.bbox[1], rx: tile.rx }, clip);
  var sheenRot = OT.el("g", { transform: "rotate(18 100 100)" }, OT.el("g", { "clip-path": "url(#tileClip)" }, svg));
  OT.el("rect", { id: "sheen", x: "-100", y: "0", width: "70", height: "200", fill: "url(#sheenGrad)" }, sheenRot);
  RING = OT.lockup.initMask(["#ringPath"]);

  // ---- measured lockup plan ----
  els.mark.style.width = els.mark.style.height = "220px";
  var markBox = els.mark.getBoundingClientRect();
  var wordBox = els.wordmark.getBoundingClientRect();
  var taglineBox = els.tagline.getBoundingClientRect();
  var urlBox = els.url.getBoundingClientRect();
  var measuredParts = { mark: markBox, wordmark: wordBox, tagline: taglineBox, url: urlBox };
  for (var partId in measuredParts) {
    var partBox = measuredParts[partId];
    if (partBox.width <= 0 || partBox.height <= 0) {
      throw new Error("acts.js setup(): #" + partId + " measured " + partBox.width.toFixed(1) + "x" +
        partBox.height.toFixed(1) + "px (zero in at least one dimension) -- cannot build the lockup plan from a collapsed box.");
    }
  }
  PLAN = OT.lockup.plan({
    markW: markBox.width, markH: markBox.height, wordW: wordBox.width, wordH: wordBox.height,
    gap: markBox.width * 0.18, vGap: markBox.width * 0.1,
    taglineH: taglineBox.height, taglineW: taglineBox.width, urlH: urlBox.height, urlW: urlBox.width,
  });
  els.mark.style.left = (PLAN.mark.cx - markBox.width / 2) + "px";
  els.mark.style.top = (PLAN.mark.cy - markBox.height / 2) + "px";
  els.mark.style.transformOrigin = "50% 50%";
  els.mark.style.transform = "scale(" + PLAN.scale + ")";
  els.wmClip.style.left = PLAN.word.x + "px"; els.wmClip.style.top = PLAN.word.y + "px";
  els.wmClip.style.width = PLAN.word.w + "px"; els.wmClip.style.height = PLAN.word.h + "px";
  els.wordmark.style.transformOrigin = "0 0";
  els.wordmark.style.transform = "scale(" + PLAN.scale + ")";
  function placeCentered(el, naturalW, plan) {
    if (!plan) { el.style.opacity = "0"; return; }
    el.style.left = (plan.cx - (naturalW * PLAN.scale) / 2) + "px";
    el.style.top = plan.y + "px";
    el.style.transformOrigin = "0 0";
    el.style.transform = "scale(" + PLAN.scale + ")";
  }
  placeCentered(els.tagline, taglineBox.width, PLAN.tagline);
  placeCentered(els.url, urlBox.width, PLAN.url);

  // ---- timing table T, built ONLY from FMT.anchors/sections + OT.B (never raw seconds) ----
  T.launch = A.launch; T.impact = A.impact; T.end = FMT.len;
  T.typeStart = OT.B(1);
  T.foldEnd = T.launch - OT.B(0.5);
  T.foldStart = Math.max(T.typeStart + OT.B(1.5), T.foldEnd - Math.max(OT.B(1.2), T.launch * 0.22));
  var typeWindow = Math.max(OT.B(1.5), T.foldStart - T.typeStart - OT.B(0.4));
  var line0 = String(b.tagline[0] || "");
  T.charDt = Math.min(0.09, typeWindow / Math.max(1, line0.length));
  T.typeEnd = T.typeStart + line0.length * T.charDt;
  T.thickenEnd = T.foldEnd + OT.B(1);
  if (hasOutcomes) {
    T.splitAt = S.outcomes.t0 + (S.outcomes.t1 - S.outcomes.t0) * 0.22;
    T.tilesSettleBy = T.splitAt + (S.outcomes.t1 - T.splitAt) * 0.45;
  }
  if (hasProof) {
    T.collapseAt = S.proof.t0 + (S.proof.t1 - S.proof.t0) * 0.14;
    T.barsRiseBy = T.collapseAt + (S.proof.t1 - T.collapseAt) * 0.55;
    T.fuseAt = S.proof.t1 - (S.proof.t1 - S.proof.t0) * 0.12;
  }
  T.homeEnd = T.impact - 0.1;
  T.leg1End = hasOutcomes ? T.splitAt : T.homeEnd;
  T.leg2Start = hasOutcomes ? (hasProof ? T.fuseAt : T.tilesSettleBy) : T.launch;
  // D2/D3 fix -- see tokenDepth()/tokenTiltK()/render()'s bar-fill blend: the window (before T.splitAt)
  // over which the token flattens/untilts/recolors to match the tiles it's about to become. Never
  // longer than the fold has already finished thickening by, and never starts before the fold itself
  // is done, so it can't fight the fold->box thicken ramp.
  if (hasOutcomes) SPLIT_SETTLE = Math.min(OT.B(1), Math.max(0.15, T.splitAt - T.thickenEnd));

  // ---- camera: one whip on the travel axis, then a steady hold all the way to the end. Scale
  // punches in and fully settles back to 1 WELL BEFORE any outcomes/proof content appears, so
  // every world point computed for that content (below) is exact, not an approximation under a
  // drifting camera. ----
  var travelAxis = FMT.layout === "stack" ? "y" : "x";
  var TRAVEL = 0.34 * (travelAxis === "x" ? FMT.w : FMT.h);
  // D1/D2/D3 fix: the whip's landing keyframe was a flat T.launch+OT.B(2), which for this format's
  // actual timing (T.splitAt only ~0.88s after T.launch) lands the camera AFTER T.splitAt -- so the
  // camera was still mid-pan at the split cut, and SLOTS/FUSE_WORLD (frozen under STEADY_CAM, sampled
  // even earlier at T.launch+OT.B(1.5), also still mid-pan) were baked from a camera state that never
  // matched the live one at T.splitAt. That's what put the newborn tiles ~75px away from the token's
  // last on-screen point instead of exactly on it. Landing now always resolves to some time strictly
  // before the first world point anything downstream freezes (T.splitAt if this format has outcomes,
  // else T.homeEnd), with margin, so STEADY_CAM (sampled at/after landing) is provably identical to the
  // live camera for every t at or after that point -- not just approximately settled.
  var camSettleBy = (hasOutcomes ? T.splitAt : T.homeEnd) - 0.12;
  var camLand = Math.min(T.launch + OT.B(2), Math.max(T.launch + 0.2, camSettleBy));
  var moved = [[0, 0, 0], [T.launch, 0, 0], [camLand, TRAVEL, 0], [T.impact, TRAVEL, 0], [T.end, TRAVEL, 0]];
  var still = [[0, 0, 0], [T.end, 0, 0]];
  OT.cam.tracks({
    x: travelAxis === "x" ? moved : still, y: travelAxis === "y" ? moved : still,
    s: [[0, 1, 0], [T.launch, 1, 0], [T.launch + OT.B(0.6), 1.08, 0], [Math.max(T.launch + OT.B(0.6) + 0.05, Math.min(T.launch + OT.B(1.1), camLand)), 1, 0], [T.end, 1, 0]],
  });
  OT.cam.addShake(T.launch, 0.4, 22);
  OT.cam.addShake(T.impact, 0.4, 16);
  var camAt0 = OT.cam.at(0);
  STEADY_CAM = OT.cam.at(camLand);

  // ---- screen-space layout: safe-box center, and (if this format has outcomes) 3 tile/bar slots
  // laid out in a row (row layout, 16:9) or a column (stack layout, 9:16), all inside safe.
  var safe = FMT.safe;
  CENTER = { x: safe.x + safe.w / 2, y: safe.y + safe.h / 2 };
  if (hasOutcomes) {
    var ASPECTS = [16 / 9, 9 / 16, 1], GAP_K = 0.22, slots;
    if (FMT.layout !== "stack") {
      var sumA = ASPECTS.reduce(function (a, r) { return a + r; }, 0);
      var H = Math.min(safe.w * 0.82 / (sumA + GAP_K * (ASPECTS.length - 1)), safe.h * 0.34);
      var widths = ASPECTS.map(function (r) { return H * r; });
      var totalW = widths.reduce(function (a, w) { return a + w; }, 0) + GAP_K * H * (ASPECTS.length - 1);
      var x = CENTER.x - totalW / 2;
      slots = widths.map(function (w) { var s = { x: x + w / 2, y: CENTER.y, w: w, h: H }; x += w + GAP_K * H; return s; });
    } else {
      var sumInv = ASPECTS.reduce(function (a, r) { return a + 1 / r; }, 0);
      var W = Math.min(safe.h * 0.66 / (sumInv + GAP_K * (ASPECTS.length - 1)), safe.w * 0.66);
      var heights = ASPECTS.map(function (r) { return W / r; });
      var totalH = heights.reduce(function (a, h) { return a + h; }, 0) + GAP_K * W * (ASPECTS.length - 1);
      var y = CENTER.y - totalH / 2;
      slots = heights.map(function (h) { var s = { x: CENTER.x, y: y + h / 2, w: W, h: h }; y += h + GAP_K * W; return s; });
    }
    SLOTS = slots;
  }

  // ---- fixed WORLD anchor points, each frozen through the camera at the instant it applies
  // (engine.md "OT.s2w ... home a world-space object onto a SCREEN-space target") ----
  var travelSpan = travelAxis === "x" ? safe.w : safe.h;
  var travelOrigin = travelAxis === "x" ? safe.x : safe.y;
  var leg1TargetScreen = hasOutcomes ? [CENTER.x, CENTER.y] : [PLAN.mark.cx, PLAN.mark.cy];
  var targetCross = travelAxis === "x" ? leg1TargetScreen[1] : leg1TargetScreen[0];
  var targetTravel = travelAxis === "x" ? leg1TargetScreen[0] : leg1TargetScreen[1];
  var pStartTravel = Math.max(travelOrigin, Math.min(travelOrigin + 0.25 * travelSpan, targetTravel - 0.12 * travelSpan));
  PSTART = travelAxis === "x" ? [pStartTravel, targetCross] : [targetCross, pStartTravel];
  LEG1_TARGET_S = leg1TargetScreen;
  var cardW = OT.s2w(PSTART[0], PSTART[1], camAt0);
  CARD_WORLD = { x: cardW[0], y: cardW[1] };
  var launchW = OT.s2w(PSTART[0], PSTART[1], OT.cam.at(T.launch));
  LAUNCH_WORLD = { x: launchW[0], y: launchW[1] };
  var homeW = OT.s2w(PLAN.mark.cx, PLAN.mark.cy, OT.cam.at(T.impact));
  HOME_WORLD = { x: homeW[0], y: homeW[1] };
  if (hasOutcomes) {
    var fuseW = OT.s2w(CENTER.x, CENTER.y, STEADY_CAM);
    FUSE_WORLD = { x: fuseW[0], y: fuseW[1] };
    SLOTS.forEach(function (s) {
      var w = OT.s2w(s.x, s.y, STEADY_CAM);
      s.wx = w[0]; s.wy = w[1];
    });
  }

  // ---- world-space DOM: an SVG layer inside #brandWorld, world units == local SVG units (same
  // convention as #heroToken's own left/top). Card, its typed line + caret, tiles and bars all
  // live here, exactly as instructed ("with OT.el inside #brandWorld"). ----
  var brandWorld = OT.$("#brandWorld");
  var worldSvg = OT.el("svg", { style: "position:absolute;left:0;top:0;overflow:visible;" }, brandWorld);
  els.worldSvg = worldSvg;

  var core = window.OT_LOGO.components[1];
  var rawCore = parseSimplePolyPath(core.d);
  var cxs = rawCore.map(function (p) { return p[0]; }), cys = rawCore.map(function (p) { return p[1]; });
  var coreCx = (Math.min.apply(null, cxs) + Math.max.apply(null, cxs)) / 2;
  var coreCy = (Math.min.apply(null, cys) + Math.max.apply(null, cys)) / 2;
  var reach = Math.max.apply(null, rawCore.map(function (p) { return Math.max(Math.abs(p[0] - coreCx), Math.abs(p[1] - coreCy)); }));
  var coreScale = (CARD_HW * 0.42) / Math.max(1, reach);
  CORE_LOCAL = rawCore.map(function (p) { return [(p[0] - coreCx) * coreScale, (p[1] - coreCy) * coreScale]; });

  // card: rounded rect (rx via a real SVG rect, not CSS) + 2-line skeleton feel via the caret cue,
  // in surface colors, plus the typed line as one <text> per character (measured, then laid out
  // left-to-right, exactly like the template measures the wordmark's own spans).
  var cardG = OT.el("g", { id: "demoCard" }, worldSvg);
  els.cardG = cardG;
  CARD_RGB = hexToRgb(OT.pal("--surface"));
  var cardRect = OT.el("rect", {
    x: CARD_WORLD.x - CARD_HW, y: CARD_WORLD.y - CARD_HW, width: CARD_HW * 2, height: CARD_HW * 2,
    rx: CARD_HW * 0.22, fill: OT.pal("--surface"), stroke: OT.pal("--line"), "stroke-width": "2",
  }, cardG);
  els.cardRect = cardRect;
  var textG = OT.el("g", {}, cardG);
  els.textG = textG;
  for (i = 0; i < line0.length; i++) {
    var ch = line0[i] === " " ? " " : line0[i];
    var t = OT.el("text", {
      x: "0", y: (CARD_WORLD.y + 6).toFixed(1), "font-family": "Geist", "font-weight": "700",
      "font-size": "44", fill: OT.pal("--ink"), opacity: "0",
      // the checker can't see that the screen-space #fx canvas is empty here (nothing is drawn on
      // it until T.launch, well after this text has already fully revealed and gone) -- see the
      // report's warning-class notes; same intentional-layering escape shossip uses for its own
      // under-the-vignette day labels.
      "data-layout-allow-occlusion": "",
    }, textG);
    t.textContent = ch;
    chars.push(t);
  }
  var caret = OT.el("rect", { width: "3", height: "48", y: (CARD_WORLD.y - 24).toFixed(1), fill: OT.pal("--accent-2"), opacity: "0" }, cardG);
  els.caret = caret;
  // lay characters out left-to-right, centered as a block on the card
  var widths = chars.map(function (c) { return c.getComputedTextLength(); });
  var totalTextW = widths.reduce(function (a, w) { return a + w; }, 0);
  var cx0 = CARD_WORLD.x - totalTextW / 2;
  chars.forEach(function (c, idx) { c.setAttribute("x", cx0.toFixed(1)); cx0 += widths[idx]; });
  els.charRight = []; var run = CARD_WORLD.x - totalTextW / 2;
  widths.forEach(function (w) { run += w; els.charRight.push(run); });
  caret.setAttribute("x", (CARD_WORLD.x - totalTextW / 2 - 6).toFixed(1));

  // tiles (only built when this format's sections call for them). When this format also has a proof
  // beat, the SAME per-tile group/rect goes on to become that tile's growth bar at COLLAPSE -- no
  // separate bar elements, so there is nothing to crossfade between (see render()'s tile block).
  els.tiles = [];
  if (hasOutcomes) {
    SLOTS.forEach(function (s, idx) {
      var g = OT.el("g", { "class": "demoTile", opacity: "0" }, worldSvg);
      var rect = OT.el("rect", { rx: Math.min(s.w, s.h) * 0.08, fill: OT.pal("--surface-2"), stroke: OT.pal("--line"), "stroke-width": "1.5" }, g);
      var ln1 = OT.el("rect", { rx: 3, fill: OT.pal("--ink-faint") }, g);
      var ln2 = OT.el("rect", { rx: 3, fill: OT.pal("--ink-faint") }, g);
      var dia = OT.el("polygon", { fill: core.color }, g);
      els.tiles.push({ g: g, rect: rect, ln1: ln1, ln2: ln2, dia: dia, slot: s, idx: idx });
    });
  }
  if (hasProof) {
    var maxBarH = Math.min(CENTER.y - safe.y, safe.h * 0.3);
    // D4 fix: strictly increasing left->right (was [0.5, 0.86, 0.66] -- tallest in the MIDDLE reads as
    // 3 blobs, not growth) -- ~40/70/100% of the tallest, per the batch spec.
    var barFracs = [0.4, 0.7, 1.0];
    // D4 fix: the 3 tiles' own slots (built from real 16:9/9:16/1:1 aspect ratios, spaced with GAP_K)
    // are exactly wrong for a bar CHART -- wildly different widths, wide uneven gaps in row layout, and
    // in stack layout (9:16) stacked vertically, not side by side. A real chart needs its own fixed,
    // evenly-pitched, always-horizontal layout, independent of the tiles' aspect-driven one: barW sized
    // as a fraction of a fixed chart width so width/(width+gap) = 1/(1+chartGapK) stays well over the
    // required 1/3 pitch floor, and the whole 3-bar row centered in the safe box on every format.
    // A2b1R3 E3(c) fix: sharedBarW used to be derived from safe.w (chartW/(3+2*chartGapK)), which sized
    // the tallest bar to ~295px wide against a ~292px-tall bar (maxBarH*1.0) -- a near-square "fat
    // block" chart, not bars. A bar chart needs its PROPORTIONS driven by its own height, not by however
    // much of safe.w happens to be free: size the width as a fraction of maxBarH so the tallest bar's
    // height/width ratio is always >= 2.5 (comfortably above 2.5 with this 0.3 factor: 1/0.3 = 3.33x),
    // then re-derive the gap from that width (>= 0.6x, matching the "reads as bars" spec) -- the whole
    // 3-bar+2-gap span (4.3x sharedBarW) still lands well inside safe.w on every format (verified: 16:9
    // ~401px vs safe.w ~1728px; 9:16 ~523px vs safe.w ~892px).
    var chartGapK = 0.65;
    var sharedBarW = maxBarH * 0.3; // a magnitude, not a screen point -- STEADY_CAM.s is
    // frozen at 1 (see setup()'s camera comment), so world widths/heights == screen px, unlike x/y below.
    var chartGap = sharedBarW * chartGapK, chartPitch = sharedBarW + chartGap;
    var chartX0Screen = CENTER.x - (chartPitch * 2) / 2;
    var chartBaseYScreen = Math.min(CENTER.y + maxBarH * 0.55, safe.y + safe.h - 4);
    // chartCx/chartBaseY are SCREEN points -- like SLOTS' own s.x/s.y above, they must go through
    // OT.s2w(_, _, STEADY_CAM) to land in the same WORLD units as slot.wx/slot.wy (tile/bar elements
    // live in world-space #brandWorld). Mixing screen CENTER.x directly with world slot.wx here was the
    // actual D4 regression on the first pass at this fix: bars rendered off in a corner, hugely
    // mis-scaled, because CENTER.x/.y (screen) and slot.wx/.wy (world, offset by the camera's own
    // translate) are NOT the same coordinate space once the camera has moved off (0,0).
    var chartBaseYWorld = OT.s2w(CENTER.x, chartBaseYScreen, STEADY_CAM)[1];
    TILE_RGB = hexToRgb(OT.pal("--surface-2"));
    BAR_RGB = hexToRgb(OT.pal("--accent"));
    els.tiles.forEach(function (tile, idx) {
      tile.baseY = tile.slot.wy + tile.slot.h / 2; // the tile's own bottom edge -- the bar rises from here
      tile.barW = sharedBarW;
      tile.targetH = maxBarH * barFracs[idx % barFracs.length];
      var chartCxScreen = chartX0Screen + idx * chartPitch;
      tile.chartCx = OT.s2w(chartCxScreen, chartBaseYScreen, STEADY_CAM)[0]; // final, shared-baseline chart slot (D4)
      tile.chartBaseY = chartBaseYWorld;
    });
  }

  // ---- token: a screen-space SVG overlay (sibling of #world, like the DOM contract's own `#fx`)
  // -- OT.threeD.drawFaces projects world points into screen pixels itself, so its pool MUST live
  // outside the CSS-transformed #world layer (confirmed by both drawFaces' contract in engine.md
  // and by examples/shossip/on-engine/index.html's own "#fx" SVG, a sibling of #world). See the
  // report's "anything I disagree with" for why this one piece can't literally sit inside
  // #brandWorld the way the card/tiles/bars do. ----
  var stage = document.getElementById("stage");
  var fxDemo = OT.el("svg", { id: "demoFx", viewBox: "0 0 " + FMT.w + " " + FMT.h, style: "position:absolute;inset:0;width:100%;height:100%;overflow:visible;pointer-events:none;" });
  stage.insertBefore(fxDemo, document.getElementById("bokehFront"));
  tokenShadowPoly = OT.el("polygon", { fill: "#050309" }, fxDemo);
  tokenSlots = OT.threeD.makePool(fxDemo, 1, 6, { "stroke-linejoin": "round" });
  tokenSlots[0].g.setAttribute("id", "demoTokenBox");
  coreSlots = OT.threeD.makePool(fxDemo, 1, 1);
  coreSlots[0].g.setAttribute("id", "demoTokenCore");

  var surfaceLit = hexToRgb(OT.pal("--ink")), surfaceShade = hexToRgb(OT.pal("--surface-2"));
  TOKEN_MATERIAL = OT.threeD.material({ dir: [-0.42, -0.62, 0.66], lit: surfaceLit, shade: surfaceShade, creaseRGB: OT.rgb("--accent"), strokeWidthK: 1.2 });
  // D2/D3: the token's own flat/frontal (normal facing straight at camera) shade -- a fixed color the
  // COLLAPSE bars morph into on their way to FUSE (see render()'s bar fillRgb blend), and exactly what
  // the token itself already renders as once tokenTiltK() flattens it to frontal at T.splitAt/T.fuseAt,
  // so both sides of each cut land on the same color with no separate "target" to keep in sync.
  TOKEN_FACE_RGB = (TOKEN_MATERIAL.shade([0, 0, 1]).match(/[\d.]+/g) || [0, 0, 0]).map(Number);
  if (hasOutcomes) {
    var flatTileRgbSrc = hexToRgb(OT.pal("--surface-2"));
    FLAT_TILE_MATERIAL = { shade: function () { return "rgb(" + flatTileRgbSrc.join(",") + ")"; }, creaseRGB: "0,0,0", strokeWidthK: 0 };
  }
  var coreLit = hexToRgb(core.color), coreShade = scaleRgb(coreLit, 0.4);
  CORE_MATERIAL = OT.threeD.material({ dir: [-0.42, -0.62, 0.66], lit: coreLit, shade: coreShade, creaseRGB: OT.rgb("--accent-2"), strokeWidthK: 1 });

  // ---- the #fx canvas (template's own screen-space FX surface -- see engine.md's layer-stack note):
  // every OT.fx.burst/ring/flash queued in build() only actually paints once render() clears this canvas
  // and calls OT.fx.worldTf + OT.fx.renderCanvas every frame, exactly like the template's acts.js does. ----
  els.fx.width = FMT.w; els.fx.height = FMT.h;
  OT.backdrop.init(); // resolves the backdrop config from the brand tokens and builds the treatment

  OT.hud.layout({ corners: els.corners, brand: els.hudBrand, timecode: els.timecode, meter: els.meter, captions: els.captions });
}

function build(tl) {
  // ACTION: typed line, one char at a time, plus a blinking caret (discrete stagger reveal --
  // GSAP-owned, same technique as the template's wordmark reveal / the shossip port's #compText).
  chars.forEach(function (c, i) {
    tl.fromTo(c, { opacity: 0 }, { opacity: 1, duration: 0.16, ease: "power1.out" }, T.typeStart + i * T.charDt);
  });
  tl.fromTo(els.caret, { opacity: 0 }, { opacity: 1, duration: 0.1 }, T.typeStart - 0.05);

  // F5a: the typed line + caret must be fully gone BEFORE the card's fill starts blending toward the
  // token's (near-white) face color at T.foldEnd - FOLD_FILL_BLEND, below -- otherwise a frame of light
  // text on a lightening card slips through. Fade both out over a short window that finishes right at
  // the blend's own start (clamped so it never starts before typing has finished).
  var textOutEnd = T.foldEnd - FOLD_FILL_BLEND;
  var textOutDur = Math.min(0.12, Math.max(0.05, textOutEnd - T.typeEnd));
  var textOutStart = Math.max(T.typeEnd, textOutEnd - textOutDur);
  tl.to(els.textG, { opacity: 0, duration: textOutEnd - textOutStart, ease: "power1.in" }, textOutStart);
  tl.to(els.caret, { opacity: 0, duration: textOutEnd - textOutStart, ease: "power1.in" }, textOutStart);

  // MATCH POINT (fold): the card squashes to a zero-width sliver in place (a real squash, not a
  // fade -- opacity stays 1 the whole squash) then is hard-cut invisible the instant it has no
  // width left; the token (render()'s tokenOpacity/tokenDepth) picks up at that same instant, same
  // world point, depth starting at 0 (also "flat").
  tl.to(els.cardG, { scaleX: FOLD_SLIVER, duration: Math.max(0.15, T.foldEnd - T.foldStart), ease: "power2.in", svgOrigin: CARD_WORLD.x + " " + CARD_WORLD.y }, T.foldStart);
  tl.set(els.cardG, { opacity: 0 }, T.foldEnd);
  tl.set(els.caret, { opacity: 0 }, T.foldEnd);

  // MATCH POINT (launch): no travel yet -- FX + camera whip happen AT the token's resting point.
  OT.fx.burst({ t0: T.launch, x: LAUNCH_WORLD.x, y: LAUNCH_WORLD.y, n: 22, speed: 620, life: 0.6, seed: 3, color: OT.pal("--accent"), col2: OT.pal("--accent-2") });
  OT.fx.ring({ t0: T.launch, x: LAUNCH_WORLD.x, y: LAUNCH_WORLD.y, r0: 20, r1: 240, life: 0.6, w: 6, ringColor: OT.pal("--accent") });

  if (hasOutcomes) {
    // MATCH POINT (split): the burst sits at the token's last point (the center); tiles are born
    // there (render() grows them from scale ~0 at that same point) and fly out to their slots.
    OT.fx.burst({ t0: T.splitAt, x: FUSE_WORLD.x, y: FUSE_WORLD.y, n: 24, speed: 640, life: 0.55, seed: 11, color: OT.pal("--ink"), col2: OT.pal("--accent") });
    OT.fx.ring({ t0: T.splitAt, x: FUSE_WORLD.x, y: FUSE_WORLD.y, r0: 16, r1: 220, life: 0.5, w: 5, ringColor: OT.pal("--accent-2") });
  }
  if (hasProof) {
    // MATCH POINT (collapse): each bar's FIRST frame sits exactly at its own tile's slot footprint
    // (same x, same baseline) -- the tile fades there as the bar starts its rise from height 0.
    OT.fx.burst({ t0: T.collapseAt, x: FUSE_WORLD.x, y: FUSE_WORLD.y, n: 16, speed: 420, life: 0.45, seed: 21, color: OT.pal("--ink-faint") });
    // MATCH POINT (fuse): the bars converge on the same center point the token last occupied
    // before the split -- the token reforms there (depth already 1, no re-fold needed).
    OT.fx.burst({ t0: T.fuseAt, x: FUSE_WORLD.x, y: FUSE_WORLD.y, n: 24, speed: 660, life: 0.55, seed: 31, color: OT.pal("--accent"), col2: "#ffffff" });
    OT.fx.ring({ t0: T.fuseAt, x: FUSE_WORLD.x, y: FUSE_WORLD.y, r0: 18, r1: 240, life: 0.55, w: 5, ringColor: OT.pal("--accent") });
  }

  // impact: flash + rings + burst, right where the token homes onto the mark -- MATCH POINT
  // (home): the token's last rendered point IS the mark's screen point; the core diamond it
  // carries sits on the mark's own (still-hidden) diamond at that exact spot, same shape/color.
  OT.fx.flash({ t0: T.impact, x: HOME_WORLD.x, y: HOME_WORLD.y, r0: 10, r1: 320, life: 0.5, peak: 1, flashColor: "#ffffff" });
  OT.fx.ring({ t0: T.impact, x: HOME_WORLD.x, y: HOME_WORLD.y, r0: 20, r1: 300, life: 0.55, w: 8, ringColor: OT.pal("--accent-2") });
  OT.fx.burst({ t0: T.impact, x: HOME_WORLD.x, y: HOME_WORLD.y, n: 26, speed: 700, life: 0.6, seed: 9, color: OT.pal("--accent-2"), col2: "#ffffff" });

  OT.lockup.tileBloom(tl, "#tileG", T.impact + 0.1, { svgOrigin: "100 100" });
  OT.lockup.play(tl, { wordmark: "#wordmark", tagline: "#tagline", url: "#url", sheen: "#sheen" }, PLAN, T.impact + 0.5, {
    sheen: { xFrom: -100, xTo: 260, duration: 0.75 },
  });

  // one caption per middle section (never the first or last -- generic across all three lengths)
  var sections = FMT.sections || [], capEls = [OT.$("#cap0"), OT.$("#cap1")], ci = 0;
  for (var i = 1; i < sections.length - 1 && ci < capEls.length; i++) {
    var s = sections[i], capEl = capEls[ci];
    capEl.querySelector("small").textContent = (ci + 1) + " / " + s.name.toUpperCase();
    capEl.querySelector(".ln span").textContent = CAP_TEXT[s.name] || "Underway.";
    OT.hud.capIn(tl, "#cap" + ci, s.t0 + 0.3, s.t1 - 0.2);
    ci++;
  }
}

// F5a: 0..1, reaching 1 exactly at T.foldEnd -- how far into the pre-fold "blend to token color" window
// (FOLD_FILL_BLEND, above) this frame is. render() uses it to blend the card's own fill from CARD_RGB to
// TOKEN_FACE_RGB so the card's last visible color, at foldEnd, already matches the token's frontal face
// (same pattern as splitSettleK's geometry+color blend at split/fuse).
function foldFillK(t) {
  return OT.clamp(OT.prog(t, T.foldEnd - FOLD_FILL_BLEND, T.foldEnd, "power2.in"), 0, 1);
}

// ------------------------------------------------------------------ per-frame render (pure fn of t, cam)

// MATCH POINT (fold, depth): flat (0) from the fold's match point until the token has fully thickened;
// MATCH POINT (split, depth): flat (0) again by T.splitAt -- see SPLIT_SETTLE's comment -- so the token
// is a flat square, not a cube, at the exact instant the 3 tiles are born from it (D2 fix);
// MATCH POINT (fuse, depth): flat (0) again the instant the bars finish converging into the token's face
// rect (T.fuseAt) -- the token then EXTRUDES from that flat rect back to a full box. All three windows
// share one function so there's a single source of truth for "flat" vs "thickened".
function tokenDepth(t) {
  if (hasProof && t >= T.fuseAt) return OT.clamp(OT.prog(t, T.fuseAt, T.fuseAt + OT.B(1), "power2.out"), 0, 1);
  var base = OT.clamp(OT.prog(t, T.foldEnd, T.thickenEnd, "power2.out"), 0, 1);
  if (hasOutcomes && t < T.splitAt) {
    base *= 1 - OT.clamp(OT.prog(t, T.splitAt - SPLIT_SETTLE, T.splitAt, "power2.in"), 0, 1);
  }
  return base;
}

// D2/D3 fix: pitch/roll (render()'s fixed 3D tilt) must ALSO reach exactly 0 whenever the token has to
// read as a flat, axis-aligned rect matching a 2D counterpart (tiles at split, bars at fuse) -- depth
// alone isn't enough, since orient() applies rotX(pitch)/rotY(roll) to the flat face too, projecting it
// as a skewed parallelogram instead of a plain rect even at depth 0. Shares tokenDepth()'s own windows
// so tilt and thickness always finish flattening/extruding together.
function tokenTiltK(t) {
  var k = OT.clamp(OT.prog(t, T.foldEnd, T.thickenEnd, "power2.out"), 0, 1);
  if (hasOutcomes) {
    if (t < T.splitAt) k = Math.min(k, 1 - splitSettleK(t));
    var fuseAt = hasProof ? T.fuseAt : T.tilesSettleBy;
    if (t >= fuseAt) k = Math.min(k, OT.clamp(OT.prog(t, fuseAt, fuseAt + OT.B(1), "power2.out"), 0, 1));
  }
  return k;
}

// D2 fix: 0..1, reaching 1 exactly at T.splitAt -- how far into the pre-split "settle flat" window (see
// SPLIT_SETTLE's comment) this frame is. Used both by tokenTiltK() (geometry) and render()'s token
// material blend (color), so the token is simultaneously flat, untilted AND tile-colored at the cut --
// never just one of the three, which is what left D2's color/3D pop in place.
function splitSettleK(t) {
  if (!hasOutcomes || t >= T.splitAt) return 0;
  return OT.clamp(OT.prog(t, T.splitAt - SPLIT_SETTLE, T.splitAt, "power2.in"), 0, 1);
}

// MATCH POINT (fold, width): tokenFaceHwScale starts at FOLD_SLIVER -- the SAME fraction the card's own
// squash ends at (build()'s FOLD tween) -- so the face's on-screen width is continuous across the
// card->token handoff: a sliver growing into a full face, never a width jump.
function tokenFaceHwScale(t) {
  return OT.clamp(OT.lerp(FOLD_SLIVER, 1, OT.prog(t, T.foldEnd, T.thickenEnd, "power2.out")), FOLD_SLIVER, 1);
}

// Opacity is a hard cut at every match point (fold/split/fuse), never a fade: each cut lands exactly when
// the token is geometrically identical to (and either covers or is covered by) its counterpart -- see the
// corresponding "MATCH POINT" comments in build()/render(). The one exception is HOME/impact, whose fade
// happens INSIDE OT.fx.flash's visible window (F5b): OT.fx.flash is queued with t0 = T.impact (build()),
// so the token's fade must not start before that -- starting it earlier (as a T.impact-0.1 window once
// did) uncovers real token pixels losing opacity with zero flash pixels yet on screen. The window is
// T.impact .. T.impact+0.1, fully inside the flash's own life (0.5s), so the token is always covered.
function tokenOpacity(t) {
  if (t < T.foldEnd) return 0;
  var impactOut = OT.clamp(1 - OT.prog(t, T.impact, T.impact + 0.1, "power2.in"), 0, 1);
  if (!hasOutcomes) return impactOut;
  if (t < T.splitAt) return 1;
  var fuseAt = hasProof ? T.fuseAt : T.tilesSettleBy;
  if (t < fuseAt) return 0;
  return impactOut;
}

function tokenWorldPos(t, cam) {
  if (t < T.launch) return CARD_WORLD;
  var leg1S = OT.lerpV(PSTART, LEG1_TARGET_S, OT.prog(t, T.launch, T.leg1End, "power2.out"));
  if (t < T.leg1End) { var w1 = OT.s2w(leg1S[0], leg1S[1], cam); return { x: w1[0], y: w1[1] }; }
  if (!hasOutcomes) return HOME_WORLD;
  if (t < T.leg2Start) return FUSE_WORLD;
  var homeS = [PLAN.mark.cx, PLAN.mark.cy];
  var leg2S = OT.lerpV([CENTER.x, CENTER.y], homeS, OT.prog(t, T.leg2Start, T.homeEnd, "power2.inOut"));
  if (t < T.homeEnd) { var w2 = OT.s2w(leg2S[0], leg2S[1], cam); return { x: w2[0], y: w2[1] }; }
  return HOME_WORLD;
}

// hwScale narrows only the X half-width (the face's WIDTH) -- see tokenFaceHwScale's "MATCH POINT (fold,
// width)" comment. Y half-width (the card's height) never changes, matching the card's own squash (which
// only ever tweens scaleX).
function tokenFaces(pos, depth, psi, pitch, roll, hwScale) {
  var hwX = CARD_HW * hwScale, hwY = CARD_HW, D = 62, d = D * depth;
  var TL = [-hwX, -hwY, 0], TR = [hwX, -hwY, 0], BR = [hwX, hwY, 0], BL = [-hwX, hwY, 0];
  function orient(p) {
    var q = OT.rotX(p, pitch); q = OT.rotY(q, roll); q = OT.rotZ(q, psi);
    return [pos.x + q[0], pos.y + q[1], pos.z + q[2]];
  }
  var faces = [{ pts: [TL, TR, BR, BL].map(orient), flap: 0 }];
  if (d > 0.4) {
    var TLb = [-hwX, -hwY, -d], TRb = [hwX, -hwY, -d], BRb = [hwX, hwY, -d], BLb = [-hwX, hwY, -d];
    faces.push({ pts: [TL, TR, TRb, TLb].map(orient), flap: 1 });
    faces.push({ pts: [TR, BR, BRb, TRb].map(orient), flap: 1 });
    faces.push({ pts: [BR, BL, BLb, BRb].map(orient), flap: 1 });
    faces.push({ pts: [BL, TL, TLb, BLb].map(orient), flap: 1 });
    faces.push({ pts: [BLb, TLb, TRb, BRb].map(orient), flap: 0 });
  }
  return faces;
}
function coreFace(pos, psi, pitch, roll, hwScale, coreScaleK) {
  var k = coreScaleK == null ? 1 : coreScaleK;
  function orient(p) {
    var q = OT.rotX([p[0] * hwScale * k, p[1] * k, 0.6], pitch); q = OT.rotY(q, roll); q = OT.rotZ(q, psi);
    return [pos.x + q[0], pos.y + q[1], pos.z + q[2]];
  }
  return [{ pts: CORE_LOCAL.map(orient), flap: 0 }];
}

// A2b1R3 E3(b) fix: the reformed token used to pop in with its diamond at FULL scale the instant
// tokenOpacity() cuts back to 1 at the fuse match point -- reading as "the bars show no diamond, the
// token at the cut has a full orange diamond" (a content pop, not a morph), the mirror image of the
// split defect above. tokenOpacity()'s existence cut stays hard (method.md: no crossfades on a match
// point), but the diamond's own SCALE now grows from 0 over a short window right after the cut -- the
// same "grow from 0", not fade-from-0, technique the split's born tiles already use -- so the box
// appears instantly (still geometrically identical to the last bar frame) while its diamond visibly
// grows in, rather than snapping to full size. Only applies when this format actually has a fuse point
// (hasOutcomes); OT.B(0.5) finishes well before T.impact (12.0) even for the earliest fuseAt (11.52).
function tokenCoreGrowK(t) {
  if (!hasOutcomes) return 1;
  var fuseAt = hasProof ? T.fuseAt : T.tilesSettleBy;
  if (t < fuseAt) return 1; // irrelevant pre-fuse: opacity is 0 there, so the core isn't drawn anyway
  return OT.clamp(OT.prog(t, fuseAt, fuseAt + OT.B(0.5), "back.out(1.4)"), 0, 1);
}

function render(t, cam) {
  OT.atmos.grainJitter(els.grain, Math.round(t * FMT.fps));
  OT.backdrop.render(t, cam); // per-brand background world (treatment + palette from :root / OT_BRAND.atmos)

  // F5a: pure function of t -- blend the card's fill toward the token's frontal face color over the
  // last FOLD_FILL_BLEND seconds of the squash, so the fold's hard cut (cardG -> token) lands on
  // matching color instead of a dark card hard-cutting to a near-white token face in one frame.
  if (t < T.foldEnd) {
    var ffk = foldFillK(t);
    if (ffk > 0) {
      var cardFillRgb = [0, 1, 2].map(function (k) { return CARD_RGB[k] + (TOKEN_FACE_RGB[k] - CARD_RGB[k]) * ffk; });
      els.cardRect.setAttribute("fill", "rgb(" + cardFillRgb.map(function (v) { return Math.round(v); }).join(",") + ")");
    }
  }

  // ---- the token: pure function of (t, cam), position via tokenWorldPos (pattern 2 -- screen-
  // space path converted through the CURRENT frame's camera), spin via a fixed tilt + a yaw turn ----
  var pos3 = tokenWorldPos(t, cam);
  var z = t >= T.launch && t < T.leg1End ? 40 * Math.sin(Math.PI * OT.prog(t, T.launch, T.leg1End)) : 0;
  var pos = { x: pos3.x, y: pos3.y, z: z };
  var spinning = t >= T.launch && t < T.leg1End;
  var psi = spinning ? 1.5 * 2 * Math.PI * OT.prog(t, T.launch, T.leg1End, "power1.inOut") : 0;
  var tiltK = tokenTiltK(t);
  var pitch = 0.38 * tiltK, roll = -0.24 * tiltK;
  var depth = tokenDepth(t), opacity = tokenOpacity(t), hwScale = tokenFaceHwScale(t);
  var faces = opacity > 0.001 ? tokenFaces(pos, depth, psi, pitch, roll, hwScale) : null;
  // D2 fix: blend the box's own material toward FLAT_TILE_MATERIAL as it settles flat pre-split, so
  // its rendered color -- not just its shape -- is identical to the 3 tiles' fixed fill at T.splitAt.
  var boxMat = hasOutcomes ? blendMaterial(TOKEN_MATERIAL, FLAT_TILE_MATERIAL, splitSettleK(t)) : TOKEN_MATERIAL;
  OT.threeD.drawFaces(tokenSlots[0], faces, cam, opacity, boxMat);
  OT.threeD.drawShadow(tokenShadowPoly, faces, pos.z, cam);
  var coreGrowK = tokenCoreGrowK(t);
  var cFaces = opacity > 0.001 ? coreFace(pos, psi, pitch, roll, hwScale, coreGrowK) : null;
  OT.threeD.drawFaces(coreSlots[0], cFaces, cam, opacity, CORE_MATERIAL);

  var gp = OT.w2s(pos.x, pos.y, cam);
  OT.atmos.applyGlow(els.glow1, gp[0], gp[1], 0.55 * opacity, 1);
  OT.atmos.applyGlow(els.glow2, gp[0], gp[1], 0.3 * opacity);

  // ---- tiles / bars: ONE element per slot, all the way through. MATCH POINT (split): all 3 are born,
  // simultaneously, at T.splitAt, at the token's own last face size (TOKEN_FACE_W square) and position
  // (FUSE_WORLD) -- the exact instant/place tokenOpacity() cuts the token to 0 -- then separate while
  // morphing to their true aspect ratio (the 1:1 slot needs no distortion at all, so its tile IS the
  // token's face, continued). MATCH POINT (collapse): past T.tilesSettleBy, if this format has a proof
  // beat, the SAME rect's own w/h morph from the tile's footprint down into its bar's base (bottom-
  // anchored on tile.baseY, x pinned at the tile's own slot.wx) -- decorative sub-elements shrink to
  // nothing over the same window (a size collapse, not an opacity fade) -- then that base rect's height
  // rises into the bar. MATCH POINT (fuse): the bar shrinks and slides into TOKEN_FACE_W at FUSE_WORLD,
  // arriving there at exactly T.fuseAt, the instant tokenOpacity() cuts the token back to visible and
  // tokenDepth() starts its extrude from flat.
  if (hasOutcomes) {
    els.tiles.forEach(function (tile, i) {
      var slot = tile.slot;
      var t0 = T.splitAt, t1 = t0 + Math.max(0.25, T.tilesSettleBy - T.splitAt) + i * 0.05;
      var p = OT.clamp(OT.prog(t, t0, t1, "back.out(1.4)"), 0, 1.08);
      var baseScaleX = TOKEN_FACE_W / slot.w, baseScaleY = TOKEN_FACE_W / slot.h;
      var scaleX = OT.lerp(baseScaleX, 1, p), scaleY = OT.lerp(baseScaleY, 1, p);
      var cx = OT.lerp(FUSE_WORLD.x, slot.wx, p), cy = OT.lerp(FUSE_WORLD.y, slot.wy, p);
      var w = slot.w, h = slot.h, detailFade = 1, fillRgb = TILE_RGB;

      if (hasProof && t >= t1) {
        var c0 = T.collapseAt + i * 0.08, c1 = c0 + OT.B(0.7);
        var cu = OT.clamp(OT.prog(t, c0, c1, "power2.inOut"), 0, 1);
        var r0 = c1, r1 = Math.max(r0 + 0.3, T.barsRiseBy - (2 - i) * 0.05);
        var ru = OT.clamp(OT.prog(t, r0, r1, "power3.out"), 0, 1);
        var fz0 = T.fuseAt - OT.B(0.7);
        var fu = OT.clamp(OT.prog(t, fz0, T.fuseAt, "power2.inOut"), 0, 1);
        var curW = OT.lerp(slot.w, tile.barW, cu);
        var curH = cu >= 1 ? OT.lerp(0.01, tile.targetH, ru) : OT.lerp(slot.h, 0.01, cu);
        // D4 fix: while still collapsing (cu<1) the bar's x/baseline stay pinned to its OWN tile's
        // slot (the collapse match point: same footprint the tile just vanished from). Only once fully
        // collapsed does it slide -- together with its height rising, same `ru` progress -- into the
        // shared, evenly-pitched chart row/baseline built in setup(), landing there by T.barsRiseBy.
        var slideP = cu >= 1 ? ru : 0;
        var curBaseY = OT.lerp(tile.baseY, tile.chartBaseY, slideP);
        var curCx = OT.lerp(slot.wx, tile.chartCx, slideP), curCy = curBaseY - curH / 2;
        cx = OT.lerp(curCx, FUSE_WORLD.x, fu);
        cy = OT.lerp(curCy, FUSE_WORLD.y, fu);
        w = OT.lerp(curW, TOKEN_FACE_W, fu);
        h = OT.lerp(curH, TOKEN_FACE_W, fu);
        scaleX = 1; scaleY = 1;
        detailFade = OT.clamp(1 - cu, 0, 1);
        // D3 fix: tile -> bar (cu) THEN bar -> the token's own flat/frontal color (fu), reaching
        // TOKEN_FACE_RGB exactly at T.fuseAt -- the same color the reformed token already renders as
        // once tokenTiltK() flattens it to frontal there (see TOKEN_FACE_RGB's setup() comment).
        // Previously this stopped at BAR_RGB, so the bars stayed purple right up to the cut while the
        // token appeared in its own (white-ish) material color -- the color pop D3 reported.
        fillRgb = [0, 1, 2].map(function (k) {
          var barRgb = TILE_RGB[k] + (BAR_RGB[k] - TILE_RGB[k]) * cu;
          return barRgb + (TOKEN_FACE_RGB[k] - barRgb) * fu;
        });
      }

      var visible = t >= t0 && (!hasProof || t < T.fuseAt);
      tile.g.setAttribute("opacity", visible ? "1" : "0");
      tile.g.setAttribute("transform", "translate(" + cx.toFixed(1) + " " + cy.toFixed(1) + ") scale(" + scaleX.toFixed(3) + " " + scaleY.toFixed(3) + ")");
      tile.rect.setAttribute("x", (-w / 2).toFixed(1)); tile.rect.setAttribute("y", (-h / 2).toFixed(1));
      tile.rect.setAttribute("width", Math.max(0.01, w).toFixed(1)); tile.rect.setAttribute("height", Math.max(0.01, h).toFixed(1));
      tile.rect.setAttribute("fill", "rgb(" + fillRgb.map(function (v) { return Math.round(v); }).join(",") + ")");
      // decorative content (the two "text" lines + the outcome diamond) is scaled by BOTH detailFade
      // (the collapse-phase shrink to nothing) AND the split-settle progress p -- at the exact birth
      // instant (p=0) every tile is a content-less square matching the token's own blank face, so the
      // per-aspect content-sizing math below (which intentionally differs by slot w/h once settled)
      // never makes the 3 tiles look mismatched at their shared match point.
      var contentScale = OT.clamp(p, 0, 1) * detailFade;
      var lnW = w * 0.5 * contentScale, lnH = Math.max(0.01, h * 0.06 * contentScale);
      tile.ln1.setAttribute("x", (-lnW / 2).toFixed(1)); tile.ln1.setAttribute("y", (-h * 0.28).toFixed(1));
      tile.ln1.setAttribute("width", lnW.toFixed(1)); tile.ln1.setAttribute("height", lnH.toFixed(1));
      tile.ln2.setAttribute("x", (-lnW * 0.35).toFixed(1)); tile.ln2.setAttribute("y", (-h * 0.28 + lnH * 1.8).toFixed(1));
      tile.ln2.setAttribute("width", (lnW * 0.7).toFixed(1)); tile.ln2.setAttribute("height", lnH.toFixed(1));
      // D5 fix: this constant was 0.011, which (against CORE_LOCAL's own ~37.8-unit reach) drew a
      // diamond spanning most of the tile's short side -- at a glance in a compressed frame that
      // oversized, edge-to-edge shape read as a stray ring/arc "parked" over the tile for the whole
      // outcomes+proof window (T.splitAt..T.collapseAt+~0.35s) instead of a small outcome accent icon.
      // 0.0024 keeps the same shape/position/shrink choreography but sizes it to ~18% of the tile's
      // short side, matching the accent-icon scale of the two "text" line rects beside it.
      var diaSmallScale = Math.min(w, h) * 0.0024;
      // A2b1R3 E3(a) fix: the diamond used to grow from 0 (dScale = diaSmallScale * contentScale, which
      // is exactly 0 at the birth instant p=0) -- so at the split cut the token's own big on-face
      // diamond (coreFace() draws CORE_LOCAL at its natural 1.0 scale) vanished into NOTHING, and the
      // split's burst/ring pop FX (registered at the same point/time) was the only visible content for
      // the first ~100ms, reading as "the diamond turned into a white ring" (a content swap) rather than
      // a token->tile morph. Starting dScale at 1 (CORE_LOCAL's own natural scale, matching the token's
      // face exactly at the cut) and lerping DOWN to the small accent-icon size as p advances makes the
      // tile's content the token's content, continuously shrinking into its resting accent-icon role --
      // no swap, and no window where the pop FX is the only thing visible.
      var dScale = OT.lerp(1, diaSmallScale, OT.clamp(p, 0, 1)) * detailFade;
      tile.dia.setAttribute("points", CORE_LOCAL.map(function (pt) { return (pt[0] * dScale).toFixed(1) + "," + (pt[1] * dScale + h * 0.12 * contentScale).toFixed(1); }).join(" "));
    });
  }

  // ---- FX: the SAME registered burst/ring/flash events queued in build() (launch, split, collapse,
  // fuse, impact) only actually paint once this canvas is cleared and drawn every frame -- exactly the
  // template's own render() pattern (engine.md "The #fx canvas is screen space too, drawn to look like
  // world space"). Without this, OT.fx.flash's impact flash (and every other queued event) is registered
  // but never rendered. ----
  // Defensive reset before clearing: OT.fx.renderCanvas restores its own transform (ot-fx.js), but
  // resetting here too means this clearRect is correct even if some other canvas draw upstream ever
  // leaves a transform set (engine.md renderCanvas contract).
  els.ctx.setTransform(1, 0, 0, 1, 0, 0);
  els.ctx.clearRect(0, 0, FMT.w, FMT.h);
  OT.fx.worldTf(els.ctx, cam);
  OT.fx.renderCanvas(els.ctx, t, cam);

  // mark draw-on + comets: pure function of t, identical to the template's own pattern
  var ringQ = OT.prog(t, T.impact - 0.3, T.impact + 0.6, "power2.out");
  OT.lockup.drawMask(RING, [ringQ]);
  OT.lockup.comet(OT.$("#cometA"), RING[0], ringQ, { rMax: 14 });
  var cometBQ = OT.prog(t, T.impact - 0.3 + 0.08, T.impact + 0.6, "power2.out");
  OT.lockup.comet(OT.$("#cometB"), RING[0], cometBQ, { rMax: 9 });

  els.tc.textContent = OT.hud.timecode(t, FMT.fps);
  els.rec.style.opacity = OT.hud.recBlink(t);
  els.meterTxt.textContent = OT.hud.cascadeLabel([
    { test: function () { return t >= T.launch; }, label: "LIVE" },
    { test: function () { return t >= T.impact; }, label: "LOCKED" },
  ], "READY");
}
