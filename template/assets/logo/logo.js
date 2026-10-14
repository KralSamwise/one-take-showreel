/*
 * logo.js — placeholder mark geometry, shaped exactly like scripts/trace-logo.py's logo-paths.json
 * manifest (viewBox / tile / components[{id,color,d,bbox,area_frac,iou}]). A new brand replaces this
 * file with a real trace of its own mark (same shape) or hand-authored equivalents. Ships a simple
 * geometric placeholder: a ring plus an inner diamond, both centered in a 200x200 local box.
 */
window.OT_LOGO = {
  viewBox: [0, 0, 200, 200],
  tile: { color: "#241f30", bbox: [4, 4, 196, 196], rx: 40 },
  components: [
    {
      id: "ring0",
      color: "#8a6bff",
      d: "M40,100 A60,60 0 1,0 160,100 A60,60 0 1,0 40,100",
      bbox: [40, 40, 160, 160],
      area_frac: 0.1963,
      iou: 1
    },
    {
      id: "core0",
      color: "#ffb457",
      d: "M100,66 L134,100 L100,134 L66,100 Z",
      bbox: [66, 66, 134, 134],
      area_frac: 0.0578,
      iou: 1
    }
  ]
};
