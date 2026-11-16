import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { encodeSetup, decodeSetup, checkSetup, SetupCodeError, PREFIX } from '../../app/js/core/setupcode.js';
import { deNum, stampBerlin, timeHM } from '../../app/js/core/format.js';
import { exportText, shortcutUrl } from '../../app/js/core/export.js';

const URL1 = 'https://script.google.com/macros/s/AKfycbxEXAMPLE_ID-123/exec';
const TOK = 'a1b2c3d4e5f60718293a4b5c6d7e8f90a1b2c3d4e5f60718293a4b5c6d7e8f90';

describe('Setup-Code', () => {
  it('Codieren und Decodieren ergibt dieselben Werte', () => {
    const code = encodeSetup({ url: URL1, token: TOK });
    assert.ok(code.startsWith(PREFIX));
    assert.deepEqual(decodeSetup(code), { url: URL1, token: TOK });
  });
  it('toleriert Leerzeichen, Zeilenumbrüche, Anführungszeichen und unsichtbare Zeichen', () => {
    const code = encodeSetup({ url: URL1, token: TOK });
    const messy = ` “${code.slice(0, 20)}\n${code.slice(20, 40)}​ ${code.slice(40)}” \n`;
    assert.deepEqual(decodeSetup(messy), { url: URL1, token: TOK });
  });
  it('toleriert deutsche Anführungszeichen, Klammern und Satzzeichen um den Code', () => {
    const code = encodeSetup({ url: URL1, token: TOK });
    for (const [a, b] of [['„', '“'], ['‚', '‘'], ['»', '«'], ['«', '»'], ['<', '>'], ['(', ')'], ['`', '`'], ['', '.'], ['', ','], ['*', '*']]) {
      assert.deepEqual(decodeSetup(`${a}${code}${b}`), { url: URL1, token: TOK }, `${a}…${b}`);
    }
    assert.deepEqual(decodeSetup(`„${URL1} ${TOK}“`), { url: URL1, token: TOK });
  });
  it('Token, das auf - oder _ endet, bleibt unverändert', () => {
    const tok = 'a'.repeat(30) + '-_';
    assert.equal(decodeSetup(encodeSetup({ url: URL1, token: tok })).token, tok);
    assert.equal(decodeSetup(`${URL1} ${tok}`).token, tok);
  });
  it('versteht auch "Adresse Token"', () => {
    assert.deepEqual(decodeSetup(`${URL1} ${TOK}`), { url: URL1, token: TOK });
    assert.deepEqual(decodeSetup(`${URL1}|${TOK}`), { url: URL1, token: TOK });
  });
  it('lokale Testadresse mit http ist erlaubt, andere http-Adressen nicht', () => {
    assert.equal(checkSetup({ url: 'http://127.0.0.1:8123/exec', token: TOK }).url, 'http://127.0.0.1:8123/exec');
    assert.throws(() => checkSetup({ url: 'http://example.com/exec', token: TOK }), /https/);
  });
  it('Fehler sind deutsch und vom Typ SetupCodeError', () => {
    for (const bad of ['', '   ', 'hallo', 'KP1.', 'KP1.%%%', 'KP1.' + btoa('{"u":1}'), `${URL1} kurz`, 'KP1.' + btoa('kein json')]) {
      assert.throws(() => decodeSetup(bad), (e) => e instanceof SetupCodeError && /[a-zäöü]/.test(e.message) && e.code === 'SETUP_CODE_UNGUELTIG', 'Eingabe: ' + bad);
    }
    assert.throws(() => encodeSetup({ url: 'ftp://x', token: TOK }), SetupCodeError);
  });
  it('Umlaute und Sonderzeichen in der Adresse überleben das Codieren', () => {
    const url = 'https://example.com/m%C3%BCller/exec?x=1&y=ä';
    const back = decodeSetup(encodeSetup({ url, token: TOK }));
    assert.equal(new URL(back.url).searchParams.get('y'), 'ä');
  });
});

describe('Format und Export', () => {
  it('deNum: Dezimalkomma, Tausenderpunkt, keine Endnullen', () => {
    assert.equal(deNum(420), '420');
    assert.equal(deNum(1260), '1.260');
    assert.equal(deNum(1.5), '1,5');
    assert.equal(deNum(2.625), '2,63');
    assert.equal(deNum(0.1 + 0.2), '0,3');
    assert.equal(deNum(1234567.891), '1.234.567,89');
    assert.equal(deNum(-3.5), '-3,5');
    assert.equal(deNum(null), '');
    assert.equal(deNum(3.6667, 1), '3,7');
    assert.equal(deNum(4, 1), '4');
  });
  it('Zeitstempel und Uhrzeit in Europe/Berlin (auch bei Zeitumstellung)', () => {
    assert.equal(stampBerlin(new Date('2026-11-14T08:30:05Z')), '2026-11-14T09:30:05');
    assert.equal(stampBerlin(new Date('2026-07-01T22:30:00Z')), '2026-07-02T00:30:00');
    assert.equal(stampBerlin(new Date('2026-03-29T01:30:00Z')), '2026-03-29T03:30:00');
    assert.equal(timeHM(new Date('2026-11-14T23:05:00Z')), '00:05');
  });
  it('Export: eine Zeile je Eintrag; Kurzbefehl-Adresse', () => {
    assert.equal(exportText([{ anzeige: '1,5 l Milch' }, { anzeige: 'Salz' }]), '1,5 l Milch\nSalz');
    assert.equal(exportText([]), '');
    assert.equal(shortcutUrl(), 'shortcuts://run-shortcut?name=Einkauf&input=clipboard');
    assert.equal(shortcutUrl('Mein Einkauf'), 'shortcuts://run-shortcut?name=Mein%20Einkauf&input=clipboard');
  });
});
