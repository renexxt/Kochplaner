#!/usr/bin/env python3
"""Entwurf der Zutaten (fuer 2 Portionen) zu den 21 migrierten Gerichten. Von Claude geschaetzt, von Rene gegenzulesen.
Vorratsartikel (Salz, Pfeffer, Wasser, Oel) sind weggelassen. G008 'Grillen' bleibt eine Idee (keine feste Zutatenliste).
Aufruf: python3 tools/zutaten_entwurf.py <migriert.xlsx> <ausgabe.xlsx>   (schreibt Zutaten in eine Kopie der migrierten Datei)
"""
import json
import sys
from pathlib import Path

import openpyxl

Z = {
 'G001': [('Spaghetti', 250, 'g'), ('Hackfleisch gemischt', 300, 'g'), ('Zwiebel', 1, 'Stück'), ('Knoblauchzehe', 2, 'Stück'), ('Karotte', 1, 'Stück'), ('Passierte Tomaten', 400, 'g'), ('Tomatenmark', 1, 'EL'), ('Parmesan', 30, 'g')],
 'G002': [('Schweineschnitzel', 2, 'Stück'), ('Mehl', 30, 'g'), ('Eier', 1, 'Stück'), ('Paniermehl', 60, 'g'), ('Pommes frites TK', 400, 'g'), ('Zitrone', 1, 'Stück')],
 'G003': [('Spätzle frisch', 400, 'g'), ('Bergkäse gerieben', 150, 'g'), ('Zwiebel', 2, 'Stück'), ('Butter', 20, 'g'), ('Schnittlauch', 1, 'Bund')],
 'G004': [('Nudeln', 250, 'g'), ('Kochschinken', 150, 'g'), ('Sahne', 200, 'ml'), ('Zwiebel', 1, 'Stück'), ('Knoblauchzehe', 1, 'Stück'), ('Parmesan', 30, 'g')],
 'G005': [('Chicken Wings', 800, 'g'), ('Paprikapulver', 1, 'EL'), ('Honig', 1, 'EL'), ('Sojasauce', 2, 'EL'), ('Knoblauchzehe', 2, 'Stück'), ('Eisbergsalat', 1, 'Stück'), ('Tomaten', 2, 'Stück'), ('Gurke', 0.5, 'Stück'), ('Balsamico', 2, 'EL')],
 'G006': [('Mehl', 300, 'g'), ('Trockenhefe', 1, 'Stück'), ('Passierte Tomaten', 200, 'g'), ('Mozzarella', 250, 'g'), ('Salami', 100, 'g'), ('Champignons', 150, 'g')],
 'G007': [('Gurke', 1, 'Stück'), ('Sojasauce', 2, 'EL'), ('Reisessig', 2, 'EL'), ('Sesamöl', 1, 'TL'), ('Knoblauchzehe', 1, 'Stück'), ('Sesam', 1, 'EL')],
 'G009': [('Hähnchenbrust', 400, 'g'), ('Nudeln', 250, 'g'), ('Passierte Tomaten', 400, 'g'), ('Sahne', 200, 'ml'), ('Zwiebel', 1, 'Stück'), ('Knoblauchzehe', 2, 'Stück'), ('Paprikapulver', 1, 'TL')],
 'G010': [('Maultaschen', 300, 'g'), ('Gemüsebrühe', 800, 'ml'), ('Karotte', 1, 'Stück'), ('Lauch', 1, 'Stück'), ('Zwiebel', 1, 'Stück'), ('Schnittlauch', 1, 'Bund')],
 'G011': [('Spaghetti', 250, 'g'), ('Speckwürfel', 150, 'g'), ('Eier', 3, 'Stück'), ('Parmesan', 60, 'g')],
 'G012': [('Hähnchenschenkel', 4, 'Stück'), ('Kartoffeln', 600, 'g'), ('Milch', 100, 'ml'), ('Butter', 40, 'g'), ('Paprikapulver', 1, 'TL'), ('Knoblauchzehe', 2, 'Stück')],
 'G013': [('Kartoffeln', 600, 'g'), ('Leberkäse', 300, 'g'), ('Zwiebel', 2, 'Stück'), ('Eier', 2, 'Stück')],
 'G014': [('Hähnchenschenkel', 4, 'Stück'), ('Zwiebel', 2, 'Stück'), ('Karotte', 2, 'Stück'), ('Kichererbsen', 1, 'Dose'), ('Getrocknete Aprikosen', 80, 'g'), ('Ras el Hanout', 2, 'TL'), ('Couscous', 150, 'g'), ('Knoblauchzehe', 2, 'Stück')],
 'G015': [('Hähnchenbrust', 300, 'g'), ('Paprika', 1, 'Stück'), ('Brokkoli', 200, 'g'), ('Karotte', 1, 'Stück'), ('Sojasauce', 3, 'EL'), ('Reis', 150, 'g'), ('Knoblauchzehe', 2, 'Stück'), ('Ingwer', 15, 'g')],
 'G016': [('Lachsfilet', 300, 'g'), ('Kartoffeln', 600, 'g'), ('Quark', 250, 'g'), ('Kräuter gemischt', 1, 'Bund'), ('Zitrone', 1, 'Stück'), ('Knoblauchzehe', 1, 'Stück')],
 'G017': [('Toastbrot', 4, 'Stück'), ('Avocado', 1, 'Stück'), ('Eier', 2, 'Stück'), ('Kochschinken', 80, 'g'), ('Tomaten', 1, 'Stück')],
 'G018': [('Tomaten', 4, 'Stück'), ('Hähnchenbrust', 200, 'g'), ('Reis', 100, 'g'), ('Zwiebel', 1, 'Stück'), ('Knoblauchzehe', 1, 'Stück'), ('Petersilie', 1, 'Bund')],
 'G019': [('Rindersteak', 2, 'Stück'), ('Eisbergsalat', 1, 'Stück'), ('Tomaten', 2, 'Stück'), ('Gurke', 0.5, 'Stück'), ('Balsamico', 2, 'EL')],
 'G020': [('Burgerbrötchen', 2, 'Stück'), ('Rinderhackfleisch', 300, 'g'), ('Cheddar', 2, 'Stück'), ('Eisbergsalat', 1, 'Stück'), ('Tomaten', 1, 'Stück'), ('Zwiebel', 1, 'Stück'), ('Gewürzgurke', 2, 'Stück'), ('Ketchup', 2, 'EL')],
 'G021': [('Hähnchenbrust', 300, 'g'), ('Süßkartoffel', 1, 'Stück'), ('Zucchini', 1, 'Stück'), ('Paprika', 1, 'Stück'), ('Karotte', 2, 'Stück'), ('Zwiebel', 1, 'Stück'), ('Knoblauchzehe', 2, 'Stück'), ('Thymian', 1, 'Bund')],
}
QUELLE_ENTWURF = 'Rezeptideen.xlsx (Zutaten: Entwurf)'


def zeilen():
    out = []
    for gid in sorted(Z):
        for pos, (name, menge, einheit) in enumerate(Z[gid], 1):
            out.append([gid, pos, name, menge, einheit, 'ja'])
    return out


if __name__ == '__main__':
    quelle, ziel = sys.argv[1], sys.argv[2]
    wb = openpyxl.load_workbook(quelle)
    g, z = wb['Gerichte'], wb['Zutaten']
    kopf = [c.value for c in g[1]]
    iq, istat, iid = kopf.index('quelle'), kopf.index('status'), kopf.index('id')
    for r in range(2, g.max_row + 1):
        if g.cell(r, iid + 1).value in Z:
            g.cell(r, iq + 1).value = QUELLE_ENTWURF
            g.cell(r, istat + 1).value = 'fertig'
    for row in zeilen():
        z.append(row)
    wb.save(ziel)
    print(len(Z), 'Gerichte,', len(zeilen()), 'Zutatenzeilen ->', ziel)
