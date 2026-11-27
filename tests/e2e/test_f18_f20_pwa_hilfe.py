"""F18 Web-App-Grundlagen (Manifest, Icons, Layout, Tippflaechen), F20 Hilfe und interaktive Anleitung."""
import io
import json
import re

import pytest
from PIL import Image

import kp
from kp import PROFILE

ROUTEN = ["#/plan", "#/einkauf", "#/gerichte", "#/gericht/neu", "#/rangliste", "#/einstellungen", "#/hilfe", "#/hilfe/neu", "#/hilfe/einrichtung"]

JS_LAYOUT = r"""() => {
  const out = {breit: document.documentElement.scrollWidth - document.documentElement.clientWidth, klein: [], draussen: [], geprueft: 0, verdeckt: null};
  const zu = e => { let d = e.closest('details'); while (d) { const sm = d.querySelector(':scope > summary'); if (!d.open && !(sm && sm.contains(e))) return true; d = d.parentElement && d.parentElement.closest('details'); } return false; };
  const sichtbar = e => { const r = e.getBoundingClientRect(), cs = getComputedStyle(e); return r.width > 0 && r.height > 0 && cs.visibility !== 'hidden' && cs.display !== 'none' && cs.opacity !== '0' && !zu(e); };
  const sel = 'button, a[href], select, textarea, input:not([type=hidden]), summary, [role=checkbox], [role=button]';
  for (const e of document.querySelectorAll(sel)) {
    if (!sichtbar(e) || e.closest('#tour:not(.open)')) continue;
    let t = e;
    if (e.tagName === 'INPUT' && e.type === 'checkbox' && e.closest('label')) t = e.closest('label');
    const r = t.getBoundingClientRect();
    out.geprueft++;
    if (r.width < 43.5 || r.height < 43.5) out.klein.push((e.dataset.testid || e.getAttribute('aria-label') || e.textContent.trim().slice(0, 20) || e.tagName) + ' ' + Math.round(r.width) + 'x' + Math.round(r.height));
  }
  for (const e of document.querySelectorAll('body *')) {
    if (!sichtbar(e) || getComputedStyle(e).position === 'fixed') continue;
    const r = e.getBoundingClientRect();
    if (r.right > innerWidth + 1 || r.left < -1) out.draussen.push((e.dataset.testid || e.className || e.tagName) + ' ' + Math.round(r.left) + '..' + Math.round(r.right));
  }
  // Am Ende des scrollbaren Bereichs (main) darf nichts hinter der Tab-Leiste verschwinden
  const tabs = document.querySelector('#tabs, .tabs');
  const main = document.querySelector('main');
  if (tabs && main && sichtbar(tabs)) {
    main.scrollTop = main.scrollHeight;
    const kinder = [...main.querySelectorAll('*')].filter(sichtbar);
    const unten = Math.max(...kinder.map(k => k.getBoundingClientRect().bottom));
    out.verdeckt = Math.round(unten - tabs.getBoundingClientRect().top);
    main.scrollTop = 0;
  }
  return out;
}"""


def gefuellt(lab, art):
    p = PROFILE["ben_clara"]
    m = lab.mock(p["datei"])
    app = lab.geraet(m, art, jetzt=p["start"] + "T07:00:00Z")
    app.start_setzen(p["start"])
    app.wuerfeln()
    return p, m, app


def test_f18_manifest_icons_meta(lab):
    rec = lab.rec
    m = lab.mock()
    app = lab.geraet(m, "iphone", verbunden=False)
    rec.schritt("Manifest")
    man = json.loads(app.ctx.request.get(m.base + "/manifest.webmanifest").text())
    rec.gleich("F18", (man["display"], man["name"], man["lang"]), ("standalone", "Kochplaner", "de"), "Manifest: standalone, Name, Sprache")
    rec.pruefe("F18", man["short_name"] and man["start_url"] and man["theme_color"] and man["background_color"], "Kurzname, Startadresse und Farben gesetzt")
    groessen = {}
    for ic in man["icons"]:
        r = app.ctx.request.get(m.base + "/" + ic["src"])
        rec.gleich("F18", r.status, 200, f"Icon {ic['src']} ist erreichbar")
        img = Image.open(io.BytesIO(r.body()))
        rec.gleich("F18", f"{img.size[0]}x{img.size[1]}", ic["sizes"], f"Icon {ic['src']} hat die angegebene Groesse")
        groessen[(ic["sizes"], ic["purpose"])] = img
    rec.pruefe("F18", ("192x192", "any") in groessen and ("512x512", "any") in groessen and ("512x512", "maskable") in groessen, "Icons 192, 512 und maskable vorhanden")
    app.page.goto(m.base + "/index.html")
    kopf = app.page.evaluate("""() => ({
      manifest: document.querySelector('link[rel=manifest]')?.getAttribute('href'),
      touch: document.querySelector('link[rel=apple-touch-icon]')?.getAttribute('href'),
      viewport: document.querySelector('meta[name=viewport]')?.content,
      capable: document.querySelector('meta[name=apple-mobile-web-app-capable]')?.content,
      titel: document.querySelector('meta[name=apple-mobile-web-app-title]')?.content,
      sprache: document.documentElement.lang})""")
    rec.pruefe("F18", kopf["manifest"] == "manifest.webmanifest", "Manifest ist verlinkt")
    t = app.ctx.request.get(m.base + "/" + kopf["touch"])
    img = Image.open(io.BytesIO(t.body()))
    rec.pruefe("F18", t.status == 200 and img.size == (180, 180), f"apple-touch-icon 180x180: {img.size}")
    rec.pruefe("F18", "viewport-fit=cover" in kopf["viewport"] and "width=device-width" in kopf["viewport"], "Viewport mit viewport-fit=cover (Safe-Area): " + kopf["viewport"])
    rec.gleich("F18", (kopf["capable"], kopf["titel"], kopf["sprache"]), ("yes", "Kochplaner", "de"), "iOS-Webapp-Metadaten und Sprache")
    css = app.ctx.request.get(m.base + "/css/app.css").text()
    rec.pruefe("F18", all(f"env(safe-area-inset-{s})" in css for s in ("top", "bottom", "left", "right")), "CSS beruecksichtigt die Safe-Area oben, unten, links und rechts (Notch, Home-Anzeige, Querformat)")
    rec.pruefe("F18", "100dvh" in css or "dvh" in css, "dynamische Viewport-Hoehe (iOS-Adressleiste)")


@pytest.mark.parametrize("art", ["iphone", "ipad", "ipad_quer"])
def test_f18_layout_und_tippflaechen(lab, art):
    rec = lab.rec
    p, m, app = gefuellt(lab, art)
    app.page.evaluate("window.scrollTo(0,0)")
    breite = app.page.evaluate("innerWidth")
    rec.schritt(f"{kp.GERAETE[art]} ({breite} px breit)")
    # Selbsttest: die Pruefung muss eine zu kleine Schaltflaeche auch finden
    app.page.evaluate("""() => { const b = document.createElement('button'); b.id = 'kanarienvogel'; b.textContent = 'x'; b.style.cssText = 'width:20px;height:20px;position:static'; document.querySelector('main').append(b); }""")
    r = app.page.evaluate(JS_LAYOUT)
    rec.pruefe("F18", any("x 20x20" in k or k.startswith("x ") for k in r["klein"]), "Selbsttest: eine 20x20-Schaltflaeche wird als zu klein erkannt")
    app.page.evaluate("document.getElementById('kanarienvogel').remove()")
    for route in ROUTEN:
        app.page.evaluate(f"location.hash = '{route}'")
        app.page.wait_for_function(f"location.hash === '{route}'")
        app.page.wait_for_timeout(250)
        r = app.page.evaluate(JS_LAYOUT)
        rec.pruefe("F18", r["breit"] <= 0, f"{route}: kein seitliches Scrollen/Abschneiden (Ueberstand {r['breit']} px)")
        rec.pruefe("F18", not r["draussen"], f"{route}: nichts ragt ueber den Rand: {r['draussen'][:3]}")
        rec.pruefe("F18", r["klein"] == [] and r["geprueft"] >= 3, f"{route}: alle {r['geprueft']} Bedienelemente mindestens 44x44 px {r['klein'][:4]}")
        if r["verdeckt"] is not None:
            rec.pruefe("F18", r["verdeckt"] <= 1, f"{route}: letzter Inhalt liegt nicht hinter der Tab-Leiste ({r['verdeckt']} px)")
        if route in ("#/plan", "#/einkauf", "#/gerichte", "#/einstellungen"):
            rec.shot(app.page, f"{art}_{route.strip('#/').replace('/', '_')}")
    rec.schritt("Gericht-Formular mit Zutatenzeilen: Haken, Einheit, Entfernen, Menge muessen auch dort mindestens 44 px messen")
    app.page.evaluate("location.hash = '#/gericht/neu'")
    app.page.wait_for_selector('[data-testid="gericht-name"]')
    app.t("zutaten-schnell").fill("200 g Mehl\n1,5 l Milch\n2 Eier")
    app.t("btn-zutaten-erkennen").click()
    app.t("btn-zutat-neu").click()
    app.page.wait_for_selector('[data-testid="zutat-3"]')
    r = app.page.evaluate(JS_LAYOUT)
    chk = app.page.evaluate("""() => [...document.querySelectorAll('.zutat label.chk')].map(l => { const b = l.getBoundingClientRect(); return Math.round(b.width) + 'x' + Math.round(b.height); })""")
    rec.gleich("F18", len(chk), 4, "vier Zutatenzeilen mit Einkaufen-Haken sind im Formular")
    rec.pruefe("F18", all(int(x.split("x")[0]) >= 44 and int(x.split("x")[1]) >= 44 for x in chk), f"Einkaufen-Haken samt Beschriftung mindestens 44x44 px: {chk}")
    rec.pruefe("F18", r["klein"] == [] and r["geprueft"] >= 20, f"Formular mit Zutatenzeilen: alle {r['geprueft']} Bedienelemente mindestens 44x44 px {r['klein'][:4]}")
    rec.pruefe("F18", r["breit"] <= 0 and not r["draussen"], "Formular mit Zutatenzeilen: nichts ragt seitlich heraus")
    rec.shot(app.page, f"{art}_formular_zutaten")
    rec.schritt("Plan mit Tageskarten: Karten ohne abgeschnittene Texte")
    app.page.evaluate("location.hash = '#/plan'")
    app.page.wait_for_selector('[data-testid="day-0"]')
    abg = app.page.evaluate("""() => [...document.querySelectorAll('.day *')].filter(e => { const r = e.getBoundingClientRect(); const cs = getComputedStyle(e);
      return r.width > 0 && e.scrollWidth > e.clientWidth + 1 && cs.overflowX !== 'visible' && !['INPUT','TEXTAREA'].includes(e.tagName); }).map(e => e.className || e.tagName)""")
    rec.gleich("F18", abg, [], "kein Text in den Tageskarten wird abgeschnitten")
    if art == "ipad_quer":
        sp = app.page.evaluate("getComputedStyle(document.querySelector('[data-testid=plan-tage]')).gridTemplateColumns.split(' ').length")
        rec.pruefe("F18", sp >= 2, f"iPad quer nutzt die Breite: {sp} Spalten fuer die Tageskarten")


def test_f18_hoch_und_querformat_wechsel(lab):
    """Drehen des iPad im laufenden Betrieb: Inhalt bleibt vollstaendig."""
    rec = lab.rec
    p, m, app = gefuellt(lab, "ipad")
    for w, h in ((834, 1194), (1194, 834), (834, 1194)):
        app.page.set_viewport_size({"width": w, "height": h})
        app.page.wait_for_timeout(300)
        r = app.page.evaluate(JS_LAYOUT)
        rec.pruefe("F18", r["breit"] <= 0 and not r["draussen"] and r["klein"] == [], f"{w}x{h}: kein Ueberstand, keine zu kleinen Flaechen")
        rec.pruefe("F18", len(app.tage()) == 7, f"{w}x{h}: alle 7 Tage sichtbar")
    rec.shot(app.page, "nach_drehen")


# ------------------------------------------------------------------ F20
HILFE_ROUTEN = ["#/plan", "#/einkauf", "#/gerichte", "#/gericht/neu", "#/rangliste", "#/einstellungen"]


def test_f20_hilfe_knopf_auf_jedem_bildschirm(lab):
    rec = lab.rec
    p, m, app = gefuellt(lab, "iphone")
    for route in HILFE_ROUTEN:
        app.page.evaluate(f"location.hash = '{route}'")
        app.page.wait_for_function(f"location.hash === '{route}'")
        rec.schritt(f"Bildschirm {route}")
        rec.pruefe("F20", app.t("btn-hilfe").is_visible(), "Hilfe-Knopf '?' ist sichtbar")
        box = app.t("btn-hilfe").bounding_box()
        rec.pruefe("F20", box["width"] >= 44 and box["height"] >= 44, f"Tippflaeche {box['width']:.0f}x{box['height']:.0f}")
        app.t("btn-hilfe").click()
        app.page.wait_for_selector('[data-testid="hilfe"]')
        rec.pruefe("F20", app.da("hilfe-kontext") and len(app.text("hilfe-kontext")) > 60, "Hilfe erklaert diesen Bildschirm: " + (app.text("hilfe-kontext") or "").replace("\n", " ")[:80])
        rec.pruefe("F20", all(x in app.page.inner_text("main") for x in ("1. Geführte Tour", "2. Neues Gericht", "3. Einrichtung")), "drei Teile: Tour, Neues Gericht, Einrichtung")
        rec.shot(app.page, "hilfe_" + route.strip("#/").replace("/", "_"))
        app.t("btn-zurueck").click()
        ziel = "#/gerichte" if route == "#/gericht/neu" else route  # vom Formular geht es zur Gerichteliste (Entwurf bleibt nicht erhalten, D51)
        app.page.wait_for_function(f"location.hash === '{ziel}'")
        rec.gleich("F20", app.hash(), ziel, "Zurueck fuehrt von der Hilfe zum Bildschirm " + ziel)
    for route in ("#/hilfe/neu", "#/hilfe/einrichtung"):
        app.page.evaluate(f"location.hash = '{route}'")
        app.page.wait_for_function(f"location.hash === '{route}'")
        rec.pruefe("F20", app.t("btn-hilfe").is_visible() or app.t("btn-zurueck").is_visible(), f"{route}: Hilfe oder Zurueck erreichbar")


def test_f20_hilfe_ohne_verbindung_und_inhalte(lab):
    rec = lab.rec
    m = lab.mock()
    app = lab.geraet(m, "iphone", verbunden=False)
    app.page.goto(m.base + "/index.html")
    rec.schritt("vor der Einrichtung")
    rec.pruefe("F20", app.t("btn-hilfe").is_visible(), "Hilfe-Knopf auch vor dem Verbinden da")
    app.t("btn-hilfe").click()
    app.t("hilfe-einrichtung").click()
    app.page.wait_for_selector('[data-testid="hilfe-einrichtung-seite"]')
    text = app.page.inner_text("main")
    for stichwort in ("Home-Bildschirm", "Setup-Code", "KP1.", "Kurzbefehl", "Zwischenablage abrufen", "Erinnerungen", "ohne Netz"):
        rec.pruefe("F20", stichwort in text, f"Einrichtungshilfe nennt '{stichwort}'")
    rec.shot(app.page, "hilfe_einrichtung")
    app.page.go_back()
    app.t("hilfe-neu").click()
    rec.pruefe("F20", all(x in app.page.inner_text("main") for x in ("Weg 1", "Weg 2", "Vorlage für den Chat")), "'Neues Gericht': Chat-Weg, Formular-Weg und kopierbare Vorlage")


def test_f20_tour_angebot_ueberspringen_wiederholen(lab):
    rec = lab.rec
    m = lab.mock("profile_anna.xlsx")
    app = lab.geraet(m, "iphone", verbunden=False, tour=True)
    app.verbinden()
    rec.schritt("erster Start: Tour wird angeboten")
    app.page.wait_for_selector('[data-testid="tour-angebot"]')
    rec.pruefe("F20", "Kurze Tour" in app.page.inner_text("#tour"), "Angebot: " + app.page.inner_text("#tour").replace("\n", " ")[:90])
    rec.shot(app.page, "tour_angebot")
    app.t("tour-spaeter").click()
    rec.pruefe("F20", not app.page.locator("#tour.open").count(), "'Spaeter' schliesst das Angebot")
    app.neu_laden()
    app.page.wait_for_timeout(600)
    rec.pruefe("F20", not app.da("tour-angebot"), "nach dem Neuladen wird nicht erneut angeboten")
    rec.schritt("Tour aus der Hilfe wiederholen")
    app.t("btn-hilfe").click()
    app.t("btn-tour-starten").click()
    app.page.wait_for_selector('[data-testid="tour-karte"]')
    rec.gleich("F20", app.t("tour-schritt").text_content(), "Schritt 1 von 7", "Tour startet bei Schritt 1 von 7")
    app.t("tour-weiter").click()
    app.page.wait_for_function("document.querySelector('[data-testid=tour-schritt]').textContent === 'Schritt 2 von 7'")
    app.t("tour-ueberspringen").click()
    rec.pruefe("F20", not app.page.locator("#tour.open").count(), "Ueberspringen beendet die Tour jederzeit")
    rec.schritt("Tour aus den Einstellungen wiederholen")
    app.tab("einstellungen")
    app.t("btn-tour").click()
    app.page.wait_for_selector('[data-testid="tour-karte"]')
    rec.gleich("F20", app.t("tour-schritt").text_content(), "Schritt 1 von 7", "Tour laesst sich auch aus den Einstellungen wiederholen")


EXPECT_TITEL = ["Startdatum", "Würfeln", "Tag antippen", "Portionen", "Bewerten", "Einkaufszettel", "Liste weitergeben"]
EXPECT_ZIEL = ['[data-tour="start"]', '[data-tour="shuffle"]', '[data-tour="tag"]', '[data-tour="portionen"]', '[data-tour="bewerten"]', '[data-tour="liste"] .shop-item', '[data-tour="export"]']


@pytest.mark.parametrize("art", ["iphone", "ipad_quer"])
def test_f20_tour_markiert_jeweiliges_bedienelement(lab, art):
    rec = lab.rec
    p = PROFILE["anna"]
    m = lab.mock(p["datei"])
    app = lab.geraet(m, art, jetzt=p["start"] + "T07:00:00Z", tour=True)
    app.start_setzen(p["start"])
    app.page.wait_for_selector('[data-testid="tour-angebot"]')
    app.t("tour-spaeter").click()
    app.wuerfeln()  # damit Gericht und Bewertung existieren
    app.page.evaluate("window.scrollTo(0,0)")
    app.t("btn-hilfe").click()
    app.t("btn-tour-starten").click()
    for i, (titel, ziel) in enumerate(zip(EXPECT_TITEL, EXPECT_ZIEL)):
        app.page.wait_for_function(f"document.querySelector('[data-testid=tour-schritt]')?.textContent === 'Schritt {i + 1} von 7'")
        app.page.wait_for_timeout(250)
        rec.schritt(f"Tour Schritt {i + 1}: {titel}")
        rec.gleich("F20", app.text("tour-titel"), titel, "Titel des Schritts")
        geo = app.page.evaluate("""(ziel) => {
          const z = document.querySelector(ziel), h = document.querySelector('[data-testid=tour-markierung]'), k = document.querySelector('[data-testid=tour-karte]');
          const r = e => { const b = e.getBoundingClientRect(); return {l: b.left, t: b.top, r: b.right, b: b.bottom}; };
          return {ziel: z ? r(z) : null, loch: h && getComputedStyle(h).display !== 'none' ? r(h) : null, karte: r(k), vw: innerWidth, vh: innerHeight, ziel_sel: h && h.dataset.ziel}; }""", ziel)
        rec.pruefe("F20", geo["ziel"] is not None and geo["loch"] is not None, "Bedienelement existiert und wird hervorgehoben")
        z, l, k = geo["ziel"], geo["loch"], geo["karte"]
        rec.pruefe("F20", l["l"] <= z["l"] + 1 and l["t"] <= z["t"] + 1 and l["r"] >= z["r"] - 1 and l["b"] >= z["b"] - 1, f"Markierung umschliesst das Bedienelement {geo['ziel_sel']}")
        rec.pruefe("F20", l["r"] - l["l"] <= z["r"] - z["l"] + 20 and l["b"] - l["t"] <= z["b"] - z["t"] + 20, "Markierung ist knapp, nicht der ganze Bildschirm")
        rec.pruefe("F20", k["l"] >= 0 and k["r"] <= geo["vw"] + 1 and k["t"] >= 0 and k["b"] <= geo["vh"] + 1, "Erklaerkarte liegt vollstaendig auf dem Bildschirm")
        rec.pruefe("F20", k["b"] <= l["t"] + 1 or k["t"] >= l["b"] - 1, "Erklaerkarte verdeckt das markierte Element nicht")
        if i in (1, 4):
            rec.shot(app.page, f"tour_schritt{i + 1}")
        if i == 3:
            app.t("tour-zurueck").click()
            app.page.wait_for_function("document.querySelector('[data-testid=tour-schritt]').textContent === 'Schritt 3 von 7'")
            app.t("tour-weiter").click()
            app.page.wait_for_function("document.querySelector('[data-testid=tour-schritt]').textContent === 'Schritt 4 von 7'")
            rec.gleich("F20", app.t("tour-schritt").text_content(), "Schritt 4 von 7", "Zurueck zu Schritt 3 und Weiter fuehrt wieder zu Schritt 4")
        if i < 6:
            app.t("tour-weiter").click()
    rec.gleich("F20", app.text("tour-weiter"), "Fertig", "letzter Schritt hat 'Fertig'")
    app.t("tour-weiter").click()
    app.page.wait_for_function("!document.querySelector('#tour.open')")
    rec.gleich("F20", app.hash(), "#/plan", "nach der Tour geht es zurueck zum Plan")


def test_f20_neuling_schafft_plan_und_einkaufszettel_mit_der_tour(lab):
    """Frischer Kontext ohne Vorwissen: nur Tour und sichtbare Beschriftungen (keine Testkennungen)."""
    rec = lab.rec
    p = PROFILE["anna"]
    m = lab.mock(p["datei"])
    app = lab.geraet(m, "iphone", verbunden=False, jetzt=p["start"] + "T07:00:00Z", tour=True)
    pg = app.page
    pg.goto(m.base + "/index.html")
    rec.schritt("Setup-Code einfuegen (Textfeld 'Setup-Code'), 'Verbinden'")
    pg.get_by_label("Setup-Code").fill(m.code)
    pg.get_by_role("button", name="Verbinden").click()
    pg.get_by_role("dialog", name="Tour anbieten").get_by_role("button", name="Tour starten").click()
    texte = []
    for i in range(7):
        pg.wait_for_function(f"document.querySelector('[data-testid=tour-schritt]')?.textContent === 'Schritt {i + 1} von 7'")
        texte.append(pg.get_by_role("dialog", name="Tour").locator("h3").inner_text())
        pg.get_by_role("button", name="Fertig" if i == 6 else "Weiter").click()
    rec.gleich("F20", texte, EXPECT_TITEL, "Neuling liest alle sieben Tour-Schritte")
    pg.wait_for_function("!document.querySelector('#tour.open')")
    rec.schritt("laut Tour 'Alle würfeln' tippen")
    pg.get_by_role("button", name="Alle würfeln").click()
    pg.wait_for_function("[...document.querySelectorAll('.dish-name')].filter(e => e.innerText !== 'Gericht wählen').length === 7")
    rec.gleich("F20", pg.evaluate("[...document.querySelectorAll('.dish-name')].filter(e => e.innerText !== 'Gericht wählen').length"), 7, "Plan mit 7 Gerichten allein mit der Tour erstellt")
    rec.shot(pg, "neuling_plan")
    rec.schritt("laut Tour: Einkaufszettel")
    pg.get_by_role("button", name=re.compile("^Einkauf")).click()
    pg.wait_for_selector(".shop-item")
    n = pg.locator(".shop-item").count()
    rec.pruefe("F20", n >= 8, f"Einkaufszettel mit {n} Eintraegen")
    pg.locator(".shop-item").first.click()
    rec.pruefe("F20", pg.locator(".shop-item[aria-checked=true]").count() == 1, "Eintrag abgehakt wie in der Tour beschrieben")
    pg.get_by_role("button", name="Für Notes kopieren").click()
    pg.wait_for_function("window.__kp.letzteKopie")
    rec.gleich("F20", len(app.hook("letzteKopie").split("\n")), n, "Liste weitergegeben: eine Zeile je Eintrag")
    rec.shot(pg, "neuling_einkauf")
    rec.pruefe("F20", len(m.tab("Plan")) == 7, "Plan steht im Sheet")
