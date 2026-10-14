/*
 * ot-camera.js — virtual camera: Hermite x/y/scale tracks, post-event shake windows,
 * world<->screen projection, and the #world transform. No brand data: screen center always
 * comes from OT.fmt.cx/cy, never a literal.
 */
(function (OT) {
  "use strict";
  OT.cam = OT.cam || {};
  OT.cam.persp = 1700; // default perspective distance; override via OT.cam.persp = N before first use if a brand needs a different lens

  var _tracks = null; // {x:[[t,val,vel],...], y:[...], s:[...]}
  var _shakes = [];   // [{t0,dur,amp}]

  OT.cam.tracks = function tracks(t) {
    _tracks = t;
    return OT.cam;
  };
  OT.cam.addShake = function addShake(t0, dur, amp) {
    _shakes.push({ t0: t0, dur: dur, amp: amp });
    return OT.cam;
  };
  OT.cam.at = function at(t) {
    var x = OT.herm(t, _tracks.x), y = OT.herm(t, _tracks.y), s = OT.herm(t, _tracks.s);
    for (var i = 0; i < _shakes.length; i++) {
      var sh = _shakes[i];
      if (t > sh.t0 && t < sh.t0 + sh.dur) {
        var a = 1 - (t - sh.t0) / sh.dur, f = Math.round(t * OT.fmt.fps);
        x += (OT.hash(f) - 0.5) * sh.amp * a * a;
        y += (OT.hash(f + 91) - 0.5) * sh.amp * a * a;
      }
    }
    return { x: x, y: y, s: s };
  };

  OT.project = function project(p, cam) {
    var k = OT.cam.persp / (OT.cam.persp - p[2] * cam.s);
    return [OT.fmt.cx + (p[0] - cam.x) * cam.s * k, OT.fmt.cy + (p[1] - cam.y) * cam.s * k, k];
  };
  OT.w2s = function w2s(x, y, cam) {
    return [OT.fmt.cx + (x - cam.x) * cam.s, OT.fmt.cy + (y - cam.y) * cam.s];
  };
  // exact inverse of w2s: screen-space (sx,sy) -> world-space [x,y]. Lets a world-space object
  // (e.g. a flying hero) home onto a SCREEN-space target (e.g. a lockup mark outside #world):
  // OT.s2w(plan.mark.cx, plan.mark.cy, OT.cam.at(t)) gives that mark's position in world units.
  OT.s2w = function s2w(sx, sy, cam) {
    return [(sx - OT.fmt.cx) / cam.s + cam.x, (sy - OT.fmt.cy) / cam.s + cam.y];
  };
  OT.cam.applyWorld = function applyWorld(cam, el) {
    el.style.transform = "translate(" + (OT.fmt.cx - cam.x * cam.s).toFixed(2) + "px, " + (OT.fmt.cy - cam.y * cam.s).toFixed(2) + "px) scale(" + cam.s.toFixed(5) + ")";
  };
  // screen-space x-velocity magnitude: one-frame finite difference (drives whip-blur/dot-streak/bokeh-stretch signals)
  OT.cam.vel = function vel(t) {
    var cam = OT.cam.at(t), prev = OT.cam.at(t - 1 / OT.fmt.fps);
    return Math.abs(cam.x - prev.x) * cam.s;
  };
})(window.OT);
