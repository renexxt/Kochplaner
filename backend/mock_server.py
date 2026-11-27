#!/usr/bin/env python3
"""Mock-Server fuer den Kochplaner (nur zum Testen, laeuft nicht beim Nutzer).

Spricht dasselbe JSON-Protokoll wie backend/Code.gs (siehe docs/PROTOCOL.md), aber gegen eine xlsx-Datei,
und liefert zusaetzlich die App-Dateien aus, damit Playwright App und Schnittstelle vom selben Host laden kann.
Die Logik ist bewusst unabhaengig von Code.gs geschrieben: Die Vertragstests laufen gegen beide und
muessen dasselbe Ergebnis liefern.

  python3 backend/mock_server.py --xlsx data/kochplaner_test.xlsx --app app --token TOKEN [--port 0]

Steuerung (nur Mock):
  POST /__mock/fehler   {"modus": "http500|timeout|kaputt|token|beschaeftigt|latenz|verloren", "anzahl": N|null, "ms": 2000}
                      verloren = Anfrage wird ausgefuehrt, die Antwort kommt aber nie an (Zeitueberschreitung beim Client)
  POST /__mock/reset    Daten zurueck auf den Stand der Startdatei, Fehler und Zaehler loeschen
  GET  /__mock/dump     Inhalt aller Tabs (wie im Sheet)
  GET  /__mock/log      Liste der Schnittstellen-Aufrufe (aktion, ok)
"""
import argparse
import json
import mimetypes
import re
import shutil
import sys
import tempfile
import threading
import time
from datetime import date, datetime
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qs, urlparse
from zoneinfo import ZoneInfo

import openpyxl

VERSION = 1
TZ = ZoneInfo("Europe/Berlin")
TABS = {
    "Gerichte": ["id", "name", "basis_portionen", "kcal_pro_portion", "tags", "favorit", "nie_wieder", "aktiv",
                 "reicht_fuer_tage", "schritte", "quelle", "angelegt_am", "status", "typ"],
    "Zutaten": ["gericht_id", "pos", "name", "menge", "einheit", "einkaufen"],
    "Plan": ["woche_start", "datum", "gericht_id", "portionen", "fixiert", "geaendert_am", "beilage_id"],
    "Bewertungen": ["gericht_id", "datum", "sterne", "notiz", "von"],
    "Einstellungen": ["schluessel", "wert"],
    "Lebensmittel": ["name", "kcal_je_100g"],
    "Richtgewichte": ["name", "einheit", "gramm"],
}
# Optionale Spalten, die ein bestehender (aelterer) Tab automatisch bekommt, ohne vorhandene Zeilen anzufassen
# (dasselbe Prinzip wie setup() in Code.gs: nur die Kopfzeile waechst, leere Zelle = sicherer Standardwert).
ERGAENZBAR = {"Gerichte": ["typ"], "Plan": ["beilage_id"]}
SETTINGS = {"standard_portionen": (1, 20), "wiederholungssperre_tage": (1, 60)}
DATE_COLS = {"woche_start", "datum", "angelegt_am", "geaendert_am"}


class ApiError(Exception):
    def __init__(self, code, meldung, feld=None):
        super().__init__(meldung)
        self.code, self.meldung, self.feld = code, meldung, feld

    def body(self):
        f = {"code": self.code, "meldung": self.meldung}
        if self.feld:
            f["feld"] = self.feld
        return {"ok": False, "fehler": f}


def bad(feld, meldung):
    raise ApiError("EINGABE_UNGUELTIG", meldung, feld)


def now_iso():
    return datetime.now(TZ).strftime("%Y-%m-%dT%H:%M:%S")


# ---- Eingabepruefung (gleiche Regeln wie Code.gs) ------------------------------------------------------------
def s(v):
    return "" if v is None else str(v).strip()


def int_in(v, lo, hi, feld):
    if isinstance(v, bool):
        n = None
    elif isinstance(v, (int, float)):
        n = v if float(v).is_integer() else None
    else:
        n = int(v) if re.fullmatch(r"\s*\d+\s*", str(v)) else None
    if n is None or not (lo <= n <= hi):
        bad(feld, f"{feld} muss eine ganze Zahl von {lo} bis {hi} sein.")
    return int(n)


def kcal_in(v, feld):
    if v in ("", None):
        return ""
    try:
        n = float(v) if isinstance(v, (int, float)) and not isinstance(v, bool) else float(str(v).replace(",", "."))
    except ValueError:
        n = None
    if n is None or not (0 < n <= 5000):
        bad(feld, f"{feld} muss leer oder eine Zahl über 0 (höchstens 5000) sein.")
    return int(n) if n.is_integer() else n


def typ_in(v, feld):
    """typ (Tab Gerichte): leer/hauptgericht/beilage, ohne Gross-/Kleinschreibung. Leer bleibt leer (= hauptgericht beim Lesen)."""
    if v in ("", None):
        return ""
    t = str(v).strip().lower()
    if t not in ("hauptgericht", "beilage"):
        bad(feld, f'{feld} muss "hauptgericht" oder "beilage" sein (oder leer).')
    return t


def menge_in(v, feld):
    if v in ("", None):
        return ""
    if isinstance(v, (int, float)) and not isinstance(v, bool):
        n = float(v)
    elif re.fullmatch(r"\s*\d+([.,]\d+)?\s*", str(v)):
        n = float(str(v).replace(",", "."))
    else:
        n = None
    if n is None or not (0 <= n <= 100000):
        bad(feld, f"{feld} muss leer oder eine Zahl von 0 bis 100000 sein.")
    return int(n) if n.is_integer() else n


def text_in(v, mx, feld):
    t = "" if v is None else str(v)
    if len(t) > mx:
        bad(feld, f"{feld} ist zu lang (höchstens {mx} Zeichen).")
    return t


def yes_no(v, feld, standard):
    if v in (None, ""):
        return standard
    if v is True or v == "ja":
        return "ja"
    if v is False or v == "nein":
        return "nein"
    bad(feld, f'{feld} muss "ja" oder "nein" sein.')


def date_str(v, feld):
    t = s(v)
    if re.fullmatch(r"\d{4}-\d{2}-\d{2}", t):
        try:
            date.fromisoformat(t)
            return t
        except ValueError:
            pass
    bad(feld, f"{feld} muss ein gültiges Datum im Format JJJJ-MM-TT sein.")


def stamp_str(v, feld):
    if v in (None, ""):
        return now_iso()
    t = s(v)
    if re.fullmatch(r"\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}", t):
        return t
    bad(feld, f"{feld} muss JJJJ-MM-TTTHH:MM:SS sein.")


def name_key(v):
    return re.sub(r"\s+", " ", s(v)).lower()


# ---- Tabellen ------------------------------------------------------------------------------------------------
def cell_json(v):
    if v is None:
        return ""
    if isinstance(v, datetime):
        return v.strftime("%Y-%m-%d") if (v.hour, v.minute, v.second) == (0, 0, 0) else v.strftime("%Y-%m-%dT%H:%M:%S")
    if isinstance(v, date):
        return v.isoformat()
    if isinstance(v, float) and v.is_integer():
        return int(v)
    return v


class Table:
    def __init__(self, wb, name, need_all):
        if name not in wb.sheetnames:
            raise ApiError("TAB_FEHLT", f'Der Tab "{name}" fehlt. Bitte setup() im Apps-Script-Editor ausführen.')
        self.ws, self.name = wb[name], name
        rows = list(self.ws.iter_rows(values_only=True))
        header = [s(h) for h in (rows[0] if rows else [])]
        self.header, self.col = header, {}
        for i, h in enumerate(header):
            if h and h not in self.col:
                self.col[h] = i
        # Neue, optionale Spalten (ERGAENZBAR) bei einem bestehenden Tab automatisch ergaenzen: nur die Kopfzeile
        # waechst, bestehende Zeilen bleiben unberuehrt (gleiches Prinzip wie setup() in Code.gs).
        if rows:
            for c in ERGAENZBAR.get(name, []):
                if c in TABS.get(name, []) and c not in self.col:
                    idx = len(header)
                    self.ws.cell(row=1, column=idx + 1, value=c)
                    header.append(c)
                    self.col[c] = idx
        if need_all:
            missing = [c for c in TABS[name] if c not in self.col]
            if missing:
                raise ApiError("SPALTE_FEHLT", f'Im Tab "{name}" fehlen Spalten: {", ".join(missing)}')
        self.records, self.rownums = [], []
        for n, r in enumerate(rows[1:], start=2):
            if all(v is None or v == "" for v in r):
                continue
            self.records.append({h: cell_json(r[i] if i < len(r) else None) for i, h in enumerate(header) if h})
            self.rownums.append(n)

    def write_row(self, rownum, rec):
        for k, v in rec.items():
            if k not in self.col:
                continue
            c = self.ws.cell(row=rownum, column=self.col[k] + 1)
            if k in DATE_COLS and isinstance(v, str) and v:
                if "T" in v:
                    c.value = datetime.strptime(v, "%Y-%m-%dT%H:%M:%S")
                    c.number_format = "yyyy-mm-dd hh:mm:ss"
                else:
                    c.value = date.fromisoformat(v)
                    c.number_format = "yyyy-mm-dd"
            elif isinstance(v, str):
                c.value = v if v != "" else None
                if v:
                    c.data_type = "s"  # nie als Formel oder Zahl deuten
            else:
                c.value = v

    def append(self, recs):
        last = max([1] + [r for r in range(1, self.ws.max_row + 1) if any(c.value not in (None, "") for c in self.ws[r])])
        for i, rec in enumerate(recs, start=1):
            self.write_row(last + i, rec)

    def delete(self, nums):
        for n in sorted(nums, reverse=True):
            self.ws.delete_rows(n, 1)


class Store:
    def __init__(self, xlsx, token):
        self.src = Path(xlsx)
        self.token = token
        self.lock = threading.Lock()
        self.tmp = Path(tempfile.mkdtemp(prefix="kochplaner_mock_"))
        self.reset()

    def reset(self):
        self.file = self.tmp / "daten.xlsx"
        shutil.copy(self.src, self.file)
        self.wb = openpyxl.load_workbook(self.file)
        self.anfragen = []

    def save(self):
        self.wb.save(self.file)

    # -- Aktionen
    def handle(self, aktion, req):
        if aktion == "ping":
            return {"ok": True, "version": VERSION, "zeit": now_iso()}
        if aktion == "lesen":
            return {"ok": True, "version": VERSION, "stand": now_iso(),
                    "daten": {n: Table(self.wb, n, False).records for n in TABS}}
        fn = {"plan_speichern": self.plan, "bewertung_speichern": self.bewertung, "gericht_speichern": self.gericht,
              "einstellung_speichern": self.einstellung}.get(aktion)
        if not fn:
            raise ApiError("AKTION_UNBEKANNT", f"Unbekannte Aktion: {aktion}")
        res = fn(req)
        self.save()
        return res

    def plan(self, req):
        rows = req.get("zeilen")
        if not isinstance(rows, list) or not 1 <= len(rows) <= 62:
            bad("zeilen", "zeilen muss eine Liste mit 1 bis 62 Einträgen sein.")
        known = {str(r["id"]) for r in Table(self.wb, "Gerichte", True).records}
        seen, clean = set(), []
        for i, r in enumerate(rows):
            f = f"zeilen[{i}]"
            if not isinstance(r, dict):
                bad(f, "Eintrag fehlt.")
            d = date_str(r.get("datum"), f + ".datum")
            if d in seen:
                bad(f + ".datum", f"Datum kommt doppelt vor: {d}")
            seen.add(d)
            gid = s(r.get("gericht_id"))
            if gid and gid not in known:
                raise ApiError("GERICHT_UNBEKANNT", f"Gericht unbekannt: {gid}", f + ".gericht_id")
            # beilage_id: optional, leer heisst kein Beilagengericht; nur die Existenz wird geprueft (wie gericht_id),
            # nicht ob typ = beilage ist. Wird der Tag geloescht (gid leer), ist beilage_id hinfaellig.
            bid = s(r.get("beilage_id"))
            if gid and bid and bid not in known:
                raise ApiError("GERICHT_UNBEKANNT", f"Gericht unbekannt: {bid}", f + ".beilage_id")
            clean.append({"woche_start": date_str(r.get("woche_start") or d, f + ".woche_start"), "datum": d, "gericht_id": gid,
                          "beilage_id": bid if gid else "",
                          "portionen": "" if not gid else int_in(r.get("portionen"), 1, 20, f + ".portionen"),
                          "fixiert": yes_no(r.get("fixiert"), f + ".fixiert", "nein"),
                          "geaendert_am": stamp_str(r.get("geaendert_am"), f + ".geaendert_am")})
        t = Table(self.wb, "Plan", True)
        row_of = {rec["datum"]: n for rec, n in zip(t.records, t.rownums)}
        app, dele, written, deleted = [], [], 0, 0
        for c in clean:
            ex = row_of.get(c["datum"])
            if c["gericht_id"] == "":
                if ex:
                    dele.append(ex)
                    deleted += 1
                continue
            if ex:
                t.write_row(ex, c)
            else:
                app.append(c)
            written += 1
        t.append(app)
        t.delete(dele)
        return {"ok": True, "geschrieben": written, "geloescht": deleted}

    def bewertung(self, req):
        gid = s(req.get("gericht_id"))
        if gid not in {str(r["id"]) for r in Table(self.wb, "Gerichte", True).records}:
            raise ApiError("GERICHT_UNBEKANNT", f"Gericht unbekannt: {gid}", "gericht_id")
        datum = date_str(req.get("datum"), "datum")
        sterne = int_in(req.get("sterne"), 1, 5, "sterne")
        notiz = text_in(req.get("notiz"), 2000, "notiz")
        von = text_in(req.get("von"), 60, "von").strip()
        t = Table(self.wb, "Bewertungen", True)
        row = None
        for rec, n in zip(t.records, t.rownums):
            if str(rec["gericht_id"]) == gid and rec["datum"] == datum and s(rec["von"]) == von:
                row = n
        rec = {"gericht_id": gid, "datum": datum, "sterne": sterne, "notiz": notiz, "von": von}
        if row:
            t.write_row(row, rec)
        else:
            t.append([rec])
        return {"ok": True, "ueberschrieben": bool(row)}

    def gericht(self, req):
        g = req.get("gericht")
        if not isinstance(g, dict):
            bad("gericht", "gericht fehlt.")
        tg = Table(self.wb, "Gerichte", True)
        gid = "" if g.get("id") in (None, "") else s(g["id"])
        row = None
        # anfrage_id: Wiederholungsschluessel (wie in Code.gs): gleiche Kennung aktualisiert das schon angelegte Gericht
        aid = "" if req.get("anfrage_id") is None else s(req["anfrage_id"])
        if aid and not re.fullmatch(r"[A-Za-z0-9_-]{1,64}", aid):
            bad("anfrage_id", "anfrage_id: nur Buchstaben, Ziffern, _ und -, höchstens 64 Zeichen.")
        wdh = False
        if gid:
            for rec, n in zip(tg.records, tg.rownums):
                if str(rec["id"]) == gid:
                    row = n
            if not row:
                raise ApiError("GERICHT_UNBEKANNT", f"Gericht unbekannt: {gid}", "gericht.id")
        elif aid:
            frueher = dict(self.anfragen).get(aid)
            if frueher:
                for rec, n in zip(tg.records, tg.rownums):
                    if str(rec["id"]) == frueher:
                        row = n
                if row:
                    gid, wdh = frueher, True
        has = g.__contains__
        rec = {}
        if not row or has("name"):
            name = re.sub(r"\s+", " ", s(g.get("name")))
            if not name:
                bad("gericht.name", "Der Name fehlt.")
            if len(name) > 120:
                bad("gericht.name", "Der Name ist zu lang (höchstens 120 Zeichen).")
            rec["name"] = name
        if has("basis_portionen") or not row:
            rec["basis_portionen"] = int_in(g["basis_portionen"], 1, 99, "gericht.basis_portionen") if has("basis_portionen") else 2
        if has("kcal_pro_portion"):
            rec["kcal_pro_portion"] = kcal_in(g["kcal_pro_portion"], "gericht.kcal_pro_portion")
        if has("tags"):
            rec["tags"] = text_in(g["tags"], 200, "gericht.tags")
        for k in ("favorit", "nie_wieder", "aktiv"):
            if has(k):
                rec[k] = yes_no(g[k], "gericht." + k, "ja" if k == "aktiv" else "nein")
            elif not row:
                rec[k] = "ja" if k == "aktiv" else "nein"
        if has("reicht_fuer_tage") or not row:
            rec["reicht_fuer_tage"] = int_in(g["reicht_fuer_tage"], 1, 7, "gericht.reicht_fuer_tage") if has("reicht_fuer_tage") else 1
        if has("schritte"):
            rec["schritte"] = text_in(g["schritte"], 20000, "gericht.schritte")
        if has("quelle") or not row:
            rec["quelle"] = text_in(g["quelle"], 500, "gericht.quelle") if has("quelle") else "App"
        if has("typ") or not row:
            rec["typ"] = typ_in(g["typ"], "gericht.typ") if has("typ") else "hauptgericht"
        if not row:
            rec["angelegt_am"] = date_str(g["angelegt_am"], "gericht.angelegt_am") if g.get("angelegt_am") else now_iso()[:10]
        zutaten = None
        if "zutaten" in req:
            zl = req["zutaten"]
            if not isinstance(zl, list) or len(zl) > 100:
                bad("zutaten", "zutaten muss eine Liste mit höchstens 100 Einträgen sein.")
            zutaten = []
            for i, z in enumerate(zl):
                f = f"zutaten[{i}]"
                if not isinstance(z, dict):
                    bad(f, "Eintrag fehlt.")
                zn = re.sub(r"\s+", " ", s(z.get("name")))
                if not zn:
                    bad(f + ".name", "Der Name der Zutat fehlt.")
                if len(zn) > 120:
                    bad(f + ".name", "Der Name der Zutat ist zu lang.")
                zutaten.append({"name": zn, "menge": menge_in(z.get("menge"), f + ".menge"),
                                "einheit": text_in(z.get("einheit"), 20, f + ".einheit").strip(),
                                "einkaufen": yes_no(z.get("einkaufen"), f + ".einkaufen", "ja")})
        if (not row or wdh) and zutaten is None:
            zutaten = []
        if has("status"):
            if g["status"] not in ("fertig", "idee"):
                bad("gericht.status", 'status muss "fertig" oder "idee" sein.')
            rec["status"] = g["status"]
        elif not row or wdh:
            rec["status"] = "fertig" if zutaten else "idee"
        warn = []
        if not row:
            key, mx = name_key(rec["name"]), 0
            for r in tg.records:
                if name_key(r["name"]) == key:
                    warn.append({"code": "NAME_EXISTIERT", "id": str(r["id"])})
                m = re.fullmatch(r"G(\d+)", str(r["id"]))
                if m:
                    mx = max(mx, int(m.group(1)))
            gid = f"G{mx + 1:03d}"
            rec["id"] = gid
            tg.append([rec])
            if aid:
                self.anfragen = [p for p in self.anfragen if p[0] != aid] + [(aid, gid)]
                self.anfragen = self.anfragen[-30:]
        else:
            tg.write_row(row, rec)
        if zutaten is not None:
            tz = Table(self.wb, "Zutaten", True)
            tz.delete([n for r, n in zip(tz.records, tz.rownums) if str(r["gericht_id"]) == gid])
            tz = Table(self.wb, "Zutaten", True)
            tz.append([{"gericht_id": gid, "pos": i + 1, **z} for i, z in enumerate(zutaten)])
        res = {"ok": True, "id": gid, "neu": not row, "warnungen": warn}
        if wdh:
            res["wiederholt"] = True
        return res

    def einstellung(self, req):
        key = s(req.get("schluessel"))
        if key not in SETTINGS:
            bad("schluessel", f"Unbekannte Einstellung: {key}")
        val = int_in(req.get("wert"), *SETTINGS[key], "wert")
        t = Table(self.wb, "Einstellungen", True)
        row = None
        for rec, n in zip(t.records, t.rownums):
            if s(rec["schluessel"]).lower() == key:
                row = n
        rec = {"schluessel": key, "wert": val}
        if row:
            t.write_row(row, rec)
        else:
            t.append([rec])
        return {"ok": True}

    def dump(self):
        return {n: Table(self.wb, n, False).records for n in self.wb.sheetnames}


class Control:
    def __init__(self):
        self.reset()

    def reset(self):
        self.modus, self.anzahl, self.ms = None, 0, 0
        self.log = []

    def take(self):
        """Gibt den aktiven Fehlermodus fuer diese Anfrage zurueck (zaehlt herunter)."""
        if not self.modus:
            return None
        if self.modus == "latenz":
            return "latenz"
        if self.anzahl is None:
            return self.modus
        if self.anzahl > 0:
            self.anzahl -= 1
            return self.modus
        return None


def make_handler(store, control, appdir):
    class H(BaseHTTPRequestHandler):
        protocol_version = "HTTP/1.1"

        def log_message(self, *a):
            pass

        def _send(self, code, body, ctype="application/json; charset=utf-8", extra=None):
            data = body if isinstance(body, bytes) else body.encode("utf-8")
            self.send_response(code)
            self.send_header("Content-Type", ctype)
            self.send_header("Content-Length", str(len(data)))
            self.send_header("Access-Control-Allow-Origin", "*")
            self.send_header("Cache-Control", "no-cache")
            for k, v in (extra or {}).items():
                self.send_header(k, v)
            self.end_headers()
            self.wfile.write(data)

        def _json(self, obj, code=200):
            self._send(code, json.dumps(obj, ensure_ascii=False))

        def do_OPTIONS(self):
            self._send(204, b"", extra={"Access-Control-Allow-Methods": "GET, POST, OPTIONS",
                                        "Access-Control-Allow-Headers": "Content-Type"})

        def _body(self):
            n = int(self.headers.get("Content-Length") or 0)
            return self.rfile.read(n).decode("utf-8") if n else ""

        def _api(self, req):
            aktion = str(req.get("aktion", ""))
            fehler = control.take()
            if fehler == "latenz":
                time.sleep(control.ms / 1000)
            elif fehler == "timeout":
                time.sleep(control.ms / 1000 if control.ms else 30)
                control.log.append({"aktion": aktion, "ok": False, "mock": "timeout"})
                return
            elif fehler == "http500":
                control.log.append({"aktion": aktion, "ok": False, "mock": "http500"})
                return self._send(500, "<html>Interner Fehler</html>", "text/html")
            elif fehler == "kaputt":
                control.log.append({"aktion": aktion, "ok": False, "mock": "kaputt"})
                return self._send(200, "<html>Bitte anmelden</html>", "text/html")
            try:
                if fehler == "token":
                    raise ApiError("TOKEN_FALSCH", "Das Token stimmt nicht.")
                if fehler == "beschaeftigt" and aktion.endswith("_speichern"):
                    raise ApiError("BESCHAEFTIGT", "Das Sheet wird gerade von jemand anderem geschrieben. Bitte gleich nochmal.")
                tok = req.get("token")
                if tok in (None, ""):
                    raise ApiError("TOKEN_FEHLT", "Das Token fehlt.")
                if str(tok) != store.token:
                    raise ApiError("TOKEN_FALSCH", "Das Token stimmt nicht.")
                with store.lock:
                    res = store.handle(aktion, req)
            except ApiError as e:
                res = e.body()
            except Exception as e:  # noqa: BLE001
                res = {"ok": False, "fehler": {"code": "INTERN", "meldung": f"Unerwarteter Fehler: {e}"}}
            control.log.append({"aktion": aktion, "ok": res.get("ok", False), **({"mock": "verloren"} if fehler == "verloren" else {})})
            if fehler == "verloren":
                time.sleep(control.ms / 1000 if control.ms else 30)
                return
            self._json(res)

        def do_GET(self):
            u = urlparse(self.path)
            if u.path == "/exec":
                q = {k: v[0] for k, v in parse_qs(u.query).items()}
                if q.get("action", "ping") not in ("ping", "lesen"):
                    return self._json({"ok": False, "fehler": {"code": "NUR_POST", "meldung": "Diese Aktion geht nur per POST."}})
                return self._api({"token": q.get("token"), "aktion": q.get("action", "ping")})
            if u.path == "/__mock/dump":
                with store.lock:
                    return self._json(store.dump())
            if u.path == "/__mock/log":
                return self._json(control.log)
            return self._static(u.path)

        def do_POST(self):
            u = urlparse(self.path)
            raw = self._body()
            if u.path == "/exec":
                try:
                    req = json.loads(raw)
                    if not isinstance(req, dict):
                        raise ValueError
                except ValueError:
                    control.log.append({"aktion": "?", "ok": False})
                    return self._json(ApiError("ANFRAGE_UNGUELTIG", "Die Anfrage ist kein gültiges JSON.").body())
                return self._api(req)
            if u.path == "/__mock/fehler":
                p = json.loads(raw or "{}")
                control.modus, control.anzahl, control.ms = p.get("modus"), p.get("anzahl", 1), p.get("ms", 0)
                return self._json({"ok": True})
            if u.path == "/__mock/reset":
                with store.lock:
                    store.reset()
                control.reset()
                return self._json({"ok": True})
            self._send(404, "nicht gefunden", "text/plain")

        def _static(self, path):
            if not appdir:
                return self._send(404, "nicht gefunden", "text/plain")
            rel = path.lstrip("/") or "index.html"
            f = (Path(appdir) / rel).resolve()
            root = Path(appdir).resolve()
            if root not in f.parents and f != root:
                return self._send(403, "verboten", "text/plain")
            if f.is_dir():
                f = f / "index.html"
            if not f.is_file():
                return self._send(404, "nicht gefunden", "text/plain")
            ctype = mimetypes.guess_type(str(f))[0] or "application/octet-stream"
            if f.suffix in (".js", ".mjs"):
                ctype = "text/javascript; charset=utf-8"
            elif f.suffix == ".webmanifest":
                ctype = "application/manifest+json"
            elif ctype.startswith("text/") or ctype in ("application/json",):
                ctype += "; charset=utf-8"
            self._send(200, f.read_bytes(), ctype)

    return H


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--xlsx", required=True)
    ap.add_argument("--app", default=None)
    ap.add_argument("--token", required=True)
    ap.add_argument("--port", type=int, default=0)
    a = ap.parse_args()
    store, control = Store(a.xlsx, a.token), Control()
    srv = ThreadingHTTPServer(("127.0.0.1", a.port), make_handler(store, control, a.app))
    srv.daemon_threads = True
    print(f"PORT={srv.server_address[1]}", flush=True)
    try:
        srv.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        shutil.rmtree(store.tmp, ignore_errors=True)


if __name__ == "__main__":
    sys.exit(main())
