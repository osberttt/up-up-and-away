import Phaser from 'phaser';
import * as C from './config.js';
import { Tower, platformX, hazardPos, hazardR, doorHeight, nextDoorIndex, elevatorOffset, elevatorIdle, railAt, bubblePos, kitePos, kiteTow, windGust, kiteShot, cometShot } from './tower.js';
import { integrate, substeps, launchSpeed, previewPath, MIN_X, MAX_X } from './physics.js';
import { dayKey } from './rng.js';
import * as Save from './save.js';
import { sfx, unlockAudio, setMuted, buzz } from './audio.js';
import { drawWorld, palette, portalColor, hex, tint, textColors, wordColor } from './draw.js';
import { Hud, Menu, label, PillButton } from './ui.js';
import { SPACE } from './palettes.js';

const STEP = 1 / 120;
const CAM_EASE = 5; // per second: how fast the camera catches up with its target
const clamp = Phaser.Math.Clamp;


export class GameScene extends Phaser.Scene {
  constructor() {
    super('game');
  }

  // data.again: restarted after a death (a new run, on a new tower).
  create(data = {}) {
    this.day = dayKey();
    this.save = Save.load(this.day);
    setMuted(this.save.muted);
    // A tower a day: every run that day climbs the same tower, built from the date. Dev only:
    // ?seed=abc builds another tower, and ?force=kite makes every chain element a kite (any
    // element type works).
    const params = import.meta.env?.DEV ? new URLSearchParams(location.search) : new URLSearchParams();
    const seed = params.get('seed') || this.day;
    this.tower = new Tower(seed, { force: params.get('force') });

    this.leaving = false; // restarting for a new run (see respawn)
    this.simT = 0;
    this.runT = 0; // seconds of real time in this run, reset by a death
    this.acc = 0;
    this.timeScale = 1;
    this.paused = false;
    this.ending = null; // the ending sequence, once END_HEIGHT is reached
    this.heartsFlying = 0; // hearts from doors on their way up to the bar
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
    this.drawFunnels = [];
    this.drawPortals = [];
    this.drawStars = [];
    this.drawElevs = [];
    this.drawThings = [];
    this.nearItems = [];

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
      carry: null, // { kind, t, ... } while a balloon, bubble, planet or rail has you
      launched: false, // rising from an element's launch: invincible, platforms one-way
      hitT: 0,
      squash: 0,
      fromY: -R, // where the current flight started, to measure falls
    };
    if (import.meta.env?.DEV && !data.again) this.devStart();
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
    this.setupMap();
    if (import.meta.env?.DEV && !data.again) this.devShot();
    if (data.again) {
      const pl = this.player;
      pl.hitT = C.HIT_COOLDOWN;
      this.hud.announce('BACK TO 0m');
      sfx.respawn();
      this.burst(pl.x, pl.y, this.col.spark, 10, 200);
    }
  }

  // Dev only, for screenshots (scripts/screenshots.mjs): ?shot=aim holds a drag (the aim arrow and
  // slow motion), ?shot=launch fires a launch and three chained element scores, ?shot=pause plays
  // that launch then opens the pause menu, ?shot=ending launches up through the 2500m door into
  // the ending. window.__shotReady turns true when the staged moment is on screen.
  devShot() {
    const shot = new URLSearchParams(location.search).get('shot');
    window.__shotReady = false;
    const ready = (ms) => this.time.delayedCall(ms, () => (window.__shotReady = true));
    if (!shot) return ready(1000);
    const pl = this.player;
    this.time.delayedCall(300, () => {
      if (shot === 'aim') {
        this.drag = { sx: C.W / 2, sy: C.H * 0.6, x: C.W / 2 - 70, y: C.H * 0.6 + 140, t: 0 };
        ready(900);
      } else if (shot === 'launch' || shot === 'pause') {
        this.launch(60, -1500);
        [0, 450, 900].forEach((ms) => this.time.delayedCall(ms, () => this.elementScore(pl.x, pl.y)));
        if (shot === 'pause') {
          // A few earlier runs, so the last-runs chart has something to show.
          this.save.runs = [{ score: 150, height: 214 }, { score: 400, height: 512 }, { score: 250, height: 377 }, { score: 700, height: 806 }, { score: 350, height: 431 }, { score: 0, height: 48 }];
          this.time.delayedCall(1600, () => this.menu.open());
          ready(2100);
        } else ready(1150);
      } else if (shot === 'ending') {
        // From just under the last door straight up through it, so nothing is in the way; it scores,
        // then the ending starts by itself (showEndTitle sets ready).
        [0, 300].forEach((ms) => this.time.delayedCall(ms, () => this.elementScore(pl.x, pl.y)));
        pl.y = -(C.END_HEIGHT - 4) * C.PX_PER_M - C.PLAYER_R;
        this.launch(0, -2200);
      }
    });
  }

  // ---------------------------------------------------------------- ending

  // Reaching END_HEIGHT: the last level is space, total black with stars. Control stops, gravity
  // turns off and the ball's speed eases to straight up: it rises and rises on its own, the world
  // scrolling past. END_TITLE seconds in, the title drops in, then the score and a restart button.
  startEnding() {
    const pl = this.player;
    this.ending = { t: 0, titleShown: false };
    this.drag = null;
    Object.assign(pl, { carry: null, funnel: null, warp: null, elevator: null, ground: null, launched: true });
    this.dropKite();
    // Space: the palette fades to black.
    this.colFrom = this.col;
    this.colTo = SPACE;
    this.colT = this.time.now;
    this.endRun();
    this.persist();
    sfx.best();
    buzz(60);
  }

  updateEnding(dt) {
    const e = this.ending;
    const pl = this.player;
    e.t += dt;
    this.simT += dt;
    // No gravity, no control: the speed eases to straight up, drifting to the middle of the screen
    // (the camera holds the ball in the middle vertically, see cameraTarget).
    const k = 1 - Math.exp(-C.END_EASE * dt);
    pl.vx += ((C.W / 2 - pl.x) * 3 - pl.vx) * k;
    pl.vy += (-C.END_SPEED - pl.vy) * k;
    pl.x += pl.vx * dt;
    pl.y += pl.vy * dt;
    this.height = this.heightOf(pl.y);
    this.updateEffects(dt);
    this.updateCamera(dt);
    this.tower.ensureUpTo(this.cameras.main.scrollY);
    drawWorld(this, null);
    this.hud.update(dt);
    if (e.t >= C.END_TITLE && !e.titleShown) {
      e.titleShown = true;
      this.showEndTitle();
    }
  }

  // The title fades in in place (as the top bar fades out); the score fades in under it, then a
  // PLAY AGAIN button.
  // Laid out around the ball, which sits in the middle: title and score above, button below.
  showEndTitle() {
    this.hud.hide();
    const y = C.H * 0.2;
    const title = label(this, C.W / 2, y, 'UP UP AND AWAY', 46, 0).setDepth(90).setColor('#ffffff').setShadow(0, 4, 'rgba(0,0,0,0.6)', 12);
    this.tweens.add({ targets: title, alpha: 1, duration: 900, ease: 'Sine.Out' });
    const score = label(this, C.W / 2, y + 58, `score ${this.score}   ·   best today ${this.save.score}`, 18, 0).setDepth(90).setColor('#ffffff');
    this.tweens.add({ targets: score, alpha: 0.8, delay: 900, duration: 700 });
    const btn = new PillButton(this, C.W / 2, C.H * 0.8, 240, 58, 'PLAY AGAIN', () => this.scene.restart(), 90).style(0x000000, 0xffffff, true);
    btn.text.setFontSize(22);
    btn.setAlpha(0).zone.disableInteractive();
    this.tweens.add({
      targets: [btn.g, btn.text],
      alpha: 1,
      delay: C.END_BUTTON * 1000,
      duration: 500,
      onComplete: () => {
        btn.zone.setInteractive({ useHandCursor: true });
        if (import.meta.env?.DEV) window.__shotReady = true; // for scripts/screenshots.mjs
      },
    });
  }

  // ---------------------------------------------------------------- debug map

  // Debug map (in `npm run dev` only, never in the released build): M freezes the game and
  // frees the camera. Scroll with the wheel, by dragging, or with the arrow / Page keys (Shift
  // for faster); the tower keeps generating as you go up. T drops the blob in the middle of the
  // view and resumes; M or Esc resumes where you were.
  setupMap() {
    this.map = null; // { y } camera scroll while the map is open
    const enabled = import.meta.env?.DEV;
    if (!enabled || !this.input.keyboard) return;
    this.mapText = label(this, C.W / 2, C.H - 26, '', 14, 0.9).setDepth(70).setVisible(false);
    const kb = this.input.keyboard;
    kb.on('keydown-M', () => (this.map ? this.closeMap() : this.openMap()));
    kb.on('keydown-T', () => this.map && this.teleport());
    this.mapKeys = kb.addKeys('UP,DOWN,PAGE_UP,PAGE_DOWN,SHIFT');
    this.input.on('wheel', (pointer, over, dx, dy) => {
      if (this.map) this.map.y += dy * (this.mapKeys.SHIFT.isDown ? 4 : 1);
    });
  }

  openMap() {
    if (this.paused) return;
    this.map = { y: this.cameras.main.scrollY };
    this.drag = null;
    this.mapText.setVisible(true);
  }

  closeMap() {
    this.map = null;
    this.mapText.setVisible(false);
  }

  // Scrolling by keys, and the read-out of where the view is.
  updateMap(dt) {
    const k = this.mapKeys;
    const speed = (k.SHIFT.isDown ? 6000 : 1500) * dt;
    if (k.UP.isDown) this.map.y -= speed;
    if (k.DOWN.isDown) this.map.y += speed;
    if (Phaser.Input.Keyboard.JustDown(k.PAGE_UP)) this.map.y -= C.H;
    if (Phaser.Input.Keyboard.JustDown(k.PAGE_DOWN)) this.map.y += C.H;
    this.map.y = Math.min(this.map.y, C.PLAYER_R + 100 - C.H); // not below the ground
    const mid = Math.floor(-(this.map.y + C.H / 2) / C.PX_PER_M);
    this.mapText.setText(`MAP  ${mid}m   wheel / drag / arrows (Shift fast)   T teleport   M exit`);
    tint(this.mapText, this.col.ink);
  }

  // Drops the blob, standing still, in the middle of the view, and resumes. The doors it skipped
  // don't score or refill hearts; the palette jumps to that section.
  teleport() {
    const pl = this.player;
    const y = this.map.y + C.H / 2;
    Object.assign(pl, { x: C.W / 2, y, vx: 0, vy: 0, ground: null, launched: false, funnel: null, warp: null, elevator: null, carry: null, kite: null, jumpCd: 0, fromY: y });
    this.height = this.heightOf(y);
    this.runDoor = nextDoorIndex(this.height);
    this.doorT = this.runT;
    this.setPalette(this.runDoor - 1);
    this.closeMap();
    this.cameras.main.scrollY = this.cameraTarget();
  }

  // ---------------------------------------------------------------- setup

  // No title card: the game starts right away. The texts live in the world, just above the ground.
  addTutorial() {
    const text = (y, s) => label(this, C.W / 2, y, s, 21, 0.85, false).setWordWrapWidth(C.W - 120).setLineSpacing(4);
    // Both stay below the top bar: at the start the camera's top edge is TOP_GAP above the ball,
    // and the bar takes about the first 110px of the screen.
    return [
      text(-150, 'drag anywhere and release it\nto shoot the blob up'),
      text(-340, 'drag again in the air\nto keep going up'),
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
      if (this.paused || this.ending || over.length) return;
      const { x, y } = toLogical(pointer);
      if (this.map) {
        this.map.grab = { y, scroll: this.map.y }; // the map scrolls by dragging
        return;
      }
      this.drag = { sx: x, sy: y, x, y, t: 0 };
    });
    this.input.on('pointermove', (pointer) => {
      if (this.map?.grab && pointer.isDown) this.map.y = this.map.grab.scroll - (toLogical(pointer).y - this.map.grab.y);
      if (!this.drag) return;
      const { x, y } = toLogical(pointer);
      this.drag.x = x;
      this.drag.y = y;
    });
    const release = (pointer) => {
      if (this.map) this.map.grab = null;
      // In a bubble or orbiting a planet, a tap (or any release) lets go.
      if (this.drag && !this.paused && ['bubble', 'planet'].includes(this.player.carry?.kind)) {
        this.drag = null;
        this.letGo();
        return;
      }
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
    this.input.keyboard?.on('keydown-ESC', () => (this.ending ? null : this.map ? this.closeMap() : this.paused ? this.menu.close() : this.menu.open()));
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
    this.runTop = this.height; // highest point of this run, in m
    this.runEnded = false;
  }

  // This run so far, or null if nothing happened in it yet (no points, barely left the start).
  runRecord() {
    if (this.runEnded || (this.score === 0 && this.runTop < 1)) return null;
    return { score: this.score, height: Math.floor(this.runTop) };
  }

  // A death, the ending or a tower restart closes the run into the last-runs history.
  endRun() {
    const run = this.runRecord();
    this.runEnded = true;
    if (run) this.save.runs = [...this.save.runs, run].slice(-Save.RUNS_KEPT);
    this.save.run = null;
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
    this.save.run = this.runRecord();
    Save.store(this.save);
    this.dirty = false;
    this.lastSave = this.time.now;
  }

  restartTower() {
    this.endRun();
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
    if (pl.dead || this.carried()) return;
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
    if (this.ending) {
      this.updateEnding(dt);
      return;
    }
    const aim = this.paused || this.map || pl.dead || this.carried() ? null : this.aim();

    if (this.map) this.updateMap(dt);
    else if (!this.paused) {
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
    if (this.carried()) {
      if (pl.funnel) this.slideFunnel(dt);
      else if (pl.warp) this.slideWarp(dt);
      else if (pl.elevator) this.rideElevator();
      else this.rideCarry(dt);
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
        // Resting on an elevator's floor: once the ball has settled, it takes you up.
        if (p.type === 'elevator' && this.simT - pl.landT >= C.ELEV_WAIT) this.enterElevator(p.elev);
      }
    }
    if (!pl.ground) {
      // Substeps keep fast bounces from skipping through platforms.
      const n = substeps(pl, dt);
      const h = dt / n;
      const winds = this.windsAt(pl.x, pl.y);
      for (let i = 0; i < n && !pl.ground && !this.carried(); i++) {
        const prevY = pl.y;
        for (const w of winds) this.blow(w, h);
        const wall = integrate(pl, h, pl.launched ? C.GRAVITY * C.LAUNCH_GRAVITY : C.GRAVITY);
        if (wall) this.onWall(wall);
        if (pl.vy < 0) this.save.climbed += (-pl.vy * h) / C.PX_PER_M;
        // A launch lasts while it rises.
        if (pl.launched && pl.vy >= 0) pl.launched = false;
        this.collide(prevY);
      }
      if (!this.carried()) this.checkFunnels();
      if (!this.carried()) this.checkPortals();
      if (!this.carried()) this.checkThings();
    }
    // A kite carries you only while its launch lasts.
    if (pl.kite && !pl.launched) this.dropKite();
    if (pl.hitT <= 0 && !this.carried() && !pl.launched) this.checkHazards();
    if (!pl.dead) this.updateStars();
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
    pl.x = e.x + pl.offset; // where it landed on the floor
    pl.y = e.y - C.ELEV_WALL - C.PLAYER_R + elevatorOffset(e, this.simT);
    if (this.simT < e.rideT + C.ELEV_TIME) return;
    e.rideT = null;
    e.backT = this.simT;
    pl.elevator = null;
    this.launch(0, -C.ELEV_LAUNCH);
    // The kick: a hard jolt, a blast of particles out of the box, a strong buzz.
    this.cameras.main.shake(220, 0.012);
    buzz(40);
    this.burst(pl.x, pl.y, this.col.elevator, 22, 420, 0, -1);
    this.burst(pl.x, pl.y + 20, this.col.spark, 12, 300, 0, 1);
  }

  // Is something moving the player for it (funnel, portal, elevator, balloon, bubble, planet, rail)?
  // While carried you can't jump or be hurt.
  carried() {
    const pl = this.player;
    return !!(pl.funnel || pl.warp || pl.elevator || pl.carry);
  }

  // Catches the player with a nearby balloon, bubble, planet or rail.
  checkThings() {
    const pl = this.player;
    const R = C.PLAYER_R;
    for (const t of this.tower.thingsIn(pl.y - 160, pl.y + 160, this.nearItems)) {
      if (this.simT < t.readyT) continue;
      let carry = null;
      if (t.kind === 'balloon') {
        // The balloon itself, or anywhere along its string.
        const by = t.y - C.BALLOON_STRING - C.BALLOON_R;
        const onString = Math.abs(pl.x - t.x) < R + 6 && pl.y > by && pl.y < t.y + R;
        if (onString || Math.hypot(pl.x - t.x, pl.y - by) < C.BALLOON_R + R) carry = { x0: t.x, y0: t.y };
      } else if (t.kind === 'bubble') {
        const [bx, by] = bubblePos(t, this.simT);
        if (Math.hypot(pl.x - bx, pl.y - by) < C.BUBBLE_R + R * 0.5) carry = { x0: bx, y0: by };
      } else if (t.kind === 'planet') {
        if (Math.hypot(pl.x - t.x, pl.y - t.y) < C.ORBIT_R + R * 0.6) carry = { ang: Math.atan2(pl.y - t.y, pl.x - t.x), turned: 0 };
      } else if (t.kind === 'kite') {
        const [kx, ky, tx, ty] = kitePos(t, this.simT);
        if (Math.hypot(pl.x - tx, pl.y - ty) < R + 14 || Math.hypot(pl.x - kx, pl.y - ky) < R + 22) carry = { x0: pl.x, y0: pl.y };
      } else if (t.kind === 'comet') {
        // The electric field traps you; the comet comes for you.
        if (Math.hypot(pl.x - t.x, pl.y - t.y) < C.FIELD_R + R * 0.3) carry = { x0: pl.x, y0: pl.y };
      } else if (t.kind === 'rail') {
        // Nearest point of the track; you join it there.
        let best = Infinity;
        let s = 0;
        for (let i = 0; i < t.pts.length; i++) {
          const d = Math.hypot(pl.x - t.pts[i].x, pl.y - t.pts[i].y);
          if (d < best) {
            best = d;
            s = t.cum[i];
          }
        }
        if (best < C.RAIL_GRAB + R * 0.5) carry = { s };
      }
      if (!carry) continue;
      pl.carry = { kind: t.kind, thing: t, t: 0, ...carry };
      Object.assign(pl, { vx: 0, vy: 0, ground: null, launched: false });
      this.trail.length = 0;
      this.elementScore(pl.x, pl.y, t);
      t.kind === 'rail' ? sfx.funnel() : sfx.portal();
      buzz(15);
      this.burst(pl.x, pl.y, this.col[t.kind], 10, 200);
      return;
    }
  }

  // The kite that was carrying you lets go (at the top of the flight, or when anything else ends
  // the launch) and drifts off on its own, up and away, fading.
  dropKite() {
    const pl = this.player;
    const t = pl.kite;
    if (!t) return;
    const [kx, ky] = kiteTow(pl);
    t.leave = { x: kx, y: ky, vx: pl.vx * 0.6, vy: Math.min(pl.vy, 0) - 260, t0: this.simT };
    pl.kite = null;
  }

  // Updraft columns you're in.
  windsAt(x, y) {
    const out = [];
    for (const t of this.tower.thingsIn(y - 10, y + 10, this.nearItems)) if (t.kind === 'wind' && y > t.y0 && y < t.y1 && Math.abs(x - t.x) < t.w / 2) out.push(t);
    return out;
  }

  // An updraft takes you over, however you came in: sideways motion dies, you're drawn to its
  // middle, and your speed is steered to straight up at WIND_MAX (by how hard it's gusting). You
  // count as launched: invincible, platforms one-way, and the lighter launch gravity carries you
  // on past its top. The first time you enter one in a run it scores like an element.
  blow(w, dt) {
    const pl = this.player;
    if (pl.y <= w.y0 || pl.y >= w.y1 || Math.abs(pl.x - w.x) >= w.w / 2) return;
    if (!this.scored.has(w)) {
      this.elementScore(pl.x, pl.y, w);
      sfx.launch(0.6);
    }
    const k = 1 - Math.exp(-C.WIND_GRIP * dt);
    const toMiddle = (w.x - pl.x) * 6; // px/s toward the middle of the column
    pl.vx += (toMiddle - pl.vx) * k;
    pl.vy += (-C.WIND_MAX * windGust(w, this.simT) - pl.vy) * k;
    pl.launched = true;
  }

  // Moves the player along with whatever has it.
  rideCarry(dt) {
    const pl = this.player;
    const c = pl.carry;
    const t = c.thing;
    c.t += dt;
    if (c.kind === 'balloon') {
      // Floats up, easing in and out, swaying side to side, then lets go at the top.
      const k = Math.min(1, c.t / C.BALLOON_TIME);
      const e = k * k * (3 - 2 * k);
      pl.x = c.x0 + 18 * Math.sin(k * Math.PI * 4);
      pl.y = c.y0 - t.rise * e;
      if (k >= 1) this.letGo();
    } else if (c.kind === 'bubble') {
      // Rises steadily with a little wobble; pops by itself at the top of its rise.
      pl.y -= C.BUBBLE_SPEED * dt;
      pl.x = c.x0 + 8 * Math.sin(c.t * 3.5);
      if (c.y0 - pl.y >= t.rise) this.letGo();
    } else if (c.kind === 'planet') {
      // Circles the planet. After ORBIT_MIN_TURN it lets go by itself where the circling heads
      // straight up (the left side spinning clockwise, the right side counterclockwise).
      const step = C.ORBIT_SPIN * dt;
      c.ang += t.spin * step;
      c.turned += step;
      pl.x = t.x + Math.cos(c.ang) * C.ORBIT_R;
      pl.y = t.y + Math.sin(c.ang) * C.ORBIT_R;
      const rel = t.spin > 0 ? Math.PI : 0;
      const d = (((t.spin * (c.ang - rel)) % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);
      if (c.turned >= C.ORBIT_MIN_TURN * 2 * Math.PI && c.prevD != null && d < c.prevD) {
        c.ang = rel; // exactly at the straight-up point
        pl.x = t.x + Math.cos(rel) * C.ORBIT_R;
        pl.y = t.y;
        this.letGo();
        return;
      }
      c.prevD = d;
    } else if (c.kind === 'kite') {
      // No pull anywhere: it takes off right away, from where you touched it.
      this.letGo();
    } else if (c.kind === 'comet') {
      // Trapped: pulled into the middle of the field, crackling, until the comet arrives.
      const k = Math.min(1, c.t / C.COMET_TRAP);
      const pull = Math.min(1, k * 3);
      pl.x = c.x0 + (t.x - c.x0) * pull + (Math.random() - 0.5) * 5;
      pl.y = c.y0 + (t.y - c.y0) * pull + (Math.random() - 0.5) * 5;
      if (k >= 1) {
        pl.x = t.x;
        pl.y = t.y;
        this.letGo();
      }
    } else if (c.kind === 'rail') {
      // Slides along the track; off the end it flings you.
      c.s += C.RAIL_SPEED * dt;
      const p = railAt(t, c.s);
      pl.x = p.x;
      pl.y = p.y - C.PLAYER_R;
      if (c.s >= t.len) this.letGo();
    }
  }

  // Ends a balloon, bubble, planet or rail ride with its launch.
  letGo() {
    const pl = this.player;
    const c = pl.carry;
    if (!c) return;
    const t = c.thing;
    pl.carry = null;
    if (c.kind === 'balloon') {
      t.readyT = this.simT + C.BALLOON_RETURN;
      this.launch(0, -C.BALLOON_EXIT);
    } else if (c.kind === 'bubble') {
      t.readyT = this.simT + C.BUBBLE_RETURN;
      this.launch(0, -C.BUBBLE_EXIT);
      sfx.bounce();
      this.burst(pl.x, pl.y, this.col.bubble, 16, 260);
    } else if (c.kind === 'planet') {
      // Along the circle, the way you were going.
      t.readyT = this.simT + C.ORBIT_COOLDOWN;
      this.launch(-Math.sin(c.ang) * t.spin * C.ORBIT_EXIT, Math.cos(c.ang) * t.spin * C.ORBIT_EXIT);
    } else if (c.kind === 'kite') {
      // The kite takes off as if shot, and carries you under it to the top of the flight.
      t.readyT = this.simT + C.KITE_RETURN;
      t.leave = null;
      this.launch(...kiteShot(t.dir));
      pl.kite = t;
    } else if (c.kind === 'comet') {
      // The hit.
      t.readyT = this.simT + C.COMET_COOLDOWN;
      this.launch(...cometShot(t.dir));
      this.cameras.main.shake(200, 0.011);
      buzz(40);
      this.burst(pl.x, pl.y, this.col.comet, 24, 420, t.dir * 0.4, -1);
      this.burst(pl.x, pl.y, this.col.spark, 12, 300);
    } else if (c.kind === 'rail') {
      t.readyT = this.simT + C.RAIL_COOLDOWN;
      this.launch(t.exit.x * C.RAIL_EXIT, t.exit.y * C.RAIL_EXIT);
    }
    this.burst(pl.x, pl.y, this.col[c.kind], 10, 240, 0, -1);
  }

  // Any element's launch: you rise purple and invincible, and platforms turn one-way.
  // The rise runs on lighter gravity (LAUNCH_GRAVITY); scaling the speed by its square root
  // keeps the peak, height and sideways, exactly where full speed would put it.
  launch(vx, vy) {
    const pl = this.player;
    const k = Math.sqrt(C.LAUNCH_GRAVITY);
    Object.assign(pl, { vx: vx * k, vy: vy * k, ground: null, launched: true, fromY: pl.y });
    sfx.launch(1);
    buzz(15);
  }

  // Solid platforms: every side blocks. Doors and crumbling platforms (and every platform while
  // launched) are one-way: you pass up through them and land on top.
  // Elevators are solid U boxes (walls and floor block from every side, whatever SOLID_PLATFORMS
  // says). Landing on the floor inside and resting there for ELEV_WAIT starts the ride (see stepSim).
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
      if (!elevatorIdle(e, this.simT)) continue;
      const floor = e.floor;
      const half = C.ELEV_INNER / 2;
      const Wl = C.ELEV_WALL;
      // Dropping in onto the floor rides it.
      if (pl.vy > 0 && prevY + R <= floor.y + 0.01 && pl.y + R >= floor.y && Math.abs(pl.x - e.x) <= half - R * 0.6) {
        this.land(floor, e.x);
        return;
      }
      // Otherwise the U is solid: both walls and the floor block from every side.
      this.pushOut(e.x - half - Wl, e.y - C.ELEV_DEPTH, e.x - half, e.y);
      this.pushOut(e.x + half, e.y - C.ELEV_DEPTH, e.x + half + Wl, e.y);
      const vy = pl.vy; // pushOut zeroes it
      if (this.pushOut(e.x - half - Wl, e.y - Wl, e.x + half + Wl, e.y) === 'top' && vy >= 0 && Math.abs(pl.x - e.x) <= half) {
        this.land(floor, e.x, vy);
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
    pl.ground = null; // the ride carries you now, keeping your spot on the floor (pl.offset)
    pl.vx = pl.vy = 0;
    this.trail.length = 0;
    this.elementScore(pl.x, pl.y, e);
    sfx.funnel();
    buzz(20);
    this.cameras.main.shake(120, 0.005); // the ride starts with a thump
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

  // Only blue portals take you in; you streak to the yellow one at WARP_SPEED and leave it
  // with a fixed push straight up (PORTAL_EXIT), whatever speed you entered with.
  checkPortals() {
    const pl = this.player;
    if (pl.portalT > 0) return;
    const rr = C.PORTAL_CATCH ** 2;
    for (const pt of this.tower.portalsIn(pl.y - C.PORTAL_CATCH, pl.y + C.PORTAL_CATCH, this.nearItems)) {
      if (pt.color !== 'blue' || pt.gone || (pl.x - pt.x) ** 2 + (pl.y - pt.y) ** 2 > rr) continue;
      // The yellow exit may not be generated yet.
      for (let i = 0; i < 80 && !pt.pair && !pt.gone; i++) this.tower.step();
      const to = pt.pair;
      if (!to) return;
      const dur = Math.max(0.1, Math.hypot(to.x - pl.x, to.y - pl.y) / C.WARP_SPEED);
      pl.warp = { to, x0: pl.x, y0: pl.y, x1: to.x, y1: to.y, t: 0, dur, ang: Math.atan2(to.y - pl.y, to.x - pl.x) };
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
    const k = Math.min(1, w.t / w.dur); // constant speed: straight line, no easing
    pl.x = w.x0 + (w.x1 - w.x0) * k;
    pl.y = w.y0 + (w.y1 - w.y0) * k;
    if (k < 1) return;
    // No momentum carried over: a small push straight up, however you went in.
    Object.assign(pl, { warp: null, portalT: 0.3 });
    this.launch(0, -C.PORTAL_EXIT);
    this.burst(pl.x, pl.y, portalColor(w.to, this.col), 10, 200);
  }

  // Doors are solid once today's best has passed them. Crumbling platforms break
  // CRUMBLE_TIME after first touch and come back after CRUMBLE_RESPAWN.
  solid(p) {
    if (p.type === 'door') return p.n < this.nextDoor;
    if (p.type === 'elevator') return elevatorIdle(p.elev, this.simT);
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
    pl.landT = this.simT;
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
    if (drop <= 2) return;
    const s = this.save;
    s.falls++;
    s.bigFall = Math.max(s.bigFall, drop);
    if (drop >= 5) this.floatText(pl.x, pl.y - 34, `-${Math.round(drop)}m`);
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
        const rr = R + hazardR(hz, this.simT) * 0.8;
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
    this.endRun();
    this.persist();
  }

  // A death starts a new run, on the same day's tower, back at 0m (the run was saved in die).
  respawn() {
    if (this.leaving) return;
    this.leaving = true;
    this.scene.restart({ again: true });
  }

  heightOf(y) {
    return Math.max(0, -(y + C.PLAYER_R) / C.PX_PER_M);
  }

  updateHeight() {
    const pl = this.player;
    const h = this.heightOf(pl.y);
    this.height = h;
    this.runTop = Math.max(this.runTop, h);
    // Every door reached in this run (once per run, even if it was opened earlier) scores by how
    // fast you got there from the previous one, and refills all hearts.
    while (h >= doorHeight(this.runDoor)) {
      const secs = this.runT - this.doorT;
      const tier = C.DOOR_TIERS.find((t) => secs < t.under);
      this.hud.announce(`${tier.word}!`, wordColor(this.col, tier.word));
      this.addScore(tier.pts, pl.x, pl.y);
      this.popText(pl.x, pl.y + 10, `${doorHeight(this.runDoor)}m in ${secs.toFixed(1)}s`, 14, textColors(this.col).plain, 0.75);
      this.runDoor++;
      this.doorT = this.runT;
      // The tower takes on the palette of the section above the door just reached.
      this.setPalette(this.runDoor - 1);
      // All hearts back: each missing one flies up from the ball into its slot in the bar, one
      // after another, and counts on arrival.
      const missing = C.MAX_HP - pl.hp - this.heartsFlying;
      if (missing > 0) {
        sfx.heart();
        this.popText(pl.x, pl.y - 60, `+${missing}♥`, 18, this.colTo.heart);
        this.burst(pl.x, pl.y, this.colTo.heart, 14, 220);
        const fromY = pl.y - this.cameras.main.scrollY;
        const fromX = pl.x;
        for (let k = 0; k < missing; k++) {
          const slot = pl.hp + this.heartsFlying;
          this.heartsFlying++;
          this.time.delayedCall(k * 110, () =>
            this.hud.flyHeart(fromX, fromY, slot, () => {
              this.heartsFlying--;
              if (!pl.dead && pl.hp < C.MAX_HP) pl.hp++;
              this.dirty = true;
            }),
          );
        }
      }
    }
    // The last door: into space (after it has scored).
    if (h >= C.END_HEIGHT && !this.ending) this.startEnding();
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
    if (this.ending) return; // space stays black
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
    const pl = this.player;
    // In the ending the ball sits in the middle of the screen, between the title and the button.
    // It rises fast, so the camera leads it by its speed; otherwise the easing below would trail
    // it by speed / CAM_EASE and the ball would ride up into the title.
    if (this.ending) return pl.y - C.H / 2 + pl.vy / CAM_EASE;
    return pl.y - C.TOP_GAP;
  }

  updateCamera(dt) {
    const cam = this.cameras.main;
    if (this.map) {
      cam.scrollY = this.map.y;
      return;
    }
    const pl = this.player;
    const s = cam.scrollY + (this.cameraTarget() - cam.scrollY) * (1 - Math.exp(-dt * CAM_EASE));
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
      .setStroke(hex(textColors(this.col).outline), 4)
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
    this.popText(x, y + 22, word, 13 + rank, wordColor(this.col, word), 0.8);
  }

  floatText(x, y, text) {
    const t = label(this, x, y, text, 22, 1, false).setStroke(hex(this.col.ink), 6).setDepth(40);
    this.tweens.add({ targets: t, y: y - 50, alpha: 0, delay: 500, duration: 900, onComplete: () => t.destroy() });
  }
}
