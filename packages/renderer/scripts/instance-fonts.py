# Instances static weights from the Google Fonts variable Inter/Roboto files and subsets them to Latin.
# usage: python3 -I instance-fonts.py <variable.ttf> <out.ttf> <Family> <Style> "wght=600,opsz=14"
# Needs: pip install fonttools. resvg (fontdb 0.14) ignores variation axes, hence static instances.
import sys
from fontTools.ttLib import TTFont
from fontTools.varLib import instancer
from fontTools import subset

src, out, family, style, axes = sys.argv[1], sys.argv[2], sys.argv[3], sys.argv[4], sys.argv[5]
loc = {k: float(v) for k, v in (a.split("=") for a in axes.split(","))}
f = TTFont(src)
inst = instancer.instantiateVariableFont(f, loc, inplace=False, updateFontNames=True)

opts = subset.Options()
opts.layout_features = ["*"]
opts.name_IDs = ["*"]
opts.notdef_outline = True
opts.unicodes = subset.parse_unicodes(
    "U+0000-00FF,U+0100-017F,U+0180-024F,U+02B0-02FF,U+0300-036F,U+1E00-1EFF,"
    "U+2000-206F,U+20A0-20CF,U+2100-214F,U+2190-21FF,U+2200-22FF,U+25A0-25FF,U+2600-26FF,U+FB00-FB06"
)
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
