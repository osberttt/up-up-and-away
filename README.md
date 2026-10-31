# Up Up and Away

**Digit7 Jam 2026 submission** · version **1.0.0** · submission tag `v1.0.0`

| | |
|---|---|
| Game title | Up Up and Away |
| Developer | Min Htet Naing (Osbert), solo |
| Main contact | Min Htet Naing (Osbert) · minhtetnaing25mhn@gmail.com · Telegram @minhtetnaing111 |
| Genre | Arcade vertical climber (one-touch slingshot) |
| Engine | Phaser 3.90 (JavaScript), built with Vite |
| Playable link | [[DIGIT7S HOSTING URL]] |

## 1. What it is

Up Up and Away is a one-finger arcade climber about going up, then up, then *woooo*. Drag anywhere and release to fling a small ball upward like a slingshot. Hop between springs, balloons, kites, portals, planets and more that launch you higher, and chain them into combos. Avoid the spikes, climb through 25 doors and a hand-picked colour journey from soft pastel mornings to the night sky, and at 2500 m float off into space.

Every run climbs a new random tower. Today's best score, the last 7 runs and the day streak are kept on the device.

## 2. How to open and play

- **Online:** open the playable link above in any modern browser. Nothing to install, no account.
- **From the ZIP:** unzip `Digit7Jam_Osbert_UpUpAndAway.zip` and serve the folder with any static web server, then open `index.html` through it. For example: `npx serve Digit7Jam_Osbert_UpUpAndAway_Build`. Opening `index.html` straight from disk (`file://`) is blocked by some browsers for JavaScript modules.
- **From source:** see [Build and run from source](#build-and-run-from-source).

## 3. Controls and gameplay

| Action | Touch (mobile) | Mouse (desktop) |
|---|---|---|
| Fling the ball | Drag anywhere, release. It flies the opposite way; a longer drag is stronger. | Same, with the mouse button |
| Aim carefully | Hold the drag: time slows down | Same |
| Pop a bubble / let go of a planet | Tap | Click |
| Pause | Pause button, top right | Pause button, or **Esc** |

**Rules**

- You can fling as often as you like, on the ground or in mid-air, with a 0.5 s cooldown. The ball is blue when ready and warm-coloured while cooling down.
- You have **3 hearts**. Spikes, saws and wall spikes cost one and stop your flinging for a second, so you drop. Losing the last heart sends you back to 0 m and starts a new run.
- **Doors** sit every 100 m. Passing one refills all your hearts (they fly up to the heart bar) and changes the colour palette. Doors you have opened stay as floors you can't fall below today.
- **Elements launch you.** While a launch rises the ball turns purple and see-through: it is invincible and passes up through platforms. Each launch peaks where the next element waits a little above, so you can chain them.
- The climb ends at **2500 m**: you float off into space and the title appears.

**Elements, in the order they unlock**

| From | Element | How it works |
|---|---|---|
| 0 m | Stars, spikes | Stars are points (fly through the faint ring). Spikes hurt. |
| 0 m | Balloon | Touch it or its string: float up, then a small push. |
| 100 m | Spring | Land on it from above to bounce up. |
| 200 m | Updraft | A wind column that carries you straight up. |
| 300 m | Kite | Touch it and it takes off with you under it. |
| 500 m | Bubble | Drifts side to side. It swallows you and rises; tap to pop early. |
| 600 m | Funnel | Jump up into its mouth; it fires you up out of its tube. |
| 800 m | Planet | Its ring catches you and you circle it; tap to fling off. |
| 1000 m | Elevator | Drop into the U: it surges up and kicks you out. |
| 1300 m | Portal | Fly into the swirl, come out of the burst higher up. |
| 1500 m | Rail | Touch the track, slide the ramp, get flung off the end. |
| 2000 m | Comet | An electric field traps you for a moment, then a comet blasts you up. |

Higher up, elements are stronger and fewer, and older ones turn up less. Spikes grow denser and faster toward the top, and new kinds join as you climb: swinging saws (150 m, 250 m), patrolling spikes (400 m), pulsing spikes that grow and shrink (700 m), wide, slowly turning rings of spikes you time your way through (1100 m) and wavy spikes (1600 m). A faint line shows where each moving spike goes.

**Score.** Each element is worth +50, hit within 2.5 s of each other for a chain (NICE → GOOD → GREAT → AMAZING → FANTASTIC). Doors score by speed since the previous door: under 14 s is +300, down to +25 for slow climbs. Height alone scores nothing. Today's best run score is saved.

## 4. Supported browsers

Current stable versions of **Google Chrome, Microsoft Edge, Mozilla Firefox and Apple Safari**, on desktop and mobile. The game renders with WebGL and falls back to Canvas automatically. No browser flags, extensions or special settings are needed.

Tested on: iPhone 12 Pro (iOS), plus a desktop browser during development.

## 5. Supported devices

- **Mobile:** Android 10+ and iOS 16+ phones and tablets (touch).
- **Desktop:** Windows 10/11 and macOS (mouse).

## 6. Orientation, resolution and aspect ratio

- **Recommended orientation:** portrait.
- **Playfield:** 540 units wide; its height adapts to the screen (900 to 1200 units), so tall phones are filled edge to edge.
- **Mobile:** works at 360 × 640 and up. Recommended aspect ratio 9:16 to 9:21.
- **Desktop:** works at 1280 × 720 and up. On a landscape screen the game is shown as a centred portrait column, with side bars filled in the current palette colour.
- Text, buttons and the score are scaled with the playfield and stay readable without zooming. No horizontal scrolling. Rendering is sharp on high-DPI screens.

## 7. Internet, APIs and third-party services

**None.** After the page has loaded the game makes no network requests. There are no analytics, ads, trackers, accounts, external APIs, external fonts or remote leaderboards. Progress (today's best score, stats, streak, the last 30 days of scores, and the sound setting) is stored only in the browser's `localStorage` on the device.

## 8. Known bugs and limitations

- In private/incognito browsing, or if storage is blocked, progress isn't kept between visits. The game itself still plays normally.
- Sound starts after the first touch or click, as browsers require.
- Vibration only works where the browser supports it (most Android browsers; not iOS Safari).
- Popping a bubble early, or flinging off a planet at another angle, can leave the next element of a chain out of reach. That is the risk of the choice.
- Where you catch a kite shifts where you land by up to about 170 px to the side.
- On a device running below about 20 frames per second the game slows down rather than skipping ahead.
- The design documents in `docs/` were written for an earlier version of the game and are partly out of date. This README describes the submitted version.

## 9. Special testing instructions

- **Quick look at later content:** the full climb takes a while. To see late elements and the ending quickly, build from source and run `npm run dev`, then open:
  - `http://localhost:5280/?at=1500` to start at 1500 m (any height works);
  - `http://localhost:5280/?at=2400&force=kite` to start at 2400 m with every chain element forced to one type;
  - `http://localhost:5280/?seed=abc` to play the same tower every time (any word works);
  - in dev mode, press **M** to open a scrollable map of the tower and **T** to teleport there.

  These test options exist **only** in the development server, not in the released build.
- **A fresh start:** the pause menu has **RESTART TOWER** (tap twice). Clearing the site's storage resets everything.
- **A new tower each run:** every run (each page load, death or PLAY AGAIN) generates a new random tower, so two testers will not see the same climb.

## 10. Third-party tools and libraries

| Name | Use | Licence |
|---|---|---|
| [Phaser](https://phaser.io) 3.90.0 | Game framework (included in the build) | MIT |
| [Vite](https://vite.dev) 8 | Development server and build tool (not shipped) | MIT |
| Node.js | Runs the build and the test scripts (not shipped) | MIT |

## 11. Asset credits

Everything you see and hear is made by the game's own code. There are **no image, sprite, font, music or sound files**:

- **Graphics:** drawn at runtime with code (circles, polygons, lines).
- **Sound:** synthesized at runtime with the Web Audio API.
- **Text:** the device's built-in system font (Segoe UI / system-ui / -apple-system / Roboto, whichever is installed). No font is bundled or downloaded.
- **Colour palettes:** all 50 colour sets were generated with AI (Claude) and arranged into a colour journey under my direction (see section 12).

Full list: [submission/ASSET_CREDITS.md](submission/ASSET_CREDITS.md).

## 12. AI tools used

AI assistance was used, and is declared in full in [submission/AI_USE_DECLARATION.md](submission/AI_USE_DECLARATION.md).

In short: Claude Code (Anthropic, Claude Opus model family), working under my direction, wrote and revised most of the source code, the test scripts, all the colour palettes and the documentation. The game's design, every gameplay decision, its tuning and its testing were directed and checked by me. No AI-generated images, music or voice are used.

## 13. Repository and submitted version

- **Repository:** [[PRIVATE GITHUB URL]]. Reviewer access is given to [[ACCOUNT/EMAIL ANNOUNCED BY DIGIT7S]].
- **Submitted version:** `1.0.0`, git tag **`v1.0.0`**. The version is also shown at the bottom of the in-game pause menu.
- The playable link, the build ZIP and the tag are all built from the same commit.

## Build and run from source

Requires Node.js 22 or newer.

```sh
npm install        # once
npm run dev        # dev server at http://localhost:5280 (also reachable from a phone on the same network)
npm run build      # production build into dist/ (relative paths: works from any folder or host)
npm run preview    # serve the production build at http://localhost:4280
npm run verify     # headless check: towers are deterministic per seed and their route is climbable
npm run package -- TeamName   # verify + build, then write the submission ZIP and README copy to submission/out/
```

## Code map

| File | What it does |
|---|---|
| `src/config.js` | Every tuning value: physics, elements, progression, scoring, spikes, ending |
| `src/tower.js` | The tower generator (a new random seed each run): route, platforms, element chains, spike patterns |
| `src/GameScene.js` | Input, simulation, elements, scoring, doors, camera, ending |
| `src/physics.js` | Flight integration and the aim preview |
| `src/draw.js` | All rendering (shapes only) |
| `src/palettes.js` | The 25 colour palettes and the colour roles picked from them |
| `src/ui.js` | Top bar, pause menu, buttons |
| `src/save.js` | `localStorage` save with daily rollover, history and streak |
| `src/audio.js` | Synthesized sound effects |
| `scripts/` | Tower verification, palette preview, submission packaging |
