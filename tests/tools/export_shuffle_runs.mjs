// Schreibt Shuffle-Laeufe der App-Logik nach evidence/shuffle_runs.json, damit oracle/check_shuffle.py sie unabhaengig pruefen kann.
import fs from 'node:fs';
import path from 'node:path';
import { proposePlan, seedFrom } from '../../app/js/core/shuffle.js';
import { emptySlots } from '../../app/js/core/plan.js';
import { loadNorm, ROOT } from '../unit/helpers.mjs';

const jobs = [
  { id: 'basis', datei: 'kochplaner_test.xlsx', stem: 'kochplaner_test', start: '2026-11-18', n: 1000 },
  { id: 'anna', datei: 'profile_anna.xlsx', stem: 'profile_anna', start: '2026-11-18', n: 1000 },
  { id: 'ben_clara', datei: 'profile_ben_clara.xlsx', stem: 'profile_ben_clara', start: '2026-11-20', n: 500 },
  { id: 'weber', datei: 'profile_weber.xlsx', stem: 'profile_weber', start: '2026-12-30', n: 200 },
];
const out = {};
for (const j of jobs) {
  const norm = loadNorm(j.stem);
  out[j.id] = { datei: j.datei, start: j.start, laeufe: [] };
  for (let i = 0; i < j.n; i++) {
    const r = proposePlan({ norm, startIso: j.start, slots: emptySlots(j.start, 2), history: norm.plan, seed: seedFrom(`export#${j.id}#${i}`) });
    out[j.id].laeufe.push(r.slots.map((s) => s.gericht_id));
  }
}
const file = path.join(ROOT, 'evidence', 'shuffle_runs.json');
fs.mkdirSync(path.dirname(file), { recursive: true });
fs.writeFileSync(file, JSON.stringify(out));
console.log('geschrieben:', file, jobs.map((j) => `${j.id}=${j.n}`).join(' '));
