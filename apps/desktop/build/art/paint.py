"""Painting helpers: gradients, glass, soft shadows, and the TechDesk helper.

This is the part that makes the installer look drawn rather than diagrammed.
The first attempt was flat dark panels and hairline icons -- correct, legible,
and about as inviting as a settings screen. What a shop should see is bright,
rounded, lit from somewhere, with a character in it.

Everything here is raster, in Pillow, because the installer can only play
bitmaps. The tricks are the usual ones: a vertical ramp for the ground, a
blurred black shape under everything that should sit above the page, a lighter
ellipse across the top of a round thing to make it read as glossy.

A note on the ground. The background is a VERTICAL ramp on purpose: each row
is close to one colour, so a run-length encoder stores a whole row in a few
bytes. A radial or diagonal ground looks no better and costs several times
the size, which is the whole budget for the animation.
"""
import math

from PIL import Image, ImageDraw, ImageFilter


def clamp01(v):
    return 0.0 if v < 0 else (1.0 if v > 1 else v)


def mix(a, b, t):
    t = clamp01(t)
    return tuple(round(a[i] + (b[i] - a[i]) * t) for i in range(3))


def vgradient(size, top, bottom, steps=None):
    """A vertical ramp. One flat row per step keeps the runs long."""
    w, h = size
    im = Image.new("RGB", size, top)
    d = ImageDraw.Draw(im)
    steps = steps or h
    for i in range(steps):
        y0 = round(h * i / steps)
        y1 = round(h * (i + 1) / steps)
        d.rectangle([0, y0, w, y1], fill=mix(top, bottom, i / max(1, steps - 1)))
    return im


def glow(img, centre, radius, colour, strength=0.5):
    """A soft bloom, blended in rather than added, so it never clips to white."""
    layer = Image.new("RGB", img.size, colour)
    mask = Image.new("L", img.size, 0)
    ImageDraw.Draw(mask).ellipse(
        [centre[0] - radius, centre[1] - radius, centre[0] + radius, centre[1] + radius],
        fill=round(255 * strength),
    )
    mask = mask.filter(ImageFilter.GaussianBlur(radius * 0.45))
    return Image.composite(layer, img, mask)


def shadow(size, shape, blur=8, offset=(0, 5), alpha=90):
    """A blurred black copy of a shape, to sit under it.

    `shape` draws the silhouette into an L mask handed to it.
    """
    pad = blur * 3
    m = Image.new("L", (size[0] + pad * 2, size[1] + pad * 2), 0)
    shape(ImageDraw.Draw(m), pad)
    m = m.filter(ImageFilter.GaussianBlur(blur)).point(lambda v: round(v * alpha / 255))
    return m, pad, offset


def paste_shadow(dst, size, shape, at, blur=8, offset=(0, 5), alpha=90):
    m, pad, off = shadow(size, shape, blur, offset, alpha)
    black = Image.new("RGB", m.size, (0, 0, 0))
    dst.paste(black, (at[0] - pad + off[0], at[1] - pad + off[1]), m)


def rounded(size, radius, fill):
    im = Image.new("RGBA", size, (0, 0, 0, 0))
    ImageDraw.Draw(im).rounded_rectangle([0, 0, size[0] - 1, size[1] - 1], radius, fill=fill)
    return im


def glossy_card(size, radius, top, bottom, sheen=70):
    """A rounded panel with a vertical ramp and a sheen across its top half."""
    body = vgradient(size, top, bottom).convert("RGBA")
    mask = Image.new("L", size, 0)
    ImageDraw.Draw(mask).rounded_rectangle([0, 0, size[0] - 1, size[1] - 1], radius, fill=255)
    body.putalpha(mask)

    gloss = Image.new("RGBA", size, (0, 0, 0, 0))
    ImageDraw.Draw(gloss).ellipse(
        [-size[0] * 0.3, -size[1] * 0.95, size[0] * 1.3, size[1] * 0.55],
        fill=(255, 255, 255, sheen),
    )
    gloss.putalpha(Image.composite(gloss.getchannel("A"), Image.new("L", size, 0), mask))
    return Image.alpha_composite(body, gloss)


def orb(size, colour, light=(255, 255, 255)):
    """A sphere: flat fill, a darker rim, and a highlight up and to the left.

    A size of zero or one is a thing that has not grown in yet, not an error,
    so it comes back as an empty image rather than throwing.
    """
    size = round(size)
    if size < 2:
        return Image.new("RGBA", (1, 1), (0, 0, 0, 0))
    im = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    d.ellipse([0, 0, size - 1, size - 1], fill=colour + (255,))
    d.ellipse([size * 0.12, size * 0.08, size * 0.95, size * 0.92],
              fill=mix(colour, light, 0.18) + (255,))
    hi = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    ImageDraw.Draw(hi).ellipse([size * 0.18, size * 0.10, size * 0.62, size * 0.46],
                               fill=light + (150,))
    hi = hi.filter(ImageFilter.GaussianBlur(size * 0.05))
    return Image.alpha_composite(im, hi)


# --------------------------------------------------------------------- Desky
#
# The assistant, drawn rather than hired. TechDesk's whole pitch is that you
# can talk to it, so the thing a shop meets first should have a face.
#
# Built from circles and rounded boxes with a highlight on each, which is all
# "3D" means at this size: white body, dark visor, two lights for eyes, and an
# aerial with a bead on the end that blinks in the brand colours.

VISOR = (24, 28, 54)
BODY_HI = (255, 255, 255)
BODY_LO = (206, 220, 240)


def mascot(h=120, bob=0.0, blink=0.0, look=0.0, arm=0.0, accent=(56, 189, 248)):
    """A character `h` pixels tall. All arguments are 0..1 animation phases."""
    s = h / 120.0
    W = round(104 * s)
    H = round(h)
    im = Image.new("RGBA", (W, H + round(16 * s)), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)

    def S(v):
        return round(v * s)

    dy = round(math.sin(bob * math.tau) * 4 * s)

    # The shadow it floats above, which is what sells the floating.
    sh = Image.new("L", im.size, 0)
    squash = 1 - abs(math.sin(bob * math.tau)) * 0.15
    ImageDraw.Draw(sh).ellipse(
        [W / 2 - S(30) * squash, H - S(4), W / 2 + S(30) * squash, H + S(10)], fill=70)
    im.paste(Image.new("RGB", im.size, (10, 30, 70)),
             (0, 0), sh.filter(ImageFilter.GaussianBlur(S(5))))

    # Arms, behind the body.
    swing = math.sin(arm * math.tau) * S(7)
    for side in (-1, 1):
        ax = W / 2 + side * S(34)
        ay = S(62) + dy + (swing if side > 0 else 0)
        a = rounded((S(16), S(30)), S(8), BODY_HI + (255,))
        im.alpha_composite(a, (round(ax - S(8)), round(ay)))

    # Body: a rounded capsule with a ramp down it.
    bw, bh = S(74), S(78)
    bx, by = round(W / 2 - bw / 2), round(S(34) + dy)
    im.alpha_composite(glossy_card((bw, bh), S(30), BODY_HI, BODY_LO, sheen=90), (bx, by))

    # Head, overlapping the body a little so they read as one object.
    hw, hh = S(80), S(62)
    hx, hy = round(W / 2 - hw / 2), round(S(6) + dy)
    im.alpha_composite(glossy_card((hw, hh), S(26), BODY_HI, (226, 236, 250), sheen=110), (hx, hy))

    # Visor.
    vw, vh = S(62), S(36)
    vx, vy = round(W / 2 - vw / 2), round(S(18) + dy)
    im.alpha_composite(glossy_card((vw, vh), S(17), (40, 46, 84), VISOR, sheen=55), (vx, vy))

    # Eyes. They slide a little with `look`, and close for `blink`.
    ex = W / 2 + look * S(6)
    ey = vy + vh / 2
    er = S(7)
    d2 = ImageDraw.Draw(im)
    for side in (-1, 1):
        cx = ex + side * S(13)
        if blink > 0.5:
            d2.rounded_rectangle([cx - er, ey - S(2), cx + er, ey + S(2)], S(2),
                                 fill=(255, 255, 255, 255))
        else:
            d2.ellipse([cx - er, ey - er, cx + er, ey + er], fill=(255, 255, 255, 255))
            d2.ellipse([cx - er * 0.4, ey - er * 0.7, cx + er * 0.25, ey - er * 0.05],
                       fill=accent + (210,))

    # Aerial.
    d2.line([W / 2, hy - S(2), W / 2, hy - S(13)], fill=BODY_LO + (255,), width=S(3))
    bead = orb(S(11), accent)
    im.alpha_composite(bead, (round(W / 2 - S(5.5)), round(hy - S(19))))

    # A badge, so it belongs to us.
    d2.ellipse([W / 2 - S(11), by + S(22), W / 2 + S(11), by + S(44)],
               fill=mix(accent, (255, 255, 255), 0.15) + (255,))
    return im
