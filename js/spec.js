// Prompt -> character spec. Pure data + parsing; no rendering here.

import { Rng, hashString } from './rng.js';
import { mixHex, clamp } from './color.js';

const HUMAN_SKINS = ['#f3cba6', '#e6b58c', '#d29a6f', '#b97c52', '#98603d', '#74462c', '#f7dcc2', '#c98d63'];
const HAIRS = ['#2a1c16', '#4a2f1d', '#6b4a2f', '#8f6136', '#c49a4e', '#d8cfc0', '#8d8d95', '#a33b2a', '#3b2a4a', '#1e1a24'];

export const BASE_ANATOMY = {
  headW: 10,
  headH: 10,
  torsoH: 8,
  shoulderW: 12,
  waistW: 8,
  legLen: 7,
  armLen: 5,
  bulk: 0,
  headSize: 1,
};

export const WEAPONS = ['sword', 'axe', 'staff', 'bow', 'dagger', 'spear', 'hammer', 'scepter'];
export const HATS = ['helmet', 'hood', 'wizard', 'crown', 'bandana', 'straw', 'halo', 'antenna'];

export const ARCHETYPES = {
  knight: {
    label: 'Knight',
    keywords: ['knight', 'paladin', 'soldier', 'guard', 'warrior', 'crusader', 'templar', 'fighter', 'champion', 'mercenary'],
    hue: 218,
    accentHue: 44,
    clothType: 'metal',
    gear: { weapon: 'sword', offhand: 'shield', hat: 'helmet', cape: false },
    capeChance: 0.28,
    anatomy: { shoulderW: 13, bulk: 0.5 },
    tags: ['armored', 'hero'],
  },
  paladin: {
    label: 'Paladin',
    keywords: ['paladin', 'cleric', 'inquisitor', 'crusader'],
    hue: 46,
    accentHue: 205,
    clothType: 'metal',
    gear: { weapon: 'sword', offhand: 'shield', hat: 'helmet', cape: true },
    anatomy: { shoulderW: 13, bulk: 0.5 },
    glow: true,
    tags: ['holy', 'armored'],
  },
  wizard: {
    label: 'Wizard',
    keywords: ['wizard', 'mage', 'sorcerer', 'sorceress', 'warlock', 'witch', 'magician', 'druid', 'shaman', 'enchanter'],
    hue: 268,
    accentHue: 186,
    clothType: 'robe',
    gear: { weapon: 'staff', hat: 'wizard', beard: true, cape: false },
    anatomy: { shoulderW: 11, waistW: 8 },
    style: { robe: true },
    hair: '#ded8ca',
    glow: true,
    tags: ['arcane'],
  },
  necromancer: {
    label: 'Necromancer',
    keywords: ['necromancer', 'summoner', 'occultist', 'cultist'],
    hue: 286,
    accentHue: 112,
    clothType: 'robe',
    gear: { weapon: 'staff', hat: 'hood', beard: false },
    style: { robe: true },
    anatomy: { shoulderW: 11, waistW: 8 },
    hair: null,
    glow: true,
    tags: ['undead', 'arcane'],
  },
  rogue: {
    label: 'Rogue',
    keywords: ['rogue', 'thief', 'burglar', 'assassin', 'spy', 'scoundrel', 'bandit'],
    hue: 32,
    accentHue: 165,
    clothType: 'leather',
    gear: { weapon: 'dagger', hat: 'hood', cape: false },
    anatomy: { shoulderW: 11, waistW: 8 },
    style: { slim: true },
    tags: ['stealth'],
  },
  ranger: {
    label: 'Ranger',
    keywords: ['ranger', 'archer', 'hunter', 'scout', 'adventurer', 'bowman', 'tracker', 'explorer'],
    hue: 122,
    accentHue: 42,
    clothType: 'leather',
    gear: { weapon: 'bow', hat: 'hood', cape: true },
    anatomy: { shoulderW: 11, waistW: 8 },
    style: { slim: true },
    tags: ['wilds'],
  },
  villager: {
    label: 'Villager',
    keywords: ['villager', 'peasant', 'merchant', 'trader', 'innkeeper', 'blacksmith', 'baker', 'citizen', 'townsfolk', 'npc', 'child'],
    hue: 26,
    accentHue: 205,
    clothType: 'cloth',
    gear: { weapon: null, hat: null },
    anatomy: {},
    tags: ['town'],
  },
  farmer: {
    label: 'Farmer',
    keywords: ['farmer', 'gardener', 'hermit'],
    hue: 205,
    accentHue: 44,
    clothType: 'cloth',
    gear: { weapon: 'spear', hat: 'straw' },
    anatomy: { shoulderW: 13, bulk: 0.25 },
    tags: ['town'],
  },
  skeleton: {
    label: 'Skeleton',
    keywords: ['skeleton', 'skeletal', 'undead', 'zombie', 'bone', 'bones', 'revenant', 'ghoul', 'lich'],
    hue: 248,
    accentHue: 150,
    clothType: 'cloth',
    skin: '#e7dec5',
    hair: null,
    gear: { weapon: 'sword', hat: null, beard: false },
    anatomy: { shoulderW: 10, waistW: 8 },
    style: { slim: true },
    eyeStyle: 'hollow',
    tags: ['undead'],
  },
  slime: {
    label: 'Slime',
    keywords: ['slime', 'ooze', 'blob', 'jelly', 'goo', 'gel'],
    family: 'slime',
    hue: 132,
    accentHue: 88,
    skin: '#6fcf58',
    hair: null,
    gear: {},
    tags: ['monster'],
  },
  robot: {
    label: 'Robot',
    keywords: ['robot', 'mech', 'android', 'cyborg', 'droid', 'automaton', 'machine', 'bot', 'construct'],
    hue: 202,
    accentHue: 188,
    clothType: 'metal',
    skin: '#9aa6b3',
    hair: null,
    gear: { weapon: null, hat: null, antenna: true },
    anatomy: { shoulderW: 13, waistW: 9 },
    style: { blocky: true },
    eyeStyle: 'visor',
    glow: true,
    tags: ['machine'],
  },
  demon: {
    label: 'Demon',
    keywords: ['demon', 'devil', 'imp', 'fiend', 'succubus', 'incubus'],
    hue: 352,
    accentHue: 28,
    skin: '#c1543f',
    hair: '#241019',
    gear: { wings: true, horns: true, tail: true, weapon: null, hat: null },
    anatomy: { shoulderW: 13, bulk: 0.55 },
    glow: true,
    tags: ['infernal'],
  },
  angel: {
    label: 'Angel',
    keywords: ['angel', 'celestial', 'seraph', 'valkyrie', 'deva'],
    hue: 48,
    accentHue: 45,
    clothType: 'robe',
    skin: '#f2d6b6',
    hair: '#e8d9a8',
    gear: { wings: true, halo: true, weapon: 'spear' },
    style: { robe: true },
    anatomy: { shoulderW: 11, waistW: 8 },
    glow: true,
    tags: ['holy'],
  },
  ghost: {
    label: 'Ghost',
    keywords: ['ghost', 'spirit', 'wraith', 'phantom', 'specter', 'spectre', 'banshee', 'soul', 'poltergeist'],
    family: 'ghost',
    hue: 196,
    accentHue: 188,
    skin: '#cfe6f2',
    hair: null,
    gear: {},
    glow: true,
    tags: ['undead'],
  },
  vampire: {
    label: 'Vampire',
    keywords: ['vampire', 'nosferatu', 'dracula', 'bloodsucker'],
    hue: 348,
    accentHue: 0,
    clothType: 'cloth',
    skin: '#e9d3d8',
    hair: '#1a1420',
    gear: { cape: true, hat: null, beard: false },
    anatomy: { shoulderW: 12, waistW: 8 },
    eyeStyle: 'red',
    tags: ['undead'],
  },
  king: {
    label: 'Monarch',
    keywords: ['king', 'queen', 'royal', 'monarch', 'emperor', 'empress', 'prince', 'princess', 'noble', 'lord', 'lady'],
    hue: 276,
    accentHue: 44,
    clothType: 'robe',
    gear: { weapon: 'scepter', hat: 'crown', cape: true },
    style: { robe: true },
    anatomy: { shoulderW: 12, waistW: 9 },
    glow: true,
    tags: ['royal'],
  },
  orc: {
    label: 'Orc',
    keywords: ['orc', 'goblin', 'troll', 'ogre', 'brute', 'barbarian', 'viking', 'grunt'],
    hue: 96,
    accentHue: 28,
    skin: '#7fae52',
    hair: '#2a2418',
    gear: { weapon: 'axe', hat: null },
    anatomy: { shoulderW: 14, waistW: 10, bulk: 0.8, headW: 11 },
    tags: ['brute'],
  },
  dwarf: {
    label: 'Dwarf',
    keywords: ['dwarf', 'dwarven', 'gnome', 'duergar'],
    hue: 22,
    accentHue: 40,
    clothType: 'metal',
    skin: '#dfa878',
    hair: '#c65a2a',
    gear: { weapon: 'axe', hat: 'helmet', beard: true },
    anatomy: { legLen: 6, shoulderW: 13, waistW: 9, bulk: 0.7, headSize: 1.05 },
    tags: ['delver'],
  },
  elf: {
    label: 'Elf',
    keywords: ['elf', 'elven', 'elder', 'fae', 'fairy'],
    hue: 152,
    accentHue: 190,
    clothType: 'cloth',
    skin: '#ecc8a4',
    hair: '#e8d8a8',
    gear: { weapon: 'bow', ears: true },
    style: { slim: true },
    anatomy: { shoulderW: 11, waistW: 8, headSize: 1.02 },
    tags: ['wilds'],
  },
  ninja: {
    label: 'Ninja',
    keywords: ['ninja', 'shinobi', 'samurai', 'duelist'],
    hue: 222,
    accentHue: 350,
    clothType: 'cloth',
    gear: { weapon: 'dagger', hat: 'hood', mask: true },
    anatomy: { shoulderW: 11, waistW: 8 },
    style: { slim: true },
    tags: ['stealth'],
  },
  pirate: {
    label: 'Pirate',
    keywords: ['pirate', 'buccaneer', 'corsair', 'privateer', 'sailor'],
    hue: 30,
    accentHue: 350,
    clothType: 'cloth',
    skin: '#d8a777',
    gear: { weapon: 'sword', hat: 'bandana', beard: true, cape: true },
    anatomy: { shoulderW: 13, bulk: 0.25 },
    tags: ['sea'],
  },
  alien: {
    label: 'Alien',
    keywords: ['alien', 'extraterrestrial', 'martian', 'voidling', 'xeno'],
    hue: 152,
    accentHue: 300,
    clothType: 'cloth',
    skin: '#8fd08a',
    hair: null,
    gear: { antenna: true },
    anatomy: { headW: 11, shoulderW: 10, waistW: 8, headSize: 1.1 },
    style: { bigEyes: true, slim: true },
    glow: true,
    tags: ['cosmic'],
  },
  monk: {
    label: 'Monk',
    keywords: ['monk', 'ascetic', 'martial', 'pilgrim'],
    hue: 34,
    accentHue: 45,
    clothType: 'robe',
    skin: '#d9a878',
    hair: null,
    gear: { weapon: 'staff' },
    style: { robe: true },
    anatomy: { shoulderW: 12, waistW: 8 },
    tags: ['sacred'],
  },
  priest: {
    label: 'Priest',
    keywords: ['priest', 'priestess', 'nun', 'bishop', 'abbot'],
    hue: 222,
    accentHue: 45,
    clothType: 'robe',
    skin: '#e8c8a8',
    hair: '#c9c2b4',
    gear: { weapon: 'staff', hat: 'hood' },
    style: { robe: true },
    anatomy: { shoulderW: 12, waistW: 8 },
    tags: ['sacred'],
  },
};

const ARCH_ORDER = [
  'knight', 'paladin', 'wizard', 'necromancer', 'rogue', 'ranger', 'skeleton', 'slime',
  'robot', 'demon', 'angel', 'ghost', 'vampire', 'king', 'orc', 'dwarf', 'elf', 'ninja',
  'pirate', 'alien', 'farmer', 'monk', 'priest', 'villager',
];

const DEFAULT_POOL = ['knight', 'wizard', 'rogue', 'ranger', 'villager', 'monk', 'pirate'];

const COLOR_HUES = {
  red: 355, crimson: 352, scarlet: 355, blood: 352, ruby: 350,
  orange: 26, amber: 38, gold: 45, golden: 45, yellow: 52, mustard: 45,
  lime: 85, green: 132, emerald: 150, jade: 156, olive: 76, toxic: 96,
  teal: 175, turquoise: 172, cyan: 190, aqua: 186, mint: 155,
  sky: 200, azure: 205, blue: 220, navy: 232, indigo: 245, cobalt: 216,
  violet: 266, purple: 280, lavender: 270, plum: 300, magenta: 310,
  pink: 330, rose: 342, coral: 6, maroon: 355, brown: 27, tan: 34,
  cream: 45, ivory: 45, white: 45, silver: 214, grey: 214, gray: 214,
  black: 240, charcoal: 230, bronze: 30, copper: 22, sand: 38, rusty: 20,
};

const HAIR_HUES = {
  blonde: '#dfbf6f', blond: '#dfbf6f', ginger: '#b4542f', red: '#a33b2a',
  white: '#ded8cc', silver: '#c9c9cd', grey: '#9a9aa2', gray: '#9a9aa2',
  black: '#211d26', brown: '#5a3a26', pink: '#e190b4', blue: '#7f9ad8',
  green: '#7fbf7a', purple: '#9a7fc4',
};

const WEAPON_WORDS = {
  sword: ['sword', 'blade', 'longsword', 'katana', 'cutlass', 'sabre', 'saber', 'excalibur'],
  axe: ['axe', 'hatchet', 'cleaver', 'tomahawk'],
  staff: ['staff', 'stave', 'quarterstaff', 'wand', 'rod'],
  bow: ['bow', 'longbow', 'crossbow', 'recurve'],
  dagger: ['dagger', 'knife', 'shiv', 'dirk'],
  spear: ['spear', 'pike', 'lance', 'pitchfork', 'trident', 'halberd'],
  hammer: ['hammer', 'mace', 'club', 'maul', 'mallet'],
  scepter: ['scepter', 'sceptre', 'cane', 'scepter'],
};

const HAT_WORDS = {
  helmet: ['helmet', 'helm', 'visor'],
  hood: ['hood', 'hooded', 'cowl'],
  wizard: ['wizard', 'pointy', 'conical', 'witch'],
  crown: ['crown', 'crowned'],
  bandana: ['bandana', 'bandanna', 'headband', 'bandeau'],
  straw: ['straw'],
  halo: ['halo', 'haloed'],
  antenna: ['antenna', 'antennae', 'aerial'],
};

const TAGS = [
  { id: 'cape', words: ['cape', 'caped', 'cloak', 'cloaked', 'mantle', 'drape'] },
  { id: 'wings', words: ['wing', 'wings', 'winged', 'feathered'] },
  { id: 'tail', words: ['tail', 'tailed'] },
  { id: 'horns', words: ['horn', 'horns', 'horned', 'antler', 'antlers'] },
  { id: 'beard', words: ['beard', 'bearded', 'mustache', 'moustache', 'whiskers'] },
  { id: 'mask', words: ['mask', 'masked'] },
  { id: 'halo', words: ['halo', 'haloed', 'divine'] },
  { id: 'antenna', words: ['antenna', 'antennae', 'aerial'] },
  { id: 'ears', words: ['pointed', 'elf', 'elven'] },
  { id: 'glow', words: ['glow', 'glowing', 'radiant', 'luminous', 'neon', 'magic', 'magical', 'enchanted', 'shiny', 'sparkling'] },
  { id: 'robe', words: ['robe', 'robed', 'gown', 'vestment'] },
  { id: 'armor', words: ['armor', 'armour', 'plate', 'plated', 'mail', 'chainmail', 'steel'] },
  { id: 'leather', words: ['leather', 'hide', 'studded'] },
  { id: 'slim', words: ['slim', 'thin', 'skinny', 'lithe', 'slender', 'gaunt', 'wiry'] },
  { id: 'bulky', words: ['bulky', 'muscular', 'strong', 'brawny', 'stout', 'burly'] },
  { id: 'tiny', words: ['tiny', 'small', 'little', 'short'] },
  { id: 'tall', words: ['tall', 'giant', 'huge', 'large', 'big'] },
  { id: 'pale', words: ['pale', 'ghostly', 'ashen'] },
  { id: 'old', words: ['old', 'ancient', 'elder', 'elderly', 'venerable'] },
];

const ANIM_WORDS = [
  ['walk', ['walk', 'walking', 'stroll', 'strolling', 'march', 'marching']],
  ['run', ['run', 'running', 'sprint', 'sprinting', 'dash', 'dashing', 'charge']],
  ['attack', ['attack', 'attacking', 'fight', 'fighting', 'slash', 'slashing', 'swing', 'swinging', 'battle', 'strike']],
  ['cast', ['cast', 'casting', 'spell', 'spellcasting', 'summon', 'summoning', 'conjure', 'channel']],
  ['idle', ['idle', 'standing', 'waiting', 'resting']],
];

function matches(token, keyword) {
  if (token === keyword) return true;
  if (token === `${keyword}s` || token === `${keyword}es`) return true;
  if (keyword.endsWith('f') && token === `${keyword.slice(0, -1)}ves`) return true;
  return false;
}

function hasAny(tokens, words) {
  return tokens.some((t) => words.some((w) => matches(t, w)));
}

function archetypeFor(token) {
  for (const id of ARCH_ORDER) {
    if (ARCHETYPES[id].keywords.some((kw) => matches(token, kw))) return id;
  }
  return null;
}

function detectArchetype(tokens) {
  // "royal vampire" should be a vampire, not a monarch: an adjective that
  // directly precedes another archetype noun modifies it instead of winning.
  const hits = tokens.map((token) => archetypeFor(token));
  const modifiers = [];
  for (let i = 0; i < hits.length; i++) {
    if (!hits[i]) continue;
    if (i + 1 < hits.length && hits[i + 1] && hits[i + 1] !== hits[i]) {
      modifiers.push(hits[i]);
      continue;
    }
    return { id: hits[i], modifiers };
  }
  return { id: hits.find(Boolean) ?? null, modifiers };
}

function detectGear(tokens, table) {
  for (const token of tokens) {
    for (const [id, words] of Object.entries(table)) {
      if (words.some((w) => matches(token, w))) return id;
    }
  }
  return null;
}

function detectAnim(tokens) {
  for (const token of tokens) {
    for (const [id, words] of ANIM_WORDS) {
      if (words.some((w) => matches(token, w))) return id;
    }
  }
  return null;
}

export function buildSpec(prompt, seed, overrides = {}) {
  const text = String(prompt ?? '').trim();
  const tokens = text.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
  const rng = new Rng(`${seed}|${text}`);

  const detected = detectArchetype(tokens);
  const archetypeId =
    overrides.archetype && overrides.archetype !== 'auto'
      ? overrides.archetype
      : detected.id ?? DEFAULT_POOL[rng.int(0, DEFAULT_POOL.length - 1)];
  const arch = ARCHETYPES[archetypeId] ?? ARCHETYPES.villager;
  const skeletal = archetypeId === 'skeleton' || detected.modifiers.includes('skeleton');

  // ----- gear -----
  const parsedWeapon = detectGear(tokens, WEAPON_WORDS);
  const parsedHat = detectGear(tokens, HAT_WORDS);
  const overrideWeapon = overrides.weapon && overrides.weapon !== 'auto' ? overrides.weapon : null;
  const overrideHat = overrides.hat && overrides.hat !== 'auto' ? overrides.hat : null;

  const gear = {
    weapon:
      overrideWeapon !== null
        ? overrideWeapon === 'none' ? null : overrideWeapon
        : parsedWeapon ?? arch.gear?.weapon ?? null,
    hat:
      overrideHat !== null
        ? overrideHat === 'none' ? null : overrideHat
        : parsedHat ?? arch.gear?.hat ?? null,
    offhand: arch.gear?.offhand ?? (hasAny(tokens, ['shield']) ? 'shield' : null),
    cape: pickBool(overrides.cape, hasAny(tokens, ['cape', 'caped', 'cloak', 'cloaked', 'mantle']), arch.gear?.cape, arch.capeChance, rng),
    wings: pickBool(overrides.wings, hasAny(tokens, ['wing', 'wings', 'winged', 'feathered']), arch.gear?.wings, 0, rng),
    horns: arch.gear?.horns ?? hasAny(tokens, ['horn', 'horns', 'horned', 'antler', 'antlers']),
    tail: arch.gear?.tail ?? hasAny(tokens, ['tail', 'tailed']),
    beard: arch.gear?.beard ?? hasAny(tokens, ['beard', 'bearded', 'mustache', 'moustache']),
    mask: arch.gear?.mask ?? hasAny(tokens, ['mask', 'masked']),
    halo: arch.gear?.halo ?? hasAny(tokens, ['halo', 'haloed']),
    antenna: arch.gear?.antenna ?? hasAny(tokens, ['antenna', 'antennae', 'aerial']),
    ears: arch.gear?.ears ?? hasAny(tokens, ['pointed', 'elf', 'elven']),
  };
  if (hasAny(tokens, ['shield'])) gear.offhand = 'shield';

  // ----- style -----
  const style = {
    robe: Boolean(arch.style?.robe || hasAny(tokens, ['robe', 'robed', 'gown', 'vestment'])),
    blocky: Boolean(arch.style?.blocky),
    bigEyes: Boolean(arch.style?.bigEyes),
    slim: Boolean(arch.style?.slim || hasAny(tokens, ['slim', 'thin', 'skinny', 'lithe', 'slender', 'gaunt'])),
    skeletal,
  };

  // ----- anatomy -----
  const anatomy = { ...BASE_ANATOMY, ...(arch.anatomy ?? {}) };
  if (hasAny(tokens, ['slim', 'thin', 'skinny', 'lithe', 'slender'])) {
    anatomy.shoulderW -= 2;
    anatomy.waistW -= 1;
  }
  if (hasAny(tokens, ['bulky', 'muscular', 'strong', 'brawny', 'stout', 'burly'])) {
    anatomy.shoulderW += 1;
    anatomy.bulk += 0.5;
  }
  if (hasAny(tokens, ['tiny', 'small', 'little', 'short'])) {
    anatomy.legLen -= 1;
    anatomy.headSize += 0.08;
    anatomy.shoulderW -= 1;
  }
  if (hasAny(tokens, ['tall', 'giant', 'huge', 'large'])) {
    anatomy.legLen += 1;
    anatomy.headSize -= 0.03;
  }

  // ----- palette -----
  let hue = typeof overrides.hue === 'number' ? overrides.hue : null;
  if (hue === null) {
    let colorToken = null;
    for (const token of tokens) {
      if (Object.prototype.hasOwnProperty.call(COLOR_HUES, token)) {
        colorToken = token;
        break;
      }
    }
    hue = colorToken !== null ? COLOR_HUES[colorToken] : (arch.hue ?? 210) + rng.int(-8, 8);
  }
  if (hasAny(tokens, ['dark', 'shadow', 'shadowy', 'cursed', 'corrupt', 'grim'])) {
    // keep hue, the palette builder reads the flag
  }
  const accentHue = typeof arch.accentHue === 'number' ? arch.accentHue : (hue + 180) % 360;

  let clothType = arch.clothType ?? 'cloth';
  if (hasAny(tokens, ['leather', 'hide', 'studded'])) clothType = 'leather';
  if (hasAny(tokens, ['armor', 'armour', 'plate', 'plated', 'mail', 'chainmail', 'steel'])) clothType = 'metal';
  if (style.robe) clothType = 'robe';

  let skin = skeletal ? '#e7dec5' : arch.skin ?? rng.pick(HUMAN_SKINS);
  if (hasAny(tokens, ['pale', 'ashen'])) skin = mixHex(skin, '#ffffff', 0.3);
  let hair = arch.hair === null ? null : arch.hair ?? rng.pick(HAIRS);
  for (const token of tokens) {
    if (Object.prototype.hasOwnProperty.call(HAIR_HUES, token)) {
      // Only treat the colour word as hair colour when it clearly refers to hair.
      const idx = tokens.indexOf(token);
      if (tokens[idx + 1] === 'hair' || tokens[idx + 1] === 'haired' || tokens[idx - 1] === 'hair') {
        hair = HAIR_HUES[token];
      }
    }
  }
  const eyeStyle = skeletal ? 'hollow' : arch.eyeStyle ?? (style.bigEyes ? 'big' : 'normal');

  const decor = {
    hairStyle: hair === null ? 'bald' : rng.pick(['short', 'short', 'long', 'spiky', 'bun', 'mohawk', 'short', 'long']),
    capeTrim: hasAny(tokens, ['trim', 'trimmed', 'gold', 'golden']) ? 'accent' : 'trim',
    shoulderPads: Boolean(arch.anatomy?.bulk) || hasAny(tokens, ['armor', 'armour', 'plate', 'shoulder']),
    emblem: rng.pick(['none', 'cross', 'gem', 'star']),
    hem: rng.pick(['plain', 'trim', 'pattern']),
    hoodShadow: true,
  };

  const glow = pickBool(overrides.glow, hasAny(tokens, TAGS.find((t) => t.id === 'glow').words), arch.glow, 0, rng);
  const anim = overrides.anim ?? detectAnim(tokens) ?? 'idle';

  const tags = [];
  tags.push(arch.label);
  if (style.robe) tags.push('robe');
  if (gear.cape) tags.push('cape');
  if (gear.wings) tags.push('wings');
  if (gear.weapon) tags.push(gear.weapon);
  if (glow) tags.push('glow');
  if (text === '') tags.unshift('random');

  return {
    prompt: text,
    seed,
    archetype: archetypeId,
    name: arch.label,
    family: arch.family ?? 'humanoid',
    style,
    anatomy,
    gear,
    decor,
    colors: {
      hue: clamp(Math.round(hue), 0, 359),
      accentHue,
      clothType,
      skin,
      hair,
      eyeStyle,
    },
    glow,
    anim,
    tags: tags.slice(0, 4),
    flags: new Set(TAGS.filter((t) => hasAny(tokens, t.words)).map((t) => t.id)),
  };
}

function pickBool(override, parsed, archetypeValue, chance, rng) {
  if (override === true || override === false) return override;
  if (parsed === true) return true;
  if (archetypeValue === true) return true;
  if (chance) return rng.chance(chance);
  return false;
}
