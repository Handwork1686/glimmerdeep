"""Glimmerdeep master palette.

Every sprite, tile and UI element is drawn exclusively from these colours.
Ramps run dark -> light. Shadows shift toward violet, highlights toward warm
gold, which keeps the whole game feeling lantern-lit.
"""

RAMPS: dict[str, list[str]] = {
    # neutral void / outline ramp (violet-black)
    "void":   ["#07060c", "#0e0c18", "#17142a", "#241f3d", "#352c52"],
    # cool stone
    "stone":  ["#3a3350", "#4f4669", "#685e86", "#8a80a6", "#b2a9c8"],
    # soil
    "soil":   ["#24161a", "#3c2420", "#5a3426", "#7c4a30", "#a3673f"],
    # clay / sand
    "sand":   ["#6e4a32", "#94683f", "#bd8c52", "#dcb172", "#f2d79f"],
    # moss / life
    "moss":   ["#16302a", "#215035", "#3b7a3d", "#6aaa4a", "#b3dd7a"],
    # copper / warm metal
    "copper": ["#5c2a1e", "#8f4425", "#c46a2e", "#ec9446", "#ffc47e"],
    # lantern light
    "light":  ["#c98a2e", "#f2b544", "#ffd877", "#fff0b5", "#fffbea"],
    # silver
    "silver": ["#56607a", "#7f8ba3", "#aab6c9", "#d3dde8", "#f4f8fb"],
    # sapphire / cold crystal
    "blue":   ["#1a2352", "#26408c", "#3a6fd0", "#72aef2", "#c8ecff"],
    # glimmer teal
    "teal":   ["#123c44", "#1b6a6e", "#2ea59a", "#5fe0c4", "#c4fff0"],
    # ruby / ember / danger
    "red":    ["#3b0f22", "#76192f", "#bd2d3a", "#f0564a", "#ff9a73"],
    # void magenta (The Hollow)
    "violet": ["#2a0f3c", "#4f1f6e", "#8034a6", "#b862de", "#e9acff"],
    # amber
    "amber":  ["#6b3410", "#a65a12", "#dd8a1c", "#f7b740", "#ffe08a"],
}

TRANSPARENT = None


def hex_to_rgba(h: str, a: int = 255) -> tuple[int, int, int, int]:
    h = h.lstrip("#")
    return (int(h[0:2], 16), int(h[2:4], 16), int(h[4:6], 16), a)


# flat lookup: "stone3" -> rgba
COLORS: dict[str, tuple[int, int, int, int]] = {}
for _name, _ramp in RAMPS.items():
    for _i, _hex in enumerate(_ramp):
        COLORS[f"{_name}{_i}"] = hex_to_rgba(_hex)

ALL_RGB = {c[:3] for c in COLORS.values()}


def c(name: str, a: int = 255) -> tuple[int, int, int, int]:
    r, g, b, _ = COLORS[name]
    return (r, g, b, a)


def ramp(name: str) -> list[tuple[int, int, int, int]]:
    return [hex_to_rgba(h) for h in RAMPS[name]]


def export_hex_list() -> list[str]:
    out = []
    for r in RAMPS.values():
        out.extend(r)
    return out
