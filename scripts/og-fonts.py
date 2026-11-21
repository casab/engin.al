"""Static Archivo cuts for the share cards (scripts/og.mjs).

satori can't read variable fonts, so this pins the site's variable Archivo at the three styles the cards use
and writes WOFF files into scripts/og-fonts/ (committed). Rerun only when the cards need another style:

    python -m venv .venv && .venv/Scripts/pip install fonttools brotli   (or bin/pip)
    .venv/Scripts/python scripts/og-fonts.py
"""
from pathlib import Path
from fontTools.ttLib import TTFont
from fontTools.varLib.instancer import instantiateVariableFont

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "node_modules/@fontsource-variable/archivo/files"
OUT = ROOT / "scripts/og-fonts"
CUTS = {"narrow-850": {"wdth": 62, "wght": 850}, "wide-650": {"wdth": 125, "wght": 650}, "text-500": {"wdth": 100, "wght": 500}}

OUT.mkdir(exist_ok=True)
for subset in ("latin", "latin-ext"):
    for name, axes in CUTS.items():
        font = instantiateVariableFont(TTFont(SRC / f"archivo-{subset}-wdth-normal.woff2"), axes)
        font.flavor = "woff"
        dest = OUT / f"archivo-{name}-{subset}.woff"
        font.save(dest)
        print(dest.name, dest.stat().st_size)
