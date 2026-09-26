"""Original geometric fixture for mixed Latin/Arabic shaping (uv run --with fonttools this-file)."""
from pathlib import Path
from fontTools.fontBuilder import FontBuilder
from fontTools.pens.ttGlyphPen import TTGlyphPen
from fontTools.feaLib.builder import addOpenTypeFeaturesFromString

builder = FontBuilder(1000, isTTF=True)
names = ['.notdef', 'space', 'A', 'f', 'i', 'fi', 'beh', 'beh.init', 'beh.medi', 'beh.fina', 'acutecomb', 'kasra']
builder.setupGlyphOrder(names)
builder.setupCharacterMap({32: 'space', 65: 'A', 102: 'f', 105: 'i', 0x628: 'beh', 0x301: 'acutecomb', 0x650: 'kasra'})
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
builder.setupNameTable({'familyName': 'ArabicSample', 'styleName': 'Regular',
                       'uniqueFontIdentifier': 'ArabicSample', 'fullName': 'ArabicSample',
                       'psName': 'ArabicSample', 'version': 'Version 1.0'})
builder.setupOS2(sTypoAscender=800, sTypoDescender=-200, usWinAscent=800, usWinDescent=200)
builder.setupPost()
builder.setupMaxp()
builder.font['head'].created = builder.font['head'].modified = 2082844800
addOpenTypeFeaturesFromString(builder.font, '''
languagesystem DFLT dflt;
languagesystem latn dflt;
languagesystem arab dflt;
@BASE = [A f i beh beh.init beh.medi beh.fina];
@MARK = [acutecomb kasra];
table GDEF { GlyphClassDef @BASE, [fi], @MARK, ; } GDEF;
feature liga { script latn; sub f i by fi; } liga;
feature init { script arab; sub beh by beh.init; } init;
feature medi { script arab; sub beh by beh.medi; } medi;
feature fina { script arab; sub beh by beh.fina; } fina;
''')
builder.save(Path(__file__).resolve().parent.parent / 'tests/fixtures/ArabicSample.ttf')
