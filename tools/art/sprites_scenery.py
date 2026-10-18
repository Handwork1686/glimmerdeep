"""Backdrops, key art and the logo."""
from __future__ import annotations

import math
import random

from lib import BAYER4, Canvas
from palette import c, ramp
import font as F
import tiles as TL
import sprites_player as P

W, H = 480, 270
GROUND = 160  # in-game: SKY_ROWS*16 = 160 px from world top


def sky(w=W, h=H, horizon=None, seed=1, moon=True) -> Canvas:
    cv = Canvas(w, h)
    horizon = horizon or h
    stops = [c("void0"), c("void1"), c("void2"), c("violet0"), c("void3"), c("violet1")]
    for y in range(h):
        t = min(1.0, y / horizon)
        f = t * (len(stops) - 1)
        for x in range(w):
            i = int(f + (BAYER4[y % 4, x % 4] - 0.5) * 0.9)
            cv.px(x, y, stops[max(0, min(len(stops) - 1, i))])
    rng = random.Random(seed)
    for _ in range(int(w * h / 900)):
        x, y = rng.randrange(w), rng.randrange(int(horizon * 0.8))
        b = rng.random()
        cv.px(x, y, "light4" if b > 0.9 else ("silver3" if b > 0.6 else "stone2"))
        if b > 0.97:
            for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                cv.px(x + dx, y + dy, "stone3")
    if moon:
        mx, my, r = int(w * 0.78), int(horizon * 0.22), 11
        for y in range(my - r - 6, my + r + 7):
            for x in range(mx - r - 6, mx + r + 7):
                d = math.hypot(x - mx, y - my)
                if d < r:
                    shade = (x - mx) * 0.6 + (y - my) * 0.4
                    cv.px(x, y, "silver4" if shade < -3 else ("silver3" if shade < 4 else "silver2"))
                elif d < r + 5 and (x + y) % 2 == 0 and d < r + 2 + (BAYER4[y % 4, x % 4] * 3):
                    cv.px(x, y, "void4")
        for (cx, cy, cr) in ((mx + 3, my - 2, 2), (mx - 4, my + 4, 1.5), (mx + 1, my + 5, 1)):
            cv.disc(cx, cy, cr, "silver1")
    return cv


def mountains(w=W, h=150, seed=3) -> Canvas:
    cv = Canvas(w, h)
    rng = random.Random(seed)
    layers = [
        (h * 0.35, 26, ["void2", "void3", "violet0"], 0.012),
        (h * 0.55, 18, ["void1", "void2", "void3"], 0.02),
    ]
    for base, amp, cols, freq in layers:
        ph = rng.random() * 10
        heights = []
        for x in range(w):
            v = math.sin(x * freq + ph) * amp + math.sin(x * freq * 2.7 + ph * 2) * amp * 0.4 + math.sin(x * freq * 7 + ph) * amp * 0.12
            heights.append(int(base - v))
        for x in range(w):
            top = heights[x]
            slope = heights[x] - heights[x - 1] if x > 0 else 0
            for y in range(max(0, top), h):
                col = cols[0]
                if y < top + 2:
                    col = cols[2] if slope >= 0 else cols[1]
                elif y < top + 6 and slope > 0 and (x + y) % 2 == 0:
                    col = cols[1]
                cv.px(x, y, col)
            # snow caps on the far range
            if cols[0] == "void2" and top < base - amp * 0.9:
                cv.px(x, top, "stone3")
                if (x % 3) and top + 1 < h:
                    cv.px(x, top + 1, "stone2")
    # mist band
    for y in range(int(h * 0.62), h):
        for x in range(w):
            if (BAYER4[y % 4, x % 4]) < (y - h * 0.62) / (h * 0.38) * 0.5:
                cv.px(x, y, "void1")
    return cv


def house(cv: Canvas, x: int, base: int, w: int, h: int, roof: int, rng: random.Random, lit=0.6):
    # walls
    for yy in range(base - h, base):
        for xx in range(x, x + w):
            cv.px(xx, yy, "void2" if xx > x else "void3")
    # roof (pitched)
    for i in range(roof):
        yy = base - h - i - 1
        x0 = x - 2 + i
        x1 = x + w + 1 - i
        if x0 > x1:
            break
        for xx in range(x0, x1 + 1):
            cv.px(xx, yy, "void1")
        cv.px(x0, yy, "violet1")  # moonlit edge
        cv.px(x0 + 1, yy, "void4") if x0 + 1 <= x1 else None
    # chimney
    if rng.random() < 0.6:
        cx = x + w - 3
        for yy in range(base - h - roof + 1, base - h - 1):
            cv.px(cx, yy, "void2")
            cv.px(cx + 1, yy, "void1")
    # windows
    for wy in range(base - h + 3, base - 3, 6):
        for wx in range(x + 2, x + w - 2, 5):
            if rng.random() < lit:
                cv.rect(wx, wy, 2, 3, "light2")
                cv.px(wx, wy, "light3")
                cv.px(wx + 1, wy + 2, "amber2")
            else:
                cv.rect(wx, wy, 2, 3, "void0")
    # door
    if w > 9:
        dx = x + w // 2 - 1
        cv.rect(dx, base - 5, 3, 5, "soil1")
        cv.px(dx + 2, base - 3, "amber3")


def great_lantern(cv: Canvas, x: int, base: int, lit: float):
    """Tall stone tower with a great iron-cage lantern on top."""
    th = 82
    for yy in range(base - th, base):
        t = (base - yy) / th
        half = int(10 - t * 3.5)
        for xx in range(x - half, x + half + 1):
            rel = (xx - (x - half)) / max(1, 2 * half)
            col = "stone2" if rel < 0.2 else ("stone1" if rel < 0.55 else ("void4" if rel < 0.85 else "void3"))
            if yy % 7 == 0:
                col = "void3"
            elif (yy // 7) % 2 == 0 and (xx - x) % 6 == 0:
                col = "void3"
            elif (yy // 7) % 2 == 1 and (xx - x + 3) % 6 == 0:
                col = "void3"
            cv.px(xx, yy, col)
        cv.px(x - half - 1, yy, "void1")
        cv.px(x + half + 1, yy, "void1")
    # arched door and a window slit
    cv.rect(x - 2, base - 8, 5, 8, "void0")
    cv.px(x - 1, base - 9, "void0"); cv.px(x, base - 9, "void0"); cv.px(x + 1, base - 9, "void0")
    cv.rect(x, base - 40, 1, 5, "amber2" if lit > 0.5 else "void0")
    # balcony
    bt = base - th
    for xx in range(x - 12, x + 13):
        cv.px(xx, bt, "void1")
        cv.px(xx, bt - 1, "stone2")
        cv.px(xx, bt + 1, "void2")
    for xx in range(x - 11, x + 12, 3):
        cv.px(xx, bt - 2, "stone1"); cv.px(xx, bt - 3, "stone1")
    # cage
    top = bt - 24
    for yy in range(top, bt - 3):
        for xx in range(x - 8, x + 9):
            edge = xx in (x - 8, x + 8) or (xx - x) % 4 == 0 or yy in (top, top + 10)
            if edge:
                cv.px(xx, yy, "void1")
            else:
                if lit > 0.5:
                    k = abs(xx - x) / 8 + abs(yy - (top + 10)) / 12
                    cv.px(xx, yy, "light4" if k < 0.4 else ("light3" if k < 0.75 else "light1"))
                else:
                    k = abs(xx - x) / 8 + abs(yy - (bt - 8)) / 8
                    cv.px(xx, yy, "amber1" if k < 0.3 else ("red1" if k < 0.6 else "void2"))
    # dome + finial
    for i in range(8):
        for xx in range(x - 10 + i, x + 11 - i):
            cv.px(xx, top - 1 - i, "void1" if xx > x - 9 + i else "stone1")
    cv.px(x, top - 9, "stone2")
    cv.px(x, top - 10, "stone3")
    cv.px(x, top - 11, "amber3")


def headframe(cv: Canvas, x: int, base: int):
    """Timber mine headframe with a pulley wheel over the shaft."""
    h = 54
    for i in range(h):
        y = base - i
        lx = x - 14 + i // 5
        rx = x + 14 - i // 5
        cv.px(lx, y, "soil2"); cv.px(lx - 1, y, "void1")
        cv.px(rx, y, "soil1"); cv.px(rx + 1, y, "void1")
    for yy in range(base - h + 4, base, 10):
        i = base - yy
        cv.line(x - 14 + i // 5, yy, x + 14 - i // 5, yy, "soil1")
    # wheel
    wy = base - h - 2
    for a in range(24):
        ang = a / 24 * math.tau
        cv.px(round(x + math.cos(ang) * 6), round(wy + math.sin(ang) * 6), "stone2")
    for a in range(4):
        ang = a / 4 * math.pi
        cv.line(round(x - math.cos(ang) * 5), round(wy - math.sin(ang) * 5), round(x + math.cos(ang) * 5), round(wy + math.sin(ang) * 5), "stone1")
    cv.disc(x, wy, 1.2, "silver3")
    # rope down
    for yy in range(wy + 6, base):
        cv.px(x + 6, yy, "sand1" if yy % 3 else "sand0")
    # lamp on the frame
    cv.px(x - 9, base - 30, "light4"); cv.px(x - 9, base - 29, "amber2")


def village(lit: float = 0.3, seed: int = 7) -> Canvas:
    h = 118
    cv = Canvas(W, h)
    rng = random.Random(seed)
    base = h
    # back row (smaller, darker)
    x = 2
    while x < W - 10:
        w = rng.randint(12, 20)
        if not (200 < x < 280):
            house(cv, x, base - 4, w, rng.randint(10, 16), rng.randint(5, 8), rng, lit=0.25 + lit * 0.4)
        x += w + rng.randint(2, 8)
    great_lantern(cv, 130, base, lit)
    headframe(cv, 240, base)
    # front row
    x = 0
    while x < W:
        w = rng.randint(16, 26)
        if not (196 < x + w and x < 284) and not (112 < x + w and x < 150):
            house(cv, x, base, w, rng.randint(14, 22), rng.randint(6, 10), rng, lit=0.4 + lit * 0.5)
        x += w + rng.randint(4, 14)
    # fence posts near the shaft
    for fx in list(range(204, 222, 4)) + list(range(260, 278, 4)):
        cv.rect(fx, base - 6, 1, 6, "soil1")
        cv.px(fx, base - 7, "soil2")
    cv.line(204, base - 4, 220, base - 4, "soil0")
    cv.line(260, base - 4, 276, base - 4, "soil0")
    return cv


def logo() -> Canvas:
    text = "GLIMMERDEEP"
    scale = 4
    glyphs = [F.U[ch] for ch in text]
    gw = [len(g[0]) for g in glyphs]
    total = sum(w * scale for w in gw) + (len(text) - 1) * scale + 12
    cv = Canvas(total + 8, 7 * scale + 16)
    ox, oy = 6, 5
    grad = ["light4", "light3", "light2", "light2", "amber3", "amber2", "amber1"]
    x = ox
    for g, w in zip(glyphs, gw):
        for gy, row in enumerate(g):
            for gx, ch in enumerate(row):
                if ch != "#":
                    continue
                for sy in range(scale):
                    for sx in range(scale):
                        py = gy * scale + sy
                        col = grad[min(len(grad) - 1, py * len(grad) // (7 * scale))]
                        cv.px(x + gx * scale + sx, oy + py, col)
        x += w * scale + scale
    # inner bevel: top-left highlight, bottom-right shade
    out = cv.copy()
    for y in range(cv.h):
        for xx in range(cv.w):
            if not cv.opaque(xx, y):
                continue
            if not cv.opaque(xx, y - 1) or not cv.opaque(xx - 1, y):
                out.px(xx, y, "light4")
            elif not cv.opaque(xx, y + 1) or not cv.opaque(xx + 1, y):
                out.px(xx, y, "amber0")
    # crystal glints inside letters
    rng = random.Random(9)
    for _ in range(14):
        gx, gy = rng.randrange(cv.w), rng.randrange(cv.h)
        if out.opaque(gx, gy) and out.opaque(gx + 1, gy + 1):
            out.px(gx, gy, "light4")
    # dark outline (2px) + drop shadow
    o1 = out.outline("void1", diagonal=True)
    o2 = o1.outline("void0", diagonal=False)
    shadow = Canvas(o2.w, o2.h)
    shadow.blit(o2.silhouette("void0"), 0, 2)
    shadow.blit(o2, 0, 0)
    return shadow


from palette import RAMPS, hex_to_rgba

_DARKER = {}
for _rn, _r in RAMPS.items():
    for _i, _hx in enumerate(_r):
        _DARKER[hex_to_rgba(_hx)[:3]] = hex_to_rgba(_r[max(0, _i - 1)]) if _i > 0 else hex_to_rgba(RAMPS["void"][0])


def darken(cv: Canvas, x: int, y: int, steps: int = 1):
    p = cv.get(x, y)
    if not p[3]:
        return
    col = p
    for _ in range(steps):
        col = _DARKER.get(col[:3], col)
    cv.px(x, y, col)


def cutaway_title() -> Canvas:
    """Key art: night village above, a cross-section of the deep below."""
    cv = Canvas(W, H)
    horizon = 132
    cv.blit(sky(W, horizon, horizon, seed=2), 0, 0)
    cv.blit(mountains(W, 90, seed=5), 0, horizon - 80)
    vv = village(lit=0.2, seed=11)
    cv.blit(vv, 0, horizon - vv.h)
    # earth cross-section using the real terrain textures
    textures = {name: fn() for name, (fn, _) in TL.MATERIALS.items()}
    bands = [("dirt", 0, 22), ("clay", 22, 34), ("stone", 34, 58), ("sandstone", 58, 76), ("crystalrock", 76, 100), ("basalt", 100, 122), ("voidstone", 122, 140)]
    top = horizon
    for y in range(top, H):
        for x in range(W):
            rel = y - top - math.sin(x * 0.045 + y * 0.01) * 3 - math.sin(x * 0.13) * 1.5
            name = bands[-1][0]
            for nm, a, b in bands:
                if a <= rel < b:
                    name = nm
                    break
            tex = textures[name]
            cv.a[y, x] = tex.a[y % 64, x % 64]
    # grass lip
    for x in range(W):
        cv.px(x, top, "moss3")
        cv.px(x, top + 1, "moss2" if x % 3 else "moss1")
    # darken depth progressively by shifting down each colour ramp
    for y in range(top, H):
        k = (y - top) / (H - top)
        for x in range(W):
            steps = int(k * 2.2 + BAYER4[y % 4, x % 4] * 0.9)
            if steps:
                darken(cv, x, y, steps)
    # the shaft & a side tunnel the Wick has carved
    bw = TL.build_backwall("soil", 301)

    def carve(x0, y0, x1, y1):
        for y in range(y0, y1):
            for x in range(x0, x1):
                cv.a[y, x] = bw.a[y % 64, x % 64]
        # dark rim so the tunnel reads as a hole
        for y in range(y0, y1):
            cv.px(x0, y, "void0")
            cv.px(x1 - 1, y, "void0")
    carve(232, top, 248, top + 98)
    carve(232, top + 82, 330, top + 98)
    carve(314, top + 98, 330, H)
    # ore & crystals glowing along the tunnels
    rng = random.Random(4)
    gems = [("teal", 0.0), ("amber", 0.2), ("blue", 0.5), ("red", 0.75), ("violet", 0.9)]
    for _ in range(46):
        x = rng.randrange(8, W - 8)
        y = rng.randrange(top + 6, H - 4)
        k = (y - top) / (H - top)
        rname = min(gems, key=lambda g: abs(g[1] - k))[0]
        r = ramp(rname)
        hgt = rng.randint(3, 6)
        for i in range(hgt):
            cv.px(x, y - i, r[3] if i < hgt - 1 else r[4])
            cv.px(x + 1, y - i, r[2]) if i < hgt - 2 else None
        cv.px(x - 1, y, r[1])
        # glow halo
        for gy in range(y - 6, y + 4):
            for gx in range(x - 5, x + 6):
                d = math.hypot(gx - x, gy - y + 2)
                if 2.5 < d < 5.5 and BAYER4[gy % 4, gx % 4] < 0.25:
                    cv.px(gx, gy, r[1])
    # the Wick in the tunnel with its light
    wick = P.body(lamp_flicker=0)
    wx, wy = 300, top + 98 - wick.h
    for gy in range(wy - 30, wy + 40):
        for gx in range(wx - 40, wx + 50):
            d = math.hypot(gx - (wx + 18), gy - (wy + 8))
            if d < 36 and 0 <= gy < H and 0 <= gx < W:
                band = 3 if d < 12 else (2 if d < 22 else (1 if d < 30 else 0))
                if band and BAYER4[gy % 4, gx % 4] < band / 3.2:
                    p = cv.get(gx, gy)
                    if p[:3] in (c("void0")[:3], c("void1")[:3], c("soil0")[:3], c("void2")[:3]):
                        cv.px(gx, gy, ["void1", "soil1", "amber0", "copper1"][band])
    cv.blit(wick, wx, wy)
    return cv


def camp_bg() -> Canvas:
    cv = Canvas(W, H)
    cv.blit(sky(W, 190, 190, seed=8, moon=True), 0, 0)
    cv.blit(mountains(W, 120, seed=9), 0, 70)
    v = village(lit=0.35, seed=21)
    cv.blit(v, 0, 190 - v.h)
    # ground
    tex = TL.mat_dirt()
    for y in range(190, H):
        for x in range(W):
            cv.a[y, x] = tex.a[y % 64, x % 64]
    for x in range(W):
        cv.px(x, 190, "moss3")
        cv.px(x, 191, "moss2")
    for y in range(192, H):
        for x in range(W):
            if BAYER4[y % 4, x % 4] < (y - 192) / 80:
                cv.px(x, y, "void1")
    return cv


def ending_bg() -> Canvas:
    cv = Canvas(W, H)
    s = sky(W, 200, 200, seed=13, moon=False)
    # warm dawn glow on the horizon
    for y in range(120, 200):
        for x in range(W):
            k = (y - 120) / 80
            if BAYER4[y % 4, x % 4] < k * 0.8:
                s.px(x, y, "amber0" if k < 0.6 else "copper1")
    cv.blit(s, 0, 0)
    cv.blit(mountains(W, 120, seed=14), 0, 80)
    v = village(lit=1.0, seed=11)
    cv.blit(v, 0, 200 - v.h)
    # great lantern halo
    lx, ly = 130, 200 - v.h + v.h - 78 - 10
    for y in range(ly - 60, ly + 60):
        for x in range(lx - 90, lx + 90):
            d = math.hypot(x - lx, (y - ly) * 1.2)
            if d < 85 and 0 <= y < H and 0 <= x < W:
                band = 3 if d < 25 else (2 if d < 50 else 1)
                if BAYER4[y % 4, x % 4] < band / 9:
                    p = cv.get(x, y)
                    if p[3] and p[:3] not in (c("light4")[:3], c("light3")[:3]):
                        cv.px(x, y, ["", "amber1", "amber2", "light1"][band])
    tex = TL.mat_dirt()
    for y in range(200, H):
        for x in range(W):
            cv.a[y, x] = tex.a[y % 64, x % 64]
    for x in range(W):
        cv.px(x, 200, "moss4" if x % 5 == 0 else "moss3")
        cv.px(x, 201, "moss2")
    return cv


def standalone() -> dict[str, Canvas]:
    return {
        "sky": sky(W, H, GROUND + 20, seed=1),
        "mountains": mountains(W, 150, seed=3),
        "village": village(lit=0.3, seed=7),
        "logo": logo(),
        "title_bg": cutaway_title(),
        "camp_bg": camp_bg(),
        "ending_bg": ending_bg(),
    }


def build() -> dict[str, Canvas]:
    """Small scenery sprites that live in the atlas."""
    f: dict[str, Canvas] = {}
    # drone (2 frames)
    for i in range(2):
        cv = Canvas(9, 7)
        cv.ellipse(4, 3.5, 3.2, 2.5, "silver2")
        cv.ellipse(3.6, 3, 1.8, 1.2, "silver3")
        cv.px(4, 3, "teal4"); cv.px(5, 3, "teal2")
        cv.px(0 if i == 0 else 1, 1, "stone3"); cv.px(8 if i == 0 else 7, 1, "stone3")
        f[f"drone_{i}"] = cv.outline("void0")
    return f
