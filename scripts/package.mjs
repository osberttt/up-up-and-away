// Builds the jam submission files: `npm run package -- TeamName`.
// Verifies the tower generator, builds the game, then writes to submission/out/:
//   Digit7Jam_<Team>_UpUpAndAway.zip  (one folder, Digit7Jam_<Team>_UpUpAndAway_Build/, with only
//                                      the runtime files: index.html and assets/)
//   README_<Team>_UpUpAndAway.md       (a copy of README.md, named the way the guide asks)
import { execSync, execFileSync } from 'node:child_process';
import { cpSync, rmSync, mkdirSync, existsSync, statSync } from 'node:fs';
import { resolve } from 'node:path';

const team = (process.argv[2] || '').replace(/[^A-Za-z0-9]/g, '');
if (!team) {
  console.error('Usage: npm run package -- TeamName   (letters and digits only, e.g. TeamPhoenix)');
  process.exit(1);
}
const base = `Digit7Jam_${team}_UpUpAndAway`;
const out = resolve('submission/out');
const stage = resolve(out, `${base}_Build`);
const zip = resolve(out, `${base}.zip`);

execSync('npm run verify', { stdio: 'inherit' });
execSync('npm run build', { stdio: 'inherit' });

rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });
cpSync(resolve('dist'), stage, { recursive: true });
if (!existsSync(resolve(stage, 'index.html'))) throw new Error('Build has no index.html');

if (process.platform === 'win32') {
  // Windows' built-in tar (bsdtar) writes a standard zip with forward-slash paths. PowerShell's
  // Compress-Archive writes backslashes, which macOS/Linux unzip tools can mangle.
  execFileSync('tar', ['-a', '-cf', zip, `${base}_Build`], { cwd: out, stdio: 'inherit' });
} else {
  execFileSync('zip', ['-rq', zip, `${base}_Build`], { cwd: out, stdio: 'inherit' });
}
rmSync(stage, { recursive: true, force: true });
cpSync(resolve('README.md'), resolve(out, `README_${team}_UpUpAndAway.md`));

const mb = (statSync(zip).size / 1024 / 1024).toFixed(2);
console.log(`\nWrote ${zip} (${mb} MB, limit 200 MB)`);
console.log(`Wrote ${resolve(out, `README_${team}_UpUpAndAway.md`)}`);
