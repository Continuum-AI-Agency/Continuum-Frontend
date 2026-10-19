// The HyperFrames player runtime (0.8.75) seeks a clip's own CSS animation at t − data-start,
// while our compositions write that animation with delay = data-start and Render seeks every
// animation at absolute t (`seekComposition`). In the player, scene 2 of a film therefore shows
// only at twice its start. This shim runs inside the composition document, before the runtime,
// and makes every write the runtime makes to a clip animation's currentTime land on the
// player's own absolute time — Render's semantics — without touching the vendored runtime or
// the stored composition. Motion-data targets never carry data-start, so they are untouched.
export const PLAYER_CLOCK_SHIM = `(function () {
  var native = Object.getOwnPropertyDescriptor(Animation.prototype, 'currentTime');
  if (!native || !native.set) return;
  document.querySelectorAll('[data-start]').forEach(function (element) {
    element.getAnimations().forEach(function (animation) {
      Object.defineProperty(animation, 'currentTime', {
        configurable: true,
        get: function () { return native.get.call(this); },
        set: function (ms) {
          var player = window.__player;
          var seconds = player && typeof player.getTime === 'function' ? Number(player.getTime()) : NaN;
          native.set.call(this, Number.isFinite(seconds) ? seconds * 1000 : ms);
        },
      });
    });
  });
})();`;

/** The composition as the player loads it: the clock shim, then the runtime, before `</body>`. */
export function withPlayerRuntime(html: string, runtimeSrc: string): string {
  const scripts = `<script>${PLAYER_CLOCK_SHIM}</script><script src="${runtimeSrc}"></script>`;
  return /<\/body>/i.test(html)
    ? html.replace(/<\/body>/i, `${scripts}</body>`)
    : `${html}${scripts}`;
}
