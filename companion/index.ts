import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { homedir, networkInterfaces } from 'node:os';
import { join } from 'node:path';
import { randomBytes } from 'node:crypto';
import { startServer, type CompanionConfig } from './server';
import { startRun, currentRun, loadDeclarations } from './run';

/**
 * The Spotter companion — §5.5's tier 3 grown into what the spec always said
 * it was: *"a first taste of Sovereign, not a workaround."*
 *
 * One local process, two jobs: **produce** the digest at night with the
 * browser closed (the real tier 1 the extension could never honestly promise
 * from an MV3 worker), and **serve** it — to the dashboard on localhost, to
 * the phone on the LAN. Everything pulls; the only pushes are the user's own
 * declarations, from her own dashboard to her own machine.
 *
 *   npx tsx companion/index.ts
 *
 * Config and data live in ~/.spotter-companion/. The pairing token is
 * generated once, printed at startup, and required on every route.
 */
const dataDir = process.env.SPOTTER_COMPANION_DIR ?? join(homedir(), '.spotter-companion');
mkdirSync(dataDir, { recursive: true });

const configPath = join(dataDir, 'config.json');
const config: CompanionConfig & { runHour: number } = existsSync(configPath)
  ? { dataDir, ...(JSON.parse(readFileSync(configPath, 'utf8')) as { port: number; token: string; runHour: number }) }
  : (() => {
      const fresh = { port: 8787, token: randomBytes(24).toString('base64url'), runHour: 3 };
      writeFileSync(configPath, JSON.stringify(fresh, null, 2), 'utf8');
      return { dataDir, ...fresh };
    })();

startServer(config);

// The overnight tier: check every ten minutes whether today's digest exists
// yet and the clock has passed the run hour. A missed night (machine asleep)
// is caught the moment the machine wakes — the same shape as the extension's
// staleness tier, in a process that does not need a browser open.
const TEN_MINUTES = 10 * 60 * 1000;
setInterval(() => {
  const now = new Date();
  if (now.getHours() < config.runHour) return;
  if (currentRun()) return;
  const today = now.toISOString().slice(0, 10);
  // One attempt per day, success, failure or cancel alike: the tier compares
  // against the last ATTEMPT, not the last success — otherwise a run the
  // reader just cancelled would relaunch itself ten minutes later, and a
  // failed one would retry all day (the extension's measured 2026-08-19 rule).
  for (const marker of ['lastattempt.json', 'lastrun.json']) {
    const path = join(dataDir, marker);
    if (!existsSync(path)) continue;
    const at = (JSON.parse(readFileSync(path, 'utf8')) as { at: string }).at;
    if (at.slice(0, 10) === today) return;
  }
  console.log(`[companion] overnight tier firing (${now.toISOString()})`);
  void startRun(dataDir, 'overnight');
}, TEN_MINUTES);

// The manual tier gets its console witness too — POST /run says who asked.
process.on('unhandledRejection', err => console.warn('[companion] unhandled:', err));

const { prefs } = loadDeclarations(dataDir);
const lanAddresses = Object.values(networkInterfaces())
  .flat()
  .filter(a => a && a.family === 'IPv4' && !a.internal)
  .map(a => (a as { address: string }).address);

console.log(`[companion] serving on port ${config.port}`);
console.log(`[companion]   dashboard: http://localhost:${config.port}`);
for (const addr of lanAddresses) console.log(`[companion]   phone (LAN): http://${addr}:${config.port}`);
console.log(`[companion] pairing token: ${config.token}`);
console.log(`[companion] overnight run at ${String(config.runHour).padStart(2, '0')}:00+`);
console.log(
  prefs.topicsMore.length || (prefs.feeds ?? []).length
    ? `[companion] declarations: ${prefs.topicsMore.length} topics, ${(prefs.feeds ?? []).length} feeds`
    : '[companion] no declarations yet — push them from the extension dashboard (Preferences)'
);
