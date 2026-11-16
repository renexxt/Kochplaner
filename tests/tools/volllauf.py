#!/usr/bin/env python3
"""Vollstaendige Laeufe in Folge: Testdaten + Orakel, Unit, Vertrag, dann alle E2E-Tests im Browser.
Ein roter Lauf beendet die Kette sofort (Erfolg heisst: N gruene Laeufe nacheinander, kein einziger Test rot).

Aufruf: python3 tests/tools/volllauf.py [N=3]
Ergebnis: evidence/lauf_1 ... lauf_N (Videos, Screenshots, steps.json; Trace nur im letzten Lauf), evidence/laeufe.json
"""
import json
import os
import re
import subprocess
import sys
import time
from datetime import datetime
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
EV = ROOT / "evidence"


def lauf(cmd, cwd, env=None):
    e = dict(os.environ)
    e.update(env or {})
    p = subprocess.run(cmd, cwd=cwd, env=e, capture_output=True, text=True)
    return p.returncode, p.stdout + p.stderr


def zahl(muster, text, default=0):
    m = re.search(muster, text, re.M)
    return int(m.group(1)) if m else default


def main():
    n_ges = int(sys.argv[1]) if len(sys.argv) > 1 else 3
    EV.mkdir(exist_ok=True)
    ergebnis = []
    for nr in range(1, n_ges + 1):
        t0 = time.time()
        start = datetime.now().strftime("%d.%m.%Y %H:%M")
        rc_b, out_b = lauf(["./data/build_all.sh"], ROOT)
        orakel = zahl(r"Ran (\d+) tests", out_b)
        rc_u, out_u = lauf(["node", "--test", "tests/unit/**/*.test.mjs"], ROOT)
        rc_v, out_v = lauf(["node", "--test", "tests/contract/**/*.test.mjs"], ROOT)
        unit, vertrag = zahl(r"^# pass (\d+)", out_u), zahl(r"^# pass (\d+)", out_v)
        ordner = EV / f"lauf_{nr}"
        if ordner.exists():
            subprocess.run(["rm", "-rf", str(ordner)])
        env = {"KP_EVIDENZ": str(ordner)}
        if nr != n_ges:
            env["KP_OHNE_TRACE"] = "1"  # Traces nur im letzten Lauf aufbewahren (Platz)
        rc_e, out_e = lauf([sys.executable, "-m", "pytest", "-p", "no:cacheprovider", "-ra", "--tb=short"], ROOT / "tests" / "e2e", env)
        ok_e, schlecht_e = zahl(r"(\d+) passed", out_e), zahl(r"(\d+) failed", out_e)
        gruen = rc_b == 0 and rc_u == 0 and rc_v == 0 and rc_e == 0 and schlecht_e == 0 and ok_e > 0
        dauer = f"{int((time.time() - t0) // 60)}:{int((time.time() - t0) % 60):02d} min"
        ergebnis.append({"nr": nr, "start": start, "dauer": dauer, "unit": unit, "vertrag": vertrag, "orakel": orakel,
                         "e2e_bestanden": ok_e, "e2e_gesamt": ok_e + schlecht_e, "gruen": gruen})
        (EV / "laeufe.json").write_text(json.dumps(ergebnis, ensure_ascii=False, indent=1), encoding="utf-8")
        print(f"Lauf {nr}: {'GRUEN' if gruen else 'ROT'} | Orakel {orakel} Unit {unit} Vertrag {vertrag} E2E {ok_e}/{ok_e + schlecht_e} | {dauer}", flush=True)
        if not gruen:
            (EV / f"lauf_{nr}_fehler.log").write_text(out_b[-3000:] + out_u[-3000:] + out_v[-3000:] + out_e[-12000:], encoding="utf-8")
            print(f"Fehlerprotokoll: evidence/lauf_{nr}_fehler.log")
            sys.exit(1)
    (EV / "logik_tests.json").write_text(json.dumps({"unit": unit, "vertrag": vertrag, "orakel": orakel}), encoding="utf-8")
    print(f"{n_ges} Laeufe in Folge gruen")


if __name__ == "__main__":
    main()
