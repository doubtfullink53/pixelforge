// Pixel grid: role-mask primitives plus the lighting pass that turns masks into sprites.
//
// A sprite is authored as a grid of material *roles* (cloth, metal, skin, ...).
// Palette colours are applied at render time so the same mask can be recoloured cheaply.

export const ROLE = Object.freeze({
  OUTLINE: 0,
  SKIN: 1,
  SKIN_DEEP: 2,
  HAIR: 3,
  CLOTH: 4,
  TRIM: 5,
  METAL: 6,
  LEATHER: 7,
  WOOD: 8,
  ACCENT: 9,
  EYE: 10,
  WHITE: 11,
  BONE: 12,
  DARK: 13,
  GLOW: 14,
  CLOTH_DARK: 15,
  CAPE: 16,
});

const BAYER = [
  [0, 2],
  [3, 1],
];

// Discrete ramps keep the shading in readable pixel-art steps instead of smooth gradients.
const RAMP = [0.64, 0.78, 0.92, 1.04, 1.16];
const METAL_RAMP = [0.56, 0.7, 0.88, 1.06, 1.24];

function snap(value, ramp) {
  let best = ramp[0];
  for (const step of ramp) {
    if (Math.abs(step - value) < Math.abs(best - value)) best = step;
  }
  return best;
}

export class Grid {
  constructor(w = 32, h = 32) {
    this.w = w;
    this.h = h;
    this.data = new Int8Array(w * h).fill(-1);
  }

  clone() {
    const g = new Grid(this.w, this.h);
    g.data.set(this.data);
    return g;
  }

  inside(x, y) {
    return x >= 0 && y >= 0 && x < this.w && y < this.h;
  }

  get(x, y) {
    if (!this.inside(x, y)) return -1;
    return this.data[y * this.w + x];
  }

  set(x, y, role) {
    const ix = Math.round(x);
    const iy = Math.round(y);
    if (ix < 0 || iy < 0 || ix >= this.w || iy >= this.h) return;
    this.data[iy * this.w + ix] = role;
  }

  clear(x, y) {
    this.set(x, y, -1);
  }

  rect(x, y, w, h, role) {
    const x0 = Math.round(x);
    const y0 = Math.round(y);
    const x1 = Math.round(x + w);
    const y1 = Math.round(y + h);
    for (let yy = y0; yy < y1; yy++) {
      for (let xx = x0; xx < x1; xx++) this.set(xx, yy, role);
    }
  }

  hline(x0, x1, y, role) {
    const a = Math.min(x0, x1);
    const b = Math.max(x0, x1);
    for (let x = Math.round(a); x <= Math.round(b); x++) this.set(x, y, role);
  }

  vline(y0, y1, x, role) {
    const a = Math.min(y0, y1);
    const b = Math.max(y0, y1);
    for (let y = Math.round(a); y <= Math.round(b); y++) this.set(x, y, role);
  }

  ellipse(cx, cy, rx, ry, role, opts = {}) {
    const minY = opts.minY ?? -Infinity;
    const maxY = opts.maxY ?? Infinity;
    const minX = opts.minX ?? -Infinity;
    const maxX = opts.maxX ?? Infinity;
    const y0 = Math.floor(cy - ry);
    const y1 = Math.ceil(cy + ry);
    const x0 = Math.floor(cx - rx);
    const x1 = Math.ceil(cx + rx);
    for (let y = y0; y <= y1; y++) {
      if (y < minY || y > maxY) continue;
      for (let x = x0; x <= x1; x++) {
        if (x < minX || x > maxX) continue;
        const dx = (x + 0.5 - cx) / rx;
        const dy = (y + 0.5 - cy) / ry;
        if (dx * dx + dy * dy <= 1) this.set(x, y, role);
      }
    }
  }

  // Even-odd scanline polygon fill. Points are [x, y] pairs in pixel space.
  poly(points, role) {
    if (points.length < 3) return;
    let minY = Infinity;
    let maxY = -Infinity;
    for (const p of points) {
      if (p[1] < minY) minY = p[1];
      if (p[1] > maxY) maxY = p[1];
    }
    const yStart = Math.max(0, Math.floor(minY));
    const yEnd = Math.min(this.h - 1, Math.ceil(maxY));
    for (let y = yStart; y <= yEnd; y++) {
      const yc = y + 0.5;
      const xs = [];
      for (let i = 0; i < points.length; i++) {
        const a = points[i];
        const b = points[(i + 1) % points.length];
        if ((a[1] <= yc && b[1] > yc) || (b[1] <= yc && a[1] > yc)) {
          xs.push(a[0] + ((yc - a[1]) / (b[1] - a[1])) * (b[0] - a[0]));
        }
      }
      xs.sort((p, q) => p - q);
      for (let i = 0; i + 1 < xs.length; i += 2) {
        const xa = Math.ceil(xs[i] - 0.5);
        const xb = Math.floor(xs[i + 1] - 0.5);
        for (let x = xa; x <= xb; x++) this.set(x, y, role);
      }
    }
  }

  brush(cx, cy, radius, role) {
    const r = Math.max(0.1, radius);
    const y0 = Math.floor(cy - r);
    const y1 = Math.ceil(cy + r);
    const x0 = Math.floor(cx - r);
    const x1 = Math.ceil(cx + r);
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        const dx = x + 0.5 - cx;
        const dy = y + 0.5 - cy;
        if (dx * dx + dy * dy <= r * r) this.set(x, y, role);
      }
    }
  }

  // Thick tapered line, the workhorse for limbs, staffs and tails.
  line(x0, y0, x1, y1, r0, r1, role, underlay = null) {
    const dx = x1 - x0;
    const dy = y1 - y0;
    const len = Math.max(0.001, Math.hypot(dx, dy));
    const steps = Math.max(1, Math.ceil(len * 2));
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      const r = r0 + (r1 - r0) * t;
      const x = x0 + dx * t;
      const y = y0 + dy * t;
      if (underlay !== null) this.brush(x, y, r + 0.85, underlay);
      this.brush(x, y, r, role);
    }
  }

  // Rotated bar from `dist0` to `dist1` along `angle` (degrees), measured from (ox, oy).
  bar(ox, oy, angle, dist0, dist1, width, role) {
    const rad = (angle * Math.PI) / 180;
    const ux = Math.cos(rad);
    const uy = Math.sin(rad);
    const px = -uy;
    const py = ux;
    const hw = width / 2;
    this.poly(
      [
        [ox + ux * dist0 + px * hw, oy + uy * dist0 + py * hw],
        [ox + ux * dist0 - px * hw, oy + uy * dist0 - py * hw],
        [ox + ux * dist1 - px * hw, oy + uy * dist1 - py * hw],
        [ox + ux * dist1 + px * hw, oy + uy * dist1 + py * hw],
      ],
      role,
    );
  }

  mirrorX() {
    const g = new Grid(this.w, this.h);
    for (let y = 0; y < this.h; y++) {
      for (let x = 0; x < this.w; x++) {
        g.data[y * this.w + (this.w - 1 - x)] = this.data[y * this.w + x];
      }
    }
    return g;
  }
}

/**
 * Light a role grid into RGBA pixels.
 * Key light comes from the top-left, so top edges highlight, bottom edges fall into shadow.
 * `outline` adds the one-pixel silhouette that gives sprites their graphic punch.
 */
export function renderSprite(grid, palette, opts = {}) {
  const { outline = true, glow = false } = opts;
  const w = grid.w;
  const h = grid.h;
  const px = new Uint8ClampedArray(w * h * 4);
  const solid = (x, y) => grid.get(x, y) !== -1;

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const role = grid.get(x, y);
      if (role === -1) continue;
      const entry = palette[role];
      if (!entry) continue;

      const above = !solid(x, y - 1);
      const below = !solid(x, y + 1);
      const left = !solid(x - 1, y);
      const right = !solid(x + 1, y);

      let f = 1;
      if (above) f *= 1.16;
      if (below) f *= 0.7;
      if (left) f *= 1.05;
      if (right) f *= 0.86;

      // Vertical falloff keeps large flat areas from reading as a single colour.
      const v = (y - 3) / 25;
      f *= 1.04 - 0.12 * Math.max(0, Math.min(1, v));

      // Ordered dithering breaks the ramps up like a limited palette would.
      f += (BAYER[y & 1][x & 1] / 3 - 0.5) * 0.04;

      if (entry.metal) {
        if (above) f *= 1.06;
        if (below) f *= 0.94;
        if ((x * 2 + y * 3) % 13 === 0) f = Math.max(f, 1.26);
      }

      const vivid = role === ROLE.EYE || role === ROLE.WHITE || role === ROLE.ACCENT || role === ROLE.GLOW;
      if (vivid) {
        f = Math.max(0.95, Math.min(1.1, f));
      } else if (role !== ROLE.OUTLINE) {
        f = snap(f, entry.metal ? METAL_RAMP : RAMP);
      } else {
        f = 1;
      }

      const r = Math.round(entry.r * f);
      const g = Math.round(entry.g * f);
      const b = Math.round(entry.b * f);
      const i = (y * w + x) * 4;
      px[i] = r;
      px[i + 1] = g;
      px[i + 2] = b;
      px[i + 3] = entry.alpha ?? 255;
    }
  }

  if (outline) {
    const o = palette[ROLE.OUTLINE];
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        if (grid.get(x, y) !== -1) continue;
        const near =
          solid(x - 1, y) || solid(x + 1, y) || solid(x, y - 1) || solid(x, y + 1);
        if (!near) continue;
        const i = (y * w + x) * 4;
        px[i] = o.r;
        px[i + 1] = o.g;
        px[i + 2] = o.b;
        px[i + 3] = 255;
      }
    }
  }

  if (glow) {
    const halo = palette[ROLE.GLOW];
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        if (grid.get(x, y) !== -1) continue;
        const i = (y * w + x) * 4;
        if (px[i + 3] !== 0) continue;
        const nearAccent =
          grid.get(x - 1, y) === ROLE.ACCENT ||
          grid.get(x + 1, y) === ROLE.ACCENT ||
          grid.get(x, y - 1) === ROLE.ACCENT ||
          grid.get(x, y + 1) === ROLE.ACCENT ||
          grid.get(x - 1, y) === ROLE.GLOW ||
          grid.get(x + 1, y) === ROLE.GLOW ||
          grid.get(x, y - 1) === ROLE.GLOW ||
          grid.get(x, y + 1) === ROLE.GLOW;
        if (!nearAccent) continue;
        px[i] = halo.r;
        px[i + 1] = halo.g;
        px[i + 2] = halo.b;
        px[i + 3] = halo.alpha ?? 120;
      }
    }
  }

  return px;
}
