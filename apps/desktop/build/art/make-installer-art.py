#!/usr/bin/env python3
"""Draws everything the Windows installer shows.

    python3 build/art/make-installer-art.py [--preview]

Two kinds of output, and NSIS decides both formats for us. The sidebar and
the header strip are plain BMPs, because that is all a dialog can hold. The
install page plays slides.avi, because NSIS cannot run a line of script while
an install is going and therefore cannot drive a timer -- Windows' own
animation control plays it instead, on its own thread, asking nobody.

--preview also writes a contact sheet to look at without starting Windows.
"""
import pathlib
import sys

from PIL import Image, ImageDraw

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))

import scenes
import rle8
from scenes import (BG, DIM, EDGE, H, PANEL_BOX, SCENES, W, WHITE, clamp01,
                    ease, font, logo, mix, out_back, render_panel)

OUT = pathlib.Path(__file__).resolve().parent.parent

SIDEBAR = (164, 314)
HEADER = (150, 57)
FPS = 10
SCENE_FRAMES = 22          # 2.2 seconds each, so a short install still turns over


# --------------------------------------------------------------- the animation
def chrome(d, im, scene_index):
    """What every frame carries: the mark, the name, and where we are."""
    mark = logo(22)
    im.paste(mark, (20, 16), mark)
    d.text((48, 18), "TechDesk", font=font(13), fill=WHITE)
    for i in range(len(SCENES)):
        x = 20 + i * 11
        on = i == scene_index
        c = SCENES[i][2] if on else EDGE
        d.rounded_rectangle([x, 142, x + (8 if on else 6), 145], 2, fill=c)


def frame(scene_index, k):
    """One frame: k of SCENE_FRAMES through scene scene_index."""
    title, sub, accent, _ = SCENES[scene_index]
    t = k / (SCENE_FRAMES - 1)

    im = Image.new("RGB", (W, H), BG)
    d = ImageDraw.Draw(im)

    # The scene draws into its own image and is masked in, so nothing it does
    # can land outside the panel. See scenes.py.
    panel, mask = render_panel(scene_index, t)
    im.paste(panel, (PANEL_BOX[0], PANEL_BOX[1]), mask)

    chrome(d, im, scene_index)

    # The words arrive, and leave before the next scene's do.
    enter = ease(clamp01(t * 6))
    dy = round((1 - out_back(clamp01(t * 5))) * 12)
    d.text((20, 58 + dy), title, font=font(19), fill=mix(BG, WHITE, enter))
    a2 = ease(clamp01((t - 0.08) * 5))
    d.text((20, 86 + round(dy * 0.6)), sub, font=font(11, bold=False), fill=mix(BG, DIM, a2))
    d.rounded_rectangle([20, 48 + dy, 20 + 26 * enter, 51 + dy], 2, fill=mix(BG, accent, enter))

    return im


def build_palette():
    """The 256 colours the animation is allowed, chosen rather than found.

    Median cut picks colours by how much area they cover, and this artwork is
    mostly flat dark ground -- so the ground got the palette and the ramp that
    anti-aliases white text on it got about four greys. Headlines came out
    mottled, like a bad screenshot of themselves.

    Text is the thing worth spending a palette on. Every pair below is a
    background something is actually drawn on and the colour it is drawn in;
    the steps between them are what an anti-aliased edge needs.
    """
    from scenes import (AMBER, CARD, EDGE, GREEN, INDIGO, PANEL_BG, ROSE, SKY,
                        TEAL)
    GREEN_CARD, AMBER_CARD = (20, 44, 38), (44, 34, 10)
    pairs = (
        (BG, WHITE, 26), (BG, DIM, 14), (BG, EDGE, 6),
        (PANEL_BG, WHITE, 16), (CARD, WHITE, 16), (CARD, DIM, 14), (CARD, EDGE, 6),
        (PANEL_BG, INDIGO, 10), (PANEL_BG, SKY, 10), (PANEL_BG, TEAL, 10),
        (PANEL_BG, AMBER, 10), (PANEL_BG, ROSE, 10), (PANEL_BG, GREEN, 10),
        (BG, INDIGO, 8), (BG, SKY, 8), (BG, TEAL, 8), (BG, AMBER, 8), (BG, ROSE, 8),
        (CARD, SKY, 8), (GREEN_CARD, GREEN, 8), (AMBER_CARD, AMBER, 8),
        (INDIGO, SKY, 10), (INDIGO, WHITE, 8), (SKY, WHITE, 8),
    )
    out = [mix(a, b, i / (n - 1)) for a, b, n in pairs for i in range(n)]
    out += [BG, PANEL_BG, CARD, EDGE, WHITE, DIM, GREEN_CARD, AMBER_CARD]

    seen, uniq = set(), []
    for c in out:
        if c not in seen:
            seen.add(c)
            uniq.append(c)
    uniq = uniq[:256] + [BG] * max(0, 256 - len(uniq))

    pal = Image.new("P", (1, 1))
    flat = [v for c in uniq for v in c]
    pal.putpalette(flat)
    return pal, flat


def build_animation(preview=False):
    raw = [frame(s, k) for s in range(len(SCENES)) for k in range(SCENE_FRAMES)]
    pal_img, palette = build_palette()

    chunks = []
    for f in raw:
        indices = f.quantize(palette=pal_img, dither=Image.Dither.NONE).tobytes()
        chunk = rle8.encode_frame(indices, W, H)
        # The encoder is hand-written and its failures are silent -- a frame
        # that decodes one pixel short skews every row after it into a smear
        # that still plays. Every frame is decoded back and compared.
        if rle8.decode_frame(chunk, W, H) != indices:
            raise AssertionError("RLE8 encoding is not lossless")
        chunks.append(chunk)

    nbytes = rle8.write_avi(OUT / "slides.avi", chunks, palette, (W, H), fps=FPS)

    if preview:
        # The frames AS THEY WILL PLAY -- quantised, not the originals. A
        # preview is only worth looking at if it shows the same damage the
        # installer will.
        sel = [raw[s * SCENE_FRAMES + int(SCENE_FRAMES * 0.8)] for s in range(len(SCENES))]
        sheet = Image.new("RGB", (W, H * len(sel) + 8 * (len(sel) - 1)), (32, 32, 38))
        for i, f in enumerate(sel):
            sheet.paste(f.quantize(palette=pal_img, dither=Image.Dither.NONE).convert("RGB"),
                        (0, i * (H + 8)))
        sheet.save(OUT / "preview-slides.png")

    # One still, stretched behind the animation, so a display scaled above
    # 100% shows our own dark rather than the dialog's grey.
    Image.new("RGB", (W, H), BG).save(OUT / "slidebg.bmp", "BMP")
    return nbytes, len(raw)


# ----------------------------------------------------------------- the bitmaps
def panel(size):
    """The flat ground the still images sit on, with one soft corner lift."""
    im = Image.new("RGB", size, BG)
    d = ImageDraw.Draw(im)
    # Stepped, not smooth: a handful of flat bands reads as deliberate and
    # costs nothing, where a true gradient dithers into noise at 8 bits.
    for i in range(14):
        c = mix(BG, (26, 30, 62), (14 - i) / 18)
        d.rectangle([0, size[1] - (i + 1) * size[1] / 14, size[0], size[1] - i * size[1] / 14], fill=c)
    return im


def make_sidebar():
    im = panel(SIDEBAR)
    d = ImageDraw.Draw(im)
    mark = logo(46)
    im.paste(mark, (22, 30), mark)
    d.text((22, 90), "TechDesk", font=font(23), fill=WHITE)
    d.text((22, 119), "Run your shop.", font=font(12, bold=False), fill=(205, 213, 235))
    d.text((22, 135), "Just ask.", font=font(12), fill=(125, 211, 252))
    y = 188
    for label, (_, _, accent, _) in zip(
            ("Sales", "Repairs", "Stock", "Customers", "Reports"), SCENES):
        d.rounded_rectangle([22, y + 3, 26, y + 11], 2, fill=accent)
        d.text((36, y), label, font=font(12, bold=False), fill=(222, 228, 244))
        y += 21
    return im


def make_header():
    im = panel(HEADER)
    d = ImageDraw.Draw(im)
    mark = logo(30)
    im.paste(mark, (12, 13), mark)
    d.text((50, 13), "TechDesk", font=font(16), fill=WHITE)
    tag, f = "Run your shop.", font(10, bold=False)
    while d.textlength(tag, font=f) > HEADER[0] - 56 and len(tag) > 8:
        tag = tag.rsplit(" ", 1)[0]
    d.text((50, 34), tag, font=f, fill=(150, 200, 240))
    return im


def main():
    preview = "--preview" in sys.argv
    written = []

    def save(img, name):
        img.save(OUT / name, "BMP")
        written.append((name, img.size, (OUT / name).stat().st_size))

    save(make_sidebar(), "installerSidebar.bmp")
    save(make_sidebar(), "uninstallerSidebar.bmp")
    save(make_header(), "installerHeader.bmp")

    nbytes, nframes = build_animation(preview)
    written.append(("slides.avi", (W, H), nbytes))
    written.append(("slidebg.bmp", (W, H), (OUT / "slidebg.bmp").stat().st_size))

    for name, size, n in written:
        print(f"  {name:24} {size[0]}x{size[1]:<5} {n // 1024:5} KB")
    print(f"{nframes} frames at {FPS} fps "
          f"({nframes / FPS:.1f}s), {sum(n for _, _, n in written) // 1024} KB in all")


if __name__ == "__main__":
    main()
