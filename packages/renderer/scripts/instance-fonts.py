# Produces the bundled static fonts.
#
# Instance a Google Fonts variable file and subset it to Latin:
#   python3 -I instance-fonts.py <variable.ttf> <out.ttf> <Family> <Style> "wght=600,opsz=14"
# Re-subset an existing static file (drops the same layout features, keeps the glyph set):
#   python3 -I instance-fonts.py <static.ttf> <out.ttf> <Family> <Style> static
#
# Needs: pip install fonttools. resvg (fontdb 0.14) ignores variation axes, hence static instances.
# `calt` is dropped because rustybuzz applies it at render time (Inter turns "->" into an arrow and
# "1x2" into a multiplication sign) while the TypeScript measurer only sums advances and kerning;
# SF Pro, Chirp and Roboto as the Platforms ship them show those sequences literally anyway.
import sys
from fontTools.ttLib import TTFont
from fontTools.varLib import instancer
from fontTools import subset

DROPPED_FEATURES = ["calt"]
LATIN = (
    "U+0000-00FF,U+0100-017F,U+0180-024F,U+02B0-02FF,U+0300-036F,U+1E00-1EFF,"
    "U+2000-206F,U+20A0-20CF,U+2100-214F,U+2190-21FF,U+2200-22FF,U+25A0-25FF,U+2600-26FF,U+FB00-FB06"
)

src, out, family, style, axes = sys.argv[1], sys.argv[2], sys.argv[3], sys.argv[4], sys.argv[5]
f = TTFont(src)
if axes == "static":
    inst = f
else:
    loc = {k: float(v) for k, v in (a.split("=") for a in axes.split(","))}
    inst = instancer.instantiateVariableFont(f, loc, inplace=False, updateFontNames=True)

tags = set()
for table in ("GSUB", "GPOS"):
    if table in inst and inst[table].table.FeatureList:
        tags.update(r.FeatureTag for r in inst[table].table.FeatureList.FeatureRecord)

opts = subset.Options()
opts.layout_features = sorted(tags - set(DROPPED_FEATURES))
opts.name_IDs = ["*"]
opts.notdef_outline = True
opts.unicodes = subset.parse_unicodes(LATIN)
sub = subset.Subsetter(opts)
sub.populate(unicodes=opts.unicodes)
sub.subset(inst)

name = inst["name"]
for rec in name.names:
    if rec.nameID == 1:
        rec.string = family
    elif rec.nameID == 2:
        rec.string = style
    elif rec.nameID == 4:
        rec.string = f"{family} {style}"
    elif rec.nameID == 6:
        rec.string = f"{family}-{style}".replace(" ", "")
    elif rec.nameID == 16:
        rec.string = family
    elif rec.nameID == 17:
        rec.string = style
inst.save(out)
print(out, inst["OS/2"].usWeightClass, len(inst.getGlyphOrder()))
