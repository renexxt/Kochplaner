#!/usr/bin/env python3
"""Migriert Rezeptideen.xlsx (Tab 'Rezepte': Kategorie, Name des Rezepts, Rezept) in das Sheet-Format des Kochplaners.

Aufruf: python3 tools/migrate_rezeptideen.py <Rezeptideen.xlsx> <ausgabe.xlsx>
Abbildung: Kategorie -> tags, Name -> name, Rezept (Text) -> schritte, quelle = Dateiname, status = idee (keine Zutaten in der Quelle).
Gibt zusaetzlich <ausgabe>.zeilen.json aus (Zeilen der fuenf Tabs), mit denen das Google Sheet befuellt wird.
"""
import datetime
import json
import sys
from pathlib import Path

import openpyxl

ROOT = Path(__file__).resolve().parent.parent
QUELLE_NAME = 'Rezeptideen.xlsx'


def lies_quelle(pfad):
    wb = openpyxl.load_workbook(pfad)
    ws = wb['Rezepte']
    kopf = [str(c.value).strip() if c.value is not None else '' for c in ws[1]]
    erwartet = ['Kategorie', 'Name des Rezepts', 'Rezept']
    if kopf[:3] != erwartet:
        raise SystemExit(f'Unerwartete Kopfzeile {kopf[:3]}, erwartet {erwartet}')
    zeilen = []
    for r in ws.iter_rows(min_row=2):
        werte = [c.value for c in r[:3]]
        if all(v in (None, '') for v in werte):
            continue
        kat, name, rezept = [('' if v is None else str(v).strip()) for v in werte]
        if not name:
            raise SystemExit(f'Zeile {r[0].row}: Name fehlt, Kategorie={kat!r}')
        zeilen.append({'quelle_zeile': r[0].row, 'kategorie': kat, 'name': name, 'rezept': rezept})
    return zeilen


def baue_gerichte(quell, heute):
    namen = {}
    gerichte = []
    for i, q in enumerate(quell, 1):
        schluessel = q['name'].casefold()
        if schluessel in namen:
            raise SystemExit(f'Doppelter Name: {q["name"]!r} (Zeilen {namen[schluessel]} und {q["quelle_zeile"]})')
        namen[schluessel] = q['quelle_zeile']
        gerichte.append({
            'id': f'G{i:03d}', 'name': q['name'], 'basis_portionen': 2, 'kcal_pro_portion': '',
            'tags': q['kategorie'], 'favorit': 'nein', 'nie_wieder': 'nein', 'aktiv': 'ja', 'reicht_fuer_tage': 1,
            'schritte': q['rezept'], 'quelle': QUELLE_NAME, 'angelegt_am': heute.isoformat(), 'status': 'idee',
        })
    return gerichte


def main():
    if len(sys.argv) != 3:
        raise SystemExit(__doc__)
    quelle, ziel = sys.argv[1], Path(sys.argv[2])
    heute = datetime.date.today()
    quell = lies_quelle(quelle)
    gerichte = baue_gerichte(quell, heute)

    # Basis ist die Vorlage (gleiche Tabs, Kopfzeilen, fixierte Kopfzeile wie bei der Einrichtung)
    wb = openpyxl.load_workbook(ROOT / 'kochplaner_vorlage.xlsx')
    ws = wb['Gerichte']
    kopf = [c.value for c in ws[1]]
    for g in gerichte:
        row = []
        for k in kopf:
            v = g[k]
            if k == 'angelegt_am':
                v = datetime.datetime.combine(heute, datetime.time())
            elif v == '':
                v = None
            row.append(v)
        ws.append(row)
        ws.cell(ws.max_row, kopf.index('angelegt_am') + 1).number_format = 'yyyy-mm-dd'
    wb.save(ziel)

    tabs = {n: [[c.value for c in r] for r in wb[n].iter_rows()] for n in wb.sheetnames}
    # Datum fuer JSON als Text
    for z in tabs['Gerichte'][1:]:
        if isinstance(z[kopf.index('angelegt_am')], datetime.datetime):
            z[kopf.index('angelegt_am')] = z[kopf.index('angelegt_am')].date().isoformat()
    Path(str(ziel) + '.zeilen.json').write_text(json.dumps({'tabs': tabs, 'quelle': quell, 'gerichte': gerichte}, ensure_ascii=False, indent=1), encoding='utf-8')
    print(f'{len(gerichte)} Gerichte migriert -> {ziel}')


if __name__ == '__main__':
    main()
