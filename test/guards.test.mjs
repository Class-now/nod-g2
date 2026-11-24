import { test } from 'node:test';
import assert from 'node:assert/strict';
import { onceMap, limiter } from '../server/guards.mjs';

test('a double tap on send gives exactly one email', async () => {
  const once = onceMap();
  let sent = 0;
  const send = () => once('000123:t1', async () => { sent++; await new Promise(r => setTimeout(r, 20)); return { ok: true, draftId: 'd1' }; });
  const [a, b] = await Promise.all([send(), send()]);
  const c = await send();
  assert.equal(sent, 1);
  assert.equal(a.draftId, 'd1');
  assert.equal(b.already, true);
  assert.equal(c.already, true);
});

test('a failed send can be tried again', async () => {
  const once = onceMap();
  let n = 0;
  await assert.rejects(once('k', async () => { n++; throw new Error('Gmail 503'); }));
  const r = await once('k', async () => { n++; return { ok: true }; });
  assert.equal(n, 2);
  assert.equal(r.ok, true);
});

test('daily caps and wrong-code limits roll over with time', () => {
  let t = 0;
  const cap = limiter(3, 1000, () => t);
  assert.deepEqual([cap.take('a'), cap.take('a'), cap.take('a'), cap.take('a')], [true, true, true, false]);
  assert.equal(cap.take('b'), true); // per key
  t = 1001;
  assert.equal(cap.take('a'), true);
  assert.equal(cap.count('a'), 1);
});
