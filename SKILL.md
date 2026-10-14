---
name: one-take-showreel
description: Build a short unnarrated brand showreel as one continuous animated shot, with a hero object that transforms into outcomes and returns to the logo. Supports 6, 15 or 30 seconds in horizontal or vertical formats. Use for brand sizzles and one-take product films, not narrated edits or website tours.
---

# One-take showreel

This skill includes the original local engine, a fictional demo and a portable scaffolder. Read `references/engine.md` for the API. Requirements: Node 22+, npm, HyperFrames CLI and its renderer/browser dependencies. Run `npm ci` in this repository; GSAP has its own license (see THIRD_PARTY_NOTICES.md).

1. Read the user's brief and brand sources. Use the real logo, palette and claims; do not inherit the fictional demo identity. If no assets were supplied, use the clearly labeled FORM demo. Default demo: 15 seconds vertical, silent. Add only authorized licensed music/SFX when requested.
2. Choose a concrete hero object representing the product's actual action. Map an unbroken transformation chain: action → hero → launch → outcomes → evidence → home → logo. Omit unsupported evidence rather than inventing numbers or growth.
3. Scaffold with `node scripts/create.mjs NEW_DIR --brand NAME --format 15x9:16 --tagline "Opening line.|Closing line." --url example.com`. Existing targets are refused. This writes a working demo, not a custom finished film.
4. Adapt `assets/brand/acts.js`, `assets/brand/brand.js`, `assets/logo/logo.js` and CSS tokens. Keep each visual a pure function of timeline time. Use the format's safe area and anchors; reblock vertical/horizontal layouts rather than cropping. Keep text readable at phone size.
5. In the generated directory run `npm run check`, then `npm run dev` or `npm run render -- --output renders/review.mp4`. Consult the installed HyperFrames CLI help for flags. Dependencies may be downloaded on first use. Never publish as a side effect of rendering.
6. Inspect the exported video across its full duration, especially transformations and the final lockup. Use the companion render-review skill for evidence. Verify dimensions/duration with ffprobe; play/listen before asserting motion/audio quality. Revise observed defects and provide the editable source with the review cut.

The bundled demo demonstrates shapes and timing only. It cannot establish marketing outcomes. Any brand's real logo geometry or aspect change needs its own visual check.
