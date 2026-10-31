// Turns a full-size AI image into a clean, limited-palette pixel sprite.
//
// Image models draw at 1024px with soft edges, antialiasing, gradients and a
// painted background. Pixel art is the opposite: hard edges, a small palette,
// no background. This module is the bridge — key out the backdrop, crop to the
// character, area-average down to the target grid, reduce to N colours, then
// stamp a one-pixel outline in the sprite's own darkest colour.

const BG_TOLERANCE = 38; // squared-distance tolerance for "this is backdrop"
const ALPHA_CUTOFF = 0.42; // coverage below this becomes fully transparent
const MAX_WORK = 512; // work at most this big; we downsample anyway

// ------------------------------------------------------------------ colour

const pack = (r, g, b) => (r << 16) | (g << 8) | b;

function sqDist(r1, g1, b1, r2, g2, b2) {
  const dr = r1 - r2;
  const dg = g1 - g2;
  const db = b1 - b2;
  return dr * dr + dg * dg + db * db;
}

function toHex(r, g, b) {
  return `#${[r, g, b].map((v) => Math.max(0, Math.min(255, v)).toString(16).padStart(2, '0')).join('')}`;
}

/** Average colour of a square patch, ignoring fully transparent pixels. */
function patchAverage(data, width, x0, y0, w, h) {
  let r = 0;
  let g = 0;
  let b = 0;
  let n = 0;
  for (let y = y0; y < y0 + h; y++) {
    for (let x = x0; x < x0 + w; x++) {
      const i = (y * width + x) * 4;
      if (data[i + 3] < 200) continue;
      r += data[i];
      g += data[i + 1];
      b += data[i + 2];
      n++;
    }
  }
  return n ? { r: r / n, g: g / n, b: b / n, n } : null;
}

/**
 * Estimate the backdrop colour from the corners, which in a centered sprite
 * render are almost always pure background. Uses the most common of the four
 * corners so a single odd corner (a dropped shadow, a prop) cannot fool it.
 */
function estimateBackdrop(data, width, height) {
  const size = Math.max(3, Math.round(Math.min(width, height) * 0.08));
  const corners = [
    patchAverage(data, width, 0, 0, size, size),
    patchAverage(data, width, width - size, 0, size, size),
    patchAverage(data, width, 0, height - size, size, size),
    patchAverage(data, width, width - size, height - size, size, size),
  ].filter(Boolean);

  if (!corners.length) return null;

  let best = corners[0];
  let bestScore = -1;
  for (const candidate of corners) {
    // vote: how many of the other corners agree with this one?
    let score = 0;
    for (const other of corners) {
      if (sqDist(candidate.r, candidate.g, candidate.b, other.r, other.g, other.b) < BG_TOLERANCE * BG_TOLERANCE) {
        score += other.n;
      }
    }
    if (score > bestScore) {
      bestScore = score;
      best = candidate;
    }
  }
  return { r: Math.round(best.r), g: Math.round(best.g), b: Math.round(best.b) };
}

/** Flood fill from every border pixel; anything reachable and close to the
 *  backdrop colour becomes transparent. Returns true on the alpha channel. */
function keyOutBackdrop(data, width, height, bg) {
  const seen = new Uint8Array(width * height);
  const stack = [];

  const isBackground = (index) => {
    const i = index * 4;
    if (data[i + 3] < 12) return true;
    return sqDist(data[i], data[i + 1], data[i + 2], bg.r, bg.g, bg.b) <= BG_TOLERANCE * BG_TOLERANCE;
  };

  const push = (x, y) => {
    if (x < 0 || y < 0 || x >= width || y >= height) return;
    const index = y * width + x;
    if (seen[index]) return;
    if (!isBackground(index)) return;
    seen[index] = 1;
    stack.push(index);
  };

  for (let x = 0; x < width; x++) {
    push(x, 0);
    push(x, height - 1);
  }
  for (let y = 0; y < height; y++) {
    push(0, y);
    push(width - 1, y);
  }

  let removed = 0;
  while (stack.length) {
    const index = stack.pop();
    const i = index * 4;
    data[i + 3] = 0;
    removed++;
    const x = index % width;
    const y = (index - x) / width;
    push(x + 1, y);
    push(x - 1, y);
    push(x, y + 1);
    push(x, y - 1);
  }

  return removed / (width * height);
}

/** Bounding box of pixels with meaningful alpha. */
function contentBox(data, width, height, alphaFloor = 24) {
  let minX = width;
  let minY = height;
  let maxX = -1;
  let maxY = -1;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (data[(y * width + x) * 4 + 3] < alphaFloor) continue;
      if (x < minX) minX = x;
      if (y < minY) minY = y;
      if (x > maxX) maxX = x;
      if (y > maxY) maxY = y;
    }
  }
  if (maxX < 0) return null;
  return { x: minX, y: minY, w: maxX - minX + 1, h: maxY - minY + 1 };
}

// ------------------------------------------------------------------ palette

function channelRange(samples, channel) {
  let min = 255;
  let max = 0;
  for (const s of samples) {
    const v = s[channel];
    if (v < min) min = v;
    if (v > max) max = v;
  }
  return max - min;
}

function averageColour(samples) {
  let r = 0;
  let g = 0;
  let b = 0;
  for (const s of samples) {
    r += s[0];
    g += s[1];
    b += s[2];
  }
  const n = samples.length;
  return [Math.round(r / n), Math.round(g / n), Math.round(b / n)];
}

/** Median cut: split the widest colour box until we hit the budget. */
function medianCut(samples, maxColors) {
  if (!samples.length) return [];
  let buckets = [samples];

  while (buckets.length < maxColors) {
    let target = null;
    let targetScore = 0;
    for (const bucket of buckets) {
      if (bucket.length < 2) continue;
      const range = Math.max(channelRange(bucket, 0), channelRange(bucket, 1), channelRange(bucket, 2));
      const score = range;
      if (score > targetScore) {
        targetScore = score;
        target = bucket;
      }
    }
    if (!target || targetScore < 6) break;

    const channel = [0, 1, 2].reduce(
      (best, c) => (channelRange(target, c) > channelRange(target, best) ? c : best),
      0,
    );
    const sorted = [...target].sort((a, b) => a[channel] - b[channel]);
    const mid = Math.floor(sorted.length / 2);
    const left = sorted.slice(0, mid);
    const right = sorted.slice(mid);
    if (!left.length || !right.length) break;
    buckets = buckets.filter((b) => b !== target);
    buckets.push(left, right);
  }

  return mergeSimilar(buckets.map(averageColour));
}

/**
 * Median cut will happily spend its whole budget on antialiasing shades. Fold
 * near-identical colours together so the palette shows real, distinct colours.
 */
function mergeSimilar(colours, threshold = 14) {
  const merged = [];
  for (const colour of colours) {
    const twin = merged.find(
      (other) => sqDist(colour[0], colour[1], colour[2], other[0], other[1], other[2]) < threshold * threshold,
    );
    if (twin) {
      twin[3].push(colour);
      const average = averageColour(twin[3]);
      twin[0] = average[0];
      twin[1] = average[1];
      twin[2] = average[2];
    } else {
      merged.push([...colour, [colour]]);
    }
  }
  return merged.map((entry) => [entry[0], entry[1], entry[2]]);
}

// ------------------------------------------------------------------ sampling

/**
 * Area-average the cropped source region into a grid. Colours are accumulated
 * premultiplied by alpha so a stray antialiased edge cannot tint the result.
 */
function downsample(data, width, crop, outW, outH) {
  const pixels = new Float32Array(outW * outH * 4);
  const scaleX = crop.w / outW;
  const scaleY = crop.h / outH;

  for (let oy = 0; oy < outH; oy++) {
    const sy0 = crop.y + oy * scaleY;
    const sy1 = crop.y + (oy + 1) * scaleY;
    for (let ox = 0; ox < outW; ox++) {
      const sx0 = crop.x + ox * scaleX;
      const sx1 = crop.x + (ox + 1) * scaleX;

      let r = 0;
      let g = 0;
      let b = 0;
      let a = 0;
      let count = 0;

      for (let sy = Math.floor(sy0); sy < Math.ceil(sy1); sy++) {
        if (sy < 0 || sy >= crop.y + crop.h) continue;
        for (let sx = Math.floor(sx0); sx < Math.ceil(sx1); sx++) {
          if (sx < 0 || sx >= crop.x + crop.w) continue;
          const i = (sy * width + sx) * 4;
          const alpha = data[i + 3] / 255;
          r += data[i] * alpha;
          g += data[i + 1] * alpha;
          b += data[i + 2] * alpha;
          a += alpha;
          count++;
        }
      }

      const out = (oy * outW + ox) * 4;
      if (!count || a === 0) continue;
      pixels[out] = r / a;
      pixels[out + 1] = g / a;
      pixels[out + 2] = b / a;
      pixels[out + 3] = (a / count) * 255;
    }
  }
  return pixels;
}

// ------------------------------------------------------------------ main

/**
 * @param {HTMLImageElement|ImageBitmap|HTMLCanvasElement} image
 * @param {{ size?: number, colors?: number, outline?: boolean, background?: 'auto'|'keep' }} options
 * @returns {{ rgba: Uint8ClampedArray, size: number, palette: string[], transparency: number }}
 */
export function pixelate(image, options = {}) {
  const size = options.size ?? 32;
  const maxColors = Math.max(2, Math.min(48, options.colors ?? 24));
  const keepBackground = options.background === 'keep';
  const outline = options.outline !== false;

  const naturalW = image.naturalWidth || image.width;
  const naturalH = image.naturalHeight || image.height;
  if (!naturalW || !naturalH) throw new Error('Image has no pixels');

  const workScale = Math.min(1, MAX_WORK / Math.max(naturalW, naturalH));
  const workW = Math.max(1, Math.round(naturalW * workScale));
  const workH = Math.max(1, Math.round(naturalH * workScale));

  const work = document.createElement('canvas');
  work.width = workW;
  work.height = workH;
  const workCtx = work.getContext('2d', { willReadFrequently: true });
  workCtx.imageSmoothingQuality = 'high';
  workCtx.drawImage(image, 0, 0, workW, workH);

  const raw = workCtx.getImageData(0, 0, workW, workH);
  const data = raw.data;

  let removedShare = 0;
  if (!keepBackground) {
    const backdrop = estimateBackdrop(data, workW, workH);
    if (backdrop) removedShare = keyOutBackdrop(data, workW, workH, backdrop);
  }

  // If the key did almost nothing the "background" is painted scenery. Fall
  // back to a centered crop so we still get a character, not a postcard.
  let crop = contentBox(data, workW, workH);
  if (!crop) throw new Error('Nothing visible in that image');

  if (removedShare < 0.04) {
    const side = Math.min(workW, workH);
    crop = {
      x: Math.round((workW - side * 0.82) / 2),
      y: Math.round((workH - side * 0.82) / 2),
      w: Math.round(side * 0.82),
      h: Math.round(side * 0.82),
    };
  }

  // Square-ish fit: preserve the subject's aspect, leave a margin for outline.
  const margin = outline ? 2 : 1;
  const box = size - margin * 2;
  const scale = Math.min(box / crop.w, box / crop.h);
  const drawW = Math.max(1, Math.round(crop.w * scale));
  const drawH = Math.max(1, Math.round(crop.h * scale));
  const offsetX = Math.round((size - drawW) / 2);
  const offsetY = Math.round((size - drawH) / 2);

  const sampled = downsample(data, workW, crop, drawW, drawH);

  // Place into the sprite grid, dropping near-empty edge cells.
  const grid = new Float32Array(size * size * 4);
  for (let y = 0; y < drawH; y++) {
    for (let x = 0; x < drawW; x++) {
      const src = (y * drawW + x) * 4;
      const dst = ((y + offsetY) * size + (x + offsetX)) * 4;
      const coverage = sampled[src + 3] / 255;
      if (coverage < ALPHA_CUTOFF) continue;
      grid[dst] = sampled[src];
      grid[dst + 1] = sampled[src + 1];
      grid[dst + 2] = sampled[src + 2];
      grid[dst + 3] = 255;
    }
  }

  // Quantize the opaque cells to a small palette.
  const samples = [];
  for (let i = 0; i < grid.length; i += 4) {
    if (grid[i + 3] === 0) continue;
    samples.push([Math.round(grid[i]), Math.round(grid[i + 1]), Math.round(grid[i + 2])]);
  }
  const palette = medianCut(samples, maxColors);

  const cache = new Map();
  const nearest = (r, g, b) => {
    const key = pack(r, g, b);
    const hit = cache.get(key);
    if (hit) return hit;
    let best = palette[0];
    let bestDist = Infinity;
    for (const colour of palette) {
      const d = sqDist(r, g, b, colour[0], colour[1], colour[2]);
      if (d < bestDist) {
        bestDist = d;
        best = colour;
      }
    }
    cache.set(key, best);
    return best;
  };

  const rgba = new Uint8ClampedArray(size * size * 4);
  for (let i = 0; i < grid.length; i += 4) {
    if (grid[i + 3] === 0) continue;
    const colour = nearest(grid[i], grid[i + 1], grid[i + 2]);
    rgba[i] = colour[0];
    rgba[i + 1] = colour[1];
    rgba[i + 2] = colour[2];
    rgba[i + 3] = 255;
  }

  if (outline && palette.length) {
    stampOutline(rgba, size, outlineColour(palette));
  }

  const hexes = palette.map((c) => toHex(c[0], c[1], c[2]));
  if (outline && palette.length) hexes.push(toHex(...outlineColour(palette)));

  let opaque = 0;
  for (let i = 3; i < rgba.length; i += 4) if (rgba[i]) opaque++;

  return {
    rgba,
    size,
    palette: hexes,
    transparency: 1 - opaque / (size * size),
  };
}

/** Darkest quantized colour, pushed toward black so the rim reads as a line. */
function outlineColour(palette) {
  let darkest = palette[0];
  let lowest = Infinity;
  for (const c of palette) {
    const luma = c[0] * 0.299 + c[1] * 0.587 + c[2] * 0.114;
    if (luma < lowest) {
      lowest = luma;
      darkest = c;
    }
  }
  return [
    Math.round(darkest[0] * 0.42),
    Math.round(darkest[1] * 0.42),
    Math.round(darkest[2] * 0.48),
  ];
}

/** Draw a rim outside the silhouette: empty cells touching the sprite fill in. */
function stampOutline(rgba, size, colour) {
  const solid = (x, y) => x >= 0 && y >= 0 && x < size && y < size && rgba[(y * size + x) * 4 + 3] === 255;
  const rim = [];
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      if (solid(x, y)) continue;
      if (!(solid(x + 1, y) || solid(x - 1, y) || solid(x, y + 1) || solid(x, y - 1))) continue;
      rim.push((y * size + x) * 4);
    }
  }
  for (const i of rim) {
    rgba[i] = colour[0];
    rgba[i + 1] = colour[1];
    rgba[i + 2] = colour[2];
    rgba[i + 3] = 255;
  }
}

export { toHex };
