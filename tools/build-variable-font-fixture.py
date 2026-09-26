"""Original geometric named-instance fixture; run with uv run --with fonttools."""
from pathlib import Path
from tempfile import TemporaryDirectory
from fontTools.fontBuilder import FontBuilder
from fontTools.pens.ttGlyphPen import TTGlyphPen
from fontTools.designspaceLib import DesignSpaceDocument, AxisDescriptor, SourceDescriptor, InstanceDescriptor
from fontTools.varLib import build

with TemporaryDirectory() as directory:
    doc = DesignSpaceDocument()
    axis = AxisDescriptor()
    axis.name, axis.tag = 'Weight', 'wght'
    axis.minimum, axis.default, axis.maximum = 100, 100, 900
    doc.addAxis(axis)
    for weight, style, size in [(100, 'Thin', 300), (900, 'Black', 800)]:
        fb = FontBuilder(1000, isTTF=True)
        fb.setupGlyphOrder(['.notdef', 'A'])
        fb.setupCharacterMap({65: 'A'})
        pen = TTGlyphPen(None)
        pen.moveTo((0, 0)); pen.lineTo((size, 0)); pen.lineTo((size, 700)); pen.lineTo((0, 700)); pen.closePath()
        fb.setupGlyf({'.notdef': TTGlyphPen(None).glyph(), 'A': pen.glyph()})
        fb.setupHorizontalMetrics({'.notdef': (500, 0), 'A': (size + 100, 0)})
        fb.setupHorizontalHeader(ascent=800, descent=-200)
        fb.setupNameTable({'familyName': 'VariableSample', 'styleName': style,
                          'typographicFamily': 'VariableSample', 'typographicSubfamily': style,
                          'fullName': f'VariableSample {style}', 'psName': f'VariableSample-{style}',
                          'uniqueFontIdentifier': f'VariableSample-{style}'})
        fb.setupOS2(sTypoAscender=800, sTypoDescender=-200, usWinAscent=800, usWinDescent=200, usWeightClass=weight)
        fb.setupPost(); fb.setupMaxp()
        fb.font['head'].created = fb.font['head'].modified = 2082844800
        path = Path(directory) / f'{style}.ttf'; fb.save(path)
        source = SourceDescriptor(); source.path = str(path); source.name = style
        source.familyName, source.styleName = 'VariableSample', style
        source.location = {'Weight': weight}
        if weight == 100: source.copyInfo = source.copyLib = source.copyFeatures = True
        doc.addSource(source)
    for weight, style in [(100, 'Thin'), (400, 'Regular'), (700, 'Bold'), (900, 'Black')]:
        instance = InstanceDescriptor(); instance.familyName = 'VariableSample'
        instance.styleName = style; instance.postScriptFontName = f'VariableSample-{style}'
        instance.location = {'Weight': weight}; doc.addInstance(instance)
    font, _, _ = build(doc)
    font['head'].created = font['head'].modified = 2082844800
    font.save(Path(__file__).resolve().parent.parent / 'tests/fixtures/VariableSample.ttf')
