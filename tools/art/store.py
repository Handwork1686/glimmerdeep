"""Steam store assets: capsules, library art, logo and app icon.

Everything is composed at pixel-art scale and upscaled with nearest-neighbour
by an integer factor, so the art stays crisp at every size.

    python3 tools/art/store.py
"""
from __future__ import annotations

import math
import os
import random
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)

from PIL import Image  # noqa: E402

from lib import BAYER4, Canvas  # noqa: E402
from palette import c, ramp  # noqa: E402
import sprites_player as P  # noqa: E402
import sprites_scenery as SC  # noqa: E402
import tiles as TL  # noqa: E402

ROOT = os.path.abspath(os.path.join(HERE, "..", ".."))
STORE = os.path.join(ROOT, "store")
BUILD = os.path.join(ROOT, "build")


def logo(scale: int) -> Canvas:
    import font as F
    text = "GLIMMERDEEP"
    glyphs = [F.U[ch] for ch in text]
    gw = [len(g[0]) for g in glyphs]
    total = sum(w * scale for w in gw) + (len(text) - 1) * scale
    cv = Canvas(total + 8, 7 * scale + 10)
    grad = ["light4", "light3", "light2", "light2", "amber3", "amber2", "amber1"]
    x = 4
    for g, w in zip(glyphs, gw):
        for gy, row in enumerate(g):
            for gx, ch in enumerate(row):
                if ch != "#":
                    continue
                for sy in range(scale):
                    for sx in range(scale):
                        py = gy * scale + sy
                        cv.px(x + gx * scale + sx, 3 + py, grad[min(6, py * 7 // (7 * scale))])
        x += w * scale + scale
    out = cv.copy()
    for y in range(cv.h):
        for xx in range(cv.w):
            if not cv.opaque(xx, y):
                continue
            if not cv.opaque(xx, y - 1) or not cv.opaque(xx - 1, y):
                out.px(xx, y, "light4")
            elif not cv.opaque(xx, y + 1) or not cv.opaque(xx + 1, y):
                out.px(xx, y, "amber0")
    o1 = out.outline("void1", diagonal=True).outline("void0")
    sh = Canvas(o1.w, o1.h + 2)
    sh.blit(o1.silhouette("void0"), 0, 2)
    sh.blit(o1, 0, 0)
    return sh


def glow(cv: Canvas, cx: float, cy: float, r: float, cols=("amber0", "copper1", "amber1", "amber2"), only_dark=True):
    for y in range(int(cy - r), int(cy + r) + 1):
        for x in range(int(cx - r), int(cx + r) + 1):
            if not cv.inb(x, y):
                continue
            d = math.hypot(x - cx, y - cy) / r
            if d >= 1:
                continue
            band = int((1 - d) * len(cols) + BAYER4[y % 4, x % 4] * 0.8)
            band = min(len(cols), band)
            if band <= 0:
                continue
            p = cv.get(x, y)
            if only_dark and p[3] and sum(p[:3]) > 330:
                continue
            cv.px(x, y, cols[band - 1])


def scene(w: int, h: int, horizon: int, shaft_x: int, wick_y: int, seed: int = 3, village_off: int = 0) -> Canvas:
    """Night village above, a cutaway of the deep below, the Wick in its shaft."""
    cv = Canvas(w, h)
    cv.blit(SC.sky(w, horizon, horizon, seed=seed, moon=True), 0, 0)
    mt = SC.mountains(max(w, 480), 90, seed=seed + 2)
    cv.blit(mt.crop(0, 0, w, 90), 0, horizon - 80)
    vil = SC.village(lit=0.25, seed=11)
    # place the headframe (x=240 in the village art) over the shaft
    vx = shaft_x - 240 + village_off
    cv.blit(vil, vx, horizon - vil.h)
    if vx > 0:
        cv.blit(vil.crop(480 - vx, 0, vx, vil.h), 0, horizon - vil.h)
    if vx + 480 < w:
        cv.blit(vil.crop(0, 0, w - vx - 480, vil.h), vx + 480, horizon - vil.h)
    textures = {name: fn() for name, (fn, _) in TL.MATERIALS.items()}
    bands = ["dirt", "clay", "stone", "sandstone", "crystalrock", "basalt", "voidstone", "magmarock", "heartrock"]
    depth_h = h - horizon
    for y in range(horizon, h):
        for x in range(w):
            rel = (y - horizon - math.sin(x * 0.045 + y * 0.01) * 3) / max(1, depth_h)
            name = bands[min(len(bands) - 1, max(0, int(rel * len(bands))))]
            cv.a[y, x] = textures[name].a[y % 64, x % 64]
    for x in range(w):
        cv.px(x, horizon, "moss3")
        cv.px(x, horizon + 1, "moss2" if x % 3 else "moss1")
    for y in range(horizon, h):
        k = (y - horizon) / max(1, depth_h)
        for x in range(w):
            steps = int(k * 2.0 + BAYER4[y % 4, x % 4] * 0.9)
            if steps:
                SC.darken(cv, x, y, steps)
    bw = TL.build_backwall("soil", 301)
    for y in range(horizon + 2, min(h, wick_y + 22)):
        for x in range(shaft_x - 8, shaft_x + 8):
            if cv.inb(x, y):
                cv.a[y, x] = bw.a[y % 64, x % 64]
        cv.px(shaft_x - 9, y, "void0")
        cv.px(shaft_x + 8, y, "void0")
    # crystals scattered in the rock with halos
    rng = random.Random(seed)
    gems = [("teal", 0.05), ("amber", 0.22), ("blue", 0.42), ("red", 0.6), ("violet", 0.76), ("red", 0.86), ("light", 0.97)]
    for _ in range(int(w * depth_h / 520)):
        x = rng.randrange(4, w - 4)
        y = rng.randrange(horizon + 6, h - 2)
        if abs(x - shaft_x) < 12 and y < wick_y + 22:
            continue
        k = (y - horizon) / max(1, depth_h)
        r = ramp(min(gems, key=lambda g: abs(g[1] - k))[0])
        hgt = rng.randint(3, 7)
        for gy in range(y - 6, y + 4):
            for gx in range(x - 5, x + 6):
                d = math.hypot(gx - x, gy - y + 2)
                if 2.5 < d < 5.8 and BAYER4[gy % 4, gx % 4] < 0.3 and cv.inb(gx, gy):
                    cv.px(gx, gy, r[1])
        for i in range(hgt):
            cv.px(x, y - i, r[3] if i < hgt - 1 else r[4])
            if i < hgt - 2:
                cv.px(x + 1, y - i, r[2])
        cv.px(x - 1, y, r[1])
    # the Wick, drilling down, lantern blazing
    wick = P.body(lamp_flicker=0)
    drill = P.drill(1).rot90(-1)
    glow(cv, shaft_x + 7, wick_y + 4, 34)
    cv.blit(wick, shaft_x - 10, wick_y)
    cv.blit(drill, shaft_x - drill.w // 2 - 1, wick_y + wick.h - 2)
    # flying chips & sparks from the bit
    for _ in range(18):
        a = rng.uniform(0, math.pi)
        d = rng.uniform(6, 18)
        x = int(shaft_x + math.cos(a) * d)
        y = int(wick_y + wick.h + 6 - math.sin(a) * d * 0.4)
        cv.px(x, y, rng.choice(["light4", "light3", "amber3", "stone3"]))
    return cv


def up(cv: Canvas, k: int) -> Image.Image:
    return cv.image().resize((cv.w * k, cv.h * k), Image.NEAREST)


def fit(img: Image.Image, w: int, h: int) -> Image.Image:
    """Center-crop to exact size (inputs are composed slightly larger)."""
    x = (img.width - w) // 2
    y = (img.height - h) // 2
    return img.crop((x, y, x + w, y + h))


def with_logo(cv: Canvas, lg: Canvas, y: int) -> Canvas:
    out = cv.copy()
    # soft dark band behind the logo for legibility
    for yy in range(y - 3, y + lg.h + 2):
        for xx in range(out.w):
            if out.inb(xx, yy) and BAYER4[yy % 4, xx % 4] < 0.55:
                SC.darken(out, xx, yy, 1)
    out.blit(lg, (out.w - lg.w) // 2, y)
    return out


def icon() -> Canvas:
    cv = Canvas(64, 64)
    for y in range(64):
        for x in range(64):
            # rounded square
            dx = max(0, abs(x - 31.5) - 24)
            dy = max(0, abs(y - 31.5) - 24)
            if math.hypot(dx, dy) <= 7.5:
                d = math.hypot(x - 44, y - 26) / 40
                band = int((1 - d) * 3 + BAYER4[y % 4, x % 4] * 0.9)
                cv.px(x, y, ["void0", "void1", "void2", "void3"][max(0, min(3, band))])
    glow(cv, 46, 27, 13, ("void3", "violet0", "amber0"), only_dark=False)
    wick = P.body(lamp_flicker=0)
    big = Canvas(wick.w * 2, wick.h * 2)
    for y in range(wick.h):
        for x in range(wick.w):
            p = wick.get(x, y)
            if p[3]:
                big.rect(x * 2, y * 2, 2, 2, p)
    cv.blit(big, 32 - big.w // 2 - 1, 32 - big.h // 2 + 2)
    # crystal accents
    for (x, y, rn) in ((10, 50, "teal"), (14, 52, "blue"), (52, 52, "violet")):
        r = ramp(rn)
        for i in range(5):
            cv.px(x, y - i, r[3] if i < 4 else r[4])
            cv.px(x + 1, y - i, r[2]) if i < 3 else None
    return cv


def main():
    os.makedirs(STORE, exist_ok=True)
    os.makedirs(BUILD, exist_ok=True)
    L3 = logo(3)
    L2 = logo(2)
    L4 = logo(4)
    out = {}
    # header capsule 920x430 (x4 -> 230x108)
    s = scene(232, 110, 46, 150, 60, seed=4)
    out["header_capsule.png"] = fit(up(with_logo(s, L3, 6), 4), 920, 430)
    out["library_header.png"] = out["header_capsule.png"]
    # small capsule 462x174 (x3 -> 154x58)
    s = scene(156, 60, 30, 128, 34, seed=6)
    out["small_capsule.png"] = fit(up(with_logo(s, L2, 4), 3), 462, 174)
    # main capsule 1232x706 (x4 -> 308x177)
    s = scene(310, 178, 70, 210, 104, seed=5)
    out["main_capsule.png"] = fit(up(with_logo(s, L3, 10), 4), 1232, 706)
    # vertical capsule 748x896 (x4 -> 187x224)
    s = scene(188, 226, 78, 94, 128, seed=7, village_off=-40)
    out["vertical_capsule.png"] = fit(up(with_logo(s, L2, 10), 4), 748, 896)
    # library capsule 600x900 (x3 -> 200x300)
    s = scene(202, 302, 104, 101, 180, seed=8, village_off=-30)
    out["library_capsule.png"] = fit(up(with_logo(s, L2, 14), 3), 600, 900)
    # library hero 3840x1240, artwork only (x8 -> 480x155)
    s = scene(482, 157, 78, 300, 104, seed=9)
    out["library_hero.png"] = fit(up(s, 8), 3840, 1240)
    # library logo 1280x720 transparent (x4 -> 320x180)
    lc = Canvas(320, 180)
    lc.blit(L4, (320 - L4.w) // 2, (180 - L4.h) // 2)
    out["library_logo.png"] = up(lc, 4)
    for name, img in out.items():
        img.save(os.path.join(STORE, name))
        print(f"  {name:24s} {img.width}x{img.height}")
    ic = icon()
    up(ic, 8).save(os.path.join(BUILD, "icon.png"))
    up(ic, 4).save(os.path.join(STORE, "icon_256.png"))
    up(ic, 1).resize((32, 32), Image.NEAREST).save(os.path.join(STORE, "icon_32.png"))
    # community icon 184x184
    up(ic, 3).resize((184, 184), Image.NEAREST).save(os.path.join(STORE, "community_icon.png"))
    print("  icon.png 512x512")


if __name__ == "__main__":
    main()
