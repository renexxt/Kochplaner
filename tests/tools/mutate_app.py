#!/usr/bin/env python3
"""Mutationspruefung der Web-App: baut absichtlich Fehler in eine KOPIE der App ein und prueft,
ob die Unit-Tests bzw. die E2E-Tests (Playwright) den Fehler finden. Das Original bleibt unberuehrt.

Aufruf:  python3 tests/tools/mutate_app.py [--nur A,B] [--ohne-e2e]
Ergebnis: evidence/mutation_app.json und evidence/mutation_app.md
"""
import argparse
import json
import os
import re
import shutil
import subprocess
import sys
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
TMP = Path("/tmp/kp_mutation")

# id, Beschreibung (was ein Nutzer merken wuerde), Datei, alter Text, neuer Text, Pflicht (aus dem Zieldokument), optional E2E-Datei
MUTANTEN = [
    ("A", "Skalierung ohne Division durch die Basisportionen (Mengen stimmen nur bei Basisportion)", "app/js/core/shopping.js",
     "return Fr.of(portionen).div(basis);", "return Fr.of(portionen);", True),
    ("B", "Abgehakte Eintraege gehen beim Neuladen verloren", "app/js/state.js",
     "S.checked = storage.get('checked') || {};", "S.checked = {};", True),
    ("C", "Startdatum um einen Tag verschoben (Woche beginnt einen Tag zu spaet)", "app/js/core/dates.js",
     "const d = addDays(startIso, i);", "const d = addDays(startIso, i + 1);", True),
    ("D", "Fixierte Tage werden beim 'Alle neu wuerfeln' trotzdem ueberschrieben", "app/js/core/shuffle.js",
     "const next = slots.map((s) => (s.fixiert && s.gericht_id ? { ...s }", "const next = slots.map((s) => (false ? { ...s }", False),
    ("E", "Stueck wird nach dem Addieren abgerundet statt auf 0,5 aufgerundet", "app/js/core/shopping.js",
     "total = new Fr(total.mul(Fr.of(2)).ceil(), 2n);", "total = new Fr(total.mul(Fr.of(2)).n / total.mul(Fr.of(2)).d, 2n);", False),
    ("F", "Kalorien gesamt rechnen immer mit 2 Portionen", "app/js/ui/views/plan.js",
     "kcalTotal(g, slot.portionen)", "kcalTotal(g, 2)", False),
    # Zustandslogik (nach der unabhaengigen Pruefung ergaenzt, docs/REVIEW.md): 7. Eintrag = E2E-Datei, die den Fehler finden soll
    ("G", "Verspaetete Leseantwort ueberschreibt den frisch gespeicherten Plan (B2)", "app/js/state.js",
     "if (v === rawVersion) break; // nichts Lokales ist dazwischengekommen", "break;", False, "test_review_fixes.py"),
    ("H", "Erneutes Verbinden mit gleicher Adresse verwirft ungespeicherten Plan und offene Bewertungen (B3)", "app/js/state.js",
     "const gleich = !!(S.setup && S.setup.url === setup.url);", "const gleich = false;", False, "test_review_fixes.py"),
    ("I", "Text im Schnellfeld geht beim Speichern verloren (B4)", "app/js/ui/views/dishForm.js",
     "if (f.quick.trim()) {", "if (false) {", False, "test_review_fixes.py"),
    ("J", "Neues Gericht ohne Anfrage-Kennung: nach verlorener Antwort entsteht ein Doppel (B8)", "app/js/ui/views/dishForm.js",
     "edit ? undefined : anfrageId);", "undefined);", False, "test_review_fixes.py"),
    ("K", "Entwurf bleibt nach erfolgreichem Speichern erhalten (B5)", "app/js/ui/views/dishForm.js",
     "      app.clearDraft();\n      app.toast(", "      app.toast(", False, "test_review_fixes.py"),
    ("L", "Einkaufszettel verschluckt Rechenfehler ohne Meldung (B15)", "app/js/state.js",
     "S.listeFehler = 'Der Einkaufszettel konnte nicht berechnet werden (' + (e && e.message ? e.message : e) + '). Bitte die Gerichte im Plan prüfen.';", "S.listeFehler = null;", False, "test_review_fixes.py"),
    ("M", "1.500 g Mehl wird still als 1,5 g gelesen statt als unklar markiert (B14)", "app/js/core/parse.js",
     "if (/^[1-9]\\d{0,2}\\.\\d{3}$/.test(p)) return null;", "", False, "test_review_fixes.py"),
    ("N", "Notizfeld verliert beim Neuaufbau der Liste den Fokus (B9)", "app/js/ui/views/plan.js",
     "if (el) { el.focus({ preventScroll: true });", "if (false) { el.focus({ preventScroll: true });", False, "test_review_fixes.py"),
    ("O", "Haken bleibt stehen, obwohl sich die Menge des Eintrags geaendert hat (F07: nie zu wenig kaufen)", "app/js/state.js",
     "id: `${i.key}|${i.einheit}|${i.menge_exakt}`", "id: `${i.key}|${i.einheit}`", False, "test_f06_f10_einkauf.py"),
]


def kopie(mid):
    ziel = TMP / mid
    if ziel.exists():
        shutil.rmtree(ziel)
    shutil.copytree(ROOT, ziel, ignore=shutil.ignore_patterns("evidence", "node_modules", "__pycache__", ".pytest_cache", "*.pyc"))
    return ziel


def lauf(cmd, cwd, env=None, timeout=900):
    t0 = time.time()
    e = dict(os.environ)
    e.update(env or {})
    p = subprocess.run(cmd, cwd=cwd, env=e, capture_output=True, text=True, timeout=timeout)
    return p.returncode, p.stdout + p.stderr, round(time.time() - t0, 1)


def e2e_befund(out):
    gescheitert = re.findall(r"^FAILED (\S+)", out, re.M)
    meldung = next((z.strip() for z in out.splitlines() if z.startswith("E   ") and "Error" in z), "")
    return (gescheitert[0] if gescheitert else ""), meldung[:300]


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--nur", default="")
    ap.add_argument("--ohne-e2e", action="store_true")
    ap.add_argument("--kontrolle-e2e", default="test_f01_f05_plan.py", help="E2E-Teilmenge fuer den unveraenderten Kontrolllauf")
    a = ap.parse_args()
    nur = set(filter(None, a.nur.split(",")))
    ergebnis = []

    # Kontrolle: die unveraenderte Kopie muss gruen sein, sonst sagt die Pruefung nichts aus
    k = kopie("kontrolle")
    rc_u, out_u, dt_u = lauf(["node", "--test", "tests/unit/**/*.test.mjs"], k)
    rc_e, out_e, dt_e = (0, "", 0)
    if not a.ohne_e2e:
        rc_e, out_e, dt_e = lauf([sys.executable, "-m", "pytest", "-x", a.kontrolle_e2e], k / "tests" / "e2e",
                                 {"KP_EVIDENZ": str(TMP / "kontrolle_ev"), "KP_OHNE_VIDEO": "1", "KP_OHNE_TRACE": "1"})
    ergebnis.append({"id": "Kontrolle", "beschreibung": "unveraenderte Kopie", "unit_gruen": rc_u == 0, "e2e_gruen": rc_e == 0, "dauer_s": dt_u + dt_e})
    print("Kontrolle:", "Unit", "gruen" if rc_u == 0 else "ROT", "| E2E", "gruen" if rc_e == 0 else "ROT", flush=True)
    if rc_u or rc_e:
        print(out_u[-1500:], out_e[-1500:])
        sys.exit(2)

    for mid, text, datei, alt, neu, pflicht, *rest in MUTANTEN:
        e2e_ziel = rest[0] if rest else None
        if nur and mid not in nur:
            continue
        m = kopie(mid)
        pfad = m / datei
        inhalt = pfad.read_text(encoding="utf-8")
        if inhalt.count(alt) != 1:
            print(f"Mutant {mid}: Stelle nicht eindeutig gefunden ({inhalt.count(alt)}x) in {datei}")
            sys.exit(3)
        pfad.write_text(inhalt.replace(alt, neu), encoding="utf-8")
        rc_u, out_u, dt_u = lauf(["node", "--test", "tests/unit/**/*.test.mjs"], m)
        unit_fail = re.findall(r"^not ok \d+ - (.+)$", out_u, re.M)[:3]
        r = {"id": mid, "beschreibung": text, "pflicht": pflicht, "datei": datei, "unit_findet": rc_u != 0, "unit_tests": unit_fail}
        if not a.ohne_e2e:
            rc_e, out_e, dt_e = lauf([sys.executable, "-m", "pytest", "-x"] + ([e2e_ziel] if e2e_ziel else []), m / "tests" / "e2e",
                                     {"KP_EVIDENZ": str(TMP / f"{mid}_ev"), "KP_OHNE_VIDEO": "1", "KP_OHNE_TRACE": "1"})
            test, meldung = e2e_befund(out_e)
            r.update({"e2e_findet": rc_e != 0, "e2e_test": test, "e2e_meldung": meldung, "e2e_dauer_s": dt_e})
        r["gefunden"] = r["unit_findet"] or r.get("e2e_findet", False)
        ergebnis.append(r)
        print(f"Mutant {mid}: Unit {'GEFUNDEN' if r['unit_findet'] else 'nicht gefunden'} | E2E {('GEFUNDEN ' + r.get('e2e_test', '')) if r.get('e2e_findet') else 'nicht gefunden'}", flush=True)
        shutil.rmtree(m, ignore_errors=True)

    ev = ROOT / "evidence"
    ev.mkdir(exist_ok=True)
    (ev / "mutation_app.json").write_text(json.dumps(ergebnis, ensure_ascii=False, indent=1), encoding="utf-8")
    zeilen = ["# Mutationspruefung der Web-App", "", "| Fehler | Was falsch ist | Unit-Tests | E2E-Tests | Erster E2E-Befund |", "|---|---|---|---|---|"]
    for r in ergebnis[1:]:
        zeilen.append(f"| {r['id']}{' (Pflicht)' if r['pflicht'] else ''} | {r['beschreibung']} | {'gefunden' if r['unit_findet'] else 'nicht gefunden'} | "
                      f"{'gefunden' if r.get('e2e_findet') else ('nicht gefunden' if 'e2e_findet' in r else '-')} | {r.get('e2e_test', '')} {r.get('e2e_meldung', '')} |")
    (ev / "mutation_app.md").write_text("\n".join(zeilen) + "\n", encoding="utf-8")
    ungefunden = [r["id"] for r in ergebnis[1:] if not r["gefunden"]]
    print("ALLE GEFUNDEN" if not ungefunden else f"NICHT GEFUNDEN: {ungefunden}")
    sys.exit(1 if ungefunden else 0)


if __name__ == "__main__":
    main()
