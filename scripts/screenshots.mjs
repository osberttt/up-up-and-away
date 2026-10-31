// Captures the jam screenshots: `npm run screenshots -- TeamName`.
// Starts the dev server and a headless Chrome/Edge, emulates an iPhone-sized portrait screen
// (430 x 932 at 3x, touch) over the DevTools protocol, opens staged shots (see
// GameScene.devShot), waits in real time while the game runs, and writes
// submission/media/<Team>_UpUpAndAway_ScreenshotNN.png.
import { spawn, execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, writeFileSync, rmSync, mkdtempSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { tmpdir } from 'node:os';

const team = (process.argv[2] || 'Team').replace(/[^A-Za-z0-9]/g, '');
const browsers = [
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  '/usr/bin/google-chrome',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
];
const browser = browsers.find((b) => existsSync(b));
if (!browser) throw new Error('No Chrome or Edge found');

// [name, url query]. The game sets window.__shotReady when the staged moment is on screen.
const SHOTS = [
  ['start', ''],
  ['aim', '?at=600&shot=aim'],
  ['combo', '?at=300&shot=launch'],
  ['pause', '?at=800&shot=pause'],
  ['late-game', '?at=2050'],
  ['ending', '?at=2490&shot=ending'],
];
const PORT = 9333;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const out = resolve('submission/media');
mkdirSync(out, { recursive: true });

async function waitFor(url) {
  for (let i = 0; i < 80; i++) {
    try {
      const res = await fetch(url);
      if (res.ok) return res;
    } catch {}
    await sleep(250);
  }
  throw new Error(`Nothing answered at ${url}`);
}

// A minimal DevTools-protocol client over the page's WebSocket.
function connect(wsUrl) {
  return new Promise((ok, fail) => {
    const ws = new WebSocket(wsUrl);
    let id = 0;
    const pending = new Map();
    ws.onmessage = (e) => {
      const msg = JSON.parse(e.data);
      if (msg.id && pending.has(msg.id)) {
        const { resolve: done, reject } = pending.get(msg.id);
        pending.delete(msg.id);
        msg.error ? reject(new Error(msg.error.message)) : done(msg.result);
      }
    };
    ws.onopen = () =>
      ok({
        send: (method, params = {}) =>
          new Promise((done, reject) => {
            pending.set(++id, { resolve: done, reject });
            ws.send(JSON.stringify({ id, method, params }));
          }),
        close: () => ws.close(),
      });
    ws.onerror = fail;
  });
}

const kill = (child) => {
  if (!child) return;
  if (process.platform === 'win32') {
    try {
      execFileSync('taskkill', ['/pid', String(child.pid), '/T', '/F'], { stdio: 'ignore' });
    } catch {}
  } else child.kill();
};

const server = spawn('npm', ['run', 'dev'], { shell: true, stdio: 'ignore' });
let chrome = null;
const profile = mkdtempSync(join(tmpdir(), 'uuaa-shot-'));
try {
  await waitFor('http://localhost:5280/');
  chrome = spawn(browser, ['--headless=new', `--remote-debugging-port=${PORT}`, `--user-data-dir=${profile}`, '--mute-audio', '--hide-scrollbars', '--enable-unsafe-swiftshader', 'about:blank'], { stdio: 'ignore' });
  await waitFor(`http://localhost:${PORT}/json/version`);
  const targets = await (await fetch(`http://localhost:${PORT}/json/list`)).json();
  const page = targets.find((t) => t.type === 'page');
  const cdp = await connect(page.webSocketDebuggerUrl);
  await cdp.send('Page.enable');
  await cdp.send('Emulation.setDeviceMetricsOverride', { width: 430, height: 932, deviceScaleFactor: 3, mobile: true });
  await cdp.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });

  for (const [i, [name, query]] of SHOTS.entries()) {
    // A fresh start each time: leave the game (it saves as it closes), then wipe the site's
    // storage from outside, so no progress carries over from the shot before.
    await cdp.send('Page.navigate', { url: 'about:blank' });
    await sleep(400);
    await cdp.send('Storage.clearDataForOrigin', { origin: 'http://localhost:5280', storageTypes: 'all' });
    await cdp.send('Page.navigate', { url: `http://localhost:5280/${query}` });
    // Wait for the game to say the staged moment is on screen.
    let ready = false;
    for (let t = 0; t < 120 && !ready; t++) {
      await sleep(100);
      const r = await cdp.send('Runtime.evaluate', { expression: 'window.__shotReady === true', returnByValue: true });
      ready = r.result?.value === true;
    }
    if (!ready) console.warn(`  ${name}: the game never signalled ready; capturing anyway`);
    const { data } = await cdp.send('Page.captureScreenshot', { format: 'png' });
    const file = join(out, `${team}_UpUpAndAway_Screenshot${String(i + 1).padStart(2, '0')}.png`);
    writeFileSync(file, Buffer.from(data, 'base64'));
    console.log(`${name.padEnd(10)} -> ${file}`);
  }
  cdp.close();
} finally {
  kill(chrome);
  kill(server);
  await sleep(500);
  rmSync(profile, { recursive: true, force: true });
}
