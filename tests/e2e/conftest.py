"""pytest-Fixtures: Browser (echtes Chrome), Mock je Test, Kontexte mit Video/Trace, Assertion-Log."""
import json
import os
import re
import time
from pathlib import Path

import pytest
from playwright.sync_api import sync_playwright

import kp

EVID = Path(os.environ.get("KP_EVIDENZ", kp.ROOT / "evidence" / "lauf_lokal"))
OHNE_VIDEO = os.environ.get("KP_OHNE_VIDEO") == "1"
OHNE_TRACE = os.environ.get("KP_OHNE_TRACE") == "1"


@pytest.hookimpl(hookwrapper=True)
def pytest_runtest_makereport(item, call):
    outcome = yield
    rep = outcome.get_result()
    setattr(item, "rep_" + rep.when, rep)


@pytest.fixture(scope="session")
def pw():
    with sync_playwright() as p:
        yield p


@pytest.fixture(scope="session")
def browser(pw):
    b = pw.chromium.launch(channel="chrome", headless=True)
    yield b
    b.close()


class Labor:
    """Pro Test: startet Mocks und Geraete (Browser-Kontexte) und sammelt Beweise."""

    def __init__(self, pw, browser, rec, ordner):
        self.pw, self.browser, self.rec, self.ordner = pw, browser, rec, ordner
        self.mocks, self.apps, self._n = [], [], 0

    def mock(self, datei="kochplaner_test.xlsx"):
        m = kp.Mock(datei)
        self.mocks.append(m)
        return m

    def geraet(self, mock, art="iphone", jetzt="2026-11-14T08:30:00Z", seed=7, verbunden=True, tour=False, sw=False,
               extern_blockiert=True, hooks=None, locale="de-DE", offline_erlaubt=False):
        self._n += 1
        opts = dict(self.pw.devices[kp.GERAETE[art]])
        opts.update(locale=locale, timezone_id="Europe/Berlin", permissions=["clipboard-read", "clipboard-write"])
        if not OHNE_VIDEO:
            opts.update(record_video_dir=str(self.ordner / f"_video{self._n}"))
        ctx = self.browser.new_context(**opts)
        h = {"jetzt": jetzt, "seed": seed, "keineTour": not tour, "ohneSW": not sw, "externBlockiert": extern_blockiert}
        h.update(hooks or {})
        ctx.add_init_script("window.__kpTest = " + json.dumps(h))
        if not OHNE_TRACE:
            ctx.tracing.start(screenshots=True, snapshots=True)
        page = ctx.new_page()
        app = kp.App(page, ctx, mock, self.rec, art)
        app.nr = self._n
        self.apps.append(app)
        if verbunden:
            app.verbinden()
        return app

    def abschluss(self, item, dauer):
        fehlgeschlagen = bool(getattr(item, "rep_call", None) and item.rep_call.failed)
        for a in self.apps:
            try:
                if fehlgeschlagen:
                    a.page.screenshot(path=str(self.ordner / f"FEHLER_geraet{a.nr}.png"))
            except Exception:
                pass
            try:
                if not OHNE_TRACE:
                    a.ctx.tracing.stop(path=str(self.ordner / f"trace_geraet{a.nr}.zip"))
            except Exception:
                pass
            video = None
            try:
                video = a.page.video
            except Exception:
                pass
            try:
                a.ctx.close()
            except Exception:
                pass
            try:
                if video and not OHNE_VIDEO:
                    video.save_as(str(self.ordner / f"video_geraet{a.nr}.webm"))
            except Exception:
                pass
        for sub in self.ordner.glob("_video*"):
            for f in sub.glob("*"):
                f.unlink()
            sub.rmdir()
        for m in self.mocks:
            m.stop()
        unerwartet = [f for a in self.apps if not a.erlaubt for f in a.fehler_konsole]
        return fehlgeschlagen, unerwartet


@pytest.fixture
def lab(request, pw, browser):
    name = re.sub(r"[^A-Za-z0-9_.-]+", "_", request.node.nodeid.split("::", 1)[1] if "::" in request.node.nodeid else request.node.name)
    ordner = EVID / name
    if ordner.exists():
        for f in ordner.rglob("*"):
            if f.is_file():
                f.unlink()
    rec = kp.Rec(name, ordner)
    labor = Labor(pw, browser, rec, ordner)
    t0 = time.time()
    yield labor
    fehlgeschlagen, unerwartet = labor.abschluss(request.node, time.time() - t0)
    status = "fehlgeschlagen" if fehlgeschlagen else "bestanden"
    extra = {}
    if unerwartet:
        extra["konsolenfehler"] = unerwartet
        if not fehlgeschlagen:
            status = "fehlgeschlagen"
    rec.speichern(status, round(time.time() - t0, 1), extra)
    if unerwartet and not fehlgeschlagen:
        pytest.fail("Unerwartete Fehler in der Browser-Konsole: " + "; ".join(unerwartet[:3]))
