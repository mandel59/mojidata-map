"""Localized name tables on existing original geometric outlines (fonttools)."""
from pathlib import Path
from fontTools.ttLib import TTCollection, TTFont

root = Path(__file__).resolve().parent.parent / 'tests' / 'fixtures'

def face(source, ps, names):
    font = TTFont(root / source, recalcTimestamp=False)
    font['name'].names = []
    font['name'].setName(ps, 6, 3, 1, 0x409)
    for locale, entries in names.items():
        for key, value in entries.items():
            font['name'].setName(value, key, 3, 1, locale)
    return font

base = face('FallbackBase.ttf', 'LocalizedBase', {
    0x409: {1: 'Localized', 2: 'Regular', 4: 'Localized Regular', 16: 'Preferred Localized'},
    0x411: {1: '日本語テスト', 2: '標準', 4: '日本語テスト 標準'},
    0x403: {1: 'Localitzat', 2: 'Normal', 4: 'Localitzat Normal'},
})
italic = face('FallbackExtra.ttf', 'LocalizedItalic', {
    0x409: {1: 'Localized', 2: 'Italic', 4: 'Localized Italic'},
    0x403: {1: 'Localitzat', 2: 'Cursiva', 4: 'Localitzat Cursiva'},
    0x40A: {1: 'Localizado', 2: 'Cursiva', 4: 'Localizado Cursiva'},
})
collection = TTCollection()
collection.fonts = [base, italic]
collection.save(root / 'LocalizedNames.ttc')
other = face('FallbackBase.ttf', 'OnlyOtherNames', {
    0x403: {1: 'Localitzat', 2: 'Cursiva', 4: 'Localitzat Cursiva'},
    0x40A: {1: 'Localizado', 2: 'Cursiva', 4: 'Localizado Cursiva'},
})
other.save(root / 'OnlyOtherNames.ttf')
