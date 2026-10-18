"""Relic icons (one hand-drawn 12x12 keepsake per relic) and the World's Heart
crystal used by the ending. Frames: relic_<id>, heart_core."""
from __future__ import annotations

import math

from lib import Canvas, from_ascii
from palette import c

# Each relic: rows of 12 glyphs and a key of palette names. Drawn into a 14x14
# canvas with a 1 px void outline so they read on any background.
RELIC_ART: dict[str, tuple[list[str], dict[str, str]]] = {
    "oldpick": ([
        "............",
        "..aaaaaaaa..",
        ".abbbbbbbbc.",
        "ab...dd...bc",
        "b....dd....c",
        ".....de.....",
        ".....de.....",
        ".....de.....",
        ".....de.....",
        ".....de.....",
        ".....ee.....",
        "............",
    ], {"a": "silver4", "b": "silver2", "c": "stone2", "d": "soil4", "e": "soil2"}),
    "acorn": ([
        "......ab....",
        ".....ab.....",
        "..cccccccc..",
        ".cdddddddcc.",
        ".cccccccccc.",
        "..effffffe..",
        "..eggfffff..",
        "..egfffffe..",
        "...efffff...",
        "....efff....",
        ".....ff.....",
        "............",
    ], {"a": "moss3", "b": "soil2", "c": "stone2", "d": "stone4", "e": "stone4", "f": "stone2", "g": "silver4"}),
    "brasskey": ([
        "............",
        "..aaaa......",
        ".ab..ba.....",
        ".a....aaaaaa",
        ".a....abbbbb",
        ".ab..ba..b.b",
        "..aaaa...b.b",
        ".........c.c",
        "............",
        "............",
        "............",
        "............",
    ], {"a": "amber3", "b": "amber2", "c": "amber1"}),
    "wormcoil": ([
        "............",
        "...aaaaa....",
        "..ab...ba...",
        ".ab.aaa.ba..",
        ".a.ab.ba.a..",
        ".a.a.c.a.a..",
        ".a.ab.aa.a..",
        ".ab.....ba..",
        "..ab...ba...",
        "...aaaaa....",
        "............",
        "............",
    ], {"a": "teal3", "b": "teal4", "c": "light4"}),
    "ambereye": ([
        ".....a......",
        "....aab.....",
        "...aabbb....",
        "..aabbbbc...",
        "..abbddbbc..",
        ".aabdeedbc..",
        ".abbdddbbc..",
        ".abbbdbbbc..",
        "..abbbbbc...",
        "...cccccc...",
        "............",
        "............",
    ], {"a": "light4", "b": "amber3", "c": "amber1", "d": "soil1", "e": "red3"}),
    "sundial": ([
        "............",
        ".....a......",
        ".....ab.....",
        "..ccca.ccc..",
        ".cdddabdddc.",
        "cdeddabddedc",
        "cdddd.bddddc",
        "cdeddddddedc",
        ".cdddddddde.",
        "..cccccccc..",
        "............",
        "............",
    ], {"a": "amber4", "b": "amber2", "c": "stone1", "d": "sand3", "e": "sand1"}),
    "shellhorn": ([
        "............",
        "..........a.",
        "........aab.",
        "......aabb..",
        "....aabbc...",
        "..aabbbc....",
        ".abbbbc.....",
        "abddbc......",
        "abddc.......",
        ".acc........",
        "............",
        "............",
    ], {"a": "sand4", "b": "sand3", "c": "sand1", "d": "copper3"}),
    "miniature": ([
        "............",
        "....aaa.....",
        "...abbba....",
        "...accca..d.",
        "....ccc..ded",
        "...eeeee.ddd",
        "..e.eee.e.f.",
        "....eee..f..",
        "....g.g.....",
        "....g.g.....",
        "...gg.gg....",
        "............",
    ], {"a": "copper3", "b": "copper4", "c": "sand4", "d": "light3", "e": "silver2", "f": "stone2", "g": "stone1"}),
    "geodeheart": ([
        "............",
        "...aaaaaa...",
        "..abbbbbba..",
        ".abccdccdba.",
        ".abcdddddba.",
        "abcddeedddba",
        "abcddeeddcba",
        ".abcdddddba.",
        ".abccdcccba.",
        "..abbbbbba..",
        "...aaaaaa...",
        "............",
    ], {"a": "stone1", "b": "stone3", "c": "violet2", "d": "violet3", "e": "violet4"}),
    "mirror": ([
        "...aaaa.....",
        "..abbbba....",
        ".abcbbbba...",
        ".abcbbbba...",
        ".abbbbbba...",
        ".abbbbbba...",
        "..abbbba....",
        "...aaaa.....",
        "....dd......",
        "....dd......",
        "....ee......",
        "............",
    ], {"a": "amber3", "b": "blue3", "c": "light4", "d": "amber2", "e": "amber1"}),
    "bluebell": ([
        ".....a......",
        ".....b......",
        "....bcc.....",
        "...bccdd....",
        "...bcdddd...",
        "..bccddde...",
        "..bccddde...",
        ".bccdddddde.",
        ".eeeeeeeeee.",
        ".....f......",
        "............",
        "............",
    ], {"a": "silver3", "b": "blue4", "c": "blue3", "d": "blue2", "e": "blue1", "f": "teal4"}),
    "mapcase": ([
        "............",
        ".aa.......aa",
        "abba.....abb",
        "abbccccccabb",
        "abbcddedcabb",
        "abbcdeddcabb",
        "abbcddddcabb",
        "abbccccccabb",
        "abba.....abb",
        ".aa.......aa",
        "............",
        "............",
    ], {"a": "soil1", "b": "soil3", "c": "sand3", "d": "sand4", "e": "red2"}),
    "forgecoal": ([
        "............",
        "....aaaa....",
        "...abbbba...",
        "..abcbbdba..",
        ".abbcbbdbba.",
        ".abbbccbbba.",
        ".abdbbcbbba.",
        "..abdbbcba..",
        "...abbbba...",
        "....aaaa....",
        "............",
        "............",
    ], {"a": "void2", "b": "void3", "c": "amber3", "d": "red3"}),
    "anvil": ([
        "............",
        "............",
        ".aaaaaaaaa..",
        "abbbbbbbbba.",
        ".aabbbbbaa..",
        "....bbbb....",
        "....cccc....",
        "...cccccc...",
        "..cccccccc..",
        "..dddddddd..",
        "............",
        "............",
    ], {"a": "silver4", "b": "silver2", "c": "stone2", "d": "stone1"}),
    "salamander": ([
        "............",
        "...aaaaaa...",
        "..abbbbbba..",
        ".abccbbccba.",
        ".abcbbbbcba.",
        ".abbbccbbba.",
        "..abbccbba..",
        "..abbbbbba..",
        "...abbbba...",
        "....abba....",
        ".....aa.....",
        "............",
    ], {"a": "red1", "b": "red3", "c": "amber4"}),
    "bellows": ([
        "............",
        "..aaaa......",
        ".abbbba.....",
        "abbccbba....",
        "abbccbbaaddd",
        "abbccbbaaddd",
        "abbbbbba....",
        ".abbbba.....",
        "..aaaa......",
        ".ee..ee.....",
        "............",
        "............",
    ], {"a": "soil1", "b": "soil3", "c": "amber3", "d": "silver2", "e": "soil2"}),
    "starcompass": ([
        "....aaaa....",
        "..aabbbbaa..",
        ".abbbcbbbba.",
        ".abbbcbbbba.",
        "abbbcccbbbba",
        "abcccdcccbba",
        "abbbcccbbbba",
        ".abbbcbbbba.",
        ".abbbcbbbba.",
        "..aabbbbaa..",
        "....aaaa....",
        "............",
    ], {"a": "silver3", "b": "void3", "c": "violet4", "d": "light4"}),
    "voidpearl": ([
        "............",
        "....aaaa....",
        "...abbbba...",
        "..abccbbba..",
        ".abcdcbbbba.",
        ".abccbbbbba.",
        ".abbbbbbbba.",
        ".abbbbbbbea.",
        "..abbbbbea..",
        "...abeeea...",
        "....aaaa....",
        "............",
    ], {"a": "void1", "b": "violet0", "c": "violet2", "d": "violet4", "e": "void3"}),
    "moonlamp": ([
        ".....aa.....",
        "....a..a....",
        "...bbbbbb...",
        "...bcccdb...",
        "...bcecdb...",
        "...bcccdb...",
        "...bcccdb...",
        "...bbbbbb...",
        "....bbbb....",
        "............",
        "............",
        "............",
    ], {"a": "silver2", "b": "silver3", "c": "blue4", "d": "blue3", "e": "light4"}),
    "hourglass": ([
        "............",
        "..aaaaaaaa..",
        "...bccccb...",
        "...bddddb...",
        "....bddb....",
        ".....bb.....",
        ".....bb.....",
        "....b..b....",
        "...b....b...",
        "...bddddb...",
        "..aaaaaaaa..",
        "............",
    ], {"a": "soil3", "b": "silver3", "c": "sand3", "d": "sand4"}),
    "crown": ([
        "............",
        "............",
        ".a...a...a..",
        ".ab.aba.ab..",
        ".abbbcbbbb..",
        ".abbbbbbbb..",
        ".bdbbebbdb..",
        ".bbbbbbbbb..",
        ".ffffffffff.",
        "............",
        "............",
        "............",
    ], {"a": "light4", "b": "amber3", "c": "red3", "d": "teal3", "e": "red4", "f": "amber1"}),
    "chalice": ([
        "............",
        ".aaaaaaaaa..",
        ".abbbbbbbc..",
        ".abddddbbc..",
        "..abbbbbc...",
        "...abbbc....",
        "....abc.....",
        ".....b......",
        ".....b......",
        "...abbbc....",
        "..cccccc....",
        "............",
    ], {"a": "light3", "b": "red3", "c": "red1", "d": "amber4"}),
    "gearheart": ([
        "....a.a.....",
        "..a.aaa.a...",
        "...aabaa....",
        "aaab...baaa.",
        ".ab.c.c.ba..",
        "aab.ccc.baa.",
        ".ab..c..ba..",
        "aaab...baaa.",
        "...aabaa....",
        "..a.aaa.a...",
        "....a.a.....",
        "............",
    ], {"a": "amber2", "b": "amber3", "c": "red3"}),
    "sunstone": ([
        ".....a......",
        "..a..a..a...",
        "...a.a.a....",
        "....bbb.....",
        "aaabcccbaaa.",
        "....bcdcb...",
        "aaabcccbaaa.",
        "....bbb.....",
        "...a.a.a....",
        "..a..a..a...",
        ".....a......",
        "............",
    ], {"a": "light2", "b": "amber3", "c": "light3", "d": "light4"}),
}


def relic_icon(rows: list[str], key: dict[str, str]) -> Canvas:
    art = from_ascii(rows, key)
    cv = Canvas(14, 14)
    cv.blit(art, 1, 1)
    return cv.outline("void0")


def heart_core() -> Canvas:
    """A big faceted golden crystal for the ending's first beat (40x44)."""
    W, H = 40, 44
    cv = Canvas(W, H)
    cx, cy = W / 2, H / 2
    top, bot = (cx, 2.0), (cx, H - 3.0)
    left, right = (3.0, cy - 3), (W - 4.0, cy - 3)
    ml, mr = (11.0, cy + 6), (W - 12.0, cy + 6)
    cv.poly([top, right, mr, bot, ml, left], c("amber1"))
    # facets: lit from the upper left
    cv.poly([top, left, (cx - 4, cy - 2)], c("light4"))
    cv.poly([top, (cx - 4, cy - 2), (cx + 3, cy - 4)], c("light3"))
    cv.poly([top, (cx + 3, cy - 4), right], c("light2"))
    cv.poly([left, ml, (cx - 4, cy - 2)], c("light2"))
    cv.poly([(cx - 4, cy - 2), ml, bot, (cx + 1, cy + 4)], c("light1"))
    cv.poly([(cx - 4, cy - 2), (cx + 3, cy - 4), (cx + 1, cy + 4)], c("light3"))
    cv.poly([(cx + 3, cy - 4), right, mr, (cx + 1, cy + 4)], c("amber3"))
    cv.poly([(cx + 1, cy + 4), mr, bot], c("amber2"))
    # inner glow and glints
    for k in range(4):
        a = k * math.pi / 2 + 0.4
        cv.px(int(cx - 5 + math.cos(a) * 2), int(cy - 6 + math.sin(a) * 2), "light4")
    cv.px(int(cx - 7), int(cy - 9), "light4")
    cv.px(int(cx - 8), int(cy - 8), "light4")
    return cv.outline("amber0")


def build() -> dict[str, Canvas]:
    f = {f"relic_{rid}": relic_icon(rows, key) for rid, (rows, key) in RELIC_ART.items()}
    f["heart_core"] = heart_core()
    return f
