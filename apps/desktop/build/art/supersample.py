"""Drawing at three times the size, so the edges come out smooth.

Pillow's drawing primitives do not anti-alias. Every circle, rounded corner
and diagonal it draws has hard stair-steps on it, and at 500 pixels wide that
is the single thing that made this artwork look like a sprite from an old
game rather than an illustration. No amount of better colour fixes it.

The fix is the oldest one there is: draw everything three times too big and
resample it down with a good filter, which turns each step into a gradient of
partial pixels. The scene code does not know it is happening -- it keeps
writing the coordinates it always wrote, and these two wrappers multiply
every one of them on the way through.

`SDraw` stands in for ImageDraw and scales coordinates, widths and font
sizes. `SImage` stands in for Image and scales paste positions, and resolves
down to the real size at the end.
"""
from PIL import Image, ImageDraw, ImageFont

SS = 3                      # how many times too big everything is drawn

_font_cache = {}


def set_scale(n):
    global SS
    SS = n


def s(v):
    """One number, scaled."""
    return v * SS


def sxy(xy):
    """A coordinate, a box, or a list of points -- scaled, whatever it is."""
    if xy is None:
        return None
    if isinstance(xy, (int, float)):
        return xy * SS
    out = []
    for v in xy:
        if isinstance(v, (tuple, list)):
            out.append(tuple(c * SS for c in v))
        else:
            out.append(v * SS)
    return out


def scaled_font(f):
    """The same typeface at the drawing size."""
    if f is None:
        return None
    key = (f.path, f.size)
    if key not in _font_cache:
        _font_cache[key] = ImageFont.truetype(f.path, max(1, round(f.size * SS)))
    return _font_cache[key]


class SDraw:
    """An ImageDraw that works in unscaled coordinates."""

    def __init__(self, img):
        self.d = ImageDraw.Draw(img.im if isinstance(img, SImage) else img)

    def _w(self, kw):
        if "width" in kw and kw["width"]:
            kw["width"] = max(1, round(kw["width"] * SS))
        if "radius" in kw and kw["radius"]:
            kw["radius"] = kw["radius"] * SS
        if "font" in kw:
            kw["font"] = scaled_font(kw["font"])
        if "spacing" in kw and kw["spacing"]:
            kw["spacing"] = kw["spacing"] * SS
        return kw

    def ellipse(self, xy, **kw):
        self.d.ellipse(sxy(xy), **self._w(kw))

    def rectangle(self, xy, **kw):
        self.d.rectangle(sxy(xy), **self._w(kw))

    def rounded_rectangle(self, xy, radius=0, **kw):
        self.d.rounded_rectangle(sxy(xy), radius * SS, **self._w(kw))

    def line(self, xy, **kw):
        self.d.line(sxy(xy), **self._w(kw))

    def polygon(self, xy, **kw):
        self.d.polygon(sxy(xy), **self._w(kw))

    def arc(self, xy, start, end, **kw):
        self.d.arc(sxy(xy), start, end, **self._w(kw))

    def text(self, xy, txt, **kw):
        self.d.text(sxy(xy), txt, **self._w(kw))

    def multiline_text(self, xy, txt, **kw):
        self.d.multiline_text(sxy(xy), txt, **self._w(kw))

    def textlength(self, txt, font=None, **kw):
        """Answered in UNSCALED pixels, because that is what callers measure in."""
        return self.d.textlength(txt, font=scaled_font(font), **kw) / SS


class SImage:
    """An image that is secretly three times too big."""

    def __init__(self, size, colour=(0, 0, 0, 0), mode="RGBA"):
        self.size = size
        self.im = Image.new(mode, (round(size[0] * SS), round(size[1] * SS)), colour)

    @classmethod
    def wrap(cls, im, size):
        out = cls.__new__(cls)
        out.size, out.im = size, im
        return out

    def alpha_composite(self, im, xy=(0, 0)):
        src = im.im if isinstance(im, SImage) else im
        self.im.alpha_composite(src, (round(xy[0] * SS), round(xy[1] * SS)))

    def paste(self, im, xy=(0, 0), mask=None):
        src = im.im if isinstance(im, SImage) else im
        self.im.paste(src, (round(xy[0] * SS), round(xy[1] * SS)), mask)

    def draw(self):
        return SDraw(self.im)

    def resolve(self, mode="RGB"):
        """Down to the real size, with a filter that makes the edges soft."""
        return self.im.resize(self.size, Image.LANCZOS).convert(mode)
