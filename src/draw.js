import * as C from './config.js';
import { hash01 } from './rng.js';
import { platformX, hazardPos, heartPos, doorHeight, elevatorOffset } from './tower.js';
import { sectionPalette, mixColor } from './palettes.js';

const TAU = Math.PI * 2;
const OUTLINE = 2.5; // ink outline around every object

export const portalColor = (pt, col) => (pt.color === 'blue' ? col.portalBlue : col.portalYellow);
export const hex = (c) => `#${c.toString(16).padStart(6, '0')}`;

// Section n of the tower (above door n) follows the planned palette journey (see palettes.js).
// Its background is the color of the door that opens it.
export function palette(tower, section) {
  return sectionPalette(section);
}

const FADE_MS = 2500; // a slow fade, so a door is a change of light, not a cut

// The section palette, fading from the previous one for a while after a door.
function currentPalette(sc) {
  const k = Math.min(1, (sc.time.now - sc.colT) / FADE_MS);
  if (k >= 1) return sc.colTo;
  const e = k * k * (3 - 2 * k);
  const out = {};
  for (const key in sc.colTo) out[key] = typeof sc.colTo[key] === 'number' ? mixColor(sc.colFrom[key], sc.colTo[key], e) : sc.colTo[key];
  return out;
}

export function drawHeart(g, x, y, s) {
  g.fillCircle(x - s * 0.5, y - s * 0.2, s * 0.56);
  g.fillCircle(x + s * 0.5, y - s * 0.2, s * 0.56);
  g.fillTriangle(x - s * 1.04, y, x + s * 1.04, y, x, y + s * 1.1);
}

// A heart with an ink outline (an ink heart drawn slightly larger underneath).
export function inkHeart(g, x, y, s, fill, ink, alpha = 1) {
  g.fillStyle(ink, alpha);
  drawHeart(g, x, y + 0.4, s + OUTLINE);
  g.fillStyle(fill, alpha);
  drawHeart(g, x, y, s);
}

const lum = (c) => 0.299 * ((c >> 16) & 255) + 0.587 * ((c >> 8) & 255) + 0.114 * (c & 255);

// Pop-up text colors for a palette: `outline` is the darker of bg and fg, so text reads on any
// background; `plain` is a light fill for neutral text.
export function textColors(col) {
  const dark = lum(col.bg) < lum(col.ink) ? col.bg : col.ink;
  const light = dark === col.bg ? col.ink : col.bg;
  return { outline: dark, plain: mixColor(light, 0xffffff, 0.6) };
}

// The color of a pop-up word in the current palette (see C.WORD_ROLES).
export function wordColor(col, word) {
  const role = C.WORD_ROLES[word];
  return role ? col[role] : textColors(col).plain;
}

// Sets a text object's color only when it changes (setColor re-renders the text).
export function tint(text, color) {
  if (text._tint === color) return text;
  text._tint = color;
  return text.setColor(hex(color));
}

let pageBg = -1;
function syncPageBackground(color) {
  if (color === pageBg) return;
  pageBg = color;
  document.body.style.backgroundColor = hex(color);
}

export function drawWorld(sc, aim) {
  const cam = sc.cameras.main;
  const g = sc.g;
  const top = cam.scrollY - 40;
  const bottom = cam.scrollY + C.H + 40;
  const col = currentPalette(sc);
  sc.col = col;
  cam.setBackgroundColor(col.bg);
  syncPageBackground(col.bg);
  drawBackdrop(sc, col);

  g.clear();
  if (bottom > 0) g.fillStyle(col.wall, 1).fillRect(0, 0, C.W, bottom);
  g.fillStyle(col.wall, 1);
  g.fillRect(0, top, C.WALL, bottom - top);
  g.fillRect(C.W - C.WALL, top, C.WALL, bottom - top);

  drawMarkers(sc, g, col, top, bottom);
  drawBestLine(sc, g, col, top, bottom);
  let doorLabels = 0;
  for (const p of sc.tower.platformsIn(top - 20, bottom + 20, sc.drawPlats)) {
    if (p.type === 'door') drawDoor(sc, g, p, col, sc.doorTexts[doorLabels++]);
    else drawPlatform(sc, g, p, col);
  }
  for (; doorLabels < sc.doorTexts.length; doorLabels++) sc.doorTexts[doorLabels].setVisible(false);
  for (const hz of sc.tower.hazardsIn(top - 140, bottom + 140, sc.drawHaz)) drawHazard(sc, g, hz, col);
  for (const f of sc.tower.funnelsIn(top - 20, bottom + 260, sc.drawFunnels)) drawFunnel(sc, g, f, col);
  for (const pt of sc.tower.portalsIn(top - 40, bottom + 40, sc.drawPortals)) drawPortal(sc, g, pt, col);
  for (const e of sc.tower.elevatorsIn(top - 20, bottom + 20, sc.drawElevs)) drawElevator(sc, g, e, col);
  drawPortalFx(sc, g);
  for (const st of sc.tower.starsIn(top - 60, bottom + 60, sc.drawStars)) drawStar(sc, g, st, col);
  for (const ht of sc.tower.heartsIn(top - 60, bottom + 60, sc.drawHearts)) drawPickup(sc, g, ht, col);
  drawTrail(sc, g);
  if (aim) drawAim(sc, g, col, aim);
  if (!sc.player.dead) drawPlayer(sc, g, col, aim);
  for (const p of sc.particles) {
    g.fillStyle(p.color, Math.min(1, p.life / p.max) * 0.9);
    g.fillCircle(p.x, p.y, p.size * (0.4 + 0.6 * (p.life / p.max)));
  }
}

// Faint parallax outlines so the climb reads as motion even between platforms.
function drawBackdrop(sc, col) {
  const g = sc.bgG;
  g.clear();
  const par = sc.cameras.main.scrollY * 0.35;
  const CELL = 300;
  const salt = sc.tower.seed & 0xffff;
  for (let c = Math.floor(par / CELL) - 1; c <= Math.floor((par + C.H) / CELL) + 1; c++) {
    for (let k = 0; k < 2; k++) {
      const n = c * 7 + k * 3 + salt;
      const x = 30 + hash01(n + 1) * (C.W - 60);
      const y = c * CELL + hash01(n + 2) * CELL - par;
      const r3 = hash01(n + 3);
      const size = 20 + r3 * 70;
      g.lineStyle(3, col.deco, 0.08);
      const shape = Math.floor(r3 * 30) % 3;
      if (shape === 0) g.strokeCircle(x, y, size / 2);
      else if (shape === 1) g.strokeRect(x - size / 2, y - size / 2, size, size);
      else g.strokeTriangle(x, y - size / 2, x + size / 2, y + size / 2, x - size / 2, y + size / 2);
    }
  }
}

function drawMarkers(sc, g, col, top, bottom) {
  const texts = sc.markerTexts;
  let i = 0;
  const first = Math.max(10, Math.ceil(-bottom / C.PX_PER_M / 10) * 10);
  for (let m = first; m * C.PX_PER_M <= -top; m += 10) {
    const y = -m * C.PX_PER_M;
    const major = m % 50 === 0;
    g.lineStyle(2, col.ink, major ? 0.4 : 0.2);
    g.lineBetween(C.WALL, y, C.WALL + (major ? 22 : 12), y);
    const t = texts[i++];
    if (t) tint(t, col.ink).setText(`${m}`).setPosition(C.WALL + 28, y).setAlpha(major ? 0.55 : 0.3).setVisible(true);
  }
  for (; i < texts.length; i++) texts[i].setVisible(false);
}

// Dashed line at today's best, shown only when the player is below it.
function drawBestLine(sc, g, col, top, bottom) {
  const best = sc.save.best;
  const y = -best * C.PX_PER_M;
  const show = best >= 2 && sc.height < best - 1 && y > top && y < bottom;
  sc.bestText.setVisible(show);
  if (!show) return;
  g.lineStyle(2, col.ink, 0.5);
  for (let x = C.WALL; x < C.W - C.WALL; x += 24) g.lineBetween(x, y, Math.min(x + 14, C.W - C.WALL), y);
  tint(sc.bestText, col.ink).setText(`BEST ${Math.floor(best)}m`).setPosition(C.W - C.WALL - 8, y - 6);
}

function drawPlatform(sc, g, p, col) {
  const t = sc.simT;
  const x = platformX(p, t);
  const x0 = x - p.w / 2;
  switch (p.type) {
    case 'ground':
      g.fillStyle(col.plat, 1).fillRect(C.WALL, p.y, C.W - 2 * C.WALL, 6);
      break;
    case 'normal':
      slab(g, x0, p.y, p.w, col);
      break;
    case 'moving': {
      g.lineStyle(2, col.plat, 0.2);
      g.lineBetween(p.x - p.amp - p.w / 2, p.y + T / 2, p.x + p.amp + p.w / 2, p.y + T / 2);
      slab(g, x0, p.y, p.w, col);
      g.fillStyle(col.bg, 0.9);
      g.fillCircle(x0 + 9, p.y + T / 2, 2);
      g.fillCircle(x0 + p.w - 9, p.y + T / 2, 2);
      break;
    }
    case 'crumble': {
      if (!sc.solid(p)) {
        g.lineStyle(1.5, col.plat, 0.2).strokeRect(x0, p.y, p.w, T);
        break;
      }
      const shaking = p.crumbleAt != null;
      const left = shaking ? Math.max(0, p.crumbleAt - t) / C.CRUMBLE_TIME : 1;
      const jitter = shaking ? Math.sin(t * 90) * 2 : 0;
      const pieces = Math.max(3, Math.round(p.w / 32));
      const pw = (p.w - (pieces - 1) * 4) / pieces;
      g.fillStyle(col.plat, shaking ? 0.4 + 0.6 * left : 1);
      for (let i = 0; i < pieces; i++) {
        const dy = shaking ? (1 - left) * (i % 2 ? 4 : -2) : 0;
        g.fillRect(x0 + i * (pw + 4) + jitter, p.y + dy, pw, T);
      }
      break;
    }
    case 'bouncy':
      drawSpring(g, p, x, t, col);
      break;
  }
}

const T = C.PLAT_THICK;

// Bouncy pad: a pad (the landing surface, at p.y) on a zig-zag coil spring standing on a base.
// A bounce pushes the pad down, then it wobbles back like a real spring.
function drawSpring(g, p, x, t, col) {
  const since = p.squashT != null ? t - p.squashT : Infinity;
  const dip = since < 0.8 ? 9 * Math.exp(-6 * since) * Math.cos(22 * since) : 0; // + is down
  const padH = 10;
  const padY = p.y + dip;
  const baseY = p.y + 30;
  const coilW = p.w * 0.42;
  // Coil: ink first, a little wider, then the color on top.
  const turns = 5;
  const y0 = padY + padH;
  const pts = [{ x, y: y0 }];
  for (let i = 1; i < turns * 2; i++) pts.push({ x: x + (i % 2 ? -1 : 1) * coilW / 2, y: y0 + ((baseY - y0) * i) / (turns * 2) });
  pts.push({ x, y: baseY });
  g.lineStyle(6, col.ink, 1).strokePoints(pts, false);
  g.lineStyle(3, col.bouncy, 1).strokePoints(pts, false);
  // Base plate.
  const bw = p.w * 0.6;
  g.fillStyle(col.ink, 1).fillRoundedRect(x - bw / 2, baseY - 1, bw, 7, 3);
  // Pad, slightly wider while squashed.
  const squash = Math.max(0, dip) / 9;
  const w = p.w + 10 * squash;
  g.fillStyle(col.ink, 1).fillRoundedRect(x - w / 2 - OUTLINE, padY - OUTLINE, w + 2 * OUTLINE, padH + 2 * OUTLINE, padH / 2 + OUTLINE);
  g.fillStyle(col.bouncy, 1).fillRoundedRect(x - w / 2, padY, w, padH, padH / 2);
  // A small up chevron on the pad says "this throws you up".
  g.lineStyle(2.5, col.ink, 0.7).strokePoints(
    [
      { x: x - 9, y: padY + padH - 2 },
      { x, y: padY + 2 },
      { x: x + 9, y: padY + padH - 2 },
    ],
    false,
  );
}

// Platforms are solid: a thick block with an ink outline, so it reads as a wall from every side.
function slab(g, x0, y, w, col) {
  g.fillStyle(col.ink, 1).fillRoundedRect(x0 - OUTLINE, y - OUTLINE, w + 2 * OUTLINE, T + 2 * OUTLINE, 4);
  g.fillStyle(col.plat, 1).fillRoundedRect(x0, y, w, T, 3);
}

// Elevator: a U box. Faint rails show how far it will carry you.
function drawElevator(sc, g, e, col) {
  const off = elevatorOffset(e, sc.simT);
  const y = e.y + off;
  const half = C.ELEV_INNER / 2;
  const Wl = C.ELEV_WALL;
  const top = y - C.ELEV_DEPTH;
  g.lineStyle(2, col.ink, 0.18);
  g.lineBetween(e.x - half - Wl / 2, e.y - C.ELEV_DEPTH, e.x - half - Wl / 2, e.y - C.ELEV_DEPTH - e.rise);
  g.lineBetween(e.x + half + Wl / 2, e.y - C.ELEV_DEPTH, e.x + half + Wl / 2, e.y - C.ELEV_DEPTH - e.rise);
  const pts = [
    { x: e.x - half - Wl, y: top },
    { x: e.x - half - Wl, y },
    { x: e.x + half + Wl, y },
    { x: e.x + half + Wl, y: top },
    { x: e.x + half, y: top },
    { x: e.x + half, y: y - Wl },
    { x: e.x - half, y: y - Wl },
    { x: e.x - half, y: top },
  ];
  g.fillStyle(col.elevator, 1).fillPoints(pts, true);
  g.lineStyle(OUTLINE, col.ink, 1).strokePoints(pts, true, true);
  // An up arrow inside while it waits.
  if (off === 0) {
    g.fillStyle(col.ink, 0.45).fillTriangle(e.x, top + 12, e.x - 10, top + 28, e.x + 10, top + 28);
  }
}

// A star: points only. The faint ring is the radius it is collected from. Gone once collected this run.
function drawStar(sc, g, st, col) {
  if (sc.scored.has(st)) return;
  const t = sc.simT;
  const bob = Math.sin(t * 3 + st.x) * 3;
  g.lineStyle(1.5, col.ink, 0.18).strokeCircle(st.x, st.y + bob, C.STAR_RADIUS);
  g.fillStyle(0xffffff, 0.25).fillCircle(st.x, st.y + bob, 18);
  inkStar(g, st.x, st.y + bob, 12, 5, -Math.PI / 2 + Math.sin(t * 2) * 0.15, 0.45, col.star, col.ink);
}

// A door is drawn in the color of the section above it (the background you get by passing it).
// Closed, it is a dotted line; once passed it becomes a full-width floor that sweeps open.
function drawDoor(sc, g, p, col, text) {
  const x0 = C.WALL;
  const x1 = C.W - C.WALL;
  const open = sc.solid(p);
  p.color ??= palette(sc.tower, p.n).door;
  if (!open) {
    for (let x = x0 + 6; x < x1; x += 18) {
      g.fillStyle(col.ink, 1).fillCircle(x, p.y + 4, 4.5);
      g.fillStyle(p.color, 1).fillCircle(x, p.y + 4, 3);
    }
  } else {
    const k = p.openT != null ? Math.min(1, (sc.simT - p.openT) / 0.35) : 1;
    const half = ((x1 - x0) / 2) * (1 - (1 - k) ** 3);
    g.fillStyle(col.ink, 1).fillRect(C.W / 2 - half, p.y - 2, half * 2, 14);
    g.fillStyle(p.color, 1).fillRect(C.W / 2 - half, p.y, half * 2, 10);
  }
  if (text) {
    tint(text, col.ink)
      .setText(`DOOR ${doorHeight(p.n)}m`)
      .setPosition(C.W / 2, p.y + 26)
      .setAlpha(open ? 0.9 : 0.7)
      .setVisible(true);
  }
}

function starPts(x, y, r, n, rot, inner) {
  const pts = [];
  for (let i = 0; i < n * 2; i++) {
    const a = rot + (i * Math.PI) / n;
    const rr = i % 2 ? r * inner : r;
    pts.push({ x: x + Math.cos(a) * rr, y: y + Math.sin(a) * rr });
  }
  return pts;
}

// Filled star with an ink outline.
function inkStar(g, x, y, r, n, rot, inner, fill, ink, alpha = 1) {
  const pts = starPts(x, y, r, n, rot, inner);
  g.fillStyle(fill, alpha).fillPoints(pts, true);
  g.lineStyle(OUTLINE, ink, alpha).strokePoints(pts, true, true);
}

function drawHazard(sc, g, hz, col) {
  const t = sc.simT;
  if (hz.kind === 'wall') {
    const wx = hz.side < 0 ? C.WALL : C.W - C.WALL;
    const dir = -hz.side;
    for (let y = hz.y0; y < hz.y1; y += 16) {
      const y1 = Math.min(y + 16, hz.y1);
      const pts = [
        { x: wx, y },
        { x: wx + dir * 13, y: (y + y1) / 2 },
        { x: wx, y: y1 },
      ];
      g.fillStyle(col.hazard, 1).fillPoints(pts, true);
      g.lineStyle(2, col.ink, 1).strokePoints(pts, false);
    }
    return;
  }
  const [x, y] = hazardPos(hz, t);
  if (hz.kind === 'saw') {
    g.lineStyle(2, col.ink, 0.2).lineBetween(hz.x, hz.y - hz.amp, hz.x, hz.y + hz.amp);
    inkStar(g, x, y, hz.r, 10, t * 6, 0.72, col.hazard, col.ink);
  } else {
    inkStar(g, x, y, hz.r, 7, t * 0.6, 0.5, col.hazard, col.ink);
  }
  g.fillStyle(col.ink, 1).fillCircle(x, y, hz.r * 0.26);
}

// Funnel: one shape. A cone with its mouth facing down narrows into a tube that rises, open
// at the top. Shoot up into the mouth and it carries you up and out of the top.
// Specks flow up through it to show the way.
function drawFunnel(sc, g, f, col) {
  const half = C.FUNNEL_W / 2;
  const neckW = C.FUNNEL_NECK;
  const neck = f.y - C.FUNNEL_D;
  const top = neck - C.FUNNEL_TUBE;
  const outline = [
    { x: f.x - half, y: f.y },
    { x: f.x - neckW, y: neck },
    { x: f.x - neckW, y: top },
    { x: f.x + neckW, y: top },
    { x: f.x + neckW, y: neck },
    { x: f.x + half, y: f.y },
  ];
  g.fillStyle(col.fill, 0.9).fillPoints(outline, true);
  // Walls only: the mouth and the top of the tube stay open. A small lip flares at the top.
  const wall = (s) => [
    { x: f.x + s * half, y: f.y },
    { x: f.x + s * neckW, y: neck },
    { x: f.x + s * neckW, y: top },
    { x: f.x + s * (neckW + 7), y: top - 7 },
  ];
  g.lineStyle(5, col.ink, 1);
  g.strokePoints(wall(-1), false);
  g.strokePoints(wall(1), false);
  g.fillStyle(col.ink, 1);
  for (const s of [-1, 1]) {
    g.fillCircle(f.x + s * half, f.y, 2.5);
    g.fillCircle(f.x + s * (neckW + 7), top - 7, 2.5);
    g.fillCircle(f.x + s * neckW, neck, 2.5);
  }

  // Specks rising from the mouth, converging into the tube and out of the top.
  const t = sc.simT;
  const seed = Math.floor(f.x * 13 + f.y);
  for (let i = 0; i < 12; i++) {
    const u = (t * 0.7 + i / 12 + hash01(seed + i) * 0.08) % 1;
    const lat = hash01(seed + i * 31) * 2 - 1;
    let x, y;
    if (u < 0.5) {
      const k = u / 0.5;
      const w = half + (neckW - half) * k;
      x = f.x + lat * (w - 8);
      y = f.y - C.FUNNEL_D * k;
    } else {
      const k = (u - 0.5) / 0.5;
      x = f.x + lat * (neckW - 8);
      y = neck - (C.FUNNEL_TUBE + 10) * k;
    }
    const a = Math.min(1, u * 6, (1 - u) * 6);
    g.fillStyle(col.ink, 0.45 * a).fillCircle(x, y, 2.4);
  }
}

// Two different shapes, so the way in and the way out read at a glance.
// Entry: a dark hole with a colored rim and spiral arms turning inward. Particles stream in.
// Exit: a solid disc with rays pulsing outward and an up arrow. Particles stream out.
function drawPortal(sc, g, pt, col) {
  if (pt.gone) return;
  const c = portalColor(pt, col);
  const R = C.PORTAL_R;
  const t = sc.simT;
  const { x, y } = pt;
  if (pt.color === 'blue') {
    const hole = textColors(col).outline;
    g.fillStyle(c, 0.22).fillCircle(x, y, R + 8);
    g.fillStyle(c, 1).fillCircle(x, y, R);
    g.fillStyle(hole, 1).fillCircle(x, y, R * 0.72);
    // Three arms spiraling into the middle, turning.
    for (let j = 0; j < 3; j++) {
      const arm = [];
      for (let i = 0; i <= 10; i++) {
        const k = i / 10;
        const r = R * (0.7 - 0.6 * k);
        const a = -t * 3 + (j * TAU) / 3 + k * 2.4;
        arm.push({ x: x + Math.cos(a) * r, y: y + Math.sin(a) * r });
      }
      g.lineStyle(3, c, 0.9).strokePoints(arm, false);
    }
    g.lineStyle(3, col.ink, 1).strokeCircle(x, y, R);
    return;
  }
  // Exit: rays around a solid disc, an ink up arrow inside.
  const pulse = (t * 1.6 + pt.x * 0.01) % 1;
  for (let i = 0; i < 8; i++) {
    const a = (i * TAU) / 8 + t * 0.6;
    const r0 = R + 4 + 6 * pulse;
    const r1 = r0 + 8;
    g.lineStyle(3, c, 1 - pulse).lineBetween(x + Math.cos(a) * r0, y + Math.sin(a) * r0, x + Math.cos(a) * r1, y + Math.sin(a) * r1);
  }
  g.fillStyle(c, 1).fillCircle(x, y, R);
  g.lineStyle(3, col.ink, 1).strokeCircle(x, y, R);
  g.fillStyle(col.ink, 0.8).fillPoints(
    [
      { x, y: y - R * 0.55 },
      { x: x + R * 0.45, y: y - R * 0.05 },
      { x: x + R * 0.18, y: y - R * 0.05 },
      { x: x + R * 0.18, y: y + R * 0.5 },
      { x: x - R * 0.18, y: y + R * 0.5 },
      { x: x - R * 0.18, y: y - R * 0.05 },
      { x: x - R * 0.45, y: y - R * 0.05 },
    ],
    true,
  );
}

function drawPortalFx(sc, g) {
  for (const p of sc.portalFx) {
    const k = p.life / p.max;
    g.fillStyle(p.color, Math.min(1, k * 2)).fillCircle(p.x, p.y, 1.5 + 2 * k);
  }
}

// A heart pickup: pulses while alive and blinks through its last 1.5s.
function drawPickup(sc, g, ht, col) {
  const t = sc.simT;
  if (ht.gone) return;
  const left = ht.seenT == null ? C.HEART_LIFE : C.HEART_LIFE - (t - ht.seenT);
  if (left <= 0) return;
  if (left < 1.5 && Math.floor(left * (left < 0.6 ? 16 : 8)) % 2 === 0) return;
  const [x, y] = heartPos(ht, t);
  const s = 10 * (1 + 0.08 * Math.sin(t * 7));
  g.fillStyle(0xffffff, 0.25).fillCircle(x, y + 1, 22);
  inkHeart(g, x, y - 1, s, col.heart, col.ink);
}

// From the palette: the launch color while an element makes you invincible, else a cool color
// when a jump is ready and a warm one while it cools down.
const playerColor = (sc) => (sc.player.launched || sc.player.elevator ? sc.col.launched : sc.jumpsLeft() > 0 ? sc.col.canJump : sc.col.cantJump);

function drawTrail(sc, g) {
  const tr = sc.trail;
  const n = tr.length / 2;
  for (let i = 0; i < n; i++) {
    const k = (i + 1) / n;
    g.fillStyle(playerColor(sc), 0.2 * k);
    g.fillCircle(tr[i * 2], tr[i * 2 + 1], C.PLAYER_R * (0.35 + 0.55 * k));
  }
}

// Aim: an arrow out of the player in the launch direction, longer with more power, in the
// player's color (faded when no jump is left), plus a faint dotted hint of the path past its tip (nothing past a wall).
function drawAim(sc, g, col, aim) {
  const pl = sc.player;
  const ready = sc.jumpsLeft() > 0;
  const alpha = ready ? 1 : 0.35;
  const dx = aim.x;
  const dy = aim.y;
  const nx = -dy;
  const ny = dx;
  const start = C.PLAYER_R + 7;
  const len = 22 + 58 * aim.power;
  const head = 15;
  const at = (along, side) => ({ x: pl.x + dx * along + nx * side, y: pl.y + dy * along + ny * side });
  const arrow = (grow) => [
    at(start - grow, 2.5 + grow),
    at(start + len - head, 4.5 + grow),
    at(start + len - head - grow * 0.5, 11 + grow * 1.6),
    at(start + len + grow * 1.8, 0),
    at(start + len - head - grow * 0.5, -11 - grow * 1.6),
    at(start + len - head, -4.5 - grow),
    at(start - grow, -2.5 - grow),
  ];
  g.fillStyle(col.ink, alpha).fillPoints(arrow(2.5), true);
  g.fillStyle(playerColor(sc), alpha).fillPoints(arrow(0), true);

  const tip = start + len + 10;
  const pts = sc.preview;
  const n = pts.length / 2;
  for (let i = 0; i < n; i++) {
    const x = pts[i * 2];
    const y = pts[i * 2 + 1];
    if ((x - pl.x) ** 2 + (y - pl.y) ** 2 < tip * tip) continue;
    const k = 1 - i / n;
    g.fillStyle(col.ink, (ready ? 0.45 : 0.12) * k).fillCircle(x, y, 1.5 + 1.8 * k);
  }
}

function ellipse(g, x, y, rx, ry, ang) {
  const pts = [];
  const cos = Math.cos(ang);
  const sin = Math.sin(ang);
  for (let i = 0; i < 24; i++) {
    const a = (i / 24) * TAU;
    const ex = Math.cos(a) * rx;
    const ey = Math.sin(a) * ry;
    pts.push({ x: x + ex * cos - ey * sin, y: y + ex * sin + ey * cos });
  }
  g.fillPoints(pts, true);
}

function drawPlayer(sc, g, col, aim) {
  const pl = sc.player;
  const R = C.PLAYER_R;
  let y = pl.y;
  let ang = 0;
  let sx = 1;
  let sy = 1;
  if (aim) {
    // Stretched along the pull, like a loaded slingshot.
    ang = Math.atan2(aim.y, aim.x);
    sx = 1 + 0.32 * aim.power;
    sy = 1 - 0.18 * aim.power;
  } else if (!pl.ground) {
    ang = Math.atan2(pl.vy, pl.vx);
    const k = Math.min(1, Math.hypot(pl.vx, pl.vy) / 2200);
    sx = 1 + 0.28 * k;
    sy = 1 - 0.16 * k;
  } else if (pl.squash > 0) {
    sx = 1 + 0.4 * pl.squash;
    sy = 1 - 0.32 * pl.squash;
    y += R * 0.32 * pl.squash;
  }
  if (pl.funnel) sx = sy = 0.8; // squeezed in the tube
  if (pl.warp) {
    // Long and narrow along the flight between portals.
    const k = Math.min(1, pl.warp.t / pl.warp.dur);
    ang = pl.warp.ang;
    sx = 1.8 + 1.2 * Math.sin(Math.PI * k);
    sy = 0.5;
    y = pl.y;
  }
  const flash = pl.hitT > 0 && Math.floor(pl.hitT * 16) % 2 === 0;
  const alpha = pl.launched || pl.elevator ? 0.6 : 1; // see-through while invincible
  g.fillStyle(col.ink, alpha);
  ellipse(g, pl.x, y, R * sx + 3, R * sy + 3, ang);
  g.fillStyle(flash ? 0xffffff : playerColor(sc), alpha);
  ellipse(g, pl.x, y, R * sx, R * sy, ang);
}
