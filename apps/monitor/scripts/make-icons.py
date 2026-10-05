"""Monitor's icons, from brand/icon-source.png.

Monitor keeps the white "TD" tile -- the icon TechDesk itself used before it
took the website's indigo-to-sky logo -- so the two apps sit side by side on
a home screen and are told apart at a glance.

    python3 apps/monitor/scripts/make-icons.py

The rules the phone platforms impose, learned the hard way:

  Full-bleed and OPAQUE for the web icons. iOS composites an
  apple-touch-icon onto BLACK and rounds the corners itself, so a
  transparent or already-rounded icon shows black in the four corners.

  A separate maskable / adaptive icon with the mark well inside a safe
  circle, because Android crops it to whatever shape the launcher uses.
"""

from PIL import Image
import os

HERE = os.path.dirname(os.path.abspath(__file__))
APP = os.path.join(HERE, "..")
SRC = Image.open(os.path.join(APP, "brand", "icon-source.png")).convert("RGBA")
WHITE = (255, 255, 255, 255)


def on_white(size, scale=1.0):
    """The tile on an opaque white square; scale < 1 leaves room around it."""
    img = Image.new("RGBA", (size, size), WHITE)
    inner = round(size * scale)
    tile = SRC.resize((inner, inner), Image.LANCZOS)
    off = (size - inner) // 2
    img.alpha_composite(tile, (off, off))
    return img.convert("RGB")


def transparent(size, scale):
    img = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    inner = round(size * scale)
    off = (size - inner) // 2
    img.alpha_composite(SRC.resize((inner, inner), Image.LANCZOS), (off, off))
    return img


def splash(bg):
    img = Image.new("RGBA", (2732, 2732), bg)
    tile = SRC.resize((440, 440), Image.LANCZOS)
    img.alpha_composite(tile, ((2732 - 440) // 2, (2732 - 440) // 2))
    return img.convert("RGB")


public = os.path.join(APP, "public")
on_white(192).save(os.path.join(public, "icon-192.png"))
on_white(512).save(os.path.join(public, "icon-512.png"))
on_white(180).save(os.path.join(public, "apple-touch-icon.png"))
on_white(512, 0.72).save(os.path.join(public, "icon-maskable-512.png"))

# The Android app (@capacitor/assets, run by monitor-android.yml).
assets = os.path.join(APP, "assets")
os.makedirs(assets, exist_ok=True)
on_white(1024).save(os.path.join(assets, "icon-only.png"))
transparent(1024, 0.62).save(os.path.join(assets, "icon-foreground.png"))
Image.new("RGB", (1024, 1024), (255, 255, 255)).save(os.path.join(assets, "icon-background.png"))
splash((255, 255, 255, 255)).save(os.path.join(assets, "splash.png"))
splash((15, 17, 21, 255)).save(os.path.join(assets, "splash-dark.png"))
print("monitor icons written")
