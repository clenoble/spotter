import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { timingSafeEqual } from 'node:crypto';
import {
  startRun,
  cancelRun,
  readCompanionDigest,
  companionDigestDays,
  readArticle,
  recordGesture,
  saveDeclarations,
  loadDeclarations,
  type Declarations
} from './run';
import { READER_HTML } from './reader';

/**
 * The companion's API — everything pulls, gestures and declarations post.
 *
 * The doctrine this serves (Céline, 2026-08-19): **content is pulled; the only
 * pushes are the user's own declarations, to her own machine.** The dashboard
 * and the phone are readers of the same endpoints; Sovereign, later, either
 * serves the same shapes or replaces this process entirely — the wire model is
 * the core's `DigestView`, never a companion invention, so the readers survive
 * the swap.
 *
 * ## Security, stated exactly
 *
 * Bearer token over **plain HTTP on the LAN**. The token gates every route
 * (`/health` excepted, which reveals only that a companion exists): the digest
 * is a portrait of what the reader wants to know, and an open LAN service
 * would serve it to every device in the house. What the token does NOT do is
 * encrypt the wire — anyone capturing LAN traffic reads the payload. That is
 * the current honest boundary; HTTPS on LAN needs a certificate the phone
 * trusts, which is a real cost paid when the PWA needs offline (a service
 * worker requires a secure context). Declared here so nobody reads "token"
 * as "encrypted".
 */
export interface CompanionConfig {
  dataDir: string;
  port: number;
  token: string;
}

export function startServer(config: CompanionConfig): ReturnType<typeof createServer> {
  const server = createServer((req, res) => {
    void handle(config, req, res).catch(err => {
      send(res, 500, { error: err instanceof Error ? err.message : String(err) });
    });
  });
  server.listen(config.port);
  return server;
}

async function handle(config: CompanionConfig, req: IncomingMessage, res: ServerResponse): Promise<void> {
  const url = new URL(req.url ?? '/', `http://localhost:${config.port}`);

  // CORS: the dashboard is an extension page, the PWA is served from here.
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, OPTIONS');
  if (req.method === 'OPTIONS') {
    res.writeHead(204).end();
    return;
  }

  if (url.pathname === '/health') {
    // Tokenless, and deliberately thin: it exists so the extension can detect
    // a companion. It names no data, no topics, no counts.
    send(res, 200, { app: 'spotter-companion', api: 1 });
    return;
  }

  if (req.method === 'GET' && (url.pathname === '/' || url.pathname === '/index.html')) {
    // The phone reader. Tokenless like /health, and for the same reason it is
    // safe: the page is static chrome — it carries no data, and every data
    // call it makes goes through the bearer routes below. The token is typed
    // into the page once, on the phone.
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(READER_HTML);
    return;
  }

  if (!authorized(req, config.token)) {
    send(res, 401, { error: 'missing or wrong token' });
    return;
  }

  if (req.method === 'GET' && url.pathname === '/digest') {
    const day = url.searchParams.get('day') ?? undefined;
    send(res, 200, await readCompanionDigest(config.dataDir, day));
    return;
  }
  if (req.method === 'GET' && url.pathname === '/days') {
    send(res, 200, { days: await companionDigestDays(config.dataDir) });
    return;
  }
  if (req.method === 'GET' && url.pathname.startsWith('/article/')) {
    const article = readArticle(config.dataDir, url.pathname.slice('/article/'.length));
    if (article) send(res, 200, article);
    else send(res, 404, { error: 'not cached (older than 3 days, or scored on abstract)' });
    return;
  }
  if (req.method === 'POST' && url.pathname === '/run') {
    console.log('[companion] manual run requested');
    void startRun(config.dataDir, 'manual');
    send(res, 202, await readCompanionDigest(config.dataDir));
    return;
  }
  if (req.method === 'POST' && url.pathname === '/run/cancel') {
    const cancelling = cancelRun();
    console.log(
      cancelling
        ? '[companion] cancel requested — the run stops at the next candidate boundary'
        : '[companion] cancel requested, but no run is live'
    );
    send(res, 200, { cancelling });
    return;
  }
  if (req.method === 'POST' && url.pathname === '/gesture') {
    const body = (await json(req)) as { documentId?: unknown; kind?: unknown };
    if (typeof body.documentId !== 'string' || (body.kind !== 'open' && body.kind !== 'read')) {
      // The unforeseen is refused, never let through — and loudly (§5.6).
      send(res, 400, { error: 'gesture must be {documentId: string, kind: "open"|"read"}' });
      return;
    }
    await recordGesture(config.dataDir, body.documentId, body.kind);
    send(res, 200, { ok: true });
    return;
  }
  if (req.method === 'PUT' && url.pathname === '/declarations') {
    const body = (await json(req)) as Partial<Declarations>;
    if (!body || typeof body !== 'object' || (!body.prefs && !body.backend)) {
      send(res, 400, { error: 'declarations must carry prefs and/or backend' });
      return;
    }
    const current = loadDeclarations(config.dataDir);
    const next = {
      prefs: body.prefs ?? current.prefs,
      backend: body.backend ?? current.backend
    };
    saveDeclarations(config.dataDir, next);
    // The console witness (Céline, 2026-08-19: a push that leaves no trace in
    // the terminal reads as a push that never arrived — because for her, it
    // hadn't the first time, and nothing distinguished the two cases).
    console.log(
      `[companion] declarations received: ${next.prefs.topicsMore.length} topics, ${(next.prefs.feeds ?? []).length} feeds, ${(next.prefs.examples ?? []).length} examples · backend ${next.backend.provider}/${next.backend.model}`
    );
    send(res, 200, { ok: true });
    return;
  }

  send(res, 404, { error: `no such route: ${req.method} ${url.pathname}` });
}

function authorized(req: IncomingMessage, token: string): boolean {
  const header = req.headers.authorization ?? '';
  const given = header.startsWith('Bearer ') ? header.slice(7) : '';
  const a = Buffer.from(given);
  const b = Buffer.from(token);
  return a.length === b.length && timingSafeEqual(a, b);
}

function json(req: IncomingMessage): Promise<unknown> {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', chunk => {
      body += chunk;
      if (body.length > 1_000_000) reject(new Error('body too large'));
    });
    req.on('end', () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch {
        reject(new Error('body is not JSON'));
      }
    });
    req.on('error', reject);
  });
}

function send(res: ServerResponse, status: number, payload: unknown): void {
  const body = JSON.stringify(payload);
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(body);
}
