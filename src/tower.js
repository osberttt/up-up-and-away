import * as C from './config.js';
import { Rng, hashString, noise1 } from './rng.js';
import { integrate } from './physics.js';

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

// A waiting bubble's position: drifting side to side.
export function bubblePos(t, time) {
  return [t.x + t.amp * Math.sin(time * t.speed + t.phase), t.y];
}

// A kite flying back and forth: [x, y] of the kite and [x, y] of the end of its tail.
export function kitePos(t, time) {
  const x = t.x + t.amp * Math.sin(time * t.speed + t.phase);
  const y = t.y - C.KITE_TAIL + 8 * Math.sin(time * 2.3 + t.phase);
  return [x, y, x + 6 * Math.sin(time * 4 + t.phase), y + C.KITE_TAIL];
}

// Where a kite carrying the player flies: ahead of it along its flight and a little above, the
// tail down to the player.
export function kiteTow(pl) {
  const v = Math.hypot(pl.vx, pl.vy) || 1;
  return [pl.x + (pl.vx / v) * 46, pl.y + (pl.vy / v) * 46 - C.KITE_TAIL * 0.7];
}

// Launch velocities of the kite and comet: fixed angles toward the middle of the screen (dir).
export const kiteShot = (dir) => [dir * Math.cos(C.KITE_ANGLE) * C.KITE_SHOT, -Math.sin(C.KITE_ANGLE) * C.KITE_SHOT];
export const cometShot = (dir) => [dir * Math.cos(C.COMET_ANGLE) * C.COMET_HIT, -Math.sin(C.COMET_ANGLE) * C.COMET_HIT];

// A wind gust's strength now (0.75..1): it breathes, but always lifts hard.
export function windGust(t, time) {
  return 0.875 + 0.125 * Math.sin(time * 1.8 + t.phase);
}

// Hearts drift around their spot on slow, smooth noise.
export function heartPos(ht, t) {
  const x = clamp(ht.x + 70 * noise1(ht.seed, t * 0.45), C.WALL + 24, C.W - C.WALL - 24);
  return [x, ht.y + 45 * noise1(ht.seed + 1, t * 0.4)];
}

// Height (px) a launch at `speed` rises before it peaks.
const riseOf = (speed) => (speed * speed) / (2 * C.GRAVITY);

// Where an element's launch from (x, y) at (vx, vy) tops out, flown with the game's own physics
// the way GameScene.launch does it (lighter gravity, scaled speed, wall bounces and all).
function flightPeak(x, y, vx, vy) {
  const k = Math.sqrt(C.LAUNCH_GRAVITY);
  const b = { x, y, vx: vx * k, vy: vy * k };
  for (let i = 0; i < 4000 && b.vy < 0; i++) integrate(b, 1 / 240, C.GRAVITY * C.LAUNCH_GRAVITY);
  return { x: b.x, y: b.y };
}

// A rail's track: a curve from its start (x, y) that dips sideways then sweeps up, as points
// with their running length. dir is 1 (to the right) or -1.
export function railTrack(x, y, dir) {
  const a = { x, y };
  const c = { x: x + dir * C.RAIL_ACROSS * 0.65, y: y + C.RAIL_DIP };
  const b = { x: x + dir * C.RAIL_ACROSS, y: y - C.RAIL_UP };
  const pts = [];
  const cum = [];
  let len = 0;
  for (let i = 0; i <= 24; i++) {
    const t = i / 24;
    const p = { x: (1 - t) ** 2 * a.x + 2 * (1 - t) * t * c.x + t * t * b.x, y: (1 - t) ** 2 * a.y + 2 * (1 - t) * t * c.y + t * t * b.y };
    if (i) len += Math.hypot(p.x - pts[i - 1].x, p.y - pts[i - 1].y);
    pts.push(p);
    cum.push(len);
  }
  // Direction off the end: the curve's tangent there (from the control point to the end).
  const tl = Math.hypot(b.x - c.x, b.y - c.y);
  return { pts, cum, len, exit: { x: (b.x - c.x) / tl, y: (b.y - c.y) / tl } };
}

// Point a distance `s` along a rail's track.
export function railAt(rail, s) {
  const { pts, cum } = rail;
  let i = 1;
  while (i < pts.length - 1 && cum[i] < s) i++;
  const k = clamp((s - cum[i - 1]) / (cum[i] - cum[i - 1] || 1), 0, 1);
  return { x: lerp(pts[i - 1].x, pts[i].x, k), y: lerp(pts[i - 1].y, pts[i].y, k) };
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
  // force (testing only): every chain element is this type, at any height.
  constructor(day, { force = null } = {}) {
    this.day = day;
    this.force = force;
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
    // Balloons, bubbles, planets and rails: { kind, ... }, all in one list.
    this.things = [];
    this.thingGrid = new Grid(600);
    // Zones: 'element' boxes around elements, and 'clear' boxes around each chain hop (peak to
    // next element). Elements avoid element zones; spikes and platforms avoid both.
    this.zoneGrid = new Grid(600);
    this.lastType = null; // the chain element placed last (see pickElement)
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

  thingsIn(y0, y1, out) {
    return this.thingGrid.query(y0, y1, out);
  }

  addThing(t, y0, y1) {
    t.readyT = 0; // runtime: when it can be used again
    this.things.push(t);
    this.thingGrid.add(t, y0, y1);
    return t;
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
    // Past the end it's space: nothing but the route, which only anchors the generator.
    const space = -y / C.PX_PER_M > C.END_HEIGHT;
    if (space) type = 'path';
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

    if (space) return;
    if (r.chance(C.SIDE_LEDGE_CHANCE)) this.addSideLedge(from, p);
    this.layChain(from, p);
    this.addWind(from, p);
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
      if (this.atStart(to.y) || -to.y / C.PX_PER_M >= C.END_HEIGHT || --this.chainBreak > 0) return;
      // Nothing unlocked yet at this height: no chain (progression, see ELEMENT_FROM).
      const first = this.pickElement(to.y);
      if (first === null) return;
      const spot = this.clearSpot(from, to, 60);
      if (!spot) return; // try again next step
      this.chain = { target: spot, type: first, left: Math.floor(r.range(C.CHAIN_LENGTH[0], C.CHAIN_LENGTH[1] + 1)) };
      this.chainStats.chains++;
    }
    // The planned spot may be several gaps up; lay it once the route reaches that height.
    while (this.chain && this.chain.target.y >= to.y) {
      const t = this.chain.target;
      // The planned type if it fits; otherwise another unlocked type, before the chain gives up.
      const ok = this.unlockedAt(t.y);
      const type = this.chain.type;
      let peak = this.placeElement(type, t);
      if (peak) this.lastType = type;
      // Newest unlocks first, so a fallback still feels like this stage.
      const alts = Object.keys(C.ELEMENT_FROM).filter((k) => k !== 'wind').sort((a, b) => C.ELEMENT_FROM[b] - C.ELEMENT_FROM[a]);
      for (const alt of alts) {
        if (peak || alt === type || !ok(alt)) continue;
        peak = this.placeElement(alt, t);
        if (peak) this.lastType = alt;
      }
      if (peak) this.chainStats.links++;
      else this.chainStats.failed++;
      if (!peak || --this.chain.left <= 0) {
        this.chain = null;
        this.chainBreak = Math.floor(r.range(C.CHAIN_BREAK[0], C.CHAIN_BREAK[1] + 1));
        if (peak) this.addPeakStar(peak);
        return;
      }
      this.addPeakStar(peak);
      // The next element is placed about at the peak's height, so pick by that.
      const nextType = this.pickElement(peak.y);
      if (nextType === null) {
        this.chain = null;
        this.chainBreak = Math.floor(r.range(C.CHAIN_BREAK[0], C.CHAIN_BREAK[1] + 1));
        return;
      }
      const next = this.hopFrom(peak, nextType);
      // Keep the hop from the peak to the next element free of spikes and platforms.
      this.addZone('clear', Math.min(peak.x, next.x) - 70, Math.min(peak.y, next.y) - 80, Math.max(peak.x, next.x) + 70, Math.max(peak.y, next.y) + 80);
      this.chain.target = next;
      this.chain.type = nextType;
    }
  }

  // A weighted pick among the chain elements unlocked at height y (px): each starts at full weight
  // when it unlocks and halves every ELEMENT_FADE m after, to at least ELEMENT_MIN_WEIGHT; the
  // one just used counts ELEMENT_REPEAT as much. Null if none is unlocked.
  pickElement(y) {
    if (this.force) return this.force;
    const m = -y / C.PX_PER_M;
    const types = [];
    let total = 0;
    for (const [type, from] of Object.entries(C.ELEMENT_FROM)) {
      if (type === 'wind' || m < from) continue;
      let w = Math.max(C.ELEMENT_MIN_WEIGHT, 0.5 ** ((m - from) / C.ELEMENT_FADE));
      if (type === this.lastType) w *= C.ELEMENT_REPEAT;
      types.push([type, w]);
      total += w;
    }
    if (!types.length) return null;
    let roll = this.rng.next() * total;
    for (const [type, w] of types) if ((roll -= w) <= 0) return type;
    return types[types.length - 1][0];
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
      const tries = {
        bouncy: this.tryBouncy,
        funnel: this.tryFunnel,
        elevator: this.tryElevator,
        portal: this.tryPortal,
        balloon: this.tryBalloon,
        bubble: this.tryBubble,
        planet: this.tryPlanet,
        rail: this.tryRail,
        kite: this.tryKite,
        comet: this.tryComet,
      };
      const peak = tries[type].call(this, x, y);
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
    return flightPeak(x, top, vx, vy);
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

  // Balloon (y is where you hang, at the end of the string). Floats you up `rise`, then lets go
  // with a push of BALLOON_EXIT.
  tryBalloon(x, y) {
    const top = y - C.BALLOON_STRING - 2 * C.BALLOON_R;
    if (!this.roomFor(x, (y + top) / 2, C.BALLOON_R + 10, (y - top) / 2 + 10)) return null;
    const rise = this.rng.range(...C.BALLOON_RISE);
    this.addThing({ kind: 'balloon', x, y, rise }, top - 20, y + 20);
    this.addZone('element', x - 50, top - 30, x + 50, y + 40);
    this.addZone('clear', x - 70, y - rise - 40, x + 70, y);
    return { x, y: y - rise - riseOf(C.BALLOON_EXIT) };
  }

  // Bubble (y is its middle). Floats you up `rise` unless you pop it sooner, then pushes you up
  // at BUBBLE_EXIT. The chain plans for a full ride.
  // The bubble drifts side to side (amp, within the walls); the chain plans from its middle.
  tryBubble(x, y) {
    const r = this.rng;
    const R = C.BUBBLE_R;
    const amp = Math.min(r.range(...C.BUBBLE_DRIFT), x - C.WALL - R - 10, C.W - C.WALL - R - 10 - x);
    if (amp < 20 || !this.roomFor(x, y, R + amp + 10, R + 10)) return null;
    const rise = r.range(...C.BUBBLE_RISE);
    const speed = TAU / r.range(...C.BUBBLE_SWAY);
    this.addThing({ kind: 'bubble', x, y, rise, amp, speed, phase: r.range(0, TAU) }, y - R - 20, y + R + 20);
    this.addZone('element', x - amp - R - 30, y - R - 30, x + amp + R + 30, y + R + 30);
    this.addZone('clear', x - amp - 70, y - rise - 40, x + amp + 70, y);
    return { x, y: y - rise - riseOf(C.BUBBLE_EXIT) };
  }

  // Planet (x, y is its middle). You circle it on its ring; left alone, it flings you straight up
  // from the side where the circling heads up: the left side when it spins clockwise (spin 1).
  tryPlanet(x, y) {
    const R = C.ORBIT_R + C.PLAYER_R;
    if (x - R < C.WALL + 6 || x + R > C.W - C.WALL - 6) return null;
    if (!this.roomFor(x, y, R, R)) return null;
    const spin = this.rng.chance(0.5) ? 1 : -1;
    this.addThing({ kind: 'planet', x, y, spin }, y - R - 20, y + R + 20);
    this.addZone('element', x - R - 20, y - R - 20, x + R + 20, y + R + 20);
    const rx = x + (spin > 0 ? -C.ORBIT_R : C.ORBIT_R);
    const peakY = y - riseOf(C.ORBIT_EXIT);
    this.addZone('clear', rx - 60, peakY, rx + 60, y);
    return { x: rx, y: peakY };
  }

  // Rail (x, y is the start of the track). It runs the way it fits (toward the middle when both
  // do) and flings you off the end along the track.
  tryRail(x, y) {
    const fitsRight = x + C.RAIL_ACROSS <= C.W - C.WALL - 20;
    const fitsLeft = x - C.RAIL_ACROSS >= C.WALL + 20;
    if (!fitsRight && !fitsLeft) return null;
    const dir = fitsRight && fitsLeft ? (x < C.W / 2 ? 1 : -1) : fitsRight ? 1 : -1;
    const track = railTrack(x, y, dir);
    const xs = track.pts.map((p) => p.x);
    const ys = track.pts.map((p) => p.y);
    const x0 = Math.min(...xs);
    const x1 = Math.max(...xs);
    const y0 = Math.min(...ys);
    const y1 = Math.max(...ys);
    if (x0 < C.WALL + 20 || x1 > C.W - C.WALL - 20) return null;
    if (!this.roomFor((x0 + x1) / 2, (y0 + y1) / 2, (x1 - x0) / 2 + 10, (y1 - y0) / 2 + 10)) return null;
    this.addThing({ kind: 'rail', x, y, dir, ...track }, y0 - 30, y1 + 30);
    this.addZone('element', x0 - 30, y0 - 30, x1 + 30, y1 + 30);
    // The flight off the end (you ride on top of the track), bounces off the walls included.
    const end = track.pts[track.pts.length - 1];
    const peak = flightPeak(end.x, end.y - C.PLAYER_R, track.exit.x * C.RAIL_EXIT, track.exit.y * C.RAIL_EXIT);
    this.addZone('clear', Math.min(end.x, peak.x) - 60, peak.y, Math.max(end.x, peak.x) + 60, end.y);
    return peak;
  }

  // Kite (x is the middle of its flight, y the end of its tail). Touching it carries you off at
  // KITE_ANGLE toward the middle of the screen from where you touched it; the chain plans from the
  // middle of its flight, so the real peak shifts sideways with where you caught it.
  tryKite(x, y) {
    const r = this.rng;
    const amp = Math.min(r.range(...C.KITE_SPAN), x - C.WALL - 40, C.W - C.WALL - 40 - x);
    if (amp < 60) return null;
    const top = y - C.KITE_TAIL - 30;
    if (!this.roomFor(x, (top + y) / 2, amp + 30, (y - top) / 2 + 10)) return null;
    const dir = x < C.W / 2 ? 1 : -1;
    this.addThing({ kind: 'kite', x, y, amp, dir, speed: TAU / r.range(...C.KITE_FLY), phase: r.range(0, TAU) }, top - 20, y + 30);
    this.addZone('element', x - amp - 40, top - 30, x + amp + 40, y + 30);
    const peak = flightPeak(x, y, ...kiteShot(dir));
    this.addZone('clear', Math.min(x, peak.x) - 60, peak.y, Math.max(x, peak.x) + 60, y);
    return peak;
  }

  // Comet: an electric field (x, y is its middle). It traps you there, then the comet hits you
  // off at COMET_ANGLE toward the middle of the screen.
  tryComet(x, y) {
    const R = C.FIELD_R + 10;
    if (x - R < C.WALL || x + R > C.W - C.WALL) return null;
    if (!this.roomFor(x, y, R, R)) return null;
    const dir = x < C.W / 2 ? 1 : -1;
    this.addThing({ kind: 'comet', x, y, dir }, y - R - 20, y + R + 400);
    this.addZone('element', x - R - 20, y - R - 20, x + R + 20, y + R + 20);
    const peak = flightPeak(x, y, ...cometShot(dir));
    this.addZone('clear', Math.min(x, peak.x) - 60, peak.y, Math.max(x, peak.x) + 60, y);
    return peak;
  }

  // Wind gust: an updraft column between `from` and `to`, beside the route or across it.
  addWind(from, to) {
    const r = this.rng;
    if (!this.unlockedAt(to.y)('wind') || this.atStart(from.y - 200) || -to.y / C.PX_PER_M >= C.END_HEIGHT || !r.chance(C.WIND_CHANCE)) return;
    const w = r.range(...C.WIND_W);
    const h = r.range(...C.WIND_H);
    const x = r.range(C.WALL + w / 2 + 10, C.W - C.WALL - w / 2 - 10);
    const y1 = lerp(from.y, to.y, r.range(0.1, 0.4));
    const y0 = y1 - h;
    if (this.doorNear((y0 + y1) / 2, h / 2 + 40) !== null || this.inZone(x, (y0 + y1) / 2, Math.max(w, h) / 2, 'element')) return;
    this.addThing({ kind: 'wind', x, y: (y0 + y1) / 2, w, y0, y1, phase: r.range(0, TAU) }, y0 - 10, y1 + 10);
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

  // One pattern per gap from the spike bag, plus a loose extra spike now and then. Higher up it
  // gets harder: breathers fill in, some gaps get a second pattern, extras get likelier.
  placeSpikes(from, to) {
    const r = this.rng;
    const d = this.spikeLevel(to.y);
    const at = (range) => lerp(range[0], range[1], d);
    let pattern = this.spikeBag.next();
    if (pattern === 'none' && r.chance(at(C.SPIKE_FILL))) pattern = this.spikeBag.next((p) => p !== 'none');
    this.placePattern(from, to, pattern);
    if (r.chance(at(C.SPIKE_DOUBLE))) this.placePattern(from, to, this.spikeBag.next((p) => p !== 'none'));
    if (r.chance(at(C.SPIKE_EXTRA))) this.addSpike(from, to, { rad: [14, 24] });
  }

  // 0 at the ground to 1 at END_HEIGHT: how hard the spikes are here.
  spikeLevel(y) {
    return clamp(-y / C.PX_PER_M / C.END_HEIGHT, 0, 1);
  }

  placePattern(from, to, pattern) {
    const r = this.rng;
    switch (pattern) {
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
      const hz = { kind: amp ? 'saw' : 'spike', x, y, r: rad, amp, axis, speed: (TAU / r.range(2, 3.5)) * lerp(C.SAW_SPEED[0], C.SAW_SPEED[1], this.spikeLevel(y)), phase: r.range(0, TAU) };
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
    // The last door is the end; space has none.
    while (-doorHeight(next) * C.PX_PER_M >= y && doorHeight(next) <= C.END_HEIGHT) {
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
