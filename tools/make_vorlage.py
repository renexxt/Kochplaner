#!/usr/bin/env python3
"""Erzeugt kochplaner_vorlage.xlsx: leere Tabs mit Kopfzeilen (wie Code.gs setup()), nur Standardwerte in Einstellungen.
Die Kopfzeilen werden direkt aus backend/Code.gs gelesen, damit Vorlage und Schnittstelle nie auseinanderlaufen.
Aufruf: python3 tools/make_vorlage.py [Zieldatei]
"""
import re
import sys
from pathlib import Path

import openpyxl
from openpyxl.styles import Font

ROOT = Path(__file__).resolve().parents[1]


def tabs_aus_code_gs():
    text = (ROOT / "backend" / "Code.gs").read_text(encoding="utf-8")
    start = text.index("TABS: {") + len("TABS: ")
    depth, ende = 0, start
    for i, ch in enumerate(text[start:], start):
        if ch == "{":
            depth += 1
        elif ch == "}":
            depth -= 1
            if depth == 0:
                ende = i + 1
                break
    block = text[start:ende]
    return {m.group(1): re.findall(r"'([^']+)'", m.group(2)) for m in re.finditer(r"(\w+): \[(.*?)\]", block, re.S)}


def main():
    ziel = Path(sys.argv[1]) if len(sys.argv) > 1 else ROOT / "kochplaner_vorlage.xlsx"
    tabs = tabs_aus_code_gs()
    assert list(tabs) == ["Gerichte", "Zutaten", "Plan", "Bewertungen", "Einstellungen", "Lebensmittel", "Richtgewichte", "Ausgaben"], tabs
    wb = openpyxl.Workbook()
    wb.remove(wb.active)
    for name, cols in tabs.items():
        ws = wb.create_sheet(name)
        ws.append(cols)
        ws.freeze_panes = "A2"
        for c in ws[1]:
            c.font = Font(bold=True)
        for i, c in enumerate(cols, 1):
            ws.column_dimensions[openpyxl.utils.get_column_letter(i)].width = max(12, len(c) + 4)
    wb["Einstellungen"].append(["standard_portionen", 2])
    wb["Einstellungen"].append(["wiederholungssperre_tage", 21])
    wb["Gerichte"].column_dimensions["B"].width = 34
    wb.save(ziel)
    print("geschrieben:", ziel, {k: len(v) for k, v in tabs.items()})


if __name__ == "__main__":
    main()
