"""The home-screen icons for Monitor on the web.

Checked in as a script rather than four opaque PNGs, so the next person can
change the mark without guessing how these were made.

Two rules the phone platforms impose, both learned the hard way on the main
app's icon:

  Full-bleed and OPAQUE. iOS composites an apple-touch-icon onto BLACK and
  rounds the corners itself. A transparent or already-rounded icon shows a
  black square, or black in the four corners.

  A separate maskable icon, with the mark well inside a safe circle, because
  Android crops it to whatever shape the launcher uses.

The mark is a phone with a rising bar chart in it -- Monitor is the owner
watching their shops from their phone -- on a teal-to-blue gradient. A
sibling of TechDesk's purple-to-blue screen, not a copy of it: the two sit
next to each other on a home screen and have to be told apart at a glance.
"""

from PIL import Image, ImageDraw
import os

OUT = os.path.join(os.path.dirname(__file__), "..", "public")

START = (6, 182, 212)    # #06b6d4
END = (37, 99, 235)      # #2563eb
WHITE = (255, 255, 255, 255)


def gradient(size):
    """Diagonal, corner to corner, the same direction as TechDesk's."""
    img = Image.new("RGB", (size, size))
    px = img.load()
    for y in range(size):
        for x in range(size):
            t = (x + y) / (2 * (size - 1))
            px[x, y] = tuple(round(START[i] + (END[i] - START[i]) * t) for i in range(3))
    return img


def mark(img, scale):
    """The phone and its bars, drawn at `scale` of the icon's width.

    scale is the fraction of the canvas the whole mark occupies -- smaller for
    the maskable icon, which a launcher is free to crop into a circle.
    """
    size = img.size[0]
    d = ImageDraw.Draw(img, "RGBA")

    w = size * scale
    h = w * 1.5
    x0 = (size - w) / 2
    y0 = (size - h) / 2
    stroke = max(2, round(w * 0.085))
    radius = w * 0.2

    d.rounded_rectangle([x0, y0, x0 + w, y0 + h], radius=radius, outline=WHITE, width=stroke)

    # Three bars, rising. Drawn inside the phone with a clear margin, so the
    # shape still reads at 48 pixels on a launcher.
    inset = w * 0.22
    bx = x0 + inset
    bw = (w - inset * 2)
    bar_w = bw * 0.22
    gap = (bw - bar_w * 3) / 2
    floor = y0 + h - inset * 1.15
    heights = [h * 0.16, h * 0.30, h * 0.44]

    for i, bh in enumerate(heights):
        left = bx + i * (bar_w + gap)
        d.rounded_rectangle(
            [left, floor - bh, left + bar_w, floor],
            radius=bar_w / 2,
            fill=WHITE,
        )
    return img


def write(name, size, scale):
    img = mark(gradient(size), scale)
    path = os.path.join(OUT, name)
    img.save(path, "PNG")
    print(f"  {name}  {size}x{size}")


if __name__ == "__main__":
    os.makedirs(OUT, exist_ok=True)
    print("Monitor icons:")
    write("icon-192.png", 192, 0.44)
    write("icon-512.png", 512, 0.44)
    # iOS: square, opaque, full-bleed. It rounds the corners itself.
    write("apple-touch-icon.png", 180, 0.44)
    # Android crops this to the launcher's shape, so the mark sits well in.
    write("icon-maskable-512.png", 512, 0.34)
