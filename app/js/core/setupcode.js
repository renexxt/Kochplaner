// Setup-Code: "KP1." + base64url(JSON {u: Adresse, t: Token}). Beim Lesen tolerant (Leerzeichen, Zeilenumbrueche, Anfuehrungszeichen).
// Alternativ wird auch "Adresse Token" (durch Leerzeichen, | oder ; getrennt) verstanden.
export const PREFIX = 'KP1.';

export class SetupCodeError extends Error {
  constructor(message) { super(message); this.name = 'SetupCodeError'; this.code = 'SETUP_CODE_UNGUELTIG'; }
}

const MELDUNG = 'Dieser Setup-Code ist nicht gültig. Bitte den ganzen Code noch einmal kopieren; er beginnt mit KP1.';

function b64uEncode(text) {
  const bytes = new TextEncoder().encode(text);
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
function b64uDecode(s) {
  const pad = '='.repeat((4 - (s.length % 4)) % 4);
  const bin = atob(s.replace(/-/g, '+').replace(/_/g, '/') + pad);
  const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
  return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
}

/** Prueft Adresse und Token; wirft SetupCodeError mit deutscher Meldung. */
export function checkSetup({ url, token }) {
  let u;
  try { u = new URL(String(url || '').trim()); } catch { throw new SetupCodeError('Die Adresse im Setup-Code ist keine gültige Internetadresse.'); }
  const lokal = u.hostname === 'localhost' || u.hostname === '127.0.0.1';
  if (u.protocol !== 'https:' && !(u.protocol === 'http:' && lokal)) throw new SetupCodeError('Die Adresse im Setup-Code muss mit https:// beginnen.');
  const t = String(token || '').trim();
  if (t.length < 16 || !/^[A-Za-z0-9_-]+$/.test(t)) throw new SetupCodeError('Der Zugangsschlüssel (Token) im Setup-Code ist ungültig oder zu kurz.');
  return { url: u.toString(), token: t };
}

export function encodeSetup({ url, token }) {
  const ok = checkSetup({ url, token });
  return PREFIX + b64uEncode(JSON.stringify({ u: ok.url, t: ok.token }));
}

export function decodeSetup(input) {
  // Umgebende Zeichen, die beim Weitergeben entstehen (Anfuehrungszeichen aller Art, Klammern, Satzzeichen), werden entfernt.
  const UMGEBUNG = /^[\s"'“”„‟‘’‚‛«»‹›`<>()[\]{}.,;:!?*_-]+|[\s"'“”„‟‘’‚‛«»‹›`<>()[\]{}.,;:!?*]+$/g;
  const text = String(input ?? '').replace(/[​-‍﻿]/g, '').trim().replace(UMGEBUNG, '').trim();
  if (!text) throw new SetupCodeError('Bitte den Setup-Code einfügen.');
  const compact = text.replace(/\s+/g, '');
  if (compact.startsWith(PREFIX)) {
    let obj;
    try { obj = JSON.parse(b64uDecode(compact.slice(PREFIX.length))); } catch { throw new SetupCodeError(MELDUNG); }
    if (!obj || typeof obj !== 'object') throw new SetupCodeError(MELDUNG);
    return checkSetup({ url: obj.u, token: obj.t });
  }
  const m = /^(https?:\/\/\S+?)[\s|;]+(\S+)$/.exec(text);
  if (m) return checkSetup({ url: m[1], token: m[2] });
  throw new SetupCodeError(MELDUNG);
}
