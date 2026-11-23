// The two Claude calls Nod makes. Both ask for strict JSON and are kept short so the
// answer fits the 576x288 display without further cutting.
export const MODEL = process.env.NOD_MODEL || 'claude-haiku-5-5';

const BRIEF_SYSTEM = `You help a busy person triage email on smart glasses with a tiny monochrome display.
Return ONLY a JSON object:
{"summary":[3 strings, each <= 60 characters],"ask":"what the sender needs from the reader, <= 50 characters","replies":[3 short replies the reader could send as-is, each <= 55 characters, covering different answers (e.g. yes / no or alternative / defer)]}
Write the replies in the reader's voice, plain and polite, no greeting or signature. Never invent facts that are not in the thread.`;

const VOICE_SYSTEM = `The user dictated a reply to an email while walking. Turn the dictation into the reply they would send: keep their meaning and decisions, fix grammar, keep it under 240 characters, no greeting or signature unless they said one.
Return ONLY a JSON object: {"reply":"..."}`;

async function ask(system, user, maxTokens = 400) {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) throw new Error('ANTHROPIC_API_KEY is not set');
  const t0 = Date.now();
  const r = await fetch((process.env.ANTHROPIC_BASE_URL || 'https://api.anthropic.com') + '/v1/messages', {
    method: 'POST',
    headers: { 'x-api-key': key, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
    body: JSON.stringify({ model: MODEL, max_tokens: maxTokens, system, messages: [{ role: 'user', content: user }] }),
  });
  if (!r.ok) throw new Error(`Claude ${r.status}: ${(await r.text()).slice(0, 200)}`);
  const j = await r.json();
  const text = j.content.map(c => c.text || '').join('');
  const m = text.match(/\{[\s\S]*\}/);
  if (!m) throw new Error('Claude did not return JSON');
  return { data: JSON.parse(m[0]), usage: j.usage, ms: Date.now() - t0 };
}

export async function brief(thread) {
  const user = `From: ${thread.from} <${thread.fromEmail || ''}>\nSubject: ${thread.subject}\n\n${thread.body}`;
  const { data, usage, ms } = await ask(BRIEF_SYSTEM, user);
  const s = Array.isArray(data.summary) ? data.summary.slice(0, 3) : [];
  while (s.length < 3) s.push('');
  return { summary: s.map(String), ask: String(data.ask || ''), replies: (data.replies || []).slice(0, 3).map(String), usage, ms };
}

export async function polishVoice(thread, heard) {
  const user = `Email from ${thread.from}, subject "${thread.subject}":\n${thread.body.slice(0, 1500)}\n\nDictation: "${heard}"`;
  const { data, usage, ms } = await ask(VOICE_SYSTEM, user, 300);
  return { reply: String(data.reply || ''), usage, ms };
}

// Used by eval/triage.mjs: does this thread need a reply from the reader today?
export async function needsReply(thread) {
  const sys = 'Decide if this email needs a personal reply from the reader. Newsletters, notifications, receipts and FYIs do not. Return ONLY {"needsReply":true|false,"priority":0-3}.';
  const { data, usage, ms } = await ask(sys, `From: ${thread.from} <${thread.fromEmail}>\nSubject: ${thread.subject}\n\n${thread.body}`, 60);
  return { ...data, usage, ms };
}
