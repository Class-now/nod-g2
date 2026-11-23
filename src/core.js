// Nod core: a pure state machine. No SDK, no DOM, no network.
//   view(state)          -> a page description for the 576x288 G2 display
//   step(state, input)   -> { state, effects }   (effects are run by main.js)
// Keeping this pure lets the same logic drive the glasses, the phone preview and the tests.

export const W = 576;
export const H = 288;
export const MAX_LIST = 6;

export const MENU = [
  { id: 1, name: 'Snooze 1h' },
  { id: 2, name: 'Mark done' },
  { id: 3, name: 'Next meeting' },
  { id: 4, name: 'Refresh' },
];

const enc = new TextEncoder();
export function bytes(s) { return enc.encode(s).length; }

// Cut a string so it fits `max` UTF-8 bytes, ending with an ellipsis when cut.
export function fit(s, max) {
  s = String(s ?? '').replace(/[ \t]+/g, ' ').trim();
  if (bytes(s) <= max) return s;
  let out = '';
  for (const ch of s) {
    if (bytes(out + ch) > max - 3) break;
    out += ch;
  }
  return out.trimEnd() + '...';
}

export function hhmm(iso) {
  const m = /T(\d\d:\d\d)/.exec(iso || '');
  return m ? m[1] : '';
}

export function initialState(data) {
  return {
    screen: 'home',
    threads: data.inbox.filter(t => t.needsReply && !t.done).sort((a, b) => b.priority - a.priority || (a.received < b.received ? 1 : -1)),
    meeting: data.nextMeeting || null,
    sel: 0,
    current: null,       // thread id
    briefs: {},          // id -> {summary, ask, replies} | 'loading' | {error}
    voice: null,         // {phase:'listening'|'thinking'|'ready'|'error', heard, reply}
    pending: null,       // {text, mode:'draft'|'send'}
    result: null,        // {kind:'draft'|'sent'|'snoozed'|'done', to}
    taps: 0,             // inputs since the thread was opened (for the demo counter)
    log: [],
  };
}

function thread(state, id = state.current) {
  return state.threads.find(t => t.id === id) || null;
}

function shortName(name) { return String(name || '').split(/\s+/)[0]; }

// ---------- view ----------

export function view(state) {
  const t = thread(state);
  switch (state.screen) {
    case 'home': {
      const n = state.threads.length;
      const meet = state.meeting ? ` · next ${hhmm(state.meeting.start)} ${state.meeting.title}` : '';
      const head = n ? `${n} to reply${meet}` : `Inbox clear${meet}`;
      const items = state.threads.slice(0, MAX_LIST).map(x => fit(`${x.priority >= 3 ? '!! ' : x.priority === 2 ? '! ' : ''}${shortName(x.from)}: ${x.subject}`, 63));
      if (!items.length) items.push('Nothing needs you. Double-tap: next meeting');
      return page('home', [text('head', 0, 0, W, 44, fit(head, 120), { brightness: 2 })],
        [list('items', 0, 46, W, H - 46, items)], MENU);
    }
    case 'brief': {
      const b = state.briefs[t.id];
      const head = fit(`${t.from} · ${hhmm(t.received)}\n${t.subject}`, 140);
      let body;
      if (!b || b === 'loading') body = 'Reading the thread...\nClaude is writing a 3-line brief.';
      else if (b.error) body = `Could not get a brief (${fit(b.error, 60)}).\nTap: try again · Double-tap: back`;
      else body = [...b.summary.filter(Boolean).map(l => '- ' + l), '', 'Ask: ' + b.ask, '', 'Tap: replies · Double-tap: back'].join('\n');
      return page('brief', [
        text('head', 0, 0, W, 62, head, { brightness: 2 }),
        text('body', 0, 66, W, H - 66, body, { capture: true }),
      ], [], MENU);
    }
    case 'reply': {
      const b = state.briefs[t.id];
      const items = [...(b?.replies || []).map(r => fit(r, 63)), 'Say it (voice)', 'Back'];
      return page('reply', [text('head', 0, 0, W, 40, fit(`Reply to ${shortName(t.from)}: ${b?.ask || ''}`, 63), { brightness: 2 })],
        [list('items', 0, 44, W, H - 44, items)], MENU);
    }
    case 'voice': {
      const v = state.voice || {};
      let body;
      if (v.phase === 'listening') body = 'Listening...\nSay your reply. Tap when done.';
      else if (v.phase === 'thinking') body = `Heard: "${fit(v.heard, 120)}"\n\nClaude is writing it up...`;
      else if (v.phase === 'error') body = `Voice failed (${fit(v.error, 60)}).\nDouble-tap: back`;
      else body = '';
      if (v.phase === 'ready') {
        return page('voice-ready', [text('head', 0, 0, W, 120, fit(`"${v.reply}"`, 200))],
          [list('items', 0, 124, W, H - 124, ['Save as draft', 'Send now', 'Say it again', 'Back'])], MENU);
      }
      return page('voice', [text('body', 0, 0, W, H, body, { capture: true })], [], MENU);
    }
    case 'confirm': {
      // Reached by long-press on a reply. Sending always has a click path too (the OS
      // may take long-press for its own menu).
      return page('confirm', [text('head', 0, 0, W, 120, fit(`Send to ${shortName(t.from)}?\n"${state.pending.text}"`, 200))],
        [list('items', 0, 124, W, H - 124, ['Send now', 'Save as draft', 'Cancel'])], MENU);
    }
    case 'done': {
      const r = state.result;
      const msg = {
        draft: `Draft saved for ${r.to} ✓`,
        sent: `Sent to ${r.to} ✓`,
        snoozed: `Snoozed ${r.to} for 1h`,
        done: `Marked ${r.to} done`,
      }[r.kind];
      const items = r.kind === 'draft' ? ['Back to inbox', 'Send it now', 'Undo draft'] : ['Back to inbox'];
      return page('done', [text('head', 0, 0, W, 80, `${msg}\n${state.taps} taps from inbox`, { brightness: 3 })],
        [list('items', 0, 84, W, H - 84, items)], MENU);
    }
    case 'meeting': {
      const m = state.meeting;
      const rel = m?.related ? thread(state, m.related.threadId) : null;
      const body = m
        ? [`${hhmm(m.start)}  ${m.title}`, `${m.where} · ${m.people.join(', ')}`, '', rel ? `Related: ${shortName(rel.from)} - ${m.related.note}` : '', '', 'Double-tap: back'].join('\n')
        : 'No more meetings today.\nDouble-tap: back';
      return page('meeting', [text('body', 0, 0, W, H, body, { capture: true })], [], MENU);
    }
  }
  throw new Error('unknown screen ' + state.screen);
}

function page(key, texts, lists, menu) { return { key, texts, lists, menu }; }
function text(name, x, y, w, h, content, o = {}) {
  return { name, x, y, w, h, content, capture: !!o.capture, brightness: o.brightness ?? 4 };
}
function list(name, x, y, w, h, items) { return { name, x, y, w, h, items: items.map(i => i.replace(/\s+/g, ' ')), capture: true }; }

// ---------- step ----------
// input: {kind:'click'|'double'|'long'|'release'|'up'|'down'|'menu'|'brief'|'voiceText'|'voiceReply'|'saved'|'error', ...}

export function step(prev, input) {
  const s = { ...prev, briefs: { ...prev.briefs }, log: [...prev.log, input.kind] };
  const fx = [];
  const t = thread(s);
  const k = input.kind;
  if (['click', 'double', 'long'].includes(k)) s.taps++;

  // data arriving from effects
  if (k === 'brief') { s.briefs[input.id] = input.brief; return { state: s, effects: fx }; }
  if (k === 'briefError') { s.briefs[input.id] = { error: input.error }; return { state: s, effects: fx }; }
  if (k === 'voiceText') { s.voice = { phase: 'thinking', heard: input.heard }; return { state: s, effects: fx }; }
  if (k === 'voiceReply') { s.voice = { ...s.voice, phase: 'ready', reply: input.reply }; return { state: s, effects: fx }; }
  if (k === 'voiceError') { s.voice = { phase: 'error', error: input.error }; fx.push({ type: 'mic', on: false }); return { state: s, effects: fx }; }
  if (k === 'saved') { s.result = { kind: input.mode === 'send' ? 'sent' : 'draft', to: shortName(t?.from), draftId: input.draftId }; s.screen = 'done'; return { state: s, effects: fx }; }
  if (k === 'menu') return menuStep(s, input.itemId, fx);

  switch (s.screen) {
    case 'home':
      if (k === 'click' && s.threads.length) {
        const i = clampIdx(input.index, s.threads.length);
        s.sel = i; s.current = s.threads[i].id; s.screen = 'brief'; s.taps = 1;
        if (!s.briefs[s.current] || s.briefs[s.current].error) { s.briefs[s.current] = 'loading'; fx.push({ type: 'brief', id: s.current }); }
      } else if (k === 'double') { s.screen = 'meeting'; }
      break;
    case 'brief':
      if (k === 'click') {
        const b = s.briefs[t.id];
        if (b && b.error) { s.briefs[t.id] = 'loading'; fx.push({ type: 'brief', id: t.id }); }
        else if (b && b !== 'loading') s.screen = 'reply';
      } else if (k === 'double') s.screen = 'home';
      break;
    case 'reply': {
      const replies = s.briefs[t.id]?.replies || [];
      const i = input.index ?? 0;
      if (k === 'click') {
        if (i < replies.length) { s.pending = { text: replies[i], mode: 'draft' }; fx.push({ type: 'save', id: t.id, text: replies[i], mode: 'draft' }); }
        else if (i === replies.length) { s.screen = 'voice'; s.voice = { phase: 'listening' }; fx.push({ type: 'mic', on: true, id: t.id }); }
        else s.screen = 'brief';
      } else if (k === 'long' && i < replies.length) { s.pending = { text: replies[i], mode: 'send' }; s.screen = 'confirm'; }
      else if (k === 'double') s.screen = 'brief';
      break;
    }
    case 'voice':
      if (s.voice?.phase === 'listening' && (k === 'click' || k === 'release')) { fx.push({ type: 'mic', on: false, id: t.id }); s.voice = { phase: 'thinking', heard: '...' }; }
      else if (s.voice?.phase === 'ready' && k === 'click') {
        const i = input.index ?? 0;
        if (i === 0 || i === 1) { const mode = i === 0 ? 'draft' : 'send'; s.pending = { text: s.voice.reply, mode }; fx.push({ type: 'save', id: t.id, text: s.voice.reply, mode }); }
        else if (i === 2) { s.voice = { phase: 'listening' }; fx.push({ type: 'mic', on: true, id: t.id }); }
        else { s.screen = 'reply'; s.voice = null; }
      } else if (k === 'double') { if (s.voice?.phase === 'listening') fx.push({ type: 'mic', on: false, id: t.id, discard: true }); s.screen = 'reply'; s.voice = null; }
      break;
    case 'confirm':
      if (k === 'click') {
        const i = input.index ?? 0;
        if (i === 0 || i === 1) { const mode = i === 0 ? 'send' : 'draft'; s.pending = { ...s.pending, mode }; fx.push({ type: 'save', id: t.id, text: s.pending.text, mode }); }
        else s.screen = 'reply';
      } else if (k === 'double') s.screen = 'reply';
      break;
    case 'done':
      if (k === 'click') {
        const i = input.index ?? 0;
        if (s.result.kind === 'draft' && i === 1) { fx.push({ type: 'save', id: t.id, text: s.pending.text, mode: 'send', draftId: s.result.draftId }); break; }
        if (s.result.kind === 'draft' && i === 2) { fx.push({ type: 'undo', id: t.id, draftId: s.result.draftId }); s.screen = 'reply'; break; }
        if (s.result.kind === 'sent' || s.result.kind === 'done') removeThread(s, t?.id);
        s.screen = 'home'; s.current = null; s.sel = 0;
      } else if (k === 'double') { s.screen = 'home'; s.current = null; }
      break;
    case 'meeting':
      if (k === 'double' || k === 'click') s.screen = s.current ? 'brief' : 'home';
      break;
  }
  return { state: s, effects: fx };
}

function menuStep(s, itemId, fx) {
  const t = thread(s) || s.threads[s.sel];
  if (itemId === 1 && t) { removeThread(s, t.id); s.current = t.id; s.result = { kind: 'snoozed', to: shortName(t.from) }; s.screen = 'done'; fx.push({ type: 'snooze', id: t.id }); }
  else if (itemId === 2 && t) { removeThread(s, t.id); s.current = t.id; s.result = { kind: 'done', to: shortName(t.from) }; s.screen = 'done'; fx.push({ type: 'markDone', id: t.id }); }
  else if (itemId === 3) s.screen = 'meeting';
  else if (itemId === 4) { s.screen = 'home'; s.current = null; fx.push({ type: 'refresh' }); }
  return { state: s, effects: fx };
}

function removeThread(s, id) { s.threads = s.threads.filter(x => x.id !== id); }
function clampIdx(i, n) { i = Number.isInteger(i) ? i : 0; return Math.max(0, Math.min(n - 1, i)); }

// Strip quoted history and signatures before anything is sent to Claude.
export function cleanBody(body) {
  const lines = String(body || '').split('\n');
  const out = [];
  for (const l of lines) {
    if (/^\s*>/.test(l)) continue;
    if (/^On .+wrote:$/.test(l.trim())) break;
    if (/^--\s*$/.test(l)) break;
    if (/^(Sent from my|Get Outlook for)/i.test(l.trim())) break;
    out.push(l);
  }
  return out.join('\n').trim().slice(0, 4000);
}
