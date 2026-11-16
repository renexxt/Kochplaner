import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { ROOT } from './helpers.mjs';

const APP = path.join(ROOT, 'app');
const walk = (d) => fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(path.join(d, e.name)) : [path.join(d, e.name)]));

describe('Offline-Modus: Dateiliste des Service Workers', () => {
  const sw = fs.readFileSync(path.join(APP, 'sw.js'), 'utf8');
  const listed = [...sw.matchAll(/'([^']+\.(?:js|css|html|png|webmanifest))'/g)].map((m) => m[1]);
  const real = walk(APP).map((f) => path.relative(APP, f).split(path.sep).join('/')).filter((f) => f !== 'sw.js');
  it('jede App-Datei steht in der Liste, sonst fehlt sie offline', () => {
    const missing = real.filter((f) => !listed.includes(f));
    assert.deepEqual(missing, []);
  });
  it('jede gelistete Datei existiert', () => {
    const gone = listed.filter((f) => !fs.existsSync(path.join(APP, f)));
    assert.deepEqual(gone, []);
  });
  it('Version im Service Worker und in version.js stimmen überein', () => {
    const v = /APP_VERSION = '([^']+)'/.exec(fs.readFileSync(path.join(APP, 'js/version.js'), 'utf8'))[1];
    assert.match(sw, new RegExp(`VERSION = '${v.replace(/\./g, '\\.')}'`));
  });
  it('Manifest: standalone, Name, Symbole vorhanden', () => {
    const m = JSON.parse(fs.readFileSync(path.join(APP, 'manifest.webmanifest'), 'utf8'));
    assert.equal(m.display, 'standalone'); assert.equal(m.name, 'Kochplaner'); assert.equal(m.lang, 'de');
    for (const i of m.icons) assert.ok(fs.existsSync(path.join(APP, i.src)), i.src);
    assert.ok(m.icons.some((i) => i.sizes === '512x512') && m.icons.some((i) => i.purpose === 'maskable'));
  });
});
