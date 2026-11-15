// Zwischenablage: erst die moderne Schnittstelle, sonst ein verstecktes Textfeld (aeltere iOS-Versionen).
export async function copyText(text) {
  try {
    if (navigator.clipboard && window.isSecureContext) { await navigator.clipboard.writeText(text); return true; }
  } catch { /* weiter mit Rueckfall */ }
  try {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.setAttribute('readonly', '');
    ta.style.cssText = 'position:fixed;top:0;left:0;opacity:0;font-size:16px';
    document.body.append(ta);
    ta.focus();
    ta.select();
    ta.setSelectionRange(0, text.length);
    const ok = document.execCommand('copy');
    ta.remove();
    return ok;
  } catch { return false; }
}

/** Teilen-Dialog (iOS). Gibt false zurueck, wenn nicht verfuegbar. Abbrechen durch den Nutzer zaehlt als erledigt. */
export async function shareText(text, title = 'Einkaufszettel') {
  if (!navigator.share) return false;
  try { await navigator.share({ title, text }); return true; } catch (e) { return e && e.name === 'AbortError'; }
}
