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
export const JUMP_COOLDOWN = 0.5;
export const HIT_STUN = 1; // no jumping for this long after a hazard hit, so you drop

// Platforms are solid on every side (doors stay one-way). They are rare: the generator plans a
// path of points up the tower and only this share of them becomes a platform (bouncy pads always do).
export const SOLID_PLATFORMS = false; // switch: false makes every platform one-way, like before
export const PLATFORM_CHANCE = 0.5;
export const SIDE_LEDGE_CHANCE = 0.18;
export const PLAT_THICK = 12; // collision height of a platform below its top

export const DRAG_DEADZONE = 16; // drags shorter than this cancel
export const MAX_DRAG = 190; // drag length for full power
export const SLOWMO = 0.75; // time scale reached while aiming
export const SLOWMO_RAMP = 0.5; // seconds of aiming until time is fully slowed

export const CRUMBLE_TIME = 0.9;
export const CRUMBLE_RESPAWN = 3.5;
// Elements (bouncy pads, funnels, portals, elevators) launch you. While a launch is still
// rising you are purple and see-through: hazards can't hurt you and platforms are one-way.
// While a launch rises, gravity is multiplied by LAUNCH_GRAVITY and the launch speed by its
// square root, so you top out at exactly the same spot, just slower and floatier (0.5: about
// 30% slower, the rise lasts about 40% longer). 1 = full speed.
export const LAUNCH_GRAVITY = 0.65;
export const BOUNCE_MIN = 2400;
export const BOUNCE_MAX = 3000;
export const HIT_COOLDOWN = 1;

export const FUNNEL_W = 150; // mouth width of the funnel (an upside-down cone)
export const FUNNEL_D = 110; // mouth to tip
export const FUNNEL_TUBE = 140; // length of the tube rising from the tip
export const FUNNEL_NECK = 22; // half-width of the tube
export const FUNNEL_SPEED = 900; // px/s while sliding through the funnel and its tube
export const PORTAL_R = 26;
// Invisible catch radius: the blue portal takes you when the ball's center comes this close to
// its center, a little beyond the drawn circle, so a near miss still counts.
export const PORTAL_CATCH = 40;
export const WARP_SPEED = 1400; // px/s flying from the blue portal to the yellow one, whatever the distance
export const PORTAL_EXIT = 1700; // upward speed (px/s) you leave the yellow portal with
export const FUNNEL_RISE = [900, 1300]; // px a funnel fires you above its top

// Elevator: a solid U you drop into from above. It carries you up ELEV_RISE px, speeding up,
// over ELEV_TIME, fires you up at ELEV_LAUNCH, then sinks back over ELEV_RETURN.
export const ELEV_INNER = 140; // inside width
export const ELEV_WALL = 16;
export const ELEV_DEPTH = 96;
export const ELEV_RISE = [900, 1300];
export const ELEV_TIME = 0.8; // moving from the first moment, then surging hard (see elevatorOffset)
export const ELEV_LAUNCH = 3000; // the kick out of the top (~2100px of rise)
export const ELEV_RETURN = 3;
export const ELEV_WAIT = 0; // seconds the ball rests on the elevator's floor before it rides (0: at once)

// Elements come in planned chains, not at random. Each element knows where its launch peaks;
// the next one waits a bit above that peak: you're launched, see it coming into view, then
// jump up to it and land on it (or into it). A full jump rises PEAK (640px), so it's
// always reachable. A star marks every peak. Types come from a shuffle bag, so each comes up regularly.
export const ELEMENT_BAG = ['bouncy', 'bouncy', 'bouncy', 'funnel', 'funnel', 'elevator', 'elevator', 'portal', 'portal'];
// Progression: the height (m) where each element starts appearing. Below the first one there are
// only stars and spikes (and platforms); no chains start until something is unlocked.
export const ELEMENT_FROM = { bouncy: 100, funnel: 300, portal: 500, elevator: 700 };
export const CHAIN_LENGTH = [3, 6]; // elements per chain
export const CHAIN_BREAK = [2, 4]; // path steps between chains
export const CHAIN_DX = [60, 170]; // px sideways from the peak to the next element
// px above the peak of the previous launch, to the part of the next element you aim for.
export const CHAIN_DY = {
  bouncy: [215, 295], // the pad's top: jump past it and land on it
  elevator: [185, 265], // the rim: jump past it and drop in
  funnel: [225, 305], // the mouth: jump up into it
  portal: [225, 305], // the middle of the blue portal
};
// Pads and elevators keep this much clear air above them, so no platform catches you before
// you drop onto them.
export const ELEMENT_HEADROOM = 320;
// Nothing spawns in the first START_CLEAR px above the ground (the tutorial text lives there).
export const START_CLEAR = 900;
export const PORTAL_SPAN = [600, 1000]; // px from a blue portal up to its yellow exit

// Stars are only points: fly within STAR_RADIUS of one to collect it (once per run).
export const STAR_RADIUS = 48;
export const STAR_CHANCE = 0.55;

export const MAX_HP = 3;
export const HEART_LIFE = 10; // seconds a heart lasts once it is on screen
export const HEART_RESPAWN = 12; // seconds after a heart is taken or fades until it comes back
export const HEART_CHANCE = 0.3; // chance of a heart per main platform
export const DOOR_EVERY = 100; // m between doors; passing one refills all hearts
export const RESPAWN_DELAY = 0.9;

// Spikes: each gap of the route draws one pattern from a shuffle bag, so the mix stays varied
// and nothing repeats for long. Sizes and spots vary inside each pattern, and SPIKE_EXTRA adds a
// loose spike now and then on top.
//   spike: one small ball      big: one large ball     saw: moves up and down
//   sawX: moves side to side   pair: a gate, one each side of the route
//   row: three small in a diagonal line                 wall: teeth on a wall    none: a breather
export const SPIKE_BAG = ['spike', 'spike', 'big', 'saw', 'sawX', 'pair', 'row', 'wall', 'none', 'none', 'none', 'none', 'none'];
export const SPIKE_EXTRA = 0.15;
export const SPIKE_CORRIDOR = 80; // px kept clear each side of the route line

// Score (per run; a death starts over). Height itself scores nothing.
// Every element is worth the same: bouncy pad, star, heart, funnel, elevator, portal. Each pad,
// star, funnel, elevator and portal scores once per run; every heart taken scores.
export const SCORE_ELEMENT = 50;
// Elements hit within CHAIN_WINDOW seconds of each other form a chain; the word that pops up
// climbs with it (1st NICE, 2nd GOOD, ... 5th and on FANTASTIC).
export const CHAIN_WINDOW = 2.5;
export const CHAIN_WORDS = ['NICE', 'GOOD', 'GREAT', 'AMAZING', 'FANTASTIC'];
// Reaching a door scores by the seconds since the previous door (or the run's start):
// the first tier whose limit the time is under.
export const DOOR_TIERS = [
  { under: 14, pts: 300, word: 'FANTASTIC' },
  { under: 20, pts: 250, word: 'AMAZING' },
  { under: 28, pts: 200, word: 'GREAT' },
  { under: 38, pts: 150, word: 'GOOD' },
  { under: 50, pts: 100, word: 'NICE' },
  { under: 64, pts: 75, word: 'OK' },
  { under: 80, pts: 50, word: 'SLOW' },
  { under: Infinity, pts: 25, word: 'PHEW' },
];
// Pop-up word colors come from the current palette: which palette role each word uses
// (null = the plain text color). Better words get the more exciting colors.
export const WORD_ROLES = {
  FANTASTIC: 'launched',
  AMAZING: 'heart',
  GREAT: 'star',
  GOOD: 'canJump',
  NICE: null,
  OK: null,
  SLOW: 'cantJump',
  PHEW: 'cantJump',
};

// Game meters: 80px each, so a door every 100m is 8000px apart.
export const PX_PER_M = 80;

export const FONT = '"Segoe UI", system-ui, -apple-system, Roboto, Helvetica, Arial, sans-serif';

// Render at the device's real pixel density; the camera zooms the logical playfield up to it.
const fit = Math.min(win.innerWidth / W, win.innerHeight / H);
export const RES = Math.max(1, Math.min(3, Math.ceil(fit * (win.devicePixelRatio || 1) * 4) / 4));
