"""Generate original outlines with cmap aliases, UVS and unencoded GSUB glyphs.
Run: uv run --with fonttools tools/build-glyph-fixture.py
"""
from pathlib import Path
from fontTools.fontBuilder import FontBuilder
from fontTools.pens.ttGlyphPen import TTGlyphPen
from fontTools.feaLib.builder import addOpenTypeFeaturesFromString
from fontTools.ttLib.tables._c_m_a_p import CmapSubtable

builder = FontBuilder(1000, isTTF=True)
names = ['.notdef', 'space', 'A', 'f', 'i', 'A.vs', 'f_i', 'A.alt', 'unused', 'f.vs']
builder.setupGlyphOrder(names)
builder.setupCharacterMap({0x20: 'space', 0x41: 'A', 0x391: 'A', 0x66: 'f', 0x69: 'i'})
glyphs = {}
for i, name in enumerate(names):
    pen = TTGlyphPen(None)
    if name != 'space':
        pen.moveTo((50, 0))
        pen.lineTo((450 + i * 20, 0))
        pen.lineTo((100 + i * 30, 700 - i * 20))
        pen.closePath()
    glyphs[name] = pen.glyph()
builder.setupGlyf(glyphs)
builder.setupHorizontalMetrics({name: (600 + i * 20, 50) for i, name in enumerate(names)})
builder.setupHorizontalHeader(ascent=800, descent=-200)
builder.setupNameTable({'familyName': 'GlyphVariants', 'styleName': 'Regular',
                       'uniqueFontIdentifier': 'GlyphVariants', 'fullName': 'GlyphVariants',
                       'psName': 'GlyphVariants', 'version': 'Version 1.0'})
builder.setupOS2(sTypoAscender=800, sTypoDescender=-200, usWinAscent=800, usWinDescent=200)
builder.setupPost()
builder.setupMaxp()
builder.font['head'].created = builder.font['head'].modified = 2082844800
uvs = CmapSubtable.newSubtable(14)
uvs.platformID, uvs.platEncID, uvs.language = 0, 5, 0
uvs.cmap = {}
# Include default and non-default mappings for the same selector, plus an IVS.
uvs.uvsDict = {0xFE00: [(0x41, None), (0x66, 'f.vs')], 0xE0100: [(0x41, 'A.vs')]}
builder.font['cmap'].tables.append(uvs)
addOpenTypeFeaturesFromString(builder.font, '''
languagesystem DFLT dflt;
feature liga { sub f i by f_i; } liga;
feature salt { sub A from [A.alt]; } salt;
''')
builder.save(Path(__file__).resolve().parent.parent / 'tests/fixtures/GlyphVariants.ttf')


# A second fixture keeps the original GIDs and adds real standardized sequences.
# 4E38 FE01 is deliberately unregistered, sharing the glyph with 4E38 FE00.
builder.setupCharacterMap({0x20: 'space', 0x41: 'A', 0x391: 'A', 0x66: 'f', 0x69: 'i',
                           0x30: 'f', 0x4E38: 'A', 0x1D49C: 'i'})
uvs.uvsDict[0xFE00] += [(0x30, 'f.vs'), (0x4E38, 'A.vs'), (0x1D49C, None)]
uvs.uvsDict[0xFE01] = [(0x4E38, 'A.vs'), (0x1D49C, 'A.alt')]
builder.font['cmap'].tables.append(uvs)
builder.save(Path(__file__).resolve().parent.parent / 'tests/fixtures/StandardizedVariants.ttf')
