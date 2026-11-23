// Records the demo video straight from the Even Hub simulator (headless).
// 1. Starts a static server for dist/ and the simulator under Xvfb.
// 2. Plays the script below through the automation API, grabbing the glasses
//    framebuffer at 10 fps (frames are timestamped so captions line up).
// 3. ffmpeg: lens frames scaled 2x on black, English captions, title and end cards.
// Usage: npm run build && node tools/record-demo.mjs   -> demo/nod-demo.mp4
import { spawn, execFileSync } from 'node:child_process';
import { mkdirSync, rmSync, writeFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const out = join(root, 'demo');
const frames = join(out, 'frames');
const API = 'http://127.0.0.1:9898/api';
const FPS = 10;
const FONT = '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf';
const FONTB = existsSync('/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf') ? '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf' : FONT;

// [hold seconds after the inputs, inputs..., caption]
const SCRIPT = [
  [1.5, [], 'Three taps: inbox → brief → reply → Gmail draft.'],
  [2, ['click'], 'Three taps: inbox → brief → reply → Gmail draft.'],
  [2, ['click'], 'Three taps: inbox → brief → reply → Gmail draft.'],
  [2.5, ['click'], 'Three taps: inbox → brief → reply → Gmail draft.'],
  [1, ['down', 'down', 'click'], 'Undo is one tap too. Now, slowly.'],
  [0.8, ['double_click'], 'Undo is one tap too. Now, slowly.'],
  [1.2, ['double_click'], 'Undo is one tap too. Now, slowly.'],
  [5, [], 'Between meetings, your phone is a trap. Nod puts only what needs you on your G2.'],
  [3, ['down'], 'Claude ranked the inbox: four of eight threads need a reply. Everything else stays away.'],
  [2, ['up'], 'Claude ranked the inbox: four of eight threads need a reply. Everything else stays away.'],
  [9, ['click'], 'One tap: Claude reduces the thread to three lines and the one thing Dana is asking for.'],
  [7, ['click'], 'Second tap: three ready replies, written in your voice.'],
  [7, ['click'], 'Third tap: saved as a Gmail draft. Three taps from inbox to reply, phone still in your pocket.'],
  [2, ['click'], 'Back to the inbox.'],
  [7, ['double_click'], 'Double-tap: your next meeting, and the email that matters for it.'],
  [2, ['double_click'], 'Double-tap: your next meeting, and the email that matters for it.'],
  [2, ['down'], 'None of the replies fit? Say it.'],
  [3, ['click'], 'None of the replies fit? Say it.'],
  [2, ['click'], 'None of the replies fit? Say it.'],
  [3, ['down', 'down', 'down'], 'None of the replies fit? Say it.'],
  [4, ['click'], '"Tell him Thursday works, any time after three, and to send an invite."'],
  [7, ['click'], 'Whisper transcribes on your backend; Claude turns it into a proper reply.'],
  [2, ['double_click'], 'Drafts by default. Sending is deliberate:'],
  [2, ['up', 'up', 'up'], 'Drafts by default. Sending is deliberate:'],
  [7, ['long_press'], 'long-press a reply, then confirm. Nothing leaves your outbox by accident.'],
  [1, ['long_press_release'], 'long-press a reply, then confirm. Nothing leaves your outbox by accident.'],
  [2, ['down', 'down', 'click'], 'Cancel goes back. Double-tap always means back.'],
  [2, ['double_click'], 'Cancel goes back. Double-tap always means back.'],
  [3, ['double_click'], 'Cancel goes back. Double-tap always means back.'],
];

const TITLE = ['Nod', 'Reply to the one email that needs you — from your Even G2', 'AI Assistants & Work · Claude + Gmail + Google Calendar'];
const END = [
  'How it works',
  'G2 lens  ←  Even Hub SDK web app (phone)  ←→  Nod backend: Claude · Gmail · Calendar · Whisper',
  'Keys stay on the backend. Drafts by default; sending needs long-press + confirm.',
  'Top-6 precision 1.00 vs 0.50 newest-first · 1.2 s median brief · ~$0.001 per email',
  'github.com/Class-now/nod-g2 · Built with Even Hub SDK 0.0.16 · recorded in evenhub-simulator 0.9.5',
];

const sleep = ms => new Promise(r => setTimeout(r, ms));
async function api(path, body) {
  const r = await fetch(API + path, body ? { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) } : {});
  if (!r.ok) throw new Error(path + ' ' + r.status);
  return r;
}

rmSync(out, { recursive: true, force: true });
mkdirSync(frames, { recursive: true });
const http = spawn('python3', ['-m', 'http.server', '5173', '--directory', join(root, 'dist')], { stdio: 'ignore' });
const sim = spawn('xvfb-run', ['-a', '-s', '-screen 0 1600x1000x24', join(root, 'node_modules/@evenrealities/sim-linux-x64/bin/evenhub-simulator'),
  '--no-glow', '--automation-port', '9898', 'http://127.0.0.1:5173/?demo=1'], { stdio: 'ignore', detached: true });
const stop = () => { try { process.kill(-sim.pid); } catch {} http.kill(); try { execFileSync('pkill', ['-f', 'evenhub-simulator']); } catch {} };

try {
  for (let i = 0; i < 120; i++) { try { await api('/ping'); break; } catch { await sleep(500); } }
  await sleep(4000);

  // capture loop
  let n = 0, running = true, caption = '';
  const caps = []; // [frameIndex, caption]
  const t0 = Date.now();
  const grab = (async () => {
    while (running) {
      const due = t0 + n * (1000 / FPS);
      if (Date.now() < due) await sleep(due - Date.now());
      const buf = Buffer.from(await (await api('/screenshot/glasses')).arrayBuffer());
      writeFileSync(join(frames, String(n).padStart(5, '0') + '.png'), buf);
      if (!caps.length || caps.at(-1)[1] !== caption) caps.push([n, caption]);
      n++;
    }
  })();
  for (const [hold, inputs, cap] of SCRIPT) {
    caption = cap;
    for (const a of inputs) { await api('/input', { action: a }); await sleep(a === 'long_press' ? 900 : 350); }
    await sleep(hold * 1000);
  }
  running = false; await grab;
  const con = await (await api('/console')).json();
  writeFileSync(join(out, 'console.json'), JSON.stringify(con, null, 1));
  const errors = (con.entries || []).filter(e => e.level === 'error');
  console.log(`frames ${n} (${(n / FPS).toFixed(1)} s), console errors ${errors.length}`);

  // captions -> one textfile per span, drawtext enabled by time
  const W = 1920, H = 1080, LW = 1152, LH = 576, LX = (W - LW) / 2, LY = 170;
  const total = n / FPS;
  const filters = [`color=c=black:s=${W}x${H}:r=${FPS}:d=${total}[bg]`, `[0:v]scale=${LW}:${LH}:flags=neighbor[lens]`,
    `[bg][lens]overlay=${LX}:${LY}:shortest=1,drawbox=x=${LX - 6}:y=${LY - 6}:w=${LW + 12}:h=${LH + 12}:color=0x1f3d1f:t=2`];
  caps.forEach(([f, text], i) => {
    if (!text) return;
    const a = f / FPS, b = i + 1 < caps.length ? caps[i + 1][0] / FPS : total;
    const tf = join(out, `cap${i}.txt`); writeFileSync(tf, text);
    filters[filters.length - 1] += `,drawtext=fontfile=${FONT}:textfile=${tf}:fontsize=38:fontcolor=white:x=(w-text_w)/2:y=${LY + LH + 90}:enable='gte(t\\,${a.toFixed(2)})*lt(t\\,${b.toFixed(2)})'`;
  });
  filters[filters.length - 1] += `,drawtext=fontfile=${FONT}:text='Even Hub simulator 0.9.5 · lens 576×288 (2x)':fontsize=24:fontcolor=0x6a8f6a:x=(w-text_w)/2:y=${LY - 60}[v]`;
  execFileSync('ffmpeg', ['-loglevel', 'error', '-y', '-framerate', String(FPS), '-i', join(frames, '%05d.png'),
    '-filter_complex', filters.join(';'), '-map', '[v]', '-r', '30', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', join(out, 'body.mp4')]);

  const card = (lines, file, secs, big) => {
    const parts = lines.map((l, i) => {
      const tf = join(out, `${file}-${i}.txt`); writeFileSync(tf, l);
      const size = i === 0 ? (big ? 120 : 64) : 34;
      const y = big ? 330 + (i === 0 ? 0 : 140 + i * 70) : 220 + (i === 0 ? 0 : 60 + i * 110);
      return `drawtext=fontfile=${i === 0 ? FONTB : FONT}:textfile=${tf}:fontsize=${size}:fontcolor=${i === 0 ? '0x7CFC7C' : 'white'}:x=(w-text_w)/2:y=${y}`;
    }).join(',');
    execFileSync('ffmpeg', ['-loglevel', 'error', '-y', '-f', 'lavfi', '-i', `color=c=black:s=1920x1080:r=30:d=${secs}`, '-vf', parts,
      '-c:v', 'libx264', '-pix_fmt', 'yuv420p', join(out, file + '.mp4')]);
  };
  card(TITLE, 'title', 3, true);
  card(END, 'end', 14, false);
  writeFileSync(join(out, 'list.txt'), ['title', 'body', 'end'].map(f => `file '${join(out, f + '.mp4')}'`).join('\n'));
  execFileSync('ffmpeg', ['-loglevel', 'error', '-y', '-f', 'concat', '-safe', '0', '-i', join(out, 'list.txt'), '-c', 'copy', join(out, 'nod-demo.mp4')]);
  const dur = execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', join(out, 'nod-demo.mp4')]).toString().trim();
  console.log('demo/nod-demo.mp4', dur, 's');
} finally { stop(); }
