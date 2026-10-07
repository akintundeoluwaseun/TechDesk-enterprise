"""Writes the slides out as an uncompressed AVI.

NSIS cannot run a line of script while an install section is going, so a
timer that swaps bitmaps never fires -- the slideshow sat on slide one for
the whole install. Windows' own animation control (SysAnimate32) runs its
own thread and needs nobody's permission, so the slides become frames of a
silent AVI and the control plays them while NSIS gets on with the install.

That control reads only uncompressed or RLE AVI, which is why this writes
the oldest, plainest form there is: 24-bit bottom-up DIB frames, one stream,
no codec. It is verbose on disk and the installer's own compression takes
care of that.
"""
import struct


def _chunk(fourcc, payload):
    data = fourcc + struct.pack("<I", len(payload)) + payload
    return data + (b"\x00" if len(payload) % 2 else b"")


def write_avi(path, frames, seconds_per_frame=3.0):
    """frames: a list of same-sized PIL RGB images."""
    w, h = frames[0].size
    stride = (w * 3 + 3) & ~3          # DIB rows are padded to four bytes
    pad = stride - w * 3
    blobs = []
    for im in frames:
        if im.size != (w, h):
            raise ValueError("every frame must be the same size")
        rows = []
        px = im.convert("RGB").load()
        for y in range(h - 1, -1, -1):  # bottom-up, as a DIB is stored
            row = bytearray()
            for x in range(w):
                r, g, b = px[x, y]
                row += bytes((b, g, r))
            rows.append(bytes(row) + b"\x00" * pad)
        blobs.append(b"".join(rows))

    frame_bytes = stride * h
    micros = int(seconds_per_frame * 1_000_000)

    avih = struct.pack(
        "<IIIIIIIIII" + "I" * 4,
        micros, frame_bytes, 0, 0x10,   # AVIF_HASINDEX
        len(frames), 0, 1, frame_bytes,
        w, h, 0, 0, 0, 0,
    )
    strh = struct.pack(
        "<4s4sIHHIIIIIIIi" + "hhhh",
        b"vids", b"DIB ", 0, 0, 0, 0,
        micros, 1_000_000,              # scale / rate -> seconds per frame
        0, len(frames), frame_bytes, 0xFFFFFFFF, frame_bytes,
        0, 0, w, h,
    )
    strf = struct.pack("<IiiHHIIiiII", 40, w, h, 1, 24, 0, frame_bytes, 0, 0, 0, 0)

    strl = _chunk(b"LIST", b"strl" + _chunk(b"strh", strh) + _chunk(b"strf", strf))
    hdrl = _chunk(b"LIST", b"hdrl" + _chunk(b"avih", avih) + strl)

    movi_body, index, offset = b"", b"", 4   # offsets count from the 'movi' fourcc
    for blob in blobs:
        movi_body += _chunk(b"00db", blob)
        index += struct.pack("<4sIII", b"00db", 0x10, offset, len(blob))
        offset += 8 + len(blob) + (len(blob) % 2)
    movi = _chunk(b"LIST", b"movi" + movi_body)

    body = b"AVI " + hdrl + movi + _chunk(b"idx1", index)
    with open(path, "wb") as fh:
        fh.write(b"RIFF" + struct.pack("<I", len(body)) + body)
    return len(body) + 8
