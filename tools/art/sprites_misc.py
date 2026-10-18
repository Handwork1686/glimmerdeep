"""Pickups, VFX, light masks and UI chrome."""
from __future__ import annotations

import math
import random

from lib import BAYER4, Canvas, from_ascii
from palette import c, ramp

V = ramp("void")
WHITE = (255, 255, 255, 255)
GREY = (176, 176, 176, 255)
DGREY = (110, 110, 110, 255)


# ---------------------------------------------------------------- pickups
def item(shape: str, rmp: list, outline="void0") -> Canvas:
    shapes = {
        "nugget": ["..aa..", ".abbc.", "abbbcd", "abccdd", ".cddd.", "..dd.."],
        "shard": ["....a.", "...ab.", "..abc.", ".abc..", "abc...", ".c...."],
        "bar": ["......", ".aaaa.", "abbbbc", "bccccd", ".dddd.", "......"],
        "drop": ["..a...", "..ab..", ".abbc.", "abbbcd", "abccdd", ".cddd."],
        "gem": ["..a...", ".abb..", "abbbc.", ".bccd.", "..cd..", "......"],
        "oval": [".aab..", "abbbc.", "abbccd", "bbccdd", ".cddd.", "......"],
        "star": ["..a...", "..b...", "abbbc.", "..c...", "..d...", "......"],
        "spiral": [".aaa..", "a.bba.", "a.a.a.", "a..ba.", ".aaa..", "......"],
        "crystal": ["...a..", "..ab..", "a.ab.a", "ababcb", "abbccd", ".cddd."],
    }
    rows = shapes[shape]
    key = {"a": rmp[4], "b": rmp[3], "c": rmp[2], "d": rmp[1]}
    cv = Canvas(8, 8)
    for y, r in enumerate(rows):
        for x, ch in enumerate(r):
            if ch in key:
                cv.px(x + 1, y + 1, key[ch])
    return cv.outline(outline)


def pickups() -> dict[str, Canvas]:
    R = ramp
    gold = [c("amber0"), c("amber2"), c("light1"), c("light2"), c("light4")]
    fo = [c("red0"), c("red1"), c("red2"), c("red3"), c("amber4")]
    am = [c("amber0"), c("amber1"), c("amber2"), c("light2"), c("light4")]
    q = [c("teal1"), c("teal2"), c("silver2"), c("silver4"), c("light4")]
    sm = [c("violet1"), c("silver1"), c("silver2"), c("silver4"), c("light4")]
    fossil = [c("soil1"), c("sand1"), c("sand2"), c("sand4"), c("sand4")]
    f = {
        "item_copper": item("nugget", R("copper")),
        "item_quartz": item("crystal", q),
        "item_silver": item("bar", R("silver")),
        "item_amber": item("drop", am),
        "item_fossil": item("spiral", fossil),
        "item_gold": item("nugget", gold),
        "item_sapphire": item("gem", R("blue")),
        "item_glimmer": item("crystal", R("teal")),
        "item_fireopal": item("oval", fo),
        "item_ruby": item("gem", R("red")),
        "item_starmetal": item("star", sm),
        "item_prism": item("gem", [c("violet1"), c("teal2"), c("red3"), c("amber4"), c("light4")]),
        "item_voidglass": item("crystal", R("violet")),
        "item_tin": item("nugget", [c("stone1"), c("stone2"), c("silver1"), c("silver2"), c("silver4")]),
        "item_jade": item("drop", R("moss")),
        "item_opal": item("oval", [c("blue1"), c("silver2"), c("blue3"), c("teal4"), c("light4")]),
        "item_emerald": item("gem", R("moss")),
        "item_aether": item("crystal", [c("teal1"), c("teal2"), c("silver3"), c("teal4"), c("light4")]),
        "item_cinnabar": item("nugget", R("red")),
        "item_moonstone": item("oval", [c("blue1"), c("silver2"), c("blue3"), c("silver4"), c("light4")]),
        "item_mithril": item("bar", [c("silver1"), c("silver2"), c("silver3"), c("silver4"), c("light4")]),
        "item_heartstone": item("crystal", [c("amber2"), c("light1"), c("light2"), c("light3"), c("light4")]),
    }
    # light orb (2 frames)
    for i in range(2):
        cv = Canvas(9, 9)
        cv.disc(4, 4, 3.6 - i * 0.4, c("light1"))
        cv.disc(4, 4, 2.6 - i * 0.3, c("light3"))
        cv.disc(3.6, 3.6, 1.3, c("light4"))
        f[f"orb_{i}"] = cv
    # core: the crystallised heart of a geode
    cv = Canvas(13, 13)
    cv.poly([(6.5, 0), (12.5, 6.5), (6.5, 13), (0.5, 6.5)], c("void0"))
    cv.poly([(6.5, 1.5), (11, 6.5), (6.5, 11.5), (2, 6.5)], c("teal1"))
    cv.poly([(6.5, 2.5), (9.5, 6.5), (6.5, 6.5), (3, 6.5)], c("teal3"))
    cv.poly([(6.5, 6.5), (9.5, 6.5), (6.5, 10.5)], c("teal2"))
    cv.px(5, 4, c("light4")); cv.px(6, 3, c("teal4"))
    f["item_core"] = cv
    return f


# ------------------------------------------------------------- currency icons
def currency_icons() -> dict[str, Canvas]:
    f = {}
    coin = from_ascii([
        ".oooo.",
        "oaLLao",
        "oLWlAo",
        "oLlLAo",
        "oaAAao",
        ".oooo.",
    ], {"o": "void0", "a": "amber1", "A": "amber2", "L": "light2", "l": "light1", "W": "light4"})
    f["ico_gold"] = coin
    gem = from_ascii([
        "..oo..",
        ".oWbo.",
        "oWbbBo",
        "obbBBo",
        ".oBBo.",
        "..oo..",
    ], {"o": "void0", "W": "blue4", "b": "blue3", "B": "blue2"})
    f["ico_gem"] = gem
    core = from_ascii([
        "..oo..",
        ".oWto.",
        "oWttTo",
        "ottTTo",
        ".oTTo.",
        "..oo..",
    ], {"o": "void0", "W": "teal4", "t": "teal3", "T": "teal1"})
    f["ico_core"] = core
    lamp = from_ascii([
        ".oo.",
        "oaao",
        "oWlo",
        "olLo",
        "oaao",
        ".oo.",
    ], {"o": "void0", "a": "amber1", "W": "light4", "l": "light3", "L": "light2"})
    f["ico_light"] = lamp
    return f


# ------------------------------------------------------------------- VFX
def vfx() -> dict[str, Canvas]:
    f: dict[str, Canvas] = {}
    # debris chips (white/grey for runtime tinting)
    chips = [
        ["##", "#+"],
        [".#.", "##+", ".+."],
        ["##.", "#++", ".+."],
        ["#"],
    ]
    for i, rows in enumerate(chips):
        cv = Canvas(len(rows[0]), len(rows))
        for y, r in enumerate(rows):
            for x, ch in enumerate(r):
                if ch == "#":
                    cv.px(x, y, WHITE)
                elif ch == "+":
                    cv.px(x, y, DGREY)
        f[f"chip_{i}"] = cv
    # spark / plus
    cv = Canvas(3, 3); cv.px(1, 0, GREY); cv.px(0, 1, GREY); cv.px(2, 1, GREY); cv.px(1, 2, GREY); cv.px(1, 1, WHITE)
    f["spark"] = cv
    cv = Canvas(1, 1); cv.px(0, 0, WHITE); f["pixel"] = cv
    cv = Canvas(2, 2); cv.rect(0, 0, 2, 2, WHITE); f["dot2"] = cv
    # shard projectile (pointing right)
    cv = Canvas(7, 3)
    for x in range(7):
        cv.px(x, 1, WHITE if x > 2 else GREY)
    cv.px(5, 0, GREY); cv.px(5, 2, GREY); cv.px(4, 0, DGREY); cv.px(4, 2, DGREY)
    f["shard"] = cv
    # hit spark burst, 3 frames, 9x9
    for i in range(3):
        cv = Canvas(9, 9)
        r = 1 + i * 1.5
        for a in range(8):
            ang = a * math.pi / 4
            x, y = 4 + math.cos(ang) * r, 4 + math.sin(ang) * r
            cv.px(round(x), round(y), WHITE if i < 2 else GREY)
            if i == 0:
                cv.px(4, 4, WHITE)
        f[f"hit_{i}"] = cv
    # dust puff, 4 frames 10x10 (stone tones)
    for i in range(4):
        cv = Canvas(10, 10)
        rng = random.Random(i + 3)
        for k in range(5):
            ang = k / 5 * 6.28 + 0.3
            rr = 1.5 + i * 0.9
            cx, cy = 5 + math.cos(ang) * rr, 5 + math.sin(ang) * rr * 0.7
            rad = max(0.6, 2.2 - i * 0.45 + rng.random() * 0.3)
            cv.disc(cx, cy, rad, c("stone2") if i < 2 else c("stone1"))
            cv.disc(cx - 0.4, cy - 0.4, rad * 0.5, c("stone3") if i < 3 else c("stone2"))
        f[f"dust_{i}"] = cv
    # explosion, 7 frames 34x34
    for i in range(7):
        cv = Canvas(34, 34)
        t = i / 6
        rng = random.Random(77 + i)
        R0 = 4 + t * 13
        if i < 5:
            for k in range(9):
                ang = k / 9 * 6.283 + rng.random() * 0.4
                rr = R0 * (0.55 + rng.random() * 0.35)
                cx, cy = 17 + math.cos(ang) * rr * 0.7, 17 + math.sin(ang) * rr * 0.7
                rad = R0 * (0.42 - t * 0.12) + 1
                col = [c("light4"), c("light3"), c("amber3"), c("red3"), c("red2")][min(4, i)]
                cv.disc(cx, cy, rad, c("red1") if i > 2 else c("amber2"))
                cv.disc(cx - 0.6, cy - 0.6, rad * 0.7, col)
            if i < 2:
                cv.disc(17, 17, R0 * 0.6, c("light4"))
        # smoke ring later frames
        if i >= 3:
            for k in range(10):
                ang = k / 10 * 6.283 + i
                rr = R0 * 0.95
                cx, cy = 17 + math.cos(ang) * rr, 17 + math.sin(ang) * rr
                rad = 3.2 - (i - 3) * 0.6
                if rad > 0.6:
                    cv.disc(cx, cy, rad, c("void3"))
                    cv.disc(cx - 0.5, cy - 0.5, rad * 0.55, c("stone0"))
        f[f"boom_{i}"] = cv
    # sparkle twinkle, 4 frames 7x7
    for i in range(4):
        cv = Canvas(7, 7)
        L = [1, 3, 2, 1][i]
        for d in range(-L, L + 1):
            cv.px(3 + d, 3, WHITE if abs(d) < L else GREY)
            cv.px(3, 3 + d, WHITE if abs(d) < L else GREY)
        f[f"twinkle_{i}"] = cv
    # thrust flame, 3 frames 6x7
    for i in range(3):
        cv = Canvas(6, 7)
        h = [5, 7, 6][i]
        for y in range(h):
            w = max(1, 3 - y // 2)
            for x in range(3 - w, 3 + w):
                col = c("light4") if y < 1 else (c("light2") if y < 3 else (c("amber2") if y < 5 else c("red2")))
                cv.px(x, y, col)
        f[f"flame_{i}"] = cv
    return f


def light_masks() -> dict[str, Canvas]:
    """White radial masks with banded alpha (dithered band edges)."""
    f = {}
    for name, size, bands in (("lightmask", 128, [1.0, 1.0, 0.92, 0.8, 0.64, 0.46, 0.3, 0.16, 0.06]), ("glow", 32, [0.55, 0.32, 0.16, 0.06]), ("glow_lg", 64, [0.5, 0.3, 0.15, 0.05])):
        cv = Canvas(size, size)
        r0 = size / 2
        for y in range(size):
            for x in range(size):
                d = math.hypot(x + 0.5 - r0, y + 0.5 - r0) / r0
                if d >= 1:
                    continue
                nb = len(bands)
                t = d * nb + (BAYER4[y % 4, x % 4] - 0.5) * 0.55
                idx = max(0, min(nb - 1, int(t)))
                a = bands[idx]
                cv.px(x, y, (255, 255, 255, int(a * 255)))
        f[name] = cv
    return f


# ---------------------------------------------------------------- UI chrome
def panel(border_hi: str, border_lo: str, fill: str, corner: str, size: int = 24) -> Canvas:
    cv = Canvas(size, size)
    s = size
    cv.rect(1, 1, s - 2, s - 2, fill)
    # outer dark outline
    for i in range(1, s - 1):
        cv.px(i, 0, "void0"); cv.px(i, s - 1, "void0"); cv.px(0, i, "void0"); cv.px(s - 1, i, "void0")
    # bevel
    for i in range(2, s - 2):
        cv.px(i, 1, border_hi); cv.px(1, i, border_hi)
        cv.px(i, s - 2, border_lo); cv.px(s - 2, i, border_lo)
    # inner shadow line
    for i in range(2, s - 2):
        cv.px(i, 2, "void0" if fill != "void0" else "void1")
    # corner rivets
    for (x, y) in ((1, 1), (s - 2, 1), (1, s - 2), (s - 2, s - 2)):
        cv.px(x, y, corner)
    return cv


def ui() -> dict[str, Canvas]:
    f: dict[str, Canvas] = {}
    f["panel"] = panel("stone2", "stone0", "void1", "copper3")
    f["panel_hi"] = panel("light2", "amber1", "void2", "light4")
    f["panel_dark"] = panel("void3", "void2", "void0", "stone1")
    f["card_common"] = panel("stone3", "stone1", "void1", "stone4")
    f["card_rare"] = panel("blue3", "blue1", "void1", "blue4")
    f["card_mythic"] = panel("amber3", "amber0", "void1", "light4")
    f["btn"] = panel("stone2", "stone0", "void2", "stone3", 16)
    f["btn_hi"] = panel("light3", "amber1", "void3", "light4", 16)
    # bars
    bar = Canvas(8, 6)
    bar.rect(0, 0, 8, 6, "void0")
    bar.rect(1, 1, 6, 4, "void2")
    f["bar_bg"] = bar
    fill = Canvas(4, 4)
    fill.rect(0, 0, 4, 4, WHITE)
    fill.rect(0, 0, 4, 1, (255, 255, 255, 255))
    fill.rect(0, 3, 4, 1, GREY)
    f["bar_fill"] = fill
    # cursor
    f["cursor"] = from_ascii([
        "o.......",
        "oWo.....",
        "oWWo....",
        "oWWWo...",
        "oWWWWo..",
        "oWWWWWo.",
        "oWWooo..",
        "oWo.....",
        "oo......",
    ], {"o": "void0", "W": "light4"})
    # selection arrow (right-pointing)
    f["arrow"] = from_ascii(["o...", "oWo.", "oWWo", "oWo.", "o..."], {"o": "void0", "W": "light3"})
    # node frames for the upgrade web (20x20)
    for name, hi, lo, fill_c in (("node_locked", "void3", "void2", "void1"), ("node_open", "stone3", "stone1", "void2"),
                                  ("node_owned", "amber3", "amber0", "void2"), ("node_max", "light4", "light1", "void3")):
        cv = Canvas(20, 20)
        cv.disc(9.5, 9.5, 9.6, "void0")
        cv.disc(9.5, 9.5, 8.6, hi)
        cv.disc(10.2, 10.2, 8.0, lo)
        cv.disc(9.5, 9.5, 7.4, fill_c)
        f[name] = cv
    return f


# ---------------------------------------------------------------- icons 12x12
ICON_KEY = {"o": "void0", "1": "stone1", "2": "stone2", "3": "stone3", "4": "silver4", "L": "light2", "l": "light3",
            "W": "light4", "a": "amber1", "A": "amber2", "c": "copper2", "C": "copper3", "r": "red2", "R": "red3",
            "t": "teal2", "T": "teal3", "b": "blue2", "B": "blue3", "v": "violet2", "V": "violet3", "g": "moss2", "G": "moss3"}

ICONS = {
    "lantern": [
        "....oo......",
        "...o..o.....",
        "...oooo.....",
        "..oaAAao....",
        "..oLWWlo....",
        "..olWWLo....",
        "..oLllLo....",
        "..oaAAao....",
        "...oooo.....",
    ],
    "radius": [
        "....oooo....",
        "..oo.ll.oo..",
        ".o.l....l.o.",
        ".ol..WW..lo.",
        "o.l.WWWW.l.o",
        "o.l.WWWW.l.o",
        ".ol..WW..lo.",
        ".o.l....l.o.",
        "..oo.ll.oo..",
        "....oooo....",
    ],
    "drain": [
        "...oooooo...",
        "..oWWWWWWo..",
        "...oLLLLo...",
        "....oLLo....",
        ".....oo.....",
        "....o..o....",
        "...o.ll.o...",
        "..o.llll.o..",
        "..oaAAAAao..",
        "...oooooo...",
    ],
    "drill": [
        "oo..........",
        "o4o.........",
        ".o44o.......",
        ".o343oo.....",
        "..o3433oo...",
        "..o23434ooo.",
        "...o23343344",
        "..o23434ooo.",
        "..o3433oo...",
        ".o343oo.....",
        ".o44o.......",
        "oo..........",
    ],
    "speed": [
        "............",
        "..oo...oo...",
        ".o4o..o4o...",
        ".o43o.o43o..",
        "..o43o.o43o.",
        "...o44o.o44o",
        "..o43o.o43o.",
        ".o43o.o43o..",
        ".o4o..o4o...",
        "..oo...oo...",
    ],
    "hull": [
        "..oooooooo..",
        ".oCCCCCCcco.",
        "oCCCCCCCccco",
        "oCCCttCCccco",
        "oCCtTTtCccco",
        "oCCCttCCccco",
        "ocCCCCCccaao",
        "o1111111111o",
        "o2o2o2o2o2oo",
        ".oooooooooo.",
    ],
    "thrust": [
        "...oooooo...",
        "..oCCCCcco..",
        "..occccaao..",
        "...oooooo...",
        "....oWWo....",
        "....oLlo....",
        "...oLllLo...",
        "...oAaaAo...",
        "....oaao....",
        ".....oo.....",
    ],
    "shard": [
        ".....o......",
        "....oWo.....",
        ".o..oTo..o..",
        "oWo.oTo.oWo.",
        ".oTooToTo...",
        "..oTTWTTo...",
        "..oTTTTTooo.",
        ".oooTTTTWWWo",
        "oWWWo...ooo.",
        ".ooo........",
    ],
    "chain": [
        "..oooo......",
        ".oTTTTo.....",
        "oTo..oTo....",
        "oTo..oToooo.",
        "oTo.ooWTTTTo",
        ".oTTWoo..oTo",
        "..ooToo..oTo",
        ".....oTo.oTo",
        ".....oTTTTo.",
        "......oooo..",
    ],
    "coin": [
        "...oooooo...",
        "..oLLLLLLo..",
        ".oLWllllLLo.",
        ".oLlLLLLlAo.",
        ".oLlLaaLlAo.",
        ".oLlLaaLlAo.",
        ".oLlLLLLlAo.",
        ".oLLllllAAo.",
        "..oAAAAAAo..",
        "...oooooo...",
    ],
    "magnet": [
        ".oooo..oooo.",
        "oRRRo..oRRRo",
        "orrro..orrro",
        "orrro..orrro",
        "orrro..orrro",
        "orrrooooRrro",
        ".orrrrrrrro.",
        "..oorrrroo..",
        "....oooo....",
    ],
    "gem": [
        "...oooooo...",
        "..oBBbBBbo..",
        ".oBBbbBbbbo.",
        "oooooooooooo",
        ".obBbbbbbbo.",
        "..obbbbbbo..",
        "...obbbbo...",
        "....obbo....",
        ".....oo.....",
    ],
    "flare": [
        ".....oo.....",
        "..o..oo..o..",
        "...o.ll.o...",
        "....oWWo....",
        "oollWWWWlloo",
        "oollWWWWlloo",
        "....oWWo....",
        "...o.ll.o...",
        "..o..oo..o..",
        ".....oo.....",
    ],
    "bomb": [
        "........oWo.",
        ".......oAo..",
        "......oao...",
        "...ooooo....",
        "..o2222o....",
        ".o233222o...",
        ".o232222o...",
        ".o222221o...",
        ".o222211o...",
        "..o2111o....",
        "...oooo.....",
    ],
    "drone": [
        "oooo....oooo",
        ".o44oooo44o.",
        "...o3333o...",
        "..o3tTT33o..",
        "..o3TWT33o..",
        "..o33tt33o..",
        "...o3333o...",
        "....oooo....",
    ],
    "dice": [
        ".oooooooooo.",
        "o4444444443o",
        "o4oo4444443o",
        "o4oo4444443o",
        "o4444oo4443o",
        "o4444oo4443o",
        "o4444444oo3o",
        "o4444444oo3o",
        "o3333333333o",
        ".oooooooooo.",
    ],
    "heart": [
        ".oo....oo...",
        "oRRo..oRRo..",
        "oRWRooRRro..",
        "oRRRRRRRro..",
        ".oRRRRRro...",
        "..oRRRro....",
        "...oRro.....",
        "....oo......",
    ],
    "eye": [
        "...oooooo...",
        ".oo4444443o.",
        "o444oooo443o",
        "o44otTTto43o",
        "o44oTWTto43o",
        "o444oooo433o",
        ".oo3333333o.",
        "...oooooo...",
    ],
    "plus": [
        "....oooo....",
        "....oGGo....",
        "....oGgo....",
        "ooooogGooooo",
        "oGGGGGGGGGgo",
        "oggggGggggo.",
        "ooooogGooooo",
        "....oGgo....",
        "....oggo....",
        "....oooo....",
    ],
    "lift": [
        "oooooooooooo",
        "o1o......o1o",
        "o1o.oooo.o1o",
        "o1oo3333oo1o",
        "o1o334433o1o",
        "o1o333333o1o",
        "o1o222222o1o",
        "o1oooooooo1o",
        "o1o......o1o",
        "oooooooooooo",
    ],
    "skull": [
        "..oooooo....",
        ".o444444o...",
        "o44444444o..",
        "o4oo44oo4o..",
        "o4oo44oo4o..",
        "o4444o4444o.",
        ".o44444444o.",
        "..o4o4o4o...",
        "...ooooo....",
    ],
    "clock": [
        "...oooooo...",
        "..o444444o..",
        ".o444o4444o.",
        "o4444o44443o",
        "o4444o44443o",
        "o4444ooo443o",
        "o444444444oo",
        ".o4444444o3.",
        "..o333333o..",
        "...oooooo...",
    ],
    "star": [
        ".....oo.....",
        "....oWlo....",
        "....oLlo....",
        "ooooolLooooo",
        "oWLLLlLLLLAo",
        ".oaLLLLLLao.",
        "..oaLLLLao..",
        "..oLLooLLo..",
        ".oLao..oaLo.",
        ".ooo....ooo.",
    ],
    "moth": [
        "o..........o",
        ".o........o.",
        "oooo.oo.oooo",
        "o22o.33.o22o",
        "oA2oo33oo2Ao",
        "o222o33o222o",
        ".o22o33o22o.",
        "..oo.33.oo..",
        ".....oo.....",
    ],
}


def icons() -> dict[str, Canvas]:
    out = {}
    for name, rows in ICONS.items():
        w = max(len(r) for r in rows)
        rows = [r.ljust(w, ".") for r in rows]
        cv = from_ascii(rows, {**ICON_KEY, ".": None})
        # center into 14x14
        o = Canvas(14, 14)
        o.blit(cv, (14 - cv.w) // 2, (14 - cv.h) // 2)
        out[f"icon_{name}"] = o
    return out
