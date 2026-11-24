// Nod backend: one file, Node 20+, no dependencies.
// Holds every key (Claude, speech-to-text, Google). The glasses app only ever sees a
// pairing code. Mail bodies are kept in memory for the session and never written to disk.
//
//   ANTHROPIC_API_KEY=...  node server/index.mjs                 # Claude live, demo inbox
//   + GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET / PUBLIC_URL       # real Gmail via /pair
//   + OPENAI_API_KEY                                             # voice transcription (Whisper)
import http from 'node:http';
import fs from 'node:fs';
import crypto from 'node:crypto';
import { brief, polishVoice, needsReply } from './claude.mjs';
import * as google from './google.mjs';
import { inbox as demoInbox, nextMeeting as demoMeeting, demoVoice } from '../src/fixtures.js';
import { cleanBody } from '../src/core.js';
import { onceMap, limiter, tooMany } from './guards.mjs';

const PORT = Number(process.env.PORT || 8787);
const PUBLIC_URL = process.env.PUBLIC_URL || `http://localhost:${PORT}`;
const STORE = process.env.NOD_STORE || new URL('../.nod-sessions.json', import.meta.url).pathname;
const googleOn = !!(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);

// pairing code -> { refresh } (only the Google refresh token is persisted)
const sessions = fs.existsSync(STORE) ? JSON.parse(fs.readFileSync(STORE, 'utf8')) : {};
const save = () => fs.writeFileSync(STORE, JSON.stringify(Object.fromEntries(Object.entries(sessions).map(([k, v]) => [k, { refresh: v.refresh }]))), { mode: 0o600 });
const mem = new Map(); // code -> { msgs: Map, briefs: Map, snoozed: Map }
const oauthStates = new Map();
// Guards: one email per thread per tap sequence, a daily send cap per account, a daily cap on
// model calls per network address (the demo code is public), and few wrong pairing codes per hour.
const sendOnce = onceMap();
const sendCap = limiter(Number(process.env.NOD_SEND_DAILY || 20), 864e5);
const modelCap = limiter(Number(process.env.NOD_MODEL_DAILY || 200), 864e5);
const badCode = limiter(10, 36e5);

function ctx(code) {
  if (!mem.has(code)) mem.set(code, { msgs: new Map(), briefs: new Map(), snoozed: new Map() });
  return mem.get(code);
}

async function getInbox(code) {
  const c = ctx(code);
  if (!sessions[code]) { // demo inbox, live Claude
    for (const t of demoInbox) c.msgs.set(t.id, t);
    return { inbox: demoInbox.map(({ brief, ...t }) => t), nextMeeting: demoMeeting };
  }
  const g = google.client(sessions[code]);
  const msgs = await g.unread();
  const out = [];
  await Promise.all(msgs.map(async m => {
    m.body = cleanBody(m.body);
    c.msgs.set(m.id, m);
    if (c.snoozed.get(m.id) > Date.now()) return;
    const k = await needsReply(m).catch(() => ({ needsReply: true, priority: 1 }));
    out.push({ id: m.id, from: m.from, fromEmail: m.fromEmail, subject: m.subject, received: m.received, needsReply: !!k.needsReply, priority: k.priority ?? 1 });
  }));
  const nm = await g.nextMeeting().catch(() => null);
  return { inbox: out, nextMeeting: nm };
}

async function transcribe(wavB64) {
  if (!process.env.OPENAI_API_KEY) throw new Error('OPENAI_API_KEY not set');
  const fd = new FormData();
  fd.append('model', process.env.NOD_STT_MODEL || 'whisper-1');
  fd.append('file', new Blob([Buffer.from(wavB64, 'base64')], { type: 'audio/wav' }), 'reply.wav');
  const r = await fetch('https://api.openai.com/v1/audio/transcriptions', { method: 'POST', headers: { authorization: 'Bearer ' + process.env.OPENAI_API_KEY }, body: fd });
  if (!r.ok) throw new Error('STT ' + r.status);
  return (await r.json()).text;
}

const routes = {
  'GET /api/inbox': (code) => getInbox(code),
  'POST /api/brief': async (code, { id }, ip) => {
    const c = ctx(code);
    if (c.briefs.has(id)) return c.briefs.get(id);
    if (!modelCap.take(ip)) throw tooMany('daily limit reached');
    const m = c.msgs.get(id);
    if (!m) throw Object.assign(new Error('unknown thread'), { status: 404 });
    const b = await brief({ ...m, body: cleanBody(m.body) });
    console.log(`brief ${id} ${b.ms}ms in=${b.usage?.input_tokens} out=${b.usage?.output_tokens}`);
    c.briefs.set(id, b);
    return b;
  },
  'POST /api/voice': async (code, { id, wav }, ip) => {
    if (!modelCap.take(ip)) throw tooMany('daily limit reached');
    const m = ctx(code).msgs.get(id);
    const heard = wav ? await transcribe(wav) : (demoVoice[id]?.heard || '');
    if (!heard) throw new Error('nothing heard');
    const { reply } = await polishVoice(m, heard);
    return { heard, reply };
  },
  'POST /api/save': async (code, { id, text, mode, draftId }) => {
    if (!sessions[code]) return { ok: true, draftId: 'demo-' + Date.now(), mode };
    const g = google.client(sessions[code]);
    const m = ctx(code).msgs.get(id);
    if (!m) throw Object.assign(new Error('unknown thread'), { status: 404 });
    if (mode !== 'send') return { ok: true, draftId: draftId || await g.draft(m, text), mode };
    // The recipient is always the sender of Gmail's own copy of the thread (msg.fromEmail), never
    // a value from the request. A repeated send for the same thread returns the first result.
    return sendOnce(code + ':' + id, async () => {
      if (!sendCap.take(code)) throw tooMany('daily send limit reached');
      const d = draftId || await g.draft(m, text);
      await g.send(d); await g.markRead(id);
      return { ok: true, draftId: d, mode };
    });
  },
  'POST /api/undo': async (code, { draftId }) => { if (sessions[code]) await google.client(sessions[code]).deleteDraft(draftId); return { ok: true }; },
  'POST /api/snooze': async (code, { id }) => { ctx(code).snoozed.set(id, Date.now() + 3600e3); return { ok: true }; },
  'POST /api/done': async (code, { id }) => { if (sessions[code]) await google.client(sessions[code]).markRead(id); return { ok: true }; },
};

function send(res, status, body, type = 'application/json') {
  res.writeHead(status, { 'content-type': type, 'access-control-allow-origin': '*', 'access-control-allow-headers': 'authorization, content-type', 'access-control-allow-methods': 'GET, POST, OPTIONS' });
  res.end(type === 'application/json' ? JSON.stringify(body) : body);
}

const page = (title, html) => `<!doctype html><meta name=viewport content="width=device-width,initial-scale=1"><title>${title}</title><body style="font:18px system-ui;padding:24px;background:#0b0d0c;color:#d8e6dc">${html}</body>`;

http.createServer(async (req, res) => {
  const url = new URL(req.url, PUBLIC_URL);
  if (req.method === 'OPTIONS') return send(res, 204, '', 'text/plain');
  try {
    // Pairing: Google sign-in cannot run inside the Even App WebView, so it happens here,
    // in the phone's browser, and ends with a 6-digit code typed into Nod.
    if (url.pathname === '/pair') {
      if (!googleOn) return send(res, 200, page('Nod', '<p>Google is not configured on this backend. Use the demo code <b>000000</b>.</p>'), 'text/html');
      const st = crypto.randomBytes(16).toString('hex'); oauthStates.set(st, Date.now());
      res.writeHead(302, { location: google.authUrl(st, PUBLIC_URL + '/oauth') }); return res.end();
    }
    if (url.pathname === '/oauth') {
      if (!oauthStates.delete(url.searchParams.get('state'))) return send(res, 400, page('Nod', 'Expired - open /pair again.'), 'text/html');
      const t = await google.exchange(url.searchParams.get('code'), PUBLIC_URL + '/oauth');
      let code; do code = String(crypto.randomInt(100000, 1000000)); while (sessions[code]);
      sessions[code] = { refresh: t.refresh_token }; save();
      return send(res, 200, page('Nod', `<p>Paired. Type this code into Nod on your phone:</p><p style="font-size:48px;letter-spacing:6px">${code}</p>`), 'text/html');
    }
    const key = `${req.method} ${url.pathname}`;
    if (!routes[key]) return send(res, 404, { error: 'not found' });
    const code = (req.headers.authorization || '').replace(/^Bearer\s+/, '') || '000000';
    const ip = req.socket.remoteAddress || '?';
    if (code !== '000000' && !sessions[code]) {
      if (!badCode.take(ip)) return send(res, 429, { error: 'too many wrong codes, try in an hour' });
      return send(res, 401, { error: 'unknown pairing code' });
    }
    let body = {};
    if (req.method === 'POST') { let s = ''; for await (const ch of req) { s += ch; if (s.length > 8e6) throw new Error('too large'); } body = s ? JSON.parse(s) : {}; }
    send(res, 200, await routes[key](code, body, ip));
  } catch (e) {
    console.error(e);
    send(res, e.status || 500, { error: String(e.message || e) });
  }
}).listen(PORT, () => console.log(`Nod backend on ${PUBLIC_URL} (Google ${googleOn ? 'on' : 'off - demo inbox'})`));
