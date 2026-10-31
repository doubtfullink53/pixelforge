// Orchestrates a full character: spec, palette, every direction and animation frame.

import { buildSpec } from './spec.js';
import { buildPalette } from './palette.js';
import { buildCharacter, buildPose, STATE_FRAMES } from './character.js';
import { renderSprite } from './grid.js';

export const DIRECTIONS = [
  { id: 'S', name: 'front', kind: 'front', mirror: false },
  { id: 'SW', name: 'front-left', kind: 'front34', mirror: true },
  { id: 'W', name: 'left', kind: 'side', mirror: true },
  { id: 'NW', name: 'back-left', kind: 'back34', mirror: true },
  { id: 'N', name: 'back', kind: 'back', mirror: false },
  { id: 'NE', name: 'back-right', kind: 'back34', mirror: false },
  { id: 'E', name: 'right', kind: 'side', mirror: false },
  { id: 'SE', name: 'front-right', kind: 'front34', mirror: false },
];

export const STATES = [
  { id: 'idle', label: 'Idle', fps: 5 },
  { id: 'walk', label: 'Walk', fps: 8 },
  { id: 'run', label: 'Run', fps: 11 },
  { id: 'attack', label: 'Attack', fps: 10 },
  { id: 'cast', label: 'Cast', fps: 7 },
];

export function generate({ prompt, seed, overrides = {}, outline = true }) {
  const spec = buildSpec(prompt, seed, overrides);
  const palette = buildPalette(spec);
  const frames = {};

  for (const state of STATES) {
    const count = STATE_FRAMES[state.id];
    frames[state.id] = DIRECTIONS.map((dir) => {
      const list = [];
      for (let frame = 0; frame < count; frame++) {
        const pose = buildPose(spec, state.id, frame, dir.kind);
        let grid = buildCharacter(spec, dir.kind, pose);
        if (dir.mirror) grid = grid.mirrorX();
        list.push(renderSprite(grid, palette, { outline, glow: spec.glow }));
      }
      return list;
    });
  }

  return { spec, palette, frames, states: STATES, directions: DIRECTIONS };
}
