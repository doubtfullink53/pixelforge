// Sprite construction: role-mask drawing for humanoids, slimes and ghosts.
//
// Everything is authored at 32x32 facing right (or forward); mirrored directions are produced by
// flipping the finished grid. Poses are pure functions of (state, frame, view).

import { Grid, ROLE } from './grid.js';

const CX = 16;
const FOOT_Y = 28;

const VIEWS = {
  front: {
    face: 'front', torso: 1, shoulder: 1, headSquash: 1, headShift: 0, torsoShift: 0, armShift: 0,
    armR: 1, armL: 1, legSpread: 1, rSide: -1, farArm: true, cape: 'front',
  },
  front34: {
    face: '34', torso: 0.92, shoulder: 0.95, headSquash: 0.97, headShift: 0.5, torsoShift: 0.3, armShift: 0.6,
    armR: 0.9, armL: 0.85, legSpread: 0.9, rSide: 1, farArm: true, cape: 'front',
  },
  side: {
    face: 'side', torso: 0.82, shoulder: 0.82, headSquash: 0.86, headShift: 1.1, torsoShift: 0.9, armShift: 1.8,
    armR: 0.25, armL: 0.25, legSpread: 0.35, rSide: 1, farArm: false, cape: 'trail',
  },
  back34: {
    face: null, torso: 0.92, shoulder: 0.95, headSquash: 0.97, headShift: 0.4, torsoShift: 0.3, armShift: 0.3,
    armR: 0.9, armL: 0.85, legSpread: 0.9, rSide: 1, farArm: true, cape: 'back',
  },
  back: {
    face: null, torso: 1, shoulder: 1, headSquash: 1, headShift: 0, torsoShift: 0, armShift: 0,
    armR: 1, armL: 1, legSpread: 1, rSide: 1, farArm: true, cape: 'back',
  },
};

export const STATE_FRAMES = { idle: 4, walk: 6, run: 6, attack: 4, cast: 4 };

export function buildPose(spec, state, frame, viewKind) {
  if (spec.family === 'slime') return slimePose(state, frame);
  if (spec.family === 'ghost') return ghostPose(state, frame);
  return humanoidPose(state, frame, viewKind);
}

function basePose() {
  return {
    bob: 0,
    lean: 0,
    legR: { dx: 0, dy: 0 },
    legL: { dx: 0, dy: 0 },
    armR: { dx: 0, dy: 0 },
    armL: { dx: 0, dy: 0 },
    weaponAngle: -100,
    hemSway: 0,
    squash: 1,
    tailWave: 0,
    headShift: 0,
  };
}

function humanoidPose(state, frame, viewKind) {
  const pose = basePose();
  const side = viewKind === 'side';
  const sideFactor = side ? 1 : viewKind === 'front' || viewKind === 'back' ? 0.5 : 0.78;

  if (state === 'idle') {
    const bobs = [0, 0, 1, 0];
    const sway = [0, 1, 0, -1];
    const s = sway[frame % 4];
    pose.bob = bobs[frame % 4];
    pose.armR = { dx: s * 0.5 * sideFactor, dy: s * 0.7 };
    pose.armL = { dx: -s * 0.5 * sideFactor, dy: s * 0.7 };
    pose.weaponAngle = side ? -55 : -95;
    return pose;
  }

  if (state === 'walk' || state === 'run') {
    const running = state === 'run';
    const p = (frame / STATE_FRAMES[state]) * Math.PI * 2;
    const stride = Math.sin(p);
    const amp = (running ? 3.6 : 2.7) * sideFactor;
    const lift = running ? 2 : 1.3;
    const dxR = stride * amp;
    const dxL = -stride * amp;
    pose.bob = Math.round(Math.abs(stride) * (running ? 1.4 : 1));
    pose.legR = { dx: dxR, dy: -Math.max(0, Math.cos(p)) * lift };
    pose.legL = { dx: dxL, dy: -Math.max(0, -Math.cos(p)) * lift };
    pose.armR = { dx: -dxR * 0.55, dy: running ? -1.5 : 0 };
    pose.armL = { dx: -dxL * 0.55, dy: running ? -1.5 : 0 };
    pose.hemSway = side ? Math.round(stride * 1.5) : 0;
    pose.lean = running && side ? 1 : 0;
    pose.weaponAngle = side ? -55 : -70;
    return pose;
  }

  if (state === 'attack') {
    const f = frame % 4;
    const offsets = side
      ? [[-1, -2], [-2, -4], [2, -1], [1, 0]]
      : [[-2, -2], [-3, -4], [-4, -1], [-2, 0]];
    pose.bob = [0, 1, 0, 0][f];
    pose.armR = { dx: offsets[f][0] * sideFactor, dy: offsets[f][1] };
    pose.armL = { dx: 1 * sideFactor, dy: 0 };
    pose.legR = { dx: 1.1 * sideFactor, dy: 0 };
    pose.legL = { dx: -1.1 * sideFactor, dy: 0 };
    pose.lean = side ? [0, -1, 1, 0][f] : 0;
    pose.weaponAngle = side
      ? [-110, -140, -25, -5][f]
      : [-70, -120, -35, -10][f];
    return pose;
  }

  if (state === 'cast') {
    const bobs = [0, 0, 1, 0];
    const f = frame % 4;
    pose.bob = bobs[f];
    pose.armR = { dx: -1 * sideFactor, dy: -3 };
    pose.armL = { dx: 1 * sideFactor, dy: -2 };
    pose.legR = { dx: 0.6 * sideFactor, dy: 0 };
    pose.legL = { dx: -0.6 * sideFactor, dy: 0 };
    pose.weaponAngle = side ? -70 : -80;
    return pose;
  }

  return pose;
}

function slimePose(state, frame) {
  const pose = basePose();
  if (state === 'idle') {
    pose.squash = [1, 0.94, 1.06, 0.97][frame % 4];
    pose.bob = [0, 0, -1, 0][frame % 4];
  } else if (state === 'walk' || state === 'run') {
    const p = (frame / STATE_FRAMES[state]) * Math.PI * 2;
    pose.bob = -Math.round(Math.max(0, Math.sin(p)) * (state === 'run' ? 3 : 2));
    pose.squash = 1 + Math.cos(p) * 0.12;
    pose.lean = Math.round(Math.cos(p) * 0.8);
  } else if (state === 'attack') {
    pose.lean = [0, -1, 2, 1][frame % 4];
    pose.squash = [1, 0.9, 1.14, 1][frame % 4];
    pose.bob = [0, 0, -1, 0][frame % 4];
  } else if (state === 'cast') {
    pose.bob = [0, -1, -2, -1][frame % 4];
    pose.squash = [1, 1.08, 1.16, 1.04][frame % 4];
  }
  return pose;
}

function ghostPose(state, frame) {
  const pose = basePose();
  const p = (frame / STATE_FRAMES[state]) * Math.PI * 2;
  if (state === 'idle') {
    pose.bob = Math.round(Math.sin(p) * 1.2);
    pose.tailWave = Math.sin(p) * 1.5;
    pose.armR = { dx: 0, dy: Math.sin(p) * 0.6 };
    pose.armL = { dx: 0, dy: -Math.sin(p) * 0.6 };
  } else if (state === 'walk' || state === 'run') {
    pose.bob = Math.round(Math.sin(p) * 1.5) - (state === 'run' ? 1 : 0);
    pose.lean = state === 'run' ? 1 : 0;
    pose.tailWave = Math.sin(p + 0.8) * 2.2;
    pose.armR = { dx: Math.sin(p) * 1.2, dy: -0.5 };
    pose.armL = { dx: -Math.sin(p) * 1.2, dy: -0.5 };
  } else if (state === 'attack') {
    pose.bob = [0, -1, 1, 0][frame % 4];
    pose.lean = [0, -1, 2, 1][frame % 4];
    pose.armR = { dx: [0, -2, 2, 0][frame % 4], dy: [0, -2, -1, 0][frame % 4] };
    pose.tailWave = [-1, 1, 3, 2][frame % 4];
  } else if (state === 'cast') {
    pose.bob = [0, -1, -2, -1][frame % 4];
    pose.armR = { dx: -2, dy: -2 };
    pose.armL = { dx: 2, dy: -2 };
    pose.tailWave = Math.sin(p) * 2;
  }
  return pose;
}

export function buildCharacter(spec, viewKind, pose) {
  const grid = new Grid(32, 32);
  const p = { ...basePose(), ...(pose ?? {}) };
  if (spec.family === 'slime') drawSlime(grid, spec, viewKind, p);
  else if (spec.family === 'ghost') drawGhost(grid, spec, viewKind, p);
  else drawHumanoid(grid, spec, viewKind, p);
  return grid;
}

// ---------------------------------------------------------------- humanoid

function geometry(spec, viewKind, pose) {
  const v = VIEWS[viewKind] ?? VIEWS.front;
  const a = spec.anatomy;
  const bob = pose.bob ?? 0;
  const lean = pose.lean ?? 0;

  const hipY = 29 - a.legLen + bob;
  const torsoBottom = hipY;
  const torsoTop = torsoBottom - a.torsoH;
  const torsoCx = CX + v.torsoShift + lean;

  const shoulderHalf = (a.shoulderW / 2) * (1 + a.bulk * 0.06) * v.shoulder;
  const waistHalf = (a.waistW / 2) * (1 + a.bulk * 0.08) * v.torso;

  const headH = Math.max(7, Math.round(a.headH * a.headSize));
  const headW = Math.max(7, Math.round(a.headW * a.headSize * v.headSquash));
  const headTop = torsoTop - 1 - headH;
  const headCx = torsoCx + v.headShift + (pose.headShift ?? 0);

  const shoulderY = torsoTop + 2;
  const handY = shoulderY + a.armLen;
  const armShift = v.armShift ?? 0;

  return {
    view: viewKind,
    v,
    torsoCx,
    torsoTop,
    torsoBottom,
    shoulderHalf,
    waistHalf,
    shoulderY,
    handY,
    hipY,
    rSide: v.rSide,
    shoulderR: { x: torsoCx + v.rSide * (shoulderHalf + 0.5) * v.armR + armShift, y: shoulderY },
    shoulderL: { x: torsoCx - v.rSide * (shoulderHalf + 0.5) * v.armL + armShift, y: shoulderY },
    hipR: { x: torsoCx + v.rSide * 3.1 * v.legSpread, y: hipY },
    hipL: { x: torsoCx - v.rSide * 3.1 * v.legSpread, y: hipY },
    head: { cx: headCx, top: headTop, w: headW, h: headH, bottom: headTop + headH },
  };
}

function outfitRole(spec) {
  if (spec.style.skeletal) return ROLE.BONE;
  if (spec.colors.clothType === 'metal') return ROLE.METAL;
  if (spec.colors.clothType === 'leather') return ROLE.LEATHER;
  return ROLE.CLOTH;
}

function drawHumanoid(g, spec, viewKind, pose) {
  const geo = geometry(spec, viewKind, pose);
  const v = geo.v;

  if (spec.gear.wings) drawWings(g, spec, geo, viewKind);
  if (spec.gear.tail) drawTail(g, spec, geo, viewKind);
  if (spec.gear.cape && v.cape !== 'back') drawCape(g, spec, geo, viewKind);

  if (v.farArm) drawArm(g, spec, geo, 'L', pose, false);
  if (!spec.style.robe) drawLeg(g, spec, geo, 'L', pose, false);
  if (!spec.style.robe) drawLeg(g, spec, geo, 'R', pose, true);

  if (spec.gear.offhand === 'shield' && (viewKind === 'side' || viewKind === 'back34')) {
    drawShield(g, spec, geo, pose);
  }

  if (spec.style.robe) drawRobe(g, spec, geo, pose);
  else drawTorso(g, spec, geo);

  if (spec.gear.cape && v.cape === 'back') drawCape(g, spec, geo, viewKind);

  drawArm(g, spec, geo, 'R', pose, true);
  if (spec.decor.shoulderPads && !spec.style.robe) drawShoulderPads(g, spec, geo);
  if (spec.gear.offhand === 'shield' && !(viewKind === 'side' || viewKind === 'back34')) {
    drawShield(g, spec, geo, pose);
  }

  if (spec.gear.weapon) {
    const held = spec.gear.weapon === 'bow' ? 'L' : 'R';
    const hand = armBones(spec, geo, held, pose).hand;
    drawWeapon(g, spec, hand, pose.weaponAngle, viewKind, geo.torsoCx);
  }

  drawNeck(g, spec, geo);
  drawHeadBase(g, spec, geo);
  drawHair(g, spec, geo, viewKind);
  drawHeadwear(g, spec, geo, viewKind);
  drawFace(g, spec, geo, viewKind);
  if (spec.gear.beard) drawBeard(g, spec, geo, viewKind);
  if (spec.gear.ears) drawEars(g, spec, geo);
  if (spec.gear.horns) drawHorns(g, spec, geo);
  if (spec.gear.antenna) drawAntennae(g, spec, geo);
}

function armBones(spec, geo, side, pose) {
  const shoulder = side === 'R' ? geo.shoulderR : geo.shoulderL;
  const p = side === 'R' ? pose.armR : pose.armL;
  const hand = { x: shoulder.x + p.dx, y: geo.handY + p.dy };
  const elbow = {
    x: (shoulder.x + hand.x) / 2,
    y: (shoulder.y + hand.y) / 2,
  };
  return { shoulder, elbow, hand };
}

function drawTorso(g, spec, geo) {
  const { torsoCx: cx, torsoTop: top, torsoBottom: bot, shoulderHalf: sh, waistHalf: wh } = geo;
  const role = outfitRole(spec);

  g.poly(
    [
      [cx - sh + 0.7, top],
      [cx + sh - 0.7, top],
      [cx + sh, top + 1.4],
      [cx + wh, bot],
      [cx - wh, bot],
      [cx - sh, top + 1.4],
    ],
    role,
  );

  if (spec.style.skeletal) {
    for (let i = 0; i < 3; i++) {
      g.hline(cx - wh + 0.6, cx + wh - 0.6, top + 2 + i * 2, ROLE.DARK);
    }
    g.vline(top + 1, bot - 2, cx, ROLE.DARK);
    g.rect(cx - wh, bot - 2, wh * 2, 2, ROLE.CLOTH);
  } else if (spec.style.blocky) {
    g.hline(cx - wh + 1, cx + wh - 1, top + 1, ROLE.TRIM);
    g.rect(cx - 1.5, top + 3, 3, 2, ROLE.ACCENT);
    g.hline(cx - wh, cx + wh, bot - 2, ROLE.DARK);
    g.hline(cx - wh, cx + wh, bot - 4, ROLE.CLOTH_DARK);
    g.vline(top + 2, bot - 4, cx - wh + 1, ROLE.CLOTH_DARK);
    g.vline(top + 2, bot - 4, cx + wh - 1, ROLE.CLOTH_DARK);
  } else if (role === ROLE.METAL) {
    g.vline(top + 2, bot - 3, cx, ROLE.DARK);
    g.hline(cx - wh + 1, cx + wh - 1, top + 3, ROLE.TRIM);
    g.rect(cx - 1, top + 4, 2, 2, ROLE.ACCENT);
    g.hline(cx - wh, cx + wh, bot - 2, ROLE.LEATHER);
    g.rect(cx - 1, bot - 2, 2, 1, ROLE.ACCENT);
  } else {
    g.hline(cx - 2, cx + 2, top, ROLE.TRIM);
    g.rect(cx - 0.5, top, 1.4, 2, ROLE.TRIM);
    g.hline(cx - wh, cx + wh, bot - 2, ROLE.LEATHER);
    g.rect(cx - 1, bot - 2, 2, 1, ROLE.ACCENT);
    g.vline(top + 2, bot - 3, cx - wh * 0.55, ROLE.CLOTH_DARK);
    g.vline(top + 2, bot - 3, cx + wh * 0.55, ROLE.CLOTH_DARK);
    g.hline(cx - wh, cx + wh, bot, ROLE.CLOTH_DARK);
  }
}

function drawRobe(g, spec, geo, pose) {
  const { torsoCx: cx, torsoTop: top, shoulderHalf: sh, waistHalf: wh } = geo;
  const hem = (pose.hemSway ?? 0) + (geo.view === 'side' ? -1.2 : 0);
  const bottom = FOOT_Y;
  const bottomHalf = wh + 3.4;

  g.poly(
    [
      [cx - sh + 0.7, top],
      [cx + sh - 0.7, top],
      [cx + sh, top + 1.4],
      [cx + bottomHalf + hem, bottom],
      [cx - bottomHalf + hem, bottom],
      [cx - sh, top + 1.4],
    ],
    ROLE.CLOTH,
  );
  g.hline(cx - bottomHalf + hem, cx + bottomHalf + hem, bottom, ROLE.TRIM);
  g.rect(cx - 0.9, top + 2, 1.8, bottom - top - 2, ROLE.TRIM);
  g.hline(cx - wh, cx + wh, top + 5, ROLE.LEATHER);
  g.rect(cx - 1, top + 5, 2, 1, ROLE.ACCENT);
  g.hline(cx - 2, cx + 2, top, ROLE.TRIM);
  g.vline(top + 2, bottom - 2, cx - bottomHalf * 0.55, ROLE.CLOTH_DARK);
  g.vline(top + 2, bottom - 2, cx + bottomHalf * 0.55, ROLE.CLOTH_DARK);
  if (spec.decor.shoulderPads) {
    g.rect(cx - sh - 1, top, 2.4, 2, ROLE.TRIM);
    g.rect(cx + sh - 1.4, top, 2.4, 2, ROLE.TRIM);
  }
}

function drawArm(g, spec, geo, side, pose, near) {
  const bones = armBones(spec, geo, side, pose);
  const armor = spec.colors.clothType === 'metal';
  const sleeve = spec.style.skeletal
    ? ROLE.BONE
    : spec.style.robe
      ? ROLE.CLOTH
      : armor
        ? ROLE.METAL
        : ROLE.CLOTH;
  const width = spec.style.robe ? 2.4 : 2.0;

  const mask = new Grid(g.w, g.h);
  mask.line(bones.shoulder.x, bones.shoulder.y, bones.elbow.x, bones.elbow.y, width, width * 0.8, sleeve);
  mask.line(bones.elbow.x, bones.elbow.y, bones.hand.x, bones.hand.y, width * 0.8, 1.5, sleeve);
  mask.brush(bones.hand.x, bones.hand.y, 1.25, ROLE.SKIN);
  if (armor && !spec.style.skeletal) {
    mask.rect(bones.elbow.x - 1, bones.elbow.y - 0.5, 2, 1, ROLE.TRIM);
  }

  stamp(g, mask, near ? ROLE.DARK : null);
}

function drawLeg(g, spec, geo, side, pose, near) {
  const hip = side === 'R' ? geo.hipR : geo.hipL;
  const p = side === 'R' ? pose.legR : pose.legL;
  const foot = { x: hip.x + p.dx, y: FOOT_Y + p.dy };
  const knee = {
    x: (hip.x + foot.x) / 2,
    y: hip.y + (foot.y - hip.y) * 0.55,
  };

  const armor = spec.colors.clothType === 'metal';
  const trouser = spec.style.skeletal
    ? ROLE.BONE
    : armor
      ? ROLE.METAL
      : spec.colors.clothType === 'leather'
        ? ROLE.LEATHER
        : ROLE.CLOTH_DARK;
  const boot = ROLE.LEATHER;

  const mask = new Grid(g.w, g.h);
  mask.line(hip.x, hip.y, knee.x, knee.y, 2.0, 1.8, trouser);
  mask.line(knee.x, knee.y, foot.x, foot.y - 1.5, 1.8, 1.6, trouser);
  const bootW = geo.view === 'front' || geo.view === 'back' ? 3.4 : 4.2;
  const toe = geo.view === 'front' || geo.view === 'back' ? 0 : 0.8;
  mask.rect(foot.x - bootW / 2 + toe, foot.y - 1.8, bootW, 2, boot);

  stamp(g, mask, near ? ROLE.DARK : null);
}

function stamp(g, mask, sepRole) {
  if (sepRole !== null) {
    for (let y = 0; y < g.h; y++) {
      for (let x = 0; x < g.w; x++) {
        if (mask.get(x, y) !== -1) continue;
        if (g.get(x, y) === -1) continue;
        const nearMask =
          mask.get(x - 1, y) !== -1 ||
          mask.get(x + 1, y) !== -1 ||
          mask.get(x, y - 1) !== -1 ||
          mask.get(x, y + 1) !== -1;
        if (nearMask) g.set(x, y, sepRole);
      }
    }
  }
  for (let y = 0; y < g.h; y++) {
    for (let x = 0; x < g.w; x++) {
      const role = mask.get(x, y);
      if (role !== -1) g.set(x, y, role);
    }
  }
}

function drawShoulderPads(g, spec, geo) {
  const { torsoCx: cx, torsoTop: top, shoulderHalf: sh } = geo;
  const role = spec.colors.clothType === 'metal' ? ROLE.METAL : ROLE.LEATHER;
  g.rect(cx - sh - 0.2, top - 0.4, 2.8, 2.2, role);
  g.rect(cx + sh - 2.6, top - 0.4, 2.8, 2.2, role);
  g.hline(cx - sh - 0.2, cx - sh + 2.6, top + 1.8, ROLE.TRIM);
  g.hline(cx + sh - 2.6, cx + sh + 0.2, top + 1.8, ROLE.TRIM);
}

function drawNeck(g, spec, geo) {
  const head = geo.head;
  g.rect(head.cx - 1.5, head.bottom - 1, 3, geo.torsoTop - head.bottom + 1.4, ROLE.SKIN);
}

function drawHeadBase(g, spec, geo) {
  const { cx, top, w, h } = geo.head;
  if (spec.style.blocky) {
    g.rect(cx - w / 2, top, w, h, ROLE.METAL);
    g.rect(cx - w / 2 + 1, top + 1.6, w - 2, h - 3, ROLE.DARK);
    g.hline(cx - w / 2 + 1, cx + w / 2 - 1, top + h - 1.4, ROLE.TRIM);
    g.rect(cx - w / 2 - 1, top + 3, 1, 3, ROLE.METAL);
    g.rect(cx + w / 2, top + 3, 1, 3, ROLE.METAL);
    return;
  }
  const profile = [0.58, 0.82, 0.95, 1, 1, 1, 0.96, 0.8, 0.55];
  for (let i = 0; i < h; i++) {
    const t = h === 1 ? 0 : i / (h - 1);
    const idx = Math.min(profile.length - 1, Math.round(t * (profile.length - 1)));
    const width = w * profile[idx];
    const jawShift = geo.view === 'side' && i >= h - 2 ? 0.6 : 0;
    g.rect(cx - width / 2 + jawShift, top + i, width, 1, ROLE.SKIN);
  }
  g.hline(cx - w * 0.16, cx + w * 0.16, top + h - 1, ROLE.SKIN_DEEP);
  g.rect(cx - 0.5, top + Math.round(h * 0.74), 1, 1, ROLE.SKIN_DEEP);
  if (geo.view === 'side') {
    g.rect(cx + w * 0.36, top + Math.round(h * 0.5), 1.4, 1, ROLE.SKIN);
  }
}

function drawHair(g, spec, geo, viewKind) {
  const hair = spec.colors.hair;
  const hatted = spec.gear.hat === 'helmet' || spec.gear.hat === 'hood' || spec.gear.hat === 'wizard';
  if (!hair || hatted || spec.style.blocky) return;
  const { cx, top, w, h } = geo.head;
  const half = w / 2;
  const style = spec.decor.hairStyle;

  if (viewKind === 'back' || viewKind === 'back34') {
    g.rect(cx - half + 0.6, top, w - 1.2, h - 1.5, ROLE.HAIR);
    if (style === 'long') {
      g.rect(cx - half + 0.6, top + h - 2, w - 1.2, 3.5, ROLE.HAIR);
      g.rect(cx - half + 0.4, top + 2, 1.4, h + 2, ROLE.HAIR);
      g.rect(cx + half - 1.8, top + 2, 1.4, h + 2, ROLE.HAIR);
    }
    return;
  }

  if (style === 'mohawk') {
    g.rect(cx - 1, top - 1, 2, 3, ROLE.HAIR);
    g.rect(cx - 2, top + 1, 4, 1, ROLE.HAIR);
    return;
  }

  g.rect(cx - half + 0.6, top, w - 1.2, 1.8, ROLE.HAIR);
  g.rect(cx - half + 0.4, top + 1, 1.2, 2.6, ROLE.HAIR);
  g.rect(cx + half - 1.6, top + 1, 1.2, 2.6, ROLE.HAIR);
  g.rect(cx - 2.6, top + 1.6, 2, 1, ROLE.HAIR);
  g.rect(cx + 2, top + 1.6, 1.4, 1, ROLE.HAIR);

  if (style === 'long') {
    g.rect(cx - half + 0.4, top + 3, 1.4, 4.5, ROLE.HAIR);
    g.rect(cx + half - 1.8, top + 3, 1.4, 4.5, ROLE.HAIR);
  }
  if (style === 'spiky') {
    for (let i = 0; i < 3; i++) g.rect(cx - half + 1.4 + i * 2.5, top - 1, 1.6, 1.6, ROLE.HAIR);
  }
  if (style === 'bun') {
    g.ellipse(cx + half * 0.4, top - 0.4, 1.7, 1.7, ROLE.HAIR);
  }
}

function drawHeadwear(g, spec, geo, viewKind) {
  const { cx, top, w, h } = geo.head;
  const hat = spec.gear.hat;
  if (!hat) {
    if (spec.gear.halo) drawHalo(g, spec, geo);
    return;
  }

  if (hat === 'helmet') {
    const half = w / 2 + 0.9;
    g.ellipse(cx, top + 2.2, half, 3.8, ROLE.METAL, { maxY: top + 4 });
    g.rect(cx - half - 0.2, top + 4, half * 2 + 0.4, 1, ROLE.TRIM);
    g.hline(cx - half + 0.6, cx + half - 0.6, top + 5, ROLE.DARK);
    g.rect(cx - 0.5, top + 4, 1.2, 4, ROLE.METAL);
    g.rect(cx - half, top + 5, 1, 3, ROLE.METAL);
    g.rect(cx + half - 1, top + 5, 1, 3, ROLE.METAL);
    if (spec.decor.shoulderPads) {
      g.rect(cx - 1, top - 1.4, 2, 2.2, ROLE.TRIM);
      g.rect(cx - 0.5, top - 2.4, 1, 1, ROLE.ACCENT);
    }
    return;
  }

  if (hat === 'hood') {
    const half = w / 2 + 0.4;
    g.ellipse(cx, top + 3.4, half, 5.4, ROLE.CLOTH);
    g.rect(cx - half - 0.2, top + 5, 1.5, 4.4, ROLE.CLOTH);
    g.rect(cx + half - 1.3, top + 5, 1.5, 4.4, ROLE.CLOTH);
    if (viewKind !== 'back' && viewKind !== 'back34') {
      g.ellipse(cx, top + 6.5, w / 2 - 0.9, 3.6, ROLE.SKIN);
    }
    g.hline(cx - half + 1, cx + half - 1, top + 2, ROLE.CLOTH_DARK);
    g.poly(
      [
        [cx - half + 0.6, top + 4],
        [cx - half - 2.2, top + 7.6],
        [cx - half + 1.6, top + 6.4],
      ],
      ROLE.CLOTH,
    );
    return;
  }

  if (hat === 'wizard') {
    const half = w / 2;
    g.ellipse(cx, top + 3.4, half + 0.3, 3.4, ROLE.CLOTH);
    g.rect(cx - half - 1.6, top + 3, half * 2 + 3.2, 1.4, ROLE.CLOTH);
    g.hline(cx - half - 1.6, cx + half + 1.6, top + 4.4, ROLE.TRIM);
    g.poly(
      [
        [cx - half + 1.2, top + 3.6],
        [cx + half - 1.2, top + 3.6],
        [cx + 2.2, top - 1.6],
        [cx + 3.4, top - 2.6],
        [cx + 0.8, top - 0.2],
      ],
      ROLE.CLOTH,
    );
    g.rect(cx - half + 1.6, top + 2.6, half * 2 - 3.2, 1, ROLE.TRIM);
    return;
  }

  if (hat === 'crown') {
    g.rect(cx - w / 2 + 0.5, top + 1, w - 1, 1.6, ROLE.TRIM);
    for (const dx of [-3, 0, 3]) {
      g.rect(cx + dx - 0.5, top - 1.4, 1.2, 2.4, ROLE.ACCENT);
    }
    return;
  }

  if (hat === 'bandana') {
    g.rect(cx - w / 2 - 0.5, top + 2, w + 1, 1.8, ROLE.CLOTH);
    g.rect(cx - w / 2 - 0.5, top + 2, w + 1, 0.6, ROLE.TRIM);
    g.rect(cx - w / 2 - 2, top + 2.4, 2, 1.2, ROLE.CLOTH);
    g.rect(cx - w / 2 - 2.6, top + 3.4, 1.4, 2, ROLE.CLOTH);
    return;
  }

  if (hat === 'straw') {
    g.ellipse(cx, top + 4.6, w / 2 + 2.6, 1.4, ROLE.WOOD);
    g.ellipse(cx, top + 2.4, w / 2 - 0.2, 2.6, ROLE.WOOD);
    g.rect(cx - w / 2 + 0.5, top + 4, w - 1, 0.8, ROLE.TRIM);
    return;
  }

  if (hat === 'halo') {
    drawHalo(g, spec, geo);
    return;
  }

  if (hat === 'antenna') {
    g.rect(cx - w / 2 + 0.5, top - 0.6, w - 1, 1.8, ROLE.METAL);
    return;
  }
}

function drawHalo(g, spec, geo) {
  const { cx, top } = geo.head;
  g.ellipse(cx, top - 2.5, 4.2, 1.5, ROLE.ACCENT);
  g.ellipse(cx, top - 2.5, 2.4, 0.6, -1);
}

function drawAntennae(g, spec, geo) {
  const { cx, top, w } = geo.head;
  for (const s of [-1, 1]) {
    const x = cx + s * (w * 0.28);
    g.rect(x - 0.4, top - 3.2, 0.9, 3.4, ROLE.METAL);
    g.brush(x, top - 3.8, 1.1, ROLE.ACCENT);
  }
}

function drawEars(g, spec, geo) {
  const { cx, top, w, h } = geo.head;
  const y = top + Math.round(h * 0.45);
  g.poly([[cx - w / 2, y], [cx - w / 2 - 2, y - 2], [cx - w / 2, y + 1.4]], ROLE.SKIN);
  g.poly([[cx + w / 2, y], [cx + w / 2 + 2, y - 2], [cx + w / 2, y + 1.4]], ROLE.SKIN);
}

function drawHorns(g, spec, geo) {
  const { cx, top, w } = geo.head;
  const y = top + 1;
  for (const s of [-1, 1]) {
    const x0 = cx + s * (w / 2 - 0.6);
    g.line(x0, y, x0 + s * 2.4, y - 3.5, 1.2, 0.5, ROLE.BONE);
    g.line(x0 + s * 2.4, y - 3.5, x0 + s * 1.8, y - 5.4, 0.6, 0.4, ROLE.BONE);
  }
}

function drawFace(g, spec, geo, viewKind) {
  const { cx, top, w, h } = geo.head;
  const eyeY = top + Math.round(h * 0.48);
  const eyeStyle = spec.colors.eyeStyle;

  if (eyeStyle === 'visor') {
    g.rect(cx - w / 2 + 0.5, eyeY - 1, w - 1, 2.6, ROLE.DARK);
    g.hline(cx - w / 2 + 1.5, cx + w / 2 - 1.5, eyeY, ROLE.ACCENT);
    g.hline(cx - w / 2 + 1.5, cx + w / 2 - 1.5, eyeY + 1, ROLE.ACCENT);
    return;
  }

  if (spec.gear.mask) {
    g.rect(cx - w / 2, top + 1, w, h - 1, ROLE.CLOTH_DARK);
    g.rect(cx - w / 2, eyeY, w, 2.2, ROLE.SKIN);
    g.rect(cx - 2.6, eyeY, 2, 1.4, ROLE.EYE);
    g.rect(cx + 1, eyeY, 2, 1.4, ROLE.EYE);
    return;
  }

  if (eyeStyle === 'hollow') {
    g.rect(cx - 3.4, eyeY - 0.5, 2.2, 2.2, ROLE.DARK);
    g.rect(cx + 1.4, eyeY - 0.5, 2.2, 2.2, ROLE.DARK);
    if (spec.glow) {
      g.rect(cx - 2.8, eyeY, 1, 1, ROLE.ACCENT);
      g.rect(cx + 2, eyeY, 1, 1, ROLE.ACCENT);
    }
    g.hline(cx - 2.4, cx + 2.4, eyeY + 2.4, ROLE.DARK);
    g.rect(cx - 2, eyeY + 2.4, 0.8, 1, ROLE.BONE);
    g.rect(cx + 1.4, eyeY + 2.4, 0.8, 1, ROLE.BONE);
    return;
  }

  if (viewKind === 'side') {
    const ex = cx + w * 0.18;
    if (eyeStyle === 'big') {
      g.rect(ex, eyeY - 1, 2.4, 2.4, ROLE.WHITE);
      g.rect(ex + 1.2, eyeY - 0.4, 1.2, 1.4, ROLE.EYE);
    } else {
      g.rect(ex, eyeY, 2, 1.8, ROLE.EYE);
    }
    g.rect(cx + w * 0.28, eyeY + 2, 1.4, 0.9, ROLE.DARK);
    return;
  }

  const gap = Math.max(2, Math.round(w * 0.3));
  if (eyeStyle === 'big') {
    g.rect(cx - gap - 1.4, eyeY - 1.2, 2.6, 2.6, ROLE.WHITE);
    g.rect(cx + gap - 1.2, eyeY - 1.2, 2.6, 2.6, ROLE.WHITE);      g.rect(cx - gap - 0.5, eyeY - 0.5, 1.2, 1.2, ROLE.EYE);
      g.rect(cx + gap - 0.3, eyeY - 0.5, 1.2, 1.2, ROLE.EYE);
  } else {
    g.rect(cx - gap - 1, eyeY, 2, 2, ROLE.EYE);
    g.rect(cx + gap - 1, eyeY, 2, 2, ROLE.EYE);
  }
  const mouthW = viewKind === 'front34' ? 1.6 : 2.2;
  g.rect(cx - mouthW / 2, eyeY + 2, mouthW, 0.9, ROLE.DARK);
}

function drawBeard(g, spec, geo, viewKind) {
  if (!spec.colors.hair) return;
  const { cx, top, w, h } = geo.head;
  const chin = top + h - 1;
  g.poly(
    [
      [cx - w * 0.28, chin - 0.6],
      [cx + w * 0.28, chin - 0.6],
      [cx + w * 0.18, chin + 2.2],
      [cx, chin + 3.2],
      [cx - w * 0.18, chin + 2.2],
    ],
    ROLE.HAIR,
  );
  const my = top + Math.round(h * 0.48) + 1.8;
  g.rect(cx - 2.6, my, 2, 0.9, ROLE.HAIR);
  g.rect(cx + 0.6, my, 2, 0.9, ROLE.HAIR);
}

// ---------------------------------------------------------------- gear

function drawWeapon(g, spec, hand, angle, viewKind, torsoCx) {
  const type = spec.gear.weapon;
  if (!type) return;
  const { x, y } = hand;
  // Long poles lean away from the body so their heads clear the hat brim.
  const pole = type === 'staff' || type === 'spear';
  if (pole && viewKind !== 'side') {
    angle = -90 + (x >= torsoCx ? 14 : -14);
  }

  if (type === 'bow') {
    drawBow(g, hand, torsoCx);
    return;
  }

  if (type === 'sword') {
    const rad = (angle * Math.PI) / 180;
    const px = -Math.sin(rad);
    const py = Math.cos(rad);
    g.bar(x, y, angle, -1.2, 2.6, 1.7, ROLE.LEATHER);
    g.brush(x + px * 0.5, y + py * 0.5, 0.9, ROLE.TRIM);
    g.bar(x + Math.cos(rad) * 2.8, y + Math.sin(rad) * 2.8, angle + 90, -2.6, 2.6, 1.2, ROLE.TRIM);
    g.bar(x, y, angle, 3.6, 10.6, 2.0, ROLE.METAL);
    g.bar(x - px * 0.55, y - py * 0.55, angle, 4, 10.2, 0.7, ROLE.WHITE);
    g.bar(x, y, angle, 10.2, 12.2, 1.1, ROLE.METAL);
    g.brush(x + Math.cos(rad) * 12.4, y + Math.sin(rad) * 12.4, 0.6, ROLE.METAL);
    return;
  }

  if (type === 'dagger') {
    g.bar(x, y, angle, 0, 2.2, 1.9, ROLE.LEATHER);
    const rad = (angle * Math.PI) / 180;
    g.bar(x + Math.cos(rad) * 2.2, y + Math.sin(rad) * 2.2, angle + 90, -1.8, 1.8, 1, ROLE.TRIM);
    g.bar(x, y, angle, 3, 6.4, 1.8, ROLE.METAL);
    g.bar(x + Math.sin(rad) * 0.5, y - Math.cos(rad) * 0.5, angle, 3.4, 6, 0.6, ROLE.WHITE);
    g.bar(x, y, angle, 6.4, 7.6, 0.8, ROLE.METAL);
    return;
  }

  if (type === 'axe') {
    g.bar(x, y, angle, 0, 10.5, 1.8, ROLE.WOOD);
    const rad = (angle * Math.PI) / 180;
    const ux = Math.cos(rad);
    const uy = Math.sin(rad);
    const px = -uy;
    const py = ux;
    const bx = x + ux * 8;
    const by = y + uy * 8;
    g.poly(
      [
        [bx + px * 0.4, by + py * 0.4],
        [bx + ux * 2 + px * 4, by + uy * 2 + py * 4],
        [bx + ux * 4.2 + px * 3.2, by + uy * 4.2 + py * 3.2],
        [bx + ux * 3.2 + px * 0.6, by + uy * 3.2 + py * 0.6],
      ],
      ROLE.METAL,
    );
    g.line(
      bx + ux * 2 + px * 4,
      by + uy * 2 + py * 4,
      bx + ux * 3.2 + px * 0.6,
      by + uy * 3.2 + py * 0.6,
      0.7,
      0.7,
      ROLE.TRIM,
    );
    return;
  }

  if (type === 'staff') {
    g.bar(x, y, angle, 0, 11, 1.7, ROLE.WOOD);
    const rad = (angle * Math.PI) / 180;
    const tx = x + Math.cos(rad) * 12.2;
    const ty = y + Math.sin(rad) * 12.2;
    g.brush(tx, ty, 2.1, ROLE.ACCENT);
    g.brush(tx, ty, 0.9, ROLE.WHITE);
    return;
  }

  if (type === 'spear') {
    g.bar(x, y, angle, 0, 13, 1.4, ROLE.WOOD);
    const rad = (angle * Math.PI) / 180;
    const ux = Math.cos(rad);
    const uy = Math.sin(rad);
    const px = -uy;
    const py = ux;
    const tip = { x: x + ux * 17.5, y: y + uy * 17.5 };
    g.poly(
      [
        [x + ux * 12.5 + px * 0.7, y + uy * 12.5 + py * 0.7],
        [x + ux * 12.5 - px * 0.7, y + uy * 12.5 - py * 0.7],
        [tip.x, tip.y],
      ],
      ROLE.METAL,
    );
    return;
  }

  if (type === 'hammer') {
    g.bar(x, y, angle, 0, 11, 1.9, ROLE.WOOD);
    const rad = (angle * Math.PI) / 180;
    const ux = Math.cos(rad);
    const uy = Math.sin(rad);
    const px = -uy;
    const py = ux;
    const bx = x + ux * 12;
    const by = y + uy * 12;
    g.poly(
      [
        [bx + px * 3.6, by + py * 3.6],
        [bx + px * 3.6 + ux * 3.6, by + py * 3.6 + uy * 3.6],
        [bx - px * 3.6 + ux * 3.6, by - py * 3.6 + uy * 3.6],
        [bx - px * 3.6, by - py * 3.6],
      ],
      ROLE.METAL,
    );
    return;
  }

  if (type === 'scepter') {
    g.bar(x, y, angle, 0, 9, 1.6, ROLE.TRIM);
    const rad = (angle * Math.PI) / 180;
    const tx = x + Math.cos(rad) * 10;
    const ty = y + Math.sin(rad) * 10;
    g.rect(tx - 2, ty - 1, 4, 2, ROLE.ACCENT);
    g.brush(tx, ty - 2, 1.1, ROLE.ACCENT);
    g.brush(tx - 2, ty - 1.5, 0.8, ROLE.ACCENT);
    g.brush(tx + 2, ty - 1.5, 0.8, ROLE.ACCENT);
    return;
  }
}

// Bow held in the front hand: the belly bulges away from the body, the string runs toward it.
function drawBow(g, hand, torsoCx) {
  const dir = hand.x >= torsoCx ? 1 : -1;
  const x0 = hand.x;
  const cy = hand.y;
  const r = 6.6;
  const outer = [];
  const inner = [];
  for (let i = 0; i <= 12; i++) {
    const t = -1.32 + (i / 12) * 2.64;
    const x = x0 + dir * (Math.cos(t) - 0.25) * 3.4;
    const y = cy + Math.sin(t) * r;
    outer.push([x, y]);
    inner.push([x - dir * 1.8, y]);
  }
  g.poly([...outer, ...inner.reverse()], ROLE.WOOD);
  g.line(x0, cy - r, x0, cy + r, 0.35, 0.35, ROLE.TRIM);
  g.rect(x0 - dir * 2.4, cy - 0.5, 1.4, 1, ROLE.LEATHER);
  g.line(x0 + dir * 2.2, cy, x0 - dir * 7, cy, 0.35, 0.35, ROLE.WOOD);
  g.brush(x0 - dir * 7.4, cy, 0.7, ROLE.METAL);
}

function drawShield(g, spec, geo, pose) {
  const bones = armBones(spec, geo, 'L', pose);
  const x = bones.hand.x + (geo.v.armShift ?? 0) * 0.5;
  const y = bones.hand.y + 0.5;
  g.poly(
    [
      [x, y - 4.4],
      [x + 2.8, y - 3.1],
      [x + 2.5, y + 1.8],
      [x, y + 4.4],
      [x - 2.5, y + 1.8],
      [x - 2.8, y - 3.1],
    ],
    ROLE.TRIM,
  );
  g.poly(
    [
      [x, y - 3.3],
      [x + 1.9, y - 2.3],
      [x + 1.7, y + 1.4],
      [x, y + 3.3],
      [x - 1.7, y + 1.4],
      [x - 1.9, y - 2.3],
    ],
    ROLE.METAL,
  );
  g.rect(x - 1, y - 1, 2, 2, ROLE.ACCENT);
}

function drawCape(g, spec, geo, viewKind) {
  const { torsoCx: cx, torsoTop: top, shoulderHalf: sh, waistHalf: wh, hipY } = geo;
  const mode = geo.v.cape;
  const cape = ROLE.CAPE;

  if (mode === 'trail') {
    const y0 = top + 1.5;
    const x = cx - wh * 0.5;
    g.poly(
      [
        [x, y0],
        [x + 1.6, y0],
        [x - 2.6, y0 + 6.5],
        [x - 1.2, y0 + 8.5],
        [x - 3.8, y0 + 9.6],
        [x - 3.2, y0 + 5.4],
      ],
      cape,
    );
    g.line(x - 2.6, y0 + 6.5, x - 3.8, y0 + 9.6, 0.6, 0.6, ROLE.TRIM);
    return;
  }

  const bottom = Math.min(26, hipY + 4);
  const topW = sh + 1.2;
  const botW = wh + 4;

  if (mode === 'back') {
    g.poly(
      [
        [cx - topW, top],
        [cx + topW, top],
        [cx + botW, bottom - 2],
        [cx + botW - 1.6, bottom],
        [cx, bottom - 1.2],
        [cx - botW + 1.6, bottom],
        [cx - botW, bottom - 2],
      ],
      cape,
    );
    g.line(cx - topW, top, cx - botW, bottom - 2, 0.7, 0.7, ROLE.TRIM);
    g.line(cx + topW, top, cx + botW, bottom - 2, 0.7, 0.7, ROLE.TRIM);
    if (spec.decor.emblem === 'gem') g.rect(cx - 1.5, top + 4, 3, 3, ROLE.ACCENT);
    if (spec.decor.emblem === 'cross') {
      g.rect(cx - 0.5, top + 3, 1, 5, ROLE.TRIM);
      g.rect(cx - 2, top + 4, 4, 1, ROLE.TRIM);
    }
    return;
  }

  g.poly(
    [
      [cx - topW + 1, top + 1],
      [cx + topW - 1, top + 1],
      [cx + botW, bottom],
      [cx + botW - 2, bottom - 1.6],
      [cx, bottom],
      [cx - botW + 2, bottom - 1.6],
      [cx - botW, bottom],
    ],
    cape,
  );
  g.line(cx - topW + 1, top + 1, cx - botW, bottom, 0.7, 0.7, ROLE.TRIM);
  g.line(cx + topW - 1, top + 1, cx + botW, bottom, 0.7, 0.7, ROLE.TRIM);
}

function drawWings(g, spec, geo, viewKind) {
  const { torsoCx, shoulderY } = geo;
  const bat = spec.archetype === 'demon';
  const sides = viewKind === 'side' ? [-1] : [1, -1];

  for (const s of sides) {
    const ax = torsoCx + s * 2.6;
    if (bat) {
      g.poly(
        [
          [ax, shoulderY - 1.5],
          [ax + s * 5.2, shoulderY - 6],
          [ax + s * 4.8, shoulderY - 1.2],
          [ax + s * 7.2, shoulderY + 1.2],
          [ax + s * 4.8, shoulderY + 2.6],
          [ax + s * 5.6, shoulderY + 5.2],
          [ax + s * 2, shoulderY + 3.4],
          [ax, shoulderY + 3.8],
        ],
        ROLE.CAPE,
      );
      g.line(ax, shoulderY - 0.5, ax + s * 5.2, shoulderY - 6, 0.8, 0.5, ROLE.TRIM);
      g.line(ax + s * 5.2, shoulderY - 6, ax + s * 7.2, shoulderY + 1.2, 0.5, 0.4, ROLE.TRIM);
    } else {
      for (let i = 0; i < 3; i++) {
        g.ellipse(ax + s * (2.2 + i * 1.7), shoulderY + 0.2 + i * 1.7, 2.8 - i * 0.35, 1.5, ROLE.WHITE);
        g.ellipse(ax + s * (2.2 + i * 1.7), shoulderY + 0.7 + i * 1.7, 1.9 - i * 0.25, 0.7, ROLE.TRIM);
      }
      g.line(ax, shoulderY, ax + s * 7, shoulderY + 4.8, 0.6, 0.4, ROLE.TRIM);
    }
  }
}

function drawTail(g, spec, geo, viewKind) {
  const { torsoCx, hipY } = geo;
  const s = viewKind === 'side' ? -1 : geo.rSide;
  const x0 = torsoCx + s * 2.2;
  const y0 = hipY + 0.5;
  g.line(x0, y0, x0 + s * 4, y0 + 2.8, 1.3, 0.9, ROLE.CAPE);
  g.line(x0 + s * 4, y0 + 2.8, x0 + s * 5.4, y0 + 1.4, 0.9, 0.6, ROLE.CAPE);
  g.brush(x0 + s * 5.8, y0 + 0.9, 1.5, ROLE.ACCENT);
}

// ---------------------------------------------------------------- slime

function drawSlime(g, spec, viewKind, pose) {
  const squash = pose.squash ?? 1;
  const cx = CX + (pose.lean ?? 0);
  const ground = FOOT_Y + (pose.bob ?? 0);
  const rx = 7.2 * squash;
  const ry = 6.8 / squash;
  const cy = ground - ry + 0.5;

  g.ellipse(cx, cy, rx, ry, ROLE.SKIN, { maxY: ground });
  g.rect(cx - rx + 1.2, ground - 0.6, rx * 2 - 2.4, 1.1, ROLE.SKIN);
  g.ellipse(cx + 0.6, cy + 1.6, rx * 0.55, ry * 0.48, ROLE.SKIN_DEEP, { maxY: ground - 0.5 });
  g.ellipse(cx - rx * 0.42, cy - ry * 0.46, 1.4, 0.9, ROLE.WHITE);
  g.brush(cx - rx + 0.4, ground - 1.4, 1.1, ROLE.SKIN);
  g.brush(cx + rx - 0.4, ground - 0.7, 0.9, ROLE.SKIN);

  const eyeY = cy - ry * 0.05;
  const gap = Math.max(2, rx * 0.34);
  g.rect(cx - gap - 1.2, eyeY, 2.4, 2.4, ROLE.WHITE);
  g.rect(cx + gap - 1.2, eyeY, 2.4, 2.4, ROLE.WHITE);
  g.rect(cx - gap - 0.3, eyeY + 0.7, 1.1, 1.1, ROLE.EYE);
  g.rect(cx + gap - 0.3, eyeY + 0.7, 1.1, 1.1, ROLE.EYE);
  g.rect(cx - 1.2, eyeY + 3.4, 2.4, 0.9, ROLE.DARK);

  if (spec.gear.hat === 'crown') {
    g.rect(cx - 4, cy - ry - 1.4, 8, 1.4, ROLE.TRIM);
    for (const dx of [-2.6, 0, 2.6]) g.rect(cx + dx - 0.6, cy - ry - 3.2, 1.4, 2, ROLE.ACCENT);
  }
}

// ---------------------------------------------------------------- ghost

function drawGhost(g, spec, viewKind, pose) {
  const cx = CX + (pose.lean ?? 0);
  const top = 6 + (pose.bob ?? 0);
  const wave = pose.tailWave ?? 0;

  g.ellipse(cx, top + 4, 5.6, 5.4, ROLE.CLOTH);
  g.poly(
    [
      [cx - 5.2, top + 7],
      [cx + 5.2, top + 7],
      [cx + 4.6 + wave * 0.3, top + 18],
      [cx + 2.4 + wave, top + 21],
      [cx + 0.6, top + 18.6],
      [cx - 1.4 + wave * 0.6, top + 21],
      [cx - 3.2, top + 18.2],
      [cx - 4.8 + wave * 0.4, top + 18],
    ],
    ROLE.CLOTH,
  );

  const armY = top + 8;
  g.ellipse(cx - 6, armY, 2.2, 2.6, ROLE.CLOTH);
  g.ellipse(cx + 6, armY, 2.2, 2.6, ROLE.CLOTH);
  g.ellipse(cx - 6.2, armY + 1.6, 1.2, 1.2, ROLE.CLOTH);
  g.ellipse(cx + 6.2, armY + 1.6, 1.2, 1.2, ROLE.CLOTH);

  g.ellipse(cx + 1, top + 6.4, 3.2, 3.6, ROLE.SKIN_DEEP, { maxY: top + 17 });

  const eyeY = top + 3.2;
  g.rect(cx - 3, eyeY, 2, 2.6, ROLE.DARK);
  g.rect(cx + 1, eyeY, 2, 2.6, ROLE.DARK);
  g.rect(cx - 1.2, eyeY + 3.6, 2.4, 1.2, ROLE.DARK);
  g.rect(cx - 5, top + 2, 2, 1, ROLE.WHITE);

  if (spec.gear.hat === 'crown') {
    g.rect(cx - 3.5, top - 1.6, 7, 1.4, ROLE.TRIM);
    for (const dx of [-2, 0, 2]) g.rect(cx + dx - 0.5, top - 3.4, 1.2, 2, ROLE.ACCENT);
  }
}
