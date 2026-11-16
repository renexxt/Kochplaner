"""Erzeugt die App-Symbole (eigene einfache Grafik: Kochtopf mit Dampf auf gruenem Grund). Aufruf: python3 tools/make_icons.py"""
from pathlib import Path
from PIL import Image, ImageDraw

OUT = Path(__file__).resolve().parent.parent / "app" / "icons"
GREEN, GREEN_DARK, CREAM = (47, 107, 79), (34, 81, 60), (251, 245, 232)


def draw(size, scale=0.62, rounded=False):
    s = size * 4
    img = Image.new("RGBA", (s, s), GREEN + (255,))
    d = ImageDraw.Draw(img)
    # leichter Verlauf nach unten
    for y in range(s):
        t = y / s
        c = tuple(int(GREEN[i] * (1 - 0.25 * t) + GREEN_DARK[i] * 0.25 * t) for i in range(3))
        d.line([(0, y), (s, y)], fill=c + (255,))
    cx, cy = s / 2, s / 2 + s * 0.05
    w = s * scale          # Breite des Topfes
    hgt = w * 0.58
    left, right = cx - w / 2, cx + w / 2
    top, bottom = cy - hgt / 2, cy + hgt / 2
    r = w * 0.12
    d.rounded_rectangle([left, top, right, bottom], radius=r, fill=CREAM)            # Korpus
    d.rounded_rectangle([left - w * 0.05, top - hgt * 0.14, right + w * 0.05, top + hgt * 0.07], radius=r * 0.6, fill=CREAM)  # Deckel
    d.rounded_rectangle([cx - w * 0.07, top - hgt * 0.28, cx + w * 0.07, top - hgt * 0.1], radius=r * 0.5, fill=CREAM)        # Knauf
    hw = w * 0.1
    d.rounded_rectangle([left - hw * 1.5, top + hgt * 0.2, left + 2, top + hgt * 0.38], radius=hw * 0.4, fill=CREAM)          # Griffe
    d.rounded_rectangle([right - 2, top + hgt * 0.2, right + hw * 1.5, top + hgt * 0.38], radius=hw * 0.4, fill=CREAM)
    for dx in (-0.2, 0.0, 0.2):                                                                                                # Dampf
        x = cx + w * dx
        y0 = top - hgt * 0.45
        d.line([(x, y0), (x + w * 0.04, y0 - hgt * 0.22), (x - w * 0.04, y0 - hgt * 0.44)], fill=CREAM + (200,), width=int(w * 0.035), joint="curve")
    # Streifen auf dem Topf
    d.rounded_rectangle([left + w * 0.08, cy - hgt * 0.05, right - w * 0.08, cy + hgt * 0.05], radius=w * 0.02, fill=GREEN + (255,))
    img = img.resize((size, size), Image.LANCZOS)
    if rounded:
        mask = Image.new("L", (size, size), 0)
        ImageDraw.Draw(mask).rounded_rectangle([0, 0, size - 1, size - 1], radius=int(size * 0.22), fill=255)
        out = Image.new("RGBA", (size, size), (0, 0, 0, 0))
        out.paste(img, (0, 0), mask)
        return out
    return img.convert("RGB")


OUT.mkdir(parents=True, exist_ok=True)
draw(180, 0.62).save(OUT / "apple-touch-icon.png")           # iOS rundet selbst ab, deshalb vollflaechig
draw(192, 0.62, rounded=True).save(OUT / "icon-192.png")
draw(512, 0.62, rounded=True).save(OUT / "icon-512.png")
draw(512, 0.46).save(OUT / "icon-maskable-512.png")          # Inhalt in der inneren Sicherheitszone
print("Symbole geschrieben:", ", ".join(sorted(p.name for p in OUT.glob("*.png"))))
