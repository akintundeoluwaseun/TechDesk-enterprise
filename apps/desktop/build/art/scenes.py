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
import supersample
from paint import clamp01, glossy_card, glow, mascot, mix, orb, rounded, vgradient
from supersample import SDraw, SImage

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
    """The mark, at drawing size, so it lands on a supersampled canvas."""
    n = round(px * supersample.SS)
    if n not in _logo_cache:
        im = Image.open(HERE.parent / "icon.png").convert("RGBA")
        _logo_cache[n] = im.resize((n, n), Image.LANCZOS)
    return _logo_cache[n]


def soft_drop(dst, box, radius, blur=7, alpha=80, offset=(0, 5)):
    """A blurred silhouette under a rounded box, so it lifts off the ground."""
    w, h = box[2] - box[0], box[3] - box[1]
    sh, pad = paint.drop_shadow((w, h), radius, blur=blur, alpha=alpha)
    pad_u = pad / supersample.SS
    dst.alpha_composite(sh, (box[0] - pad_u + offset[0], box[1] - pad_u + offset[1]))


# ------------------------------------------------------------------- scene 1
def scene_ask(im, d, t, accent):
    """Desky listening: a speech bubble, a waveform, and a sale falling out."""
    bob = t
    reach = ease(clamp01(t * 4)) * 0.92
    bot = mascot(118, bob=bob, blink=1.0 if 0.42 < t < 0.5 else 0.0,
                 look=math.sin(t * 4) * 0.5, arm=t, reach=reach, accent=SKY)
    im.alpha_composite(bot, (2, 44))
    hx, hy = paint.hand(118, bob, reach)
    im.alpha_composite(_mic(), (2 + hx - 10, 44 + hy - 30))

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
    # Its hand comes up to the receipt's edge, so it is holding the thing the
    # scene is about rather than floating beside it.
    reach = ease(clamp01((t - 0.05) * 3)) * 0.88
    bot = mascot(104, bob=t, blink=1.0 if 0.70 < t < 0.78 else 0.0, arm=t * 0.8,
                 reach=reach, accent=SKY)
    im.alpha_composite(bot, (0, 62))

    rw, rh = 142, 150
    rx, ry = 88, 20
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
    reach = ease(clamp01((t - 0.04) * 3)) * 0.92
    bot = mascot(100, bob=t, blink=1.0 if 0.30 < t < 0.37 else 0.0,
                 look=0.4, arm=t, reach=reach, accent=MINT)
    im.alpha_composite(bot, (0, 70))
    hx, hy = paint.hand(100, t, reach)
    w = _wrench(-24 + math.sin(t * math.tau * 2) * 12)
    im.alpha_composite(w, (hx - w.width / supersample.SS / 2,
                           70 + hy - w.height / supersample.SS / 2))

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
        d_ = 26 * ease((healed - 0.4) / 0.6)
        if d_ > 4:
            im.alpha_composite(orb(d_, MINT), (px + pw - 16, py + ph - 24))

    # The track.
    x0, x1, y = 92, 168, 44
    d.line([x0, y, x1, y], fill=(255, 255, 255, 90), width=4)
    head = ease(clamp01((t - 0.08) * 1.5))
    d.line([x0, y, x0 + (x1 - x0) * head, y], fill=WHITE, width=4)
    for i, name in enumerate(("Booked", "Repairing", "Ready")):
        cx = x0 + (x1 - x0) * i / 2
        lit = head >= i / 2 - 0.02
        kd = 16 if lit else 12
        im.alpha_composite(orb(kd, MINT if lit else (150, 190, 240)),
                           (cx - kd / 2, y - kd / 2))
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
    reach = 0.42 + math.sin(t * math.tau) * 0.06
    bot = mascot(100, bob=t, blink=1.0 if 0.55 < t < 0.62 else 0.0,
                 look=-0.4, arm=t * 1.2, reach=reach, accent=AMBER)
    im.alpha_composite(bot, (0, 70))
    hx, hy = paint.hand(100, t, reach)
    im.alpha_composite(_box(), (hx - 8, 70 + hy - 20))

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
    reach = ease(clamp01((t - 0.24) * 2.4)) * 0.95
    bot = mascot(100, bob=t, blink=1.0 if 0.20 < t < 0.27 else 0.0, arm=t,
                 reach=reach, accent=MINT)
    im.alpha_composite(bot, (0, 70))

    # The cloud, dimming and struck through.
    gone = clamp01((t - 0.08) * 2.4)
    cc = mix(WHITE, (120, 170, 230), gone)
    cx, cy = 206, 42
    d.ellipse([cx - 24, cy - 8, cx + 4, cy + 16], fill=cc)
    d.ellipse([cx - 8, cy - 20, cx + 26, cy + 14], fill=cc)
    d.rounded_rectangle([cx - 22, cy + 2, cx + 24, cy + 16], 7, fill=cc)
    n = clamp01((t - 0.10) * 3.5)
    if n > 0:
        d.line([cx - 28, cy - 22, cx - 28 + 58 * n, cy + 22 * n], fill=ROSE, width=5)

    # The shield, which is the point of the scene.
    p = ease(clamp01((t - 0.26) * 2.2))
    if p > 0:
        sw = round(104 * out_back(clamp01((t - 0.26) * 2.2)))
        if sw > 10:
            sh = round(sw * 1.12)
            sx, sy = round(138 - sw / 2), round(96 - sh / 2)
            shield = _shield(sw, sh)
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


def _mic():
    """A stick microphone, for the scene about talking to it.

    Dark, because the hand holding it is white and the body behind it is
    white: a pale mic in that gap is a smudge, not an object.
    """
    im = SImage((20, 38))
    d = im.draw()
    im.alpha_composite(glossy_card((16, 23), 8, (72, 86, 136), (30, 38, 74),
                                   sheen=80, rim=(130, 150, 206)), (2, 0))
    for i in range(3):                       # the grille
        d.line([5, 7 + i * 4, 15, 7 + i * 4], fill=(150, 170, 220), width=1)
    d.rounded_rectangle([8, 21, 12, 33], 2, fill=(96, 112, 160))
    d.rounded_rectangle([4, 32, 16, 37], 2, fill=(60, 74, 118))
    return im


def _wrench(angle=0.0):
    """A spanner, for the scene about repairs.

    Returned at drawing size and already turned, because rotating it after
    it has been shrunk is what puts stair-steps back on an edge the whole
    supersampling exercise was meant to smooth.
    """
    im = SImage((22, 42))
    d = im.draw()
    d.rounded_rectangle([8, 9, 14, 40], 3, fill=(206, 220, 244))
    d.rounded_rectangle([8.6, 10, 11, 39], 1.5, fill=(246, 250, 255))
    d.ellipse([3, 0, 19, 17], fill=(206, 220, 244))
    # The jaw, cut straight out of the head so whatever is behind shows.
    d.ellipse([7, 3, 15, 13], fill=(0, 0, 0, 0))
    d.polygon([(7, 0), (15, 0), (15, 6), (7, 6)], fill=(0, 0, 0, 0))
    return im.im.rotate(angle, resample=Image.BICUBIC, expand=True)


def _box(w=36, h=30):
    """A carton, for the scene about stock."""
    im = SImage((w, h))
    d = im.draw()
    im.alpha_composite(glossy_card((w, h), 4, (253, 206, 128), (226, 145, 56),
                                   sheen=70, rim=(255, 226, 170)), (0, 0))
    d.line([2, h * 0.3, w - 2, h * 0.3], fill=(255, 232, 186), width=2)
    d.line([w / 2, 0, w / 2, h * 0.3], fill=(255, 232, 186), width=2)
    return im


def _shield(w, h):
    """A rounded shield, drawn at the canvas's real size and lit from above."""
    W_, H_ = paint.S(w), paint.S(h)
    body = [(W_ / 2, 0), (W_ - 1, W_ * 0.20), (W_ - 1, H_ * 0.55),
            (W_ / 2, H_ - 1), (0, H_ * 0.55), (0, W_ * 0.20)]
    im = Image.new("RGBA", (W_, H_), (0, 0, 0, 0))
    ImageDraw.Draw(im).polygon(body, fill=GREEN + (255,))

    inner = Image.new("RGBA", (W_, H_), (0, 0, 0, 0))
    ImageDraw.Draw(inner).polygon(
        [(W_ / 2, H_ * 0.03), (W_ * 0.95, W_ * 0.23), (W_ * 0.95, H_ * 0.54),
         (W_ / 2, H_ * 0.94), (W_ * 0.05, H_ * 0.54), (W_ * 0.05, W_ * 0.23)],
        fill=MINT + (255,))
    im = Image.alpha_composite(im, inner)

    sheen = Image.new("RGBA", (W_, H_), (0, 0, 0, 0))
    ImageDraw.Draw(sheen).ellipse([-W_ * 0.3, -H_ * 0.8, W_ * 1.3, H_ * 0.42],
                                  fill=(255, 255, 255, 90))
    sheen = sheen.filter(ImageFilter.GaussianBlur(paint.S(1.5)))
    return Image.alpha_composite(im, Image.composite(
        sheen, Image.new("RGBA", (W_, H_), (0, 0, 0, 0)), im.getchannel("A")))


def render_panel(index, t):
    """One scene's drawing, in its own image so nothing can leave its half.

    The image is secretly three times the size it says it is -- see
    supersample.py -- which is what gives every curve in here a smooth edge
    instead of a staircase. The scene code is written in ordinary
    coordinates and never has to know.
    """
    _, _, (top, _), draw_scene = SCENES[index]
    panel = SImage((PW, PH))
    draw_scene(panel, panel.draw(), t, top)
    return panel
