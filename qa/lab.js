import { generate, DIRECTIONS } from '../js/generate.js';

const params = new URLSearchParams(location.search);
const ONE = params.get('prompt');
const SCALE = Number(params.get('scale') ?? (ONE ? 9 : 6));

const PROMPTS = [
  'armored knight with a crimson cape',
  'hooded ranger with a longbow',
  'old wizard with a glowing staff',
  'neon robot sentry',
  'toxic slime',
  'royal vampire in a cape',
  'skeletal pirate captain',
  'emerald elf archer',
];

function spriteCanvas(rgba, scale = SCALE) {
  const source = document.createElement('canvas');
  source.width = 32;
  source.height = 32;
  const sctx = source.getContext('2d');
  const image = sctx.createImageData(32, 32);
  image.data.set(rgba);
  sctx.putImageData(image, 0, 0);

  const out = document.createElement('canvas');
  out.width = 32 * scale;
  out.height = 32 * scale;
  const ctx = out.getContext('2d');
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(source, 0, 0, out.width, out.height);
  return out;
}

const out = document.querySelector('#out');

function labelFor(spec, prompt) {
  const label = document.createElement('div');
  label.className = 'row-label';
  const title = document.createElement('b');
  title.textContent = prompt;
  const meta = document.createElement('span');
  meta.textContent = `${spec.name} · hue ${spec.colors.hue} · ${spec.archetype} · ${spec.gear.weapon ?? 'no weapon'}${spec.gear.cape ? ' · cape' : ''}`;
  label.append(title, meta);
  return label;
}

function addRow(parent, title, frames, caption) {
  const wrap = document.createElement('div');
  wrap.className = 'strip';
  const head = document.createElement('b');
  head.textContent = title;
  const cells = document.createElement('div');
  cells.className = 'cells';
  for (const { rgba, label } of frames) {
    const figure = document.createElement('figure');
    const canvas = spriteCanvas(rgba);
    const cap = document.createElement('figcaption');
    cap.textContent = label ?? caption;
    figure.append(canvas, cap);
    cells.append(figure);
  }
  wrap.append(head, cells);
  parent.append(wrap);
}

if (ONE) {
  const { spec, frames } = generate({ prompt: ONE, seed: 'lab', overrides: {} });
  out.append(labelFor(spec, ONE));

  const dirs = DIRECTIONS.map((d, i) => ({ d, i }));
  addRow(
    out,
    'idle (S, SE, E, NE, N)',
    ['S', 'SE', 'E', 'NE', 'N'].map((id) => {
      const i = DIRECTIONS.findIndex((x) => x.id === id);
      return { rgba: frames.idle[i][0], label: id };
    }),
  );
  addRow(
    out,
    'walk E / SE',
    [0, 1, 2, 3, 4, 5].flatMap((f) => [
      { rgba: frames.walk[2][f], label: f % 2 === 0 ? `E${f + 1}` : '' },
      { rgba: frames.walk[1][f], label: f % 2 === 0 ? `SE${f + 1}` : '' },
    ]),
  );
  addRow(
    out,
    'attack E',
    [0, 1, 2, 3].map((f) => ({ rgba: frames.attack[2][f], label: `atk ${f + 1}` })),
  );
  addRow(
    out,
    'cast S',
    [0, 1, 2, 3].map((f) => ({ rgba: frames.cast[0][f], label: `cast ${f + 1}` })),
  );
} else {
  for (const prompt of PROMPTS) {
    const { spec, frames } = generate({ prompt, seed: 'lab', overrides: {} });
    const row = document.createElement('div');
    row.className = 'row';

    const label = labelFor(spec, prompt);

    const cells = document.createElement('div');
    cells.className = 'cells';

    const addCell = (rgba, caption) => {
      const figure = document.createElement('figure');
      const canvas = spriteCanvas(rgba);
      const cap = document.createElement('figcaption');
      cap.textContent = caption;
      figure.append(canvas, cap);
      cells.append(figure);
    };

    for (const dirId of ['S', 'SE', 'E', 'N']) {
      const d = DIRECTIONS.findIndex((x) => x.id === dirId);
      addCell(frames.idle[d][0], `${dirId} idle`);
    }
    for (let f = 0; f < 4; f++) addCell(frames.walk[0][f], `walk ${f + 1}`);
    for (let f = 0; f < 4; f++) addCell(frames.attack[2][f], `atk ${f + 1}`);

    row.append(label, cells);
    out.append(row);
  }
}
