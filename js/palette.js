// Builds a coherent limited palette from a character spec.

import { ROLE } from './grid.js';
import { hsl, scaleHex, mixHex } from './color.js';

function entry(hex, extra = {}) {
  const clean = hex && hex.startsWith('#') ? hex : '#ff00ff';
  const r = parseInt(clean.slice(1, 3), 16);
  const g = parseInt(clean.slice(3, 5), 16);
  const b = parseInt(clean.slice(5, 7), 16);
  return { hex: clean, r, g, b, alpha: 255, ...extra };
}

export function buildPalette(spec) {
  const { hue, accentHue, clothType } = spec.colors;

  let cloth;
  if (clothType === 'metal') cloth = hsl(hue, 10, 46);
  else if (clothType === 'leather') cloth = hsl(26, 30, 34);
  else if (clothType === 'robe') cloth = hsl(hue, 38, 40);
  else cloth = hsl(hue, 40, 42);

  const trim = hsl(accentHue, 62, 58);
  const metal = hsl(hue, 7, 60);
  const leather = hsl(26, 32, 33);
  const wood = hsl(28, 36, 27);
  const accent = hsl(accentHue, 84, 58);
  const skin = spec.colors.skin;
  const hair = spec.colors.hair ?? '#2a2230';

  const outline = hsl(hue, 30, 9);
  const dark = hsl(hue, 24, 13);
  const cape = clothType === 'robe' ? hsl((hue + 30) % 360, 46, 24) : hsl(hue, 48, 27);
  const clothDark = scaleHex(cloth, 0.74);

  const eye =
    spec.colors.eyeStyle === 'red'
      ? hsl(2, 78, 52)
      : spec.family === 'slime'
        ? hsl(hue, 30, 14)
        : hsl(hue, 22, 15);

  const palette = [];
  palette[ROLE.OUTLINE] = entry(outline);
  palette[ROLE.SKIN] = entry(skin);
  palette[ROLE.SKIN_DEEP] = entry(scaleHex(skin, 0.76));
  palette[ROLE.HAIR] = entry(hair);
  palette[ROLE.CLOTH] = entry(cloth);
  palette[ROLE.TRIM] = entry(trim);
  palette[ROLE.METAL] = entry(metal, { metal: true });
  palette[ROLE.LEATHER] = entry(leather);
  palette[ROLE.WOOD] = entry(wood);
  palette[ROLE.ACCENT] = entry(accent);
  palette[ROLE.EYE] = entry(eye);
  palette[ROLE.WHITE] = entry('#f6f2e6');
  palette[ROLE.BONE] = entry(hsl(44, 24, 84));
  palette[ROLE.DARK] = entry(dark);
  palette[ROLE.GLOW] = entry(mixHex(accent, '#ffffff', 0.15), { alpha: 110 });
  palette[ROLE.CLOTH_DARK] = entry(clothDark);
  palette[ROLE.CAPE] = entry(cape);

  return palette;
}
