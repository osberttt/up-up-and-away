import * as C from './config.js';
import { Rng, hashString, noise1 } from './rng.js';

const lerp = (a, b, t) => a + (b - a) * t;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const TAU = Math.PI * 2;

// Door heights in meters: 100, 200, 300, ...
export function doorHeight(n) {
  return C.DOOR_EVERY * n;
}

// Index of the first door above `heightM`.
export function nextDoorIndex(heightM) {
  let n = 1;
  while (doorHeight(n) <= heightM) n++;
  return n;
}

export function platformX(p, t) {
  return p.amp ? p.x + p.amp * Math.sin(t * p.speed + p.phase) : p.x;
}

export function hazardPos(hz, t) {
  return hz.amp ? [hz.x, hz.y + hz.amp * Math.sin(t * hz.speed + hz.phase)] : [hz.x, hz.y];
}

// Path [x0, y0, x1, y1] through a funnel's tube. The funnel's mouth is at y and faces down;
// the cone narrows into a straight tube that rises from it, open at the top, where you get fired out.
export function funnelTube(x, y) {
  const neck = y - C.FUNNEL_D;
  return [x, neck, x, neck - C.FUNNEL_TUBE];
}

// How far (px, negative is up) an elevator is above its resting spot at time t: it speeds up
// while riding, then eases back down after it fires you out.
export function elevatorOffset(e, t) {
  if (e.rideT != null) {
    const k = Math.min(1, (t - e.rideT) / C.ELEV_TIME);
    return -e.rise * k * k;
  }
  if (e.backT != null && t < e.backT + C.ELEV_RETURN) {
    const k = (t - e.backT) / C.ELEV_RETURN;
    return -e.rise * (1 - k * k * (3 - 2 * k));
  }
  return 0;
}

// Only a resting elevator is solid and can be entered.
export function elevatorIdle(e, t) {
  return e.rideT == null && (e.backT == null || t >= e.backT + C.ELEV_RETURN);
}

// Hearts drift around their spot on slow, smooth noise.
export function heartPos(ht, t) {
  const x = clamp(ht.x + 70 * noise1(ht.seed, t * 0.45), C.WALL + 24, C.W - C.WALL - 24);
  return [x, ht.y + 45 * noise1(ht.seed + 1, t * 0.4)];
}

// Buckets objects by vertical band so physics and drawing only touch what is near.
class Grid {
  constructor(size) {
    this.size = size;
    this.cells = new Map();
    this.stamp = 0;
  }

  add(obj, y0, y1) {
    for (let c = Math.floor(y0 / this.size); c <= Math.floor(y1 / this.size); c++) {
      let cell = this.cells.get(c);
      if (!cell) this.cells.set(c, (cell = []));
      cell.push(obj);
    }
  }

  query(y0, y1, out) {
    out.length = 0;
    const stamp = ++this.stamp;
    for (let c = Math.floor(y0 / this.size); c <= Math.floor(y1 / this.size); c++) {
      const cell = this.cells.get(c);
      if (!cell) continue;
      for (const obj of cell) {
        if (obj._q === stamp) continue;
        obj._q = stamp;
        out.push(obj);
      }
    }
    return out;
  }
}

// The day's tower. Generation is sequential from the date seed, so every player gets the
// same platforms and a reload rebuilds the exact tower (platform ids stay stable for saves).
//
// Path-first: each main platform is placed inside the reach of a launch from the previous
// one, so the tower is always climbable. Hazards are kept out of the column the path uses.
export class Tower {
  constructor(day) {
    this.day = day;
    this.seed = hashString(`upupandaway:${day}`);
    this.rng = new Rng(this.seed);
    this.hue = this.rng.next();
    this.platforms = [];
    this.hazards = [];
    this.platGrid = new Grid(600);
    this.hazGrid = new Grid(600);
    this.hearts = [];
    this.heartGrid = new Grid(600);
    // Hearts and stars use their own stream so they never change the platforms or hazards.
    this.itemRng = new Rng(this.seed ^ 0x5bd1e995);
    this.stars = [];
    this.starGrid = new Grid(600);
    this.funnels = [];
    this.funnelGrid = new Grid(600);
    this.elevators = [];
    this.elevGrid = new Grid(600);
    this.zones = []; // boxes around funnels and elevators, kept clear of everything else
    this.portals = [];
    this.portalGrid = new Grid(600);
    this.pendingPortal = null; // a blue portal waiting for its yellow exit higher up
    this.count = 0;
    this.doors = []; // doors[n] is the full-width floor at doorHeight(n)
    this.scratch = [];
    this.lastMain = this.addPlatform({ x: C.W / 2, y: 0, w: C.W, type: 'ground' });
  }

  addPlatform(p) {
    p.id = this.platforms.length;
    p.crumbleAt = null;
    this.platforms.push(p);
    this.platGrid.add(p, p.y - 4, p.y + 4);
    return p;
  }

  addHazard(hz) {
    this.hazards.push(hz);
    if (hz.kind === 'wall') this.hazGrid.add(hz, hz.y0, hz.y1);
    else this.hazGrid.add(hz, hz.y - hz.r - hz.amp, hz.y + hz.r + hz.amp);
  }

  platformsIn(y0, y1, out) {
    return this.platGrid.query(y0, y1, out);
  }

  hazardsIn(y0, y1, out) {
    return this.hazGrid.query(y0, y1, out);
  }

  heartsIn(y0, y1, out) {
    return this.heartGrid.query(y0, y1, out);
  }

  funnelsIn(y0, y1, out) {
    return this.funnelGrid.query(y0, y1, out);
  }

  portalsIn(y0, y1, out) {
    return this.portalGrid.query(y0, y1, out);
  }

  starsIn(y0, y1, out) {
    return this.starGrid.query(y0, y1, out);
  }

  elevatorsIn(y0, y1, out) {
    return this.elevGrid.query(y0, y1, out);
  }

  // Keep at least one screen of tower generated above y.
  ensureUpTo(y) {
    while (this.lastMain.y > y - C.H) this.step();
  }

  step() {
    const r = this.rng;
    const from = this.lastMain;
    this.count++;
    const P = C.PEAK;

    // No progression: the odds are the same at every height.
    const pHard = 0.2;
    const pMed = 0.38;
    const tierRoll = r.next();
    const tier = tierRoll < pHard ? 'hard' : tierRoll < pHard + pMed ? 'medium' : 'easy';

    // Vertical gap and how far sideways the next platform may sit. A launch reaches
    // horizontally 2·sqrt(P·(P−dy)) at height dy; we only use a fraction of that.
    let dy, reach;
    if (tier === 'hard') {
      // Above a single launch's peak: needs the second, mid-air fling.
      dy = P * r.range(1.0, 1.3);
      reach = 2 * Math.sqrt(P * (P - (dy - P * 0.85))) * 0.55;
    } else {
      dy = P * (tier === 'easy' ? r.range(0.28, 0.5) : r.range(0.5, 0.78));
      reach = 2 * Math.sqrt(P * (P - dy)) * (tier === 'easy' ? 0.5 : 0.7);
    }

    let w = r.range(150, 250);
    let type = 'normal';
    const roll = r.next();
    if (roll < 0.18) type = 'bouncy';
    else if (roll < 0.36) type = 'moving';
    else if (roll < 0.52) type = 'crumble';
    if (type === 'bouncy') w = Math.min(w, 150);
    // Most path points stay empty air: platforms are rare. Bouncy pads are elements, so they stay.
    if (type !== 'bouncy' && !r.chance(C.PLATFORM_CHANCE)) type = 'path';

    const minC = C.WALL + w / 2 + 4;
    const maxC = C.W - C.WALL - w / 2 - 4;
    const lo = from.type === 'ground' ? minC : Math.max(minC, from.x - reach);
    const hi = from.type === 'ground' ? maxC : Math.min(maxC, from.x + reach);
    let x = hi > lo ? r.range(lo, hi) : clamp(from.x, minC, maxC);
    // Avoid boring straight-up stacks when there is room to shift.
    if (Math.abs(x - from.x) < 70 && hi - lo > 200) {
      const shift = r.range(70, 140);
      x = x < from.x ? Math.max(lo, from.x - shift) : Math.min(hi, from.x + shift);
    }

    // Keep platforms clear of door floors: drop one that would overlap a door just below it,
    // or lift it above the door when that would leave too small a gap.
    let y = from.y - dy;
    const door = this.doorNear(y, 50);
    if (door !== null) y = from.y - (door + 50) > 120 ? door + 50 : door - 50;

    this.addDoorsUpTo(y);

    const p = { x, y, w, type };
    if (type === 'moving') {
      const amp = Math.min(r.range(50, 110), x - minC, maxC - x);
      if (amp < 30) p.type = 'normal';
      else {
        p.amp = amp;
        p.speed = TAU / r.range(2.6, 4.4);
        p.phase = r.range(0, TAU);
      }
    }
    // A 'path' point is never added as a platform; it only anchors the things placed around it.
    if (type !== 'path') this.addPlatform(p);
    this.lastMain = p;

    if (r.chance(C.SIDE_LEDGE_CHANCE)) this.addSideLedge(from, p);
    for (const chance of C.SPIKE_CHANCES) {
      if (!r.chance(chance)) break;
      this.addSpike(from, p);
    }
    if (r.chance(C.WALL_SPIKE_CHANCE)) this.addWallSpikes(from, p);
    this.placePortals(from, p, r.chance(C.PORTAL_CHANCE));
    if (r.chance(C.FUNNEL_CHANCE)) this.addFunnel(from, p);
    else if (r.chance(C.ELEVATOR_CHANCE)) this.addElevator(from, p);
    this.addHeart(from, p);
    this.addStar(from, p);
  }

  // Elevator: a U box (y is the bottom of its floor). Its rise column is reserved as a zone so
  // nothing new is placed in the box's way.
  addElevator(from, to) {
    const r = this.rng;
    const outer = C.ELEV_INNER / 2 + C.ELEV_WALL;
    const rise = r.range(...C.ELEV_RISE);
    for (let i = 0; i < 10; i++) {
      const x = r.range(C.WALL + outer + 10, C.W - C.WALL - outer - 10);
      const y = r.range(to.y + C.ELEV_DEPTH + 40, from.y - 40);
      if (y < to.y + C.ELEV_DEPTH + 40) return;
      const cy = y - C.ELEV_DEPTH / 2;
      if (this.platformNear(x, cy, outer + 40, C.ELEV_DEPTH / 2 + 60) || this.hazardNear(x, cy, outer + 40, C.ELEV_DEPTH / 2 + 40)) continue;
      if (this.doorNear(cy, C.ELEV_DEPTH + 60) !== null || this.portalNear(x, cy, outer + 60) || this.inZone(x, cy, C.ELEV_DEPTH)) continue;
      const e = { x, y, rise, rideT: null, backT: null };
      this.elevators.push(e);
      // Indexed over its whole travel so it's found (and drawn) while it rides.
      this.elevGrid.add(e, y - C.ELEV_DEPTH - rise - 20, y + 20);
      this.zones.push({ x0: x - outer - 30, x1: x + outer + 30, y0: y - C.ELEV_DEPTH - 40, y1: y + 40 });
      return;
    }
  }

  // Stars (points only) hang along the path, so collecting them means flying the route.
  addStar(from, to) {
    const r = this.itemRng;
    const roll = r.next();
    const x = clamp(lerp(from.x, to.x, r.range(0.2, 0.8)) + r.range(-80, 80), C.WALL + 30, C.W - C.WALL - 30);
    const y = lerp(from.y, to.y, r.range(0.3, 0.8));
    if (roll > C.STAR_CHANCE) return;
    if (this.hazardNear(x, y, 40, 40) || this.inZone(x, y, 30) || this.portalNear(x, y, 70) || this.platformNear(x, y, 30, 40)) return;
    const st = { x, y };
    this.stars.push(st);
    this.starGrid.add(st, y - 20, y + 20);
  }

  // Doors are added as generation passes them, so their platform ids stay deterministic.
  addDoorsUpTo(y) {
    let next = this.doors.length || 1;
    while (-doorHeight(next) * C.PX_PER_M >= y) {
      this.doors[next] = this.addPlatform({ x: C.W / 2, y: -doorHeight(next) * C.PX_PER_M, w: C.W - 2 * C.WALL, type: 'door', n: next });
      next++;
    }
  }

  // A funnel: a cone with its mouth facing down and a tube rising from its tip. Shoot up into
  // the mouth and it carries you up the tube and fires you high, leaning toward the middle.
  addFunnel(from, to) {
    const r = this.rng;
    const half = C.FUNNEL_W / 2;
    const rise = r.range(...C.FUNNEL_RISE);
    const speed = r.range(60, 180);
    let spot = null;
    for (let i = 0; i < 12 && !spot; i++) {
      const x = r.range(C.WALL + half + 20, C.W - C.WALL - half - 20);
      // y is the mouth. The tube's top stays at least 120px under the next main platform's
      // lowest possible spot, and the mouth 80px above `from` so it can be shot into.
      const top = C.FUNNEL_D + C.FUNNEL_TUBE;
      const y = r.range(to.y + top - 120, from.y - 80);
      if (y < to.y + top - 120) return;
      const cy = y - top / 2;
      if (this.platformNear(x, cy, half + 40, top / 2 + 40) || this.hazardNear(x, cy, half + 40, top / 2 + 40)) continue;
      if (this.doorNear(cy, top / 2 + 60) !== null || this.portalNear(x, cy, top / 2 + 60) || this.inZone(x, cy, top / 2 + 20)) continue;
      spot = { x, y };
    }
    if (!spot) return;
    const { x, y } = spot;
    const side = x < C.W / 2 ? 1 : -1;
    const f = { x, y, side, tube: funnelTube(x, y), vx: side * speed, vy: -Math.sqrt(2 * C.GRAVITY * rise) };
    this.funnels.push(f);
    const top = y - C.FUNNEL_D - C.FUNNEL_TUBE;
    this.funnelGrid.add(f, top - 30, y + 10);
    this.zones.push({ x0: x - half - 40, x1: x + half + 40, y0: top - 40, y1: y + 40 });
  }

  inZone(x, y, pad) {
    for (let i = this.zones.length - 1; i >= 0 && i >= this.zones.length - 4; i--) {
      const z = this.zones[i];
      if (x + pad > z.x0 && x - pad < z.x1 && y + pad > z.y0 && y - pad < z.y1) return true;
    }
    return false;
  }

  // A spot beside the path between `from` and `to` (outside the column the climb uses),
  // clear of platforms, hazards, doors, funnels and portals.
  clearSpot(from, to, rad, minY = -Infinity) {
    const r = this.rng;
    const x0 = Math.min(from.x - from.w / 2, to.x - to.w / 2) - 40;
    const x1 = Math.max(from.x + from.w / 2, to.x + to.w / 2) + 40;
    // Ten tries beside the column, then ten anywhere.
    for (let i = 0; i < 20; i++) {
      const x = r.range(C.WALL + rad + 8, C.W - C.WALL - rad - 8);
      const yMin = Math.max(to.y + rad + 30, minY);
      const yMax = from.y - rad - 40;
      if (yMax <= yMin) return null;
      const y = r.range(yMin, yMax);
      if (i < 10 && x + rad > x0 && x - rad < x1) continue;
      if (this.platformNear(x, y, rad + 30, rad + 40) || this.hazardNear(x, y, rad + 30, rad + 30)) continue;
      if (this.doorNear(y, rad + 60) !== null || this.inZone(x, y, rad + 10) || this.portalNear(x, y, rad * 3)) continue;
      return { x, y };
    }
    return null;
  }

  // Portals come in pairs: blue beside the path, yellow 17–33m higher. They only work one way,
  // blue to yellow, as a shortcut up. A pair never straddles a door.
  placePortals(from, to, wantNew) {
    const r = this.rng;
    const R = C.PORTAL_R;
    const pend = this.pendingPortal;
    if (pend) {
      if (to.y > pend.y) return;
      const spot = this.clearSpot(from, to, R + 14, pend.minY);
      if (!spot) {
        // No room for the exit within a few platforms: drop the blue portal instead.
        if (++pend.tries >= 4) {
          pend.blue.gone = true;
          this.pendingPortal = null;
        }
        return;
      }
      const yellow = this.addPortal({ color: 'yellow', ...spot, pair: pend.blue });
      pend.blue.pair = yellow;
      this.pendingPortal = null;
      return;
    }
    if (!wantNew) return;
    const spot = this.clearSpot(from, to, R + 14);
    if (!spot) return;
    let target = spot.y - r.range(700, 1300);
    let minY = -Infinity;
    const door = this.doorBetween(target, spot.y);
    if (door !== null) {
      target = door + 160;
      minY = door + 80;
      if (spot.y - target < 450) return;
    }
    const blue = this.addPortal({ color: 'blue', ...spot, pair: null });
    this.pendingPortal = { y: target, minY, blue, tries: 0 };
  }

  addPortal(pt) {
    this.portals.push(pt);
    this.portalGrid.add(pt, pt.y - C.PORTAL_R, pt.y + C.PORTAL_R);
    return pt;
  }

  portalNear(x, y, pad) {
    for (const pt of this.portalsIn(y - pad, y + pad, this.scratch)) if (Math.abs(pt.x - x) < pad && Math.abs(pt.y - y) < pad) return true;
    return false;
  }

  // y (px) of the lowest door strictly between y0 (higher) and y1 (lower), or null.
  doorBetween(y0, y1) {
    for (let n = 1; ; n++) {
      const dy = -doorHeight(n) * C.PX_PER_M;
      if (dy < y0) return null;
      if (dy < y1) return dy;
    }
  }

  // Runtime state: seenT starts the HEART_LIFE countdown, goneT the HEART_RESPAWN one.
  addHeart(from, to) {
    const r = this.itemRng;
    const roll = r.next();
    const x = r.range(C.WALL + 60, C.W - C.WALL - 60);
    const y = lerp(from.y, to.y, r.range(0.3, 0.8));
    const seed = Math.floor(r.range(0, 1e6));
    if (roll > C.HEART_CHANCE || this.hazardNear(x, y, 110, 90) || this.inZone(x, y, 60) || this.portalNear(x, y, 80)) return;
    const ht = { x, y, seed, seenT: null, gone: false, goneT: 0 };
    this.hearts.push(ht);
    this.heartGrid.add(ht, y - 60, y + 60);
  }

  // Optional ledge off to the side: a stepping stone or a place to land after a miss.
  addSideLedge(from, to) {
    const r = this.rng;
    const w = r.range(80, 140);
    const crumble = r.chance(0.3);
    const y = from.y - (from.y - to.y) * r.range(0.35, 0.7);
    const minC = C.WALL + w / 2 + 4;
    const maxC = C.W - C.WALL - w / 2 - 4;
    const mid = (from.x + to.x) / 2;
    const x = clamp(mid < C.W / 2 ? r.range(mid + 150, maxC) : r.range(minC, mid - 150), minC, maxC);
    if (this.hazardNear(x, y, w / 2 + 40, 70) || this.doorNear(y, 50) !== null) return;
    if (this.inZone(x, y, w / 2 + 20) || this.portalNear(x, y, w / 2 + 50)) return;
    this.addPlatform({ x, y, w, type: crumble ? 'crumble' : 'normal' });
  }

  // Spiky ball beside the path, never in the column between `from` and `to`.
  addSpike(from, to) {
    const r = this.rng;
    const x0 = Math.min(from.x - from.w / 2, to.x - to.w / 2) - 40;
    const x1 = Math.max(from.x + from.w / 2, to.x + to.w / 2) + 40;
    for (let i = 0; i < 8; i++) {
      const rad = r.range(16, 26);
      const amp = r.chance(C.SAW_CHANCE) ? r.range(40, 90) : 0;
      const x = r.range(C.WALL + rad + 8, C.W - C.WALL - rad - 8);
      const yMin = to.y + rad + amp + 20;
      const yMax = from.y - rad - amp - 40;
      if (yMax <= yMin) return;
      const y = r.range(yMin, yMax);
      if (x + rad > x0 && x - rad < x1) continue;
      if (this.platformNear(x, y, rad + 30, rad + amp + 60)) continue;
      if (this.doorNear(y, rad + amp + 70) !== null) continue;
      if (this.inZone(x, y, rad + amp + 30) || this.portalNear(x, y, rad + amp + 70)) continue;
      this.addHazard({ kind: amp ? 'saw' : 'spike', x, y, r: rad, amp, speed: TAU / r.range(2, 3.5), phase: r.range(0, TAU) });
      return;
    }
  }

  // Spikes on a wall segment: punishes careless bank shots.
  addWallSpikes(from, to) {
    const r = this.rng;
    const x0 = Math.min(from.x - from.w / 2, to.x - to.w / 2);
    const x1 = Math.max(from.x + from.w / 2, to.x + to.w / 2);
    const side = r.chance(0.5) ? -1 : 1;
    if (side < 0 ? x0 < C.WALL + 90 : x1 > C.W - C.WALL - 90) return;
    const span = from.y - to.y - 80;
    if (span < 100) return;
    const len = Math.min(span, r.range(110, 240));
    const y0 = to.y + 40 + r.range(0, span - len);
    if (this.doorNear(y0 + len / 2, len / 2 + 60) !== null) return;
    const wallX = side < 0 ? C.WALL : C.W - C.WALL;
    if (this.inZone(wallX, y0 + len / 2, len / 2 + 60)) return;
    for (const p of this.platformsIn(y0 - 40, y0 + len + 40, this.scratch)) {
      const px0 = p.x - p.w / 2 - (p.amp || 0);
      const px1 = p.x + p.w / 2 + (p.amp || 0);
      if (p.y > y0 - 40 && p.y < y0 + len + 40 && (side < 0 ? px0 < wallX + 50 : px1 > wallX - 50)) return;
    }
    this.addHazard({ kind: 'wall', side, y0, y1: y0 + len });
  }

  // y (px) of a door floor within `pad` of y, or null.
  doorNear(y, pad) {
    for (let n = 1; ; n++) {
      const dy = -doorHeight(n) * C.PX_PER_M;
      if (Math.abs(dy - y) < pad) return dy;
      if (dy < y - pad) return null;
    }
  }

  platformNear(x, y, padX, padY) {
    for (const p of this.platformsIn(y - padY, y + padY, this.scratch)) {
      const half = p.w / 2 + (p.amp || 0);
      if (Math.abs(p.y - y) < padY && x + padX > p.x - half && x - padX < p.x + half) return true;
    }
    return false;
  }

  hazardNear(x, y, padX, padY) {
    for (const hz of this.hazardsIn(y - padY - 120, y + padY + 120, this.scratch)) {
      if (hz.kind === 'wall') continue;
      if (Math.abs(hz.y - y) < padY + hz.r + hz.amp && Math.abs(hz.x - x) < padX + hz.r) return true;
    }
    return false;
  }
}
