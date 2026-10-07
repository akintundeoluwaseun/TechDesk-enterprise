"""Painting helpers: gradients, glass, soft shadows, and the TechDesk helper.

Everything here draws at the supersampled size (see supersample.py) and hands
back an image the scene code pastes through SImage, which scales the position
for it. So a caller still says `mascot(118)` and `(6, 44)` and gets a figure
118 pixels tall in the finished picture, drawn three times that and resampled
down with smooth edges.

A note on the ground. The background is a VERTICAL ramp on purpose: each row
is close to one colour, which a run-length encoder stores in a few bytes. A
radial or diagonal ground looks no better and costs several times the size.
"""
import math

from PIL import Image, ImageDraw, ImageFilter

import supersample
from supersample import SS


def S(v):
    return max(1, round(v * supersample.SS))


def clamp01(v):
    return 0.0 if v < 0 else (1.0 if v > 1 else v)


def mix(a, b, t):
    t = clamp01(t)
    return tuple(round(a[i] + (b[i] - a[i]) * t) for i in range(3))


def vgradient(size, top, bottom, steps=None):
    """A vertical ramp, at drawing size. One flat row per step."""
    w, h = round(size[0] * supersample.SS), round(size[1] * supersample.SS)
    im = Image.new("RGB", (w, h), top)
    d = ImageDraw.Draw(im)
    steps = steps or h
    for i in range(steps):
        y0 = round(h * i / steps)
        y1 = round(h * (i + 1) / steps) + 1
        d.rectangle([0, y0, w, y1], fill=mix(top, bottom, i / max(1, steps - 1)))
    return im


def glow(img, centre, radius, colour, strength=0.5):
    """A soft bloom, blended in rather than added, so it never clips to white.

    `centre` and `radius` are in unscaled coordinates; the image is not.
    """
    cx, cy, r = S(centre[0]), S(centre[1]), S(radius)
    layer = Image.new("RGB", img.size, colour)
    mask = Image.new("L", img.size, 0)
    ImageDraw.Draw(mask).ellipse([cx - r, cy - r, cx + r, cy + r],
                                 fill=round(255 * strength))
    mask = mask.filter(ImageFilter.GaussianBlur(r * 0.45))
    return Image.composite(layer, img, mask)


def rounded(size, radius, fill):
    w, h = S(size[0]), S(size[1])
    im = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    ImageDraw.Draw(im).rounded_rectangle([0, 0, w - 1, h - 1], S(radius), fill=fill)
    return im


def glossy_card(size, radius, top, bottom, sheen=70, rim=None):
    """A rounded panel: a vertical ramp, a sheen over the top, a light rim.

    The rim is the part that reads as three-dimensional. A flat shape with a
    gradient still looks like a sticker; one pixel of brighter edge along the
    top makes it look lit from above.
    """
    w, h = S(size[0]), S(size[1])
    r = S(radius)
    body = vgradient(size, top, bottom).convert("RGBA")
    mask = Image.new("L", (w, h), 0)
    ImageDraw.Draw(mask).rounded_rectangle([0, 0, w - 1, h - 1], r, fill=255)
    body.putalpha(mask)

    gloss = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    ImageDraw.Draw(gloss).ellipse([-w * 0.3, -h * 0.95, w * 1.3, h * 0.55],
                                  fill=(255, 255, 255, sheen))
    gloss = gloss.filter(ImageFilter.GaussianBlur(S(1.2)))
    gloss.putalpha(Image.composite(gloss.getchannel("A"), Image.new("L", (w, h), 0), mask))
    out = Image.alpha_composite(body, gloss)

    edge = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    ImageDraw.Draw(edge).rounded_rectangle(
        [0, 0, w - 1, h - 1], r, outline=(rim or mix(top, (255, 255, 255), 0.55)) + (190,),
        width=max(1, S(0.7)))
    return Image.alpha_composite(out, edge)


def orb(size, colour, light=(255, 255, 255)):
    """A sphere: a ramp from rim to centre, with a highlight up and to the left."""
    if size < 1:
        return Image.new("RGBA", (1, 1), (0, 0, 0, 0))
    n = S(size)
    im = Image.new("RGBA", (n, n), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    rim = mix(colour, (0, 0, 0), 0.18)
    # Concentric rings from the rim colour to a lighter core: a cheap sphere.
    rings = max(6, n // 3)
    for i in range(rings):
        t = i / (rings - 1)
        inset = t * n * 0.42
        d.ellipse([inset, inset * 0.86, n - 1 - inset, n - 1 - inset * 1.14],
                  fill=mix(rim, mix(colour, light, 0.30), t) + (255,))
    hi = Image.new("RGBA", (n, n), (0, 0, 0, 0))
    ImageDraw.Draw(hi).ellipse([n * 0.20, n * 0.11, n * 0.60, n * 0.44],
                               fill=light + (165,))
    hi = hi.filter(ImageFilter.GaussianBlur(n * 0.07))
    hi.putalpha(Image.composite(
        hi.getchannel("A"),
        Image.new("L", (n, n), 0),
        Image.new("L", (n, n), 0) if False else _disc_mask(n)))
    return Image.alpha_composite(im, hi)


def _disc_mask(n):
    m = Image.new("L", (n, n), 0)
    ImageDraw.Draw(m).ellipse([0, 0, n - 1, n - 1], fill=255)
    return m


def drop_shadow(size, radius, blur=7, alpha=80, colour=(10, 32, 86)):
    """A blurred silhouette to put under a rounded box. Returns (image, pad)."""
    w, h, r = S(size[0]), S(size[1]), S(radius)
    pad = S(blur) * 3
    m = Image.new("L", (w + pad * 2, h + pad * 2), 0)
    ImageDraw.Draw(m).rounded_rectangle([pad, pad, pad + w, pad + h], r, fill=alpha)
    m = m.filter(ImageFilter.GaussianBlur(S(blur)))
    sh = Image.new("RGBA", m.size, colour + (0,))
    sh.putalpha(m)
    return sh, pad


# --------------------------------------------------------------------- Desky
#
# The assistant, drawn rather than hired. TechDesk's whole pitch is that you
# can talk to it, so the thing a shop meets first should have a face.

BODY_HI = (255, 255, 255)
BODY_LO = (196, 212, 238)
VISOR_HI = (58, 66, 112)
VISOR_LO = (22, 26, 52)


def mascot(h=120, bob=0.0, blink=0.0, look=0.0, arm=0.0, accent=(56, 189, 248)):
    """A character `h` pixels tall in the finished picture. Phases are 0..1."""
    u = h / 120.0                       # unscaled design unit
    W, H = 104 * u, h + 16 * u
    im = Image.new("RGBA", (S(W), S(H)), (0, 0, 0, 0))

    def P(x, y):
        return (round(x * u * supersample.SS), round(y * u * supersample.SS))

    dy = math.sin(bob * math.tau) * 4

    # The shadow it floats above, which is what sells the floating.
    squash = 1 - abs(math.sin(bob * math.tau)) * 0.16
    sh = Image.new("L", im.size, 0)
    ImageDraw.Draw(sh).ellipse(
        [S(W / 2 - 30 * u * squash), S(H - 14 * u),
         S(W / 2 + 30 * u * squash), S(H - 2 * u)], fill=86)
    im.paste(Image.new("RGB", im.size, (10, 34, 86)), (0, 0),
             sh.filter(ImageFilter.GaussianBlur(S(4 * u))))

    # Arms, behind the body, with a rim so they read against white.
    swing = math.sin(arm * math.tau) * 7
    for side in (-1, 1):
        a = glossy_card((16 * u, 30 * u), 8 * u, BODY_HI, BODY_LO, sheen=60,
                        rim=(170, 190, 224))
        im.alpha_composite(a, P(W / 2 / u + side * 34 - 8, 62 + dy + (swing if side > 0 else 0)))

    # Body and head, overlapping so they read as one object.
    im.alpha_composite(glossy_card((74 * u, 78 * u), 30 * u, BODY_HI, BODY_LO,
                                   sheen=96, rim=(206, 222, 246)),
                       P(W / 2 / u - 37, 34 + dy))
    im.alpha_composite(glossy_card((80 * u, 62 * u), 26 * u, BODY_HI, (216, 229, 248),
                                   sheen=118, rim=(212, 228, 250)),
                       P(W / 2 / u - 40, 6 + dy))

    # Visor.
    im.alpha_composite(glossy_card((62 * u, 36 * u), 17 * u, VISOR_HI, VISOR_LO,
                                   sheen=58, rim=(96, 108, 170)),
                       P(W / 2 / u - 31, 18 + dy))

    # Eyes: they slide a little with `look`, and close for `blink`.
    d = ImageDraw.Draw(im)
    ey = (18 + 18 + dy) * u
    er = 7 * u
    for side in (-1, 1):
        cx = (W / 2 / u + look * 6 + side * 13) * u
        if blink > 0.5:
            d.rounded_rectangle([S(cx - er), S(ey - 2 * u), S(cx + er), S(ey + 2 * u)],
                                S(2 * u), fill=(255, 255, 255, 255))
        else:
            e = orb(14 * u, (255, 255, 255), light=(255, 255, 255))
            im.alpha_composite(e, (S(cx - er), S(ey - er)))
            d.ellipse([S(cx - er * 0.42), S(ey - er * 0.72),
                       S(cx + er * 0.28), S(ey - er * 0.04)], fill=accent + (220,))

    # Aerial and bead.
    d.line([S(W / 2), S((6 + dy) * u - S(2) / supersample.SS),
            S(W / 2), S((6 + dy) * u - 13 * u)],
           fill=(206, 222, 246, 255), width=S(2.6 * u))
    bead = orb(11 * u, accent)
    im.alpha_composite(bead, (S(W / 2 - 5.5 * u), S((6 + dy) * u - 19 * u)))

    # A badge, so it belongs to us.
    badge = orb(22 * u, mix(accent, (255, 255, 255), 0.10))
    im.alpha_composite(badge, (S(W / 2 - 11 * u), S((34 + dy + 22) * u)))
    return im
