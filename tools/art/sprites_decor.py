"""Cave decorations, per biome. Floor pieces sit on the bottom edge of a 16x16
cell, ceiling pieces hang from its top edge. Frames: decor_<biome>_<f|c><n>."""
from __future__ import annotations

import math
import random

from lib import Canvas
from palette import c, ramp

T = 16


def roots(seed: int, cols=("soil1", "soil2", "soil3"), length=(8, 14), strands=3) -> Canvas:
    cv = Canvas(T, T)
    rng = random.Random(seed)
    for s in range(strands):
        x = rng.randint(3, 12)
        L = rng.randint(*length)
        for y in range(L):
            if rng.random() < 0.25:
                x += rng.choice((-1, 1))
            x = max(1, min(14, x))
            cv.px(x, y, cols[1] if y < L - 3 else cols[0])
            if y < 3:
                cv.px(x + 1, y, cols[2])
            if rng.random() < 0.15 and y > 2:  # rootlet
                d = rng.choice((-1, 1))
                cv.px(x + d, y + 1, cols[0])
                cv.px(x + 2 * d, y + 2, cols[0])
    return cv


def stalactite(seed: int, rmp, hang=True, w=5, h=11) -> Canvas:
    cv = Canvas(T, T)
    rng = random.Random(seed)
    cx = rng.randint(5, 10)
    for i in range(h):
        half = max(0, (w * (h - i)) // (2 * h))
        y = i if hang else T - 1 - i
        for dx in range(-half, half + 1):
            col = rmp[3] if dx < 0 else (rmp[2] if dx == 0 else rmp[1])
            cv.px(cx + dx, y, col)
    # a second smaller one
    cx2 = cx + rng.choice((-4, 4))
    for i in range(h // 2):
        half = max(0, (3 * (h // 2 - i)) // (h))
        y = i if hang else T - 1 - i
        for dx in range(-half, half + 1):
            cv.px(cx2 + dx, y, rmp[2] if dx <= 0 else rmp[1])
    return cv.outline("void1")


def crystal_cluster(seed: int, rmp, hang=False) -> Canvas:
    cv = Canvas(T, T)
    rng = random.Random(seed)
    base = 0 if hang else T - 1
    for k in range(rng.randint(2, 4)):
        x = rng.randint(4, 11)
        h = rng.randint(4, 9)
        lean = rng.choice((-1, 0, 0, 1))
        for i in range(h):
            y = base + i if hang else base - i
            xx = x + (lean * i) // 3
            cv.px(xx, y, rmp[4] if i == h - 1 else rmp[3])
            if i < h - 2:
                cv.px(xx + 1, y, rmp[2])
            if i < h - 3:
                cv.px(xx - 1, y, rmp[1])
    return cv.outline("void0")


def tuft(seed: int, cols=("moss1", "moss2", "moss3", "moss4")) -> Canvas:
    cv = Canvas(T, T)
    rng = random.Random(seed)
    for _ in range(rng.randint(4, 7)):
        x = rng.randint(2, 13)
        h = rng.randint(2, 5)
        lean = rng.choice((-1, 0, 1))
        for i in range(h):
            cv.px(x + (lean * i) // 2, T - 1 - i, cols[min(3, i)])
    return cv


def mushroom(seed: int, cap, stem=("sand2", "sand3"), glow_dot=None) -> Canvas:
    cv = Canvas(T, T)
    rng = random.Random(seed)
    for k in range(rng.randint(1, 3)):
        x = rng.randint(3, 12)
        h = rng.randint(2, 5)
        for i in range(h):
            cv.px(x, T - 1 - i, stem[0] if i < h - 1 else stem[1])
        w = rng.choice((2, 3))
        top = T - 1 - h
        for dx in range(-w, w + 1):
            cv.px(x + dx, top, cap[2] if dx < 0 else cap[1])
        for dx in range(-w + 1, w):
            cv.px(x + dx, top - 1, cap[3] if dx < 0 else cap[2])
        cv.px(x - 1, top - 1, cap[4])
        if glow_dot:
            cv.px(x + 1, top, glow_dot)
    return cv.outline("void1")


def bones(seed: int) -> Canvas:
    cv = Canvas(T, T)
    rng = random.Random(seed)
    # a rib cage / bone fragment lying on the floor
    x0 = rng.randint(2, 5)
    for i in range(9):
        cv.px(x0 + i, T - 2, "sand4" if i % 2 else "sand3")
    for k in range(3):
        x = x0 + 2 + k * 3
        for i in range(3 + (k % 2)):
            cv.px(x - (i // 2), T - 3 - i, "sand4")
    cv.px(x0 - 1, T - 2, "silver4"); cv.px(x0 - 1, T - 3, "silver3")
    return cv.outline("void1")


def magma_drip(seed: int, hang=True) -> Canvas:
    cv = stalactite(seed, [c("void1"), c("void2"), c("stone0"), c("void4"), c("stone1")], hang=hang, w=6, h=10)
    rng = random.Random(seed)
    x = 0
    for y in range(T):
        for xx in range(T):
            if cv.get(xx, y)[:3] == c("stone0")[:3] and rng.random() < 0.35:
                cv.px(xx, y, "red2")
                x = xx
    if hang:
        cv.px(x, 12, "amber3")
        cv.px(x, 13, "red3")
    return cv


def vent(seed: int) -> Canvas:
    cv = Canvas(T, T)
    for i, w in enumerate((6, 5, 4, 3)):
        for dx in range(-w, w + 1):
            cv.px(8 + dx, T - 1 - i, "void2" if abs(dx) > w - 2 else "stone0")
    cv.px(8, T - 4, "red3"); cv.px(7, T - 4, "amber3"); cv.px(9, T - 4, "red2"); cv.px(8, T - 5, "light3")
    return cv.outline("void0")


def tendrils(seed: int) -> Canvas:
    cv = Canvas(T, T)
    rng = random.Random(seed)
    for s in range(3):
        x = rng.randint(3, 12)
        L = rng.randint(7, 15)
        ph = rng.random() * 6
        for y in range(L):
            xx = int(round(x + math.sin(y * 0.6 + ph) * 1.5))
            cv.px(xx, y, "violet1" if y < L - 4 else "violet2")
            if y < 2:
                cv.px(xx + 1, y, "void3")
        cv.px(int(round(x + math.sin((L - 1) * 0.6 + ph) * 1.5)), L - 1, "violet4")
    return cv


def lava_pool(seed: int) -> Canvas:
    """A small crusted pool of glowing magma on the floor."""
    cv = Canvas(T, T)
    rng = random.Random(seed)
    w = rng.randint(5, 7)
    for dx in range(-w, w + 1):
        cv.px(8 + dx, T - 1, "void1")
    for dx in range(-w + 1, w):
        cv.px(8 + dx, T - 2, "red2" if (dx + seed) % 3 else "red3")
    for dx in range(-w + 2, w - 1):
        cv.px(8 + dx, T - 3, "amber3" if dx % 2 else "red3")
    cv.px(8 + rng.randint(-2, 2), T - 4, "light3")
    return cv.outline("void0")


def heart_shards(seed: int, hang=False) -> Canvas:
    """Golden crystal splinters of the World's Heart."""
    return crystal_cluster(seed, [c("amber0"), c("amber2"), c("light1"), c("light3"), c("light4")], hang=hang)


DECOR = {
    # biome: (floor variants, ceiling variants, glowing frame names)
    "rootsoil": ([lambda: tuft(1), lambda: tuft(2), lambda: mushroom(3, ramp("red")), lambda: mushroom(4, ramp("copper"))],
                 [lambda: roots(5), lambda: roots(6, strands=2), lambda: roots(7, length=(5, 9))]),
    "amberstone": ([lambda: bones(11), lambda: stalactite(12, ramp("sand"), hang=False, w=4, h=8), lambda: tuft(13, ("sand1", "sand2", "sand3", "sand4"))],
                   [lambda: stalactite(14, ramp("sand")), lambda: roots(15, ("sand0", "sand1", "sand2")), lambda: crystal_cluster(16, ramp("amber"), hang=True)]),
    "grotto": ([lambda: crystal_cluster(21, ramp("teal")), lambda: crystal_cluster(22, ramp("blue")), lambda: mushroom(23, ramp("blue"), ("stone3", "stone4"), "teal4")],
               [lambda: crystal_cluster(24, ramp("teal"), hang=True), lambda: stalactite(25, ramp("blue")), lambda: crystal_cluster(26, ramp("blue"), hang=True)]),
    "emberdeep": ([lambda: vent(31), lambda: stalactite(32, [c("void1"), c("void2"), c("violet0"), c("void4"), c("violet1")], hang=False, w=4, h=9), lambda: crystal_cluster(33, ramp("red"))],
                  [lambda: magma_drip(34), lambda: magma_drip(35), lambda: stalactite(36, [c("void1"), c("void2"), c("stone0"), c("void4"), c("stone1")])]),
    "hollow": ([lambda: mushroom(41, ramp("violet"), ("void3", "void4"), "violet4"), lambda: crystal_cluster(42, ramp("violet")), lambda: tuft(43, ("void3", "violet0", "violet1", "violet2"))],
               [lambda: tendrils(44), lambda: tendrils(45), lambda: crystal_cluster(46, ramp("violet"), hang=True)]),
    "mantle": ([lambda: lava_pool(51), lambda: vent(52), lambda: crystal_cluster(53, ramp("red"))],
               [lambda: magma_drip(54), lambda: magma_drip(55), lambda: stalactite(56, [c("void0"), c("red0"), c("void3"), c("red1"), c("stone1")])]),
    "heart": ([lambda: heart_shards(61), lambda: heart_shards(62), lambda: mushroom(63, ramp("amber"), ("sand2", "sand3"), "light4")],
              [lambda: heart_shards(64, hang=True), lambda: heart_shards(65, hang=True), lambda: stalactite(66, ramp("amber"))]),
}


def build() -> dict[str, Canvas]:
    f: dict[str, Canvas] = {}
    for biome, (floors, ceils) in DECOR.items():
        for i, fn in enumerate(floors):
            f[f"decor_{biome}_f{i}"] = fn()
        for i, fn in enumerate(ceils):
            f[f"decor_{biome}_c{i}"] = fn()
    return f
