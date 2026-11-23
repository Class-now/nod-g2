// Measures what the submission claims:
//  1. triage: does Claude's "needs a reply" agree with the hand labels? vs. the
//     baseline every mail client uses on a small screen (newest 6 first).
//  2. brief latency (median, p90) and cost per thread.
// Usage: ANTHROPIC_API_KEY=... node eval/triage.mjs  -> eval/results.json
import fs from 'node:fs';
import { needsReply, brief, MODEL } from '../server/claude.mjs';

const set = JSON.parse(fs.readFileSync(new URL('./triage-set.json', import.meta.url)));
// $ per million tokens (input, output). Update if the price list changes.
const PRICE = { 'claude-haiku-5-5': [1, 5] }[MODEL] || [1, 5];
const cost = u => ((u?.input_tokens || 0) * PRICE[0] + (u?.output_tokens || 0) * PRICE[1]) / 1e6;

const pr = (pred, gold) => {
  let tp = 0, fp = 0, fn = 0, ok = 0;
  pred.forEach((p, i) => { if (p && gold[i]) tp++; else if (p) fp++; else if (gold[i]) fn++; if (p === gold[i]) ok++; });
  return { accuracy: ok / gold.length, precision: tp / (tp + fp || 1), recall: tp / (tp + fn || 1) };
};

const gold = set.map(x => x.label);
const shown6 = set.map((_, i) => i < 6);
const baseline = { ...pr(shown6, gold), note: 'newest 6 shown = "needs you"' };

const preds = [], triCost = [];
for (const m of set) {
  const r = await needsReply(m).catch(e => ({ needsReply: true, err: String(e) }));
  preds.push(!!r.needsReply); triCost.push(cost(r.usage));
}
const claudeTriage = pr(preds, gold);
const top6 = set.map((m, i) => ({ i, p: preds[i] })).filter(x => x.p).slice(0, 6);
const top6precision = top6.filter(x => gold[x.i]).length / (top6.length || 1);

const lat = [], bCost = [];
for (const m of set.filter(x => x.label).slice(0, 12)) {
  const b = await brief(m);
  lat.push(b.ms); bCost.push(cost(b.usage));
}
lat.sort((a, b) => a - b);
const med = a => a[Math.floor(a.length / 2)];
const results = {
  model: MODEL, n: set.length, needReply: gold.filter(Boolean).length,
  baseline, claudeTriage, top6precision: { claude: top6precision, baseline: baseline.precision },
  briefLatencyMs: { median: med(lat), p90: lat[Math.floor(lat.length * 0.9)] },
  costPerThreadUSD: (triCost.reduce((a, b) => a + b, 0) / set.length) + (bCost.reduce((a, b) => a + b, 0) / bCost.length),
  tapsToDraft: { nod: 3, note: 'Home tap -> Brief tap -> Reply tap (tested in test/core.test.mjs)' },
  at: new Date().toISOString(),
};
fs.writeFileSync(new URL('./results.json', import.meta.url), JSON.stringify(results, null, 2));
console.log(JSON.stringify(results, null, 2));
