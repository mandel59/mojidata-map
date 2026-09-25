"""Generate original, geometric test glyphs. Run: uv run --with fonttools tools/build-font-fixtures.py"""
from pathlib import Path
from fontTools.fontBuilder import FontBuilder
from fontTools.pens.ttGlyphPen import TTGlyphPen
from fontTools.feaLib.builder import addOpenTypeFeaturesFromString

root = Path(__file__).resolve().parent.parent / 'tests' / 'fixtures'
for name, codepoints, width in [
    ('FallbackBase', [0x20, 0x41], 500),
    ('FallbackExtra', [0x41, 0x1E4D0, 0x323B0, 0x323B1, 0xF0000], 900),
    ('FallbackOther', [0x323B0, 0x33479], 700),
]:
    builder = FontBuilder(1000, isTTF=True)
    names = ['.notdef'] + [f'u{cp:X}' for cp in codepoints]
    builder.setupGlyphOrder(names)
    builder.setupCharacterMap({cp: f'u{cp:X}' for cp in codepoints})
    glyphs = {}
    for i, glyph_name in enumerate(names):
        pen = TTGlyphPen(None)
        if glyph_name != 'u20':
            # Distinct, nonempty glyphs; no outlines copied from another font.
            pen.moveTo((50, 0))
            pen.lineTo((width - 50, 0))
            pen.lineTo((50 + (i % 2) * 100, 700))
            pen.closePath()
        glyphs[glyph_name] = pen.glyph()
    builder.setupGlyf(glyphs)
    builder.setupHorizontalMetrics({glyph: (width, 50) for glyph in names})
    builder.setupHorizontalHeader(ascent=800, descent=-200)
    builder.setupNameTable({'familyName': name, 'styleName': 'Regular',
                           'uniqueFontIdentifier': name, 'fullName': name,
                           'psName': name, 'version': 'Version 1.0'})
    builder.setupOS2(sTypoAscender=800, sTypoDescender=-200, usWinAscent=800, usWinDescent=200)
    builder.setupPost()
    builder.setupMaxp()
    builder.font['head'].created = builder.font['head'].modified = 2082844800
    if name == 'FallbackExtra':
        addOpenTypeFeaturesFromString(builder.font,
            'languagesystem cyrl dflt; feature MF00 { sub u41 by u323B0; } MF00;')
    builder.save(root / f'{name}.ttf')

from fontTools.ttLib import TTCollection, TTFont
collection = TTCollection()
collection.fonts = [TTFont(root / 'FallbackBase.ttf'), TTFont(root / 'FallbackExtra.ttf')]
collection.save(root / 'FallbackCollection.ttc')
