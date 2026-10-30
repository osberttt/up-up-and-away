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

// Saws swing along their axis ('y' up and down, 'x' side to side).
export function hazardPos(hz, t) {
  if (!hz.amp) return [hz.x, hz.y];
  const s = hz.amp * Math.sin(t * hz.speed + hz.phase);
  return hz.axis === 'x' ? [hz.x + s, hz.y] : [hz.x, hz.y + s];
}

// Path [x0, y0, x1, y1] through a funnel's tube. The funnel's mouth is at y and faces down;
// the cone narrows into a straight tube that rises from it, open at the top, where you get fired out.
export function funnelTube(x, y) {
  const neck = y - C.FUNNEL_D;
  return [x, neck, x, neck - C.FUNNEL_TUBE];
}

// How far (px, negative is up) an elevator is above its resting spot at time t: it moves off at
// once (the linear part) and surges harder and harder to the top (the cubic part), then eases
// back down after it fires you out.
export function elevatorOffset(e, t) {
  if (e.rideT != null) {
    const k = Math.min(1, (t - e.rideT) / C.ELEV_TIME);
    return -e.rise * (0.3 * k + 0.7 * k * k * k);
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

// Height (px) a launch at `speed` rises before it peaks.
const riseOf = (speed) => (speed * speed) / (2 * C.GRAVITY);

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

// A shuffle bag: deals every item once in a random order, then reshuffles. Keeps a mix varied
// without long streaks or droughts.
class Bag {
  constructor(rng, items) {
    this.rng = rng;
    this.items = items;
    this.left = [];
  }

  refill() {
    this.left = [...this.items];
    for (let i = this.left.length - 1; i > 0; i--) {
      const j = Math.floor(this.rng.next() * (i + 1));
      [this.left[i], this.left[j]] = [this.left[j], this.left[i]];
    }
  }

  // The next item that passes `ok` (all items by default), or null if none can. Items that
  // don't pass stay in the bag for later.
  peek(ok = () => true) {
    for (let pass = 0; pass < 2; pass++) {
      for (let i = this.left.length - 1; i >= 0; i--) if (ok(this.left[i])) return this.left[i];
      if (!this.items.some(ok)) return null;
      this.refill();
    }
    return null;
  }

  next(ok = () => true) {
    const item = this.peek(ok);
    if (item !== null) this.left.splice(this.left.lastIndexOf(item), 1);
    return item;
  }
}

// The day's tower. Generation is sequential from the date seed, so every player gets the
// same platforms and a reload rebuilds the exact tower (platform ids stay stable for saves).
//
// Path-first: a route of points goes up the tower, each inside the reach of a launch from the
// previous one; some become platforms. Spikes keep out of a corridor along that route.
// Elements come in planned chains: each is placed where the previous one's launch peaks.
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
    // Hearts and loose stars use their own stream so they never change the rest of the tower.
    this.itemRng = new Rng(this.seed ^ 0x5bd1e995);
    this.stars = [];
    this.starGrid = new Grid(600);
    this.funnels = [];
    this.funnelGrid = new Grid(600);
    this.elevators = [];
    this.elevGrid = new Grid(600);
    this.portals = [];
    this.portalGrid = new Grid(600);
    // Zones: 'element' boxes around elements, and 'clear' boxes around each chain hop (peak to
    // next element). Elements avoid element zones; spikes and platforms avoid both.
    this.zoneGrid = new Grid(600);
    this.elementBag = new Bag(this.rng, C.ELEMENT_BAG);
    this.spikeBag = new Bag(this.rng, C.SPIKE_BAG);
    this.chain = null; // { target: {x, y}, left } while a chain is being laid out
    this.chainBreak = 1; // path steps until the next chain starts
    this.chainStats = { chains: 0, links: 0, failed: 0 }; // for the verify script
    this.count = 0;
    this.doors = []; // doors[n] is the full-width floor at doorHeight(n)
    this.scratch = [];
    this.zoneScratch = [];
    this.lastMain = this.addPlatform({ x: C.W / 2, y: 0, w: C.W, type: 'ground' });
    // The start, where the tutorial text is, stays empty: no platforms, spikes or ledges.
    this.addZone('clear', 0, -C.START_CLEAR, C.W, 50);
  }

  // Within the empty start area?
  atStart(y) {
    return y > -C.START_CLEAR;
  }

  // A test for element types unlocked at height y (px): progression, see ELEMENT_FROM.
  unlockedAt(y) {
    const m = -y / C.PX_PER_M;
    return (type) => m >= C.ELEMENT_FROM[type];
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
    else {
      const ampY = hz.axis === 'x' ? 0 : hz.amp;
      this.hazGrid.add(hz, hz.y - hz.r - ampY, hz.y + hz.r + ampY);
    }
  }

  addZone(kind, x0, y0, x1, y1) {
    const z = { kind, x0, y0, x1, y1 };
    this.zoneGrid.add(z, y0, y1);
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

    // Vertical gap and how far sideways the next point may sit. A launch reaches
    // horizontally 2·sqrt(P·(P−dy)) at height dy; we only use a fraction of that.
    let dy, reach;
    if (tier === 'hard') {
      // Above a single launch's peak: needs a second, mid-air fling.
      dy = P * r.range(1.0, 1.3);
      reach = 2 * Math.sqrt(P * (P - (dy - P * 0.85))) * 0.55;
    } else {
      dy = P * (tier === 'easy' ? r.range(0.28, 0.5) : r.range(0.5, 0.78));
      reach = 2 * Math.sqrt(P * (P - dy)) * (tier === 'easy' ? 0.5 : 0.7);
    }

    const w = r.range(150, 250);
    let type = 'normal';
    const roll = r.next();
    if (roll < 0.22) type = 'moving';
    else if (roll < 0.42) type = 'crumble';
    // Many route points stay empty air.
    if (!r.chance(C.PLATFORM_CHANCE)) type = 'path';

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

    // A platform never sits on an element or across a chain hop: it stays a route point.
    if (type !== 'path' && this.inZone(x, y, w / 2, 'any')) type = 'path';
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
    if (p.type !== 'path') this.addPlatform(p);
    this.lastMain = p;

    if (r.chance(C.SIDE_LEDGE_CHANCE)) this.addSideLedge(from, p);
    this.layChain(from, p);
    this.placeSpikes(from, p);
    this.addHeart(from, p);
    this.addStar(from, p);
  }

  // ---------------------------------------------------------------- element chains

  // Lays out elements whose planned spot this gap has reached. Between chains, waits a few
  // route steps, then starts a new chain beside the route.
  layChain(from, to) {
    const r = this.rng;
    if (!this.chain) {
      if (this.atStart(to.y) || --this.chainBreak > 0) return;
      // Nothing unlocked yet at this height: no chain (progression, see ELEMENT_FROM).
      if (this.elementBag.peek(this.unlockedAt(to.y)) === null) return;
      const spot = this.clearSpot(from, to, 60);
      if (!spot) return; // try again next step
      this.chain = { target: spot, left: Math.floor(r.range(C.CHAIN_LENGTH[0], C.CHAIN_LENGTH[1] + 1)) };
      this.chainStats.chains++;
    }
    // The planned spot may be several gaps up; lay it once the route reaches that height.
    while (this.chain && this.chain.target.y >= to.y) {
      const t = this.chain.target;
      // The bag's pick if it fits; otherwise another unlocked type, before the chain gives up.
      const ok = this.unlockedAt(t.y);
      const type = this.elementBag.next(ok);
      let peak = type && this.placeElement(type, t);
      for (const alt of ['funnel', 'portal', 'bouncy', 'elevator']) if (!peak && alt !== type && ok(alt)) peak = this.placeElement(alt, t);
      if (peak) this.chainStats.links++;
      else this.chainStats.failed++;
      if (!peak || --this.chain.left <= 0) {
        this.chain = null;
        this.chainBreak = Math.floor(r.range(C.CHAIN_BREAK[0], C.CHAIN_BREAK[1] + 1));
        if (peak) this.addPeakStar(peak);
        return;
      }
      this.addPeakStar(peak);
      // The next element is placed about at the peak's height, so unlock by that.
      const nextType = this.elementBag.peek(this.unlockedAt(peak.y));
      if (nextType === null) {
        this.chain = null;
        this.chainBreak = Math.floor(r.range(C.CHAIN_BREAK[0], C.CHAIN_BREAK[1] + 1));
        return;
      }
      const next = this.hopFrom(peak, nextType);
      // Keep the hop from the peak to the next element free of spikes and platforms.
      this.addZone('clear', Math.min(peak.x, next.x) - 70, Math.min(peak.y, next.y) - 80, Math.max(peak.x, next.x) + 70, Math.max(peak.y, next.y) + 80);
      this.chain.target = next;
    }
  }

// Where the next element goes, given the peak of the last launch and the next element's type:
  // sideways by CHAIN_DX, and CHAIN_DY above the peak (about half a screen), so it comes into
  // view as you top out and one jump reaches it.
  hopFrom(peak, type) {
    const r = this.rng;
    let dx = (r.chance(0.5) ? -1 : 1) * r.range(...C.CHAIN_DX);
    if (peak.x + dx < C.WALL + 100 || peak.x + dx > C.W - C.WALL - 100) dx = -dx;
    let dy = -r.range(...C.CHAIN_DY[type]);
    if (type === 'elevator') dy += C.ELEV_DEPTH; // CHAIN_DY is to the rim; y is its floor
    return { x: clamp(peak.x + dx, C.WALL + 90, C.W - C.WALL - 90), y: peak.y + dy };
  }

  // Places an element at (or near) the spot. Returns where its launch peaks, or null if no room.
  placeElement(type, t) {
    const r = this.rng;
    for (let i = 0; i < 8; i++) {
      const x = clamp(t.x + (i ? r.range(-90, 90) : 0), C.WALL + 90, C.W - C.WALL - 90);
      const y = t.y + (i ? r.range(-60, 60) : 0);
      const peak = type === 'bouncy' ? this.tryBouncy(x, y) : type === 'funnel' ? this.tryFunnel(x, y) : type === 'elevator' ? this.tryElevator(x, y) : this.tryPortal(x, y);
      if (peak) return peak;
    }
    return null;
  }

  // Room for an element's box: no platform, spike, door, portal or other element in it.
  roomFor(x, y, halfW, halfH) {
    if (this.atStart(y + halfH)) return false;
    if (this.platformNear(x, y, halfW + 30, halfH + 30) || this.hazardNear(x, y, halfW + 20, halfH + 20)) return false;
    return this.doorNear(y, halfH + 70) === null && !this.portalNear(x, y, halfW + 50) && !this.inZone(x, y, Math.max(halfW, halfH), 'element');
  }

  // Clear air above an element you drop onto (from `top` up ELEMENT_HEADROOM): no platform there
  // now, and a zone so none is placed there later.
  headroom(x, top, halfW) {
    const h = C.ELEMENT_HEADROOM;
    if (this.platformNear(x, top - h / 2, halfW + 30, h / 2)) return false;
    this.addZone('clear', x - halfW - 40, top - h, x + halfW + 40, top);
    return true;
  }

  // Bouncy pad (y is the pad's top). Bounces at least BOUNCE_MIN straight up.
  tryBouncy(x, y) {
    const w = this.rng.range(110, 150);
    if (!this.roomFor(x, y + 15, w / 2, 35) || !this.headroom(x, y, w / 2)) return null;
    this.addPlatform({ x, y, w, type: 'bouncy' });
    this.addZone('element', x - w / 2 - 30, y - 60, x + w / 2 + 30, y + 50);
    return { x, y: y - C.PLAYER_R - riseOf(C.BOUNCE_MIN) };
  }

  // Funnel (y is the mouth): fires you up its tube, leaning toward the middle.
  tryFunnel(x, y) {
    const r = this.rng;
    const half = C.FUNNEL_W / 2;
    const top = y - C.FUNNEL_D - C.FUNNEL_TUBE;
    const cy = (y + top) / 2;
    if (!this.roomFor(x, cy, half, (y - top) / 2)) return null;
    const rise = r.range(...C.FUNNEL_RISE);
    const side = x < C.W / 2 ? 1 : -1;
    const vx = side * r.range(60, 180);
    const vy = -Math.sqrt(2 * C.GRAVITY * rise);
    const f = { x, y, side, tube: funnelTube(x, y), vx, vy };
    this.funnels.push(f);
    this.funnelGrid.add(f, top - 30, y + 10);
    this.addZone('element', x - half - 40, top - 40, x + half + 40, y + 40);
    const px = clamp(x + vx * (-vy / C.GRAVITY), C.WALL + 60, C.W - C.WALL - 60);
    return { x: px, y: top - rise };
  }

  // Elevator (y is the bottom of its floor): rides up `rise`, then fires you at ELEV_LAUNCH.
  tryElevator(x, y) {
    const outer = C.ELEV_INNER / 2 + C.ELEV_WALL;
    if (!this.roomFor(x, y - C.ELEV_DEPTH / 2, outer, C.ELEV_DEPTH / 2) || !this.headroom(x, y - C.ELEV_DEPTH, outer)) return null;
    const rise = this.rng.range(...C.ELEV_RISE);
    const e = { x, y, rise, rideT: null, backT: null };
    // The floor inside the U, which you land on like a platform (not in the platform list).
    e.floor = { x, y: y - C.ELEV_WALL, w: C.ELEV_INNER, type: 'elevator', elev: e, crumbleAt: null };
    this.elevators.push(e);
    // Indexed over its whole travel so it's found (and drawn) while it rides.
    this.elevGrid.add(e, y - C.ELEV_DEPTH - rise - 20, y + 20);
    this.addZone('element', x - outer - 30, y - C.ELEV_DEPTH - 40, x + outer + 30, y + 40);
    const launchY = y - C.ELEV_WALL - C.PLAYER_R - rise;
    return { x, y: launchY - riseOf(C.ELEV_LAUNCH) };
  }

  // Portal pair: blue here, yellow PORTAL_SPAN higher (never across a door). You leave the
  // yellow one straight up at PORTAL_EXIT.
  tryPortal(x, y) {
    const r = this.rng;
    const R = C.PORTAL_R + 14;
    if (!this.roomFor(x, y, R, R)) return null;
    let ey = y - r.range(...C.PORTAL_SPAN);
    const door = this.doorBetween(ey, y);
    if (door !== null) {
      ey = door + 160;
      if (y - ey < 400) return null;
    }
    let ex = null;
    for (let i = 0; i < 8 && ex === null; i++) {
      const cx = r.range(C.WALL + 90, C.W - C.WALL - 90);
      if (Math.abs(cx - x) > 60 && this.roomFor(cx, ey, R, R)) ex = cx;
    }
    if (ex === null) return null;
    const blue = this.addPortal({ color: 'blue', x, y, pair: null });
    const yellow = this.addPortal({ color: 'yellow', x: ex, y: ey, pair: blue });
    blue.pair = yellow;
    this.addZone('element', x - R - 30, y - R - 30, x + R + 30, y + R + 30);
    this.addZone('element', ex - R - 30, ey - R - 30, ex + R + 30, ey + R + 30);
    // The rise out of the yellow portal is part of the chain; keep it clear too.
    this.addZone('clear', ex - 60, ey - riseOf(C.PORTAL_EXIT), ex + 60, ey);
    return { x: ex, y: ey - riseOf(C.PORTAL_EXIT) };
  }

  // A star at the top of each launch: shows where you'll be, and pays for riding it out.
  addPeakStar(peak) {
    const st = { x: clamp(peak.x, C.WALL + 30, C.W - C.WALL - 30), y: peak.y };
    this.stars.push(st);
    this.starGrid.add(st, st.y - 20, st.y + 20);
  }

  addPortal(pt) {
    this.portals.push(pt);
    this.portalGrid.add(pt, pt.y - C.PORTAL_R, pt.y + C.PORTAL_R);
    return pt;
  }

  // ---------------------------------------------------------------- spikes

  // One pattern per gap from the spike bag, plus a loose extra spike now and then.
  placeSpikes(from, to) {
    const r = this.rng;
    switch (this.spikeBag.next()) {
      case 'spike':
        this.addSpike(from, to, { rad: [14, 22] });
        break;
      case 'big':
        this.addSpike(from, to, { rad: [26, 34] });
        break;
      case 'saw':
        this.addSpike(from, to, { rad: [16, 24], amp: [40, 90], axis: 'y' });
        break;
      case 'sawX':
        this.addSpike(from, to, { rad: [16, 22], amp: [40, 80], axis: 'x' });
        break;
      case 'pair': {
        // A gate: one spike each side of the route, at the same height.
        const y = lerp(from.y, to.y, r.range(0.3, 0.7));
        const px = this.pathX(from, to, y);
        const rad = r.range(16, 22);
        const gap = C.SPIKE_CORRIDOR + rad + r.range(10, 50);
        this.addSpike(from, to, { at: { x: px - gap, y }, rad: [rad, rad] });
        this.addSpike(from, to, { at: { x: px + gap, y }, rad: [rad, rad] });
        break;
      }
      case 'row': {
        // Three small spikes in a diagonal line, on one side of the route.
        const y = lerp(from.y, to.y, r.range(0.25, 0.6));
        const px = this.pathX(from, to, y);
        const side = px < C.W / 2 ? 1 : -1;
        const x0 = px + side * (C.SPIKE_CORRIDOR + r.range(40, 90));
        const dx = side * r.range(35, 55);
        const dy = -r.range(40, 60);
        for (let i = 0; i < 3; i++) this.addSpike(from, to, { at: { x: x0 + dx * i, y: y + dy * i }, rad: [13, 17] });
        break;
      }
      case 'wall':
        this.addWallSpikes(from, to);
        break;
      // 'none': a breather
    }
    if (r.chance(C.SPIKE_EXTRA)) this.addSpike(from, to, { rad: [14, 24] });
  }

  // x of the route line from `from` to `to` at height y.
  pathX(from, to, y) {
    return lerp(from.x, to.x, clamp((from.y - y) / (from.y - to.y), 0, 1));
  }

  // A spiky ball (or saw) anywhere across the width, or at `at`, except in a corridor
  // (SPIKE_CORRIDOR each side) along the route line, so the route always has a gap through.
  // Also kept off platforms, doors, portals, elements and chain hops.
  addSpike(from, to, { rad: radR = [16, 26], amp: ampR = null, axis = 'y', at = null } = {}) {
    const r = this.rng;
    for (let i = 0; i < (at ? 1 : 8); i++) {
      const rad = r.range(...radR);
      const amp = ampR ? r.range(...ampR) : 0;
      const ax = axis === 'x' ? amp : 0;
      const ay = axis === 'x' ? 0 : amp;
      const x = at ? at.x : r.range(C.WALL + rad + ax + 8, C.W - C.WALL - rad - ax - 8);
      const yMin = to.y + rad + ay + 20;
      const yMax = from.y - rad - ay - 40;
      if (yMax <= yMin) return null;
      const y = at ? at.y : r.range(yMin, yMax);
      if (x - rad - ax < C.WALL + 4 || x + rad + ax > C.W - C.WALL - 4 || y < yMin || y > yMax) continue;
      // Distance to the route over the whole sweep.
      const near = Math.min(...[-1, 0, 1].map((k) => Math.abs(x + k * ax - this.pathX(from, to, y + k * ay))));
      if (near < C.SPIKE_CORRIDOR + rad) continue;
      if (this.platformNear(x, y, rad + ax + 30, rad + ay + 60)) continue;
      if (this.doorNear(y, rad + ay + 70) !== null) continue;
      if (this.inZone(x, y, rad + Math.max(ax, ay) + 20, 'any') || this.portalNear(x, y, rad + Math.max(ax, ay) + 70)) continue;
      const hz = { kind: amp ? 'saw' : 'spike', x, y, r: rad, amp, axis, speed: TAU / r.range(2, 3.5), phase: r.range(0, TAU) };
      this.addHazard(hz);
      return hz;
    }
    return null;
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
    if (this.inZone(wallX, y0 + len / 2, len / 2 + 60, 'any')) return;
    for (const p of this.platformsIn(y0 - 40, y0 + len + 40, this.scratch)) {
      const px0 = p.x - p.w / 2 - (p.amp || 0);
      const px1 = p.x + p.w / 2 + (p.amp || 0);
      if (p.y > y0 - 40 && p.y < y0 + len + 40 && (side < 0 ? px0 < wallX + 50 : px1 > wallX - 50)) return;
    }
    this.addHazard({ kind: 'wall', side, y0, y1: y0 + len });
  }

  // ---------------------------------------------------------------- items & ledges

  // Doors are added as generation passes them, so their platform ids stay deterministic.
  addDoorsUpTo(y) {
    let next = this.doors.length || 1;
    while (-doorHeight(next) * C.PX_PER_M >= y) {
      this.doors[next] = this.addPlatform({ x: C.W / 2, y: -doorHeight(next) * C.PX_PER_M, w: C.W - 2 * C.WALL, type: 'door', n: next });
      next++;
    }
  }

  // Runtime state: seenT starts the HEART_LIFE countdown, goneT the HEART_RESPAWN one.
  addHeart(from, to) {
    const r = this.itemRng;
    const roll = r.next();
    const x = r.range(C.WALL + 60, C.W - C.WALL - 60);
    const y = lerp(from.y, to.y, r.range(0.3, 0.8));
    const seed = Math.floor(r.range(0, 1e6));
    if (roll > C.HEART_CHANCE || this.atStart(y + 60) || this.hazardNear(x, y, 110, 90) || this.inZone(x, y, 60, 'element') || this.portalNear(x, y, 80)) return;
    const ht = { x, y, seed, seenT: null, gone: false, goneT: 0 };
    this.hearts.push(ht);
    this.heartGrid.add(ht, y - 60, y + 60);
  }

  // Loose stars (points only) hang along the route, so collecting them means flying it.
  addStar(from, to) {
    const r = this.itemRng;
    const roll = r.next();
    const x = clamp(lerp(from.x, to.x, r.range(0.2, 0.8)) + r.range(-80, 80), C.WALL + 30, C.W - C.WALL - 30);
    const y = lerp(from.y, to.y, r.range(0.3, 0.8));
    if (roll > C.STAR_CHANCE || this.atStart(y + 20)) return;
    if (this.hazardNear(x, y, 40, 40) || this.inZone(x, y, 30, 'element') || this.portalNear(x, y, 70) || this.platformNear(x, y, 30, 40)) return;
    const st = { x, y };
    this.stars.push(st);
    this.starGrid.add(st, y - 20, y + 20);
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
    if (this.inZone(x, y, w / 2 + 20, 'any') || this.portalNear(x, y, w / 2 + 50)) return;
    this.addPlatform({ x, y, w, type: crumble ? 'crumble' : 'normal' });
  }

  // ---------------------------------------------------------------- queries

  // A spot beside the route between `from` and `to` (outside the column the climb uses),
  // clear of platforms, hazards, doors, elements and portals.
  clearSpot(from, to, rad) {
    const r = this.rng;
    const x0 = Math.min(from.x - from.w / 2, to.x - to.w / 2) - 40;
    const x1 = Math.max(from.x + from.w / 2, to.x + to.w / 2) + 40;
    // Ten tries beside the column, then ten anywhere.
    for (let i = 0; i < 20; i++) {
      const x = r.range(C.WALL + rad + 8, C.W - C.WALL - rad - 8);
      const yMin = to.y + rad + 30;
      const yMax = from.y - rad - 40;
      if (yMax <= yMin) return null;
      const y = r.range(yMin, yMax);
      if (i < 10 && x + rad > x0 && x - rad < x1) continue;
      if (this.platformNear(x, y, rad + 30, rad + 40) || this.hazardNear(x, y, rad + 30, rad + 30)) continue;
      if (this.doorNear(y, rad + 60) !== null || this.inZone(x, y, rad + 10, 'element') || this.portalNear(x, y, rad * 3)) continue;
      return { x, y };
    }
    return null;
  }

  // Is the box (x, y) ± pad inside a zone? kind 'element' checks element zones only, 'any' all.
  inZone(x, y, pad, kind) {
    for (const z of this.zoneGrid.query(y - pad, y + pad, this.zoneScratch)) {
      if (kind === 'element' && z.kind !== 'element') continue;
      if (x + pad > z.x0 && x - pad < z.x1 && y + pad > z.y0 && y - pad < z.y1) return true;
    }
    return false;
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
      const ax = hz.axis === 'x' ? hz.amp : 0;
      const ay = hz.axis === 'x' ? 0 : hz.amp;
      if (Math.abs(hz.y - y) < padY + hz.r + ay && Math.abs(hz.x - x) < padX + hz.r + ax) return true;
    }
    return false;
  }
}
