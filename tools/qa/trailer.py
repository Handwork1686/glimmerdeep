"""Assemble store/trailer.mp4 from captured segments (tools/qa/capture/tr*).

Each segment is upscaled x4 with nearest-neighbour to 1920x1080 @ 60 fps,
interleaved with pixel-font title cards, cross-faded, and scored with the
game's own music.
"""
from __future__ import annotations

import os
import subprocess
import sys
import xml.etree.ElementTree as ET

from PIL import Image

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
CAP = os.path.join(ROOT, "tools", "qa", "capture")
TMP = os.path.join(CAP, "_trailer")
OUT = os.path.join(ROOT, "store", "trailer.mp4")
FPS = 60


def font():
    tree = ET.parse(os.path.join(ROOT, "public/assets/fonts/pixel_o.xml"))
    sheet = Image.open(os.path.join(ROOT, "public/assets/fonts/pixel_o.png")).convert("RGBA")
    chars = {}
    for ch in tree.getroot().iter("char"):
        a = {k: int(v) for k, v in ch.attrib.items() if k != "page" and k != "chnl"}
        chars[chr(a["id"])] = a
    return sheet, chars


SHEET, CHARS = font()


def text_img(s: str, color=(255, 251, 234), scale=1) -> Image.Image:
    w = sum(CHARS.get(ch, CHARS[" "])["xadvance"] for ch in s) + 2
    img = Image.new("RGBA", (w, 11), (0, 0, 0, 0))
    x = 1
    for ch in s:
        c = CHARS.get(ch, CHARS[" "])
        glyph = SHEET.crop((c["x"], c["y"], c["x"] + c["width"], c["y"] + c["height"]))
        # tint white pixels, keep dark outline
        px = glyph.load()
        for yy in range(glyph.height):
            for xx in range(glyph.width):
                r, g, b, a = px[xx, yy]
                if a and r > 128:
                    px[xx, yy] = (*color, a)
        img.alpha_composite(glyph, (x + c["xoffset"], 1 + c["yoffset"]))
        x += c["xadvance"]
    if scale != 1:
        img = img.resize((img.width * scale, img.height * scale), Image.NEAREST)
    return img


def card(lines: list[tuple[str, tuple[int, int, int], int]], bg: str | None = None, logo: bool = False) -> Image.Image:
    base = Image.new("RGBA", (480, 270), (7, 6, 12, 255))
    if bg:
        b = Image.open(os.path.join(ROOT, "public/assets", bg)).convert("RGBA")
        dark = Image.new("RGBA", b.size, (7, 6, 12, 150))
        base = Image.alpha_composite(b, dark)
    y = 135 - sum(11 * s + 6 for _, _, s in lines) // 2
    if logo:
        lg = Image.open(os.path.join(ROOT, "public/assets/logo.png")).convert("RGBA")
        base.alpha_composite(lg, ((480 - lg.width) // 2, y - lg.height - 6))
    for s, col, sc in lines:
        t = text_img(s, col, sc)
        base.alpha_composite(t, ((480 - t.width) // 2, y))
        y += 11 * sc + 6
    return base


def run(cmd):
    subprocess.run(cmd, check=True)


def clip_from_frames(name: str, out: str, start: int = 0, count: int | None = None):
    src = os.path.join(CAP, name)
    n = len([f for f in os.listdir(src) if f.endswith(".png")])
    count = count or n - start
    run(["ffmpeg", "-y", "-loglevel", "error", "-framerate", str(FPS), "-start_number", str(start), "-i", os.path.join(src, "f%05d.png"),
         "-frames:v", str(count), "-vf", "scale=1920:1080:flags=neighbor,format=yuv420p", "-c:v", "libx264", "-preset", "medium",
         "-crf", "16", "-r", str(FPS), out])
    return count / FPS


def clip_from_image(img: Image.Image, out: str, seconds: float):
    p = out.replace(".mp4", ".png")
    img.convert("RGB").resize((1920, 1080), Image.NEAREST).save(p)
    run(["ffmpeg", "-y", "-loglevel", "error", "-loop", "1", "-framerate", str(FPS), "-i", p, "-t", str(seconds),
         "-vf", "format=yuv420p", "-c:v", "libx264", "-preset", "medium", "-crf", "16", "-r", str(FPS), out])
    return seconds


def main():
    os.makedirs(TMP, exist_ok=True)
    gold = (255, 216, 119)
    cream = (255, 251, 234)
    dim = (178, 169, 200)
    plan = [
        ("seg", "tr1_title"),
        ("card", [("The Great Lantern of Hearthmoor is going dark.", cream, 2)]),
        ("seg", "tr2_surface"),
        ("card", [("Dig deep.", gold, 3)]),
        ("seg", "tr3_amber"),
        ("card", [("Chain everything.", gold, 3)]),
        ("seg", "tr5_grotto"),
        ("card", [("Break the seals.", gold, 3)]),
        ("seg", "tr4_seal"),
        ("seg", "tr6_ember"),
        ("card", [("Find what the deep", gold, 3), ("is hiding.", gold, 3)]),
        ("seg", "tr7_hollow"),
        ("seg", "tr8_mantle"),
        ("card", [("Reach the Heart", gold, 3), ("of the world.", gold, 3)]),
        ("seg", "tr9_heart"),
        ("seg", "tr10_ending"),
        ("end", None),
    ]
    clips = []
    for i, (kind, arg) in enumerate(plan):
        out = os.path.join(TMP, f"c{i:02d}.mp4")
        if kind == "seg":
            if not os.path.isdir(os.path.join(CAP, arg)):
                print("missing", arg)
                continue
            d = clip_from_frames(arg, out)
        elif kind == "card":
            d = clip_from_image(card(arg), out, 1.6)
        else:
            img = card([("Carry the light down.", cream, 2), ("", cream, 1), ("Wishlist on Steam", gold, 2)], bg="title_bg.png", logo=True)
            d = clip_from_image(img, out, 4.5)
        clips.append((out, d))
        print(f"  clip {i}: {kind} {arg if kind != 'card' else ''} {d:.2f}s")
    # cross-fade chain
    xf = 0.35
    inputs = []
    for p, _ in clips:
        inputs += ["-i", p]
    parts = []
    acc = clips[0][1]
    prev = "[0:v]"
    for k in range(1, len(clips)):
        off = acc - xf
        lab = f"[v{k}]"
        parts.append(f"{prev}[{k}:v]xfade=transition=fade:duration={xf}:offset={off:.3f}{lab}")
        prev = lab
        acc = off + clips[k][1]
    total = acc
    # music: calm title intro into the Heart theme
    music_intro = os.path.join(ROOT, "public/assets/audio/music/title.ogg")
    music_main = os.path.join(ROOT, "public/assets/audio/music/heart.ogg")
    intro_len = clips[0][1] + 1.2
    af = (f"[{len(clips)}:a]atrim=0:{intro_len + 1.5},afade=t=out:st={intro_len}:d=1.5[a0];"
          f"[{len(clips) + 1}:a]aloop=loop=3:size=2e9,atrim=0:{total},adelay={int(intro_len * 1000)}|{int(intro_len * 1000)},"
          f"afade=t=in:st={intro_len}:d=0.6,afade=t=out:st={total - 2.5}:d=2.5[a1];"
          f"[a0][a1]amix=inputs=2:normalize=0,atrim=0:{total}[aout]")
    graph = ";".join(parts) + ";" + af
    cmd = ["ffmpeg", "-y", "-loglevel", "error", *inputs, "-i", music_intro, "-i", music_main, "-filter_complex", graph,
           "-map", prev, "-map", "[aout]", "-c:v", "libx264", "-preset", "slow", "-crf", "18", "-pix_fmt", "yuv420p",
           "-c:a", "aac", "-b:a", "192k", "-r", str(FPS), "-movflags", "+faststart", OUT]
    run(cmd)
    print(f"trailer: {OUT} ({total:.1f}s)")


if __name__ == "__main__":
    main()
