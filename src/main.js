import { waitForEvenAppBridge, AudioInputSource } from '@evenrealities/even_hub_sdk';
import { initialState, view, step, W, H } from './core.js';
import { makeApi, pcmToWavBase64 } from './api.js';
import { makeGlasses, toInput } from './glasses.js';

const q = new URLSearchParams(location.search);
const cfg = {
  backend: q.get('backend') || localStorage.getItem('nod.backend') || '',
  token: q.get('token') || localStorage.getItem('nod.token') || '',
  demo: q.has('demo') || !(q.get('backend') || localStorage.getItem('nod.backend')),
};
const api = makeApi(cfg);

let state;
let glasses = null;
let bridge = null;
let lastIndex = 0;
let pcm = null;

const $ = s => document.querySelector(s);

async function boot() {
  const data = await api.inbox();
  state = initialState(data);
  $('#mode').textContent = api.mode === 'demo' ? 'Demo inbox (no account needed)' : 'Live: ' + cfg.backend;

  bridge = await Promise.race([waitForEvenAppBridge(), new Promise(r => setTimeout(() => r(null), 2500))]);
  if (bridge) {
    glasses = makeGlasses(bridge);
    bridge.onEvenHubEvent(ev => {
      if (ev.audioEvent) { if (pcm) pcm.push(ev.audioEvent.audioPcm); return; }
      if (ev.listEvent?.currentSelectItemIndex != null) lastIndex = ev.listEvent.currentSelectItemIndex;
      const input = toInput(ev);
      if (!input || input.kind === 'foreground' || input.kind === 'up' || input.kind === 'down') return;
      if (input.index == null && (state.screen === 'reply' || state.screen === 'confirm' || state.screen === 'done')) input.index = lastIndex;
      dispatch(input);
    });
    $('#conn').textContent = 'G2 connected';
  } else {
    $('#conn').textContent = 'No glasses - using the preview below (arrows, Enter, Backspace, L)';
  }
  await draw();
}

async function dispatch(input) {
  const { state: next, effects } = step(state, input);
  const layoutChanged = next.screen !== state.screen;
  state = next;
  if (layoutChanged) lastIndex = 0;
  await draw();
  for (const fx of effects) run(fx);
}

async function run(fx) {
  try {
    if (fx.type === 'brief') dispatch({ kind: 'brief', id: fx.id, brief: await api.brief(fx.id) });
    else if (fx.type === 'save') { const r = await api.save(fx.id, fx.text, fx.mode, fx.draftId); dispatch({ kind: 'saved', mode: fx.mode, draftId: r.draftId }); }
    else if (fx.type === 'undo') await api.undo(fx.draftId);
    else if (fx.type === 'snooze') await api.snooze(fx.id);
    else if (fx.type === 'markDone') await api.markDone(fx.id);
    else if (fx.type === 'refresh') { const d = await api.inbox(); state = { ...initialState(d), briefs: state.briefs }; await draw(); }
    else if (fx.type === 'mic') {
      if (fx.on) { pcm = []; if (bridge) await bridge.audioControl(true, AudioInputSource.Glasses); }
      else {
        if (bridge) await bridge.audioControl(false, AudioInputSource.Glasses);
        const chunks = pcm || []; pcm = null;
        if (fx.discard) return;
        const r = await api.voice(fx.id, chunks.length ? pcmToWavBase64(chunks) : '');
        dispatch({ kind: 'voiceText', heard: r.heard });
        dispatch({ kind: 'voiceReply', reply: r.reply });
      }
    }
  } catch (e) {
    console.error(fx.type, e);
    if (fx.type === 'brief') dispatch({ kind: 'briefError', id: fx.id, error: String(e.message || e) });
    else if (fx.type === 'mic') dispatch({ kind: 'voiceError', error: String(e.message || e) });
  }
}

async function draw() {
  const p = view(state);
  preview(p);
  if (glasses && !(await glasses.render(p))) {
    glasses = null; // bridge object exists but no Even App host answered: preview mode
    $('#conn').textContent = 'No glasses - using the preview below (arrows, Enter, Backspace, L)';
  }
}

// Phone-side mirror of what the glasses show (also what the browser demo uses).
let sel = 0;
function preview(p) {
  const el = $('#lens');
  el.style.width = W + 'px'; el.style.height = H + 'px';
  el.innerHTML = '';
  if (el.dataset.key !== p.key) { sel = 0; el.dataset.key = p.key; }
  for (const t of p.texts) {
    const d = document.createElement('div');
    d.className = 'box b' + t.brightness;
    Object.assign(d.style, { left: t.x + 'px', top: t.y + 'px', width: t.w + 'px', height: t.h + 'px' });
    d.textContent = t.content;
    el.append(d);
  }
  for (const l of p.lists) {
    const d = document.createElement('div');
    d.className = 'box list';
    Object.assign(d.style, { left: l.x + 'px', top: l.y + 'px', width: l.w + 'px', height: l.h + 'px' });
    sel = Math.min(sel, l.items.length - 1);
    l.items.forEach((it, i) => {
      const r = document.createElement('div');
      r.className = 'item' + (i === sel ? ' sel' : '');
      r.textContent = it;
      r.onclick = () => { sel = i; dispatch({ kind: 'click', index: i }); };
      d.append(r);
    });
    el.append(d);
  }
}

addEventListener('keydown', e => {
  if (glasses || !state) return;
  const p = view(state);
  const n = p.lists[0]?.items.length || 0;
  if (e.key === 'ArrowDown' && n) { sel = Math.min(n - 1, sel + 1); preview(p); }
  else if (e.key === 'ArrowUp' && n) { sel = Math.max(0, sel - 1); preview(p); }
  else if (e.key === 'Enter') dispatch({ kind: 'click', index: sel });
  else if (e.key === 'Backspace') dispatch({ kind: 'double', index: sel });
  else if (e.key === 'l') dispatch({ kind: 'long', index: sel });
  else if (e.key === 'm') dispatch({ kind: 'menu', itemId: 3 });
});

$('#save').onclick = () => {
  localStorage.setItem('nod.backend', $('#backend').value.trim());
  localStorage.setItem('nod.token', $('#token').value.trim());
  location.reload();
};
$('#backend').value = cfg.backend;
$('#token').value = cfg.token;

boot().catch(e => { console.error(e); $('#conn').textContent = 'Error: ' + e.message; });
