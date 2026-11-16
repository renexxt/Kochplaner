"""Gemeinsame Hilfen fuer die Browser-Tests (Playwright, echtes Chrome, iPhone-/iPad-Emulation).

Jeder Test bekommt einen eigenen Mock-Server (mit Kopie der Testdatei), eigene Browser-Kontexte,
Video, Trace, Screenshots und ein Assertion-Log (steps.json). Das Log ist die Grundlage des Evidenzberichts.
"""
import base64
import json
import os
import re
import subprocess
import sys
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "oracle"))
import oracle  # noqa: E402  (unabhaengiges Orakel, kein App-Code)

TOKEN = "k" * 16 + "ABCDEF0123456789" * 3
DATA = ROOT / "data"
PROFILE = {p["id"]: p for p in json.loads((DATA / "profiles.json").read_text(encoding="utf-8"))}
GERAETE = {"iphone": "iPhone 13", "ipad": "iPad Pro 11", "ipad_quer": "iPad Pro 11 landscape"}

_norm_cache = {}


def norm_von(datei):
    """Orakel-Normalform einer Testdatei (Gerichte mit Zutaten, Bewertungen ...)."""
    if datei not in _norm_cache:
        _norm_cache[datei] = oracle.normalize(oracle.dump_raw(DATA / datei))
    return _norm_cache[datei]


def setup_code(url, token=TOKEN):
    raw = json.dumps({"u": url, "t": token}, separators=(",", ":")).encode()
    return "KP1." + base64.urlsafe_b64encode(raw).decode().rstrip("=")


class Mock:
    """Lokaler Mock der Apps-Script-Schnittstelle, liefert auch die App-Dateien aus."""

    def __init__(self, datei):
        self.datei = datei
        self.proc = subprocess.Popen(
            [sys.executable, str(ROOT / "backend" / "mock_server.py"), "--xlsx", str(DATA / datei), "--app", str(ROOT / "app"),
             "--token", TOKEN, "--port", "0"], stdout=subprocess.PIPE, stderr=subprocess.DEVNULL, text=True, cwd=ROOT)
        self.port = int(re.search(r"PORT=(\d+)", self.proc.stdout.readline()).group(1))
        self.base = f"http://127.0.0.1:{self.port}"
        self.code = setup_code(self.base + "/exec")

    def stop(self):
        self.proc.terminate()
        try:
            self.proc.wait(5)
        except Exception:
            self.proc.kill()

    def _post(self, pfad, obj):
        req = urllib.request.Request(self.base + pfad, data=json.dumps(obj).encode(), method="POST", headers={"Content-Type": "text/plain"})
        return json.loads(urllib.request.urlopen(req, timeout=20).read().decode())

    def api(self, aktion, **kw):
        """Direkter Schnittstellenaufruf, so wie ein Claude-Chat ueber das Sheet schreiben wuerde."""
        return self._post("/exec", {"token": TOKEN, "aktion": aktion, **kw})

    def fehler(self, modus, anzahl=None, ms=None):
        return self._post("/__mock/fehler", {"modus": modus, "anzahl": anzahl, "ms": ms})

    def fehler_aus(self):
        return self.fehler(None)

    def reset(self):
        return self._post("/__mock/reset", {})

    def dump(self):
        return json.loads(urllib.request.urlopen(self.base + "/__mock/dump", timeout=20).read().decode())

    def log(self):
        return json.loads(urllib.request.urlopen(self.base + "/__mock/log", timeout=20).read().decode())

    def tab(self, name):
        return self.dump()[name]

    def plan(self, start=None, tage=7):
        """Gespeicherter Plan als Liste (datum, gericht_id, portionen, fixiert) ab start, sortiert."""
        rows = sorted(self.tab("Plan"), key=lambda r: r["datum"])
        if start:
            rows = [r for r in rows if r["datum"] >= start][:tage]
        return rows


class Rec:
    """Assertion-Log je Test: Funktions-ID, Schritt, Aussage, Ergebnis, Screenshot."""

    def __init__(self, name, ordner):
        self.name, self.ordner = name, Path(ordner)
        self.ordner.mkdir(parents=True, exist_ok=True)
        self.steps, self.cur, self.n = [], "", 0

    def schritt(self, text):
        self.cur = text

    def pruefe(self, fid, bedingung, text):
        self.steps.append({"f": fid, "schritt": self.cur, "aussage": text, "ok": bool(bedingung), "shot": None})
        if not bedingung:
            raise AssertionError(f"{fid}: {text}")

    def gleich(self, fid, ist, soll, text):
        ok = ist == soll
        self.steps.append({"f": fid, "schritt": self.cur, "aussage": f"{text} (Ist: {_kurz(ist)} | Soll: {_kurz(soll)})" if not ok else text, "ok": ok, "shot": None})
        if not ok:
            raise AssertionError(f"{fid}: {text}\n  Ist:  {_kurz(ist, 600)}\n  Soll: {_kurz(soll, 600)}")

    def shot(self, page, name):
        self.n += 1
        datei = f"{self.n:02d}_{re.sub(r'[^A-Za-z0-9_-]+', '_', name)}.png"
        page.screenshot(path=str(self.ordner / datei))
        if self.steps:
            self.steps[-1]["shot"] = datei
        else:
            self.steps.append({"f": "", "schritt": self.cur, "aussage": name, "ok": True, "shot": datei})

    def speichern(self, status, dauer=None, extra=None):
        (self.ordner / "steps.json").write_text(json.dumps(
            {"test": self.name, "status": status, "dauer_s": dauer, "pruefungen": self.steps, **(extra or {})}, ensure_ascii=False, indent=1), encoding="utf-8")


def _kurz(x, n=200):
    s = json.dumps(x, ensure_ascii=False) if not isinstance(x, str) else x
    return s if len(s) <= n else s[:n] + " …"


JS_TAGE = r"""() => [...document.querySelectorAll('[data-testid]')].filter(e => /^day-\d$/.test(e.dataset.testid)).map(li => {
  const id = li.dataset.testid, q = s => li.querySelector(`[data-testid="${id}-${s}"]`);
  return {datum: li.dataset.datum, kopf: q('datum')?.innerText || '', name: q('name')?.querySelector('.dish-name')?.innerText || '',
    portionen: parseInt(q('portionen')?.innerText || '0', 10), kcal_pro: q('kcal-pro')?.innerText || '', kcal_gesamt: q('kcal-gesamt')?.innerText || '',
    kcal_fehlt: !!q('kcal-fehlt'), fixiert: q('fix')?.getAttribute('aria-pressed') === 'true', schnitt: q('schnitt')?.innerText || ''};
})"""
JS_EINKAUF = r"""() => [...document.querySelectorAll('[data-testid="einkauf-eintrag"]')].map(b => ({text: b.querySelector('.txt').innerText, an: b.getAttribute('aria-checked') === 'true', key: b.dataset.key}))"""


class App:
    """Eine geoeffnete App in einem Browser-Kontext (ein 'Geraet')."""

    def __init__(self, page, ctx, mock, rec, geraet):
        self.page, self.ctx, self.mock, self.rec, self.geraet = page, ctx, mock, rec, geraet
        self.fehler_konsole, self.erlaubt = [], False
        page.on("pageerror", lambda e: self.fehler_konsole.append("pageerror: " + str(e)))
        page.on("console", lambda m: self.fehler_konsole.append("console: " + m.text) if m.type == "error" else None)

    # -- Grundlagen
    def t(self, tid):
        return self.page.locator(f'[data-testid="{tid}"]')

    def da(self, tid):
        return self.t(tid).count() > 0

    def text(self, tid):
        return self.t(tid).inner_text() if self.da(tid) else None

    def tab(self, name):
        self.t(f"tab-{name}").click()
        self.page.wait_for_function("(n) => location.hash.startsWith('#/' + n)", arg=name)

    def hash(self):
        return self.page.evaluate("location.hash")

    def verbinden(self, code=None):
        self.page.goto(self.mock.base + "/index.html")
        self.t("setup-code").fill(code or self.mock.code)
        self.t("btn-verbinden").click()
        self.page.wait_for_selector('[data-testid="day-0"]')

    def neu_laden(self):
        self.page.reload()
        self.page.wait_for_selector('[data-testid="titel"]')
        self.page.wait_for_function("window.__kp && window.__kp.bereit === true")

    def gespeichert(self, timeout=8000):
        self.page.wait_for_function("document.querySelector('[data-testid=plan-status]')?.innerText.includes('Gespeichert')", timeout=timeout)

    def hook(self, name):
        return self.page.evaluate(f"window.__kp.{name}")

    # -- Plan
    def tage(self):
        return self.page.evaluate(JS_TAGE)

    def wuerfeln(self):
        self.t("btn-shuffle").click()
        self.gespeichert()

    def start_setzen(self, iso):
        self.t("plan-start").fill(iso)
        self.page.wait_for_function("(d) => document.querySelector('[data-testid=day-0]')?.dataset.datum === d", arg=iso)

    def plan_gespeichert(self, start):
        """Plan so, wie er im (Mock-)Sheet steht, ab Start."""
        return [(r["datum"], r["gericht_id"], r["portionen"], r["fixiert"]) for r in self.mock.plan(start)]

    # -- Einkauf
    def einkauf(self):
        self.tab("einkauf")
        self.page.wait_for_selector('[data-testid="einkauf-eintrag"], [data-testid="einkauf-leer"]')
        return self.page.evaluate(JS_EINKAUF)

    def seite_ok(self):
        """Kein weisser Bildschirm: Kopfzeile und Inhalt sind da, nichts ragt seitlich heraus."""
        return self.page.evaluate("""() => ({titel: !!document.querySelector('[data-testid=titel]')?.innerText, 
          inhalt: (document.querySelector('main')?.innerText || '').trim().length > 0,
          breit: document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1})""")


def erwartete_ansicht(datei, start, plan_rows):
    """Orakel: Tagesansicht und Einkaufszettel fuer einen gespeicherten Plan."""
    norm = norm_von(datei)
    tage = [{"gericht_id": r["gericht_id"], "portionen": r["portionen"]} for r in plan_rows]
    return oracle.day_views(norm, start, tage), oracle.shopping_list(norm, tage)


def erwartete_ansicht_live(mock, start):
    """Wie erwartete_ansicht, aber aus dem aktuellen Stand des Mock-Sheets (auch mit neu angelegten Gerichten)."""
    norm = oracle.normalize(mock.dump())
    plan_rows = mock.plan(start)
    tage = [{"gericht_id": r["gericht_id"], "portionen": r["portionen"]} for r in plan_rows]
    return oracle.day_views(norm, start, tage), oracle.shopping_list(norm, tage)
