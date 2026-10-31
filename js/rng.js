// Small deterministic PRNG utilities. Every sprite is reproducible from a string seed.

export function hashString(str) {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export function mulberry32(seed) {
  let a = seed >>> 0;
  return function next() {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export class Rng {
  constructor(seed) {
    this.seed = typeof seed === 'number' ? seed >>> 0 : hashString(String(seed));
    this.random = mulberry32(this.seed);
  }
  float() {
    return this.random();
  }
  int(min, max) {
    return Math.floor(this.float() * (max - min + 1)) + min;
  }
  chance(p) {
    return this.float() < p;
  }
  pick(list) {
    return list[Math.floor(this.float() * list.length) % list.length];
  }
  shuffle(list) {
    const out = list.slice();
    for (let i = out.length - 1; i > 0; i--) {
      const j = this.int(0, i);
      [out[i], out[j]] = [out[j], out[i]];
    }
    return out;
  }
}

const ALPHABET = 'abcdefghjkmnpqrstuvwxyz23456789';

export function randomSeed(length = 7) {
  let out = '';
  for (let i = 0; i < length; i++) {
    out += ALPHABET[Math.floor(Math.random() * ALPHABET.length)];
  }
  return out;
}
