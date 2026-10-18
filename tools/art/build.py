"""Build every art asset into public/assets.

    python3 tools/art/build.py            # build
    python3 tools/art/build.py --preview  # also write review sheets to tools/art/out
"""
from __future__ import annotations

import json
import os
import sys
import time

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)

from lib import Canvas  # noqa: E402
from palette import ALL_RGB, export_hex_list  # noqa: E402
import font  # noqa: E402
import sprites_misc  # noqa: E402
import sprites_player  # noqa: E402
import tiles  # noqa: E402

ROOT = os.path.abspath(os.path.join(HERE, "..", ".."))
OUT = os.path.join(ROOT, "public", "assets")


def pack(frames: dict[str, Canvas], max_w: int = 1024, pad: int = 2) -> tuple[Canvas, dict]:
    items = sorted(frames.items(), key=lambda kv: (-kv[1].h, -kv[1].w, kv[0]))
    x = y = pad
    shelf_h = 0
    pos = {}
    for name, cv in items:
        if x + cv.w + pad > max_w:
            x = pad
            y += shelf_h + pad
            shelf_h = 0
        pos[name] = (x, y)
        x += cv.w + pad
        shelf_h = max(shelf_h, cv.h)
    total_h = y + shelf_h + pad
    h = 1
    while h < total_h:
        h *= 2
    sheet = Canvas(max_w, h)
    data = {"frames": {}, "meta": {"image": "atlas.png", "size": {"w": max_w, "h": h}, "scale": "1"}}
    for name, cv in items:
        px, py = pos[name]
        sheet.blit(cv, px, py, blend=False)
        data["frames"][name] = {
            "frame": {"x": px, "y": py, "w": cv.w, "h": cv.h},
            "rotated": False,
            "trimmed": False,
            "spriteSourceSize": {"x": 0, "y": 0, "w": cv.w, "h": cv.h},
            "sourceSize": {"w": cv.w, "h": cv.h},
        }
    return sheet, data


def audit_palette(name: str, cv: Canvas, allow_white: bool = False) -> list[str]:
    """Every opaque pixel must be a palette colour (or white/grey for tintables)."""
    bad = set()
    a = cv.a
    for y in range(cv.h):
        for x in range(cv.w):
            if a[y, x, 3] == 0:
                continue
            rgb = (int(a[y, x, 0]), int(a[y, x, 1]), int(a[y, x, 2]))
            if rgb in ALL_RGB:
                continue
            if allow_white and rgb[0] == rgb[1] == rgb[2]:
                continue
            bad.add(rgb)
    return [f"{name}: off-palette {b}" for b in list(bad)[:5]]


TINTABLE = ("chip_", "spark", "pixel", "dot2", "shard", "hit_", "twinkle_", "lightmask", "glow", "bar_fill")


def collect_sprites() -> dict[str, Canvas]:
    f: dict[str, Canvas] = {}
    f.update(sprites_player.build())
    f.update(sprites_misc.pickups())
    f.update(sprites_misc.currency_icons())
    f.update(sprites_misc.vfx())
    f.update(sprites_misc.ui())
    f.update(sprites_misc.icons())
    f.update(sprites_misc.light_masks())
    for i, cv in enumerate(tiles.crack_overlays()):
        f[f"crack_{i}"] = cv
    for extra in ("sprites_relics", "sprites_scenery", "sprites_decor"):
        try:
            mod = __import__(extra)
            f.update(mod.build())
        except ModuleNotFoundError:
            pass
    return f


def main() -> None:
    t0 = time.time()
    preview = "--preview" in sys.argv
    os.makedirs(OUT, exist_ok=True)
    os.makedirs(os.path.join(OUT, "fonts"), exist_ok=True)
    problems: list[str] = []

    # --- tiles
    sheet, meta = tiles.build_tileset()
    problems += audit_palette("tileset", sheet)
    sheet.save(os.path.join(OUT, "tiles.png"))
    with open(os.path.join(OUT, "tiles.json"), "w") as fh:
        json.dump(meta, fh)
    ao = tiles.ao_tiles()
    strip = Canvas(16 * 16, 16)
    for i, t in enumerate(ao):
        strip.blit(t, i * 16, 0, blend=False)
    strip.save(os.path.join(OUT, "ao.png"))
    for biome, (rname, seed) in tiles.BACKWALLS.items():
        bw = tiles.build_backwall(rname, seed)
        problems += audit_palette(f"backwall_{biome}", bw)
        bw.save(os.path.join(OUT, f"backwall_{biome}.png"))
        far = tiles.build_backwall_far(rname, seed)
        problems += audit_palette(f"backfar_{biome}", far)
        far.save(os.path.join(OUT, f"backfar_{biome}.png"))

    # --- sprite atlas
    frames = collect_sprites()
    for name, cv in frames.items():
        problems += audit_palette(name, cv, allow_white=name.startswith(TINTABLE))
    atlas, data = pack(frames)
    atlas.save(os.path.join(OUT, "atlas.png"))
    with open(os.path.join(OUT, "atlas.json"), "w") as fh:
        json.dump(data, fh)

    # --- big standalone images (backgrounds, logo)
    try:
        import sprites_scenery
        for name, cv in sprites_scenery.standalone().items():
            problems += audit_palette(name, cv, allow_white=False)
            cv.save(os.path.join(OUT, f"{name}.png"))
        import store  # the tall cutaway for the ending cinematic
        shaft = store.scene(480, 1000, 150, 240, 930, seed=12)
        problems += audit_palette("ending_shaft", shaft)
        shaft.save(os.path.join(OUT, "ending_shaft.png"))
    except ModuleNotFoundError:
        pass

    # --- fonts
    for outlined in (False, True):
        fs, xml = font.build(outlined)
        nm = "pixel_o" if outlined else "pixel"
        fs.save(os.path.join(OUT, "fonts", f"{nm}.png"))
        with open(os.path.join(OUT, "fonts", f"{nm}.xml"), "w") as fh:
            fh.write(xml)

    with open(os.path.join(OUT, "palette.json"), "w") as fh:
        json.dump(export_hex_list(), fh)

    if preview:
        import contact
        os.makedirs(os.path.join(HERE, "out"), exist_ok=True)
        atlas.save(os.path.join(HERE, "out", "atlas_x2.png"), scale=2)
        del contact

    if problems:
        print("PALETTE AUDIT FAILED:")
        for p in problems[:40]:
            print("  ", p)
        sys.exit(1)
    print(f"art built: {len(frames)} sprites, atlas {atlas.w}x{atlas.h}, tiles {sheet.w}x{sheet.h} in {time.time() - t0:.1f}s")


if __name__ == "__main__":
    main()
