// Client fuer die Kochplaner-Schnittstelle (Apps Script oder Mock). Protokoll: docs/PROTOCOL.md
// POST als text/plain, damit der Browser keine Vorabfrage (CORS-Preflight) schickt, die Apps Script nicht beantwortet.

export class ApiError extends Error {
  constructor(code, meldung, { feld = null, status = null } = {}) {
    super(meldung);
    this.name = 'ApiError';
    this.code = code;
    this.meldung = meldung;
    this.feld = feld;
    this.status = status;
  }
  /** Fehler, bei denen ein erneuter Versuch sinnvoll ist (Verbindung, Zeit, Serverfehler, Sheet gerade belegt) */
  get vorruebergehend() { return ['NETZWERK', 'ZEITUEBERSCHREITUNG', 'HTTP_FEHLER', 'BESCHAEFTIGT'].includes(this.code); }
}

const LESEN = new Set(['ping', 'lesen', 'ausgaben_lesen']);

export function createClient({ url, token, fetchImpl, timeoutMs = 20000, retries = 1, retryDelayMs = 400 }) {
  const doFetch = fetchImpl || ((...a) => globalThis.fetch(...a));
  if (!url) throw new ApiError('SETUP_FEHLT', 'Die Adresse der Schnittstelle fehlt. Bitte den Setup-Code eingeben.');

  async function einmal(aktion, body) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeoutMs);
    let res;
    try {
      res = await doFetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify({ token, aktion, ...body }),
        redirect: 'follow',
        signal: ctrl.signal,
      });
    } catch (e) {
      if (ctrl.signal.aborted || e?.name === 'AbortError') {
        throw new ApiError('ZEITUEBERSCHREITUNG', 'Der Server antwortet nicht. Bitte später nochmal versuchen.');
      }
      throw new ApiError('NETZWERK', 'Keine Verbindung. Bitte Internet prüfen.');
    } finally {
      clearTimeout(timer);
    }
    if (!res.ok) throw new ApiError('HTTP_FEHLER', `Der Server meldet einen Fehler (${res.status}).`, { status: res.status });
    let json;
    try {
      json = await res.json();
    } catch {
      throw new ApiError('ANTWORT_UNGUELTIG', 'Die Antwort des Servers ist nicht lesbar. Stimmt die Adresse im Setup-Code?');
    }
    if (!json || typeof json !== 'object') throw new ApiError('ANTWORT_UNGUELTIG', 'Die Antwort des Servers ist nicht lesbar.');
    if (json.ok !== true) {
      const f = json.fehler || {};
      throw new ApiError(f.code || 'INTERN', f.meldung || 'Unbekannter Fehler.', { feld: f.feld || null });
    }
    return json;
  }

  async function call(aktion, body = {}) {
    const max = LESEN.has(aktion) ? retries : 0; // Schreiben nie automatisch wiederholen
    for (let versuch = 0; ; versuch++) {
      try {
        return await einmal(aktion, body);
      } catch (e) {
        if (versuch >= max || !(e instanceof ApiError) || !e.vorruebergehend) throw e;
        await new Promise((r) => setTimeout(r, retryDelayMs));
      }
    }
  }

  return {
    ping: () => call('ping'),
    lesen: () => call('lesen'),
    planSpeichern: (zeilen) => call('plan_speichern', { zeilen }),
    bewertungSpeichern: (b) => call('bewertung_speichern', b),
    // anfrageId: Wiederholungsschluessel, damit ein zweiter Versuch nach verlorener Antwort kein doppeltes Gericht anlegt
    gerichtSpeichern: (gericht, zutaten, anfrageId) => call('gericht_speichern', { gericht, ...(zutaten === undefined ? {} : { zutaten }), ...(anfrageId ? { anfrage_id: anfrageId } : {}) }),
    einstellungSpeichern: (schluessel, wert) => call('einstellung_speichern', { schluessel, wert }),
    // Ausgaben (F24): eigenstaendig, nicht an einen bestimmten Einkaufszettel oder Plan gebunden.
    ausgabeSpeichern: (ausgabe) => call('ausgabe_speichern', ausgabe),
    ausgabenLesen: () => call('ausgaben_lesen'),
  };
}
