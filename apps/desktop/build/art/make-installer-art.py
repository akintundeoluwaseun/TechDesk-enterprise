#!/usr/bin/env python3
"""Draws everything the Windows installer shows.

    python3 build/art/make-installer-art.py [--preview]

Two kinds of output, and NSIS decides both formats for us. The still images
are plain BMPs, because that is all a dialog can hold. The install page plays
slides.avi, because NSIS cannot run a line of script while an install is going
and therefore cannot drive a timer -- Windows' own animation control plays it
instead, on its own thread, asking nobody.

--preview also writes a contact sheet to look at without starting Windows.
"""
import pathlib
import sys

from PIL import Image, ImageDraw

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))

import rle8
import scenes
from scenes import (H, INK, PANEL_BOX, PAPER, SCENES, W, WHITE, clamp01, ease,
                    font, glossy_card, glow, logo, mix, out_back, render_panel,
                    soft_drop, vgradient)

OUT = pathlib.Path(__file__).resolve().parent.parent

SIDEBAR = (164, 314)
HEADER = (150, 57)
WELCOME = (500, 280)
FPS = 10
SCENE_FRAMES = 22          # 2.2 seconds each, so a short install still turns over


# --------------------------------------------------------------- the animation
def ground(size, top, bottom, lit=True):
    """The lit ramp everything is drawn on."""
    im = vgradient(size, top, bottom, steps=min(size[1], 96))
    if lit:
        im = glow(im, (round(size[0] * 0.26), -round(size[1] * 0.10)),
                  round(size[1] * 1.15), mix(top, (255, 255, 255), 0.45), 0.42)
    return im


def wrap(d, text, f, width):
    words, lines, line = text.split(), [], ""
    for w in words:
        trial = f"{line} {w}".strip()
        if d.textlength(trial, font=f) <= width:
            line = trial
        else:
            lines.append(line)
            line = w
    if line:
        lines.append(line)
    return lines


def chrome(d, im, scene_index):
    """What every frame carries: the mark, the name, and where we are."""
    mark = logo(26)
    im.paste(mark, (28, 22), mark)
    d.text((62, 26), "TechDesk", font=font(15), fill=WHITE)
    for i in range(len(SCENES)):
        x = 28 + i * 13
        on = i == scene_index
        d.rounded_rectangle([x, 194, x + (9 if on else 7), 197], 2,
                            fill=WHITE if on else (255, 255, 255, 110))


def frame(scene_index, k):
    """One frame: k of SCENE_FRAMES through scene scene_index."""
    title, sub, (top, bottom), _ = SCENES[scene_index]
    t = k / (SCENE_FRAMES - 1)

    im = ground((W, H), top, bottom).convert("RGBA")

    # The drawing lives in its own image, so nothing it does can land outside
    # its half of the picture. See scenes.py.
    im.alpha_composite(render_panel(scene_index, t), (PANEL_BOX[0], PANEL_BOX[1]))

    d = ImageDraw.Draw(im)
    chrome(d, im, scene_index)

    # The words arrive: the rule draws itself, the headline settles onto its
    # line, the second line follows a beat later. Both wrap to the column
    # rather than running under the drawing -- the headline is written for
    # the shop, not for the width that happens to be left over.
    enter = ease(clamp01(t * 6))
    dy = round((1 - out_back(clamp01(t * 5))) * 14)
    col = PANEL_BOX[0] - 52
    d.rounded_rectangle([28, 72 + dy, 28 + 32 * enter, 76 + dy], 2,
                        fill=(255, 255, 255, round(255 * enter)))

    y = 88 + dy
    for line in wrap(d, title, font(21), col):
        d.text((28, y), line, font=font(21), fill=(255, 255, 255, round(255 * enter)))
        y += 26
    a2 = ease(clamp01((t - 0.08) * 5))
    y += 6
    for line in wrap(d, sub, font(12, bold=False), col):
        d.text((28, y), line, font=font(12, bold=False),
               fill=(226, 238, 255, round(255 * a2)))
        y += 17

    return im.convert("RGB")


def build_palette():
    """The 256 colours the animation is allowed, chosen rather than found.

    Median cut picks colours by how much area they cover. The grounds are five
    different blues and oranges covering most of every frame, so they took the
    whole palette and the white text on top of them got a handful of greys --
    headlines came out mottled, like a bad screenshot of themselves.

    So the ramps are declared: every ground gets its own, every text colour
    gets a run against the ground it is actually drawn on, and the props get
    what is left.
    """
    out = []
    per_ground = 30
    for _, _, (top, bottom), _ in SCENES:
        lit = mix(top, (255, 255, 255), 0.45)
        for i in range(per_ground):
            out.append(mix(top, bottom, i / (per_ground - 1)))
        for i in range(10):
            out.append(mix(top, lit, i / 9))
        # White type sits on the ground, so it needs the steps in between.
        for i in range(10):
            out.append(mix(mix(top, bottom, 0.35), WHITE, i / 9))

    # The props: paper, ink on paper, and the accents.
    for a, b, n in ((PAPER, INK, 12), (WHITE, PAPER, 4), (PAPER, (100, 116, 160), 8),
                    (scenes.GREEN, scenes.MINT, 8), (PAPER, scenes.GREEN, 6),
                    (scenes.AMBER, scenes.ORANGE, 8), (PAPER, scenes.AMBER, 6),
                    (WHITE, scenes.SKY, 8), (WHITE, (206, 220, 240), 10),
                    ((40, 46, 84), (24, 28, 54), 6), (WHITE, scenes.ROSE, 6),
                    (WHITE, (96, 165, 250), 8), (WHITE, scenes.INDIGO, 6)):
        for i in range(n):
            out.append(mix(a, b, i / (n - 1)))

    seen, uniq = set(), []
    for c in out:
        if c not in seen:
            seen.add(c)
            uniq.append(c)
    uniq = uniq[:256] + [(0, 0, 0)] * max(0, 256 - len(uniq))

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
        sel = [raw[s * SCENE_FRAMES + int(SCENE_FRAMES * 0.82)] for s in range(len(SCENES))]
        sheet = Image.new("RGB", (W, H * len(sel) + 8 * (len(sel) - 1)), (32, 32, 38))
        for i, f in enumerate(sel):
            sheet.paste(f.quantize(palette=pal_img, dither=Image.Dither.NONE).convert("RGB"),
                        (0, i * (H + 8)))
        sheet.save(OUT / "preview-slides.png")

    # One still behind the animation, stretched, so a display scaled above
    # 100% shows our own colour rather than the dialog's grey.
    top, bottom = SCENES[0][2]
    ground((W, H), top, bottom).save(OUT / "slidebg.bmp", "BMP")
    return nbytes, len(raw)


# ----------------------------------------------------------------- the stills
def make_welcome():
    """The first screen: the same world, holding still.

    MUI's welcome page is a sidebar and three paragraphs explaining that an
    installer is about to install something. This says what the app is, with
    Desky on it, and gets out of the way.
    """
    top, bottom = (56, 132, 255), (21, 64, 196)
    im = ground(WELCOME, top, bottom).convert("RGBA")
    d = ImageDraw.Draw(im)

    mark = logo(54)
    im.paste(mark, (40, 36), mark)
    d.text((108, 46), "TechDesk", font=font(32), fill=WHITE)
    d.text((110, 84), "Run your shop. Just ask.", font=font(14, bold=False),
           fill=(198, 224, 255))

    bot = scenes.mascot(150, bob=0.12, look=-0.25, arm=0.2, accent=scenes.SKY)
    im.alpha_composite(bot, (336, 106))

    y = 136
    for label in ("Sell at the counter, and print the receipt",
                  "Track every repair from booked to ready",
                  "Know what is low before you run out",
                  "Works with no internet, on this PC"):
        dot = scenes.orb(12, (255, 255, 255))
        im.alpha_composite(dot, (42, y + 2))
        d.text((64, y), label, font=font(12, bold=False), fill=(226, 238, 255))
        y += 26

    d.text((42, 250), "Free to use  -  nothing leaves this PC unless you sign in",
           font=font(11, bold=False), fill=(176, 208, 250))
    return im.convert("RGB")


def make_sidebar():
    """Still used by the finish page and the uninstaller, which we do not skin."""
    top, bottom = (56, 132, 255), (21, 64, 196)
    im = ground(SIDEBAR, top, bottom).convert("RGBA")
    d = ImageDraw.Draw(im)
    mark = logo(46)
    im.paste(mark, (22, 28), mark)
    d.text((22, 86), "TechDesk", font=font(23), fill=WHITE)
    d.text((22, 115), "Run your shop.", font=font(12, bold=False), fill=(206, 230, 255))
    d.text((22, 131), "Just ask.", font=font(12), fill=(186, 240, 255))
    bot = scenes.mascot(96, bob=0.1, accent=scenes.SKY)
    im.alpha_composite(bot, (28, 178))
    return im.convert("RGB")


def make_header():
    top, bottom = (56, 132, 255), (21, 64, 196)
    im = ground(HEADER, top, bottom).convert("RGBA")
    d = ImageDraw.Draw(im)
    mark = logo(30)
    im.paste(mark, (12, 13), mark)
    d.text((50, 13), "TechDesk", font=font(16), fill=WHITE)
    tag, f = "Run your shop.", font(10, bold=False)
    while d.textlength(tag, font=f) > HEADER[0] - 56 and len(tag) > 8:
        tag = tag.rsplit(" ", 1)[0]
    d.text((50, 34), tag, font=f, fill=(198, 224, 255))
    return im.convert("RGB")


def main():
    preview = "--preview" in sys.argv
    written = []

    def save(img, name):
        img.save(OUT / name, "BMP")
        written.append((name, img.size, (OUT / name).stat().st_size))

    save(make_welcome(), "welcome.bmp")
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
