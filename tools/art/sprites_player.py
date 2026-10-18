"""The Wick — the player's lantern-pod — and its drill bit."""
from __future__ import annotations

import math

from lib import BAYER4, Canvas
from palette import c, ramp

CU = ramp("copper")
ST = ramp("stone")
SV = ramp("silver")
LT = ramp("light")
TL = ramp("teal")

FW, FH = 22, 19  # frame size


def shade_ellipse(cv: Canvas, cx, cy, rx, ry, rmp, lo=1, hi=4, light=(-0.7, -0.75), clip=None):
    for y in range(int(cy - ry - 1), int(cy + ry + 2)):
        for x in range(int(cx - rx - 1), int(cx + rx + 2)):
            nx, ny = (x + 0.5 - cx) / rx, (y + 0.5 - cy) / ry
            d = nx * nx + ny * ny
            if d > 1.0:
                continue
            if clip and not clip(x, y):
                continue
            nz = math.sqrt(max(0.0, 1 - d))
            lit = -(nx * light[0] + ny * light[1]) * 0.9 + nz * 0.55
            v = lo + (hi - lo) * max(0.0, min(1.0, lit * 0.9 + 0.1))
            v += (BAYER4[y % 4, x % 4] - 0.5) * 0.55
            cv.px(x, y, rmp[max(lo, min(hi, int(v)))])


def body(frame: int = 0, tread_phase: int = 0, bob: int = 0, lamp_flicker: int = 0, lamp_swing: int = 0) -> Canvas:
    cv = Canvas(FW, FH)
    oy = bob
    # ---- lantern arm: rises from the back of the dome, runs forward, hooks down
    arm = [(6, 6), (6, 5), (6, 4), (6, 3), (7, 2)] + [(x, 2) for x in range(8, 18)] + [(18, 3), (18, 4)]
    arm = [(x, y + oy) for x, y in arm]
    if lamp_swing:
        arm[-1] = (18 + lamp_swing, 4 + oy)
    for x, y in arm:
        for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
            if (x + dx, y + dy) not in arm:
                cv.px(x + dx, y + dy, "void1")
    for k, (x, y) in enumerate(arm):
        cv.px(x, y, SV[3] if k % 4 == 0 else SV[2])
    # ---- lantern (6x7) hanging from the hook
    lx, ly = 16 + lamp_swing, 5 + oy
    lamp = [
        ".oaao.",
        "oaAAao",
        "oLWWlo",
        "olWWLo",
        "oLllLo",
        "oaAAao",
        ".oooo.",
    ]
    glow = [LT[2], LT[3]] if lamp_flicker == 0 else [LT[3], LT[2]]
    key = {"o": c("void1"), "a": c("amber0"), "A": c("amber2"), "L": glow[0], "l": glow[1], "W": LT[4]}
    for yy, row in enumerate(lamp):
        for xx, ch in enumerate(row):
            if ch != ".":
                cv.px(lx + xx, ly + yy, key[ch])
    # ---- hull dome
    cx, cy = 8.5, 12.0 + oy
    rx, ry = 6.8, 6.0
    floor = 15 + oy

    def inside(x, y, grow=0.0):
        nx, ny = (x + 0.5 - cx) / (rx + grow), (y + 0.5 - cy) / (ry + grow)
        return nx * nx + ny * ny <= 1.0 and y <= floor

    for y in range(0, FH):
        for x in range(0, FW):
            if inside(x, y, 1.0) and not inside(x, y):
                cv.px(x, y, "void1")
    for y in range(0, FH):
        for x in range(0, FW):
            if not inside(x, y):
                continue
            nx, ny = (x + 0.5 - cx) / rx, (y + 0.5 - cy) / ry
            lit = -0.65 * nx - 0.8 * ny
            if lit > 0.55:
                col = CU[4] if lit > 0.85 else CU[3]
            elif lit > -0.05:
                col = CU[2]
            elif lit > -0.6:
                col = CU[1]
            else:
                col = CU[0]
            cv.px(x, y, col)
    # belt with rivets
    for x in range(1, 17):
        if inside(x, floor - 1):
            cv.px(x, floor - 1, CU[1])
            cv.px(x, floor, CU[0])
            if x % 3 == 1:
                cv.px(x, floor - 1, CU[3])
    # back exhaust pipe
    for (x, y, col) in ((0, 10, "void1"), (0, 11, "void1"), (1, 9, "void1"), (1, 10, SV[2]), (1, 11, SV[1]), (1, 12, "void1"), (0, 12, "void1"), (0, 9, "void1")):
        cv.px(x, y + oy, col)
    # porthole on the front
    px, py = 11.5, 10.5 + oy
    cv.disc(px, py, 3.4, "void1")
    cv.disc(px, py, 2.7, SV[3])
    cv.disc(px + 0.3, py + 0.3, 2.2, SV[1])
    cv.disc(px, py, 1.9, TL[1])
    cv.disc(px - 0.5, py - 0.5, 1.2, TL[2])
    cv.px(10, 9 + oy, TL[4])
    cv.px(12, 11 + oy, TL[3])  # pilot eye glow
    # dome specular
    cv.px(4, 8 + oy, CU[4]); cv.px(5, 7 + oy, CU[4]); cv.px(3, 9 + oy, CU[3])
    # ---- treads
    ty = 16 + oy
    for x in range(1, 18):
        for y in range(ty - 1, ty + 4):
            if (x in (1, 17) and y in (ty - 1, ty + 3)):
                continue
            if y >= FH:
                continue
            cv.px(x, y, "void1")
    for x in range(2, 17):
        cv.px(x, ty, ST[1])
        cv.px(x, ty + 1, ST[1])
        cv.px(x, ty + 2, ST[0]) if ty + 2 < FH else None
    for x in range(2, 17):
        if (x + tread_phase) % 3 == 0:
            cv.px(x, ty - 1 if ty - 1 >= 0 else 0, ST[2]) if False else None
            cv.px(x, ty + 2, ST[2]) if ty + 2 < FH else None
    for wx in (3, 8, 13):
        cv.px(wx, ty, SV[3]); cv.px(wx + 1, ty, SV[2])
        cv.px(wx, ty + 1, SV[2]); cv.px(wx + 1, ty + 1, SV[0])
    del frame
    return cv


def drill(frame: int) -> Canvas:
    """Drill bit pointing right, 10x9. Spiral grooves scroll with frame."""
    cv = Canvas(10, 9)
    cy = 4
    for x in range(10):
        half = max(0, int(round(3.6 * (1 - x / 9.5))))
        for y in range(cy - half, cy + half + 1):
            t = (x + (y - cy) + frame * 2) % 4
            rel = (y - cy) / max(half, 1)
            base = 3 if rel < -0.3 else (2 if rel < 0.4 else 1)
            if t == 0:
                base = max(0, base - 1)
            cv.px(x, y, SV[base])
    # collar
    for y in range(cy - 4, cy + 5):
        cv.px(0, y, CU[1] if abs(y - cy) < 4 else "void1")
        cv.px(1, y, CU[3] if abs(y - cy) < 3 else CU[1])
    out = cv.outline("void1")
    out.px(9, cy, SV[4])
    return out


def build() -> dict[str, Canvas]:
    frames: dict[str, Canvas] = {}
    for i in range(2):  # idle: gentle bob + lantern flicker
        frames[f"wick_idle_{i}"] = body(bob=0, lamp_flicker=i)
    for i in range(4):  # move: tread scroll + slight bob
        frames[f"wick_move_{i}"] = body(tread_phase=i, bob=0, lamp_flicker=i % 2, lamp_swing=(0, -1, 0, 0)[i])
    for i in range(2):
        frames[f"wick_fly_{i}"] = body(bob=0, lamp_flicker=i)
    for i in range(3):
        frames[f"drill_{i}"] = drill(i)
    return frames
