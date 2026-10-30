import * as C from './config.js';
import { formatDay, parseDay, shiftDay } from './rng.js';
import { doorHeight } from './tower.js';
import { sfx, setMuted } from './audio.js';
import { palette, drawHeart, inkHeart, tint, hex, textColors } from './draw.js';
const BAR_W = 120;

export function label(scene, x, y, text, size, alpha = 1, fixed = true) {
  const t = scene.add
    .text(x, y, text, { fontFamily: C.FONT, fontSize: `${size}px`, fontStyle: 'bold', color: '#ffffff', align: 'center' })
    .setOrigin(0.5)
    .setAlpha(alpha)
    .setResolution(C.RES);
  if (fixed) t.setScrollFactor(0);
  return t;
}

// Hearts top-left, the run's score top-center with a thin bar filling toward the run's next
// door (in that door's color), pause top-right. Best height lives in the world as a dashed line.
// Everything is drawn in the section's ink so it reads on any background.
export class Hud {
  constructor(sc) {
    this.sc = sc;
    this.g = sc.add.graphics().setScrollFactor(0).setDepth(50);
    this.scoreText = label(sc, C.W / 2, 44, '0', 34).setDepth(50);
    this.doorText = label(sc, C.W / 2 + BAR_W / 2 + 8, 78, '', 12, 0.75).setOrigin(0, 0.5).setDepth(50);
    // Right-aligned under the pause button.
    this.timer = label(sc, C.W - 34, 76, '0:00', 17, 0.75).setOrigin(1, 0.5).setDepth(50);
    this.banner = label(sc, C.W / 2, C.H * 0.34, '', 54).setDepth(60).setAlpha(0);
    this.queue = [];
    this.busy = false;
    this.doorN = -1;
    this.shownHp = sc.player.hp;
    this.hpPulse = 0;
    this.banner.setShadow(0, 3, 'rgba(0,0,0,0.35)', 10);

    this.pauseZone = sc.add
      .zone(C.W - 44, 43, 80, 80)
      .setScrollFactor(0)
      .setInteractive({ useHandCursor: true })
      .on('pointerup', () => !sc.ending && sc.menu.open());
  }

  update(dt) {
    const { height, runDoor: nextDoor, player, tower, col, runT, score } = this.sc;
    const ink = col.ink;
    // The number counts up to the score and swells, gold, while it does.
    const shown = this.shownScore ?? score;
    const next = score > shown ? Math.min(score, shown + Math.max(1, Math.ceil((score - shown) * Math.min(1, dt * 8)))) : score;
    if (next !== this.shownScore) {
      this.shownScore = next;
      this.scoreText.setText(`${next}`);
    }
    this.scorePunch = Math.max(0, (this.scorePunch || 0) - dt * 2.5);
    const p = this.scorePunch;
    this.scoreText.setScale(1 + 0.25 * p * p);
    if (p > 0 && !this.gold) {
      this.gold = true;
      this.scoreText.setColor(hex(col.star)).setStroke(hex(ink), 6);
      this.scoreText._tint = null; // so tint() recolors it afterwards
    } else if (p === 0 && this.gold) {
      this.gold = false;
      this.scoreText.setStroke(hex(ink), 0);
    }
    if (!this.gold) tint(this.scoreText, ink);
    tint(this.doorText, ink);

    // Run time, under the hearts. Only re-set the text when the second changes.
    const secs = Math.floor(runT);
    if (secs !== this.shownSecs) {
      this.shownSecs = secs;
      this.timer.setText(`${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, '0')}`);
    }
    tint(this.timer, ink);

    if (nextDoor !== this.doorN) {
      this.doorN = nextDoor;
      this.doorColor = palette(tower, nextDoor).door;
      this.doorText.setText(`${doorHeight(nextDoor)}m`);
    }
    if (player.hp !== this.shownHp) {
      this.shownHp = player.hp;
      this.hpPulse = 1;
    }
    this.hpPulse = Math.max(0, this.hpPulse - dt * 3);
    this.landed ??= [];

    const g = this.g;
    g.clear();
    for (let i = 0; i < C.MAX_HP; i++) {
      const x = Hud.slotX(i);
      // A heart that just flew in: the slot bumps up with a ring spreading from it.
      const q = this.landed[i] ? 1 - this.landed[i] : 0;
      if (this.landed[i]) this.landed[i] = Math.max(0, this.landed[i] - dt * 1.8);
      const bump = q > 0 ? Math.sin(q * Math.PI) : 0;
      if (bump > 0) g.lineStyle(2.5, col.heart, bump).strokeCircle(x, 42, 12 + 14 * q);
      if (i < player.hp) inkHeart(g, x, 42, 10 * (1 + 0.25 * this.hpPulse + 0.55 * bump), col.heart, ink);
      else {
        g.fillStyle(ink, 0.22);
        drawHeart(g, x, 42, 10);
      }
    }

    // Progress toward the run's next door, in that door's color.
    const from = doorHeight(nextDoor - 1);
    const k = Math.max(0, Math.min(1, (height - from) / (doorHeight(nextDoor) - from)));
    const x0 = C.W / 2 - BAR_W / 2;
    g.fillStyle(ink, 1).fillRoundedRect(x0 - 2, 74, BAR_W + 4, 8, 4);
    g.fillStyle(col.bg, 1).fillRoundedRect(x0, 76, BAR_W, 4, 2);
    if (k > 0) g.fillStyle(this.doorColor, 1).fillRoundedRect(x0, 76, Math.max(4, BAR_W * k), 4, 2);

    g.fillStyle(ink, 0.8);
    g.fillRoundedRect(C.W - 54, 31, 7, 24, 2);
    g.fillRoundedRect(C.W - 41, 31, 7, 24, 2);
  }

  // Fades the whole top bar out (score, hearts, door bar, timer, pause) for the ending.
  hide() {
    this.pauseZone.disableInteractive();
    this.sc.tweens.add({ targets: [this.g, this.scoreText, this.doorText, this.timer, this.banner], alpha: 0, duration: 600 });
  }

  // Screen x of heart slot i in the bar.
  static slotX(i) {
    return 32 + i * 30;
  }

  // A heart flies from (x, y) on screen up into heart slot `slot` in the bar, swelling then
  // settling, along a curve. `onArrive` runs when it lands (that's when it counts), and the slot
  // bumps with a ring.
  flyHeart(x, y, slot, onArrive) {
    const sc = this.sc;
    const h = sc.add.graphics().setScrollFactor(0).setDepth(55);
    const col = sc.col;
    inkHeart(h, 0, 0, 10, col.heart, col.ink);
    const tx = Hud.slotX(slot);
    const ty = 42;
    const cx = x + (tx - x) * 0.25;
    const cy = Math.min(y, ty) - 90 + (y - ty) * 0.15;
    const p = { k: 0 };
    h.setPosition(x, y).setScale(1.6);
    sc.tweens.add({
      targets: p,
      k: 1,
      duration: 800,
      ease: 'Sine.InOut',
      onUpdate: () => {
        const k = p.k;
        h.setPosition((1 - k) ** 2 * x + 2 * (1 - k) * k * cx + k * k * tx, (1 - k) ** 2 * y + 2 * (1 - k) * k * cy + k * k * ty);
        h.setScale(1.6 + 0.6 * Math.sin(k * Math.PI) - 0.6 * k);
      },
      onComplete: () => {
        h.destroy();
        this.landed ??= [];
        this.landed[slot] = 1;
        onArrive();
      },
    });
  }

  // A score gain makes the HUD number swell; bigger gains swell it more.
  punch(pts) {
    this.scorePunch = Math.min(1, Math.max(this.scorePunch || 0, 0.35 + pts / 600));
  }

  announce(text, color = null) {
    this.queue.push({ text, color });
    if (!this.busy) this.next();
  }

  next() {
    const item = this.queue.shift();
    if (item === undefined) {
      this.busy = false;
      return;
    }
    this.busy = true;
    const b = this.banner;
    const tweens = this.sc.tweens;
    tweens.killTweensOf(b);
    const tc = textColors(this.sc.col);
    b.setText(item.text).setColor(hex(item.color ?? tc.plain)).setStroke(hex(tc.outline), 8).setAlpha(1).setScale(0.6);
    tweens.add({ targets: b, scale: 1, duration: 260, ease: 'Back.Out' });
    tweens.add({ targets: b, alpha: 0, delay: 850, duration: 450, onComplete: () => this.next() });
  }
}

// A rounded "pill" button: a face over a solid drop shadow, with an outline. It sinks onto its
// shadow while pressed and fires on release. Screen-fixed. `primary` fills it with the ink color.
export class PillButton {
  constructor(sc, x, y, w, h, text, onClick, depth = 100) {
    Object.assign(this, { sc, x, y, w, h, down: false, primary: false, colors: { face: 0xffffff, ink: 0x000000 } });
    this.g = sc.add.graphics().setScrollFactor(0).setDepth(depth);
    this.text = label(sc, x, y, text, 19).setDepth(depth + 0.001);
    this.zone = sc.add.zone(x, y, w, h + 6).setScrollFactor(0).setDepth(depth + 0.002).setInteractive({ useHandCursor: true });
    this.zone.on('pointerdown', () => this.press(true));
    this.zone.on('pointerout', () => this.press(false));
    this.zone.on('pointerup', () => {
      const was = this.down;
      this.press(false);
      if (was) {
        sfx.click();
        onClick();
      }
    });
  }

  get parts() {
    return [this.g, this.text, this.zone];
  }

  press(down) {
    this.down = down;
    this.draw();
  }

  // face: the button's fill; ink: outline, shadow and (on a primary button) the fill.
  style(face, ink, primary = this.primary) {
    this.colors = { face, ink };
    this.primary = primary;
    this.draw();
    return this;
  }

  setText(s) {
    this.text.setText(s);
    return this;
  }

  setVisible(v) {
    this.parts.forEach((p) => p.setVisible(v));
    return this;
  }

  setAlpha(a) {
    this.g.setAlpha(a);
    this.text.setAlpha(a);
    return this;
  }

  draw() {
    const { x, y, w, h, g } = this;
    const { face, ink } = this.colors;
    const r = h / 2;
    const sink = this.down ? 4 : 0;
    g.clear();
    g.fillStyle(ink, 1).fillRoundedRect(x - w / 2, y - h / 2 + 5, w, h, r);
    g.fillStyle(this.primary ? ink : face, 1).fillRoundedRect(x - w / 2, y - h / 2 + sink, w, h, r);
    g.lineStyle(3, ink, 1).strokeRoundedRect(x - w / 2, y - h / 2 + sink, w, h, r);
    this.text.setPosition(x, y + sink).setColor(hex(this.primary ? face : ink));
  }
}

// The pause menu: a card in the current palette's colors over a dimmed game. Today's best score
// big, a few stats, the last 7 days, then the buttons.
export class Menu {
  constructor(sc) {
    this.sc = sc;
    this.items = [];
    this.buttons = [];
    const oy = (C.H - 960) / 2; // layout is authored for a 960-tall screen; center it
    this.oy = oy;
    const item = (obj) => {
      this.items.push(obj.setScrollFactor(0).setDepth(100 + this.items.length * 0.01).setVisible(false));
      return obj;
    };
    this.cardX = 46;
    this.cardW = C.W - 92;
    this.cardY = oy + 70;
    this.cardH = 820;

    // Full-screen dim that also swallows touches so they don't start a drag.
    this.dim = item(sc.add.rectangle(C.W / 2, C.H / 2, C.W, C.H, 0x000000, 0.55).setInteractive());
    this.card = item(sc.add.graphics());
    this.title = item(label(sc, C.W / 2, oy + 130, 'PAUSED', 30));
    this.bestLabel = item(label(sc, C.W / 2, oy + 186, 'BEST TODAY', 13, 0.6));
    this.bestValue = item(label(sc, C.W / 2, oy + 232, '0', 52));
    this.dayText = item(label(sc, C.W / 2, oy + 278, '', 14, 0.6));
    // Stats: a two-column list, names left, values right.
    this.statNames = item(label(sc, this.cardX + 44, oy + 312, '', 16, 0.7).setOrigin(0, 0).setAlign('left').setLineSpacing(12));
    this.statValues = item(label(sc, this.cardX + this.cardW - 44, oy + 312, '', 16).setOrigin(1, 0).setAlign('right').setLineSpacing(12));
    this.chartLabel = item(label(sc, C.W / 2, oy + 460, 'LAST 7 DAYS', 13, 0.6));
    this.chart = item(sc.add.graphics());
    this.chartTexts = [];
    for (let i = 0; i < 7; i++) {
      this.chartTexts.push(item(label(sc, 0, 0, '', 12, 0.55)), item(label(sc, 0, 0, '', 11, 0.85)));
    }

    const btn = (y, w, x, text, fn) => {
      const b = new PillButton(sc, x, y, w, 50, text, fn, 101);
      this.buttons.push(b);
      b.setVisible(false);
      return b;
    };
    const full = this.cardW - 88;
    const half = (full - 16) / 2;
    this.resumeBtn = btn(oy + 676, full, C.W / 2, 'RESUME', () => this.close());
    this.soundBtn = btn(oy + 742, half, C.W / 2 - half / 2 - 8, '', () => this.toggleSound());
    this.copyBtn = btn(oy + 742, half, C.W / 2 + half / 2 + 8, 'COPY RESULT', () => this.copy());
    this.restartBtn = btn(oy + 808, full, C.W / 2, '', () => this.restart());
  }

  open() {
    if (this.sc.paused) return;
    this.sc.paused = true;
    this.sc.drag = null;
    this.armed = false;
    this.refresh();
    this.items.forEach((o) => o.setVisible(true));
    this.buttons.forEach((b) => b.setVisible(true));
  }

  close() {
    this.sc.paused = false;
    this.items.forEach((o) => o.setVisible(false));
    this.buttons.forEach((b) => b.setVisible(false));
  }

  refresh() {
    const s = this.sc.save;
    const col = this.sc.col;
    const ink = col.ink;
    const face = col.bg;
    // Card: the palette's background with an ink outline over a solid ink shadow.
    const g = this.card;
    g.clear();
    g.fillStyle(ink, 1).fillRoundedRect(this.cardX, this.cardY + 8, this.cardW, this.cardH, 28);
    g.fillStyle(face, 1).fillRoundedRect(this.cardX, this.cardY, this.cardW, this.cardH, 28);
    g.lineStyle(3, ink, 1).strokeRoundedRect(this.cardX, this.cardY, this.cardW, this.cardH, 28);
    for (const t of [this.title, this.bestLabel, this.bestValue, this.dayText, this.statNames, this.statValues, this.chartLabel, ...this.chartTexts]) tint(t, ink);

    this.bestValue.setText(`${s.score}`);
    this.dayText.setText(formatDay(this.sc.day));
    this.statNames.setText(['this run', 'highest', 'climbed', 'falls · deaths', 'day streak'].join('\n'));
    this.statValues.setText([`${this.sc.score}`, `${Math.floor(s.best)}m`, `${Math.floor(s.climbed)}m`, `${s.falls} · ${s.deaths}`, `${s.streak}`].join('\n'));

    this.resumeBtn.style(face, ink, true);
    for (const b of [this.soundBtn, this.copyBtn, this.restartBtn]) b.style(face, ink, false);
    this.soundBtn.setText(s.muted ? 'SOUND OFF' : 'SOUND ON');
    this.restartBtn.setText('RESTART TOWER');
    this.copyBtn.setText('COPY RESULT');
    this.drawChart(ink);
  }

  // Best score for each of the last 7 days, today on the right and solid.
  drawChart(ink) {
    const s = this.sc.save;
    const days = [];
    for (let i = 6; i >= 0; i--) {
      const key = shiftDay(this.sc.day, -i);
      days.push({ key, value: i === 0 ? s.score : s.scores[key] || 0 });
    }
    const max = Math.max(10, ...days.map((d) => d.value));
    const g = this.chart;
    const base = this.oy + 608;
    const bw = 38;
    const gap = 14;
    const x0 = C.W / 2 - (7 * bw + 6 * gap) / 2;
    g.clear();
    g.lineStyle(2, ink, 0.25).lineBetween(x0 - 8, base, x0 + 7 * bw + 6 * gap + 8, base);
    days.forEach((d, i) => {
      const x = x0 + i * (bw + gap);
      const h = d.value > 0 ? Math.max(4, (d.value / max) * 100) : 0;
      if (h > 0) g.fillStyle(ink, i === 6 ? 1 : 0.3).fillRoundedRect(x, base - h, bw, h, Math.min(6, h / 2));
      this.chartTexts[i * 2].setText(`${parseDay(d.key).getDate()}`).setPosition(x + bw / 2, base + 14);
      this.chartTexts[i * 2 + 1].setText(d.value > 0 ? `${Math.floor(d.value)}` : '').setPosition(x + bw / 2, base - h - 11);
    });
  }

  toggleSound() {
    const s = this.sc.save;
    s.muted = !s.muted;
    setMuted(s.muted);
    this.soundBtn.setText(s.muted ? 'SOUND OFF' : 'SOUND ON');
    this.sc.persist();
  }

  copy() {
    const s = this.sc.save;
    const text = [
      `UP UP AND AWAY ·${formatDay(this.sc.day)}`,
      `★ ${s.score} points today`,
      `▲ ${Math.floor(s.best)}m highest`,
      `${s.falls} falls · longest ${Math.floor(s.bigFall)}m`,
      `${s.streak} day streak`,
    ].join('\n');
    const done = (ok) => {
      this.copyBtn.setText(ok ? 'COPIED' : 'COPY FAILED');
      this.sc.time.delayedCall(1400, () => this.copyBtn.setText('COPY RESULT'));
    };
    if (navigator.clipboard?.writeText) navigator.clipboard.writeText(text).then(() => done(true), () => done(fallbackCopy(text)));
    else done(fallbackCopy(text));
  }

  restart() {
    if (!this.armed) {
      this.armed = true;
      this.restartBtn.setText('TAP AGAIN TO RESTART');
      return;
    }
    this.sc.restartTower();
  }
}

function fallbackCopy(text) {
  const ta = document.createElement('textarea');
  ta.value = text;
  ta.style.position = 'fixed';
  ta.style.opacity = '0';
  document.body.appendChild(ta);
  ta.select();
  let ok = false;
  try {
    ok = document.execCommand('copy');
  } catch {
    ok = false;
  }
  ta.remove();
  return ok;
}
