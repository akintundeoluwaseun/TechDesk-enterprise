"""Writes an animation as an RLE8 AVI -- the format the install page plays.

Windows' animation control reads uncompressed or RLE AVI and nothing else.
Uncompressed is simple and enormous: a hundred and ten frames of 450x166 is
twenty-three megabytes at three bytes a pixel, which is not something to keep
in a git repository and not something to unpack into a temporary folder
before a shop sees its first window. BI_RLE8 is the other half of that
sentence, it is from 1990, and on artwork made of flat colour and crisp edges
it costs about a thirtieth of that.

Only the encoded and absolute runs are used, not the delta jumps: every frame
stands alone, which costs a little size and removes a class of bug where one
bad frame corrupts the rest of the animation.
"""
import struct


def _encode_row(row):
    """One row of palette indices -> BI_RLE8, without the end-of-line marker."""
    out = bytearray()
    i, n = 0, len(row)
    while i < n:
        run = 1
        while i + run < n and row[i + run] == row[i] and run < 255:
            run += 1
        if run >= 3:
            out += bytes((run, row[i]))
            i += run
            continue
        # Not worth a run: gather literals until a run of three shows up.
        start = i
        while i < n and i - start < 255:
            if i + 2 < n and row[i] == row[i + 1] == row[i + 2]:
                break
            i += 1
        lit = row[start:i]
        if len(lit) < 3:
            # Absolute mode needs three or more, so spend short runs instead.
            for v in lit:
                out += bytes((1, v))
        else:
            out += bytes((0, len(lit))) + bytes(lit)
            if len(lit) % 2:
                out += b"\x00"
    return out


def encode_frame(indices, w, h):
    """A frame of palette indices (top-down rows) -> one BI_RLE8 chunk."""
    out = bytearray()
    for y in range(h - 1, -1, -1):          # a DIB is stored bottom-up
        out += _encode_row(indices[y * w:(y + 1) * w])
        out += b"\x00\x00"                  # end of line
    out += b"\x00\x01"                      # end of bitmap
    return bytes(out)


def decode_frame(data, w, h):
    """The inverse, used by the generator to prove the encoder is lossless."""
    out = [[0] * w for _ in range(h)]
    i, x, y = 0, 0, h - 1
    while i < len(data) - 1:
        a, b = data[i], data[i + 1]
        i += 2
        if a:
            for _ in range(a):
                if x < w:
                    out[y][x] = b
                    x += 1
        elif b == 0:
            x, y = 0, y - 1
        elif b == 1:
            break
        elif b == 2:
            x += data[i]
            y -= data[i + 1]
            i += 2
        else:
            for k in range(b):
                if x < w:
                    out[y][x] = data[i + k]
                    x += 1
            i += b + (b % 2)
    return bytes(v for row in out for v in row)


def _chunk(fourcc, payload):
    data = fourcc + struct.pack("<I", len(payload)) + payload
    return data + (b"\x00" if len(payload) % 2 else b"")


def write_avi(path, frames, palette, size, fps=10):
    """frames: encoded BI_RLE8 chunks. palette: 768 bytes of RGB triplets."""
    w, h = size
    micros = int(round(1_000_000 / fps))
    biggest = max(len(f) for f in frames)

    avih = struct.pack(
        "<IIIIIIIIII" + "I" * 4,
        micros, biggest * fps, 0, 0x10,     # AVIF_HASINDEX
        len(frames), 0, 1, biggest, w, h, 0, 0, 0, 0,
    )
    strh = struct.pack(
        "<4s4sIHHIIIIIIIi" + "hhhh",
        b"vids", b"MRLE", 0, 0, 0, 0,
        1, fps,                             # scale / rate
        0, len(frames), biggest, 0xFFFFFFFF, 0,
        0, 0, w, h,
    )
    bih = struct.pack("<IiiHHIIiiII", 40, w, h, 1, 8, 1, 0, 0, 0, 256, 256)  # 1 = BI_RLE8
    table = b"".join(
        bytes((palette[i * 3 + 2], palette[i * 3 + 1], palette[i * 3], 0)) for i in range(256)
    )

    strl = _chunk(b"LIST", b"strl" + _chunk(b"strh", strh) + _chunk(b"strf", bih + table))
    hdrl = _chunk(b"LIST", b"hdrl" + _chunk(b"avih", avih) + strl)

    movi_body, index, offset = b"", b"", 4  # offsets count from the 'movi' fourcc
    for f in frames:
        movi_body += _chunk(b"00dc", f)
        index += struct.pack("<4sIII", b"00dc", 0x10, offset, len(f))
        offset += 8 + len(f) + (len(f) % 2)
    movi = _chunk(b"LIST", b"movi" + movi_body)

    body = b"AVI " + hdrl + movi + _chunk(b"idx1", index)
    with open(path, "wb") as fh:
        fh.write(b"RIFF" + struct.pack("<I", len(body)) + body)
    return len(body) + 8
