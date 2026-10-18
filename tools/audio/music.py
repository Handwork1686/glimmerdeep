"""Glimmerdeep soundtrack: a tiny sequencer, instruments and the compositions.

Every track is a seamless loop (reverb tails wrap to the start). Biome tracks
also render an aligned 'hi' stem (extra percussion/arps) the game fades in
during chains.
"""
from __future__ import annotations

import random
import zlib

import numpy as np

from synth import (SR, bp, drive, env, exp_decay, fm, hat, hp, karplus, kick, lp, midi_hz, note, osc, reverb,
                   shaker, snare, tom)

# ---------------------------------------------------------------- harmony
CHORD_TYPES = {"": [0, 4, 7], "m": [0, 3, 7], "7": [0, 4, 7, 10], "m7": [0, 3, 7, 10], "maj7": [0, 4, 7, 11],
               "sus2": [0, 2, 7], "sus4": [0, 5, 7], "dim": [0, 3, 6], "add9": [0, 4, 7, 14], "m9": [0, 3, 7, 10, 14]}


def chord(sym: str, octave: int = 3) -> list[int]:
    root = sym[0]
    rest = sym[1:]
    acc = 0
    if rest[:1] in ("#", "b"):
        acc = 1 if rest[0] == "#" else -1
        rest = rest[1:]
    bass = None
    if "/" in rest:
        rest, bass = rest.split("/")
    base = note(f"{root}{octave}") + acc
    notes = [base + i for i in CHORD_TYPES[rest]]
    if bass:
        b = note(f"{bass[0]}{octave - 1}") + (1 if "#" in bass else -1 if "b" in bass[1:] else 0)
        notes = [b] + notes
    return notes


def scale(root: str, mode: str) -> list[int]:
    modes = {"major": [0, 2, 4, 5, 7, 9, 11], "minor": [0, 2, 3, 5, 7, 8, 10], "dorian": [0, 2, 3, 5, 7, 9, 10],
             "phrygian": [0, 1, 3, 5, 7, 8, 10], "lydian": [0, 2, 4, 6, 7, 9, 11], "penta": [0, 3, 5, 7, 10],
             "majpenta": [0, 2, 4, 7, 9]}
    r = note(f"{root}0") % 12
    return [r + i for i in modes[mode]]


def melody(tokens: str, octave_shift: int = 0, semis: int = 0) -> list[tuple[int | None, float]]:
    out = []
    for tok in tokens.split():
        if tok == "|":
            continue
        n, d = tok.split(":")
        out.append((None if n == "-" else note(n) + 12 * octave_shift + semis, float(d)))
    return out


# ------------------------------------------------------------- instruments
def i_pluck(f, dur, vel, seed=0):
    x = karplus(f, dur + 0.3, 0.9965 if f < 400 else 0.993, 0.45, seed)
    return lp(x, 4500) * env(len(x), 0.002, 0.1, 0.8, 0.25, dur + 0.05) * vel


def i_bell(f, dur, vel, seed=0):
    d = max(dur, 0.6) + 0.8
    return fm(f, d, 2.0, 1.6, 0.25) * exp_decay(int(d * SR), 0.5) * vel * 0.6


def i_musicbox(f, dur, vel, seed=0):
    d = max(dur, 0.5) + 0.6
    n = int(d * SR)
    x = osc("sine", f, d) * 0.7 + osc("sine", f * 4.01, d) * 0.12 * exp_decay(n, 0.08) + osc("sine", f * 2, d) * 0.15
    return x * exp_decay(n, 0.45) * vel * 0.6


def i_marimba(f, dur, vel, seed=0):
    d = max(dur, 0.35) + 0.25
    n = int(d * SR)
    x = fm(f, d, 4.0, 1.2, 0.03) * exp_decay(n, 0.18) + osc("sine", f, d) * exp_decay(n, 0.3) * 0.5
    return x * vel * 0.6


def i_pad(f, dur, vel, seed=0):
    d = dur + 0.8
    x = np.zeros(int(d * SR))
    for det in (0.994, 1.0, 1.006):
        x += osc("saw", f * det, d, phase0=random.Random(seed).random())
    x = lp(x / 3, min(2200, f * 6))
    return x * env(len(x), 0.35, 0.3, 0.8, 0.8, dur) * vel * 0.35


def i_choir(f, dur, vel, seed=0):
    d = dur + 0.8
    n = int(d * SR)
    vib = 1 + 0.004 * np.sin(2 * np.pi * 5.2 * np.arange(n) / SR)
    x = osc("saw", f * vib, d) + osc("saw", f * 1.003 * vib, d)
    x = bp(x, 500, 1100) * 0.7 + bp(x, 2300, 3000) * 0.25
    return x * env(n, 0.4, 0.3, 0.8, 0.7, dur) * vel * 0.5


def i_bass(f, dur, vel, seed=0):
    d = dur + 0.08
    n = int(d * SR)
    x = osc("tri", f, d) * 0.7 + osc("sine", f, d) * 0.5 + lp(osc("saw", f, d), 600) * 0.25
    return x * env(n, 0.005, 0.12, 0.7, 0.07, dur) * vel * 0.8


def i_sawbass(f, dur, vel, seed=0):
    d = dur + 0.06
    n = int(d * SR)
    x = osc("saw", f, d) + osc("square", f * 0.5, d, 0.5) * 0.4
    x = lp(x, 500 + 900 * vel)
    return drive(x * env(n, 0.003, 0.1, 0.6, 0.05, dur), 1.6) * vel * 0.55


def i_lead(f, dur, vel, seed=0):
    d = dur + 0.12
    n = int(d * SR)
    t = np.arange(n) / SR
    vib = 1 + 0.006 * np.sin(2 * np.pi * 5.5 * t) * np.clip((t - 0.15) * 4, 0, 1)
    x = osc("square", f * vib, d, 0.3) * 0.5 + osc("square", f * 1.004 * vib, d, 0.5) * 0.3
    return lp(x, 3200) * env(n, 0.01, 0.1, 0.65, 0.1, dur) * vel * 0.35


def i_glass(f, dur, vel, seed=0):
    d = max(dur, 0.4) + 1.0
    n = int(d * SR)
    x = sum(osc("sine", f * r, d) * exp_decay(n, 0.6 / (1 + k)) * a for k, (r, a) in enumerate(((1, 0.6), (2.76, 0.25), (5.4, 0.12), (8.93, 0.06))))
    return x * vel * 0.55


INSTR = {"pluck": i_pluck, "bell": i_bell, "musicbox": i_musicbox, "marimba": i_marimba, "pad": i_pad,
         "choir": i_choir, "bass": i_bass, "sawbass": i_sawbass, "lead": i_lead, "glass": i_glass}

DRUM = {
    "k": lambda: kick(0.45, 140, 45) * 0.9,
    "K": lambda: kick(0.55, 160, 40, 1.2) * 1.0,
    "s": lambda: snare() * 0.55,
    "h": lambda: hat() * 0.45,
    "H": lambda: hat(open_=True) * 0.35,
    "x": lambda: shaker() * 0.6,
    "t": lambda: tom(110) * 0.6,
    "T": lambda: tom(75) * 0.7,
    "c": lambda: hp(np.random.uniform(-1, 1, int(0.03 * SR)), 2000) * exp_decay(int(0.03 * SR), 0.006) * 0.4,
}


class Song:
    def __init__(self, bpm: float, bars: int, beats: int = 4, verb: float = 2.6, damp: float = 3500):
        self.bpm = bpm
        self.bars = bars
        self.beats = beats
        self.spb = 60 / bpm
        self.length = int(bars * beats * self.spb * SR)
        self.dry = np.zeros((2, self.length + SR * 4))
        self.send = np.zeros(self.length + SR * 4)
        self.verb = verb
        self.damp = damp
        self.rng = random.Random(bpm * 1000 + bars)

    def beat_t(self, beat: float) -> int:
        return int(beat * self.spb * SR)

    def add(self, x: np.ndarray, beat: float, pan: float = 0.0, send: float = 0.25, gain: float = 1.0):
        s = self.beat_t(beat)
        if s >= self.length:
            return
        n = min(len(x), self.dry.shape[1] - s)
        l = np.cos((pan + 1) * np.pi / 4)
        r = np.sin((pan + 1) * np.pi / 4)
        self.dry[0, s:s + n] += x[:n] * l * gain
        self.dry[1, s:s + n] += x[:n] * r * gain
        self.send[s:s + n] += x[:n] * send * gain

    def play(self, inst: str, midi: int, beat: float, beats: float, vel: float = 0.8, pan: float = 0.0, send: float = 0.25, humanize: float = 0.01):
        f = midi_hz(midi)
        beat += self.rng.uniform(-humanize, humanize)
        vel *= self.rng.uniform(0.92, 1.05)
        x = INSTR[inst](f, beats * self.spb, vel, seed=self.rng.randrange(1 << 30))
        self.add(x, max(0, beat), pan, send)

    def seq(self, inst: str, notes, start_beat: float = 0, vel: float = 0.8, pan: float = 0.0, send: float = 0.3, legato: float = 0.95):
        b = start_beat
        for m, d in notes:
            if m is not None:
                self.play(inst, m, b, d * legato, vel, pan, send)
            b += d
        return b

    def drums(self, pattern: str, bar: int, gain: float = 1.0, send: float = 0.08, steps: int = 16):
        pattern = pattern.replace(" ", "")
        per = self.beats / steps
        for i, ch in enumerate(pattern[:steps]):
            if ch in DRUM:
                swing = per * 0.12 if i % 2 == 1 else 0
                self.add(DRUM[ch](), bar * self.beats + i * per + swing, pan=0.15 if ch in "hHx" else 0, send=send, gain=gain)

    def render(self) -> np.ndarray:
        wet = reverb(self.send, self.verb, self.damp, seed=3)
        wl = np.zeros(self.dry.shape[1])
        n = min(len(wl), len(wet))
        wl[:n] = wet[:n]
        # slight stereo decorrelation of the reverb
        wr = np.roll(wl, int(0.011 * SR))
        mix = self.dry + np.stack([wl, wr]) * 0.55
        # wrap everything past the loop point back to the start
        L = self.length
        out = mix[:, :L].copy()
        tail = mix[:, L:]
        k = min(L, tail.shape[1])
        out[:, :k] += tail[:, :k]
        return out


def arp(song: Song, inst: str, chords: list[str], pattern: list[int], rate: float, octave: int = 4, vel: float = 0.6,
        pan: float = 0.0, send: float = 0.3, bars_per_chord: int = 1, start_bar: int = 0, gate: float = 0.9):
    """Arpeggiate: pattern indexes into the chord tones (wrapping up octaves)."""
    beat = start_bar * song.beats
    for sym in chords:
        notes = chord(sym, octave)
        steps = int(song.beats * bars_per_chord / rate)
        for i in range(steps):
            idx = pattern[i % len(pattern)]
            if idx < 0:
                continue
            m = notes[idx % len(notes)] + 12 * (idx // len(notes))
            song.play(inst, m, beat + i * rate, rate * gate, vel * (1.0 if i % 4 == 0 else 0.85), pan, send)
        beat += song.beats * bars_per_chord


def pads(song: Song, chords: list[str], octave: int = 3, vel: float = 0.5, inst: str = "pad", bars_per_chord: int = 1, send: float = 0.5):
    beat = 0
    for sym in chords:
        for i, m in enumerate(chord(sym, octave)):
            song.play(inst, m, beat, song.beats * bars_per_chord, vel, pan=(i - 1) * 0.35, send=send, humanize=0)
        beat += song.beats * bars_per_chord


def bassline(song: Song, chords: list[str], pattern: str, octave: int = 2, inst: str = "bass", vel: float = 0.8, bars_per_chord: int = 1):
    """pattern: 16 chars per bar, 'R'=root, '5'=fifth, 'O'=octave, '3'=third, '.'=rest, '-'=hold."""
    beat = 0
    for sym in chords:
        notes = chord(sym, octave)
        root = notes[0] if "/" not in sym else notes[0]
        for b in range(bars_per_chord):
            p = pattern
            step = song.beats / 16
            i = 0
            while i < 16:
                ch = p[i]
                if ch in "R53O":
                    length = 1
                    while i + length < 16 and p[i + length] == "-":
                        length += 1
                    m = {"R": root, "5": root + 7, "3": notes[1] if "/" not in sym else notes[2], "O": root + 12}[ch]
                    song.play(inst, m, beat + b * song.beats + i * step, length * step * 0.92, vel, 0, 0.05, humanize=0.004)
                    i += length
                else:
                    i += 1
        beat += song.beats * bars_per_chord


def gen_melody(rng: random.Random, chords: list[str], sc: list[int], octave: int, bars_per_chord: int = 1, beats: int = 4,
               density: float = 0.6, motif_bars: int = 2) -> list[tuple[int | None, float]]:
    """Phrase-structured melody: an A motif, its variation, a B phrase, and A again."""
    rhythms = [[1, 1, 1, 1], [1.5, 0.5, 1, 1], [0.5, 0.5, 1, 2], [2, 1, 1], [1, 0.5, 0.5, 2], [0.5, 0.5, 0.5, 0.5, 2], [3, 1], [1, 1, 2]]
    pool = [p for p in rhythms if len(p) <= 3 + density * 3]
    allowed = sorted({p + 12 * o for p in sc for o in range(octave, octave + 2)})

    def nearest(target, prev):
        cands = sorted(allowed, key=lambda m: abs(m - target) + 0.3 * abs(m - prev))
        return cands[0]

    def phrase(start_chord_idx: int, nbars: int, prev: int):
        out = []
        for b in range(nbars):
            sym = chords[(start_chord_idx + b // bars_per_chord) % len(chords)]
            ct = [m % 12 for m in chord(sym, octave)]
            rh = rng.choice(pool)
            for k, d in enumerate(rh):
                if k == 0 or d >= 1.5:
                    # chord tone on strong beats
                    tones = [m for m in allowed if m % 12 in ct]
                    m = min(tones, key=lambda x: abs(x - prev) + rng.random() * 3)
                else:
                    step = rng.choice([-2, -1, 1, 2, 3, -3])
                    m = nearest(prev + step, prev)
                if rng.random() < 0.08 and k > 0:
                    out.append((None, d))
                    continue
                out.append((m, d))
                prev = m
        return out, prev

    start = note(f"C{octave + 1}")
    total_bars = len(chords) * bars_per_chord
    a, prev = phrase(0, motif_bars, start)
    melody_out = list(a)
    bar = motif_bars
    sections = []
    while bar < total_bars:
        sections.append(bar)
        bar += motif_bars
    for i, sbar in enumerate(sections):
        if i % 4 in (0, 2):
            # repeat A with a varied ending
            var = list(a)
            if len(var) > 1:
                m, d = var[-1]
                if m is not None:
                    sym = chords[(sbar // bars_per_chord + motif_bars // bars_per_chord - 1) % len(chords)]
                    ct = [x % 12 for x in chord(sym, octave)]
                    tones = [x for x in allowed if x % 12 in ct]
                    var[-1] = (min(tones, key=lambda x: abs(x - m)), d)
            melody_out += var
        else:
            b_, prev = phrase(sbar // bars_per_chord, motif_bars, prev + rng.choice([-5, 5, 7]))
            melody_out += b_
    return melody_out


# ------------------------------------------------------------------ themes
THEME_MINOR = ("D5:1.5 E5:0.5 F5:1 A5:1 | G5:1.5 F5:0.5 E5:1 C5:1 | D5:1 F5:1 A5:1 D6:1 | C6:2 A5:2 | "
               "Bb5:1.5 A5:0.5 G5:1 F5:1 | E5:1.5 F5:0.5 G5:2 | A5:1 G5:1 F5:1 E5:1 | D5:4")
THEME_CHORDS = ["Dm", "C", "Dm", "F", "Bb", "C", "Am", "Dm"]
THEME_MAJOR = ("D5:1.5 E5:0.5 F#5:1 A5:1 | G5:1.5 F#5:0.5 E5:1 C#5:1 | D5:1 F#5:1 A5:1 D6:1 | C#6:2 A5:2 | "
               "B5:1.5 A5:0.5 G5:1 F#5:1 | E5:1.5 F#5:0.5 G5:2 | A5:1 G5:1 F#5:1 E5:1 | D5:4")
THEME_MAJOR_CHORDS = ["D", "A", "Bm", "D", "G", "A", "A7", "D"]


def t_title():
    s = Song(76, 16, verb=3.2, damp=3000)
    ch = THEME_CHORDS * 2
    pads(s, ch, 3, 0.35)
    bassline(s, ch, "R-------5-------", 2, "bass", 0.5)
    s.seq("musicbox", melody(THEME_MINOR), 0, 0.55, pan=0.1, send=0.45)
    # second half: theme an octave down on bell with music-box counter-arps
    s.seq("bell", melody(THEME_MINOR, -1), 32, 0.45, pan=-0.15, send=0.5)
    arp(s, "musicbox", THEME_CHORDS, [0, 1, 2, 3, 2, 1, 4, 2], 0.5, 5, 0.22, pan=0.3, send=0.5, start_bar=8)
    return s, None


def t_ending():
    s = Song(72, 16, verb=3.0)
    ch = THEME_MAJOR_CHORDS * 2
    pads(s, ch, 3, 0.4)
    pads(s, ch, 4, 0.25, inst="choir")
    bassline(s, ch, "R-------5---O---", 2, "bass", 0.55)
    s.seq("bell", melody(THEME_MAJOR), 0, 0.5, pan=0.05, send=0.4)
    s.seq("lead", melody(THEME_MAJOR), 32, 0.45, pan=0.0, send=0.35)
    arp(s, "pluck", ch, [0, 2, 1, 2, 3, 2, 1, 2], 0.5, 4, 0.35, pan=-0.3, send=0.3)
    for bar in range(8, 16):
        s.drums("k.......k.s.....", bar, 0.5)
        s.drums("..x...x...x...x.", bar, 0.6)
    return s, None


def t_camp():
    s = Song(92, 16, verb=2.0)
    ch = ["Fmaj7", "Dm7", "Bbmaj7", "C", "Fmaj7", "Am7", "Bbmaj7", "Csus4"] * 2
    arp(s, "pluck", ch, [0, 2, 1, 3, 2, 1, 3, 2], 0.5, 3, 0.55, pan=-0.2, send=0.3)
    bassline(s, ch, "R-----R-5-----3-", 2, "bass", 0.6)
    rng = random.Random(11)
    mel = gen_melody(rng, ch[:8], scale("F", "majpenta"), 4, density=0.5)
    end = s.seq("bell", mel, 32, 0.38, pan=0.25, send=0.45)
    del end
    for bar in range(16):
        s.drums("x.x.x.x.x.x.x.x.", bar, 0.35, 0.05)
        if bar >= 8:
            s.drums("k.......k.......", bar, 0.4)
    return s, None


def biome_song(bpm, bars, chords, sc, lead_inst, arp_inst, arp_pat, bass_pat, bass_inst, drum_lo, drum_hi, seed, octave=4,
               verb=2.4, pad_inst="pad", lead_start=8, pad_vel=0.3, arp_vel=0.45):
    """32-bar arrangement: intro / theme / breakdown / theme + counter-melody."""
    cyc = chords[:8]
    full = cyc * 4
    bars = 32
    s = Song(bpm, bars, verb=verb)
    hi = Song(bpm, bars, verb=verb)
    pads(s, full, 3, pad_vel, inst=pad_inst)
    bassline(s, full, bass_pat, 2, bass_inst, 0.65)
    # arps: busy in A/B/D, sparse in the breakdown
    arp(s, arp_inst, cyc * 2, arp_pat, 0.5, octave, arp_vel, pan=-0.25, send=0.3)
    arp(s, arp_inst, cyc, [0, -1, 2, -1, 1, -1, 3, -1], 0.5, octave, arp_vel * 0.8, pan=-0.25, send=0.45, start_bar=16)
    arp(s, arp_inst, cyc, arp_pat, 0.5, octave, arp_vel, pan=-0.25, send=0.3, start_bar=24)
    rng = random.Random(seed)
    mel_a = gen_melody(rng, cyc, sc, octave + 1, density=0.55)
    mel_b = gen_melody(random.Random(seed + 1), cyc, sc, octave + 1, density=0.35)
    s.seq(lead_inst, mel_a, 8 * 4, 0.42, pan=0.2, send=0.4)
    s.seq("bell" if lead_inst != "bell" else "glass", mel_b, 16 * 4, 0.32, pan=-0.1, send=0.55)
    s.seq(lead_inst, mel_a, 24 * 4, 0.42, pan=0.2, send=0.4)
    s.seq("glass", [(m + 12 if m else None, d) for m, d in mel_b], 24 * 4, 0.16, pan=-0.3, send=0.6)
    for bar in range(bars):
        breakdown = 16 <= bar < 24
        intro = bar < 4
        for pat in drum_lo:
            if breakdown and ("k" in pat or "s" in pat or "T" in pat):
                continue
            if intro and "s" in pat:
                continue
            s.drums(pat, bar, 0.55)
        if not breakdown:
            for pat in drum_hi:
                hi.drums(pat, bar, 0.6)
        if bar % 8 == 7 and not breakdown:
            s.drums("............t.tt", bar, 0.4)
    arp(hi, "glass" if arp_inst != "glass" else "pluck", full, [0, 1, 2, 3, 4, 3, 2, 1], 0.25, octave + 1, 0.22, pan=0.35, send=0.35)
    return s, hi


def t_rootsoil():
    ch = ["Am", "F", "C", "G", "Am", "F", "Dm", "E"] * 2
    return biome_song(100, 16, ch, scale("A", "penta"), "marimba", "pluck", [0, 2, 1, 2, 0, 3, 1, 2], "R--R--5-R---5-O-", "bass",
                      ["k.....k.k.......", "....s.......s..."], ["x.xxx.xxx.xxx.xx", "......c.......c."], 21, 4)


def t_amberstone():
    ch = ["Em9", "A", "Em", "D", "Cmaj7", "D", "Em", "Bm"] * 2
    return biome_song(108, 16, ch, scale("E", "dorian"), "marimba", "marimba", [0, 1, 2, 1, 3, 1, 2, 1], "R-.R-.5-R-.R-.O-", "bass",
                      ["k..k..k...k..k..", "....s.......s..s"], ["h.hhh.hhh.hhh.hh", "x...x...x...x..."], 33, 4, verb=2.0)


def t_grotto():
    ch = ["C#m9", "Amaj7", "E", "B", "C#m", "Amaj7", "F#m", "Bsus4"] * 2
    return biome_song(90, 16, ch, scale("C#", "minor"), "glass", "bell", [0, 2, 4, 2, 1, 3, 2, 4], "R-------5-------", "bass",
                      ["k.......k.......", "........s......."], ["..x...x...x...x.", "h.h.h.h.h.h.h.h."], 47, 4, verb=3.4, pad_vel=0.35)


def t_emberdeep():
    ch = ["Dm", "Eb", "Dm", "Cm", "Dm", "Eb", "Bb", "A"] * 2
    return biome_song(120, 16, ch, scale("D", "phrygian"), "lead", "pluck", [0, 0, 2, 0, 1, 0, 2, 3], "R.R.RR.5R.R.RO.R", "sawbass",
                      ["k...k...k...k...", "....s.......s.s.", "T.....t.....t..."], ["hhhhhhhhhhhhhhhh", "..s.....s...s..."], 59, 3, verb=1.8, pad_vel=0.25)


def t_hollow():
    s = Song(66, 16, verb=4.0, damp=2500)
    hi = Song(66, 16, verb=4.0, damp=2500)
    ch = ["Bm", "A", "Bm", "D", "G", "A", "F#m", "Bm"] * 2
    pads(s, ch, 3, 0.35, inst="choir")
    pads(s, ch, 2, 0.25)
    bassline(s, ch, "R---------------", 1, "bass", 0.6)
    # the main theme, transposed to B minor and slowed, half-remembered
    s.seq("glass", melody(THEME_MINOR, 0, -3), 0, 0.35, pan=0.2, send=0.6)
    s.seq("bell", melody(THEME_MINOR, -1, -3)[:8], 40, 0.25, pan=-0.2, send=0.7)
    for bar in range(16):
        s.drums("K.......K.......", bar, 0.45, 0.2)
        hi.drums("..c...c...c...c.", bar, 0.5, 0.3)
        hi.drums("x.x.x.x.x.x.x.x.", bar, 0.45)
    arp(hi, "bell", ch, [0, 2, 1, 3], 0.5, 4, 0.2, pan=-0.3, send=0.6)
    return s, hi


def t_mantle():
    """The Mantle: slow, heavy and warm, magma breathing under the stone."""
    ch = ["Fm", "Db", "Ab", "Eb", "Fm", "Db", "Bbm", "C"] * 2
    return biome_song(84, 16, ch, scale("F", "minor"), "glass", "pluck", [0, 2, 1, 2, 3, 2, 1, 2], "R-------R---5---", "sawbass",
                      ["K.......K.......", "........s......."], ["..x...x...x...x.", "T.......t......."], 71, 3, verb=3.0, pad_vel=0.35)


def t_heart():
    """The World's Heart: the main theme at last in full, golden major."""
    s = Song(80, 16, verb=3.4, damp=5000)
    hi = Song(80, 16, verb=3.4, damp=5000)
    ch = THEME_MAJOR_CHORDS * 2
    pads(s, ch, 3, 0.35, inst="choir")
    pads(s, ch, 4, 0.22)
    bassline(s, ch, "R-------5---O---", 2, "bass", 0.5)
    s.seq("glass", melody(THEME_MAJOR), 0, 0.4, pan=0.15, send=0.55)
    s.seq("bell", melody(THEME_MAJOR, 1), 32, 0.3, pan=-0.15, send=0.6)
    arp(s, "musicbox", ch, [0, 2, 1, 3, 2, 4, 3, 1], 0.5, 5, 0.18, pan=0.3, send=0.5)
    for bar in range(16):
        if bar >= 4:
            s.drums("k.......k.......", bar, 0.35, 0.1)
        hi.drums("..x...x...x...x.", bar, 0.5)
        hi.drums("....s.......s...", bar, 0.4)
    arp(hi, "bell", ch, [0, 1, 2, 3, 4, 3, 2, 1], 0.25, 5, 0.18, pan=-0.3, send=0.5)
    return s, hi


def t_results():
    s = Song(84, 8, verb=2.6)
    ch = ["Fmaj7", "Em7", "Dm7", "Csus4", "Fmaj7", "Em7", "Dm7", "C"]
    pads(s, ch, 3, 0.35)
    arp(s, "musicbox", ch, [0, 2, 1, 3], 1.0, 5, 0.3, pan=0.2, send=0.5)
    bassline(s, ch, "R-------5-------", 2, "bass", 0.5)
    return s, None


def ambience(kind: str, seconds: float = 24.0):
    """Seamless low-level beds: drips, wind, hum, rumble, drone."""
    from synth import bp as _bp, lp as _lp, exp_decay as _ed, osc as _osc
    n = int(seconds * SR)
    rng = np.random.default_rng(zlib.crc32(kind.encode()))
    out = np.zeros((2, n + SR * 3))
    t = np.arange(n) / SR
    base = rng.uniform(-1, 1, n)
    if kind == "rootsoil":
        bed = _lp(base, 400) * 0.25 * (0.7 + 0.3 * np.sin(2 * np.pi * t / seconds * 2))
        drips = 26
    elif kind == "amberstone":
        bed = _bp(base, 300, 1400) * 0.18 * (0.6 + 0.4 * np.sin(2 * np.pi * t / seconds * 3))
        drips = 10
    elif kind == "grotto":
        bed = (_osc("sine", 220, seconds) * 0.04 + _osc("sine", 330.5, seconds) * 0.03 + _bp(base, 2000, 6000) * 0.04) * (0.7 + 0.3 * np.sin(2 * np.pi * t / seconds * 4))
        drips = 30
    elif kind == "emberdeep":
        bed = _lp(base, 140) * 0.9 * (0.6 + 0.4 * np.sin(2 * np.pi * t / seconds * 2)) + _bp(base, 2500, 7000) * 0.02
        drips = 0
    elif kind == "mantle":
        # a slow molten roar with bubbles popping in it
        bed = _lp(base, 110) * 1.1 * (0.55 + 0.45 * np.sin(2 * np.pi * t / seconds * 3)) + _osc("sine", 41, seconds) * 0.08
        drips = 0
    elif kind == "heart":
        # a warm resonant hum: the Heart's own chord, breathing
        bed = sum(_osc("sine", f, seconds) * a for f, a in ((73.4, 0.07), (110.0, 0.05), (146.8, 0.04), (220.0, 0.025), (293.7, 0.012)))
        bed = bed * (0.65 + 0.35 * np.sin(2 * np.pi * t / seconds * 2)) + _bp(base, 3000, 8000) * 0.015
        drips = 18
    else:
        bed = (_osc("sine", 55, seconds) * 0.12 + _osc("sine", 82.7, seconds) * 0.06) * (0.6 + 0.4 * np.sin(2 * np.pi * t / seconds * 1)) + _lp(base, 300) * 0.1
        drips = 6
    out[0, :n] += bed
    out[1, :n] += np.roll(bed, int(0.013 * SR))
    for _ in range(drips):
        at = int(rng.uniform(0, n))
        f = rng.uniform(300, 600) if kind == "hollow" else rng.uniform(1600, 3200) if kind == "heart" else rng.uniform(900, 2200)
        L = int(0.25 * SR)
        d = _osc("sine", np.linspace(f * 1.4, f, L), 0.25) * _ed(L, 0.04) * rng.uniform(0.05, 0.12)
        pan = rng.uniform(-0.8, 0.8)
        out[0, at:at + L] += d * (1 - pan) / 2
        out[1, at:at + L] += d * (1 + pan) / 2
    if kind == "mantle":
        for _ in range(28):  # magma bubbles
            at = int(rng.uniform(0, n))
            L = int(0.09 * SR)
            f = rng.uniform(70, 160)
            b = _osc("sine", np.linspace(f, f * 1.8, L), 0.09) * _ed(L, 0.03) * rng.uniform(0.1, 0.25)
            out[:, at:at + L] += b
    if kind == "emberdeep":
        for _ in range(40):  # crackles
            at = int(rng.uniform(0, n))
            L = int(0.01 * SR)
            c = _bp(rng.uniform(-1, 1, L), 2000, 8000) * rng.uniform(0.05, 0.15)
            out[:, at:at + L] += c
    wet = reverb(out[0] + out[1], 2.5, 3000, seed=5)
    out[0, : len(out[0])] += wet[: out.shape[1]] * 0.15
    out[1, : len(out[1])] += wet[: out.shape[1]] * 0.15
    loop = out[:, :n].copy()
    loop[:, : out.shape[1] - n] += out[:, n:]
    return loop


AMBIENCE = ["rootsoil", "amberstone", "grotto", "emberdeep", "hollow", "mantle", "heart"]


TRACKS = {
    "title": t_title, "ending": t_ending, "camp": t_camp, "rootsoil": t_rootsoil, "amberstone": t_amberstone,
    "grotto": t_grotto, "emberdeep": t_emberdeep, "hollow": t_hollow, "mantle": t_mantle, "heart": t_heart, "results": t_results,
}
