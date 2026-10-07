"""The five scenes the install page plays, drawn frame by frame.

No screenshots. A screenshot of a dashboard at two hundred pixels wide is a
grey smudge, and it is wrong the week after the app changes. These are drawn
from what the app actually does: a voice becoming a sale, a receipt printing,
a repair moving along its track, stock running out, a shop still selling with
the cloud gone.

Each scene draws into its OWN panel-sized image, in that panel's coordinates,
and is composited through a rounded mask. Drawn straight onto the frame they
kept escaping -- a tick half off the bottom, a bar chart past the right edge
-- because every scene had to remember the panel's offset and none of them
did reliably. Here nothing can leave the panel even if the arithmetic is
wrong.

Everything sits on flat colour on purpose. Each frame is RLE-compressed on
its own and a run-length encoder pays by the colour change, so a smooth
gradient behind all this would cost twenty times what a flat field does, for
something nobody looks at.
"""
import math
import pathlib

from PIL import Image, ImageDraw, ImageFont

HERE = pathlib.Path(__file__).resolve().parent
FONT_DIR = pathlib.Path("/usr/share/fonts/truetype/liberation")

W, H = 450, 166
PANEL_BOX = (236, 8, 442, 158)          # where the scene panel sits in the frame
PW, PH = PANEL_BOX[2] - PANEL_BOX[0], PANEL_BOX[3] - PANEL_BOX[1]

BG = (10, 13, 24)
PANEL_BG = (14, 18, 33)
CARD = (22, 28, 50)
EDGE = (42, 50, 84)
WHITE = (255, 255, 255)
DIM = (150, 162, 194)
INDIGO = (99, 102, 241)
SKY = (56, 189, 248)
TEAL = (45, 212, 191)
AMBER = (251, 191, 36)
ROSE = (244, 114, 182)
GREEN = (52, 211, 153)

_logo_cache = {}


def font(size, bold=True):
    name = "LiberationSans-Bold.ttf" if bold else "LiberationSans-Regular.ttf"
    return ImageFont.truetype(str(FONT_DIR / name), size)


def ease(t):
    """Smooth in and out, so nothing starts or stops abruptly."""
    t = clamp01(t)
    return t * t * (3 - 2 * t)


def out_back(t):
    """Overshoots a little and settles. What makes a thing feel placed."""
    t = clamp01(t)
    c1, c3 = 1.70158, 2.70158
    return 1 + c3 * (t - 1) ** 3 + c1 * (t - 1) ** 2


def clamp01(v):
    return 0.0 if v < 0 else (1.0 if v > 1 else v)


def mix(a, b, t):
    t = clamp01(t)
    return tuple(round(a[i] + (b[i] - a[i]) * t) for i in range(3))


def logo(px):
    if px not in _logo_cache:
        im = Image.open(HERE.parent / "icon.png").convert("RGBA")
        _logo_cache[px] = im.resize((px, px), Image.LANCZOS)
    return _logo_cache[px]


# ------------------------------------------------------------------- scene 1
def scene_ask(d, im, t, accent):
    """A voice becoming a sale: the mic, the words, the receipt."""
    cx, cy = 62, 44
    for k in range(3):                     # rings breathing outward
        p = (t * 1.6 + k / 3.0) % 1.0
        r = 16 + p * 24
        d.ellipse([cx - r, cy - r, cx + r, cy + r], outline=mix(accent, PANEL_BG, p))
    d.ellipse([cx - 15, cy - 15, cx + 15, cy + 15], fill=accent)
    d.rounded_rectangle([cx - 4, cy - 9, cx + 4, cy + 2], 4, fill=WHITE)
    d.arc([cx - 8, cy - 6, cx + 8, cy + 7], 0, 180, fill=WHITE, width=2)
    d.line([cx, cy + 6, cx, cy + 10], fill=WHITE, width=2)

    for i in range(7):                     # bars moving with the voice
        x = 104 + i * 10
        a = math.sin(t * 9 + i * 0.9) * 0.5 + 0.5
        h = 4 + a * 22 * min(1.0, t * 3)
        d.rounded_rectangle([x, cy - h / 2, x + 4, cy + h / 2], 2, fill=mix(accent, SKY, i / 6))

    said = "Two screen guards, twelve five"
    n = int(clamp01((t - 0.10) * 2.2) * len(said))
    if n:
        f = font(10, bold=False)
        d.rounded_rectangle([10, 84, 196, 108], 8, fill=CARD, outline=EDGE)
        d.text((20, 90), said[:n], font=f, fill=WHITE)
        if n < len(said) and int(t * 10) % 2:
            cx2 = 20 + d.textlength(said[:n], font=f) + 2
            d.line([cx2, 90, cx2, 102], fill=accent)

    p = clamp01((t - 0.60) * 3.4)
    if p > 0:
        y = 116 + (1 - out_back(p)) * 16
        d.rounded_rectangle([10, y, 196, y + 26], 8, fill=(20, 44, 38), outline=GREEN)
        d.text((20, y + 8), "SALE", font=font(9), fill=GREEN)
        d.text((56, y + 7), "2 x Screen guard", font=font(10, bold=False), fill=WHITE)
        d.text((186, y + 7), "25,000", font=font(10), fill=WHITE, anchor="ra")


# ------------------------------------------------------------------- scene 2
def scene_sell(d, im, t, accent):
    """A receipt printing itself, line by line, and the total landing."""
    x0, x1, y0 = 14, 192, 10
    d.rounded_rectangle([x0, y0, x1, y0 + 94], 8, fill=CARD, outline=EDGE)
    d.text(((x0 + x1) / 2, y0 + 9), "BRIGHT TECH HUB", font=font(9), fill=WHITE, anchor="ma")
    d.line([x0 + 12, y0 + 25, x1 - 12, y0 + 25], fill=EDGE)

    for i, (name, amt) in enumerate(
            (("Screen guard x2", "25,000"), ("Phone case", "7,500"), ("Charger", "9,000"))):
        p = clamp01((t - 0.10 - i * 0.12) * 5)
        if p <= 0:
            continue
        y = y0 + 33 + i * 15
        d.text((x0 + 12, y), name, font=font(9, bold=False), fill=mix(CARD, DIM, p))
        d.text((x1 - 12, y), amt, font=font(9, bold=False), fill=mix(CARD, WHITE, p), anchor="ra")

    p = clamp01((t - 0.52) * 4)
    if p > 0:
        y = y0 + 80
        d.line([x0 + 12, y - 6, x1 - 12, y - 6], fill=mix(CARD, EDGE, p))
        d.text((x0 + 12, y), "TOTAL", font=font(10), fill=mix(CARD, WHITE, p))
        d.text((x1 - 12, y - 2), "41,500", font=font(12), fill=mix(CARD, accent, p), anchor="ra")

    p = clamp01((t - 0.74) * 4)            # paid, with a tick that draws itself
    if p > 0:
        cx, cy, r = 38, 126, 11
        d.ellipse([cx - r, cy - r, cx + r, cy + r], fill=mix(PANEL_BG, (20, 44, 38), p), outline=GREEN)
        if p > 0.30:
            d.line([cx - 5, cy, cx - 1, cy + 4], fill=GREEN, width=2)
        if p > 0.55:
            d.line([cx - 1, cy + 4, cx + 6, cy - 4], fill=GREEN, width=2)
        d.text((cx + 20, cy - 6), "Paid - cash", font=font(10), fill=mix(PANEL_BG, GREEN, p))


# ------------------------------------------------------------------- scene 3
def scene_repairs(d, im, t, accent):
    """One repair moving along its track, from booked to ready."""
    x0, x1, y = 26, 180, 40
    d.line([x0, y, x1, y], fill=EDGE, width=3)
    head = ease(clamp01((t - 0.06) * 1.5))
    d.line([x0, y, x0 + (x1 - x0) * head, y], fill=accent, width=3)

    for i, name in enumerate(("Booked", "In repair", "Ready")):
        cx = x0 + (x1 - x0) * i / 2
        lit = head >= i / 2 - 0.02
        c = accent if lit else EDGE
        d.ellipse([cx - 8, y - 8, cx + 8, y + 8], fill=PANEL_BG, outline=c, width=2)
        if lit:
            d.ellipse([cx - 4, y - 4, cx + 4, y + 4], fill=c)
        d.text((cx, y + 14), name, font=font(8, bold=False),
               fill=WHITE if lit else DIM, anchor="ma")

    gx = x0 + (x1 - x0) * head             # the glow travelling with it
    for r in (9, 6, 3):
        d.ellipse([gx - r, y - r, gx + r, y + r], outline=mix(accent, PANEL_BG, r / 12))

    p = clamp01((t - 0.60) * 3)
    if p > 0:
        yy = 84 + (1 - out_back(p)) * 14
        d.rounded_rectangle([12, yy, 194, yy + 42], 8, fill=CARD, outline=EDGE)
        d.text((22, yy + 9), "iPhone 11 - screen", font=font(10), fill=WHITE)
        d.text((22, yy + 24), "Ada Obi", font=font(9, bold=False), fill=DIM)
        d.rounded_rectangle([148, yy + 10, 184, yy + 25], 7, fill=(20, 44, 38))
        d.text((166, yy + 13), "READY", font=font(8), fill=GREEN, anchor="ma")


# ------------------------------------------------------------------- scene 4
def scene_stock(d, im, t, accent):
    """Stock as bars, with the one running out speaking up."""
    base, x0, bw, gap = 104, 20, 24, 12
    vals = (0.95, 0.62, 0.18, 0.78, 0.44)
    for i, v in enumerate(vals):
        p = ease((t - 0.06 - i * 0.07) * 3.2)
        h = 70 * v * p
        x = x0 + i * (bw + gap)
        c = AMBER if v < 0.25 else mix(INDIGO, SKY, i / 4)
        if h > 2:
            d.rounded_rectangle([x, base - h, x + bw, base], 4, fill=c)
        d.text((x + bw / 2, base + 6), "ABCDE"[i], font=font(8, bold=False), fill=DIM, anchor="ma")
    d.line([x0 - 8, base + 1, x0 + 5 * (bw + gap) - gap + 8, base + 1], fill=EDGE)

    p = clamp01((t - 0.55) * 3.2)          # the warning, arriving late
    if p > 0:
        lx, ly = 56, 24 + (1 - out_back(p)) * 10
        pulse = 0.6 + 0.4 * (math.sin(t * 10) * 0.5 + 0.5)
        d.rounded_rectangle([lx, ly, lx + 78, ly + 20], 9,
                            fill=(44, 34, 10), outline=mix(PANEL_BG, AMBER, pulse))
        d.text((lx + 39, ly + 5), "Low - 3 left", font=font(9), fill=AMBER, anchor="ma")
        d.polygon([(lx + 34, ly + 20), (lx + 44, ly + 20), (lx + 39, ly + 26)], fill=(44, 34, 10))

    d.text((100, 124), "Buy before it is gone", font=font(9, bold=False), fill=DIM, anchor="ma")


# ------------------------------------------------------------------- scene 5
def scene_offline(d, im, t, accent):
    """The cloud goes; the shop keeps selling."""
    cx, cy = 52, 46
    # Dimmed, not erased. Faded all the way out it left a pink line struck
    # through nothing, which reads as a drawing error rather than as "no
    # internet" -- the crossed-out thing has to still be there to be crossed.
    gone = clamp01((t - 0.10) * 2.6)
    cloud = mix(DIM, EDGE, gone)
    d.ellipse([cx - 24, cy - 8, cx + 0, cy + 14], outline=cloud, width=2)
    d.ellipse([cx - 10, cy - 18, cx + 20, cy + 12], outline=cloud, width=2)
    d.rectangle([cx - 18, cy + 4, cx + 14, cy + 13], fill=PANEL_BG)
    d.line([cx - 20, cy + 13, cx + 16, cy + 13], fill=cloud, width=2)
    n = clamp01((t - 0.12) * 4)
    if n > 0:
        d.line([cx - 26, cy - 22, cx - 26 + 56 * n, cy + 20 * n], fill=ROSE, width=3)

    p = clamp01((t - 0.32) * 2.6)          # the PC, which does not care
    if p > 0:
        bx, by = 110, 28
        # Thin rings rather than one fat circle: a single wide outline on a
        # dark ground reads as a grey smudge behind the screen.
        for k in range(3):
            q = (t * 1.1 + k / 3.0) % 1.0
            r = 30 + q * 22
            d.ellipse([bx + 31 - r, by + 21 - r, bx + 31 + r, by + 21 + r],
                      outline=mix(TEAL, PANEL_BG, 0.35 + q * 0.65))
        d.rounded_rectangle([bx, by, bx + 62, by + 42], 5,
                            fill=CARD, outline=mix(PANEL_BG, TEAL, p), width=2)
        d.rectangle([bx + 22, by + 42, bx + 40, by + 48], fill=mix(PANEL_BG, EDGE, p))
        d.rounded_rectangle([bx - 6, by + 48, bx + 68, by + 53], 3, fill=mix(PANEL_BG, EDGE, p))
        q = clamp01((t - 0.48) * 3)
        if q > 0.20:
            d.line([bx + 20, by + 21, bx + 28, by + 29], fill=GREEN, width=3)
        if q > 0.45:
            d.line([bx + 28, by + 29, bx + 44, by + 13], fill=GREEN, width=3)

    p = clamp01((t - 0.64) * 3)
    if p > 0:
        d.rounded_rectangle([12, 108, 194, 132], 8, fill=CARD, outline=EDGE)
        d.text((103, 114), "Still selling. Nothing lost.",
               font=font(10), fill=mix(CARD, WHITE, p), anchor="ma")


SCENES = (
    ("Just ask TechDesk", "Say it. It writes the sale.", INDIGO, scene_ask),
    ("Sell at the counter", "Ring it up, print, take part payment.", SKY, scene_sell),
    ("Every repair, tracked", "Who brought it, and when it is ready.", TEAL, scene_repairs),
    ("Know your stock", "What is low, before you run out.", AMBER, scene_stock),
    ("No internet? Fine.", "It all stays on this PC.", ROSE, scene_offline),
)


def render_panel(index, t):
    """One scene's panel, drawn in its own coordinates and masked to shape."""
    _, _, accent, draw_scene = SCENES[index]
    panel = Image.new("RGB", (PW, PH), PANEL_BG)
    draw_scene(ImageDraw.Draw(panel), panel, t, accent)
    mask = Image.new("L", (PW, PH), 0)
    ImageDraw.Draw(mask).rounded_rectangle([0, 0, PW - 1, PH - 1], 12, fill=255)
    return panel, mask
