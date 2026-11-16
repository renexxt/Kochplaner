// Export des Einkaufszettels (F08, F09): Klartext, eine Zeile je Eintrag
export const NOTES_ANLEITUNG = 'Einfügen, Text markieren, Checkliste antippen';
export const KURZBEFEHL_NAME = 'Einkauf';

export const exportText = (items) => items.map((i) => i.anzeige).join('\n');

/** Adresse, die den Kurzbefehl startet. Die Liste liegt dabei in der Zwischenablage (Eingabe = Zwischenablage). */
export const shortcutUrl = (name = KURZBEFEHL_NAME) => `shortcuts://run-shortcut?name=${encodeURIComponent(name)}&input=clipboard`;
