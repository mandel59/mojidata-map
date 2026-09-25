"""Original geometric fixture for GSUB type 8 (uv run --with fonttools this-file)."""
from pathlib import Path
from fontTools.fontBuilder import FontBuilder
from fontTools.pens.ttGlyphPen import TTGlyphPen
from fontTools.feaLib.builder import addOpenTypeFeaturesFromString

builder = FontBuilder(1000, isTTF=True)
names = ['.notdef', 'space', 'A', 'B', 'C', 'A.alt', 'acutecomb']
builder.setupGlyphOrder(names)
builder.setupCharacterMap({32: 'space', 65: 'A', 66: 'B', 67: 'C', 0x301: 'acutecomb'})
glyphs = {}
for i, name in enumerate(names):
    pen = TTGlyphPen(None)
    if name != 'space':
        pen.moveTo((50, 0))
        pen.lineTo((400 + i * 20, 0))
        pen.lineTo((100, 600))
        pen.closePath()
    glyphs[name] = pen.glyph()
builder.setupGlyf(glyphs)
builder.setupHorizontalMetrics({name: (600 if name != 'acutecomb' else 0, 50) for name in names})
builder.setupHorizontalHeader(ascent=800, descent=-200)
builder.setupNameTable({'familyName': 'ReverseChaining', 'styleName': 'Regular',
                       'uniqueFontIdentifier': 'ReverseChaining', 'fullName': 'ReverseChaining',
                       'psName': 'ReverseChaining', 'version': 'Version 1.0'})
builder.setupOS2(sTypoAscender=800, sTypoDescender=-200, usWinAscent=800, usWinDescent=200)
builder.setupPost()
builder.setupMaxp()
builder.font['head'].created = builder.font['head'].modified = 2082844800
addOpenTypeFeaturesFromString(builder.font, '''
languagesystem DFLT dflt;
@BASE = [A B C A.alt];
@MARK = [acutecomb];
table GDEF { GlyphClassDef @BASE, , @MARK, ; } GDEF;
feature calt { rsub A' [A.alt B] by A.alt; } calt;
feature ss01 { rsub A B A' C by A.alt; } ss01;
lookup EXT useExtension { rsub A' [A.alt B] by A.alt; } EXT;
feature ss02 { lookup EXT; } ss02;
feature ss03 { lookupflag IgnoreMarks; rsub A' [A.alt B] by A.alt; } ss03;
''')
builder.save(Path(__file__).resolve().parent.parent / 'tests/fixtures/ReverseChaining.ttf')
