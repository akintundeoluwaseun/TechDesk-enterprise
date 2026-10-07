"""Writes the animation out as an uncompressed true-colour AVI.

Windows' animation control reads uncompressed or RLE AVI and nothing else,
so this writes the oldest, plainest form there is: 24-bit bottom-up DIB
frames, one stream, no codec.

WHY NOT RLE. The obvious saving is BI_RLE8 -- 256 colours, and this artwork
compressed to under a megabyte that way. It was built, it round-tripped
exactly, and it played. It also banded every gradient into visible stripes,
which on bright illustration is most of what made it look cheap.

The saving turned out to be imaginary anyway: inside the installer, LZMA
compresses twenty megabytes of near-identical true-colour frames to about
0.2 MB, against 0.15 MB for the RLE version. Fifty kilobytes is not worth
banding. What the size does cost is a file too big to keep in a git
repository, which is why build/slides.avi is generated at build time rather
than committed.
"""
import struct

from PIL import Image


def _chunk(fourcc, payload):
    data = fourcc + struct.pack("<I", len(payload)) + payload
    return data + (b"\x00" if len(payload) % 2 else b"")


def write_avi(path, frames, fps=10):
    """frames: a list of same-sized PIL RGB images."""
    w, h = frames[0].size
    stride = (w * 3 + 3) & ~3          # DIB rows are padded to four bytes
    pad = b"\x00" * (stride - w * 3)

    blobs = []
    for im in frames:
        if im.size != (w, h):
            raise ValueError("every frame must be the same size")
        # One conversion for the whole frame rather than a Python loop over
        # half a million pixels: Pillow writes BGR itself for the "BGR" raw
        # mode, and the rows come out bottom-up because a DIB is stored that
        # way.
        flipped = im.convert("RGB").transpose(Image.FLIP_TOP_BOTTOM)
        raw = flipped.tobytes("raw", "BGR")
        line = w * 3
        blobs.append(b"".join(raw[y * line:(y + 1) * line] + pad for y in range(h)))

    frame_bytes = stride * h
    micros = int(round(1_000_000 / fps))

    avih = struct.pack(
        "<IIIIIIIIII" + "I" * 4,
        micros, frame_bytes * fps, 0, 0x10,   # AVIF_HASINDEX
        len(frames), 0, 1, frame_bytes, w, h, 0, 0, 0, 0,
    )
    strh = struct.pack(
        "<4s4sIHHIIIIIIIi" + "hhhh",
        b"vids", b"DIB ", 0, 0, 0, 0,
        1, fps,                              # scale / rate
        0, len(frames), frame_bytes, 0xFFFFFFFF, frame_bytes,
        0, 0, w, h,
    )
    strf = struct.pack("<IiiHHIIiiII", 40, w, h, 1, 24, 0, frame_bytes, 0, 0, 0, 0)

    strl = _chunk(b"LIST", b"strl" + _chunk(b"strh", strh) + _chunk(b"strf", strf))
    hdrl = _chunk(b"LIST", b"hdrl" + _chunk(b"avih", avih) + strl)

    movi_body, index, offset = b"", b"", 4   # offsets count from the 'movi' fourcc
    parts = []
    for blob in blobs:
        parts.append(_chunk(b"00db", blob))
        index += struct.pack("<4sIII", b"00db", 0x10, offset, len(blob))
        offset += 8 + len(blob) + (len(blob) % 2)
    movi = _chunk(b"LIST", b"movi" + b"".join(parts))

    body = b"AVI " + hdrl + movi + _chunk(b"idx1", index)
    with open(path, "wb") as fh:
        fh.write(b"RIFF" + struct.pack("<I", len(body)) + body)
    return len(body) + 8
