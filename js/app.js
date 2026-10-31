// PixelForge UI: state, live regeneration, playback, sprite-sheet export.

import { generate, DIRECTIONS, STATES } from './generate.js';
import { randomSeed } from './rng.js';
import { ARCHETYPES, WEAPONS, HATS } from './spec.js';
import { ROLE } from './grid.js';
import { aiStatus, requestSprite, loadImage } from './ai.js';
import { pixelate } from './pixelate.js';

const $ = (sel) => document.querySelector(sel);

const SAMPLES = [
  'armored knight with a crimson cape',
  'hooded ranger with a longbow',
  'old wizard with a glowing staff',
  'neon robot sentry',
  'toxic slime',
  'royal vampire in a cape',
  'skeletal pirate captain',
  'emerald elf archer',
];

const PALETTE_ROLES = [
  [ROLE.SKIN, 'skin'],
  [ROLE.HAIR, 'hair'],
  [ROLE.CLOTH, 'cloth'],
  [ROLE.TRIM, 'trim'],
  [ROLE.METAL, 'metal'],
  [ROLE.LEATHER, 'leather'],
  [ROLE.WOOD, 'wood'],
  [ROLE.ACCENT, 'accent'],
  [ROLE.EYE, 'eye'],
  [ROLE.BONE, 'bone'],
];

const ui = {
  prompt: SAMPLES[0],
  seed: randomSeed(),
  overrides: {
    archetype: 'auto',
    weapon: 'auto',
    hat: 'auto',
    cape: null,
    wings: null,
    glow: null,
    hue: null,
  },
  anim: 'idle',
  dir: 0,
  frame: 0,
  playing: true,
  zoom: 14,
  scale: 2,
  result: null,
  frames: null,
  mode: 'local',
  ai: {
    status: null,
    busy: false,
    error: null,
    variants: [], // newest first: { raw, image, meta }
    index: 0,
    sprite: null, // pixelate() result
    canvas: null, // sprite as a canvas for the stage
    size: 32,
    colors: 16,
    outline: true,
    keepBackdrop: false,
  },
};

const shortenModel = (model) => String(model || '').split('/').pop().slice(0, 22);

let history = loadHistory();
let historyTimer = null;
let promptTimer = null;
let seedTimer = null;
let hueTimer = null;
let toastTimer = null;
let lastFrameTime = performance.now();

// ---------------------------------------------------------------- helpers

const capitalize = (s) => s.charAt(0).toUpperCase() + s.slice(1);

function slugify(text) {
  return (
    String(text || 'sprite')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 42) || 'sprite'
  );
}

function toSpriteCanvas(rgba) {
  const canvas = document.createElement('canvas');
  canvas.width = 32;
  canvas.height = 32;
  const ctx = canvas.getContext('2d');
  const image = ctx.createImageData(32, 32);
  image.data.set(rgba);
  ctx.putImageData(image, 0, 0);
  return canvas;
}

function showToast(message) {
  const toast = $('#toast');
  toast.textContent = message;
  toast.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove('show'), 1600);
}

async function copyText(text, message) {
  try {
    await navigator.clipboard.writeText(text);
    showToast(message);
  } catch {
    showToast('Copy blocked by the browser');
  }
}

// ---------------------------------------------------------------- setup

function fillSelect(select, entries, autoLabel) {
  select.innerHTML = '';
  const auto = document.createElement('option');
  auto.value = 'auto';
  auto.textContent = autoLabel;
  select.append(auto);
  for (const [value, label] of entries) {
    const option = document.createElement('option');
    option.value = value;
    option.textContent = label;
    select.append(option);
  }
  select.value = 'auto';
}

function buildSelects() {
  fillSelect(
    $('#archetype'),
    Object.entries(ARCHETYPES).map(([id, arch]) => [id, arch.label]),
    'Auto from prompt',
  );
  fillSelect($('#weapon'), WEAPONS.map((id) => [id, capitalize(id)]), 'Auto from prompt');
  const weapon = $('#weapon');
  const noneWeapon = document.createElement('option');
  noneWeapon.value = 'none';
  noneWeapon.textContent = 'None';
  weapon.append(noneWeapon);

  fillSelect($('#hat'), HATS.map((id) => [id, capitalize(id)]), 'Auto from prompt');
  const hat = $('#hat');
  const noneHat = document.createElement('option');
  noneHat.value = 'none';
  noneHat.textContent = 'None';
  hat.append(noneHat);
}

function buildChips() {
  const wrap = $('#chips');
  wrap.innerHTML = '';
  for (const text of SAMPLES) {
    const chip = document.createElement('button');
    chip.type = 'button';
    chip.className = 'chip';
    chip.textContent = text;
    chip.title = text;
    chip.addEventListener('click', () => {
      ui.prompt = text;
      $('#prompt').value = text;
      ui.overrides.cape = null;
      ui.overrides.wings = null;
      ui.overrides.glow = null;
      regenerate();
    });
    wrap.append(chip);
  }
}

function buildTabs() {
  const wrap = $('#state-tabs');
  wrap.innerHTML = '';
  for (const state of STATES) {
    const tab = document.createElement('button');
    tab.type = 'button';
    tab.className = 'tab';
    tab.setAttribute('role', 'tab');
    tab.dataset.state = state.id;
    tab.setAttribute('aria-selected', String(state.id === ui.anim));
    tab.innerHTML = `${state.label}<span class="count">${stateLabels()[state.id] ?? ''}</span>`;
    tab.addEventListener('click', () => {
      ui.anim = state.id;
      ui.frame = 0;
      ui.playing = true;
      lastFrameTime = performance.now();
      for (const el of wrap.children) {
        el.setAttribute('aria-selected', String(el.dataset.state === state.id));
      }
      renderFilmstrip();
      renderDirections();
      renderSheetPreview();
      drawStage();
      updateBadges();
      updatePlayButton();
    });
    wrap.append(tab);
  }
}

function stateLabels() {
  return { idle: '4', walk: '6', run: '6', attack: '4', cast: '4' };
}

function drawLogo() {
  const canvas = $('#logo');
  const ctx = canvas.getContext('2d');
  const size = 16;
  ctx.clearRect(0, 0, size, size);

  const gem = (rx, ry, color, inset = 0) => {
    ctx.fillStyle = color;
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const dx = Math.abs(x + 0.5 - 8) / rx;
        const dy = Math.abs(y + 0.5 - 8) / ry;
        if (dx + dy <= 1 && dx + dy > inset) ctx.fillRect(x, y, 1, 1);
      }
    }
  };

  gem(7.4, 6.4, '#2b3140');
  gem(6.4, 5.4, '#c8f45c');
  gem(3.6, 3.2, '#e8ffa6', 0.42);
  ctx.fillStyle = '#9b8cff';
  ctx.fillRect(10, 5, 1, 2);
  ctx.fillRect(11, 6, 1, 1);
}

// ---------------------------------------------------------------- generation

function regenerate() {
  let result;
  try {
    result = generate({ prompt: ui.prompt, seed: ui.seed, overrides: ui.overrides });
  } catch (error) {
    console.error(error);
    showToast('Could not render that prompt');
    return;
  }
  ui.result = result;

  if (!result.states.some((state) => state.id === ui.anim)) ui.anim = 'idle';
  const count = result.frames[ui.anim][ui.dir].length;
  if (ui.frame >= count) ui.frame = 0;

  ui.frames = {};
  for (const state of result.states) {
    ui.frames[state.id] = result.frames[state.id].map((dirFrames) => dirFrames.map(toSpriteCanvas));
  }

  syncControls();
  renderFilmstrip();
  renderDirections();
  renderPalette();
  renderSheetPreview();
  drawStage();
  updateBadges();
  scheduleHistory();
}

function syncControls() {
  const spec = ui.result.spec;

  $('#detected').textContent = spec.tags.length ? spec.tags.join(' · ') : spec.name;
  $('#detected').title = `${spec.name}: ${spec.tags.join(', ')}`;

  const archSelect = $('#archetype');
  archSelect.options[0].textContent = `Auto · ${spec.name}`;
  if (document.activeElement !== archSelect) archSelect.value = ui.overrides.archetype;
  if (document.activeElement !== $('#weapon')) $('#weapon').value = ui.overrides.weapon;
  if (document.activeElement !== $('#hat')) $('#hat').value = ui.overrides.hat;

  $('#toggle-cape').setAttribute('aria-pressed', String(Boolean(spec.gear.cape)));
  $('#toggle-wings').setAttribute('aria-pressed', String(Boolean(spec.gear.wings)));
  $('#toggle-glow').setAttribute('aria-pressed', String(Boolean(spec.glow)));

  if (document.activeElement !== $('#hue')) $('#hue').value = spec.colors.hue;
  $('#hue-value').textContent = `${spec.colors.hue}°`;

  if (document.activeElement !== $('#seed')) $('#seed').value = ui.seed;
  if (document.activeElement !== $('#prompt')) $('#prompt').value = ui.prompt;
}

// ---------------------------------------------------------------- rendering

function drawStage() {
  const canvas = $('#preview');
  const sprite = ui.mode === 'ai' ? ui.ai.canvas : null;
  const grid = sprite ? sprite.width : 32;
  const size = grid * ui.zoom;
  if (canvas.width !== size) {
    canvas.width = size;
    canvas.height = size;
  }
  const ctx = canvas.getContext('2d');
  ctx.imageSmoothingEnabled = false;
  ctx.clearRect(0, 0, size, size);
  if (sprite) {
    ctx.drawImage(sprite, 0, 0, size, size);
    return;
  }
  const frames = ui.frames?.[ui.anim]?.[ui.dir];
  if (!frames || !frames.length) return;
  ctx.drawImage(frames[ui.frame % frames.length], 0, 0, size, size);
}

function renderFilmstrip() {
  const wrap = $('#filmstrip');
  wrap.innerHTML = '';
  if (ui.mode === 'ai') {
    renderVariants(wrap);
    return;
  }
  const frames = ui.frames?.[ui.anim]?.[ui.dir];
  if (!frames) return;
  frames.forEach((sprite, index) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'frame-btn';
    button.setAttribute('aria-pressed', String(index === ui.frame));
    button.title = `Frame ${index + 1}`;

    const thumb = document.createElement('canvas');
    thumb.width = 32;
    thumb.height = 32;
    thumb.getContext('2d').drawImage(sprite, 0, 0);
    button.append(thumb);

    const label = document.createElement('span');
    label.textContent = String(index + 1);
    button.append(label);

    button.addEventListener('click', () => {
      ui.frame = index;
      ui.playing = false;
      lastFrameTime = performance.now();
      updatePlayButton();
      highlightFrame();
      drawStage();
      updateBadges();
    });
    wrap.append(button);
  });
}

function highlightFrame() {
  const wrap = $('#filmstrip');
  for (let i = 0; i < wrap.children.length; i++) {
    wrap.children[i].setAttribute('aria-pressed', String(i === ui.frame));
  }
}

function renderDirections() {
  const wrap = $('#dir-grid');
  wrap.innerHTML = '';
  if (ui.mode === 'ai') return;
  const frames = ui.frames?.[ui.anim];
  if (!frames) return;
  DIRECTIONS.forEach((dir, index) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'dir-btn';
    button.setAttribute('aria-pressed', String(index === ui.dir));
    button.title = `${dir.id} — ${dir.name}`;

    const thumb = document.createElement('canvas');
    thumb.width = 32;
    thumb.height = 32;
    const sprite = frames[index][0];
    if (sprite) thumb.getContext('2d').drawImage(sprite, 0, 0);
    button.append(thumb);

    const label = document.createElement('span');
    label.textContent = dir.id;
    button.append(label);

    button.addEventListener('click', () => {
      ui.dir = index;
      renderDirections();
      renderFilmstrip();
      drawStage();
      updateBadges();
    });
    wrap.append(button);
  });
}

function renderPalette() {
  const wrap = $('#swatches');
  wrap.innerHTML = '';

  if (ui.mode === 'ai') {
    const hexes = ui.ai.sprite?.palette ?? [];
    if (!hexes.length) {
      const empty = document.createElement('p');
      empty.className = 'history-empty';
      empty.textContent = 'The palette appears after the first generation.';
      wrap.append(empty);
      return;
    }
    hexes.forEach((hex, index) => {
      const swatch = document.createElement('button');
      swatch.type = 'button';
      swatch.className = 'swatch';
      swatch.title = index === hexes.length - 1 ? `${hex} (outline)` : hex;
      const chip = document.createElement('i');
      chip.style.background = hex;
      swatch.append(chip);
      const label = document.createElement('span');
      label.textContent = hex.slice(1);
      swatch.append(label);
      swatch.addEventListener('click', () => copyText(hex, `${hex} copied`));
      wrap.append(swatch);
    });
    return;
  }

  const palette = ui.result.palette;
  for (const [role, name] of PALETTE_ROLES) {
    const entry = palette[role];
    if (!entry) continue;
    const swatch = document.createElement('button');
    swatch.type = 'button';
    swatch.className = 'swatch';
    swatch.title = `${name} ${entry.hex}`;

    const chip = document.createElement('i');
    chip.style.background = entry.hex;
    swatch.append(chip);

    const label = document.createElement('span');
    label.textContent = entry.hex.slice(1);
    swatch.append(label);

    swatch.addEventListener('click', () => copyText(entry.hex, `${name} ${entry.hex} copied`));
    wrap.append(swatch);
  }
}

function buildSheetCanvas(scale) {
  const dirs = DIRECTIONS.length;
  const frameCount = ui.frames?.[ui.anim]?.[0]?.length ?? 0;
  const cell = 32 * scale;
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, dirs * cell);
  canvas.height = Math.max(1, frameCount * cell);
  const ctx = canvas.getContext('2d');
  ctx.imageSmoothingEnabled = false;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  for (let frame = 0; frame < frameCount; frame++) {
    for (let dir = 0; dir < dirs; dir++) {
      const sprite = ui.frames[ui.anim][dir][frame];
      if (sprite) ctx.drawImage(sprite, dir * cell, frame * cell, cell, cell);
    }
  }
  return { canvas, cell, frameCount };
}

function renderSheetPreview() {
  if (ui.mode === 'ai') {
    const preview = $('#sheet-preview');
    const ctx = preview.getContext('2d');
    ctx.imageSmoothingEnabled = false;
    ctx.clearRect(0, 0, preview.width, preview.height);
    const sprite = ui.ai.canvas;
    if (!sprite) {
      $('#sheet-meta').textContent = 'Nothing generated yet';
      return;
    }
    const zoom = Math.max(1, Math.floor(Math.min(preview.width, preview.height) / sprite.width));
    const w = sprite.width * zoom;
    const h = sprite.height * zoom;
    ctx.drawImage(sprite, Math.round((preview.width - w) / 2), Math.round((preview.height - h) / 2), w, h);
    const colors = Math.max(0, (ui.ai.sprite?.palette.length ?? 1) - 1);
    $('#sheet-meta').textContent = `${ui.ai.size} × ${ui.ai.size} · ${colors} colors · ${aiIndexLabel()}`;
    return;
  }

  const { canvas, frameCount } = buildSheetCanvas(1);
  const preview = $('#sheet-preview');
  preview.width = canvas.width;
  preview.height = canvas.height;
  const ctx = preview.getContext('2d');
  ctx.imageSmoothingEnabled = false;
  ctx.clearRect(0, 0, preview.width, preview.height);
  ctx.drawImage(canvas, 0, 0);
  const exportWidth = DIRECTIONS.length * 32 * ui.scale;
  const exportHeight = frameCount * 32 * ui.scale;
  $('#sheet-meta').textContent = `${DIRECTIONS.length} directions × ${frameCount} frames — ${exportWidth}×${exportHeight}px at ${ui.scale}×`;
}

function updateBadges() {
  if (ui.mode === 'ai') {
    $('#badge-dir').textContent = 'AI';
    $('#badge-frame').textContent = ui.ai.sprite
      ? `${ui.ai.index + 1} / ${ui.ai.variants.length}`
      : 'idle';
    $('#stage-note').textContent = `${ui.ai.size} × ${ui.ai.size}`;
    return;
  }
  $('#stage-note').textContent = '32 × 32';
  const dir = DIRECTIONS[ui.dir];
  $('#badge-dir').textContent = `${dir.id} ${dir.name}`;
  const frames = ui.result?.frames?.[ui.anim]?.[ui.dir] ?? [0];
  $('#badge-frame').textContent = `${ui.frame + 1} / ${frames.length}`;
  const state = STATES.find((s) => s.id === ui.anim);
  $('#anim-name').textContent = state ? state.label : 'Idle';
}

function aiIndexLabel() {
  const meta = ui.ai.variants[ui.ai.index]?.meta;
  return meta ? `${shortenModel(meta.model)} · ${meta.seconds}s` : 'local pixel conversion';
}

function updatePlayButton() {
  const button = $('#btn-play');
  button.textContent = ui.playing ? '❚❚' : '▶';
  button.setAttribute('aria-label', ui.playing ? 'Pause animation' : 'Play animation');
}

// ---------------------------------------------------------------- exports

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

function exportSheet() {
  if (ui.mode === 'ai') return exportAiSprite();
  if (!ui.frames) return;
  const { canvas, frameCount } = buildSheetCanvas(ui.scale);
  const filename = `pixelforge_${slugify(ui.prompt)}_${ui.anim}_${ui.seed}.png`;
  canvas.toBlob((blob) => {
    if (!blob) return;
    downloadBlob(blob, filename);
    showToast(`Sheet exported · ${frameCount * DIRECTIONS.length} frames`);
    scheduleHistory(true);
  }, 'image/png');
}

function exportFrame() {
  if (ui.mode === 'ai') return exportAiRender();
  const sprite = ui.frames?.[ui.anim]?.[ui.dir]?.[ui.frame];
  if (!sprite) return;
  const scale = ui.scale;
  const canvas = document.createElement('canvas');
  canvas.width = 32 * scale;
  canvas.height = 32 * scale;
  const ctx = canvas.getContext('2d');
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(sprite, 0, 0, canvas.width, canvas.height);
  canvas.toBlob((blob) => {
    if (!blob) return;
    downloadBlob(
      blob,
      `pixelforge_${slugify(ui.prompt)}_${ui.anim}_${DIRECTIONS[ui.dir].id}_f${ui.frame + 1}.png`,
    );
    showToast('Frame exported');
  }, 'image/png');
}

function paletteObject() {
  const out = {};
  for (const [role, name] of PALETTE_ROLES) {
    const entry = ui.result.palette[role];
    if (entry) out[name] = entry.hex;
  }
  out.outline = ui.result.palette[ROLE.OUTLINE]?.hex;
  return out;
}

function exportMetadata() {
  if (ui.mode === 'ai') return exportAiMetadata();
  const { spec } = ui.result;
  const state = STATES.find((s) => s.id === ui.anim);
  const frameCount = ui.frames[ui.anim][0].length;
  const cell = 32 * ui.scale;
  const frames = [];
  for (let frame = 0; frame < frameCount; frame++) {
    for (let dir = 0; dir < DIRECTIONS.length; dir++) {
      frames.push({
        direction: DIRECTIONS[dir].id,
        directionName: DIRECTIONS[dir].name,
        frame,
        x: dir * cell,
        y: frame * cell,
        w: cell,
        h: cell,
      });
    }
  }

  const meta = {
    app: 'PixelForge',
    prompt: ui.prompt,
    seed: ui.seed,
    archetype: spec.archetype,
    animation: ui.anim,
    fps: state?.fps ?? 8,
    frameCount,
    frameSize: 32,
    scale: ui.scale,
    layout: 'columns: 8 directions (S, SW, W, NW, N, NE, E, SE); rows: animation frames',
    directions: DIRECTIONS.map((d) => d.id),
    palette: paletteObject(),
    frames,
  };

  downloadBlob(
    new Blob([JSON.stringify(meta, null, 2)], { type: 'application/json' }),
    `pixelforge_${slugify(ui.prompt)}_${ui.anim}_${ui.seed}.json`,
  );
  showToast('Metadata exported');
}

function copyPalette() {
  if (ui.mode === 'ai') {
    const hexes = ui.ai.sprite?.palette ?? [];
    if (!hexes.length) return showToast('Nothing to copy yet');
    return copyText(hexes.join('\n'), 'Palette copied');
  }
  const lines = PALETTE_ROLES.map(([role, name]) => {
    const entry = ui.result.palette[role];
    return entry ? `${name}: ${entry.hex}` : null;
  }).filter(Boolean);
  const outline = ui.result.palette[ROLE.OUTLINE]?.hex;
  if (outline) lines.push(`outline: ${outline}`);
  copyText(lines.join('\n'), 'Palette copied');
}

// ---------------------------------------------------------------- ai mode

function setMode(mode) {
  if (mode === ui.mode) return;
  ui.mode = mode;
  document.body.dataset.mode = mode;

  for (const button of $('#mode-switch').children) {
    button.setAttribute('aria-pressed', String(button.dataset.mode === mode));
  }

  const badge = $('#engine-badge');
  badge.classList.toggle('is-ai', mode === 'ai');
  badge.innerHTML = mode === 'ai' ? '<i></i> ai via proxy' : '<i></i> local engine';
  badge.title =
    mode === 'ai'
      ? 'Generation runs inside server.py — the API key never reaches this page'
      : 'The local engine makes no network requests';

  updateExportLabels();

  if (mode === 'ai') {
    refreshAiStatus();
    renderFilmstrip();
    renderPalette();
    renderSheetPreview();
    drawStage();
    updateBadges();
  } else {
    regenerate();
    updatePlayButton();
  }
}

async function refreshAiStatus() {
  const status = await aiStatus();
  ui.ai.status = status;
  if (ui.mode === 'ai') renderAiStatus();
}

function renderAiStatus() {
  const status = ui.ai.status;
  const line = $('#ai-status');
  const text = $('#ai-status-text');
  const ready = Boolean(status?.available);
  const hosted = Boolean(status?.hosted);
  line.className = 'ai-status';

  if (ui.ai.busy) {
    line.classList.add('is-busy');
    text.textContent = 'Drawing the character…';
  } else if (ready) {
    line.classList.add('is-ready');
    text.textContent = `${status.provider} · ${status.model}`;
  } else {
    line.classList.add('is-off');
    text.textContent = hosted
      ? 'Static build — no backend for generation'
      : status?.error || 'No API key configured yet';
  }

  $('#ai-model').textContent = ready && status.model ? shortenModel(status.model) : 'off';
  $('#ai-note').textContent = ready
    ? status.note
    : hosted
      ? 'This page was deployed as static files only, so the local engine is the whole feature set here.'
      : 'Generation needs a key. The local engine keeps working without one.';

  const setup = $('#ai-setup');
  setup.hidden = ready;
  if (!ready) {
    const copy = $('#ai-setup-copy');
    const snippet = $('#ai-setup-snippet');
    const link = $('#ai-setup-link');
    if (hosted) {
      $('#ai-missing').textContent = 'the PixelForge proxy';
      copy.textContent =
        'Static hosting cannot run server.py, and the key must never ship to a browser. Run the app on a machine that can, or deploy server.py as the app (see the README): ';
      snippet.textContent = 'python server.py';
      link.hidden = true;
    } else if (status?.error) {
      $('#ai-missing').textContent = 'a running proxy';
      copy.textContent = 'The proxy is not reachable. Start it from the project folder, then reload: ';
      snippet.textContent = 'python server.py';
      link.hidden = true;
    } else {
      $('#ai-missing').textContent = status?.missing || 'AI_IMAGE_KEY';
      copy.textContent = 'Paste the key into .env next to server.py, then press Generate — no restart needed: ';
      snippet.textContent = `AI_PROVIDER=${status?.provider ?? 'wavespeed'}\nAI_IMAGE_KEY=your_key_here`;
      link.hidden = !status?.setupUrl;
      link.href = status?.setupUrl || '#';
    }
  }

  // Stay clickable without a key: clicking re-checks, so a key pasted into .env
  // is picked up without reloading the page.
  $('#btn-ai-generate').disabled = ui.ai.busy || hosted;
  $('#btn-ai-label').textContent = ui.ai.busy
    ? 'Drawing…'
    : hosted
      ? 'Needs the proxy'
      : ready
        ? 'Generate sprite'
        : 'Recheck key & generate';
}

function renderAiError() {
  const box = $('#ai-error');
  if (!ui.ai.error) {
    box.hidden = true;
    box.textContent = '';
    return;
  }
  box.hidden = false;
  box.textContent = ui.ai.error;
}

function updateExportLabels() {
  const ai = ui.mode === 'ai';
  $('#btn-download-sheet').textContent = ai ? 'Pixel PNG' : 'Sprite sheet PNG';
  $('#btn-download-frame').textContent = ai ? 'Model render' : 'Frame PNG';
  $('#btn-export-2').textContent = ai ? 'Download sprite' : 'Download sheet';
  $('#btn-export').textContent = ai ? 'Export sprite' : 'Export sheet';
}

function renderVariants(wrap) {
  if (!ui.ai.variants.length) {
    const empty = document.createElement('p');
    empty.className = 'history-empty';
    empty.textContent = ui.ai.busy ? 'Drawing…' : 'Nothing yet — press Generate sprite.';
    wrap.append(empty);
    $('#ai-variants-meta').textContent = 'none yet';
    return;
  }

  ui.ai.variants.forEach((variant, index) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'frame-btn';
    button.setAttribute('aria-pressed', String(index === ui.ai.index));
    button.title = variant.meta?.model ? `Variant ${index + 1} · ${variant.meta.model}` : `Variant ${index + 1}`;

    const thumb = document.createElement('canvas');
    thumb.width = 48;
    thumb.height = 48;
    const ctx = thumb.getContext('2d');
    ctx.imageSmoothingEnabled = false;
    const image = variant.image;
    const w = image.naturalWidth || 1;
    const h = image.naturalHeight || 1;
    const scale = Math.min(48 / w, 48 / h);
    const tw = Math.max(1, Math.round(w * scale));
    const th = Math.max(1, Math.round(h * scale));
    ctx.drawImage(image, Math.round((48 - tw) / 2), Math.round((48 - th) / 2), tw, th);
    button.append(thumb);

    const label = document.createElement('span');
    label.textContent = String(index + 1);
    button.append(label);

    button.addEventListener('click', () => {
      ui.ai.index = index;
      applyPixelation();
    });
    wrap.append(button);
  });

  const model = ui.ai.variants[ui.ai.index]?.meta?.model;
  $('#ai-variants-meta').textContent = `${ui.ai.variants.length} of 4${model ? ` · ${shortenModel(model)}` : ''}`;
}

function renderAiSource() {
  const variant = ui.ai.variants[ui.ai.index];
  const img = $('#ai-source-img');
  const empty = $('#ai-source-empty');

  if (!variant) {
    img.hidden = true;
    img.removeAttribute('src');
    empty.hidden = false;
    $('#ai-source-meta').textContent = '—';
    return;
  }

  img.hidden = false;
  img.src = variant.raw;
  empty.hidden = true;
  const w = variant.image.naturalWidth;
  const h = variant.image.naturalHeight;
  $('#ai-source-meta').textContent = `${w}×${h} → ${ui.ai.size}px`;
}

function spriteCanvasFrom(rgba, size) {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  const image = ctx.createImageData(size, size);
  image.data.set(rgba);
  ctx.putImageData(image, 0, 0);
  return canvas;
}

function applyPixelation() {
  const variant = ui.ai.variants[ui.ai.index];
  if (!variant) return;
  try {
    const result = pixelate(variant.image, {
      size: ui.ai.size,
      colors: ui.ai.colors,
      outline: ui.ai.outline,
      background: ui.ai.keepBackdrop ? 'keep' : 'auto',
    });
    ui.ai.sprite = result;
    ui.ai.canvas = spriteCanvasFrom(result.rgba, result.size);
  } catch (error) {
    console.error(error);
    ui.ai.error = error.message;
    renderAiError();
    return;
  }
  renderAiSource();
  renderFilmstrip();
  renderPalette();
  renderSheetPreview();
  drawStage();
  updateBadges();
}

async function generateAiSprite() {
  if (ui.ai.busy) return;
  if (ui.ai.status?.hosted) {
    showToast('Static build: run python server.py for AI generation');
    return;
  }
  if (!ui.ai.status?.available) {
    // The server re-reads .env per request, so a key added just now is live.
    await refreshAiStatus();
    if (!ui.ai.status?.available) {
      showToast(ui.ai.status?.error ? 'Proxy offline — run python server.py' : 'Still no key in .env');
      return;
    }
    renderAiStatus();
  }

  const prompt = $('#prompt').value.trim();
  if (!prompt) return showToast('Describe a character first');

  ui.prompt = prompt;
  ui.ai.busy = true;
  ui.ai.error = null;
  renderAiError();
  renderAiStatus();
  renderFilmstrip();

  try {
    const result = await requestSprite(prompt);
    const image = await loadImage(result.image);
    ui.ai.variants.unshift({ raw: result.image, image, meta: result });
    ui.ai.variants = ui.ai.variants.slice(0, 4);
    ui.ai.index = 0;
    applyPixelation();
    $('#detected').textContent = shortenModel(result.model);
    showToast(`Generated in ${result.seconds}s · ${shortenModel(result.model)}`);
  } catch (error) {
    console.error(error);
    ui.ai.error = error.hint ? `${error.message}. ${error.hint}` : error.message;
    renderAiError();
    showToast(error.code === 501 ? 'API key not configured' : 'Generation failed');
    if (error.code === 501) refreshAiStatus();
  } finally {
    ui.ai.busy = false;
    renderAiStatus();
    renderFilmstrip();
  }
}

function exportAiSprite() {
  const sprite = ui.ai.canvas;
  if (!sprite) return showToast('Nothing to export yet');
  const px = Math.max(8, ui.scale * 8);
  const canvas = document.createElement('canvas');
  canvas.width = sprite.width * px;
  canvas.height = sprite.height * px;
  const ctx = canvas.getContext('2d');
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(sprite, 0, 0, canvas.width, canvas.height);
  canvas.toBlob((blob) => {
    if (!blob) return;
    downloadBlob(blob, `pixelforge_ai_${slugify(ui.prompt)}_${ui.ai.size}px.png`);
    showToast(`Exported ${canvas.width}×${canvas.height} PNG`);
  }, 'image/png');
}

function exportAiRender() {
  const variant = ui.ai.variants[ui.ai.index];
  if (!variant?.raw) return showToast('Nothing to export yet');
  const ext = variant.raw.startsWith('data:image/jpeg') ? 'jpg' : 'png';
  const link = document.createElement('a');
  link.href = variant.raw;
  link.download = `pixelforge_render_${slugify(ui.prompt)}.${ext}`;
  document.body.append(link);
  link.click();
  link.remove();
  showToast('Model render exported');
}

function exportAiMetadata() {
  const variant = ui.ai.variants[ui.ai.index];
  if (!variant) return showToast('Nothing to export yet');
  const meta = {
    app: 'PixelForge',
    mode: 'ai',
    prompt: ui.prompt,
    promptUsed: variant.meta.promptUsed,
    provider: variant.meta.provider,
    model: variant.meta.model,
    generatedAt: new Date().toISOString(),
    seconds: variant.meta.seconds,
    sprite: {
      width: ui.ai.size,
      height: ui.ai.size,
      colors: ui.ai.colors,
      outline: ui.ai.outline,
      transparentShare: Number((ui.ai.sprite?.transparency ?? 0).toFixed(3)),
    },
    palette: ui.ai.sprite?.palette ?? [],
  };
  downloadBlob(
    new Blob([JSON.stringify(meta, null, 2)], { type: 'application/json' }),
    `pixelforge_ai_${slugify(ui.prompt)}.json`,
  );
  showToast('Metadata exported');
}

function setZoom(value) {
  ui.zoom = value;
  if ($('#zoom').value !== String(value)) $('#zoom').value = String(value);
  if ($('#zoom-ai').value !== String(value)) $('#zoom-ai').value = String(value);
  drawStage();
}

// ---------------------------------------------------------------- history

function loadHistory() {
  try {
    const raw = localStorage.getItem('pixelforge.history.v1');
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.slice(0, 8) : [];
  } catch {
    return [];
  }
}

function persistHistory() {
  try {
    localStorage.setItem('pixelforge.history.v1', JSON.stringify(history));
  } catch {
    /* storage can be unavailable; the gallery is a convenience, not state */
  }
}

function scheduleHistory(immediate = false) {
  clearTimeout(historyTimer);
  historyTimer = setTimeout(pushHistory, immediate ? 0 : 900);
}

function pushHistory() {
  if (!ui.result || !ui.frames) return;
  const thumbCanvas = ui.frames.idle?.[0]?.[0];
  if (!thumbCanvas) return;
  const entry = {
    prompt: ui.prompt,
    seed: ui.seed,
    overrides: { ...ui.overrides },
    thumb: thumbCanvas.toDataURL(),
    name: ui.result.spec.name,
  };
  history = history.filter(
    (item) =>
      !(
        item.prompt === entry.prompt &&
        item.seed === entry.seed &&
        JSON.stringify(item.overrides) === JSON.stringify(entry.overrides)
      ),
  );
  history.unshift(entry);
  history = history.slice(0, 8);
  persistHistory();
  renderHistory();
}

function renderHistory() {
  const wrap = $('#history');
  wrap.innerHTML = '';
  if (!history.length) {
    const empty = document.createElement('p');
    empty.className = 'history-empty';
    empty.textContent = 'Nothing yet — generation saves automatically.';
    wrap.append(empty);
    return;
  }
  for (const entry of history) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'history-item';
    button.title = `${entry.prompt} · ${entry.seed}`;
    const img = document.createElement('img');
    img.src = entry.thumb;
    img.alt = entry.name;
    button.append(img);
    button.addEventListener('click', () => restoreHistory(entry));
    wrap.append(button);
  }
}

function restoreHistory(entry) {
  ui.prompt = entry.prompt;
  ui.seed = entry.seed;
  ui.overrides = {
    archetype: 'auto',
    weapon: 'auto',
    hat: 'auto',
    cape: null,
    wings: null,
    glow: null,
    hue: null,
    ...entry.overrides,
  };
  ui.anim = 'idle';
  ui.dir = 0;
  ui.frame = 0;
  ui.playing = true;
  lastFrameTime = performance.now();
  $('#prompt').value = ui.prompt;
  buildTabs();
  syncControls();
  updatePlayButton();
  regenerate();
}

// ---------------------------------------------------------------- events

function bindEvents() {
  $('#prompt').addEventListener('input', (event) => {
    ui.prompt = event.target.value;
    if (ui.mode === 'ai') return;
    ui.overrides.cape = null;
    ui.overrides.wings = null;
    ui.overrides.glow = null;
    clearTimeout(promptTimer);
    promptTimer = setTimeout(regenerate, 170);
  });

  $('#archetype').addEventListener('change', (event) => {
    ui.overrides.archetype = event.target.value;
    regenerate();
  });
  $('#weapon').addEventListener('change', (event) => {
    ui.overrides.weapon = event.target.value;
    regenerate();
  });
  $('#hat').addEventListener('change', (event) => {
    ui.overrides.hat = event.target.value;
    regenerate();
  });

  $('#toggle-cape').addEventListener('click', () => {
    ui.overrides.cape = !ui.result.spec.gear.cape;
    regenerate();
  });
  $('#toggle-wings').addEventListener('click', () => {
    ui.overrides.wings = !ui.result.spec.gear.wings;
    regenerate();
  });
  $('#toggle-glow').addEventListener('click', () => {
    ui.overrides.glow = !ui.result.spec.glow;
    regenerate();
  });

  $('#hue').addEventListener('input', (event) => {
    const value = Number(event.target.value);
    ui.overrides.hue = value;
    $('#hue-value').textContent = `${value}°`;
    clearTimeout(hueTimer);
    hueTimer = setTimeout(regenerate, 70);
  });
  $('#btn-hue-auto').addEventListener('click', () => {
    ui.overrides.hue = null;
    regenerate();
  });

  $('#seed').addEventListener('input', (event) => {
    ui.seed = event.target.value.trim() || 'seed';
    clearTimeout(seedTimer);
    seedTimer = setTimeout(regenerate, 240);
  });
  $('#btn-dice').addEventListener('click', () => {
    ui.seed = randomSeed();
    $('#seed').value = ui.seed;
    regenerate();
  });

  $('#btn-surprise').addEventListener('click', () => {
    ui.prompt = randomPrompt();
    $('#prompt').value = ui.prompt;
    if (ui.mode === 'ai') {
      showToast('Prompt rolled — press Generate');
      return;
    }
    ui.seed = randomSeed();
    ui.overrides = {
      archetype: 'auto',
      weapon: 'auto',
      hat: 'auto',
      cape: null,
      wings: null,
      glow: null,
      hue: null,
    };
    ui.anim = 'idle';
    ui.dir = 0;
    ui.frame = 0;
    ui.playing = true;
    lastFrameTime = performance.now();
    buildTabs();
    updatePlayButton();
    regenerate();
  });

  $('#btn-export').addEventListener('click', exportSheet);
  $('#btn-export-2').addEventListener('click', exportSheet);
  $('#btn-download-sheet').addEventListener('click', exportSheet);
  $('#btn-download-frame').addEventListener('click', exportFrame);
  $('#btn-download-json').addEventListener('click', exportMetadata);
  $('#btn-copy-palette').addEventListener('click', copyPalette);
  $('#btn-clear-history').addEventListener('click', () => {
    history = [];
    persistHistory();
    renderHistory();
    showToast('History cleared');
  });

  $('#btn-play').addEventListener('click', () => {
    ui.playing = !ui.playing;
    lastFrameTime = performance.now();
    updatePlayButton();
  });

  $('#zoom').addEventListener('input', (event) => setZoom(Number(event.target.value)));
  $('#zoom-ai').addEventListener('input', (event) => setZoom(Number(event.target.value)));

  for (const button of $('#mode-switch').children) {
    button.addEventListener('click', () => setMode(button.dataset.mode));
  }
  $('#btn-ai-generate').addEventListener('click', generateAiSprite);

  $('#ai-size').addEventListener('change', (event) => {
    ui.ai.size = Number(event.target.value);
    applyPixelation();
  });
  $('#ai-colors').addEventListener('change', (event) => {
    ui.ai.colors = Number(event.target.value);
    applyPixelation();
  });
  $('#toggle-ai-outline').addEventListener('click', (event) => {
    ui.ai.outline = !ui.ai.outline;
    event.currentTarget.setAttribute('aria-pressed', String(ui.ai.outline));
    applyPixelation();
  });
  $('#toggle-ai-bg').addEventListener('click', (event) => {
    ui.ai.keepBackdrop = !ui.ai.keepBackdrop;
    event.currentTarget.setAttribute('aria-pressed', String(ui.ai.keepBackdrop));
    applyPixelation();
  });

  for (const button of $('#scale-group').querySelectorAll('button')) {
    button.addEventListener('click', () => {
      ui.scale = Number(button.dataset.scale);
      for (const sibling of $('#scale-group').querySelectorAll('button')) {
        sibling.setAttribute('aria-pressed', String(sibling === button));
      }
      renderSheetPreview();
    });
  }

  document.addEventListener('keydown', (event) => {
    if ((event.metaKey || event.ctrlKey) && event.key === 'Enter' && ui.mode === 'ai') {
      event.preventDefault();
      generateAiSprite();
      return;
    }
    const tag = event.target.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
    if (ui.mode === 'ai') return;
    if (event.code === 'Space') {
      event.preventDefault();
      ui.playing = !ui.playing;
      lastFrameTime = performance.now();
      updatePlayButton();
    } else if (event.key === 'r' || event.key === 'R') {
      ui.seed = randomSeed();
      $('#seed').value = ui.seed;
      regenerate();
    }
  });
}

function randomPrompt() {
  const adjectives = ['crimson', 'golden', 'neon', 'ancient', 'cursed', 'frost', 'emerald', 'shadow', 'royal', 'toxic', 'rusty', 'celestial'];
  const subjects = ['knight', 'wizard', 'ranger', 'robot', 'slime', 'vampire', 'pirate', 'elf', 'demon', 'monk', 'king', 'orc', 'ghost'];
  const gear = ['with a longsword', 'with a staff', 'with a longbow', 'wearing a cape', 'with a crown', 'in a hood', 'with a shield', 'with an axe'];
  const pick = (list) => list[Math.floor(Math.random() * list.length)];
  return `${pick(adjectives)} ${pick(subjects)} ${pick(gear)}`;
}

// ---------------------------------------------------------------- loop + init

function currentFrames() {
  return ui.frames?.[ui.anim]?.[ui.dir] ?? [];
}

function loop(now) {
  requestAnimationFrame(loop);
  if (!ui.result) return;
  if (!ui.playing) {
    lastFrameTime = now;
    return;
  }
  const state = STATES.find((s) => s.id === ui.anim);
  const interval = 1000 / (state?.fps ?? 8);
  if (now - lastFrameTime < interval) return;
  lastFrameTime = now - ((now - lastFrameTime) % interval);
  const frames = currentFrames();
  if (!frames.length) return;
  ui.frame = (ui.frame + 1) % frames.length;
  drawStage();
  updateBadges();
  highlightFrame();
}

function init() {
  buildSelects();
  buildChips();
  buildTabs();
  drawLogo();
  bindEvents();

  $('#prompt').value = ui.prompt;
  $('#seed').value = ui.seed;
  $('#zoom-ai').value = String(ui.zoom);
  renderHistory();
  regenerate();
  updatePlayButton();
  updateExportLabels();
  requestAnimationFrame(loop);
}

init();
