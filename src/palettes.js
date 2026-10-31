// Color palettes. Each section of the tower (between two doors) has one; reaching a door fades
// to the next. `bg` is the background, `fg` the contrast tone (platforms, outlines, text), and
// `accents` the object colors.
//
// The order is a planned journey, the same every day: the climb starts in soft pastels and goes
// through the day, sunset and night into space. Neighbors are close in color so each door is a
// gentle step. One palette per 100m section: 25 take you to the end at 2500m. They were picked
// for contrast (the ball and elements stand out from the background in both color and brightness).
// Past the end, the last act (LOOP_FROM on) would repeat.
//
// Object roles are picked from the accents by hue (see expand): the ball is a cool color while it
// can jump, a warm one while it can't, and a purple/magenta while a launch makes it invincible.
//
// Preview them with `npm run palettes` (writes palette-preview/palettes.png).

export const PALETTES = [
  // Pastel dawn: soft mint, pale blue and sky
  { name: 'Seaglass', mood: 'pastel', bg: '#d8f3dc', fg: '#1b4332', accents: ['#40916c', '#ff8fab', '#4895ef', '#ffd166', '#9d4edd'] },
  { name: 'Arctic', mood: 'pastel', bg: '#eaf6fb', fg: '#16324f', accents: ['#4ea8de', '#ff6b6b', '#ffd166', '#72efdd', '#b388eb'] },
  { name: 'Bubblegum Sky', mood: 'pastel', bg: '#dff3ff', fg: '#23304a', accents: ['#ff9ecf', '#5aa9f0', '#ffd36e', '#a0e8af', '#b38cff'] },
  // Daylight and noon: paper white, then the sun
  { name: 'Bauhaus', mood: 'bright', bg: '#f4efe1', fg: '#111111', accents: ['#e63946', '#1d3557', '#f1c40f', '#2a9d8f', '#f77f00'] },
  { name: 'Tropical', mood: 'bright', bg: '#ffe66d', fg: '#1a1a2e', accents: ['#ff6b6b', '#1a9e97', '#1a535c', '#ff9f1c', '#c44dff'] },
  // Sunset: a saturated magenta sky, from the sun into the purples
  { name: 'Magenta Dusk', mood: 'bright', bg: '#c2185b', fg: '#fff0f5', accents: ['#ffd23f', '#3bceac', '#7fd1f5', '#ff9e57', '#b39dff'] },
  // Dusk: purples
  { name: 'Grape Soda', mood: 'dark', bg: '#5b2386', fg: '#fbeaff', accents: ['#ffd23f', '#3bceac', '#ff6f91', '#9ad1ff', '#ff9a3c'] },
  { name: 'Disco', mood: 'bright', bg: '#3a0ca3', fg: '#ffffff', accents: ['#f72585', '#4cc9f0', '#ffd60a', '#06d6a0', '#ff9e00'] },
  // Blue hour: deep blues and the sea
  { name: 'Ocean Blue', mood: 'bright', bg: '#1b64a8', fg: '#ffffff', accents: ['#7ee0d1', '#ffa8c5', '#ffd77a', '#c9c6ff', '#0b2540'] },
  { name: 'Cobalt Night', mood: 'dark', bg: '#0b2a6f', fg: '#eef3ff', accents: ['#ffcf56', '#ff6b6b', '#5ef2c2', '#ff9de2', '#ffffff'] },
  { name: 'Blueprint', mood: 'dark', bg: '#0e3a5f', fg: '#e8f1ff', accents: ['#ffd60a', '#ff5a5f', '#7ae7ff', '#c1ff9b', '#ff99c8'] },
  { name: 'Deep Sea', mood: 'dark', bg: '#04293a', fg: '#ecf9ff', accents: ['#00c2cb', '#64f4ac', '#ffd23f', '#ee4266', '#9ad1ff'] },
  // Night woods: dark greens and slate
  { name: 'Forest Floor', mood: 'earthy', bg: '#233d2b', fg: '#f1f7ed', accents: ['#e9c46a', '#f4a261', '#e76f51', '#8ecae6', '#b5e48c'] },
  { name: 'Midnight Garden', mood: 'dark', bg: '#0f1a14', fg: '#eaf4e4', accents: ['#7bd389', '#f7b2bd', '#f6e27f', '#a0c4ff', '#ff8c61'] },
  { name: 'Slate & Coral', mood: 'dull', bg: '#2f3640', fg: '#f5f6fa', accents: ['#ff7f6b', '#ffd479', '#7ed6df', '#c7ecee', '#e056fd'] },
  { name: 'Ink & Gold', mood: 'dark', bg: '#14141f', fg: '#f4ecd8', accents: ['#e0b04f', '#e05d5d', '#5fb4e0', '#7ad18a', '#c38ce0'] },
  { name: 'Volcano', mood: 'dark', bg: '#1c0f0f', fg: '#ffeede', accents: ['#ff4d1a', '#ffb000', '#00c2d1', '#9b5de5', '#f15bb5'] },
  // Toward space: neon in the dark
  { name: 'Plum Jam', mood: 'dark', bg: '#3d1a3b', fg: '#ffeef8', accents: ['#ff7096', '#ffd166', '#56cfe1', '#80ffdb', '#ff9e00'] },
  { name: 'Vaporwave', mood: 'neon', bg: '#2d1b4e', fg: '#fff0fb', accents: ['#ff71ce', '#01cdfe', '#05ffa1', '#fffb96', '#b967ff'] },
  { name: 'Synthwave', mood: 'neon', bg: '#1a0933', fg: '#ffe8ff', accents: ['#ff00a0', '#ff8a00', '#ffe600', '#00e1ff', '#b26cff'] },
  { name: 'Galaxy', mood: 'dark', bg: '#120f2d', fg: '#f1edff', accents: ['#7b5cff', '#ff6ad5', '#38e1ff', '#ffd56b', '#5effa8'] },
  { name: 'Neon Arcade', mood: 'neon', bg: '#0b0221', fg: '#f8f7ff', accents: ['#ff2bd6', '#00f0ff', '#f9f871', '#7cff4f', '#ff6b1a'] },
  { name: 'Night Market', mood: 'dark', bg: '#101820', fg: '#fef6e4', accents: ['#fee715', '#f582ae', '#00ebc7', '#ff8906', '#8bd3dd'] },
  { name: 'Cyber Lime', mood: 'neon', bg: '#0d0d0d', fg: '#eaffd0', accents: ['#c6ff00', '#00e5ff', '#ff3d71', '#ffea00', '#d500f9'] },
  { name: 'Toxic', mood: 'neon', bg: '#111111', fg: '#f2ffe6', accents: ['#b6ff00', '#00ffb3', '#ff00f5', '#ffe100', '#00b3ff'] },
];

export function mixColor(a, b, k) {
  const ch = (s) => Math.round(((a >> s) & 255) + (((b >> s) & 255) - ((a >> s) & 255)) * k);
  return (ch(16) << 16) | (ch(8) << 8) | ch(0);
}

const toInt = (s) => parseInt(s.slice(1), 16);

function hsl(c) {
  const r = ((c >> 16) & 255) / 255;
  const g = ((c >> 8) & 255) / 255;
  const b = (c & 255) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  const d = max - min;
  if (d === 0) return { h: 0, s: 0, l };
  const s = d / (1 - Math.abs(2 * l - 1));
  let h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  h = (h * 60 + 360) % 360;
  return { h, s, l };
}

const hueDist = (a, b) => Math.min(Math.abs(a - b), 360 - Math.abs(a - b));
const rgbDist = (a, b) => Math.hypot(((a >> 16) & 255) - ((b >> 16) & 255), ((a >> 8) & 255) - ((b >> 8) & 255), (a & 255) - (b & 255));

// Roles: [hue target, max hue distance, fallback]. canJump is cool, cantJump warm, launched purple.
const ROLES = {
  canJump: [205, 50, 0x3fa9ff],
  cantJump: [5, 30, 0xff4a4a],
  launched: [290, 45, 0xb45cff],
  star: [50, 20, 0xffd84a],
  heart: [340, 25, 0xff6f9f],
};

// Full palette for one entry: background, contrast tone, and every object's color.
export function expand(p) {
  const bg = toInt(p.bg);
  const fg = toInt(p.fg);
  // Usable accents: colorful (not white, black or grey) and clearly visible on the background.
  const accents = p.accents.map(toInt).filter((c) => {
    const { s, l } = hsl(c);
    return s > 0.3 && l > 0.2 && l < 0.88 && rgbDist(c, bg) > 80;
  });
  // A fallback that blends into the background is pushed toward the contrast tone.
  const visible = (c) => (rgbDist(c, bg) > 110 ? c : mixColor(c, fg, 0.45));
  const used = new Set();
  const pick = (role, exclusive) => {
    const [target, range, fallback] = ROLES[role];
    let best = null;
    let bestD = range;
    for (const c of accents) {
      if (exclusive && used.has(c)) continue;
      const d = hueDist(hsl(c).h, target);
      if (d <= bestD) {
        best = c;
        bestD = d;
      }
    }
    const c = best ?? visible(fallback);
    if (exclusive) used.add(c);
    return c;
  };
  // The three ball states must differ, and hearts must not look like the warm danger color.
  // The star may share a color.
  const canJump = pick('canJump', true);
  const cantJump = pick('cantJump', true);
  // Invincible: a purple/magenta accent if there is one, else the palette's most saturated
  // leftover accent, and only then the fallback purple.
  const sat = (c) => hsl(c).s;
  const spare = () => accents.filter((c) => !used.has(c)).sort((a, b) => sat(b) - sat(a));
  let launched = pick('launched', false);
  if (!accents.includes(launched) || used.has(launched)) launched = spare()[0] ?? visible(ROLES.launched[2]);
  used.add(launched);
  const heart = pick('heart', true);
  const star = pick('star', false);
  // Elements get their own colors, always the palette's accents (their shapes tell them apart).
  // A looser visibility rule than the ball's, so muted palettes still have choices. Accents the
  // ball doesn't use come first; the warm danger color is never used.
  const raw = p.accents.map(toInt).filter((c) => {
    const { s, l } = hsl(c);
    return s > 0.15 && l < 0.95 && rgbDist(c, bg) > 60 && c !== cantJump;
  });
  const free = raw.filter((c) => c !== canJump && c !== launched).sort((a, b) => sat(b) - sat(a));
  const pool = [...free, ...raw.filter((c) => !free.includes(c))];
  if (!pool.length) pool.push(visible(mixColor(bg, fg, 0.55)));
  const el = (i) => pool[i % pool.length];
  // The exit portal must differ from the entry; with a single color, a lighter tint of it.
  const exit = pool.length > 1 ? (el(3) === el(2) ? el(4) : el(3)) : mixColor(el(2), 0xffffff, 0.45);
  return {
    name: p.name,
    canJump,
    cantJump,
    launched,
    star,
    heart,
    hazard: cantJump, // warm means "danger / not now"
    bouncy: el(0),
    elevator: el(1),
    portalBlue: el(2), // the entry
    portalYellow: exit,
    balloon: el(3),
    // The bubble is mostly see-through, so it gets the accent that stands out most from the background.
    bubble: [...pool].sort((a, b) => rgbDist(b, bg) - rgbDist(a, bg))[0],
    planet: el(5),
    rail: el(6),
    kite: el(7),
    comet: star, // a bright streak, like a shooting star
    wind: mixColor(fg, bg, 0.25), // wind lines in a soft version of the contrast tone
    bg,
    door: bg,
    ink: fg,
    wall: mixColor(bg, fg, 0.14),
    deco: fg,
    plat: fg,
    fill: mixColor(bg, fg, 0.15), // the inside of funnels
    spark: mixColor(fg, 0xffffff, 0.5), // flashes and sparks
  };
}

export const EXPANDED = PALETTES.map(expand);

// Index of the first palette of the last act (space), which repeats once the journey runs out.
export const LOOP_FROM = PALETTES.findIndex((p) => p.name === 'Plum Jam');

// Space, past the last door: total black with white starlight.
export const SPACE = expand({ name: 'Space', mood: 'space', bg: '#000000', fg: '#eef1ff', accents: ['#8fb8ff', '#ff6b8b', '#c79bff', '#ffe27a', '#7ff0d4'] });

// The palette for section n (above door n).
export function sectionPalette(n) {
  const len = EXPANDED.length;
  return EXPANDED[n < len ? n : LOOP_FROM + ((n - len) % (len - LOOP_FROM))];
}
