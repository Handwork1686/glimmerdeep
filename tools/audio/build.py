"""Render all sound effects and music to public/assets/audio (OGG Vorbis).

    python3 tools/audio/build.py [--only sfx|music] [--track name]
"""
from __future__ import annotations

import json
import os
import subprocess
import sys
import tempfile
import time
import zlib

import numpy as np
from scipy.io import wavfile

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)

import music  # noqa: E402
import sfx  # noqa: E402
from synth import SR, limiter, rms_db  # noqa: E402

ROOT = os.path.abspath(os.path.join(HERE, "..", ".."))
OUT = os.path.join(ROOT, "public", "assets", "audio")


def encode(x: np.ndarray, path: str, q: int = 4):
    if x.ndim == 1:
        data = x
    else:
        data = x.T
    data = np.clip(data, -1, 1)
    with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as tmp:
        wavfile.write(tmp.name, SR, (data * 32767).astype(np.int16))
        subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-i", tmp.name, "-c:a", "libvorbis", "-q:a", str(q), path], check=True)
        os.unlink(tmp.name)


LOUD = {"tip": -24, "chain_milestone": -19, "death_gutter": -20, "ui_move": -26, "tick": -28, "ui_back": -22, "ui_select": -21, "ui_deny": -22, "drill_rock": -24, "drill_ore": -24,
        "pickup": -24, "thrust_start": -28, "heartbeat": -22, "reroll": -24, "biome": -21, "land": -22,
        "explode": -17, "levelup": -19, "achievement": -20, "shatter": -21, "cashout": -21, "seal_break": -16, "geode": -20,
        "relic": -19, "discover": -21, "heart_break": -15, "drill_loop": -26}


def short_lufs(x: np.ndarray) -> float:
    """Loudness of the loudest 400 ms window (approx. momentary LUFS)."""
    from synth import hp
    y = hp(x, 60)
    w = int(0.4 * SR)
    if len(y) <= w:
        return 10 * np.log10(np.mean(y ** 2) + 1e-12) - 0.691
    p = np.convolve(y ** 2, np.ones(w) / w, mode="valid")
    return 10 * np.log10(np.max(p) + 1e-12) - 0.691


def master_music(x: np.ndarray, target_db: float = -17.0) -> np.ndarray:
    # gentle high-pass to clear rumble, RMS normalise, peak limit
    from synth import hp
    x = np.stack([hp(x[0], 30), hp(x[1], 30)])
    g = 10 ** ((target_db - rms_db(x)) / 20)
    return limiter(x * g, 0.89)


def main():
    only = sys.argv[sys.argv.index("--only") + 1] if "--only" in sys.argv else None
    track = sys.argv[sys.argv.index("--track") + 1] if "--track" in sys.argv else None
    os.makedirs(os.path.join(OUT, "sfx"), exist_ok=True)
    os.makedirs(os.path.join(OUT, "music"), exist_ok=True)
    man_path = os.path.join(OUT, "manifest.json")
    manifest = json.load(open(man_path)) if os.path.exists(man_path) else {"sfx": {}, "music": {}}
    t0 = time.time()
    if only in (None, "sfx"):
        for key, (fn, n) in sfx.RECIPES.items():
            for i in range(n):
                seed = zlib.crc32(f"{key}:{i}".encode())
                np.random.seed(seed % (2**31))
                rng = np.random.default_rng(seed)
                x = fn(rng)
                nz = np.where(np.abs(x) > 1e-4)[0]
                if len(nz) and not key.endswith("_loop"):
                    x = x[: nz[-1] + 1]
                from synth import fade
                if not key.endswith("_loop"):
                    x = fade(x, 0.001, 0.008)
                else:
                    nz = np.arange(len(x))  # loops keep their exact length
                from synth import hp as _hp
                x = _hp(x, 25)
                target = LOUD.get(key, -20.0)
                k = 10 ** ((target - short_lufs(x)) / 20)
                x = x * k
                m = np.max(np.abs(x))
                if m > 0.9:
                    x = x * (0.9 / m)
                encode(x, os.path.join(OUT, "sfx", f"{key}_{i}.ogg"), q=4)
            manifest["sfx"][key] = n
        print(f"sfx: {len(sfx.RECIPES)} keys in {time.time() - t0:.1f}s")
    if only in (None, "music"):
        for name, fn in music.TRACKS.items():
            if track and name != track:
                continue
            t1 = time.time()
            np.random.seed(zlib.crc32(name.encode()) % (2**31))
            song, hi = fn()
            main_mix = song.render()
            if hi is not None:
                hi_mix = hi.render()
                # master both with the same gain so they sum correctly
                from synth import hp
                g = 10 ** ((-17.0 - rms_db(main_mix)) / 20)
                encode(limiter(main_mix * g, 0.89), os.path.join(OUT, "music", f"{name}.ogg"))
                encode(limiter(hi_mix * g, 0.6), os.path.join(OUT, "music", f"{name}_hi.ogg"))
                manifest["music"][name] = {"loopStart": 0, "stems": ["hi"]}
            else:
                encode(master_music(main_mix), os.path.join(OUT, "music", f"{name}.ogg"))
                manifest["music"][name] = {"loopStart": 0}
            print(f"  {name}: {main_mix.shape[1] / SR:.1f}s rendered in {time.time() - t1:.1f}s")
    if only in (None, "ambience"):
        manifest.setdefault("ambience", {})
        for kind in music.AMBIENCE:
            np.random.seed(zlib.crc32(("amb" + kind).encode()) % (2**31))
            x = music.ambience(kind)
            g = 10 ** ((-30.0 - rms_db(x)) / 20)
            encode(limiter(x * g, 0.5), os.path.join(OUT, "music", f"amb_{kind}.ogg"), q=3)
            manifest["ambience"][kind] = 1
        print("ambience:", len(music.AMBIENCE))
    json.dump(manifest, open(man_path, "w"), indent=1)


if __name__ == "__main__":
    main()
