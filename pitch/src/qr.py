# Minimal QR encoder (byte mode, ECC level M, versions 1-6), no external packages.
# Follows the structure of Project Nayuki's QR Code generator. Usage: python3 qr.py "text" out.png
import sys
from PIL import Image

TABLE = {1: (26, 10, 1), 2: (44, 16, 1), 3: (70, 26, 1), 4: (100, 18, 2), 5: (134, 24, 2), 6: (172, 16, 4)}  # total, ecc/block, blocks
ALIGN = {1: [], 2: [6, 18], 3: [6, 22], 4: [6, 26], 5: [6, 30], 6: [6, 34]}


def gf_mul(x, y):
    z = 0
    for i in range(7, -1, -1):
        z = (z << 1) ^ ((z >> 7) * 0x11D)
        z ^= ((y >> i) & 1) * x
    return z


def rs_divisor(degree):
    res = [0] * (degree - 1) + [1]
    root = 1
    for _ in range(degree):
        for j in range(len(res)):
            res[j] = gf_mul(res[j], root)
            if j + 1 < len(res):
                res[j] ^= res[j + 1]
        root = gf_mul(root, 0x02)
    return res


def rs_remainder(data, div):
    res = [0] * len(div)
    for b in data:
        f = b ^ res.pop(0)
        res.append(0)
        for i, c in enumerate(div):
            res[i] ^= gf_mul(c, f)
    return res


def encode(text):
    data = text.encode("utf-8")
    for ver in range(1, 7):
        total, ecc, nb = TABLE[ver]
        cap = total - ecc * nb
        if 4 + 8 + 8 * len(data) <= cap * 8:
            break
    else:
        raise ValueError("too long")
    bits = [0, 1, 0, 0] + [(len(data) >> i) & 1 for i in range(7, -1, -1)]
    for b in data:
        bits += [(b >> i) & 1 for i in range(7, -1, -1)]
    bits += [0] * min(4, cap * 8 - len(bits))
    bits += [0] * (-len(bits) % 8)
    cw = [int("".join(map(str, bits[i:i + 8])), 2) for i in range(0, len(bits), 8)]
    pad = 0xEC
    while len(cw) < cap:
        cw.append(pad); pad ^= 0xEC ^ 0x11
    # blocks + ecc + interleave
    short_len = total // nb
    n_short = nb - total % nb
    div = rs_divisor(ecc)
    blocks, k = [], 0
    for i in range(nb):
        dlen = short_len - ecc + (0 if i < n_short else 1)
        dat = cw[k:k + dlen]; k += dlen
        e = rs_remainder(dat, div)
        if i < n_short:
            dat = dat + [0]
        blocks.append(dat + e)
    out = []
    for i in range(len(blocks[0])):
        for j, b in enumerate(blocks):
            if i != short_len - ecc or j >= n_short:
                out.append(b[i])
    return ver, out


def build(text, mask=0):
    ver, cws = encode(text)
    size = ver * 4 + 17
    mod = [[False] * size for _ in range(size)]
    fun = [[False] * size for _ in range(size)]

    def setf(x, y, d):
        mod[y][x] = d; fun[y][x] = True

    for i in range(size):
        setf(6, i, i % 2 == 0); setf(i, 6, i % 2 == 0)
    for cx, cy in [(3, 3), (size - 4, 3), (3, size - 4)]:
        for dy in range(-4, 5):
            for dx in range(-4, 5):
                x, y = cx + dx, cy + dy
                if 0 <= x < size and 0 <= y < size:
                    setf(x, y, max(abs(dx), abs(dy)) not in (2, 4))
    al = ALIGN[ver]
    n = len(al)
    for i in range(n):
        for j in range(n):
            if (i == 0 and j == 0) or (i == 0 and j == n - 1) or (i == n - 1 and j == 0):
                continue
            for dy in range(-2, 3):
                for dx in range(-2, 3):
                    setf(al[i] + dx, al[j] + dy, max(abs(dx), abs(dy)) != 1)

    def format_bits(m):
        data = (0 << 3) | m  # ECC level M = 0b00
        rem = data
        for _ in range(10):
            rem = (rem << 1) ^ ((rem >> 9) * 0x537)
        b = ((data << 10) | rem) ^ 0x5412
        g = lambda i: ((b >> i) & 1) == 1
        for i in range(6):
            setf(8, i, g(i))
        setf(8, 7, g(6)); setf(8, 8, g(7)); setf(7, 8, g(8))
        for i in range(9, 15):
            setf(14 - i, 8, g(i))
        for i in range(8):
            setf(size - 1 - i, 8, g(i))
        for i in range(8, 15):
            setf(8, size - 15 + i, g(i))
        setf(8, size - 8, True)

    format_bits(0)
    i, right = 0, size - 1
    while right >= 1:
        if right == 6:
            right = 5
        for vert in range(size):
            for j in range(2):
                x = right - j
                up = ((right + 1) & 2) == 0
                y = size - 1 - vert if up else vert
                if not fun[y][x] and i < len(cws) * 8:
                    mod[y][x] = ((cws[i >> 3] >> (7 - (i & 7))) & 1) == 1
                    i += 1
        right -= 2
    masks = [lambda x, y: (x + y) % 2 == 0, lambda x, y: y % 2 == 0, lambda x, y: x % 3 == 0, lambda x, y: (x + y) % 3 == 0]
    for y in range(size):
        for x in range(size):
            if not fun[y][x] and masks[mask](x, y):
                mod[y][x] = not mod[y][x]
    format_bits(mask)
    return mod


def save(text, path, scale=20, border=4, dark=(18, 51, 46), light=(255, 255, 255)):
    m = build(text)
    n = len(m)
    im = Image.new("RGB", ((n + 2 * border) * scale,) * 2, light)
    px = im.load()
    for y in range(n):
        for x in range(n):
            if m[y][x]:
                for yy in range(scale):
                    for xx in range(scale):
                        px[(x + border) * scale + xx, (y + border) * scale + yy] = dark
    im.save(path)


if __name__ == "__main__":
    save(sys.argv[1], sys.argv[2])
