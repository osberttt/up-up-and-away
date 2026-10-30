# Up Up and Away

Endless vertical slingshot climber for mobile browsers, built with Phaser 3. Offline, single player, abstract shapes.

- Drag anywhere and release to fling the blob; a longer drag gives more power. It bounces off the side walls.
- Unlimited flings, on the ground or in mid-air, with a 0.3 s cooldown between them. Aiming slows time.
- 3 hearts. Spikes, saws and wall spikes cost a heart and lock flinging for 1 s, so you drop; losing the last heart ends the run and sends you back to 0m.
- Platforms are solid on every side, except crumbling ones and doors, which are one-way.
- Elements launch you: bouncy pads, funnels, portals and elevators (a U box you drop into; it carries you up and fires you out). While a launch is rising you're purple and see-through: hazards can't hurt you and platforms become one-way.
- Stars are points: fly within the faint ring around one to collect it.
- Floating hearts restore one heart each; they fade 10 s after coming on screen and respawn 12 s later.
- Doors every 100m: passing one opens a floor you can't fall below today and refills all hearts.
- Every platform type, hazard, funnel and portal can appear from the start; there is no height progression.
- Score (per run, not height): every element is +50 (bouncy pad, star, heart, funnel, elevator, portal; each once per run except hearts). Elements hit within 2.5 s of each other chain: NICE, GOOD, GREAT, AMAZING, FANTASTIC. Each 100m door scores by the time since the previous one: under 14 s +300, 20 s +250, 28 s +200, 38 s +150, 50 s +100, 64 s +75, 80 s +50, slower +25. Today's best run score is saved.
- One tower per day for everyone (seeded by the local date); stats are saved in the browser.

## Run

```sh
npm install
npm run dev      # dev server on port 5280, also reachable from a phone on the same network
npm run build    # static build in dist/ (relative paths, works from any folder or itch.io)
npm run preview  # serve the build on port 4280
npm run verify   # headless check that every generated tower is deterministic and climbable
```

Pushing to `main` on GitHub deploys to GitHub Pages via `.github/workflows/deploy.yml`
(set **Settings → Pages → Source** to **GitHub Actions** once).

Docs: [Game Design Document](docs/GDD.md) · [System Design](docs/SYSTEM_DESIGN.md)

## Code map

- `src/config.js` – tuning constants (gravity, launch speeds, refill time, drag lengths)
- `src/tower.js` – daily tower generator (path-first platform placement, hazards beside the path)
- `src/physics.js` – flight integration and the aim preview
- `src/GameScene.js` – input, simulation, landing/hazards, camera, saving
- `src/draw.js` – all rendering (shapes only, palette drifts with height)
- `src/ui.js` – HUD, intro card, pause menu (stats, 7-day chart, copy result, restart)
- `src/save.js` – localStorage save with daily rollover, history and streak
- `src/audio.js` – synthesized sound effects (no audio files)
