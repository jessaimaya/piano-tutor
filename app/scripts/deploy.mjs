// Build here and publish to Cloudflare:  npm run deploy
// The scores are copyrighted and not in git, so this must run on the computer that has them. Two checks stop a bad publish:
// the address must already be behind the Cloudflare Access login, and the build must hold every score file that is in app/scores.
import { execFileSync } from 'node:child_process';
import { readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const app = join(dirname(fileURLToPath(import.meta.url)), '..');
const URL_ = process.env.PIANO_URL ?? 'https://piano.maya-jessai.workers.dev/';
const isScore = (f) => /\.(mxl|musicxml|xml)$/.test(f);
const fail = (msg) => { console.error('\nNot published: ' + msg); process.exit(1); };

// 1. The login wall: an anonymous request must be sent to Cloudflare Access, not served the page.
const res = await fetch(URL_, { redirect: 'manual' });
const to = res.headers.get('location') ?? '';
if (!(res.status >= 300 && res.status < 400 && to.includes('cloudflareaccess.com'))) {
  fail(`${URL_} answered ${res.status} without asking for a login. Add the Access application for it first (Zero Trust > Access > Applications).`);
}
console.log('Login wall is up.');

// 2. Build, then compare the scores in the build with the ones on disk.
execFileSync('npm', ['run', 'build'], { cwd: app, stdio: 'inherit' });
const onDisk = readdirSync(join(app, 'scores')).filter(isScore).length;
const inBuild = readdirSync(join(app, 'dist', 'assets')).filter(isScore).length;
if (inBuild !== onDisk) fail(`the build holds ${inBuild} score files but app/scores has ${onDisk}.`);
console.log(`${inBuild} score files in the build.`);

// 3. Publish.
execFileSync('npx', ['wrangler', 'deploy'], { cwd: app, stdio: 'inherit' });
