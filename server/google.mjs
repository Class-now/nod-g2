// Minimal Gmail + Calendar over REST (no SDK). Scopes: gmail.modify (read, draft, send,
// label) and calendar.readonly.
export const SCOPES = [
  'https://www.googleapis.com/auth/gmail.modify',
  'https://www.googleapis.com/auth/calendar.readonly',
].join(' ');

const G = 'https://gmail.googleapis.com/gmail/v1/users/me';

export function authUrl(state, redirect) {
  const p = new URLSearchParams({
    client_id: process.env.GOOGLE_CLIENT_ID, redirect_uri: redirect, response_type: 'code',
    scope: SCOPES, access_type: 'offline', prompt: 'consent', state,
  });
  return 'https://accounts.google.com/o/oauth2/v2/auth?' + p;
}

export async function exchange(code, redirect) {
  return token({ code, redirect_uri: redirect, grant_type: 'authorization_code' });
}

async function token(params) {
  const r = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: process.env.GOOGLE_CLIENT_ID, client_secret: process.env.GOOGLE_CLIENT_SECRET, ...params }),
  });
  if (!r.ok) throw new Error('Google token ' + r.status);
  return r.json();
}

export function client(session) {
  async function access() {
    if (session.access && session.exp > Date.now() + 60000) return session.access;
    const t = await token({ refresh_token: session.refresh, grant_type: 'refresh_token' });
    session.access = t.access_token; session.exp = Date.now() + t.expires_in * 1000;
    return session.access;
  }
  async function call(url, init = {}) {
    const r = await fetch(url, { ...init, headers: { authorization: 'Bearer ' + await access(), 'content-type': 'application/json', ...(init.headers || {}) } });
    if (!r.ok) throw new Error(`Google ${r.status} ${url.split('?')[0].split('/').pop()}`);
    return r.status === 204 ? {} : r.json();
  }
  const header = (m, n) => (m.payload.headers.find(h => h.name.toLowerCase() === n) || {}).value || '';
  const b64 = s => Buffer.from(s.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8');
  function plain(part) {
    if (!part) return '';
    if (part.mimeType === 'text/plain' && part.body?.data) return b64(part.body.data);
    for (const p of part.parts || []) { const t = plain(p); if (t) return t; }
    return '';
  }

  return {
    async unread(max = 15) {
      const l = await call(`${G}/messages?q=${encodeURIComponent('is:unread in:inbox newer_than:3d -category:promotions -category:social')}&maxResults=${max}`);
      const out = [];
      for (const { id } of l.messages || []) {
        const m = await call(`${G}/messages/${id}?format=full`);
        const from = header(m, 'from');
        out.push({
          id: m.id, threadId: m.threadId, messageId: header(m, 'message-id'),
          from: from.replace(/<.*>/, '').replace(/"/g, '').trim() || from, fromEmail: (from.match(/<(.+)>/) || [, from])[1],
          subject: header(m, 'subject'), received: new Date(Number(m.internalDate)).toISOString(), body: plain(m.payload) || m.snippet,
        });
      }
      return out;
    },
    async draft(msg, text) {
      const raw = [
        `To: ${msg.fromEmail}`, `Subject: ${/^re:/i.test(msg.subject) ? msg.subject : 'Re: ' + msg.subject}`,
        `In-Reply-To: ${msg.messageId}`, `References: ${msg.messageId}`, 'Content-Type: text/plain; charset=UTF-8', '', text,
      ].join('\r\n');
      const d = await call(`${G}/drafts`, { method: 'POST', body: JSON.stringify({ message: { threadId: msg.threadId, raw: Buffer.from(raw).toString('base64url') } }) });
      return d.id;
    },
    send: draftId => call(`${G}/drafts/send`, { method: 'POST', body: JSON.stringify({ id: draftId }) }),
    deleteDraft: draftId => call(`${G}/drafts/${draftId}`, { method: 'DELETE' }),
    markRead: id => call(`${G}/messages/${id}/modify`, { method: 'POST', body: JSON.stringify({ removeLabelIds: ['UNREAD'] }) }),
    async nextMeeting() {
      const now = new Date().toISOString();
      const c = await call(`https://www.googleapis.com/calendar/v3/calendars/primary/events?timeMin=${now}&maxResults=1&singleEvents=true&orderBy=startTime`);
      const e = (c.items || [])[0];
      if (!e) return null;
      return { title: e.summary || '(no title)', start: e.start.dateTime || e.start.date, where: e.location || '', people: (e.attendees || []).slice(0, 2).map(a => a.displayName || a.email).concat((e.attendees || []).length > 2 ? ['+' + (e.attendees.length - 2)] : []) };
    },
  };
}
