"""Terrain tileset generator.

Each material gets a 64x64 *tileable* texture. In-game, the variant of a tile is
chosen from its world position (x%4, y%4), so neighbouring tiles of the same
material join seamlessly. Each tile also has 16 edge variants (4-bit mask of
exposed sides N=1,E=2,S=4,W=8) for crisp, eroded, lit edges against tunnels.

Tileset layout: 64 columns. Material m occupies rows [m*4, m*4+4): index within
material = mask*16 + variant.
"""
from __future__ import annotations

import math
import random

import numpy as np

from lib import BAYER4, Canvas, fbm
from palette import c, ramp

T = 16
TEX = 64
N, E, S, W = 1, 2, 4, 8

# Order MUST match src/data/tiles.ts (TILE_NAMES). index 0 = air (blank)
TILE_NAMES = [
    "air", "bedrock", "dirt", "clay", "stone", "copper", "quartz", "lampmoss",
    "boulder", "sandstone", "limestone", "silver", "amber", "fossil",
    "crystalrock", "gold", "sapphire", "glimmer", "basalt", "obsidian",
    "fireopal", "ruby", "ember", "voidstone", "starmetal", "prism", "voidglass",
    "brick", "turf",
    "tin", "jade", "opal", "emerald", "aether", "magmarock", "cinnabar", "moonstone", "mithril",
    "heartrock", "heartstone", "geode", "seal", "relic", "worldheart",
]


# ------------------------------------------------------------------ helpers
def cobble(seed: int, rmp: list, sites: int = 9, mortar: int = 0, noise_amt: float = 0.25,
           min_d: float = 1.1, light_bias: float = 1.0, stretch=(1.0, 1.0)) -> Canvas:
    """Tileable voronoi cobbles with per-cell top-left lighting."""
    rng = random.Random(seed)
    pts = [(rng.uniform(0, TEX), rng.uniform(0, TEX)) for _ in range(sites)]
    tone = [rng.uniform(-0.12, 0.12) for _ in pts]
    nz = fbm(TEX, TEX, seed + 7, cells=(16, 8, 4), weights=(0.5, 0.3, 0.2))
    cv = Canvas(TEX, TEX)
    sx, sy = stretch
    for y in range(TEX):
        for x in range(TEX):
            best = [(1e9, -1, 0, 0), (1e9, -1, 0, 0)]
            for i, (px, py) in enumerate(pts):
                for ox in (-TEX, 0, TEX):
                    for oy in (-TEX, 0, TEX):
                        dx, dy = (x - px - ox) * sx, (y - py - oy) * sy
                        d = math.hypot(dx, dy)
                        if d < best[0][0]:
                            best[1] = best[0]
                            best[0] = (d, i, dx, dy)
                        elif d < best[1][0]:
                            best[1] = (d, i, dx, dy)
            d1, i, dx, dy = best[0]
            d2 = best[1][0]
            edge = d2 - d1
            if edge < min_d:
                cv.px(x, y, rmp[mortar])
                continue
            # cell-local lighting: up-left bright, down-right dark
            r = max(d1, 0.001)
            lit = (-dx - dy) / (r * 1.6 + 6) * light_bias
            near_edge = 1.0 if edge < min_d + 1.4 else 0.0
            v = 0.55 + lit * 0.5 + tone[i] + (nz[y, x] - 0.5) * noise_amt
            # bevel: pixels just inside the edge on lower-right go darker
            if near_edge and (dx + dy) > 0:
                v -= 0.22
            elif near_edge and (dx + dy) < 0:
                v += 0.18
            lv = int(v * (len(rmp) - 1) + (BAYER4[y % 4, x % 4] - 0.5) * 0.6)
            lv = max(1 if mortar == 0 else 0, min(len(rmp) - 1, lv))
            cv.px(x, y, rmp[lv])
    return cv


def strata(seed: int, rmp: list, bands: int = 6, wobble: float = 2.5, lo: int = 1) -> Canvas:
    rng = random.Random(seed)
    nz = fbm(TEX, TEX, seed, cells=(32, 16, 8), weights=(0.5, 0.35, 0.15))
    nz2 = fbm(TEX, TEX, seed + 99, cells=(8, 4), weights=(0.7, 0.3))
    cv = Canvas(TEX, TEX)
    phase = rng.random() * 6.28
    for y in range(TEX):
        for x in range(TEX):
            yy = y + math.sin(x / TEX * 2 * math.pi + phase) * wobble + (nz[y, x] - 0.5) * 6
            band = (yy / TEX * bands) % 1.0
            v = 0.35 + 0.45 * band + (nz2[y, x] - 0.5) * 0.3
            if band < 0.09:
                v = 0.05
            lv = int(v * (len(rmp)) + (BAYER4[y % 4, x % 4] - 0.5) * 0.7)
            cv.px(x, y, rmp[max(lo, min(len(rmp) - 1, lv))])
    return cv


def clumpy(seed: int, rmp: list, lo: int = 1, hi: int | None = None, cells=(16, 8, 4), dither: float = 0.9) -> Canvas:
    nz = fbm(TEX, TEX, seed, cells=cells, weights=(0.55, 0.3, 0.15))
    hi = len(rmp) - 1 if hi is None else hi
    cv = Canvas(TEX, TEX)
    for y in range(TEX):
        for x in range(TEX):
            v = nz[y, x]
            lv = lo + int(v * (hi - lo + 1) + (BAYER4[y % 4, x % 4] - 0.5) * dither)
            cv.px(x, y, rmp[max(lo, min(hi, lv))])
    return cv


def scatter_pebbles(cv: Canvas, seed: int, n: int, rmp: list, size=(1, 2)) -> None:
    rng = random.Random(seed)
    for _ in range(n):
        x, y = rng.randrange(TEX), rng.randrange(TEX)
        s = rng.randint(*size)
        for dy in range(s):
            for dx in range(s + 1):
                if dx == s and dy == s - 1:
                    continue
                col = rmp[3] if (dx + dy) == 0 else (rmp[1] if dy == s - 1 else rmp[2])
                cv.px((x + dx) % TEX, (y + dy) % TEX, col)
        cv.px((x + s + 1) % TEX, (y + s) % TEX, rmp[0])


def wrap_px(cv: Canvas, x: int, y: int, col) -> None:
    cv.px(x % TEX, y % TEX, col)


# ----------------------------------------------------------------- materials
def mat_bedrock() -> Canvas:
    return cobble(11, ramp("void")[1:] + [c("stone0")], sites=7, mortar=0, noise_amt=0.15)


def mat_dirt() -> Canvas:
    r = ramp("soil")
    cv = clumpy(21, r, lo=1, hi=4, cells=(16, 8, 4), dither=0.45)
    scatter_pebbles(cv, 22, 14, ramp("stone"), (1, 2))
    rng = random.Random(23)
    # little root fibres
    for _ in range(6):
        x, y = rng.randrange(TEX), rng.randrange(TEX)
        for i in range(rng.randint(3, 6)):
            wrap_px(cv, x + i, y + (i // 2) * rng.choice((0, 1)), "soil0")
    return cv


def mat_turf() -> Canvas:
    return mat_dirt()


def mat_clay() -> Canvas:
    r = [c("soil1"), c("copper0"), c("soil3"), c("copper1"), c("sand0")]
    cv = strata(31, r, bands=5, wobble=2.0)
    scatter_pebbles(cv, 32, 5, ramp("sand"), (1, 1))
    return cv


def mat_stone() -> Canvas:
    return cobble(41, ramp("stone"), sites=10, mortar=0, noise_amt=0.3)


def mat_sandstone() -> Canvas:
    r = ramp("sand")
    return strata(91, [c("sand0")] + r[1:] , bands=7, wobble=3.0)


def mat_limestone() -> Canvas:
    r = [c("stone1"), c("silver1"), c("sand3"), c("silver3"), c("sand4")]
    cv = cobble(101, r, sites=8, mortar=0, noise_amt=0.2)
    rng = random.Random(102)
    for _ in range(10):  # tiny shell specks
        x, y = rng.randrange(TEX), rng.randrange(TEX)
        wrap_px(cv, x, y, "silver4")
        wrap_px(cv, x + 1, y, "silver2")
    return cv


def mat_crystalrock() -> Canvas:
    r = [c("void3"), c("blue0"), c("stone1"), c("blue1"), c("stone3")]
    cv = cobble(141, r, sites=12, mortar=0, noise_amt=0.25)
    rng = random.Random(142)
    for _ in range(12):
        x, y = rng.randrange(TEX), rng.randrange(TEX)
        wrap_px(cv, x, y, "blue3")
        if rng.random() < 0.4:
            wrap_px(cv, x, y - 1, "blue4")
    return cv


def mat_basalt() -> Canvas:
    # vertical columns
    r = [c("void2"), c("void3"), c("stone0"), c("stone1"), c("stone2")]
    cv = cobble(181, r, sites=9, mortar=0, noise_amt=0.2, stretch=(1.7, 0.45))
    rng = random.Random(182)
    for _ in range(5):  # faint warm cracks
        x, y = rng.randrange(TEX), rng.randrange(TEX)
        for i in range(rng.randint(2, 5)):
            wrap_px(cv, x + rng.choice((-1, 0, 0, 1)), y + i, "red0")
    return cv


def mat_obsidian() -> Canvas:
    r = [c("void0"), c("void1"), c("void2"), c("violet0"), c("void4")]
    cv = cobble(191, r, sites=7, mortar=0, noise_amt=0.1, light_bias=1.6, min_d=0.8)
    rng = random.Random(192)
    for _ in range(9):  # glassy glints
        x, y = rng.randrange(TEX), rng.randrange(TEX)
        wrap_px(cv, x, y, "violet3")
        wrap_px(cv, x + 1, y + 1, "violet1")
    return cv


def mat_voidstone() -> Canvas:
    r = [c("void1"), c("violet0"), c("void3"), c("violet1"), c("void4")]
    cv = cobble(231, r, sites=11, mortar=0, noise_amt=0.3)
    rng = random.Random(232)
    for _ in range(14):
        x, y = rng.randrange(TEX), rng.randrange(TEX)
        wrap_px(cv, x, y, "violet4" if rng.random() < 0.3 else "violet2")
    return cv


def mat_brick() -> Canvas:
    cv = Canvas(TEX, TEX)
    r = ramp("stone")
    rng = random.Random(271)
    for row in range(8):
        y0 = row * 8
        off = 0 if row % 2 == 0 else 8
        for bx in range(-1, 4):
            x0 = bx * 16 + off
            tone = rng.choice((1, 2, 2, 3))
            for y in range(y0, y0 + 8):
                for x in range(x0, x0 + 16):
                    lx, ly = x - x0, y - y0
                    if ly == 7 or lx == 15:
                        col = r[0]
                    elif ly == 0 or lx == 0:
                        col = r[min(4, tone + 1)]
                    elif ly == 6 or lx == 14:
                        col = r[max(1, tone - 1)]
                    else:
                        col = r[tone]
                    wrap_px(cv, x, y, col)
        # chips & moss
    for _ in range(18):
        x, y = rng.randrange(TEX), rng.randrange(TEX)
        wrap_px(cv, x, y, "moss1" if rng.random() < 0.5 else "stone0")
    return cv


def mat_boulder_host() -> Canvas:
    return Canvas(TEX, TEX)  # boulders are drawn per tile, transparent host


# ------------------------------------------------------------- ore stamps
def nugget(cv: Canvas, x: int, y: int, rmp: list, rng: random.Random, w=3, h=2, outline="void1") -> None:
    pts = []
    for dy in range(h):
        for dx in range(w):
            if (dx in (0, w - 1) and dy in (0, h - 1)) and rng.random() < 0.6 and w > 2:
                continue
            pts.append((x + dx, y + dy))
    s = set(pts)
    for px, py in pts:
        for ox, oy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
            if (px + ox, py + oy) not in s:
                cv.px(px + ox, py + oy, outline)
    for px, py in pts:
        rel = (px - x) / max(w - 1, 1) + (py - y) / max(h - 1, 1)
        idx = 3 if rel < 0.5 else (2 if rel < 1.2 else 1)
        cv.px(px, py, rmp[idx])
    cv.px(x + (1 if w > 2 else 0), y, rmp[4])


def crystal_spike(cv: Canvas, x: int, y: int, h: int, rmp: list, lean: int = 0, outline="void1") -> None:
    # 3px wide pointy crystal pointing up from base (x,y)
    pts = []
    for i in range(h):
        yy = y - i
        xx = x + (lean * i) // max(h, 1)
        width = 3 if i < h - 2 else (2 if i < h - 1 else 1)
        for dx in range(width):
            pts.append((xx + dx - (1 if width == 3 else 0), yy))
    s = set(pts)
    for px, py in pts:
        for ox, oy in ((1, 0), (-1, 0), (0, -1)):
            if (px + ox, py + oy) not in s:
                cv.px(px + ox, py + oy, outline)
    for px, py in pts:
        rel = px - (x + (lean * (y - py)) // max(h, 1))
        cv.px(px, py, rmp[4] if rel < 0 else (rmp[3] if rel == 0 else rmp[2]))
    cv.px(x + (lean * (h - 1)) // max(h, 1), y - h + 1, rmp[4])


def gem(cv: Canvas, x: int, y: int, rmp: list, size: int = 2, outline="void0") -> None:
    # diamond shape, faceted
    for dy in range(-size, size + 1):
        span = size - abs(dy)
        for dx in range(-span, span + 1):
            if dy < 0 and dx <= 0:
                col = rmp[4]
            elif dy < 0:
                col = rmp[3]
            elif dx < 0:
                col = rmp[2]
            else:
                col = rmp[1]
            cv.px(x + dx, y + dy, col)
    for dy in range(-size - 1, size + 2):
        span = size + 1 - abs(dy)
        for dx in (-span, span):
            if not cv.opaque(x + dx, y + dy) or abs(dx) == span:
                if abs(dy) <= size + 1:
                    cv.px(x + dx, y + dy, outline)
    cv.px(x, y - size - 1, outline)
    cv.px(x, y + size + 1, outline)
    cv.px(x - 1, y - 1, "light4")


def blob(cv: Canvas, x: int, y: int, r: float, rmp: list, outline="void1") -> None:
    pts = [(xx, yy) for yy in range(int(y - r - 1), int(y + r + 2)) for xx in range(int(x - r - 1), int(x + r + 2))
           if (xx - x) ** 2 + (yy - y) ** 2 <= r * r]
    s = set(pts)
    for px, py in pts:
        for ox, oy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
            if (px + ox, py + oy) not in s:
                cv.px(px + ox, py + oy, outline)
    for px, py in pts:
        rel = ((px - x) + (py - y)) / max(r, 1)
        cv.px(px, py, rmp[3] if rel < -0.6 else (rmp[2] if rel < 0.5 else rmp[1]))
    cv.px(int(x - r / 2), int(y - r / 2), rmp[4])


def cells(seed: int):
    """Yield (cell_x0, cell_y0, rng) for the 16 tile cells of a texture."""
    for cy in range(4):
        for cx in range(4):
            yield cx * T, cy * T, random.Random(seed * 100 + cy * 4 + cx)


def ore_copper(host: Canvas) -> Canvas:
    cv = host.copy()
    for x0, y0, rng in cells(5):
        spots = [(3, 3), (9, 4), (5, 10), (11, 10)]
        rng.shuffle(spots)
        for sx, sy in spots[: rng.randint(2, 3)]:
            nugget(cv, x0 + sx + rng.randint(-1, 1), y0 + sy + rng.randint(-1, 1), ramp("copper"), rng,
                   w=rng.randint(3, 4), h=3, outline="void1")
    return cv


def ore_quartz(host: Canvas) -> Canvas:
    cv = host.copy()
    q = [c("teal1"), c("silver2"), c("teal3"), c("silver4"), c("light4")]
    for x0, y0, rng in cells(6):
        bx = x0 + rng.randint(4, 10)
        by = y0 + rng.randint(11, 13)
        crystal_spike(cv, bx - 3, by, rng.randint(4, 6), q, lean=-1, outline="teal0")
        crystal_spike(cv, bx + 3, by, rng.randint(4, 6), q, lean=1, outline="teal0")
        crystal_spike(cv, bx, by, rng.randint(7, 9), q, lean=0, outline="teal0")
    return cv


def ore_lampmoss(host: Canvas) -> Canvas:
    cv = host.copy()
    for x0, y0, rng in cells(7):
        # a mossy cushion with glowing bulbs
        cx, cy = x0 + 8 + rng.randint(-1, 1), y0 + 9 + rng.randint(-1, 1)
        cv.ellipse(cx, cy, 6, 4, "moss0")
        cv.ellipse(cx, cy - 0.5, 5, 3, "moss1")
        cv.ellipse(cx - 1, cy - 1, 3.5, 2, "moss2")
        for _ in range(rng.randint(3, 4)):
            bx, by = cx + rng.randint(-4, 4), cy + rng.randint(-3, 1)
            cv.px(bx, by + 1, "moss2")
            cv.px(bx, by, "moss4")
            cv.px(bx, by - 1, "light3")
            cv.px(bx - 1, by - 1, "light4") if rng.random() < 0.5 else None
    return cv


def ore_silver(host: Canvas) -> Canvas:
    cv = host.copy()
    sv = ramp("silver")
    for x0, y0, rng in cells(11):
        for k in range(2):
            x, y = x0 + 2 + rng.randint(0, 3), y0 + 5 + k * 6 + rng.randint(-1, 1)
            ln = rng.randint(6, 9)
            for i in range(ln):  # thick diagonal vein
                yy = y - i // 3
                cv.px(x + i, yy - 1, "void1")
                cv.px(x + i, yy, sv[4] if i % 3 == 0 else sv[3])
                cv.px(x + i, yy + 1, sv[2])
                cv.px(x + i, yy + 2, "void1")
            cv.px(x - 1, y, "void1")
            cv.px(x + ln, y - ln // 3, "void1")
    return cv


def ore_amber(host: Canvas) -> Canvas:
    cv = host.copy()
    for x0, y0, rng in cells(12):
        for _ in range(1):
            x, y = x0 + rng.randint(7, 9), y0 + rng.randint(7, 9)
            r = rng.choice((3.5, 4.0))
            am = [c("amber0"), c("amber2"), c("amber3"), c("light2"), c("light4")]
            blob(cv, x, y, r, am, outline="void1")
            cv.px(x + 1, y + 1, "amber0")  # trapped seed
            cv.px(x - 2, y - 2, "light4")
    return cv


def ore_fossil(host: Canvas) -> Canvas:
    cv = host.copy()
    spiral = [
        "  oooo  ",
        " oaaaao ",
        "oaboobao",
        "oaobaoao",
        "oaoaabao",
        "oabooao ",
        " oaaao  ",
        "  ooo   ",
    ]
    for x0, y0, rng in cells(13):
        x, y = x0 + rng.randint(3, 5), y0 + rng.randint(3, 5)
        for yy, row in enumerate(spiral):
            for xx, ch in enumerate(row):
                col = {"o": "soil1", "a": "sand4", "b": "sand2"}.get(ch)
                if col:
                    cv.px(x + xx, y + yy, col)
        cv.px(x + 2, y + 2, "silver4")
    return cv


def ore_gold(host: Canvas) -> Canvas:
    cv = host.copy()
    g = [c("amber0"), c("amber2"), c("light1"), c("light2"), c("light4")]
    for x0, y0, rng in cells(15):
        spots = [(2, 3), (9, 3), (4, 9), (10, 10)]
        rng.shuffle(spots)
        for sx, sy in spots[: rng.randint(2, 3)]:
            nugget(cv, x0 + sx + rng.randint(0, 1), y0 + sy + rng.randint(0, 1), g, rng, w=rng.randint(4, 5), h=rng.randint(3, 4), outline="void1")
        sx, sy = x0 + rng.randint(2, 13), y0 + rng.randint(2, 13)
        cv.px(sx, sy, "light4")
    return cv


def ore_gem(host: Canvas, rmp: list, seed: int, size_range=(1, 2), count=(1, 2)) -> Canvas:
    cv = host.copy()
    for x0, y0, rng in cells(seed):
        for _ in range(rng.randint(*count)):
            gem(cv, x0 + 8 + rng.randint(-1, 0), y0 + 8 + rng.randint(-1, 0), rmp, rng.randint(*size_range))
            gem(cv, x0 + rng.choice((3, 12)), y0 + rng.choice((3, 12)), rmp, 1)
    return cv


def ore_glimmer(host: Canvas) -> Canvas:
    cv = host.copy()
    t = ramp("teal")
    for x0, y0, rng in cells(17):
        bx = x0 + rng.randint(5, 10)
        by = y0 + 14
        crystal_spike(cv, bx - 4, by, rng.randint(5, 7), t, lean=-2, outline="teal0")
        crystal_spike(cv, bx + 4, by, rng.randint(5, 7), t, lean=2, outline="teal0")
        crystal_spike(cv, bx, by, rng.randint(9, 12), t, lean=0, outline="teal0")
    return cv


def ore_fireopal(host: Canvas) -> Canvas:
    cv = host.copy()
    fo = [c("red0"), c("red1"), c("red2"), c("red3"), c("red4")]
    for x0, y0, rng in cells(20):
        # oval cabochon with opal flashes
        cx, cy = x0 + 8 + rng.randint(-1, 1), y0 + 8 + rng.randint(-1, 1)
        cv.ellipse(cx, cy, 5.2, 4.2, "void0")
        cv.ellipse(cx, cy, 4.3, 3.3, fo[1])
        cv.ellipse(cx - 0.5, cy - 0.5, 3.4, 2.4, fo[2])
        cv.ellipse(cx - 1.2, cy - 1.2, 1.8, 1.2, fo[3])
        cv.px(cx - 2, cy - 2, "light4")
        cv.px(cx + 1, cy + 1, "teal3")
        cv.px(cx + 2, cy, "amber4")
        cv.px(cx - 1, cy + 1, "violet3")
    return cv


def ore_ember(host: Canvas) -> Canvas:
    cv = host.copy()
    rng = random.Random(22)
    # molten crack network
    for x0, y0, r2 in cells(22):
        cx, cy = x0 + 8, y0 + 8
        cv.disc(cx, cy, 3.2, "red1")
        cv.disc(cx, cy, 2.2, "red3")
        cv.disc(cx - 0.5, cy - 0.5, 1.2, "amber3")
        cv.px(cx - 1, cy - 1, "light4")
        for a in range(5):
            ang = a / 5 * 6.283 + r2.random()
            ln = r2.randint(4, 7)
            for i in range(3, ln):
                x = int(round(cx + math.cos(ang) * i))
                y = int(round(cy + math.sin(ang) * i))
                cv.px(x, y, "red2" if i < ln - 1 else "red1")
    del rng
    return cv


def ore_starmetal(host: Canvas) -> Canvas:
    cv = host.copy()
    sm = [c("violet1"), c("silver1"), c("silver2"), c("silver4"), c("light4")]
    for x0, y0, rng in cells(24):
        spots = [(2, 3), (9, 4), (4, 10), (10, 10)]
        rng.shuffle(spots)
        for sx, sy in spots[: rng.randint(2, 3)]:
            nugget(cv, x0 + sx, y0 + sy, sm, rng, w=rng.randint(3, 4), h=3, outline="void0")
        sx, sy = x0 + rng.randint(4, 11), y0 + rng.randint(4, 11)
        for dx, dy in ((0, 0), (1, 0), (-1, 0), (0, 1), (0, -1), (2, 0), (-2, 0), (0, 2), (0, -2)):
            far = abs(dx) + abs(dy) == 2
            cv.px(sx + dx, sy + dy, "light4" if (dx, dy) == (0, 0) else ("violet2" if far else "violet4"))
    return cv


def ore_prism(host: Canvas) -> Canvas:
    cv = host.copy()
    rmps = [ramp("red"), ramp("teal"), ramp("violet"), ramp("amber")]
    for x0, y0, rng in cells(25):
        gem(cv, x0 + 5, y0 + 6, rmps[rng.randrange(4)], 2)
        gem(cv, x0 + 11, y0 + 10, rmps[rng.randrange(4)], 1)
    return cv


def ore_voidglass(host: Canvas) -> Canvas:
    cv = host.copy()
    v = ramp("violet")
    for x0, y0, rng in cells(26):
        bx = x0 + rng.randint(5, 10)
        by = y0 + 14
        crystal_spike(cv, bx - 4, by, rng.randint(6, 8), v, lean=-2, outline="violet0")
        crystal_spike(cv, bx + 3, by, rng.randint(5, 7), v, lean=1, outline="violet0")
        crystal_spike(cv, bx, by, rng.randint(10, 12), v, lean=0, outline="violet0")
    return cv


def boulder_tex() -> Canvas:
    """Loose boulder: a round rock sitting on a darker gravel bed, per tile."""
    cv = Canvas(TEX, TEX)
    r = ramp("stone")
    for x0, y0, rng in cells(8):
        # gravel bed fill (so it reads as a solid block)
        for y in range(16):
            for x in range(16):
                cv.px(x0 + x, y0 + y, r[0] if (x + y + rng.randint(0, 1)) % 3 else c("void3"))
        cx, cy = x0 + 8 + rng.choice((-0.5, 0, 0.5)), y0 + 8.5
        rad = 6.6
        for y in range(16):
            for x in range(16):
                dx, dy = x0 + x - cx, y0 + y - cy
                d = math.hypot(dx, dy / 0.92)
                if d <= rad:
                    lit = (-dx - dy) / rad
                    lv = 2 + lit * 1.4 + (BAYER4[y % 4, x % 4] - 0.5) * 0.8
                    cv.px(x0 + x, y0 + y, r[max(1, min(4, int(lv)))])
                elif d <= rad + 1:
                    cv.px(x0 + x, y0 + y, "void1")
        # crack + highlight
        cv.px(int(cx) + 1, int(cy) - 1, "stone1")
        cv.px(int(cx) + 2, int(cy), "stone1")
        cv.px(int(cx) - 3, int(cy) - 3, "silver3")
        cv.px(int(cx) - 2, int(cy) - 4, "silver4")
    return cv


# -------------------------------------------------------------- edge mask
def apply_edges(tile: Canvas, mask: int, rmp_hi, rmp_mid, rmp_lo, salt: int) -> Canvas:
    """Erode and light the exposed sides of a 16x16 tile."""
    o = tile.copy()
    rng = random.Random(salt * 977 + mask)

    def bite(side: int) -> list[int]:
        # erosion depth per position along the edge (0..2)
        depths = []
        d = 0
        for i in range(T):
            r = rng.random()
            if r < 0.18:
                d = min(2, d + 1)
            elif r < 0.45:
                d = max(0, d - 1)
            depths.append(d if 2 <= i <= 13 else 0)
        return depths

    bites = {s: bite(s) for s in (N, E, S, W)}
    # erode: remove up to 2px along exposed sides following a random walk
    for y in range(T):
        for x in range(T):
            clear = False
            if mask & N and y < bites[N][x]:
                clear = True
            if mask & S and (T - 1 - y) < bites[S][x] - 1:
                clear = True
            if mask & W and x < bites[W][y] - 1:
                clear = True
            if mask & E and (T - 1 - x) < bites[E][y] - 1:
                clear = True
            if clear:
                o.px(x, y, (0, 0, 0, 0))
    # rounded corners
    corners = [((0, 0), N | W), ((T - 1, 0), N | E), ((0, T - 1), S | W), ((T - 1, T - 1), S | E)]
    for (x, y), m in corners:
        if mask & m == m:
            o.px(x, y, (0, 0, 0, 0))
            o.px(x + (1 if x == 0 else -1), y, (0, 0, 0, 0))
            o.px(x, y + (1 if y == 0 else -1), (0, 0, 0, 0))
    # lighting rims, computed against the eroded shape
    out = o.copy()
    for y in range(T):
        for x in range(T):
            if not o.opaque(x, y):
                continue
            up_open = (y == 0 and mask & N) or (y > 0 and not o.opaque(x, y - 1) and (mask & N or y > 0))
            dn_open = (y == T - 1 and mask & S) or (y < T - 1 and not o.opaque(x, y + 1))
            lf_open = (x == 0 and mask & W) or (x > 0 and not o.opaque(x - 1, y))
            rt_open = (x == T - 1 and mask & E) or (x < T - 1 and not o.opaque(x + 1, y))
            if up_open:
                out.px(x, y, rmp_hi)
                if o.opaque(x, y + 1):
                    out.px(x, y + 1, rmp_mid)
                if o.opaque(x, y + 2) and (x + y) % 2 == 0:
                    out.px(x, y + 2, rmp_mid)
            elif dn_open:
                out.px(x, y, "void0")
                if o.opaque(x, y - 1):
                    out.px(x, y - 1, rmp_lo)
                if o.opaque(x, y - 2) and (x + y) % 2 == 0:
                    out.px(x, y - 2, rmp_lo)
            elif lf_open:
                out.px(x, y, rmp_mid)
            elif rt_open:
                out.px(x, y, rmp_lo)
    return out


# ------------------------------------------------- the deep: Mantle & Heart
def mat_magmarock() -> Canvas:
    """Dark crusted rock with molten seams glowing between the plates."""
    r = [c("void1"), c("red0"), c("void3"), c("red1"), c("stone1")]
    cv = cobble(301, r, sites=9, mortar=0, noise_amt=0.2, light_bias=1.2, min_d=1.3)
    # the mortar lines are lava: brighten them in pulses along their length
    for y in range(TEX):
        for x in range(TEX):
            if cv.get(x, y) == c("void1")[:4]:
                h = (x * 7 + y * 13) % 11
                cv.px(x, y, "red2" if h < 3 else ("red3" if h == 3 else "red1"))
    rng = random.Random(302)
    for _ in range(8):
        x, y = rng.randrange(TEX), rng.randrange(TEX)
        wrap_px(cv, x, y, "amber3")
    return cv


def mat_heartrock() -> Canvas:
    """Warm amber crystal-stone, veined with light: the walls near the Heart."""
    r = [c("amber0"), c("sand0"), c("amber1"), c("sand2"), c("amber2")]
    cv = cobble(311, r, sites=12, mortar=0, noise_amt=0.25)
    rng = random.Random(312)
    for _ in range(16):
        x, y = rng.randrange(TEX), rng.randrange(TEX)
        wrap_px(cv, x, y, "light3")
        if rng.random() < 0.5:
            wrap_px(cv, x + 1, y - 1, "light4")
    return cv


def mat_seal() -> Canvas:
    """A Strata Seal: ancient slabs carved with glowing teal runes."""
    cv = Canvas(TEX, TEX)
    rng = random.Random(321)
    slab = [c("void2"), c("teal0"), c("void3"), c("stone0"), c("teal1")]
    for row in range(4):
        y0 = row * 16
        off = 0 if row % 2 == 0 else 16
        for bx in range(-1, 3):
            x0 = bx * 32 + off
            for y in range(y0, y0 + 16):
                for x in range(x0, x0 + 32):
                    lx, ly = x - x0, y - y0
                    if ly == 15 or lx == 31:
                        col = c("void0")
                    elif ly == 0 or lx == 0:
                        col = slab[4]
                    elif ly == 14 or lx == 30:
                        col = slab[0]
                    else:
                        col = slab[2] if (lx + ly * 3 + bx) % 9 else slab[3]
                    wrap_px(cv, x, y, col)
            # a rune per slab
            glyphs = [[(0, 0), (0, 1), (0, 2), (0, 3), (0, 4), (1, 2), (2, 1), (2, 3)],
                      [(0, 0), (1, 1), (2, 2), (1, 3), (0, 4), (2, 0), (2, 4)],
                      [(1, 0), (0, 1), (2, 1), (1, 2), (1, 3), (0, 4), (2, 4)],
                      [(0, 0), (2, 0), (1, 1), (1, 2), (1, 3), (0, 3), (2, 3), (1, 4)]]
            g = glyphs[rng.randrange(len(glyphs))]
            gx, gy = x0 + 14 + rng.randint(-6, 6), y0 + 5
            for dx, dy in g:
                wrap_px(cv, gx + dx, gy + dy, "teal3")
                wrap_px(cv, gx + dx + 1, gy + dy + 1, "teal1")
            wrap_px(cv, gx + g[0][0], gy + g[0][1], "teal4")
    return cv


def mat_geode() -> Canvas:
    """A geode's rough shell: grey crust with violet crystal peeking through."""
    r = [c("void2"), c("stone0"), c("stone1"), c("violet1"), c("stone3")]
    cv = cobble(331, r, sites=14, mortar=0, noise_amt=0.35)
    rng = random.Random(332)
    for _ in range(22):
        x, y = rng.randrange(TEX), rng.randrange(TEX)
        wrap_px(cv, x, y, "violet3")
        wrap_px(cv, x + 1, y, "violet2")
        if rng.random() < 0.4:
            wrap_px(cv, x, y - 1, "violet4")
    return cv


def mat_relic() -> Canvas:
    """A relic cache: packed old earth around a glinting keepsake."""
    cv = clumpy(341, [c("soil0"), c("soil1"), c("soil2"), c("void3"), c("soil3")], lo=1, hi=3, cells=(8, 4), dither=0.5)
    for x0, y0, rng in cells(342):
        cx, cy = x0 + 8 + rng.randint(-1, 1), y0 + 8 + rng.randint(-1, 1)
        # a little bundle wrapped in cloth, tied with gold, glowing
        cv.ellipse(cx, cy, 4.6, 3.6, "void0")
        cv.ellipse(cx, cy, 3.8, 2.8, "sand1")
        cv.ellipse(cx - 0.5, cy - 0.5, 2.6, 1.8, "sand3")
        for dy in range(-2, 3):
            cv.px(cx, cy + dy, "amber3")
        cv.px(cx - 1, cy - 1, "light4")
        cv.px(cx + 2, cy - 2, "light3")
    return cv


def mat_worldheart() -> Canvas:
    """The World's Heart: a mass of blazing golden crystal."""
    cv = cobble(351, [c("amber2"), c("light0"), c("light1"), c("light2"), c("light3")], sites=10, mortar=0, noise_amt=0.2, light_bias=1.4, min_d=0.9)
    rng = random.Random(352)
    for _ in range(26):
        x, y = rng.randrange(TEX), rng.randrange(TEX)
        wrap_px(cv, x, y, "light4")
        wrap_px(cv, x + 1, y, "light4")
        wrap_px(cv, x, y + 1, "light4")
    return cv


def ore_tin(host: Canvas) -> Canvas:
    cv = host.copy()
    t = [c("void2"), c("silver2"), c("silver3"), c("silver4"), c("light4")]
    for x0, y0, rng in cells(401):
        spots = [(2, 3), (9, 2), (3, 10), (10, 9)]
        rng.shuffle(spots)
        for sx, sy in spots[: rng.randint(2, 3)]:
            nugget(cv, x0 + sx, y0 + sy, t, rng, w=rng.randint(3, 4), h=3, outline="void0")
    return cv


def ore_jade(host: Canvas) -> Canvas:
    cv = host.copy()
    j = [c("moss0"), c("moss1"), c("moss2"), c("moss3"), c("moss4")]
    for x0, y0, rng in cells(402):
        blob(cv, x0 + 8 + rng.randint(-2, 1), y0 + 8 + rng.randint(-2, 1), rng.choice((3.0, 3.5)), j, outline="void1")
        if rng.random() < 0.6:
            blob(cv, x0 + rng.choice((3, 12)), y0 + rng.choice((3, 12)), 1.5, j, outline="void1")
    return cv


def ore_opal(host: Canvas) -> Canvas:
    cv = host.copy()
    flecks = ["teal3", "blue3", "violet3", "light3", "red3", "moss3"]
    for x0, y0, rng in cells(403):
        cx, cy = x0 + 8 + rng.randint(-1, 1), y0 + 8 + rng.randint(-1, 1)
        cv.ellipse(cx, cy, 4.8, 3.8, "void0")
        cv.ellipse(cx, cy, 3.9, 2.9, "silver3")
        cv.ellipse(cx - 0.5, cy - 0.5, 2.8, 1.9, "blue4")
        for _ in range(5):
            cv.px(cx + rng.randint(-3, 3), cy + rng.randint(-2, 2), rng.choice(flecks))
        cv.px(cx - 2, cy - 2, "light4")
    return cv


def ore_aether(host: Canvas) -> Canvas:
    cv = host.copy()
    a = [c("teal1"), c("teal2"), c("silver3"), c("teal4"), c("light4")]
    for x0, y0, rng in cells(404):
        bx = x0 + rng.randint(5, 10)
        by = y0 + 14
        crystal_spike(cv, bx - 3, by, rng.randint(5, 7), a, lean=-2, outline="teal0")
        crystal_spike(cv, bx + 4, by, rng.randint(4, 6), a, lean=2, outline="teal0")
        crystal_spike(cv, bx, by, rng.randint(9, 12), a, lean=0, outline="teal0")
        cv.px(bx + rng.randint(-5, 5), y0 + rng.randint(1, 4), "light4")
    return cv


def ore_cinnabar(host: Canvas) -> Canvas:
    cv = host.copy()
    for x0, y0, rng in cells(405):
        for _ in range(rng.randint(2, 3)):
            x, y = x0 + rng.randint(2, 10), y0 + rng.randint(2, 10)
            w = rng.randint(3, 4)
            # little red rhombohedral crystals
            for dy in range(w):
                for dx in range(w):
                    col = "red4" if dx + dy == 0 else ("red3" if dx < w - 1 and dy < w - 1 else "red1")
                    cv.px(x + dx, y + dy, col)
            for k in range(-1, w + 1):
                for (px, py) in ((x + k, y - 1), (x + k, y + w), (x - 1, y + k), (x + w, y + k)):
                    if not (x <= px < x + w and y <= py < y + w):
                        cv.px(px, py, "void0")
    return cv


def ore_moonstone(host: Canvas) -> Canvas:
    cv = host.copy()
    m = [c("blue1"), c("silver2"), c("blue3"), c("silver4"), c("light4")]
    for x0, y0, rng in cells(406):
        blob(cv, x0 + 8 + rng.randint(-1, 1), y0 + 8 + rng.randint(-1, 1), 4.0, m, outline="void0")
        cv.px(x0 + 7, y0 + 6, "blue4")
        cv.px(x0 + 9, y0 + 9, "teal4")
    return cv


def ore_mithril(host: Canvas) -> Canvas:
    cv = host.copy()
    sv = [c("silver1"), c("silver2"), c("silver3"), c("silver4"), c("light4")]
    for x0, y0, rng in cells(407):
        spots = [(2, 3), (9, 3), (4, 9), (10, 10)]
        rng.shuffle(spots)
        for sx, sy in spots[: rng.randint(2, 3)]:
            nugget(cv, x0 + sx, y0 + sy, sv, rng, w=rng.randint(4, 5), h=3, outline="void0")
        sx, sy = x0 + rng.randint(3, 12), y0 + rng.randint(3, 12)
        for dx, dy in ((0, 0), (1, 0), (-1, 0), (0, 1), (0, -1)):
            cv.px(sx + dx, sy + dy, "light4" if (dx, dy) == (0, 0) else "silver4")
    return cv


def ore_heartstone(host: Canvas) -> Canvas:
    cv = host.copy()
    h = [c("amber2"), c("light1"), c("light2"), c("light3"), c("light4")]
    for x0, y0, rng in cells(408):
        bx = x0 + rng.randint(5, 10)
        by = y0 + 14
        crystal_spike(cv, bx - 4, by, rng.randint(6, 8), h, lean=-2, outline="amber0")
        crystal_spike(cv, bx + 4, by, rng.randint(6, 8), h, lean=2, outline="amber0")
        crystal_spike(cv, bx, by, rng.randint(10, 13), h, lean=0, outline="amber0")
    return cv



MATERIALS = {
    "bedrock": (mat_bedrock, ("stone1", "void4", "void1")),
    "dirt": (mat_dirt, ("soil4", "soil3", "soil0")),
    "clay": (mat_clay, ("sand1", "copper1", "soil0")),
    "stone": (mat_stone, ("stone4", "stone3", "stone0")),
    "sandstone": (mat_sandstone, ("sand4", "sand3", "sand0")),
    "limestone": (mat_limestone, ("silver4", "silver3", "stone1")),
    "crystalrock": (mat_crystalrock, ("blue3", "blue2", "void2")),
    "basalt": (mat_basalt, ("stone3", "stone1", "void1")),
    "obsidian": (mat_obsidian, ("violet3", "void4", "void0")),
    "voidstone": (mat_voidstone, ("violet3", "violet1", "void0")),
    "brick": (mat_brick, ("stone4", "stone3", "stone0")),
    "magmarock": (mat_magmarock, ("red2", "red1", "void0")),
    "heartrock": (mat_heartrock, ("light2", "amber2", "amber0")),
    "seal": (mat_seal, ("teal3", "teal1", "void0")),
    "geode": (mat_geode, ("violet3", "stone2", "void1")),
    "relic": (mat_relic, ("sand3", "soil3", "soil0")),
    "worldheart": (mat_worldheart, ("light4", "light2", "amber1")),
}

ORES = {
    "copper": ("stone", ore_copper),
    "quartz": ("stone", ore_quartz),
    "lampmoss": ("dirt", ore_lampmoss),
    "silver": ("limestone", ore_silver),
    "amber": ("sandstone", ore_amber),
    "fossil": ("limestone", ore_fossil),
    "gold": ("crystalrock", ore_gold),
    "sapphire": ("crystalrock", lambda h: ore_gem(h, ramp("blue"), 16, (3, 3), (1, 1))),
    "glimmer": ("crystalrock", ore_glimmer),
    "fireopal": ("basalt", ore_fireopal),
    "ruby": ("basalt", lambda h: ore_gem(h, ramp("red"), 21, (3, 3), (1, 1))),
    "ember": ("basalt", ore_ember),
    "starmetal": ("voidstone", ore_starmetal),
    "prism": ("voidstone", ore_prism),
    "voidglass": ("voidstone", ore_voidglass),
    "tin": ("stone", ore_tin),
    "jade": ("limestone", ore_jade),
    "opal": ("crystalrock", ore_opal),
    "emerald": ("basalt", lambda h: ore_gem(h, ramp("moss"), 409, (3, 3), (1, 1))),
    "aether": ("voidstone", ore_aether),
    "cinnabar": ("magmarock", ore_cinnabar),
    "moonstone": ("magmarock", ore_moonstone),
    "mithril": ("magmarock", ore_mithril),
    "heartstone": ("heartrock", ore_heartstone),
}


def turf_overlay(tile: Canvas, mask: int, variant: int) -> Canvas:
    """Grass lip on exposed top of turf tiles."""
    o = tile.copy()
    if not mask & N:
        return o
    rng = random.Random(variant * 13 + mask)
    for x in range(T):
        h = rng.choice((2, 3, 3, 4))
        for y in range(h):
            o.px(x, y, "moss3" if y == 0 else ("moss2" if y < h - 1 else "moss1"))
        if rng.random() < 0.3:
            o.px(x, 0, "moss4")
    return o


def build_tileset() -> tuple[Canvas, dict]:
    textures: dict[str, Canvas] = {}
    for name, (fn, _) in MATERIALS.items():
        textures[name] = fn()
    textures["turf"] = textures["dirt"]
    for name, (host, fn) in ORES.items():
        textures[name] = fn(textures[host])
    textures["boulder"] = boulder_tex()

    rims = {k: v[1] for k, v in MATERIALS.items()}
    rims["turf"] = rims["dirt"]
    for name, (host, _) in ORES.items():
        rims[name] = rims[host]
    rims["boulder"] = ("stone4", "stone2", "void1")

    rows = len(TILE_NAMES) * 4
    sheet = Canvas(64 * T, rows * T)
    for mi, name in enumerate(TILE_NAMES):
        if name == "air":
            continue
        tex = textures[name]
        hi, mid, lo = rims[name]
        for mask in range(16):
            for v in range(16):
                vx, vy = v % 4, v // 4
                tile = tex.crop(vx * T, vy * T, T, T)
                if name == "boulder":
                    tile = tile  # boulders keep their bed; edges drawn as normal
                tile = apply_edges(tile, mask, hi, mid, lo, salt=mi * 31 + v)
                if name == "turf":
                    tile = turf_overlay(tile, mask, v)
                idx = mask * 16 + v
                col = idx % 64
                row = mi * 4 + idx // 64
                sheet.blit(tile, col * T, row * T)
    meta = {"tileSize": T, "columns": 64, "rowsPerMaterial": 4, "names": TILE_NAMES}
    return sheet, meta


# ----------------------------------------------------------- back walls
BACKWALLS = {
    "rootsoil": ("soil", 301),
    "amberstone": ("sand", 302),
    "grotto": ("blue", 303),
    "emberdeep": ("red", 304),
    "hollow": ("violet", 305),
    "mantle": ("red", 306),
    "heart": ("amber", 307),
}


def build_backwall(rname: str, seed: int) -> Canvas:
    """Dark, low-contrast tileable cave back-wall with a faint biome tint."""
    r = ramp(rname)
    v = ramp("void")
    rmp = [v[0], v[1], v[1], r[0], v[2]]
    cv = cobble(seed, rmp, sites=16, mortar=0, noise_amt=0.3, light_bias=0.5)
    # open pockets onto the distant layer behind, with a dark lip around each
    nz = fbm(TEX, TEX, seed + 500, cells=(32, 16, 8), weights=(0.6, 0.3, 0.1))
    hole = nz > 0.66
    out = cv.copy()
    for y in range(TEX):
        for x in range(TEX):
            if hole[y, x]:
                out.px(x, y, (0, 0, 0, 0))
            elif any(hole[(y + dy) % TEX, (x + dx) % TEX] for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1))):
                out.px(x, y, "void0")
    return out


def build_backwall_far(rname: str, seed: int) -> Canvas:
    """The deeper cave beyond the back wall: big, dim shapes for parallax depth."""
    r = ramp(rname)
    v = ramp("void")
    rmp = [v[0], v[0], v[1], v[1], r[0]]
    return cobble(seed + 77, rmp, sites=5, mortar=0, noise_amt=0.2, light_bias=0.4)


def ao_tiles() -> list[Canvas]:
    """Ambient-occlusion overlays for air tiles; index = mask of SOLID neighbours."""
    out = []
    for mask in range(16):
        cv = Canvas(T, T)
        for y in range(T):
            for x in range(T):
                a = 0.0
                if mask & N:
                    a = max(a, 1 - y / 7)
                if mask & S:
                    a = max(a, (1 - (T - 1 - y) / 4) * 0.6)
                if mask & W:
                    a = max(a, (1 - x / 5) * 0.8)
                if mask & E:
                    a = max(a, (1 - (T - 1 - x) / 5) * 0.8)
                a = max(0.0, a)
                q = int(a * 3 + (BAYER4[y % 4, x % 4] - 0.5) * 0.9)
                if q > 0:
                    cv.px(x, y, (7, 6, 12, [0, 70, 130, 190][min(q, 3)]))
        out.append(cv)
    return out


def crack_overlays() -> list[Canvas]:
    out = []
    rng = random.Random(4242)
    paths = []
    for _ in range(9):
        x, y = rng.randint(4, 11), rng.randint(4, 11)
        pts = [(x, y)]
        for _ in range(rng.randint(3, 6)):
            x += rng.choice((-1, 0, 1, 1))
            y += rng.choice((-1, 1, 1, 0))
            pts.append((x, y))
        paths.append(pts)
    for stage in range(4):
        cv = Canvas(T, T)
        for p in paths[: 2 + stage * 2]:
            for i, (x, y) in enumerate(p[: 2 + stage + 2]):
                if 0 < x < T - 1 and 0 < y < T - 1:
                    cv.px(x, y, (7, 6, 12, 230))
                    if i % 2 == 0:
                        cv.px(x - 1, y - 1, (255, 251, 234, 90))
        out.append(cv)
    return out
