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
export const WARP_SPEED = 2200; // px/s flying from the blue portal to the yellow one, whatever the distance
export const PORTAL_EXIT = 2600; // upward speed (px/s) you leave the yellow portal with
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

// Balloon: touch it (or its string) and you hang on, floating up BALLOON_RISE over BALLOON_TIME,
// swaying, then let go at the top with a small push up (BALLOON_EXIT). Back after BALLOON_RETURN.
export const BALLOON_R = 24;
export const BALLOON_STRING = 46; // from the balloon down to where you hang
export const BALLOON_RISE = [600, 800];
export const BALLOON_TIME = 1.3;
export const BALLOON_EXIT = 900;
export const BALLOON_RETURN = 5;

// Bubble: it swallows you and floats up at BUBBLE_SPEED. Tap to pop it whenever you like; at the
// top of its rise it pops by itself. Popping pushes you up at BUBBLE_EXIT. Back after BUBBLE_RETURN.
export const BUBBLE_R = 34;
// Bubbles drift side to side while they wait: up to BUBBLE_DRIFT px each way, one sway every
// BUBBLE_SWAY seconds. They carry you up from wherever you catch them.
export const BUBBLE_DRIFT = [50, 100];
export const BUBBLE_SWAY = [2.6, 4.2];
export const BUBBLE_RISE = [700, 1000];
export const BUBBLE_SPEED = 600;
export const BUBBLE_EXIT = 800;
export const BUBBLE_RETURN = 4;

// Planet: its orbit ring catches you and you circle it at ORBIT_SPIN. Tap to fling off along the
// circle; after ORBIT_MIN_TURN of a turn it flings you straight up by itself. Fling speed ORBIT_EXIT.
export const PLANET_R = 30;
export const ORBIT_R = 86;
export const ORBIT_SPIN = 10; // rad/s (about 1.6 turns a second)
export const ORBIT_MIN_TURN = 0.75; // turns before the automatic fling
export const ORBIT_EXIT = 2700;
export const ORBIT_COOLDOWN = 1; // s before a planet can catch you again

// Kite: flies back and forth across the screen (KITE_SPAN px each way), its tail hanging
// KITE_TAIL below. Touch it (or its tail) and it takes off at once, from right there, at
// KITE_ANGLE toward the middle at KITE_SHOT, as if shot itself, carrying you under it all the
// way to the top of the flight, where it lets go and drifts away.
export const KITE_SPAN = [120, 170];
export const KITE_FLY = [3.5, 5]; // seconds for one pass there and back
export const KITE_TAIL = 70;
export const KITE_ANGLE = (75 * Math.PI) / 180;
export const KITE_SHOT = 2000;
export const KITE_RETURN = 5;

// Comet (an electric field): fly into the field and you're trapped in its middle for COMET_TRAP
// seconds, crackling, while a comet streaks in from below. It hits you and blasts you off at
// COMET_ANGLE (toward the middle of the screen) at COMET_HIT. The strongest launch in the game
// (it unlocks last): it throws you higher than an elevator does.
export const FIELD_R = 56;
export const COMET_TRAP = 0.3;
export const COMET_R = 18;
export const COMET_ANGLE = (80 * Math.PI) / 180;
export const COMET_HIT = 4000;
export const COMET_COOLDOWN = 1.5;

// Wind gust (an updraft): a column of wind blowing up. However you enter it (any direction, any
// speed), it takes you over: your sideways motion dies, you're drawn to its middle and carried
// straight up at WIND_MAX (pulsing a little). WIND_GRIP is how fast it takes over (higher is
// snappier). Inside you count as launched (invincible, the lighter launch gravity), so you sail on
// well past its top. Not a chain element: each route gap has WIND_CHANCE of one.
export const WIND_W = [85, 125]; // column width
export const WIND_H = [450, 700]; // column height
export const WIND_GRIP = 14; // per second
export const WIND_MAX = 1300; // upward speed it carries you at, at full gust (a gentle lift past its top)
export const WIND_CHANCE = 0.22;

// Rail: a ramp that curves up. Touch it anywhere to latch on, slide at RAIL_SPEED, and get flung
// off the end along the track at RAIL_EXIT. Back after RAIL_COOLDOWN.
export const RAIL_GRAB = 24; // px from the track that latches you
// The track's shape: from its start it runs RAIL_ACROSS sideways, dipping RAIL_DIP below the
// start on the way, and ends RAIL_UP above the start.
export const RAIL_ACROSS = 320;
export const RAIL_DIP = 50;
export const RAIL_UP = 280;
export const RAIL_SPEED = 900;
export const RAIL_EXIT = 2000;
export const RAIL_COOLDOWN = 1.5;

// Elements come in planned chains, not at random. Each element knows where its launch peaks;
// the next one waits a bit above that peak: you're launched, see it coming into view, then
// jump up to it and land on it (or into it). A full jump rises PEAK (640px), so it's
// always reachable. A star marks every peak.
// Which element comes next is a weighted pick among the unlocked ones: an element starts at full
// weight when it unlocks and halves every ELEMENT_FADE m after, down to ELEMENT_MIN_WEIGHT, so the
// newest elements dominate each stage and old ones only turn up now and then. The type just used
// counts ELEMENT_REPEAT as much, so the same one rarely comes twice in a row.
export const ELEMENT_FADE = 300;
export const ELEMENT_MIN_WEIGHT = 0.1;
export const ELEMENT_REPEAT = 0.3;
// Progression: the height (m) where each element starts appearing. Below the first one there are
// only stars and spikes (and platforms); no chains start until something is unlocked.
export const ELEMENT_FROM = {
  balloon: 100, // touch it, float up: can't really miss
  bubble: 200, // drifting; catch it, popping early is optional
  bouncy: 300, // spring: land on it from above
  kite: 500, // flying; grab the tail, shot at 75°
  funnel: 600, // jump up into its mouth
  rail: 800, // latch on, flung sideways off the end
  elevator: 1000, // drop into a solid U: the biggest launch
  portal: 1300, // reappear somewhere else, read the new screen
  wind: 1500, // updraft columns (not chain elements)
  planet: 1700, // circle it, tap to fling: timing
  comet: 2000, // electric field: trapped, then blasted off
};
// The climb ends here. Past it is space: a black level with stars and nothing else. Reaching it,
// gravity turns off, control stops, and your speed eases (END_EASE per second) to straight up at
// END_SPEED; END_TITLE seconds later the title drops in and a restart button appears.
export const END_HEIGHT = 2500;
export const END_SPEED = 1300;
export const END_EASE = 2.5;
export const END_TITLE = 2; // seconds of rising before the title drops in
export const END_BUTTON = 1; // seconds after the title before PLAY AGAIN appears
// Higher up, elements are stronger, so there are fewer of them: chains get shorter and the breaks
// between them longer, from the first range at the ground to the second at END_HEIGHT.
export const CHAIN_LENGTH = [[3, 6], [2, 3]]; // elements per chain
export const CHAIN_BREAK = [[2, 4], [5, 8]]; // path steps between chains
export const CHAIN_DX = [60, 170]; // px sideways from the peak to the next element
// px above the peak of the previous launch, to the part of the next element you aim for.
export const CHAIN_DY = {
  bouncy: [215, 295], // the pad's top: jump past it and land on it
  elevator: [185, 265], // the rim: jump past it and drop in
  funnel: [225, 305], // the mouth: jump up into it
  portal: [225, 305], // the middle of the blue portal
  balloon: [225, 305], // where you hang, at the end of the string
  bubble: [225, 305], // the bubble's middle
  planet: [225, 305], // the planet's middle (its orbit ring reaches ORBIT_R below that)
  rail: [225, 305], // the start of the track
  kite: [225, 305], // the end of the tail
  comet: [225, 305], // the electric field's middle
};
// Pads and elevators keep this much clear air above them, so no platform catches you before
// you drop onto them.
export const ELEMENT_HEADROOM = 320;
// Nothing spawns in the first START_CLEAR px above the ground (the tutorial text lives there).
export const START_CLEAR = 900;
export const PORTAL_SPAN = [900, 1400]; // px from a blue portal up to its yellow exit

// Stars are only points: fly within STAR_RADIUS of one to collect it (once per run).
export const STAR_RADIUS = 48;
export const STAR_CHANCE = 0.55;

export const MAX_HP = 5;
export const HEART_LIFE = 10; // seconds a heart lasts once it is on screen
export const HEART_RESPAWN = 12; // seconds after a heart is taken or fades until it comes back
export const HEART_CHANCE = 0.3; // chance of a heart per main platform
export const DOOR_EVERY = 100; // m between doors; passing one gives back one heart (it flies up to the bar)
export const RESPAWN_DELAY = 0.9;

// Spikes: each gap of the route draws one pattern from a shuffle bag, so the mix stays varied
// and nothing repeats for long. Sizes and spots vary inside each pattern, and SPIKE_EXTRA adds a
// loose spike now and then on top.
//   spike: one small ball      big: one large ball     saw: moves up and down
//   sawX: moves side to side   pair: a gate, one each side of the route
//   row: three small in a diagonal line                 wall: teeth on a wall    none: a breather
export const SPIKE_BAG = ['spike', 'spike', 'big', 'saw', 'sawX', 'pair', 'row', 'wall', 'none', 'none', 'none', 'none', 'none'];
// Spikes get harder as you climb: each of these goes from its first value at the ground to its
// second at END_HEIGHT, along a curve (height fraction ^ SPIKE_CURVE): gentle early, steep late.
export const SPIKE_CURVE = 1.4;
export const SPIKE_SKIP = [0.2, 0]; // chance a gap's pattern is left out (more breathers early)
export const SPIKE_FILL = [0, 0.9]; // chance a 'none' (breather) gap gets a pattern anyway
export const SPIKE_DOUBLE = [0, 0.5]; // chance of a second pattern in the same gap
export const SPIKE_EXTRA = [0.05, 0.55]; // chance of a loose extra spike
export const SAW_SPEED = [1, 1.6]; // how fast saws swing
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
