const win = typeof window === 'undefined' ? { innerWidth: 540, innerHeight: 960, devicePixelRatio: 1 } : window;

// Logical playfield size. Width is fixed; height follows the screen's aspect so tall phones
// are filled edge to edge (wide screens get side bars instead).
export const W = 540;
export const H = Math.round(Math.min(1200, Math.max(900, (W * win.innerHeight) / win.innerWidth)));
export const WALL = 10;

export const PLAYER_R = 16;
export const GRAVITY = 2100; // px/s²
export const MAX_FALL = 2600;
// Height of a full-power vertical launch. Fixed (not tied to screen height) so the
// generated tower is identical on every device.
export const PEAK = 640;
// The camera keeps a standing player TOP_GAP below the top edge, so a full launch
// peaks just past the top of the screen.
export const TOP_GAP = PEAK - 60;
export const MIN_LAUNCH = 380; // px/s at the smallest drag
export const MAX_LAUNCH = Math.sqrt(2 * GRAVITY * PEAK); // ~1640 px/s at a full drag
export const WALL_BOUNCE = 0.8;

// Jumps are unlimited, on the ground or in the air, but each one starts a cooldown.
export const JUMP_COOLDOWN = 0.3;
export const HIT_STUN = 1; // no jumping for this long after a hazard hit, so you drop

// Platforms are solid on every side (doors stay one-way). They are rare: the generator plans a
// path of points up the tower and only this share of them becomes a platform (bouncy pads always do).
export const SOLID_PLATFORMS = false; // switch: false makes every platform one-way, like before
export const PLATFORM_CHANCE = 0.5;
export const SIDE_LEDGE_CHANCE = 0.18;
export const PLAT_THICK = 12; // collision height of a platform below its top

export const DRAG_DEADZONE = 16; // drags shorter than this cancel
export const MAX_DRAG = 190; // drag length for full power
export const SLOWMO = 0.15; // time scale reached while aiming
export const SLOWMO_RAMP = 0.9; // seconds of aiming until time is fully slowed

export const CRUMBLE_TIME = 0.9;
export const CRUMBLE_RESPAWN = 3.5;
// Elements (bouncy pads, funnels, portals, elevators) launch you. While a launch is still
// rising you are purple and see-through: hazards can't hurt you and platforms are one-way.
export const BOUNCE_MIN = 2400;
export const BOUNCE_MAX = 3000;
export const HIT_COOLDOWN = 1;

export const FUNNEL_W = 150; // mouth width of the funnel (an upside-down cone)
export const FUNNEL_D = 110; // mouth to tip
export const FUNNEL_TUBE = 140; // length of the tube rising from the tip
export const FUNNEL_NECK = 22; // half-width of the tube
export const FUNNEL_SPEED = 900; // px/s while sliding through the funnel and its tube
export const PORTAL_R = 26;
export const WARP_TIME = 0.9; // seconds to fly from the blue portal to the yellow one
export const PORTAL_EXIT = 1700; // upward speed (px/s) you leave the yellow portal with
export const FUNNEL_RISE = [900, 1300]; // px a funnel fires you above its top

// Elevator: a solid U you drop into from above. It carries you up ELEV_RISE px, speeding up,
// over ELEV_TIME, fires you up at ELEV_LAUNCH, then sinks back over ELEV_RETURN.
export const ELEV_INNER = 140; // inside width
export const ELEV_WALL = 16;
export const ELEV_DEPTH = 96;
export const ELEV_RISE = [700, 1000];
export const ELEV_TIME = 1.3;
export const ELEV_LAUNCH = 2000;
export const ELEV_RETURN = 3;
export const ELEVATOR_CHANCE = 0.12;

// Stars are only points: fly within STAR_RADIUS of one to collect it (once per run).
export const STAR_RADIUS = 48;
export const STAR_CHANCE = 0.55;

export const MAX_HP = 3;
export const HEART_LIFE = 10; // seconds a heart lasts once it is on screen
export const HEART_RESPAWN = 12; // seconds after a heart is taken or fades until it comes back
export const HEART_CHANCE = 0.3; // chance of a heart per main platform
export const DOOR_EVERY = 100; // m between doors; passing one refills all hearts
export const RESPAWN_DELAY = 0.9;

// Everything appears from the start; these are the odds per main platform.
// Chance of a 1st, 2nd, 3rd... spike or saw beside the path in each gap (each rolled only if the previous one was).
export const SPIKE_CHANCES = [0.45, 0.2, 0.05];
export const SAW_CHANCE = 0.4; // share of those that move up and down
export const SPIKE_CORRIDOR = 80; // px kept clear each side of the route line
export const WALL_SPIKE_CHANCE = 0.18;
export const FUNNEL_CHANCE = 0.12;
export const PORTAL_CHANCE = 0.15;

// Score (per run; a death starts over). Height itself scores nothing.
// Every element is worth the same: bouncy pad, star, heart, funnel, elevator, portal. Each pad,
// star, funnel, elevator and portal scores once per run; every heart taken scores.
export const SCORE_ELEMENT = 10;
// Elements hit within CHAIN_WINDOW seconds of each other form a chain; the word that pops up
// climbs with it (1st NICE, 2nd GOOD, ... 5th and on FANTASTIC).
export const CHAIN_WINDOW = 2.5;
export const CHAIN_WORDS = ['NICE', 'GOOD', 'GREAT', 'AMAZING', 'FANTASTIC'];
// Reaching a door scores by the seconds since the previous door (or the run's start):
// the first tier whose limit the time is under.
export const DOOR_TIERS = [
  { under: 5, pts: 300, word: 'FANTASTIC' },
  { under: 7, pts: 250, word: 'AMAZING' },
  { under: 10, pts: 200, word: 'GREAT' },
  { under: 15, pts: 150, word: 'GOOD' },
  { under: 20, pts: 100, word: 'NICE' },
  { under: 25, pts: 75, word: 'OK' },
  { under: 30, pts: 50, word: 'SLOW' },
  { under: Infinity, pts: 25, word: 'PHEW' },
];
// Pop-up word colors; brighter for better words.
export const WORD_COLORS = {
  FANTASTIC: 0xff4fd8,
  AMAZING: 0xb26bff,
  GREAT: 0x3fd0ff,
  GOOD: 0x55e07a,
  NICE: 0xffffff,
  OK: 0xffffff,
  SLOW: 0xffb36b,
  PHEW: 0xffb36b,
};

export const PX_PER_M = 40;

export const FONT = '"Segoe UI", system-ui, -apple-system, Roboto, Helvetica, Arial, sans-serif';

// Render at the device's real pixel density; the camera zooms the logical playfield up to it.
const fit = Math.min(win.innerWidth / W, win.innerHeight / H);
export const RES = Math.max(1, Math.min(3, Math.ceil(fit * (win.devicePixelRatio || 1) * 4) / 4));
