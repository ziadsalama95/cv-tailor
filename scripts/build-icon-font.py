#!/usr/bin/env python3
"""Builds the tiny icon font the PDF export uses, from the same SVG paths the
editor draws on screen (tmp/icon-font-source.json, written by
scripts/build-icons.cjs).

Why a font at all: pdfmake can place an image or an SVG as a *block*, but the
résumé's contact line is a single wrapping, centred run of styled text — an
icon has to sit inside that text flow, before its URL, and stay glued to it
through wrapping and page layout. A run of text in a font whose glyphs happen
to be logos does exactly that, for free, with no layout plumbing: it inherits
the line's size, colour and alignment, and stays vector (crisp at any zoom,
selectable-adjacent, a few KB total rather than an embedded bitmap each).

Output: public/vendor/pdf-icon-font.js — base64 TTF assigned to
window.PDF_ICON_FONT_VFS, loaded exactly like the existing brand fonts.

Run:  npm run build:icons   (which chains node + this script)
Needs: fonttools, skia-pathops
"""

import base64
import json
import os

from fontTools.fontBuilder import FontBuilder
from fontTools.pens.cu2quPen import Cu2QuPen
from fontTools.pens.transformPen import TransformPen
from fontTools.pens.ttGlyphPen import TTGlyphPen
from fontTools.svgLib.path import parse_path
import pathops

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SOURCE = os.path.join(ROOT, "tmp", "icon-font-source.json")
OUT_JS = os.path.join(ROOT, "public", "vendor", "pdf-icon-font.js")

UPM = 1000
# The drawn mark is 720 units tall on a 1000-unit em and sits from -50 (just
# under the baseline) to 670 — a hair taller than the cap height of the body
# faces, centred on the lowercase x-height, which is what makes an icon read
# as *part of* the line of text instead of floating above or below it.
ICON_EM = 720.0
BASELINE_DROP = -50.0
SIDE_BEARING = 55.0
ADVANCE = int(round(ICON_EM + SIDE_BEARING * 2))
# Trailing gap glyph, used instead of a plain space so the space between an
# icon and its URL can't be collapsed or line-broken away by the layout engine.
GAP_ADVANCE = 150
GAP_CODEPOINT = 0xE900


def outline(path_data, box, rule):
    """SVG path text -> a clean, correctly-wound pathops.Path in font units.

    Two conversions happen here that a naive parse would get wrong:

    * Y flip. SVG's Y axis grows downward, a font's grows upward, so every
      icon would otherwise come out mirrored.
    * Fill rule. TrueType fills with the non-zero rule only. simple-icons
      artwork is already drawn for non-zero (holes wound against their
      outer contour), but the bootstrap marks use even-odd, where a hole is
      wound the *same* way as its outer contour and would fill in solid.
      Running the path through skia's simplify() with the right fill type
      re-expresses it as non-overlapping, consistently wound contours that
      mean the same thing under non-zero — which also fixes any icon whose
      subpaths happen to overlap.
    """
    scale = ICON_EM / float(box)
    raw = pathops.Path()
    raw.fillType = pathops.FillType.EVEN_ODD if rule == "evenodd" else pathops.FillType.WINDING
    # (xx, xy, yx, yy, dx, dy) — uniform scale plus the Y flip about the top.
    transform = (scale, 0, 0, -scale, SIDE_BEARING, ICON_EM + BASELINE_DROP)
    parse_path(path_data, TransformPen(pathops.PathPen(raw), transform))
    # clockwise=True matches the TrueType convention for outer contours.
    return pathops.simplify(raw, clockwise=True)


def build():
    with open(SOURCE, encoding="utf8") as handle:
        icons = json.load(handle)

    glyph_order = [".notdef", "gap"] + [i["key"] for i in icons]
    glyphs = {}
    metrics = {}

    empty = TTGlyphPen(None)
    glyphs[".notdef"] = empty.glyph()
    metrics[".notdef"] = (ADVANCE, 0)
    gap = TTGlyphPen(None)
    glyphs["gap"] = gap.glyph()
    metrics["gap"] = (GAP_ADVANCE, 0)

    cmap = {GAP_CODEPOINT: "gap"}
    for icon in icons:
        pen = TTGlyphPen(None)
        # pathops emits cubics; TrueType outlines are quadratic, so cu2qu
        # converts on the way in at a tolerance well below a printed pixel.
        outline(icon["d"], icon["box"], icon["rule"]).draw(Cu2QuPen(pen, max_err=1.0))
        glyphs[icon["key"]] = pen.glyph()
        metrics[icon["key"]] = (ADVANCE, int(SIDE_BEARING))
        cmap[icon["glyph"]] = icon["key"]

    fb = FontBuilder(UPM, isTTF=True)
    fb.setupGlyphOrder(glyph_order)
    fb.setupCharacterMap(cmap)
    fb.setupGlyf(glyphs)
    fb.setupHorizontalMetrics(metrics)
    fb.setupHorizontalHeader(ascent=800, descent=-200)
    fb.setupNameTable(
        {
            "familyName": "CV Icons",
            "styleName": "Regular",
            "psName": "CVIcons-Regular",
            "version": "1.0",
            "licenseDescription": (
                "Brand marks from simple-icons (CC0-1.0); interface marks from "
                "bootstrap-icons (MIT). Trademarks belong to their owners."
            ),
        }
    )
    fb.setupOS2(sTypoAscender=800, sTypoDescender=-200, usWinAscent=800, usWinDescent=200)
    fb.setupPost(isFixedPitch=0)

    ttf_path = os.path.join(ROOT, "tmp", "CVIcons-Regular.ttf")
    fb.save(ttf_path)
    with open(ttf_path, "rb") as handle:
        encoded = base64.b64encode(handle.read()).decode("ascii")

    os.makedirs(os.path.dirname(OUT_JS), exist_ok=True)
    with open(OUT_JS, "w", encoding="utf8") as handle:
        handle.write(
            "// GENERATED FILE - do not edit by hand.\n"
            "// Run `npm run build:icons` to rebuild from scripts/icon-manifest.cjs.\n"
            "// Icon glyphs for the PDF export; see scripts/build-icon-font.py.\n"
            'window.PDF_ICON_FONT_VFS = {"CVIcons-Regular.ttf":"%s"};\n' % encoded
        )
    print(
        "Wrote %s (%d glyphs, %.1f KB base64)"
        % (os.path.relpath(OUT_JS, ROOT), len(icons), len(encoded) / 1024.0)
    )


if __name__ == "__main__":
    build()
