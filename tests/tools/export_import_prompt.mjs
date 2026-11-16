// Erzeugt docs/IMPORT_ANLEITUNG.md aus app/js/content/import_prompt.js (einzige Quelle).
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { importPrompt } from '../../app/js/content/import_prompt.js';

const kopf = `# Neue Gerichte per Claude-Chat eintragen

Diese Anleitung liegt auch in der App unter **Hilfe → Neues Gericht**. Dort kann man den Text unten mit einem Tipp kopieren (der Link zum Google Sheet ist dann schon eingesetzt).

So geht es: Neuen Chat mit Claude öffnen, den Text unten einfügen, dann Screenshots (jedes Bild ein Gericht), Text oder Diktat dazugeben. Claude trägt die Gerichte in das Google Sheet ein. In der App danach „Aktualisieren“ tippen.

---

`;
const text = importPrompt({ sheetLink: '<LINK ZUM GOOGLE SHEET>' });
const out = fileURLToPath(new URL('../../docs/IMPORT_ANLEITUNG.md', import.meta.url));
writeFileSync(out, kopf + text.trimEnd() + '\n', 'utf8');
console.log('geschrieben:', out, text.length, 'Zeichen');
