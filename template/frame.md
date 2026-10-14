---
colors:
  bg: "#111316"
  bg-deep: "#0a0b0d"
  surface: "#1a1d22"
  surface-2: "#22262c"
  line: "#2e343c"
  ink: "#e9ecf0"
  ink-soft: "#aab2be"
  ink-faint: "#838c99"
  accent: "#6ea8ff"
  accent-2: "#8fd0c4"
typography:
  display: "Geist"
  mono: "Geist Mono"
  wordmark-weight: 700
  hud-weight: 400
  hud-tracking: "0.2em"
spacing:
  safe-16:9: "5% every side"
  safe-9:16: "5.926% left / 12% top / 11.481% right / 22% bottom"
components:
  lockup: "mark (ring + inner shape) + wordmark + tagline (2 lines) + url"
  hud: "4 corner brackets + brand label + timecode/rec + status meter + captions"
---

## Overview

Placeholder `frame.md` for the `one-take-showreel` template — a new brand run overwrites every
token above with its own site's dark-theme values (SKILL.md phase 1) and rewrites this prose to
match. This is the video-first design spec (design-spec.md), the frame-scale companion to a
`design.md`; nothing here is layout — `hyperframes-creative/references/video-composition.md` is the
consumption contract ("the design spec is brand, not layout").

The palette above is neutral on purpose: one dark background, one accent (`--accent`, used for the
ring/mark and primary highlights), one secondary (`--accent-2`, used for the inner shape and warm
highlights). `assets/logo/logo.js` colors its two placeholder components directly from this pair.

## The Frame

Both aspects render from the same `:root` tokens; only the lockup's `OT.fmt.layout` changes (`row`
for 16:9, `stack` for 9:16 — engine.md § Formats). Title-safe margins are the engine's own
`OT.fmt.safe` fractions, not brand data — see `spacing` above and engine.md § Formats for where they
come from (a flat 5% for 16:9; a conservative union of TikTok/Reels/Shorts chrome for 9:16).

## Composition Rules

- Keep the hero, all copy and the lockup inside `OT.fmt.safe` at every anchor (method.md §7).
- The mark is built once, in `setup()`, from `window.OT_LOGO` — never redrawn by hand per format.
- Wordmark/tagline/url text comes only from `window.OT_BRAND` — never hardcoded in `acts.js` or
  `index.html`.
- No fabricated numbers, metrics or social proof anywhere on screen (method.md §5); this template's
  own "hello" act has none.

## Do / Don't

- Do keep one `:root` color block as the only place hex values live.
- Do use `Geist`/`Geist Mono` (or the new brand's replacements) via local `@font-face` — no network
  font fetches at render time, except HyperFrames' own deterministic Google Fonts injection.
- Don't reintroduce a per-aspect branch in `acts.js` beyond reading `OT.fmt`'s own fields — the
  lockup/HUD primitives already take `OT.fmt.layout`/`safe` and adapt themselves.
