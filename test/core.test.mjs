import { test } from 'node:test';
import assert from 'node:assert/strict';
import { initialState, view, step, bytes, fit, cleanBody } from '../src/core.js';
import { inbox, nextMeeting } from '../src/fixtures.js';

const start = () => initialState({ inbox, nextMeeting });
function run(s, ...inputs) {
  const fx = [];
  for (const i of inputs) { const r = step(s, i); s = r.state; fx.push(...r.effects); }
  return { s, fx };
}

test('home lists only threads that need a reply, most urgent first', () => {
  const s = start();
  assert.deepEqual(s.threads.map(t => t.id), ['t1', 't2', 't3', 't4']);
  const p = view(s);
  assert.equal(p.lists[0].items.length, 4);
  assert.match(p.texts[0].content, /4 to reply · next 14:00 Design sync/);
});

test('every list item and menu label fits the firmware limits', () => {
  for (const it of view(start()).lists[0].items) assert.ok(bytes(it) <= 63, it);
  for (const m of view(start()).menu) assert.ok(bytes(m.name) <= 32);
  assert.ok(bytes(fit('x'.repeat(200), 63)) <= 63);
});

test('three taps from inbox to a saved Gmail draft', () => {
  let { s, fx } = run(start(), { kind: 'click', index: 0 });
  assert.equal(s.screen, 'brief');
  assert.deepEqual(fx, [{ type: 'brief', id: 't1' }]);
  ({ s } = run(s, { kind: 'brief', id: 't1', brief: inbox[0].brief }));
  assert.match(view(s).texts[1].content, /Ask: Your OK/);
  ({ s, fx } = run(s, { kind: 'click' }, { kind: 'click', index: 0 }));
  assert.deepEqual(fx, [{ type: 'save', id: 't1', text: inbox[0].brief.replies[0], mode: 'draft' }]);
  ({ s } = run(s, { kind: 'saved', mode: 'draft', draftId: 'd1' }));
  assert.equal(s.screen, 'done');
  assert.equal(s.taps, 3);
  assert.match(view(s).texts[0].content, /Draft saved for Dana/);
});

test('sending always needs an explicit second choice', () => {
  let { s, fx } = run(start(), { kind: 'click', index: 1 }, { kind: 'brief', id: 't2', brief: inbox[1].brief }, { kind: 'click' }, { kind: 'long', index: 0 });
  assert.equal(s.screen, 'confirm');
  assert.equal(fx.filter(f => f.type === 'save').length, 0);
  ({ s, fx } = run(s, { kind: 'click', index: 0 }));
  assert.deepEqual(fx, [{ type: 'save', id: 't2', text: inbox[1].brief.replies[0], mode: 'send' }]);
  ({ s } = run(s, { kind: 'saved', mode: 'send' }, { kind: 'click', index: 0 }));
  assert.equal(s.screen, 'home');
  assert.ok(!s.threads.find(t => t.id === 't2'), 'sent thread leaves the list');
});

test('voice path: listen -> transcript -> reply -> draft', () => {
  let { s, fx } = run(start(), { kind: 'click', index: 0 }, { kind: 'brief', id: 't1', brief: inbox[0].brief }, { kind: 'click' }, { kind: 'click', index: 3 });
  assert.equal(s.screen, 'voice');
  assert.deepEqual(fx.at(-1), { type: 'mic', on: true, id: 't1' });
  ({ s, fx } = run(s, { kind: 'click' }));
  assert.deepEqual(fx, [{ type: 'mic', on: false, id: 't1' }]);
  ({ s } = run(s, { kind: 'voiceText', heard: 'fine cc legal' }, { kind: 'voiceReply', reply: 'Both fine, cc Legal.' }));
  assert.equal(view(s).key, 'voice-ready');
  ({ fx } = run(s, { kind: 'click', index: 0 }));
  assert.deepEqual(fx, [{ type: 'save', id: 't1', text: 'Both fine, cc Legal.', mode: 'draft' }]);
});

test('brief error is shown and retried by tap', () => {
  let { s } = run(start(), { kind: 'click', index: 0 }, { kind: 'briefError', id: 't1', error: '503' });
  assert.match(view(s).texts[1].content, /Could not get a brief/);
  const r = step(s, { kind: 'click' });
  assert.deepEqual(r.effects, [{ type: 'brief', id: 't1' }]);
});

test('menu: snooze removes the thread, next meeting shows the related email', () => {
  let { s, fx } = run(start(), { kind: 'menu', itemId: 1 });
  assert.equal(s.threads.length, 3);
  assert.deepEqual(fx, [{ type: 'snooze', id: 't1' }]);
  ({ s } = run(start(), { kind: 'double' }));
  assert.match(view(s).texts[0].content, /Related: Kenji/);
});

test('every screen renders without throwing and stays within 12 containers', () => {
  let s = start();
  const seq = [{ kind: 'click', index: 0 }, { kind: 'brief', id: 't1', brief: inbox[0].brief }, { kind: 'click' }, { kind: 'long', index: 1 }, { kind: 'double' }, { kind: 'click', index: 3 }, { kind: 'voiceText', heard: 'x' }, { kind: 'voiceReply', reply: 'y' }, { kind: 'click', index: 1 }, { kind: 'saved', mode: 'send' }, { kind: 'menu', itemId: 3 }];
  for (const i of seq) { s = step(s, i).state; const p = view(s); assert.ok(p.texts.length + p.lists.length <= 12); }
});

test('cleanBody drops quotes and signatures', () => {
  assert.equal(cleanBody('Hi\nok?\n-- \nDana\n'), 'Hi\nok?');
  assert.equal(cleanBody('Yes\n\nOn Mon, X wrote:\n> old'), 'Yes');
});
