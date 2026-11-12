// Hero starfield: stars fall toward the black-hole O and are drawn through a point lens,
// so they bunch into a bright ring around it and never show inside the shadow.
// Canvas2D fallback for the vgpu starfield (no WebGPU, or reduced motion):
// same field at the same density, plus the same right-side shooting stars.
// Copied verbatim from continuum-landing-page src/lib/starfield.ts; the login
// page uses its card as the well. Resync from there rather than editing here.

type Star = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  m: number;
  c: string;
  lx?: number;
  ly?: number;
};
type Meteor = {
  t: number;
  dur: number;
  x: number;
  y: number;
  dx: number;
  dy: number;
  len: number;
  wait: number;
};

// Wordmark cream most of the time, with a few cyan and violet stars from the brand pair.
const TINTS = [
  '243,239,230',
  '243,239,230',
  '243,239,230',
  '243,239,230',
  '191,234,242',
  '214,203,255',
];
const G = 2.6e5; // pull strength in CSS px³/s²
const SOFTEN = 400; // keeps the pull finite near the centre
const DRAG = 0.035; // slow orbital decay, so stars spiral in instead of orbiting forever

// Hero ignition choreography (mirrored by the WebGPU field): the swirl spins up
// from the edges over HERO_IGNITION_MS, and the live black-hole O crossfades in
// once the first stars arrive, at HERO_O_CATCH_MS. When the spin-up completes,
// one big finale streak falls from the top-right and settles onto the middle —
// the eye's last stop is the demo button. Tune here.
export const HERO_IGNITION_MS = 2400;
export const HERO_O_CATCH_MS = 1200;
export const HERO_FINALE_S = 2.4; // = HERO_IGNITION_MS / 1000; the finale's cue
const FINALE_DUR = 1.6; // seconds, both fields mirror this
export const easeOutCubic = (t: number) => 1 - (1 - t) ** 3;

export function startStarfield(
  canvas: HTMLCanvasElement,
  well: HTMLElement,
  reduced: boolean,
): () => void {
  const ctx = canvas.getContext('2d');
  if (!ctx) return () => {};

  const stars: Star[] = [];
  const meteors: Meteor[] = [];
  let w = 0,
    h = 0,
    cx = 0,
    cy = 0,
    E = 0;
  let raf = 0,
    last = 0,
    running = false,
    visible = true;
  // Ignition progress 0→1 on the active-time clock (rAF steps only, so a
  // hidden tab can't eat the show). Reduced motion renders settled (1).
  let ignition = reduced ? 1 : 0,
    ignT = 0;
  const finale = { active: false, done: reduced };

  const measure = () => {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const box = canvas.getBoundingClientRect();
    const o = well.getBoundingClientRect();
    w = box.width;
    h = box.height;
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    cx = o.left + o.width / 2 - box.left;
    cy = o.top + o.height / 2 - box.top;
    E = o.width * 0.62; // Einstein radius just outside the visible shadow
    // Same density as the vgpu field (trimmed ~20%): dense enough to read
    // edge-to-edge, capped so huge monitors stay cheap, floored for phones.
    const target = Math.round(Math.min(2700, Math.max(730, (w * h) / 529)));
    while (stars.length < target) stars.push(spawn({} as Star, false));
    stars.length = target;
    while (meteors.length < 5)
      meteors.push({ t: 1, dur: 1, x: 0, y: 0, dx: 0, dy: 0, len: 0, wait: Math.random() * 6 });
  };

  function spawnMeteor(m: Meteor): void {
    // Right side only, upper-middle heights, streaking down-left.
    m.x = w * (0.55 + Math.random() * 0.45);
    m.y = h * (0.05 + Math.random() * 0.45);
    const dip = (18 + Math.random() * 22) * (Math.PI / 180); // 18–40° below horizontal
    const speed = w * (0.35 + Math.random() * 0.25);
    m.dx = -Math.cos(dip) * speed;
    m.dy = Math.sin(dip) * speed;
    m.len = 120 + Math.random() * 100;
    m.dur = 0.9 + Math.random() * 0.6;
    m.t = 0;
    m.wait = 2 + Math.random() * 5; // sporadic: seconds of dark between apparitions
  }

  function spawn(s: Star, edge: boolean): Star {
    // Uniform across the whole hero rect so the far side (e.g. far right of the O)
    // stays populated. Gravity + the point lens still bunch them into a bright
    // ring near the hole, so the pull-in effect is preserved.
    // `edge` is kept for the call-site signature; both initial and respawned
    // stars fill the field uniformly to sustain coverage over time.
    void edge;
    let x = Math.random() * w;
    let y = Math.random() * h;
    let dx = x - cx,
      dy = y - cy,
      r = Math.hypot(dx, dy) || 1;
    // Keep spawns outside the shadow so they don't pop on the ring for one frame.
    for (let tries = 0; r < E * 0.7 && tries < 4; tries++) {
      x = Math.random() * w;
      y = Math.random() * h;
      dx = x - cx;
      dy = y - cy;
      r = Math.hypot(dx, dy) || 1;
    }
    s.x = x;
    s.y = y;
    // Ignition: births happen out in the field and drift in as the swirl spins
    // up. Wrapped into bounds so the spread never leaves a gap at the edges.
    const spread = 1 + (1 - ignition) * 1.2;
    s.x = cx + (s.x - cx) * spread;
    s.y = cy + (s.y - cy) * spread;
    if (w > 0 && h > 0) {
      s.x = ((s.x % w) + w) % w;
      s.y = ((s.y % h) + h) % h;
    }
    const a = Math.atan2(dy, dx);
    // Mostly tangential (one shared direction, like a disk) and a bit short of orbital speed.
    // Clamp r for the velocity so near-hole spawns don't start absurdly fast.
    // Scaled by ignition so the field accelerates instead of arriving at speed.
    const v =
      Math.sqrt(G / Math.max(r, E)) * (0.55 + Math.random() * 0.35) * (0.25 + 0.75 * ignition);
    s.vx = -Math.sin(a) * v;
    s.vy = Math.cos(a) * v;
    s.m = Math.random() < 0.12 ? 1.6 : 0.8 + Math.random() * 0.5;
    s.c = TINTS[(Math.random() * TINTS.length) | 0];
    s.lx = s.ly = undefined;
    return s;
  }

  const draw = (dt: number) => {
    const e = reduced ? 1 : ignition;
    const fade = e * e * (3 - 2 * e); // smoothstep: the field wakes up
    const spd = 0.2 + 0.8 * e; // ...and accelerates into the swirl
    ctx.clearRect(0, 0, w, h);
    for (const s of stars) {
      let dx = s.x - cx,
        dy = s.y - cy,
        r = Math.hypot(dx, dy) || 1;
      if (dt) {
        const sdt = dt * spd;
        const a = G / (r * r + SOFTEN);
        s.vx = (s.vx - (dx / r) * a * sdt) * (1 - DRAG * sdt);
        s.vy = (s.vy - (dy / r) * a * sdt) * (1 - DRAG * sdt);
        s.x += s.vx * sdt;
        s.y += s.vy * sdt;
        dx = s.x - cx;
        dy = s.y - cy;
        r = Math.hypot(dx, dy) || 1;
        if (r < E * 0.5) {
          spawn(s, true);
          continue;
        }
      }
      // Outer image of a point lens: always outside E, brighter the closer it sits to the ring.
      const t = (r + Math.sqrt(r * r + 4 * E * E)) / 2;
      const mu = Math.min(4, t ** 4 / (t ** 4 - E ** 4));
      const px = cx + (dx / r) * t;
      const py = cy + (dy / r) * t;
      // Smooth absorption: dissolve over the last stretch toward the horizon
      // instead of winking out at the respawn radius.
      const au = Math.min(1, Math.max(0, (r - E * 0.5) / (E * 0.65)));
      const absorb = au * au * (3 - 2 * au);
      const alpha = Math.min(1, 0.4 * s.m * mu) * absorb * fade;
      const size = s.m * (0.55 + 0.45 * absorb);
      ctx.fillStyle = ctx.strokeStyle = `rgba(${s.c},${alpha})`;
      if (dt && s.lx !== undefined && Math.hypot(px - s.lx, py - s.ly!) < 40) {
        ctx.lineWidth = size;
        ctx.beginPath();
        ctx.moveTo(s.lx, s.ly!);
        ctx.lineTo(px, py);
        ctx.stroke();
      } else {
        ctx.fillRect(px, py, size, size);
      }
      s.lx = px;
      s.ly = py;
    }
    // Meteors join once the field is alive; the opening belongs to the spin-up.
    if (dt && e > 0.6) drawMeteors(dt);
  };

  // The ignition finale, fired once when the spin-up completes: a big bright
  // streak from the top-right that eases out as it settles onto the middle,
  // handing the eye to the demo button. Passive meteors resume after it.
  let finaleT = 0;
  const drawFinale = (dt: number) => {
    finaleT = Math.min(1, finaleT + dt / FINALE_DUR);
    const p = finaleT;
    const pe = 1 - (1 - p) * (1 - p);
    const ax = w * 0.98,
      ay = h * 0.02,
      bx = w * 0.5,
      by = h * 0.66;
    const dx = bx - ax,
      dy = by - ay,
      dist = Math.hypot(dx, dy) || 1;
    const hx = ax + dx * pe,
      hy = ay + dy * pe;
    const len = Math.min(w * 0.34, 520);
    const tx = hx - (dx / dist) * len,
      ty = hy - (dy / dist) * len;
    const envelope = Math.sin(Math.PI * p);
    const grad = ctx.createLinearGradient(hx, hy, tx, ty);
    grad.addColorStop(0, `rgba(235,248,255,${envelope})`);
    grad.addColorStop(0.25, `rgba(191,234,242,${0.85 * envelope})`);
    grad.addColorStop(1, 'rgba(191,234,242,0)');
    ctx.strokeStyle = grad;
    ctx.lineWidth = 3.4;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(hx, hy);
    ctx.lineTo(tx, ty);
    ctx.stroke();
    const glow = ctx.createRadialGradient(hx, hy, 0, hx, hy, 14);
    glow.addColorStop(0, `rgba(255,255,255,${0.95 * envelope})`);
    glow.addColorStop(0.4, `rgba(217,240,255,${0.6 * envelope})`);
    glow.addColorStop(1, 'rgba(217,240,255,0)');
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.arc(hx, hy, 14, 0, Math.PI * 2);
    ctx.fill();
    ctx.lineCap = 'butt';
    if (p >= 1) {
      finale.active = false;
      finale.done = true;
    }
  };

  const drawMeteors = (dt: number) => {
    for (const m of meteors) {
      if (m.t >= 1) {
        m.wait -= dt;
        if (m.wait <= 0) spawnMeteor(m);
        else continue;
      }
      m.t = Math.min(1, m.t + dt / m.dur);
      const hx = m.x + m.dx * m.t * m.dur;
      const hy = m.y + m.dy * m.t * m.dur;
      const inv = 1 / Math.hypot(m.dx, m.dy || 1);
      const tx = hx - m.dx * inv * m.len;
      const ty = hy - m.dy * inv * m.len;
      const envelope = Math.sin(Math.PI * m.t);
      const grad = ctx.createLinearGradient(hx, hy, tx, ty);
      grad.addColorStop(0, `rgba(217,240,255,${envelope})`);
      grad.addColorStop(1, 'rgba(217,240,255,0)');
      ctx.strokeStyle = grad;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(hx, hy);
      ctx.lineTo(tx, ty);
      ctx.stroke();
    }
  };

  const tick = (now: number) => {
    const step = last ? Math.min((now - last) / 1000, 0.05) : 0;
    ignT += step; // active time only: a hidden tab fast-forwards nothing
    ignition = reduced ? 1 : easeOutCubic(Math.min(ignT / (HERO_IGNITION_MS / 1000), 1));
    if (
      !finale.done &&
      !finale.active &&
      ignition >= 1 &&
      step > 0 &&
      visible &&
      !document.hidden
    ) {
      finale.active = true;
      finaleT = 0;
    }
    draw(step);
    if (finale.active) drawFinale(step);
    last = now;
    raf = requestAnimationFrame(tick);
  };
  const reconcile = () => {
    const shouldRun = !reduced && visible && !document.hidden;
    if (shouldRun === running) return;
    running = shouldRun;
    if (running) {
      last = 0;
      raf = requestAnimationFrame(tick);
    } else cancelAnimationFrame(raf);
  };

  const remeasure = () => {
    measure();
    if (!running) draw(0);
  };
  const ro = new ResizeObserver(remeasure);
  ro.observe(canvas);
  ro.observe(well);
  document.fonts?.ready.then(remeasure); // the Futura swap moves the O
  const io = new IntersectionObserver(([entry]) => {
    visible = entry?.isIntersecting ?? true;
    reconcile();
  });
  io.observe(canvas);
  document.addEventListener('visibilitychange', reconcile);

  measure();
  draw(0);
  reconcile();

  return () => {
    cancelAnimationFrame(raf);
    ro.disconnect();
    io.disconnect();
    document.removeEventListener('visibilitychange', reconcile);
  };
}
