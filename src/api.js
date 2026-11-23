// Talks to the Nod backend. In demo mode (or when no backend is configured) it answers
// from fixtures with realistic delays, so the glasses UI behaves the same either way.
import { inbox, nextMeeting, demoVoice } from './fixtures.js';

const sleep = ms => new Promise(r => setTimeout(r, ms));

export function makeApi({ backend, token, demo }) {
  if (demo || !backend) return demoApi();
  const call = async (path, body) => {
    const r = await fetch(backend + path, {
      method: body ? 'POST' : 'GET',
      headers: { 'content-type': 'application/json', authorization: 'Bearer ' + token },
      body: body ? JSON.stringify(body) : undefined,
    });
    if (!r.ok) throw new Error(`${r.status} ${await r.text().catch(() => '')}`.slice(0, 80));
    return r.json();
  };
  return {
    mode: 'live',
    inbox: () => call('/api/inbox'),
    brief: id => call('/api/brief', { id }),
    voice: (id, wavBase64) => call('/api/voice', { id, wav: wavBase64 }),
    save: (id, text, mode, draftId) => call('/api/save', { id, text, mode, draftId }),
    undo: draftId => call('/api/undo', { draftId }),
    snooze: id => call('/api/snooze', { id }),
    markDone: id => call('/api/done', { id }),
  };
}

function demoApi() {
  let n = 0;
  return {
    mode: 'demo',
    inbox: async () => ({ inbox, nextMeeting }),
    brief: async id => { await sleep(900); return inbox.find(t => t.id === id).brief; },
    voice: async id => {
      await sleep(700);
      const v = demoVoice[id] || { heard: 'sounds good', reply: 'Sounds good - thanks!' };
      return v;
    },
    save: async (id, text, mode) => { await sleep(500); return { ok: true, draftId: 'demo-draft-' + (++n), mode }; },
    undo: async () => ({ ok: true }),
    snooze: async () => ({ ok: true }),
    markDone: async () => ({ ok: true }),
  };
}

// 16 kHz mono s16le PCM chunks -> base64 WAV (what the backend's speech-to-text takes).
export function pcmToWavBase64(chunks, rate = 16000) {
  const len = chunks.reduce((a, c) => a + c.length, 0);
  const buf = new Uint8Array(44 + len);
  const dv = new DataView(buf.buffer);
  const str = (o, s) => { for (let i = 0; i < s.length; i++) buf[o + i] = s.charCodeAt(i); };
  str(0, 'RIFF'); dv.setUint32(4, 36 + len, true); str(8, 'WAVE'); str(12, 'fmt ');
  dv.setUint32(16, 16, true); dv.setUint16(20, 1, true); dv.setUint16(22, 1, true);
  dv.setUint32(24, rate, true); dv.setUint32(28, rate * 2, true); dv.setUint16(32, 2, true); dv.setUint16(34, 16, true);
  str(36, 'data'); dv.setUint32(40, len, true);
  let o = 44; for (const c of chunks) { buf.set(c, o); o += c.length; }
  let bin = ''; for (let i = 0; i < buf.length; i += 0x8000) bin += String.fromCharCode(...buf.subarray(i, i + 0x8000));
  return btoa(bin);
}
