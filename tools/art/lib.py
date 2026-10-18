"""Tiny pixel-art toolkit: a palette-locked RGBA canvas plus drawing helpers."""
from __future__ import annotations

import math
import random
from typing import Callable, Iterable

import numpy as np
from PIL import Image

from palette import COLORS, c

RGBA = tuple[int, int, int, int]
CLEAR: RGBA = (0, 0, 0, 0)


class Canvas:
    def __init__(self, w: int, h: int, fill: RGBA = CLEAR):
        self.w, self.h = w, h
        self.a = np.zeros((h, w, 4), dtype=np.uint8)
        if fill != CLEAR:
            self.a[:, :] = fill

    # ---------------------------------------------------------------- basics
    def copy(self) -> "Canvas":
        o = Canvas(self.w, self.h)
        o.a = self.a.copy()
        return o

    def inb(self, x: int, y: int) -> bool:
        return 0 <= x < self.w and 0 <= y < self.h

    def px(self, x: int, y: int, col: RGBA | str | None) -> None:
        if col is None:
            return
        if isinstance(col, str):
            col = c(col)
        x, y = int(x), int(y)
        if self.inb(x, y):
            self.a[y, x] = col

    def get(self, x: int, y: int) -> RGBA:
        if not self.inb(x, y):
            return CLEAR
        return tuple(int(v) for v in self.a[y, x])  # type: ignore

    def opaque(self, x: int, y: int) -> bool:
        return self.inb(x, y) and self.a[y, x, 3] > 0

    def rect(self, x: int, y: int, w: int, h: int, col, fill: bool = True) -> None:
        for yy in range(y, y + h):
            for xx in range(x, x + w):
                if fill or yy in (y, y + h - 1) or xx in (x, x + w - 1):
                    self.px(xx, yy, col)

    def line(self, x0: int, y0: int, x1: int, y1: int, col) -> None:
        x0, y0, x1, y1 = int(x0), int(y0), int(x1), int(y1)
        dx, dy = abs(x1 - x0), -abs(y1 - y0)
        sx, sy = (1 if x0 < x1 else -1), (1 if y0 < y1 else -1)
        err = dx + dy
        while True:
            self.px(x0, y0, col)
            if x0 == x1 and y0 == y1:
                break
            e2 = 2 * err
            if e2 >= dy:
                err += dy
                x0 += sx
            if e2 <= dx:
                err += dx
                y0 += sy

    def disc(self, cx: float, cy: float, r: float, col) -> None:
        for y in range(int(cy - r - 1), int(cy + r + 2)):
            for x in range(int(cx - r - 1), int(cx + r + 2)):
                if (x - cx) ** 2 + (y - cy) ** 2 <= r * r:
                    self.px(x, y, col)

    def ellipse(self, cx: float, cy: float, rx: float, ry: float, col) -> None:
        for y in range(int(cy - ry - 1), int(cy + ry + 2)):
            for x in range(int(cx - rx - 1), int(cx + rx + 2)):
                if ((x - cx) / max(rx, 0.01)) ** 2 + ((y - cy) / max(ry, 0.01)) ** 2 <= 1.0:
                    self.px(x, y, col)

    def poly(self, pts: list[tuple[float, float]], col) -> None:
        """Scanline-filled polygon."""
        ys = [p[1] for p in pts]
        for y in range(int(min(ys)), int(max(ys)) + 1):
            xs = []
            n = len(pts)
            for i in range(n):
                x0, y0 = pts[i]
                x1, y1 = pts[(i + 1) % n]
                if (y0 <= y + 0.5 < y1) or (y1 <= y + 0.5 < y0):
                    xs.append(x0 + (y + 0.5 - y0) * (x1 - x0) / (y1 - y0))
            xs.sort()
            for i in range(0, len(xs) - 1, 2):
                for x in range(int(round(xs[i])), int(round(xs[i + 1]))):
                    self.px(x, y, col)

    def blit(self, other: "Canvas", ox: int, oy: int, blend: bool = True) -> None:
        """Source-over composite (vectorised)."""
        x0, y0 = max(0, ox), max(0, oy)
        x1, y1 = min(self.w, ox + other.w), min(self.h, oy + other.h)
        if x1 <= x0 or y1 <= y0:
            return
        src = other.a[y0 - oy:y1 - oy, x0 - ox:x1 - ox].astype(np.float32)
        dst = self.a[y0:y1, x0:x1].astype(np.float32)
        if not blend:
            m = src[..., 3:4] > 0
            self.a[y0:y1, x0:x1] = np.where(m, src, dst).astype(np.uint8)
            return
        sa = src[..., 3:4] / 255.0
        da = dst[..., 3:4] / 255.0
        oa = sa + da * (1 - sa)
        rgb = (src[..., :3] * sa + dst[..., :3] * da * (1 - sa)) / np.maximum(oa, 1e-6)
        out = np.concatenate([rgb, oa * 255.0], axis=-1)
        self.a[y0:y1, x0:x1] = np.clip(np.round(out), 0, 255).astype(np.uint8)

    def flip_h(self) -> "Canvas":
        o = self.copy()
        o.a = o.a[:, ::-1].copy()
        return o

    def flip_v(self) -> "Canvas":
        o = self.copy()
        o.a = o.a[::-1, :].copy()
        return o

    def rot90(self, k: int = 1) -> "Canvas":
        o = Canvas(self.h if k % 2 else self.w, self.w if k % 2 else self.h)
        o.a = np.rot90(self.a, k).copy()
        return o

    def crop(self, x: int, y: int, w: int, h: int) -> "Canvas":
        o = Canvas(w, h)
        o.a = self.a[y:y + h, x:x + w].copy()
        return o

    def map_colors(self, fn: Callable[[RGBA], RGBA | None]) -> "Canvas":
        o = self.copy()
        for y in range(self.h):
            for x in range(self.w):
                if self.a[y, x, 3]:
                    r = fn(tuple(int(v) for v in self.a[y, x]))
                    o.a[y, x] = r if r is not None else CLEAR
        return o

    def recolor(self, mapping: dict[str, str]) -> "Canvas":
        lut = {COLORS[k][:3]: COLORS[v] for k, v in mapping.items()}
        return self.map_colors(lambda p: lut.get(p[:3], p))

    def silhouette(self, col) -> "Canvas":
        if isinstance(col, str):
            col = c(col)
        return self.map_colors(lambda p: col)

    # -------------------------------------------------------------- outlines
    def outline(self, col, diagonal: bool = False, only_empty: bool = True) -> "Canvas":
        """Return a canvas grown by 0 px with a 1px outline drawn on empty
        pixels that touch opaque ones."""
        if isinstance(col, str):
            col = c(col)
        o = self.copy()
        nbr = [(1, 0), (-1, 0), (0, 1), (0, -1)]
        if diagonal:
            nbr += [(1, 1), (-1, 1), (1, -1), (-1, -1)]
        for y in range(self.h):
            for x in range(self.w):
                if self.a[y, x, 3]:
                    continue
                for dx, dy in nbr:
                    if self.opaque(x + dx, y + dy):
                        o.a[y, x] = col
                        break
        return o

    def padded(self, p: int) -> "Canvas":
        o = Canvas(self.w + 2 * p, self.h + 2 * p)
        o.a[p:p + self.h, p:p + self.w] = self.a
        return o

    def inner_edge(self, col, sides: str = "tl") -> "Canvas":
        """Paint opaque pixels on the given exposed sides (t,l,b,r)."""
        if isinstance(col, str):
            col = c(col)
        o = self.copy()
        d = {"t": (0, -1), "b": (0, 1), "l": (-1, 0), "r": (1, 0)}
        for y in range(self.h):
            for x in range(self.w):
                if not self.a[y, x, 3]:
                    continue
                for s in sides:
                    dx, dy = d[s]
                    if not self.opaque(x + dx, y + dy):
                        o.a[y, x] = col
                        break
        return o

    # ------------------------------------------------------------------ io
    def image(self) -> Image.Image:
        return Image.fromarray(self.a, "RGBA")

    def save(self, path: str, scale: int = 1) -> None:
        im = self.image()
        if scale != 1:
            im = im.resize((self.w * scale, self.h * scale), Image.NEAREST)
        im.save(path)


# ------------------------------------------------------------------ ascii art
def from_ascii(rows: Iterable[str], key: dict[str, str | None]) -> Canvas:
    rows = [r for r in rows]
    h = len(rows)
    w = max(len(r) for r in rows)
    cv = Canvas(w, h)
    for y, row in enumerate(rows):
        for x, ch in enumerate(row):
            if ch in (" ", "."):
                continue
            name = key.get(ch)
            if name is None:
                if ch not in key:
                    raise KeyError(f"unknown glyph {ch!r} in ascii art")
                continue
            cv.px(x, y, name)
    return cv


def parse_block(text: str) -> list[str]:
    """Strip a triple-quoted block into rows, keeping internal spaces."""
    lines = text.split("\n")
    while lines and not lines[0].strip():
        lines.pop(0)
    while lines and not lines[-1].strip():
        lines.pop()
    return [ln.rstrip().replace("|", "") for ln in lines]


# ------------------------------------------------------------------- noise
def value_noise(w: int, h: int, cell: int, seed: int, wrap: bool = True) -> np.ndarray:
    rng = np.random.default_rng(seed)
    gw, gh = max(1, w // cell), max(1, h // cell)
    grid = rng.random((gh + 1, gw + 1))
    if wrap:
        grid[-1, :] = grid[0, :]
        grid[:, -1] = grid[:, 0]
    out = np.zeros((h, w))
    for y in range(h):
        fy = y / cell
        y0 = int(fy) % gh if wrap else min(int(fy), gh - 1)
        ty = fy - int(fy)
        ty = ty * ty * (3 - 2 * ty)
        for x in range(w):
            fx = x / cell
            x0 = int(fx) % gw if wrap else min(int(fx), gw - 1)
            tx = fx - int(fx)
            tx = tx * tx * (3 - 2 * tx)
            a = grid[y0, x0]
            b = grid[y0, x0 + 1]
            cc = grid[y0 + 1, x0]
            d = grid[y0 + 1, x0 + 1]
            out[y, x] = (a * (1 - tx) + b * tx) * (1 - ty) + (cc * (1 - tx) + d * tx) * ty
    return out


def fbm(w: int, h: int, seed: int, cells=(16, 8, 4), weights=(0.6, 0.3, 0.1), wrap=True) -> np.ndarray:
    acc = np.zeros((h, w))
    for i, (cell, wt) in enumerate(zip(cells, weights)):
        acc += value_noise(w, h, cell, seed * 31 + i, wrap) * wt
    acc -= acc.min()
    acc /= max(acc.max(), 1e-6)
    return acc


BAYER4 = np.array([[0, 8, 2, 10], [12, 4, 14, 6], [3, 11, 1, 9], [15, 7, 13, 5]]) / 16.0


def quantize(v: float, levels: int, x: int, y: int, dither: float = 0.0) -> int:
    """Map 0..1 to 0..levels-1 with optional ordered dithering strength."""
    t = v * levels + (BAYER4[y % 4, x % 4] - 0.5) * dither
    return max(0, min(levels - 1, int(t)))


def rng_for(*parts) -> random.Random:
    return random.Random(hash(tuple(parts)) & 0xFFFFFFFF if False else "|".join(map(str, parts)))


def dist(x0, y0, x1, y1) -> float:
    return math.hypot(x1 - x0, y1 - y0)
