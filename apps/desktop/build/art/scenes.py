"""The five scenes the install page plays, drawn frame by frame.

Bright, rounded and lit, with a character in it. The first version of this was
flat dark panels and hairline icons: perfectly legible, and about as inviting
as a settings screen. A shop installing something should be met by colour.

No screenshots. A dashboard at two hundred pixels wide is a grey smudge, and
it is wrong the week after the app changes. Everything here is drawn: Desky,
the assistant, and one glossy prop per scene for what that scene is about.

The ground is a VERTICAL ramp on purpose. Each frame is RLE-compressed on its
own and a run-length encoder stores a near-constant row in a few bytes, so a
vertical ramp is nearly free where a radial one costs several times the whole
animation's budget.
"""
import math
import pathlib

from PIL import Image, ImageDraw, ImageFilter, ImageFont

import paint
from paint import clamp01, glossy_card, glow, mascot, mix, orb, rounded, vgradient

HERE = pathlib.Path(__file__).resolve().parent
FONT_DIR = pathlib.Path("/usr/share/fonts/truetype/liberation")

W, H = 500, 228
PANEL_BOX = (210, 0, 500, 228)          # the half the drawing lives in
PW, PH = PANEL_BOX[2] - PANEL_BOX[0], PANEL_BOX[3] - PANEL_BOX[1]

WHITE = (255, 255, 255)
INK = (23, 37, 84)
GREEN = (34, 197, 94)
MINT = (134, 239, 172)
AMBER = (251, 191, 36)
ORANGE = (249, 115, 22)
ROSE = (244, 63, 94)
SKY = (56, 189, 248)
INDIGO = (99, 102, 241)
PAPER = (248, 250, 255)

_logo_cache = {}


def font(size, bold=True):
    name = "LiberationSans-Bold.ttf" if bold else "LiberationSans-Regular.ttf"
    return ImageFont.truetype(str(FONT_DIR / name), size)


def ease(t):
    t = clamp01(t)
    return t * t * (3 - 2 * t)


def out_back(t):
    t = clamp01(t)
    c1, c3 = 1.70158, 2.70158
    return 1 + c3 * (t - 1) ** 3 + c1 * (t - 1) ** 2


def logo(px):
    if px not in _logo_cache:
        im = Image.open(HERE.parent / "icon.png").convert("RGBA")
        _logo_cache[px] = im.resize((px, px), Image.LANCZOS)
    return _logo_cache[px]


def soft_drop(dst, box, radius, blur=7, alpha=70, offset=(0, 5)):
    """A blurred silhouette under a rounded box, so it lifts off the ground."""
    pad = blur * 3
    w, h = box[2] - box[0], box[3] - box[1]
    m = Image.new("L", (w + pad * 2, h + pad * 2), 0)
    ImageDraw.Draw(m).rounded_rectangle([pad, pad, pad + w, pad + h], radius, fill=alpha)
    m = m.filter(ImageFilter.GaussianBlur(blur))
    dst.paste(Image.new("RGB", m.size, (12, 40, 96)),
              (box[0] - pad + offset[0], box[1] - pad + offset[1]), m)


# ------------------------------------------------------------------- scene 1
def scene_ask(im, d, t, accent):
    """Desky listening: a speech bubble, a waveform, and a sale falling out."""
    bob = t
    bot = mascot(118, bob=bob, blink=1.0 if 0.42 < t < 0.5 else 0.0,
                 look=math.sin(t * 4) * 0.5, arm=t, accent=SKY)
    im.alpha_composite(bot, (6, 44))

    # The bubble it is listening into.
    p = ease(clamp01((t - 0.06) * 3))
    if p > 0:
        bw, bh = 120, 44
        bx, by = 104, round(26 + (1 - out_back(p)) * 10)
        soft_drop(im, (bx, by, bx + bw, by + bh), 14)
        im.alpha_composite(glossy_card((bw, bh), 14, WHITE, PAPER, sheen=0), (bx, by))
        d.polygon([(bx + 10, by + bh - 2), (bx + 30, by + bh - 2), (bx + 12, by + bh + 12)],
                  fill=PAPER)
        said = "Two screen guards,\ntwelve five"
        n = int(clamp01((t - 0.12) * 2.4) * len(said))
        d.multiline_text((bx + 14, by + 9), said[:n], font=font(11, bold=False),
                         fill=INK, spacing=4)

    # Bars, moving with the voice.
    for i in range(6):
        a = math.sin(t * 9 + i * 0.9) * 0.5 + 0.5
        hh = 6 + a * 26 * min(1.0, t * 3)
        x = 108 + i * 10
        d.rounded_rectangle([x, 92 - hh / 2, x + 5, 92 + hh / 2], 3,
                            fill=mix(WHITE, SKY, i / 5))

    # And the sale it became.
    p = ease(clamp01((t - 0.58) * 2.8))
    if p > 0:
        cw, ch = 180, 44
        cx, cy = 56, round(128 + (1 - out_back(p)) * 18)
        soft_drop(im, (cx, cy, cx + cw, cy + ch), 14)
        im.alpha_composite(glossy_card((cw, ch), 14, WHITE, PAPER, sheen=0), (cx, cy))
        tick = orb(24, GREEN)
        im.alpha_composite(tick, (cx + 10, cy + 10))
        d.line([cx + 16, cy + 22, cx + 21, cy + 27], fill=WHITE, width=3)
        d.line([cx + 21, cy + 27, cx + 28, cy + 17], fill=WHITE, width=3)
        d.text((cx + 44, cy + 9), "2 x Screen guard", font=font(11), fill=INK)
        d.text((cx + 44, cy + 24), "25,000  -  cash", font=font(10, bold=False),
               fill=(100, 116, 160))


# ------------------------------------------------------------------- scene 2
def scene_sell(im, d, t, accent):
    """A receipt printing itself, with Desky holding the counter."""
    bot = mascot(104, bob=t, blink=1.0 if 0.70 < t < 0.78 else 0.0, arm=t * 0.8, accent=SKY)
    im.alpha_composite(bot, (0, 66))

    rw, rh = 140, 150
    rx, ry = 96, 20
    soft_drop(im, (rx, ry, rx + rw, ry + rh), 16)
    im.alpha_composite(glossy_card((rw, rh), 16, WHITE, PAPER, sheen=0), (rx, ry))

    d.text((rx + rw / 2, ry + 14), "BRIGHT TECH HUB", font=font(10), fill=INK, anchor="ma")
    d.line([rx + 16, ry + 32, rx + rw - 16, ry + 32], fill=(214, 224, 244), width=2)

    for i, (name, amt) in enumerate(
            (("Screen guard x2", "25,000"), ("Phone case", "7,500"), ("Charger", "9,000"))):
        p = clamp01((t - 0.10 - i * 0.12) * 5)
        if p <= 0:
            continue
        y = ry + 44 + i * 19
        d.text((rx + 16, y), name, font=font(10, bold=False), fill=mix(PAPER, (90, 106, 150), p))
        d.text((rx + rw - 16, y), amt, font=font(10), fill=mix(PAPER, INK, p), anchor="ra")

    p = clamp01((t - 0.52) * 4)
    if p > 0:
        y = ry + 108
        d.line([rx + 16, y - 8, rx + rw - 16, y - 8], fill=mix(PAPER, (214, 224, 244), p), width=2)
        d.text((rx + 16, y), "TOTAL", font=font(11), fill=mix(PAPER, INK, p))
        d.text((rx + rw - 16, y - 3), "41,500", font=font(15),
               fill=mix(PAPER, (37, 99, 235), p), anchor="ra")

    p = ease(clamp01((t - 0.74) * 3.5))
    if p > 0:
        bw = 96
        bx, by = 140, round(ry + rh - 10 + (1 - out_back(p)) * 14)
        soft_drop(im, (bx, by, bx + bw, by + 30), 15, blur=6)
        im.alpha_composite(glossy_card((bw, 30), 15, MINT, GREEN, sheen=80), (bx, by))
        d.line([bx + 16, by + 15, bx + 21, by + 20], fill=WHITE, width=3)
        d.line([bx + 21, by + 20, bx + 29, by + 10], fill=WHITE, width=3)
        d.text((bx + 38, by + 8), "Paid", font=font(12), fill=WHITE)


# ------------------------------------------------------------------- scene 3
def scene_repairs(im, d, t, accent):
    """A phone on the bench, moving from booked to ready."""
    bot = mascot(100, bob=t, blink=1.0 if 0.30 < t < 0.37 else 0.0,
                 look=0.4, arm=t, accent=MINT)
    im.alpha_composite(bot, (0, 70))

    # The phone, with a crack that heals.
    pw, ph = 56, 100
    px, py = 208, 30
    soft_drop(im, (px, py, px + pw, py + ph), 12)
    im.alpha_composite(glossy_card((pw, ph), 12, (248, 250, 255), (214, 226, 246), sheen=70),
                       (px, py))
    im.alpha_composite(glossy_card((pw - 14, ph - 22), 7, (54, 70, 120), (26, 36, 72), sheen=40),
                       (px + 7, py + 11))
    healed = ease(clamp01((t - 0.15) * 1.6))
    if healed < 1:
        a = round(255 * (1 - healed))
        crack = [(px + 20, py + 18), (px + 34, py + 44), (px + 22, py + 56), (px + 40, py + 86)]
        d.line(crack, fill=(255, 255, 255, a) if a else None, width=2, joint="curve")
    if healed > 0.4:
        s = orb(round(26 * ease((healed - 0.4) / 0.6)), MINT)
        if s.width > 4:
            im.alpha_composite(s, (px + pw - 16, py + ph - 24))

    # The track.
    x0, x1, y = 92, 168, 44
    d.line([x0, y, x1, y], fill=(255, 255, 255, 90), width=4)
    head = ease(clamp01((t - 0.08) * 1.5))
    d.line([x0, y, x0 + (x1 - x0) * head, y], fill=WHITE, width=4)
    for i, name in enumerate(("Booked", "Repairing", "Ready")):
        cx = x0 + (x1 - x0) * i / 2
        lit = head >= i / 2 - 0.02
        k = orb(16 if lit else 12, MINT if lit else (150, 190, 240))
        im.alpha_composite(k, (round(cx - k.width / 2), round(y - k.height / 2)))
        d.text((cx, y + 13), name, font=font(8, bold=False),
               fill=WHITE if lit else (190, 214, 245), anchor="ma")

    p = ease(clamp01((t - 0.58) * 3))
    if p > 0:
        cw, ch = 184, 44
        cx, cy = 86, round(162 + (1 - out_back(p)) * 16)
        soft_drop(im, (cx, cy, cx + cw, cy + ch), 14)
        im.alpha_composite(glossy_card((cw, ch), 14, WHITE, PAPER, sheen=0), (cx, cy))
        d.text((cx + 12, cy + 9), "iPhone 11", font=font(11), fill=INK)
        d.text((cx + 12, cy + 24), "Ada Obi", font=font(10, bold=False), fill=(100, 116, 160))
        d.rounded_rectangle([cx + 124, cy + 12, cx + 168, cy + 30], 9, fill=GREEN)
        d.text((cx + 146, cy + 16), "READY", font=font(8), fill=WHITE, anchor="ma")


# ------------------------------------------------------------------- scene 4
def scene_stock(im, d, t, accent):
    """Boxes on the shelf, and the one that is running out."""
    bot = mascot(100, bob=t, blink=1.0 if 0.55 < t < 0.62 else 0.0,
                 look=-0.4, arm=t * 1.2, accent=AMBER)
    im.alpha_composite(bot, (0, 70))

    base = 150
    for i, v in enumerate((0.95, 0.62, 0.22, 0.80)):
        p = ease(clamp01((t - 0.06 - i * 0.08) * 3))
        hh = round(86 * v * p)
        if hh < 6:
            continue
        bw = 32
        x = 96 + i * 44
        low = v < 0.3
        top = AMBER if low else (191, 219, 254)
        bot_c = ORANGE if low else (96, 165, 250)
        soft_drop(im, (x, base - hh, x + bw, base), 8, blur=6)
        im.alpha_composite(glossy_card((bw, hh), 8, top, bot_c, sheen=90), (x, base - hh))
        # A lid line, so it reads as a box rather than a bar.
        if hh > 18:
            d.line([x + 5, base - hh + 11, x + bw - 5, base - hh + 11],
                   fill=mix(top, WHITE, 0.5), width=2)

    d.rounded_rectangle([90, base + 2, 268, base + 8], 3, fill=(255, 255, 255, 120))

    p = ease(clamp01((t - 0.52) * 3))
    if p > 0:
        lw = 100
        lx, ly = 150, round(28 + (1 - out_back(p)) * 12)
        soft_drop(im, (lx, ly, lx + lw, ly + 32), 16, blur=6)
        im.alpha_composite(glossy_card((lw, 32), 16, (254, 240, 138), AMBER, sheen=90), (lx, ly))
        d.text((lx + lw / 2, ly + 9), "Only 3 left", font=font(11), fill=(120, 53, 15),
               anchor="ma")
        d.polygon([(lx + 40, ly + 32), (lx + 56, ly + 32), (lx + 48, ly + 42)], fill=AMBER)


# ------------------------------------------------------------------- scene 5
def scene_offline(im, d, t, accent):
    """The shield: the cloud goes, the shop keeps selling."""
    bot = mascot(100, bob=t, blink=1.0 if 0.20 < t < 0.27 else 0.0, arm=t, accent=MINT)
    im.alpha_composite(bot, (0, 70))

    # The cloud, dimming and struck through.
    gone = clamp01((t - 0.08) * 2.4)
    cc = mix(WHITE, (120, 170, 230), gone)
    cx, cy = 116, 54
    d.ellipse([cx - 24, cy - 8, cx + 4, cy + 16], fill=cc)
    d.ellipse([cx - 8, cy - 20, cx + 26, cy + 14], fill=cc)
    d.rounded_rectangle([cx - 22, cy + 2, cx + 24, cy + 16], 7, fill=cc)
    n = clamp01((t - 0.10) * 3.5)
    if n > 0:
        d.line([cx - 30, cy - 24, cx - 30 + 64 * n, cy + 24 * n], fill=ROSE, width=5)

    # The shield, which is the point of the scene.
    p = ease(clamp01((t - 0.26) * 2.2))
    if p > 0:
        sw = round(104 * out_back(clamp01((t - 0.26) * 2.2)))
        if sw > 10:
            sh = round(sw * 1.12)
            sx, sy = round(210 - sw / 2), round(104 - sh / 2)
            shield = Image.new("RGBA", (sw, sh), (0, 0, 0, 0))
            sd = ImageDraw.Draw(shield)
            body = [(sw / 2, 0), (sw - 1, sw * 0.20), (sw - 1, sh * 0.55),
                    (sw / 2, sh - 1), (0, sh * 0.55), (0, sw * 0.20)]
            sd.polygon(body, fill=GREEN + (255,))
            inner = Image.new("RGBA", (sw, sh), (0, 0, 0, 0))
            ImageDraw.Draw(inner).polygon(
                [(sw / 2, 4), (sw - 5, sw * 0.22), (sw - 5, sh * 0.54),
                 (sw / 2, sh - 6), (5, sh * 0.54), (5, sw * 0.22)],
                fill=MINT + (255,))
            shield = Image.alpha_composite(shield, inner)
            sheen = Image.new("RGBA", (sw, sh), (0, 0, 0, 0))
            ImageDraw.Draw(sheen).ellipse([-sw * 0.3, -sh * 0.8, sw * 1.3, sh * 0.42],
                                          fill=(255, 255, 255, 80))
            shield = Image.alpha_composite(shield, Image.composite(
                sheen, Image.new("RGBA", (sw, sh), (0, 0, 0, 0)), shield.getchannel("A")))
            im.alpha_composite(shield, (sx, sy))

            q = clamp01((t - 0.44) * 3)
            if q > 0.2:
                d.line([sx + sw * 0.30, sy + sh * 0.50, sx + sw * 0.45, sy + sh * 0.65],
                       fill=(255, 255, 255), width=7)
            if q > 0.45:
                d.line([sx + sw * 0.45, sy + sh * 0.65, sx + sw * 0.72, sy + sh * 0.34],
                       fill=(255, 255, 255), width=7)

    p = ease(clamp01((t - 0.62) * 3))
    if p > 0:
        bw2 = 190
        bx, by = 80, round(170 + (1 - out_back(p)) * 14)
        soft_drop(im, (bx, by, bx + bw2, by + 32), 16, blur=6)
        im.alpha_composite(glossy_card((bw2, 32), 16, WHITE, PAPER, sheen=0), (bx, by))
        d.text((bx + bw2 / 2, by + 9), "Still selling. Nothing lost.",
               font=font(11), fill=INK, anchor="ma")


# Headline, sub-head, the ground's two colours, and the drawing.
SCENES = (
    ("Just ask TechDesk", "Say it. It writes the sale.",
     ((56, 132, 255), (21, 64, 196)), scene_ask),
    ("Sell at the counter", "Ring it up, print, take part payment.",
     ((34, 160, 245), (12, 84, 190)), scene_sell),
    ("Every repair, tracked", "Who brought it, and when it is ready.",
     ((16, 160, 170), (10, 86, 140)), scene_repairs),
    ("Know your stock", "What is low, before you run out.",
     ((245, 140, 40), (190, 68, 30)), scene_stock),
    ("No internet? Fine.", "It all stays on this PC.",
     ((102, 96, 230), (56, 42, 150)), scene_offline),
)


def render_panel(index, t):
    """One scene's drawing, in its own image so nothing can leave its half."""
    _, _, (top, _), draw_scene = SCENES[index]
    panel = Image.new("RGBA", (PW, PH), (0, 0, 0, 0))
    draw_scene(panel, ImageDraw.Draw(panel), t, top)
    return panel
