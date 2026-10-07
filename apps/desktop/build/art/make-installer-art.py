#!/usr/bin/env python3
"""Draws every bitmap the Windows installer shows.

    python3 build/art/make-installer-art.py

NSIS can only put a plain, uncompressed BMP on a dialog -- no PNG, no alpha,
no scaling -- so each one is rendered here at exactly the size the installer
places it and written out flat. Re-run this after changing a colour, a line
of copy or a screenshot; the .bmp files beside it are output, not sources.

Sizes are fixed by MUI, not by taste: the sidebar on the Welcome and Finish
pages is 164x314, the strip across the top of every other page is 150x57.
SLIDE is ours: the log area of the install page, measured on a 100% display.
The control stretches it from there, so this is the size it looks best at
rather than the only size it can be.
"""
import pathlib
import sys

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))

from PIL import Image, ImageChops, ImageDraw, ImageFilter, ImageFont

from make_avi import write_avi

HERE = pathlib.Path(__file__).resolve().parent
OUT = HERE.parent
SHOTS = HERE / "shots"

SIDEBAR = (164, 314)
HEADER = (150, 57)
SLIDE = (450, 166)

# The app's own gradient: indigo-600 to sky-500, over the dark theme colour.
INK = (10, 12, 16)
INDIGO = (79, 70, 229)
SKY = (14, 165, 233)
TEAL = (20, 184, 166)
WHITE = (255, 255, 255)

FONT_DIR = pathlib.Path("/usr/share/fonts/truetype/liberation")


def font(size, bold=True):
    name = "LiberationSans-Bold.ttf" if bold else "LiberationSans-Regular.ttf"
    return ImageFont.truetype(str(FONT_DIR / name), size)


def gradient(size, a, b, diagonal=True):
    """A linear blend from a to b, across or down."""
    w, h = size
    base = Image.new("RGB", size, a)
    draw = ImageDraw.Draw(base)
    steps = max(w, h) if diagonal else h
    for i in range(steps):
        t = i / max(1, steps - 1)
        c = tuple(round(a[j] + (b[j] - a[j]) * t) for j in range(3))
        if diagonal:
            draw.line([(i, 0), (i - h, h)], fill=c, width=2)
        else:
            draw.line([(0, i), (w, i)], fill=c)
    return base


def glow(img, centre, radius, colour, strength=0.55):
    """A soft bloom added as light, which is what makes a flat gradient look lit."""
    layer = Image.new("RGB", img.size, (0, 0, 0))
    hot = tuple(round(c * strength) for c in colour)
    ImageDraw.Draw(layer).ellipse(
        [centre[0] - radius, centre[1] - radius, centre[0] + radius, centre[1] + radius],
        fill=hot,
    )
    layer = layer.filter(ImageFilter.GaussianBlur(radius * 0.5))
    return ImageChops.add(img.convert("RGB"), layer)


def backdrop(size, warm=0.0):
    """Dark ink with coloured light coming from the corners.

    The blooms sit low and to the right on purpose: everything on the left is
    text, and light behind text is the quickest way to make a bright design
    unreadable. Strengths are deliberately modest -- additive light clips to
    white fast, and a clipped gradient reads as a mistake rather than a glow.
    """
    img = gradient(size, (7, 9, 20), (13, 16, 38), diagonal=False)
    img = glow(img, (int(size[0] * 0.05), int(size[1] * 1.02)), int(size[1] * 0.85), INDIGO, 0.34)
    img = glow(img, (int(size[0] * 1.02), int(size[1] * 0.08)), int(size[1] * 0.8), SKY, 0.30)
    img = glow(img, (int(size[0] * 0.80), int(size[1] * 1.05)), int(size[1] * 0.55), TEAL, 0.16)

    # A grid, barely there: structure you feel rather than see.
    grid = Image.new("RGB", size, (0, 0, 0))
    g = ImageDraw.Draw(grid)
    for x in range(0, size[0], 28):
        g.line([(x, 0), (x, size[1])], fill=(9, 11, 18), width=1)
    for y in range(0, size[1], 28):
        g.line([(0, y), (size[0], y)], fill=(9, 11, 18), width=1)
    return ImageChops.add(img, grid)


def rounded(img, radius):
    mask = Image.new("L", img.size, 0)
    ImageDraw.Draw(mask).rounded_rectangle([0, 0, img.size[0] - 1, img.size[1] - 1], radius, fill=255)
    out = Image.new("RGBA", img.size)
    out.paste(img, (0, 0), mask)
    return out


def mark(size):
    """The TechDesk tile: a rounded square, gradient, with a white 'b'."""
    tile = gradient((size * 4, size * 4), SKY, INDIGO)
    tile = rounded(tile, size)
    d = ImageDraw.Draw(tile)
    f = font(int(size * 2.6))
    d.text((size * 2, size * 2), "b", font=f, fill=WHITE, anchor="mm")
    return tile.resize((size, size), Image.LANCZOS)


def shadowed(card, blur=7, offset=(0, 4), alpha=150):
    """A card lifted off the background, so a screenshot reads as a window."""
    pad = blur * 3
    canvas = Image.new("RGBA", (card.width + pad * 2, card.height + pad * 2), (0, 0, 0, 0))
    shade = Image.new("RGBA", card.size, (0, 0, 0, alpha))
    shade = rounded(shade, 10)
    canvas.paste(shade, (pad + offset[0], pad + offset[1]), shade)
    canvas = canvas.filter(ImageFilter.GaussianBlur(blur))
    canvas.paste(card, (pad, pad), card)
    return canvas, pad


def wrap(draw, text, f, width):
    words, lines, line = text.split(), [], ""
    for w in words:
        trial = f"{line} {w}".strip()
        if draw.textlength(trial, font=f) <= width:
            line = trial
        else:
            lines.append(line)
            line = w
    if line:
        lines.append(line)
    return lines


# ------------------------------------------------------------------ sidebar
def make_sidebar():
    img = backdrop(SIDEBAR).convert("RGBA")
    top = Image.new("RGBA", SIDEBAR, (0, 0, 0, 0))
    td = ImageDraw.Draw(top)
    for i in range(170):
        td.line([(0, i), (SIDEBAR[0], i)], fill=(5, 7, 16, int(120 * (1 - i / 170))))
    img = Image.alpha_composite(img, top)
    d = ImageDraw.Draw(img)
    logo = mark(44)
    img.paste(logo, (22, 30), logo)
    d.text((22, 92), "TechDesk", font=font(23), fill=WHITE)
    d.text((22, 120), "Run your shop.", font=font(13, bold=False), fill=(214, 221, 240))
    d.text((22, 137), "Just ask.", font=font(13), fill=(125, 211, 252))
    y = 190
    for line in ("Sales", "Repairs", "Stock", "Customers", "Reports"):
        d.ellipse([22, y + 4, 28, y + 10], fill=(45, 212, 191))
        d.text((36, y), line, font=font(12, bold=False), fill=(222, 228, 244))
        y += 21
    return img.convert("RGB")


# ------------------------------------------------------------------- header
def make_header():
    img = backdrop(HEADER).convert("RGBA")
    d = ImageDraw.Draw(img)
    logo = mark(30)
    img.paste(logo, (12, 13), logo)
    d.text((50, 13), "TechDesk", font=font(16), fill=WHITE)
    tag, f = "Run your shop.", font(10, bold=False)
    while d.textlength(tag, font=f) > HEADER[0] - 56 and len(tag) > 8:
        tag = tag.rsplit(" ", 1)[0]
    d.text((50, 34), tag, font=f, fill=(150, 200, 240))
    return img.convert("RGB")


# ------------------------------------------------------------------- slides
SLIDES = [
    ("Just ask TechDesk",
     "Say what happened and it writes the sale, the repair, the stock.",
     "app-dashboard.webp", (139, 92, 246)),
    ("Sell at the counter",
     "Ring it up, print the receipt, take part payment. In seconds.",
     "app-sales.webp", (14, 165, 233)),
    ("Every repair, tracked",
     "Who brought it, what is wrong, what you quoted, when it is ready.",
     "app-repairs.webp", (245, 158, 11)),
    ("Know your stock",
     "What is low, what is not moving, what to buy before you run out.",
     "app-inventory.webp", (20, 184, 166)),
    ("No internet? Fine.",
     "Everything stays on this PC. Keep selling when the network drops.",
     "app-reports.webp", (236, 72, 153)),
]


def make_slide(title, body, shot, accent):
    img = backdrop(SLIDE).convert("RGBA")
    img = glow(img, (int(SLIDE[0] * 0.74), int(SLIDE[1] * 0.5)), 140, accent, 0.45).convert("RGBA")
    scrim = Image.new("RGBA", SLIDE, (0, 0, 0, 0))
    sd = ImageDraw.Draw(scrim)
    for i in range(int(SLIDE[0] * 0.62)):
        sd.line([(i, 0), (i, SLIDE[1])], fill=(5, 7, 16, int(150 * (1 - i / (SLIDE[0] * 0.62)))))
    img = Image.alpha_composite(img, scrim)
    d = ImageDraw.Draw(img)

    # The screenshot, as a window lifted off the background.
    card_w = 208
    src = Image.open(SHOTS / shot).convert("RGB")
    card_h = round(card_w * src.height / src.width)
    card = rounded(src.resize((card_w, card_h), Image.LANCZOS), 10)
    edge = Image.new("RGBA", card.size, (0, 0, 0, 0))
    ImageDraw.Draw(edge).rounded_rectangle([0, 0, card_w - 1, card_h - 1], 10,
                                           outline=(255, 255, 255, 90), width=2)
    card = Image.alpha_composite(card, edge)
    block, pad = shadowed(card)
    img.paste(block, (SLIDE[0] - card_w - 20 - pad, (SLIDE[1] - card_h) // 2 - pad), block)

    # The words.
    x, right = 24, SLIDE[0] - card_w - 44
    d.rectangle([x, 34, x + 30, 37], fill=accent)
    ty = 46
    for line in wrap(d, title, font(18), right - x):
        d.text((x, ty), line, font=font(18), fill=WHITE)
        ty += 23
    ty += 5
    for line in wrap(d, body, font(11, bold=False), right - x):
        d.text((x, ty), line, font=font(11, bold=False), fill=(203, 212, 232))
        ty += 15
    return img.convert("RGB")


def main():
    written = []

    def save(img, name):
        path = OUT / name
        img.save(path, "BMP")
        written.append((name, img.size, path.stat().st_size))

    save(make_sidebar(), "installerSidebar.bmp")
    save(make_sidebar(), "uninstallerSidebar.bmp")
    save(make_header(), "installerHeader.bmp")
    slides = [make_slide(*s) for s in SLIDES]

    # The individual frames are only ever looked at by a person checking the
    # artwork; the installer plays the AVI. Writing a megabyte of BMPs into
    # the repository every run is a cost with no reader, so they come out
    # only when asked for.
    if "--preview" in sys.argv:
        for i, img in enumerate(slides, 1):
            save(img, f"slide{i}.bmp")

    # The frames again, as the thing the install page actually plays.
    nbytes = write_avi(OUT / "slides.avi", slides, seconds_per_frame=3.0)
    written.append(("slides.avi", SLIDE, nbytes))

    # One flat frame behind the animation, stretched to whatever the page
    # gives us, so a display scaled above 100% shows dark edges and not the
    # dialog's grey.
    save(backdrop(SLIDE), "slidebg.bmp")

    for name, size, nbytes in written:
        print(f"  {name:28} {size[0]}x{size[1]:<5} {nbytes // 1024} KB")
    print(f"{len(written)} bitmaps, {sum(n for _, _, n in written) // 1024} KB in all")


if __name__ == "__main__":
    main()
