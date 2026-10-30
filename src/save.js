import { shiftDay } from './rng.js';

const KEY = 'upupandaway.save.v1';
// The game's earlier names; read once so saves carry over.
const OLD_KEYS = ['chickenjumps.save.v1', 'upfall.save.v1'];
const HISTORY_DAYS = 30;

const num = (v, fallback = 0) => (Number.isFinite(v) ? v : fallback);

// Loads the save and rolls it over to `today`: a save from an earlier day is archived
// into history. Position isn't saved: every page load starts the climb at 0m.
export function load(today) {
  let raw = null;
  try {
    const key = [KEY, ...OLD_KEYS].find((k) => localStorage.getItem(k) !== null) ?? KEY;
    raw = JSON.parse(localStorage.getItem(key));
  } catch {
    raw = null;
  }
  if (!raw || typeof raw !== 'object') raw = {};

  const history = raw.history && typeof raw.history === 'object' ? { ...raw.history } : {};
  const scores = raw.scores && typeof raw.scores === 'object' ? { ...raw.scores } : {};
  const save = {
    day: today,
    best: 0,
    score: 0,
    falls: 0,
    bigFall: 0,
    climbed: 0,
    deaths: 0,
    streak: 1,
    history,
    scores,
    muted: !!raw.muted,
  };

  if (raw.day === today) {
    save.deaths = num(raw.deaths);
    save.best = num(raw.best);
    save.score = num(raw.score);
    save.falls = num(raw.falls);
    save.bigFall = num(raw.bigFall);
    save.climbed = num(raw.climbed);
    save.streak = Math.max(1, num(raw.streak, 1));
  } else {
    if (typeof raw.day === 'string') {
      history[raw.day] = Math.max(num(history[raw.day]), num(raw.best));
      scores[raw.day] = Math.max(num(scores[raw.day]), num(raw.score));
    }
    save.streak = raw.day === shiftDay(today, -1) ? num(raw.streak) + 1 : 1;
  }

  for (const h of [history, scores]) {
    const keys = Object.keys(h).sort();
    for (const k of keys.slice(0, Math.max(0, keys.length - HISTORY_DAYS))) delete h[k];
  }
  return save;
}

export function store(save) {
  try {
    localStorage.setItem(KEY, JSON.stringify(save));
    for (const k of OLD_KEYS) localStorage.removeItem(k);
  } catch {
    // Storage can be unavailable (private mode, quota); the game keeps running without it.
  }
}
