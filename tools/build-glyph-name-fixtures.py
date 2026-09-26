"""Original fixture derivatives for absent glyph names and named sequences."""
from pathlib import Path
from fontTools.ttLib import TTFont
root = Path(__file__).resolve().parents[1] / 'tests/fixtures'
font = TTFont(root / 'GlyphVariants.ttf', recalcTimestamp=False)
for table in font['cmap'].tables:
    if table.isUnicode() and table.format != 14:
        table.cmap[0x100] = 'f'
        table.cmap[0x300] = 'i'
font.save(root / 'NamedGlyphSequence.ttf')
font['post'].formatType = 3.0
font.save(root / 'UnnamedGlyphSequence.ttf')
