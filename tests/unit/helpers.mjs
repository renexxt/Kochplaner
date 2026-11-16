import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { normalize } from '../../app/js/core/normalize.js';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
export const readJson = (...p) => JSON.parse(fs.readFileSync(path.join(ROOT, ...p), 'utf8'));
export const golden = (name) => readJson('data', 'golden', name);
export const FILES = ['kochplaner_test', 'profile_anna', 'profile_ben_clara', 'profile_weber', 'edge_empty', 'edge_noingredients'];
// so laedt die App: Rohdaten aus dem Sheet -> normalisiertes Modell
export const loadNorm = (stem) => normalize(golden(`${stem}.raw.json`));
