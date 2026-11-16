// Gemeinsame Hilfen der Vertragstests: dieselben Faelle laufen gegen den Mock-Server (Python) und gegen Code.gs im Simulator.
import { spawn } from 'node:child_process';
import path from 'node:path';
import { createClient } from '../../app/js/adapters/api.js';
import { createAppsScript } from '../tools/gs_sim.mjs';
import { ROOT, golden } from '../unit/helpers.mjs';

export const TOKEN = 'k'.repeat(16) + 'ABCDEF0123456789'.repeat(3);
export const SIM_URL = 'https://script.example.test/macros/s/KOCHPLANER/exec';
export const KINDS = ['mock', 'appsscript'];

export const dataFile = (stem) => path.join(ROOT, 'data', stem + '.xlsx');

function startMockProcess(stem, { app = null, token = TOKEN, xlsx = null } = {}) {
  return new Promise((resolve, reject) => {
    const args = ['backend/mock_server.py', '--xlsx', xlsx || dataFile(stem), '--token', token, '--port', '0'];
    if (app) args.push('--app', app);
    const p = spawn('python3', args, { cwd: ROOT, stdio: ['ignore', 'pipe', 'inherit'] });
    let buf = '';
    p.stdout.on('data', (d) => {
      buf += d;
      const m = /PORT=(\d+)/.exec(buf);
      if (m) resolve({ proc: p, port: +m[1] });
    });
    p.on('error', reject);
    p.on('exit', (c) => reject(new Error('Mock-Server beendet: ' + c)));
    setTimeout(() => reject(new Error('Mock-Server startet nicht')), 15000);
  });
}

/** Zaehlt jeden fetch-Aufruf des Clients (gleich fuer beide Backends). */
function counting(fetchImpl) {
  const f = async (url, init) => { f.calls.push({ url, aktion: init?.body ? safeAktion(init.body) : 'GET' }); return fetchImpl(url, init); };
  f.calls = [];
  return f;
}
const safeAktion = (b) => { try { return JSON.parse(b).aktion; } catch { return '?'; } };

/**
 * Backend fuer einen Datensatz. kind = 'mock' | 'appsscript'.
 * Liefert: client(opts), rawPost(text), dump(), reset(), inject({modus, anzahl, ms}), stop(), url, calls
 */
export async function startBackend(kind, stem = 'kochplaner_test', { token = TOKEN, app = null, simOpts = {}, xlsx = null } = {}) {
  if (kind === 'mock') {
    const { proc, port } = await startMockProcess(stem, { app, token, xlsx });
    const base = `http://127.0.0.1:${port}`;
    const url = base + '/exec';
    const be = {
      kind, url, base, token,
      fetch: null,
      client(opts = {}) { const f = counting(globalThis.fetch); be.fetch = f; return createClient({ url, token, fetchImpl: f, retryDelayMs: 5, ...opts }); },
      async rawPost(text) { const r = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'text/plain' }, body: text }); return r.json(); },
      async rawGet(q) { const r = await fetch(url + '?' + new URLSearchParams(q)); return r.json(); },
      async dump() { return (await fetch(base + '/__mock/dump')).json(); },
      async reset() { await fetch(base + '/__mock/reset', { method: 'POST', body: '{}' }); },
      async inject({ modus, anzahl = 1, ms = 0 }) { await fetch(base + '/__mock/fehler', { method: 'POST', body: JSON.stringify({ modus, anzahl, ms }) }); },
      async log() { return (await fetch(base + '/__mock/log')).json(); },
      async stop() { proc.removeAllListeners('exit'); proc.kill(); },
    };
    return be;
  }
  const raw = golden(stem + '.raw.json');
  let sim = createAppsScript({ raw, token, ...simOpts });
  let inj = { fehler: null, anzahl: 0, latenzMs: 0 };
  const be = {
    kind, url: SIM_URL, token, get sim() { return sim; },
    client(opts = {}) {
      const f = counting(sim.makeFetch({ inj }));
      be.fetch = f;
      return createClient({ url: SIM_URL, token, fetchImpl: f, retryDelayMs: 5, ...opts });
    },
    async rawPost(text) { return JSON.parse(sim.post(text).body); },
    async rawGet(q) { return JSON.parse(sim.get(q).body); },
    async dump() { return sim.dump(); },
    async reset() { sim = createAppsScript({ raw, token, ...simOpts }); inj = { fehler: null, anzahl: 0, latenzMs: 0 }; },
    async inject({ modus, anzahl = 1, ms = 0 }) {
      if (modus === 'latenz') inj.latenzMs = ms;
      else if (modus === 'beschaeftigt') sim.state.lockBusy = true;
      else { inj.fehler = modus === 'netz' ? 'netz' : modus; inj.anzahl = anzahl; }
    },
    async stop() { /* nichts */ },
  };
  return be;
}

/** Entfernt Felder, die je Lauf anders sind (Serverzeit). */
export const stable = (o) => JSON.parse(JSON.stringify(o, (k, v) => (k === 'stand' || k === 'zeit' ? undefined : v)));
