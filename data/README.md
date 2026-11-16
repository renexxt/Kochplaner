# Testdaten und Orakel

Neu erzeugen (deterministisch):

    python3 data/make_testdata.py          # xlsx-Dateien, profiles.json, scenarios.json
    python3 oracle/oracle.py golden        # data/golden/*.json (Rohdaten, normalisiert, Einkauf, Bewertung, Daten)
    python3 oracle/selftest.py             # 21 Prüfungen: Testdaten gegen Zieldokument, Orakel gegen Handrechnung

`data/golden/` ist die Referenz für die App-Tests. Das Orakel liest nur die xlsx-Dateien, nie App-Code.
