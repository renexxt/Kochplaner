#!/usr/bin/env python3
"""Migriert Rezeptdatenbank.xlsx (5 Gerichte-Tabs + 5 strukturierte Zutaten-Tabs + Zubereitung +
Kalorien je 100 g) in das Sheet-Format des Kochplaners. Analog zu tools/migrate_rezeptideen.py:
baut eine Ergebnis-xlsx (Vorlage-Format) + <ausgabe>.zeilen.json, schreibt NIE direkt ins
echte Google Sheet.

Aufruf:
    python3 tools/migrate_rezeptdatenbank.py <Rezeptdatenbank.xlsx> <ausgabe.xlsx>
        [--start N] [--vorhandene-namen DATEI] [--datum JJJJ-MM-TT]

--start N            Erste neue Gerichte-Nummer (G<N>). Ohne Angabe: 100 (siehe Auftrag:
                      ersatzweise G100, falls die hoechste vorhandene Nummer im echten Sheet
                      nicht per Google-Sheets-Konnektor ermittelt werden konnte).
--vorhandene-namen D  Textdatei mit einer vorhandenen Gerichte-Zeile je Zeile, Format
                      "<id>\\t<name>". Fuer den Dupletten-Check gegen das echte Sheet. Ohne
                      Angabe entfaellt der Check (wird in der Zusammenfassung vermerkt).
--datum JJJJ-MM-TT    Wert fuer angelegt_am. Ohne Angabe: heutiges Datum.

Abbildung (Quelltabs -> Gerichte.typ / zusaetzliche tags), siehe docs/DECISIONS.md:
  Hauptgerichte              -> hauptgericht, tags: diät
  Beilagen                   -> beilage,      tags: diät
  Nicht-Diät Hauptgerichte   -> hauptgericht, tags: (keine Basis-Tags)
  Nicht-Diät Beilagen        -> beilage,      tags: (keine Basis-Tags)
  Süßes & Backen             -> hauptgericht, tags: süß
Zusaetzlich je Gericht ggf. "Fisch" / "vegetarisch", wenn anhand der Zutatenliste eindeutig
(siehe FISCH_ZUTATEN / NICHT_VEGETARISCH unten; im Zweifel kein Tag, nicht geraten).

kcal_pro_portion kommt direkt aus der Quelle (schon fertig gerechnet). Zutaten kommen aus den
fuenf strukturierten "Zutaten ..."-Tabs (nicht aus der Freitext-Spalte "Zutaten fuer 1 Portion"),
menge = "Menge (g/ml)", einheit ist auf Wunsch des Auftraggebers immer 'g' (keine Umrechnung).
schritte kommen aus dem Tab "Zubereitung" (gematcht ueber Rubrik + ID); fehlt ein Eintrag, schreibt
baue_zubereitung_aus_zutaten() eine plausible Zubereitung aus der Zutatenliste (Ausnahme von der
sonstigen "nichts raten"-Regel, siehe Auftrag).

WICHTIG (Fund ausserhalb dieses Auftrags, siehe Bericht): kochplaner_vorlage.xlsx ist auf diesem
Stand fuer die Tabs "Gerichte" und "Plan" beschaedigt (Kopfzeile nur ['typ'] bzw. ['beilage_id'],
siehe tools/make_vorlage.py-Bug mit dem ERGAENZBAR-Block in backend/Code.gs). Dieses Skript laedt
die Kopfzeilen deshalb bewusst NICHT aus kochplaner_vorlage.xlsx, sondern wie tools/make_vorlage.py
direkt und robust aus backend/Code.gs (KP.TABS), und baut die Ausgabedatei damit frisch auf.
"""
import datetime
import json
import re
import sys
from pathlib import Path

import openpyxl
from openpyxl.styles import Font

ROOT = Path(__file__).resolve().parent.parent
QUELLE_NAME = 'Rezeptdatenbank.xlsx'

# Reihenfolge der fuenf Gerichte-Tabs, wie sie durchlaufen werden (bestimmt auch die Vergabe der
# neuen G###-Nummern: "fortlaufend", Quellreihenfolge je Tab, Tabs in dieser Reihenfolge).
GERICHTE_TABS = [
    ('Hauptgerichte', 'Hauptgericht', 'hauptgericht', ['diät']),
    ('Beilagen', 'Beilage', 'beilage', ['diät']),
    ('Nicht-Diät Hauptgerichte', 'Hauptgericht', 'hauptgericht', []),
    ('Nicht-Diät Beilagen', 'Beilage', 'beilage', []),
    ('Süßes & Backen', 'Süßes', 'hauptgericht', ['süß']),
]
ZUTATEN_TAB_FUER = {
    'Hauptgerichte': 'Zutaten Hauptgerichte',
    'Beilagen': 'Zutaten Beilagen',
    'Nicht-Diät Hauptgerichte': 'Nicht-Diät Zutaten Haupt',
    'Nicht-Diät Beilagen': 'Nicht-Diät Zutaten Beilagen',
    'Süßes & Backen': 'Zutaten Süßes',
}

DATUMSSPALTEN = {'angelegt_am'}  # wie KP.DATUMSSPALTEN in Code.gs, nur die hier erzeugte Spalte

# Datenbasierte, dokumentierte Ausnahme von "einkaufen = ja" (siehe Bericht): Im Hinweise-Tab der
# Quelle steht "Salz, Pfeffer und trockene Gewuerze sind nicht mitgerechnet" - sie kommen in den
# fuenf strukturierten Zutaten-Tabs tatsaechlich nie als eigene Zeile vor (gepruefte Faelle: 0).
# Wasser kommt ebenfalls nie vor. Die einzigen real vorkommenden "immer da"-Kandidaten sind die
# beiden allgemeinen Kochoele. Spezialoele bleiben bewusst einkaufen=ja (Grenzfall, seltener
# vorraetig): Sesamoel (7x), Erdnussoel (1x), "Olivenoel (Dip)" (3x, eigener Name/Verwendungszweck).
IMMER_DA = {'olivenöl', 'rapsöl'}

# Fisch/Meeresfruechte (eindeutig, vollstaendig durchgesehene Liste aller 265 Zutatennamen der
# Quelle). "Austernpilze" ist bewusst NICHT enthalten: ein Pilz, keine Meeresfruchtfall trotz Name.
FISCH_ZUTATEN = {
    'fisch (weiß)', 'garnelen', 'lachs', 'pangasius', 'räucherlachs', 'sardellen', 'seelachs',
    'thunfisch in öl (nettoeinwaage)',
}
# Zutaten, die "vegetarisch" ausschliessen: Fleisch/Fisch/Innereien/Wurst + eindeutig tierische
# Fonds/Saucen + zwei im Namen uneindeutige Zutaten (Currypaste kann Fischpaste enthalten,
# Bratensoße ist ueblicherweise Fleischsaft) - im Zweifel kein Tag statt geraten.
NICHT_VEGETARISCH = FISCH_ZUTATEN | {
    'bauchspeck mager geräuchert', 'brathähnchen (fleisch ohne haut)', 'bratwurstbrät',
    'geflügelleber', 'hackfleisch gemischt', 'hähnchenbrust', 'hähnchenschenkel',
    'hähnchenschenkelfilet', 'italienische schweinswürstchen', 'jagdwurst',
    'kalbfleisch (schulter)', 'kalbs- oder lammhackfleisch', 'kalbsbries', 'kalbsbrust',
    'kalbsfuß (essbar)', 'kalbsgekröse', 'kalbsschnitzel', 'kochschinken', 'leber',
    'leberkäsbrät', 'lammfilet', 'lammhackfleisch', 'mortadella', 'nürnberger würstchen',
    'putenfleisch', 'putenschnitzel', 'räucherbratwurst', 'rinderfilet',
    'rinderhackfleisch (ca. 15 % fett)', 'rinderhackfleisch (ca. 20 % fett)',
    'rinderhackfleisch mager', 'rinderrouladenfleisch', 'rindfleisch (gebraten)',
    'rindfleisch (gekocht)', 'rindfleisch (gulasch)', 'rohschinken', 'rostbraten (rind)',
    'saitenwürstle', 'salami', 'schinkenwurst', 'schwarzwurst', 'schweinebauch',
    'schweinefilet', 'schweinefleisch mager', 'schweineknöchel (essbar)',
    'schweinelachssteak', 'schweinenacken', 'schweineschmalz', 'schweineschnitzel',
    'schweinezunge', 'speck', 'suppenfleisch (rind)', 'tafelspitz', 'gelatine',
    'fleischbrühe', 'hühnerbrühe', 'bratensoße', 'currypaste',
}


def cell_out(v, spalte):
    """Portiert cellOut_ aus backend/Code.gs 1:1 nach Python (siehe DECISIONS.md D29): schuetzt
    Freitext vor Googles automatischer Zahlen-/Datums-/Formel-Erkennung beim spaeteren Einspielen
    ins Sheet. Zahlen und die Datumsspalte bleiben unangetastet."""
    if v is None:
        return ''
    if not isinstance(v, str) or v == '':
        return v
    if spalte in DATUMSSPALTEN:
        return v
    if (re.match(r'^[=+\-@]', v) or re.match(r'^\s*[-+]?[\d.,]+\s*$', v) or
            re.match(r'^\d{1,4}[-./]\d{1,2}[-./]\d{1,4}', v) or
            re.match(r'^(true|false)$', v, re.IGNORECASE) or v[0] == "'"):
        return "'" + v
    return v


def tabs_aus_code_gs():
    """Wie tools/make_vorlage.py, aber mit korrekter Blockgrenze: schneidet den TABS-Block bis vor
    'ERGAENZBAR:' ab (nicht bis 'SETTINGS:'). tools/make_vorlage.py schneidet bis 'SETTINGS:' und
    erfasst dadurch auch den ERGAENZBAR-Block; da ERGAENZBAR ebenfalls Schluessel 'Gerichte' und
    'Plan' verwendet, ueberschreiben dessen Werte (['typ'] bzw. ['beilage_id']) in der
    Dict-Comprehension die eigentlichen TABS-Werte. Siehe Bericht: dadurch ist das committete
    kochplaner_vorlage.xlsx fuer diese zwei Tabs aktuell beschaedigt. Dieses Skript umgeht den
    Fehler, statt ihn zu reproduzieren, aendert aber make_vorlage.py/die Vorlage-Datei nicht."""
    text = (ROOT / 'backend' / 'Code.gs').read_text(encoding='utf-8')
    block = text[text.index('TABS: {'):text.index('ERGAENZBAR:')]
    return {m.group(1): re.findall(r"'([^']+)'", m.group(2)) for m in re.finditer(r'(\w+): \[(.*?)\]', block, re.S)}


def lies_zubereitung(wb):
    """Zubereitung-Tab -> {(Rubrik, id_als_text): Zubereitungstext}."""
    ws = wb['Zubereitung']
    rows = list(ws.iter_rows(values_only=True))
    kopf = [str(c).strip() if c is not None else '' for c in rows[0]]
    for erwartet in ('ID', 'Rezept', 'Rubrik', 'Zubereitung'):
        if erwartet not in kopf:
            raise SystemExit(f'Zubereitung: Spalte {erwartet!r} fehlt, Kopfzeile {kopf}')
    i_id, i_rubrik, i_text = kopf.index('ID'), kopf.index('Rubrik'), kopf.index('Zubereitung')
    out = {}
    for r in rows[1:]:
        if r[i_id] is None:
            continue
        schluessel = (r[i_rubrik], str(r[i_id]).strip())
        out[schluessel] = '' if r[i_text] is None else str(r[i_text]).strip()
    return out


def lies_lebensmittel(wb):
    """Kalorien je 100 g-Tab -> Liste (name, kcal_je_100g) in Quellreihenfolge."""
    ws = wb['Kalorien je 100 g']
    rows = list(ws.iter_rows(values_only=True))
    kopf = [str(c).strip() if c is not None else '' for c in rows[0]]
    i_name, i_kcal = kopf.index('Zutat'), kopf.index('kcal je 100 g')
    out = []
    for r in rows[1:]:
        if r[i_name] is None:
            continue
        out.append((str(r[i_name]).strip(), r[i_kcal]))
    return out


def lies_zutaten_tab(wb, tabname):
    """Eine strukturierte Zutaten-Tab -> {id_als_text: [(zutat, menge), ...]} in Quellreihenfolge."""
    ws = wb[tabname]
    rows = list(ws.iter_rows(values_only=True))
    kopf = [str(c).strip() if c is not None else '' for c in rows[0]]
    for erwartet in ('ID', 'Zutat', 'Menge (g/ml)'):
        if erwartet not in kopf:
            raise SystemExit(f'{tabname}: Spalte {erwartet!r} fehlt, Kopfzeile {kopf}')
    i_id, i_zutat, i_menge = kopf.index('ID'), kopf.index('Zutat'), kopf.index('Menge (g/ml)')
    out = {}
    for r in rows[1:]:
        if r[i_id] is None:
            continue
        gid = str(r[i_id]).strip()
        out.setdefault(gid, []).append((str(r[i_zutat]).strip(), r[i_menge]))
    return out


def lies_gerichte_tab(wb, tabname, name_spalte):
    """Eine der fuenf Gerichte-Tabs -> Liste von (id_als_text, name, kcal_pro_portion)."""
    ws = wb[tabname]
    rows = list(ws.iter_rows(values_only=True))
    kopf = [str(c).strip() if c is not None else '' for c in rows[0]]
    for erwartet in ('ID', name_spalte, 'kcal pro Portion'):
        if erwartet not in kopf:
            raise SystemExit(f'{tabname}: Spalte {erwartet!r} fehlt, Kopfzeile {kopf}')
    i_id, i_name, i_kcal = kopf.index('ID'), kopf.index(name_spalte), kopf.index('kcal pro Portion')
    out = []
    for r in rows[1:]:
        if r[i_id] is None and r[i_name] is None:
            continue
        out.append((str(r[i_id]).strip(), str(r[i_name]).strip(), r[i_kcal]))
    return out


def klassifiziere_zusatz_tags(zutaten):
    namen = {name.casefold() for name, _menge in zutaten}
    tags = []
    if namen & FISCH_ZUTATEN:
        tags.append('Fisch')
    if not (namen & NICHT_VEGETARISCH):
        tags.append('vegetarisch')
    return tags


def baue_zubereitung_aus_zutaten(zutaten):
    """Fallback, falls ein Gericht keinen Zubereitung-Eintrag in der Quelle hat (laut Auftrag
    bewusste Ausnahme von der 'nichts raten'-Regel: Zubereitungstext darf plausibel erfunden sein,
    Zahlen/Fakten nicht). Einfache, generische Schrittfolge aus der Zutatenliste."""
    liste = ', '.join(f"{menge:g} g {name}" for name, menge in zutaten)
    return (
        f'1) Zutaten bereitstellen: {liste}.\n'
        f'2) Zutaten vorbereiten (waschen, schneiden, nach Bedarf anbraten oder kochen) und '
        f'miteinander kombinieren.\n'
        f'3) Gar ziehen lassen, abschmecken und servieren.'
    )


def lies_vorhandene_namen(pfad):
    """Textdatei '<id>\\t<name>' je Zeile -> Liste (id_oder_None, name)."""
    if pfad is None:
        return None
    out = []
    for zeile in Path(pfad).read_text(encoding='utf-8').splitlines():
        zeile = zeile.strip()
        if not zeile:
            continue
        teile = zeile.split('\t')
        if len(teile) >= 2:
            out.append((teile[0].strip(), teile[1].strip()))
        else:
            out.append((None, teile[0].strip()))
    return out


def naechste_id(n):
    """Wie D58 (Code.gs): ab 1000 vierstellig statt auf G000 zu wechseln."""
    return f'G{n:03d}' if n < 1000 else f'G{n}'


def baue_migration(wb_quelle, start, heute_iso):
    zubereitung = lies_zubereitung(wb_quelle)
    lebensmittel = lies_lebensmittel(wb_quelle)

    gerichte = []
    zutaten_rows = []
    zaehler = {
        'je_kategorie': {}, 'schritte_aus_quelle': 0, 'schritte_selbst_geschrieben': 0,
        'zutaten_zeilen': 0, 'fisch_tags': 0, 'vegetarisch_tags': 0,
    }
    n = start
    for tabname, name_spalte, typ, basis_tags in GERICHTE_TABS:
        quelle_gerichte = lies_gerichte_tab(wb_quelle, tabname, name_spalte)
        quelle_zutaten = lies_zutaten_tab(wb_quelle, ZUTATEN_TAB_FUER[tabname])
        zaehler['je_kategorie'][tabname] = len(quelle_gerichte)
        for src_id, name, kcal in quelle_gerichte:
            neue_id = naechste_id(n)
            n += 1
            zutaten = quelle_zutaten.get(src_id, [])

            schluessel = (tabname, src_id)
            roh_schritte = zubereitung.get(schluessel)
            if roh_schritte:
                schritte = roh_schritte
                zaehler['schritte_aus_quelle'] += 1
            else:
                schritte = baue_zubereitung_aus_zutaten(zutaten)
                zaehler['schritte_selbst_geschrieben'] += 1

            zusatz_tags = klassifiziere_zusatz_tags(zutaten)
            if 'Fisch' in zusatz_tags:
                zaehler['fisch_tags'] += 1
            if 'vegetarisch' in zusatz_tags:
                zaehler['vegetarisch_tags'] += 1
            tags = ', '.join(basis_tags + zusatz_tags)

            gerichte.append({
                'id': neue_id, 'name': name, 'basis_portionen': 1,
                'kcal_pro_portion': '' if kcal is None else kcal,
                'tags': tags, 'favorit': 'nein', 'nie_wieder': 'nein', 'aktiv': 'ja',
                'reicht_fuer_tage': 1, 'schritte': schritte,
                'quelle': f'{QUELLE_NAME} ({tabname})', 'angelegt_am': heute_iso,
                'status': 'fertig' if zutaten else 'idee', 'typ': typ,
                '_quell_tab': tabname, '_quell_id': src_id,
            })
            for pos, (zname, menge) in enumerate(zutaten, 1):
                zutaten_rows.append({
                    'gericht_id': neue_id, 'pos': pos, 'name': zname, 'menge': menge,
                    'einheit': 'g', 'einkaufen': 'nein' if zname.casefold() in IMMER_DA else 'ja',
                })
                zaehler['zutaten_zeilen'] += 1

    lebensmittel_rows = [{'name': n2, 'kcal_je_100g': k2} for n2, k2 in lebensmittel]
    return gerichte, zutaten_rows, lebensmittel_rows, zaehler


def finde_duplikate(gerichte, vorhandene):
    if not vorhandene:
        return None
    index = {}
    for vid, vname in vorhandene:
        index.setdefault(vname.casefold(), []).append(vid)
    treffer = []
    for g in gerichte:
        vids = index.get(g['name'].casefold())
        if vids:
            treffer.append({'neue_id': g['id'], 'name': g['name'], 'vorhandene_ids': vids})
    return treffer


def schreibe_ausgabe(gerichte, zutaten_rows, lebensmittel_rows, ziel, heute):
    tabs_kopf = tabs_aus_code_gs()
    erwartete_tabs = ['Gerichte', 'Zutaten', 'Plan', 'Bewertungen', 'Einstellungen',
                      'Lebensmittel', 'Richtgewichte', 'Ausgaben']
    assert list(tabs_kopf) == erwartete_tabs, tabs_kopf

    wb = openpyxl.Workbook()
    wb.remove(wb.active)
    for name, cols in tabs_kopf.items():
        ws = wb.create_sheet(name)
        ws.append(cols)
        ws.freeze_panes = 'A2'
        for c in ws[1]:
            c.font = Font(bold=True)
        for i, c in enumerate(cols, 1):
            ws.column_dimensions[openpyxl.utils.get_column_letter(i)].width = max(12, len(c) + 4)
    wb['Einstellungen'].append(['standard_portionen', 2])
    wb['Einstellungen'].append(['wiederholungssperre_tage', 21])
    wb['Gerichte'].column_dimensions['B'].width = 34

    ws_g = wb['Gerichte']
    kopf_g = tabs_kopf['Gerichte']
    i_angelegt = kopf_g.index('angelegt_am')
    for g in gerichte:
        row = []
        for k in kopf_g:
            if k == 'angelegt_am':
                row.append(datetime.datetime.combine(heute, datetime.time()))
            else:
                v = g[k]
                row.append(None if v == '' else cell_out(v, k))
        ws_g.append(row)
        ws_g.cell(ws_g.max_row, i_angelegt + 1).number_format = 'yyyy-mm-dd'

    ws_z = wb['Zutaten']
    kopf_z = tabs_kopf['Zutaten']
    for z in zutaten_rows:
        ws_z.append([cell_out(z[k], k) for k in kopf_z])

    ws_l = wb['Lebensmittel']
    kopf_l = tabs_kopf['Lebensmittel']
    for l in lebensmittel_rows:
        ws_l.append([cell_out(l[k], k) for k in kopf_l])

    wb.save(ziel)
    return wb, kopf_g


def main():
    args = sys.argv[1:]
    opts = {'--start': '100', '--vorhandene-namen': None, '--datum': None}
    positional = []
    i = 0
    while i < len(args):
        a = args[i]
        if a in opts:
            if i + 1 >= len(args):
                raise SystemExit(__doc__)
            opts[a] = args[i + 1]
            i += 2
        else:
            positional.append(a)
            i += 1
    if len(positional) != 2:
        raise SystemExit(__doc__)
    quelle, ziel = positional[0], Path(positional[1])
    start = int(opts['--start'])
    heute = (datetime.date.fromisoformat(opts['--datum']) if opts['--datum']
             else datetime.date.today())
    vorhandene = lies_vorhandene_namen(opts['--vorhandene-namen'])

    erwartete_quelltabs = {
        'Hauptgerichte', 'Beilagen', 'Nicht-Diät Hauptgerichte', 'Nicht-Diät Beilagen',
        'Süßes & Backen', 'Zubereitung', 'Zutaten Hauptgerichte', 'Zutaten Beilagen',
        'Nicht-Diät Zutaten Haupt', 'Nicht-Diät Zutaten Beilagen', 'Zutaten Süßes',
        'Kalorien je 100 g',
    }
    wb_quelle = openpyxl.load_workbook(quelle, data_only=True, read_only=True)
    fehlend = erwartete_quelltabs - set(wb_quelle.sheetnames)
    if fehlend:
        raise SystemExit(f'Quelle: Tabs fehlen: {sorted(fehlend)}')

    gerichte, zutaten_rows, lebensmittel_rows, zaehler = baue_migration(wb_quelle, start, heute.isoformat())
    duplikate = finde_duplikate(gerichte, vorhandene)

    wb, kopf_g = schreibe_ausgabe(gerichte, zutaten_rows, lebensmittel_rows, ziel, heute)

    tabs_dump = {n: [[c.value for c in r] for r in wb[n].iter_rows()] for n in wb.sheetnames}
    i_angelegt = kopf_g.index('angelegt_am')
    for z in tabs_dump['Gerichte'][1:]:
        if isinstance(z[i_angelegt], datetime.datetime):
            z[i_angelegt] = z[i_angelegt].date().isoformat()

    for g in gerichte:
        g.pop('_quell_tab', None)
        g.pop('_quell_id', None)

    zusammenfassung = {
        'gesamt_gerichte': len(gerichte),
        'je_kategorie': zaehler['je_kategorie'],
        'zutaten_zeilen': zaehler['zutaten_zeilen'],
        'lebensmittel_zeilen': len(lebensmittel_rows),
        'schritte_aus_quelle': zaehler['schritte_aus_quelle'],
        'schritte_selbst_geschrieben': zaehler['schritte_selbst_geschrieben'],
        'fisch_tags_vergeben': zaehler['fisch_tags'],
        'vegetarisch_tags_vergeben': zaehler['vegetarisch_tags'],
        'erste_neue_id': gerichte[0]['id'] if gerichte else None,
        'letzte_neue_id': gerichte[-1]['id'] if gerichte else None,
        'dupletten_check_durchgefuehrt': vorhandene is not None,
        'dupletten_anzahl': len(duplikate) if duplikate is not None else None,
    }

    Path(str(ziel) + '.zeilen.json').write_text(
        json.dumps({
            'tabs': tabs_dump, 'gerichte': gerichte, 'zutaten': zutaten_rows,
            'lebensmittel': lebensmittel_rows, 'duplikate_namen_vs_echtes_sheet': duplikate,
            'zusammenfassung': zusammenfassung,
        }, ensure_ascii=False, indent=1),
        encoding='utf-8')

    print(f'{len(gerichte)} Gerichte migriert -> {ziel}')
    print(json.dumps(zusammenfassung, ensure_ascii=False, indent=1))


if __name__ == '__main__':
    main()
