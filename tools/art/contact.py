"""Render a dict of frames into a labelled-ish contact sheet for review."""
import sys; sys.path.insert(0,'.')
from lib import Canvas
from palette import c

def sheet(frames: dict, path: str, scale: int = 5, cols: int = 8, bg='void3'):
    items = list(frames.items())
    cw = max(f.w for _, f in items) + 4
    ch = max(f.h for _, f in items) + 4
    rows = (len(items) + cols - 1) // cols
    out = Canvas(cw * min(cols, len(items)), ch * rows, c(bg))
    for i, (_, f) in enumerate(items):
        x = (i % cols) * cw + (cw - f.w) // 2
        y = (i // cols) * ch + (ch - f.h) // 2
        out.blit(f, x, y)
    out.save(path, scale=scale)
