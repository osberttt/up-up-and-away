import Phaser from 'phaser';
import * as C from './config.js';
import { Tower, platformX, hazardPos, heartPos, doorHeight, nextDoorIndex, elevatorOffset, elevatorIdle } from './tower.js';
import { integrate, substeps, launchSpeed, previewPath, MIN_X, MAX_X } from './physics.js';
import { dayKey } from './rng.js';
import * as Save from './save.js';
import { sfx, unlockAudio, setMuted, buzz } from './audio.js';
import { drawWorld, palette, portalColor, hex, tint } from './draw.js';
import { Hud, Menu, label } from './ui.js';

const STEP = 1 / 120;
const clamp = Phaser.Math.Clamp;

export class GameScene extends Phaser.Scene {
  constructor() {
    super('game');
  }

  create() {
    this.day = dayKey();
    this.save = Save.load(this.day);
    setMuted(this.save.muted);
    this.tower = new Tower(this.day);

    this.simT = 0;
    this.runT = 0; // seconds of real time in this run, reset by a death
    this.acc = 0;
    this.timeScale = 1;
    this.paused = false;
    this.drag = null;
    this.dirty = false;
    this.lastSave = 0;
    this.particles = [];
    this.portalFx = [];
    this.trail = [];
    this.preview = [];
    this.near = [];
    this.drawPlats = [];
    this.drawHaz = [];
    this.drawHearts = [];
    this.drawFunnels = [];
    this.drawPortals = [];
    this.drawStars = [];
    this.drawElevs = [];
    this.nearItems = [];
    this.nearHearts = [];

    const R = C.PLAYER_R;
    this.player = {
      x: C.W / 2,
      y: -R,
      vx: 0,
      vy: 0,
      ground: this.tower.platforms[0],
      offset: 0,
      jumpCd: 0, // seconds until the next jump is allowed
      hp: C.MAX_HP,
      dead: 0, // seconds left before respawning
      funnel: null, // { f, pts, seg, along } while sliding through a funnel
      portalT: 0, // portal cooldown
      warp: null, // { to, x0, y0, x1, y1, t, ang } while flying between portals
      elevator: null, // the elevator carrying you
      launched: false, // rising from an element's launch: invincible, platforms one-way
      hitT: 0,
      squash: 0,
      fromY: -R, // where the current flight started, to measure falls
    };
    if (import.meta.env?.DEV) this.devStart();
    this.height = this.heightOf(this.player.y);
    this.nextDoor = nextDoorIndex(this.save.best);
    this.newRun();
    this.colTo = this.colFrom = this.col = palette(this.tower, this.runDoor - 1);
    this.colT = 0;

    const cam = this.cameras.main;
    cam.setZoom(C.RES).setOrigin(0, 0);
    cam.scrollY = this.cameraTarget();

    this.bgG = this.add.graphics().setScrollFactor(0);
    this.g = this.add.graphics();
    this.markerTexts = Array.from({ length: 8 }, () => label(this, 0, 0, '', 14, 0.3, false).setOrigin(0, 0.5));
    this.bestText = label(this, 0, 0, '', 14, 0.8, false).setOrigin(1, 1);
    this.doorTexts = Array.from({ length: 3 }, () => label(this, 0, 0, '', 15, 0.6, false));
    this.hud = new Hud(this);
    this.menu = new Menu(this);
    this.tutorialTexts = this.addTutorial();

    this.setupInput();
    this.setupLifecycle();
  }

  // ---------------------------------------------------------------- setup

  // No title card: the game starts right away. The texts live in the world, just above the ground.
  addTutorial() {
    const text = (y, s) => label(this, C.W / 2, y, s, 21, 0.85, false).setWordWrapWidth(C.W - 120).setLineSpacing(4);
    return [
      text(-170, 'drag anywhere and release it\nto shoot the blob up'),
      text(-560, 'drag again in the air\nto keep going up'),
    ];
  }

  // Dev only: ?at=300 starts on the platform nearest 300m, for testing things up the tower.
  devStart() {
    const params = new URLSearchParams(location.search);
    const at = Number(params.get('at'));
    if (!at) return;
    const y = -at * C.PX_PER_M;
    this.tower.ensureUpTo(y - C.H);
    let best = null;
    for (const p of this.tower.platforms) if (p.type !== 'bouncy' && !p.amp && (!best || Math.abs(p.y - y) < Math.abs(best.y - y))) best = p;
    const pl = this.player;
    Object.assign(pl, { ground: best, offset: 0, x: best.x, y: best.y - C.PLAYER_R });
    pl.fromY = pl.y;
  }

  setupInput() {
    const toLogical = (p) => ({ x: p.x / C.RES, y: p.y / C.RES });

    this.input.on('pointerdown', (pointer, over) => {
      unlockAudio();
      if (this.paused || over.length) return;
      const { x, y } = toLogical(pointer);
      this.drag = { sx: x, sy: y, x, y, t: 0 };
    });
    this.input.on('pointermove', (pointer) => {
      if (!this.drag) return;
      const { x, y } = toLogical(pointer);
      this.drag.x = x;
      this.drag.y = y;
    });
    const release = (pointer) => {
      if (!this.drag) return;
      const { x, y } = toLogical(pointer);
      this.drag.x = x;
      this.drag.y = y;
      const aim = this.aim();
      this.drag = null;
      if (aim && !this.paused) this.tryLaunch(aim);
    };
    this.input.on('pointerup', release);
    this.input.on('pointerupoutside', release);
    this.input.keyboard?.on('keydown-ESC', () => (this.paused ? this.menu.close() : this.menu.open()));
  }

  setupLifecycle() {
    // Save when the tab is hidden or closed; when it comes back on a new day, load the new tower.
    const onVisibility = () => {
      if (document.hidden) this.persist();
      else if (dayKey() !== this.day) {
        this.persist();
        this.scene.restart();
      }
    };
    const onHide = () => this.persist();
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('pagehide', onHide);
    this.events.once('shutdown', () => {
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('pagehide', onHide);
    });
  }

  // Score is per run: page load or a death starts a new one.
  newRun() {
    this.score = 0;
    this.runDoor = nextDoorIndex(this.height); // next door that scores and refills hearts in this run
    this.doorT = this.runT; // when the run reached its last door (or started)
    this.scored = new Set(); // funnels, portals, elevators, bouncy pads and stars already scored this run
    this.beatBest = this.save.score === 0; // no NEW BEST banner on a day's first run
    this.chain = 0; // elements hit in a row, each within CHAIN_WINDOW of the last
    this.chainT = -Infinity;
  }

  // An element hit (pad, star, heart, funnel, elevator, portal): SCORE_ELEMENT points and a word
  // that climbs with the chain. `once` (the element) scores only once per run.
  elementScore(x, y, once = null) {
    if (once && this.scored.has(once)) return;
    this.chain = this.runT - this.chainT <= C.CHAIN_WINDOW ? this.chain + 1 : 1;
    this.chainT = this.runT;
    const word = C.CHAIN_WORDS[Math.min(this.chain, C.CHAIN_WORDS.length) - 1];
    this.addScore(C.SCORE_ELEMENT, x, y, once, word);
  }

  // Adds points to the run, with a floating "+n" at (x, y), and `word` above it if given.
  // `once` scores an object only once per run.
  addScore(pts, x, y, once = null, word = null) {
    if (once) {
      if (this.scored.has(once)) return;
      this.scored.add(once);
    }
    this.score += pts;
    this.hud.punch(pts);
    this.scorePop(x, y - 30, pts);
    if (word) this.wordPop(x, y - 80, word);
    const s = this.save;
    if (this.score > s.score) {
      s.score = this.score;
      this.dirty = true;
      if (!this.beatBest) {
        this.beatBest = true;
        this.hud.announce('NEW BEST');
        sfx.best();
      }
    }
  }

  persist() {
    Save.store(this.save);
    this.dirty = false;
    this.lastSave = this.time.now;
  }

  restartTower() {
    Object.assign(this.save, { best: 0, score: 0, falls: 0, bigFall: 0, climbed: 0, deaths: 0 });
    Save.store(this.save);
    this.scene.restart();
  }

  // ---------------------------------------------------------------- input

  aim() {
    const d = this.drag;
    if (!d) return null;
    const dx = d.sx - d.x;
    const dy = d.sy - d.y;
    const len = Math.hypot(dx, dy);
    if (len < C.DRAG_DEADZONE) return null;
    const power = Math.min(1, (len - C.DRAG_DEADZONE) / (C.MAX_DRAG - C.DRAG_DEADZONE));
    return { x: dx / len, y: dy / len, power };
  }

  tryLaunch(aim) {
    const pl = this.player;
    if (pl.dead || pl.funnel || pl.warp || pl.elevator) return;
    if (this.jumpsLeft() <= 0) {
      sfx.empty();
      return;
    }
    const speed = launchSpeed(aim.power);
    if (pl.ground) {
      pl.ground = null;
      pl.fromY = pl.y;
    }
    pl.launched = false; // your own jump ends an element's launch
    pl.vx = aim.x * speed;
    pl.vy = aim.y * speed;
    pl.jumpCd = C.JUMP_COOLDOWN;
    sfx.launch(aim.power);
    this.burst(pl.x, pl.y, this.col.spark, 6, 160, -aim.x, -aim.y);
  }

  // ---------------------------------------------------------------- simulation

  update(time, delta) {
    const dt = Math.min(delta / 1000, 0.05);
    const pl = this.player;
    const aim = this.paused || pl.dead || pl.funnel || pl.warp || pl.elevator ? null : this.aim();

    if (!this.paused) {
      // The run timer counts real seconds, so slow motion doesn't slow the clock.
      this.runT += dt;
      // Aiming slows time, more the longer the aim is held, so a fling can be lined up on a phone.
      const slow = aim && this.jumpsLeft() > 0 && !pl.dead;
      let target = 1;
      if (slow) {
        this.drag.t += dt;
        const k = Math.min(1, this.drag.t / C.SLOWMO_RAMP);
        target = 1 + (C.SLOWMO - 1) * k * k * (3 - 2 * k);
      }
      this.timeScale += (target - this.timeScale) * (1 - Math.exp(-dt * 14));
      const sdt = dt * this.timeScale;
      this.acc += sdt;
      while (this.acc >= STEP) {
        this.stepSim(STEP);
        this.acc -= STEP;
      }
      this.updateEffects(sdt);
    }

    this.updateCamera(dt);
    this.tower.ensureUpTo(this.cameras.main.scrollY);
    if (aim) previewPath(pl.x, pl.y, aim, this.preview);
    drawWorld(this, aim);
    for (const t of this.tutorialTexts) tint(t, this.col.ink);
    this.hud.update(dt);
    if (this.dirty && time - this.lastSave > 1000) this.persist();
  }

  stepSim(dt) {
    const pl = this.player;
    this.simT += dt;
    if (pl.dead) {
      pl.dead -= dt;
      if (pl.dead <= 0) this.respawn();
      return;
    }
    if (pl.hitT > 0) pl.hitT -= dt;
    if (pl.portalT > 0) pl.portalT -= dt;
    if (pl.jumpCd > 0) pl.jumpCd -= dt;
    if (pl.funnel || pl.warp || pl.elevator) {
      if (pl.funnel) this.slideFunnel(dt);
      else if (pl.warp) this.slideWarp(dt);
      else this.rideElevator();
      this.updateStars();
      this.updateHeight();
      return;
    }

    if (pl.ground) {
      const p = pl.ground;
      if (!this.solid(p)) {
        pl.ground = null;
        sfx.crumble();
      } else {
        pl.x = clamp(platformX(p, this.simT) + pl.offset, MIN_X, MAX_X);
        pl.y = p.y - C.PLAYER_R;
      }
    }
    if (!pl.ground) {
      // Substeps keep fast bounces from skipping through platforms.
      const n = substeps(pl, dt);
      const h = dt / n;
      for (let i = 0; i < n && !pl.ground && !pl.elevator; i++) {
        const prevY = pl.y;
        const wall = integrate(pl, h);
        if (wall) this.onWall(wall);
        if (pl.vy < 0) this.save.climbed += (-pl.vy * h) / C.PX_PER_M;
        // A launch lasts while it rises.
        if (pl.launched && pl.vy >= 0) pl.launched = false;
        this.collide(prevY);
      }
      if (!pl.elevator) this.checkFunnels();
      if (!pl.funnel && !pl.elevator) this.checkPortals();
    }
    if (pl.hitT <= 0 && !pl.funnel && !pl.elevator && !pl.launched) this.checkHazards();
    if (!pl.dead) {
      this.updateHearts();
      this.updateStars();
    }
    this.updateHeight();
  }

  // Stars are points only: anything within STAR_RADIUS is collected, once per run.
  updateStars() {
    const pl = this.player;
    const rr = C.STAR_RADIUS ** 2;
    for (const st of this.tower.starsIn(pl.y - C.STAR_RADIUS, pl.y + C.STAR_RADIUS, this.nearItems)) {
      if (this.scored.has(st) || (pl.x - st.x) ** 2 + (pl.y - st.y) ** 2 > rr) continue;
      this.elementScore(st.x, st.y, st);
      sfx.star();
      buzz(8);
      this.burst(st.x, st.y, this.col.star, 10, 180);
    }
  }

  // Carried up inside the elevator; at the top of its rise it fires you out.
  rideElevator() {
    const pl = this.player;
    const e = pl.elevator;
    pl.x = e.x;
    pl.y = e.y - C.ELEV_WALL - C.PLAYER_R + elevatorOffset(e, this.simT);
    if (this.simT < e.rideT + C.ELEV_TIME) return;
    e.rideT = null;
    e.backT = this.simT;
    pl.elevator = null;
    this.launch(0, -C.ELEV_LAUNCH);
    this.burst(pl.x, pl.y, this.col.deco, 12, 260, 0, -1);
  }

  // Any element's launch: you rise purple and invincible, and platforms turn one-way.
  launch(vx, vy) {
    const pl = this.player;
    Object.assign(pl, { vx, vy, ground: null, launched: true, fromY: pl.y });
    sfx.launch(1);
    buzz(15);
  }

  // Solid platforms: every side blocks. Doors and crumbling platforms (and every platform while
  // launched) are one-way: you pass up through them and land on top.
  // Elevators aren't solid: falling onto one from above (crossing its rim) rides it.
  collide(prevY) {
    const pl = this.player;
    const R = C.PLAYER_R;
    for (const p of this.tower.platformsIn(pl.y - 60, pl.y + 60, this.near)) {
      if (pl.ground || !this.solid(p)) continue;
      const px = platformX(p, this.simT);
      if (!C.SOLID_PLATFORMS || p.type === 'door' || p.type === 'crumble' || pl.launched) {
        if (pl.vy > 0 && prevY + R <= p.y + 0.01 && pl.y + R >= p.y && Math.abs(pl.x - px) <= p.w / 2 + R * 0.4) this.land(p, px);
        continue;
      }
      const thick = p.type === 'bouncy' ? 14 : C.PLAT_THICK;
      const vy = pl.vy; // pushOut zeroes it
      const hit = this.pushOut(px - p.w / 2, p.y, px + p.w / 2, p.y + thick);
      if (hit === 'top' && vy >= 0) this.land(p, px, vy);
    }
    if (pl.launched || pl.ground) return;
    for (const e of this.tower.elevatorsIn(pl.y - 120, pl.y + 120, this.nearItems)) {
      if (!elevatorIdle(e, this.simT) || pl.vy <= 0) continue;
      const rim = e.y - C.ELEV_DEPTH;
      if (prevY + R <= rim && pl.y + R >= rim && Math.abs(pl.x - e.x) <= C.ELEV_INNER / 2 + C.ELEV_WALL + R * 0.4) {
        this.enterElevator(e);
        return;
      }
    }
  }

  // Pushes the player's circle out of a box. Returns 'top', 'bottom' or 'side' for the face hit, or null.
  // Hitting the underside or a side stops (and slightly bounces) that part of the motion.
  pushOut(x0, y0, x1, y1) {
    const pl = this.player;
    const R = C.PLAYER_R;
    const cx = clamp(pl.x, x0, x1);
    const cy = clamp(pl.y, y0, y1);
    let dx = pl.x - cx;
    let dy = pl.y - cy;
    let d = Math.hypot(dx, dy);
    if (d >= R) return null;
    if (d === 0) {
      // Center inside the box: leave the way it is moving out of.
      dx = 0;
      dy = pl.vy >= 0 ? -1 : 1;
      d = 0;
      pl.y = dy < 0 ? y0 - R : y1 + R;
    } else {
      pl.x += (dx / d) * (R - d);
      pl.y += (dy / d) * (R - d);
      dx /= d;
      dy /= d;
    }
    if (dy < -0.6) {
      if (pl.vy > 0) pl.vy = 0;
      return 'top';
    }
    if (dy > 0.6) {
      if (pl.vy < 0) {
        pl.vy = -pl.vy * 0.15;
        sfx.wall();
        this.burst(pl.x, pl.y - R, this.col.plat, 4, 100, 0, 1);
      }
      return 'bottom';
    }
    if (pl.vx * dx < 0) {
      pl.vx = -pl.vx * 0.4;
      sfx.wall();
    }
    return 'side';
  }

  enterElevator(e) {
    const pl = this.player;
    e.rideT = this.simT;
    e.backT = null;
    pl.elevator = e;
    pl.vx = pl.vy = 0;
    this.recordFall();
    this.trail.length = 0;
    this.elementScore(pl.x, pl.y, e);
    sfx.funnel();
    buzz(12);
  }

  // Anywhere inside a funnel's cone counts (its mouth faces down): it swallows you and
  // carries you up through the tube.
  checkFunnels() {
    const pl = this.player;
    for (const f of this.tower.funnelsIn(pl.y - 20, pl.y + C.FUNNEL_D + 20, this.nearItems)) {
      const k = (f.y - pl.y) / C.FUNNEL_D;
      const half = C.FUNNEL_W / 2 + (C.FUNNEL_NECK - C.FUNNEL_W / 2) * k;
      if (k < 0 || k > 1 || Math.abs(pl.x - f.x) > half + C.PLAYER_R * 0.3) continue;
      pl.funnel = { f, pts: [pl.x, pl.y, ...f.tube], seg: 0, along: 0 };
      pl.vx = pl.vy = 0;
      this.elementScore(pl.x, pl.y, f);
      this.trail.length = 0;
      sfx.funnel();
      buzz(12);
      this.burst(pl.x, pl.y, this.col.deco, 6, 120);
      return;
    }
  }

  slideFunnel(dt) {
    const pl = this.player;
    const fn = pl.funnel;
    const pts = fn.pts;
    let move = C.FUNNEL_SPEED * dt;
    while (move > 0) {
      const i = fn.seg * 2;
      if (i + 3 >= pts.length) return this.ejectFunnel();
      const len = Math.hypot(pts[i + 2] - pts[i], pts[i + 3] - pts[i + 1]);
      if (fn.along + move < len) {
        fn.along += move;
        move = 0;
      } else {
        move -= len - fn.along;
        fn.seg++;
        fn.along = 0;
      }
    }
    const i = fn.seg * 2;
    const len = Math.hypot(pts[i + 2] - pts[i], pts[i + 3] - pts[i + 1]) || 1;
    pl.x = pts[i] + ((pts[i + 2] - pts[i]) * fn.along) / len;
    pl.y = pts[i + 1] + ((pts[i + 3] - pts[i + 1]) * fn.along) / len;
  }

  // Fires you out of the open top of the tube.
  ejectFunnel() {
    const pl = this.player;
    const f = pl.funnel.f;
    const [x, y] = f.tube.slice(-2);
    Object.assign(pl, { funnel: null, x, y });
    this.launch(f.vx, f.vy);
    this.burst(x, y, this.col.deco, 8, 200, Math.sign(f.vx) * 0.3, -1);
  }

  // Only blue portals take you in; you streak to the yellow one in WARP_TIME and leave it
  // with a fixed push straight up (PORTAL_EXIT), whatever speed you entered with.
  checkPortals() {
    const pl = this.player;
    if (pl.portalT > 0) return;
    const rr = (C.PORTAL_R * 0.8) ** 2;
    for (const pt of this.tower.portalsIn(pl.y - 40, pl.y + 40, this.nearItems)) {
      if (pt.color !== 'blue' || pt.gone || (pl.x - pt.x) ** 2 + (pl.y - pt.y) ** 2 > rr) continue;
      // The yellow exit may not be generated yet.
      for (let i = 0; i < 80 && !pt.pair && !pt.gone; i++) this.tower.step();
      const to = pt.pair;
      if (!to) return;
      pl.warp = { to, x0: pl.x, y0: pl.y, x1: to.x, y1: to.y, t: 0, ang: Math.atan2(to.y - pl.y, to.x - pl.x) };
      this.elementScore(pl.x, pl.y, pt);
      this.burst(pl.x, pl.y, portalColor(pt, this.col), 10, 200);
      sfx.portal();
      buzz(15);
      return;
    }
  }

  // 1 when the jump cooldown is over, else 0. Jumps are unlimited otherwise.
  jumpsLeft() {
    return this.player.jumpCd > 0 ? 0 : 1;
  }

  slideWarp(dt) {
    const pl = this.player;
    const w = pl.warp;
    w.t += dt;
    const k = Math.min(1, w.t / C.WARP_TIME);
    const e = k * k * (3 - 2 * k);
    pl.x = w.x0 + (w.x1 - w.x0) * e;
    pl.y = w.y0 + (w.y1 - w.y0) * e;
    if (k < 1) return;
    // No momentum carried over: a small push straight up, however you went in.
    Object.assign(pl, { warp: null, portalT: 0.3 });
    this.launch(0, -C.PORTAL_EXIT);
    this.burst(pl.x, pl.y, portalColor(w.to, this.col), 10, 200);
  }

  // Hearts start a HEART_LIFE countdown the first time they are on screen, then vanish.
  // A taken or faded heart comes back HEART_RESPAWN later, so hearts never run out.
  // At full HP you pass through them; they stay for when you need them.
  updateHearts() {
    const pl = this.player;
    const top = this.cameras.main.scrollY;
    const rr = (C.PLAYER_R + 16) ** 2;
    const full = pl.hp >= C.MAX_HP;
    for (const ht of this.tower.heartsIn(top - 60, top + C.H + 60, this.nearHearts)) {
      if (ht.gone) {
        if (this.simT - ht.goneT < C.HEART_RESPAWN) continue;
        ht.gone = false;
        ht.seenT = null;
      }
      const [x, y] = heartPos(ht, this.simT);
      if (ht.seenT == null) {
        if (y < top || y > top + C.H) continue;
        ht.seenT = this.simT;
      }
      if (this.simT - ht.seenT > C.HEART_LIFE) {
        ht.gone = true;
        ht.goneT = this.simT;
        sfx.heartGone();
        this.burst(x, y, this.col.heart, 6, 90);
      } else if (!full && (pl.x - x) ** 2 + (pl.y - y) ** 2 < rr) {
        ht.gone = true;
        ht.goneT = this.simT;
        pl.hp++;
        this.elementScore(x, y);
        this.dirty = true;
        sfx.heart();
        buzz(15);
        this.burst(x, y, this.col.heart, 12, 200);
      }
    }
  }

  // Doors are solid once today's best has passed them. Crumbling platforms break
  // CRUMBLE_TIME after first touch and come back after CRUMBLE_RESPAWN.
  solid(p) {
    if (p.type === 'door') return p.n < this.nextDoor;
    if (p.crumbleAt == null || this.simT < p.crumbleAt) return true;
    if (this.simT < p.crumbleAt + C.CRUMBLE_RESPAWN) return false;
    p.crumbleAt = null;
    return true;
  }

  land(p, px, impact = this.player.vy) {
    const pl = this.player;
    pl.y = p.y - C.PLAYER_R;
    this.recordFall();
    pl.fromY = pl.y;

    if (p.type === 'bouncy') {
      this.launch(pl.vx, -clamp(impact * 1.3, C.BOUNCE_MIN, C.BOUNCE_MAX));
      p.squashT = this.simT;
      this.elementScore(pl.x, p.y, p);
      sfx.bounce();
      this.burst(pl.x, p.y, this.col.bouncy, 10, 280, 0, -1);
      return;
    }

    pl.launched = false;
    pl.ground = p;
    pl.offset = clamp(pl.x - px, -p.w / 2, p.w / 2);
    pl.vx = 0;
    pl.vy = 0;
    pl.squash = Math.min(1, impact / 1600);
    if (p.type === 'crumble' && p.crumbleAt == null) p.crumbleAt = this.simT + C.CRUMBLE_TIME;
    this.dirty = true;
    sfx.land(pl.squash);
    buzz(6);
    this.burst(pl.x, p.y, this.col.plat, 5 + Math.round(pl.squash * 6), 140 + 160 * pl.squash, 0, -1);
  }

  // A landing below the spot the flight started from counts as a fall.
  recordFall() {
    const pl = this.player;
    const drop = (pl.y - pl.fromY) / C.PX_PER_M;
    if (drop <= 4) return;
    const s = this.save;
    s.falls++;
    s.bigFall = Math.max(s.bigFall, drop);
    if (drop >= 10) this.floatText(pl.x, pl.y - 34, `-${Math.round(drop)}m`);
  }

  onWall(side) {
    const pl = this.player;
    sfx.wall();
    this.burst(pl.x - side * C.PLAYER_R, pl.y, this.col.plat, 4, 120, -side, 0);
  }

  checkHazards() {
    const pl = this.player;
    const R = C.PLAYER_R;
    for (const hz of this.tower.hazardsIn(pl.y - 140, pl.y + 140, this.near)) {
      if (hz.kind === 'wall') {
        const touching = hz.side < 0 ? pl.x - R <= C.WALL + 12 : pl.x + R >= C.W - C.WALL - 12;
        if (touching && pl.y + R * 0.5 > hz.y0 && pl.y - R * 0.5 < hz.y1) return this.hit();
      } else {
        const [hx, hy] = hazardPos(hz, this.simT);
        const rr = R + hz.r * 0.8;
        if ((pl.x - hx) ** 2 + (pl.y - hy) ** 2 < rr * rr) return this.hit();
      }
    }
  }

  // A hazard costs a heart, stops you and locks jumping for HIT_STUN, so you drop. The last heart kills.
  hit() {
    const pl = this.player;
    pl.hp--;
    this.dirty = true;
    if (pl.hp <= 0) return this.die();
    pl.hitT = C.HIT_COOLDOWN;
    pl.jumpCd = C.HIT_STUN;
    pl.ground = null;
    pl.vx *= 0.15;
    pl.vy = Math.max(pl.vy, 150);
    this.cameras.main.shake(160, 0.006);
    sfx.hit();
    buzz(40);
    this.burst(pl.x, pl.y, this.col.hazard, 12, 260);
  }

  // Death sends you back to 0m with full hearts. Opened doors stay open (they're one-way too).
  die() {
    const pl = this.player;
    pl.dead = C.RESPAWN_DELAY;
    pl.ground = null;
    pl.vx = pl.vy = 0;
    this.trail.length = 0;
    this.drag = null;
    this.cameras.main.shake(260, 0.012);
    sfx.die();
    buzz(90);
    this.burst(pl.x, pl.y, this.col.spark, 18, 320);
    this.burst(pl.x, pl.y, this.col.hazard, 12, 260);
    this.save.deaths++;
    this.persist();
  }

  respawn() {
    const pl = this.player;
    const p = this.tower.platforms[0];
    Object.assign(pl, { dead: 0, hp: C.MAX_HP, ground: p, offset: 0, vx: 0, vy: 0, jumpCd: 0, hitT: C.HIT_COOLDOWN, launched: false, elevator: null });
    pl.x = C.W / 2;
    pl.y = pl.fromY = p.y - C.PLAYER_R;
    this.runT = 0; // a death starts a new run
    this.height = 0;
    this.newRun();
    this.setPalette(0);
    this.cameras.main.scrollY = this.cameraTarget();
    this.hud.announce('BACK TO 0m');
    sfx.respawn();
    this.burst(pl.x, pl.y, this.col.spark, 10, 200);
  }

  heightOf(y) {
    return Math.max(0, -(y + C.PLAYER_R) / C.PX_PER_M);
  }

  updateHeight() {
    const pl = this.player;
    const h = this.heightOf(pl.y);
    this.height = h;
    // Every door reached in this run (once per run, even if it was opened earlier) scores by how
    // fast you got there from the previous one, and refills all hearts.
    while (h >= doorHeight(this.runDoor)) {
      const secs = this.runT - this.doorT;
      const tier = C.DOOR_TIERS.find((t) => secs < t.under);
      this.hud.announce(`${tier.word}!`, C.WORD_COLORS[tier.word]);
      this.addScore(tier.pts, pl.x, pl.y);
      this.popText(pl.x, pl.y + 10, `${doorHeight(this.runDoor)}m in ${secs.toFixed(1)}s`, 14, 0xffffff, 0.75);
      this.runDoor++;
      this.doorT = this.runT;
      // The tower takes on the palette of the section above the door just reached.
      this.setPalette(this.runDoor - 1);
      if (pl.hp < C.MAX_HP) {
        const healed = C.MAX_HP - pl.hp;
        pl.hp = C.MAX_HP;
        this.dirty = true;
        sfx.heart();
        this.hud.refilled();
        this.popText(pl.x, pl.y - 70, `HP FULL  +${healed}♥`, 16, this.colTo.heart);
        this.burst(pl.x, pl.y, this.colTo.heart, 18, 240);
      }
    }
    // Today's best height only decides which doors are open; it isn't the score.
    const s = this.save;
    if (h > s.best) {
      s.best = h;
      // Passing a door opens its floor: from now on today you can't fall below it.
      while (h >= doorHeight(this.nextDoor)) {
        const door = this.tower.doors[this.nextDoor];
        if (door) door.openT = this.simT;
        sfx.door();
        buzz(30);
        this.nextDoor++;
      }
    }
  }

  // Fades the colors to section n's palette.
  setPalette(n) {
    const to = palette(this.tower, n);
    if (to === this.colTo) return;
    this.colFrom = this.col;
    this.colTo = to;
    this.colT = this.time.now;
  }

  // ---------------------------------------------------------------- camera & effects

  // A standing player sits TOP_GAP below the top edge on every screen size, so a full
  // launch always peaks just past the top. Extra screen height shows more below.
  cameraTarget() {
    return this.player.y - C.TOP_GAP;
  }

  updateCamera(dt) {
    const cam = this.cameras.main;
    const pl = this.player;
    const s = cam.scrollY + (this.cameraTarget() - cam.scrollY) * (1 - Math.exp(-dt * 5));
    cam.scrollY = clamp(s, pl.y - C.H * 0.85, pl.y - 120); // never lose the player off-screen
  }

  updateEffects(dt) {
    const pl = this.player;
    pl.squash = Math.max(0, pl.squash - dt * 6);
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.life -= dt;
      if (p.life <= 0) {
        this.particles.splice(i, 1);
        continue;
      }
      p.vy += 900 * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
    }
    if (!pl.ground && !pl.dead) this.trail.push(pl.x, pl.y);
    this.updatePortalFx(dt);
    if (this.trail.length > 24 || (pl.ground && this.trail.length)) this.trail.splice(0, 2);
  }

  // Particles around on-screen portals: the blue one draws them in, the yellow one sends them out.
  updatePortalFx(dt) {
    const fx = this.portalFx;
    for (let i = fx.length - 1; i >= 0; i--) {
      const p = fx[i];
      p.life -= dt;
      if (p.life <= 0) fx.splice(i, 1);
      else {
        p.x += p.vx * dt;
        p.y += p.vy * dt;
      }
    }
    const top = this.cameras.main.scrollY;
    const R = C.PORTAL_R;
    for (const pt of this.tower.portalsIn(top - 60, top + C.H + 60, this.drawPortals)) {
      if (pt.gone) continue;
      pt.fxAcc = (pt.fxAcc || 0) + dt * 40;
      for (; pt.fxAcc >= 1; pt.fxAcc--) {
        const a = Math.random() * Math.PI * 2;
        const cx = Math.cos(a);
        const cy = Math.sin(a);
        const color = portalColor(pt, this.col);
        if (pt.color === 'blue') fx.push({ x: pt.x + cx * (R + 24), y: pt.y + cy * (R + 24), vx: -cx * 75, vy: -cy * 75, life: 0.32, max: 0.32, color });
        else fx.push({ x: pt.x + cx * (R - 4), y: pt.y + cy * (R - 4), vx: cx * 55, vy: cy * 55, life: 0.55, max: 0.55, color });
      }
    }
  }

  burst(x, y, color, n, speed, dirX = 0, dirY = 0) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const v = speed * (0.4 + Math.random() * 0.6);
      const life = 0.3 + Math.random() * 0.3;
      this.particles.push({
        x,
        y,
        vx: Math.cos(a) * v + dirX * speed * 0.6,
        vy: Math.sin(a) * v + dirY * speed * 0.6,
        life,
        max: life,
        color,
        size: 2 + Math.random() * 3,
      });
    }
  }

  // Damage-number style: small text left where it happened. A quick nudge in, a short drift up
  // with a little sideways scatter, and a fade. Stays out of the way of play.
  popText(x, y, text, size, color, alpha = 0.9) {
    x = clamp(x + Phaser.Math.Between(-14, 14), C.WALL + 40, C.W - C.WALL - 40);
    const t = label(this, x, y, text, size, alpha, false)
      .setColor(hex(color))
      .setStroke(hex(this.col.ink), 4)
      .setDepth(45)
      .setScale(1.2);
    this.tweens.add({ targets: t, scale: 1, duration: 120, ease: 'Quad.Out' });
    this.tweens.add({ targets: t, x: x + Phaser.Math.Between(-12, 12), y: y - 36, duration: 700, ease: 'Cubic.Out' });
    this.tweens.add({ targets: t, alpha: 0, delay: 350, duration: 350, onComplete: () => t.destroy() });
  }

  scorePop(x, y, pts) {
    this.popText(x, y, `+${pts}`, pts >= 100 ? 22 : 18, this.col.star);
  }

  // The chain word, small, just above the "+n". Better words are a touch bigger.
  wordPop(x, y, word) {
    const rank = Math.max(0, C.CHAIN_WORDS.indexOf(word));
    this.popText(x, y + 22, word, 13 + rank, C.WORD_COLORS[word] ?? 0xffffff, 0.8);
  }

  floatText(x, y, text) {
    const t = label(this, x, y, text, 22, 1, false).setStroke(hex(this.col.ink), 6).setDepth(40);
    this.tweens.add({ targets: t, y: y - 50, alpha: 0, delay: 500, duration: 900, onComplete: () => t.destroy() });
  }
}
