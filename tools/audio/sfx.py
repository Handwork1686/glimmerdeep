"""Sound-effect recipes. Each recipe takes an rng (variation) and returns mono audio."""
from __future__ import annotations

import numpy as np

from synth import (SR, bp, crush, drive, env, exp_decay, fade, fm, hp, kick, lp, midi_hz, note, osc, reverb,
                   sweep_lp)


def n_(d):
    return int(d * SR)


def mix(*parts):
    n = max(len(p) for p in parts)
    out = np.zeros(n)
    for p in parts:
        out[: len(p)] += p
    return out


def bell(freq, dur, ratio=3.5, index=2.5, tau=0.25, idecay=0.08):
    return fm(freq, dur, ratio, index, idecay) * exp_decay(n_(dur), tau)


def noise(dur):
    return np.random.uniform(-1, 1, n_(dur))


def wet(x, amt=0.25, secs=1.2, damp=4000):
    r = reverb(x, secs, damp, seed=7)
    out = np.zeros(len(r))
    out[: len(x)] += x
    out += r * amt
    return out


def sweep(f0, f1, dur, kind="sine", curve=1.0):
    n = n_(dur)
    k = np.linspace(0, 1, n) ** curve
    f = f0 * (f1 / f0) ** k
    return osc(kind, f, dur)


# ------------------------------------------------------------------ UI
def ui_move(r):
    f = 1250 * r.uniform(0.97, 1.03)
    return (osc("sine", f, 0.03) * 0.6 + osc("square", f / 2, 0.03, 0.25) * 0.08) * exp_decay(n_(0.03), 0.01)


def ui_select(r):
    a = bell(midi_hz(note("C6")), 0.25, 2, 1.4, 0.12)
    b = bell(midi_hz(note("G6")), 0.3, 2, 1.4, 0.14)
    out = np.zeros(n_(0.4))
    out[: len(a)] += a * 0.6
    out[n_(0.055):n_(0.055) + len(b)] += b * 0.6
    return wet(out, 0.15)


def ui_back(r):
    a = bell(midi_hz(note("G5")), 0.2, 2, 1.0, 0.1)
    b = bell(midi_hz(note("C5")), 0.25, 2, 1.0, 0.12)
    out = np.zeros(n_(0.35))
    out[: len(a)] += a * 0.5
    out[n_(0.05):n_(0.05) + len(b)] += b * 0.5
    return out


def ui_deny(r):
    f = 140 * (1 + 0.04 * np.sin(np.linspace(0, 30, n_(0.14))))
    return lp(osc("square", f, 0.14, 0.3), 1200) * env(n_(0.14), 0.005, 0.05, 0.6, 0.05) * 0.5


def tick(r):
    return hp(noise(0.015), 3000) * exp_decay(n_(0.015), 0.003) * 0.6 + osc("sine", 2400 * r.uniform(0.95, 1.05), 0.015) * exp_decay(n_(0.015), 0.004) * 0.4


# ---------------------------------------------------------------- mining
def drill_rock(r):
    d = 0.07
    g = bp(noise(d), 600 * r.uniform(0.8, 1.2), 3200) * 0.9
    body = osc("square", 85 * r.uniform(0.9, 1.1), d, 0.4) * 0.35
    return crush((g + body) * env(n_(d), 0.002, 0.03, 0.4, 0.03), 7, 2) * 0.8


def drill_ore(r):
    d = 0.08
    g = bp(noise(d), 1800, 6500) * 0.6
    ring = osc("sine", 1700 * r.uniform(0.9, 1.1), d) * exp_decay(n_(d), 0.03) * 0.5
    return (g * env(n_(d), 0.002, 0.03, 0.3, 0.04) + ring) * 0.8


def break_rock(r):
    d = 0.28
    crumble = sweep_lp(noise(d), 3500 * r.uniform(0.8, 1.2), 250, 16) * exp_decay(n_(d), 0.08)
    thump = sweep(140, 55, 0.18) * exp_decay(n_(0.18), 0.05) * 0.8
    # little debris ticks
    ticks = np.zeros(n_(d))
    for _ in range(5):
        i = r.integers(0, n_(d * 0.8))
        k = hp(noise(0.01), 2500) * exp_decay(n_(0.01), 0.002) * r.uniform(0.2, 0.5)
        ticks[i:i + len(k)] += k[: len(ticks) - i]
    return drive(mix(crumble, thump, ticks), 1.4) * 0.8


def break_ore(r):
    base = break_rock(r) * 0.7
    tink = bell(midi_hz(note("E6")) * r.uniform(0.97, 1.03), 0.35, 3.01, 2.0, 0.12)
    return mix(base, tink * 0.5)


def shatter(r):
    d = 0.45
    n = n_(d)
    out = hp(noise(d), 4000) * exp_decay(n, 0.04) * 0.5
    base = 1900 * r.uniform(0.95, 1.05)
    for k, ratio in enumerate((1.0, 1.52, 2.21, 2.93, 3.81)):
        out += osc("sine", base * ratio, d) * exp_decay(n, 0.18 / (1 + k * 0.5)) * (0.45 / (1 + k * 0.4))
    return wet(out, 0.22, 0.9, 6000) * 0.8


def crystal(r):
    out = np.zeros(n_(0.6))
    notes = [note("E6"), note("B6"), note("E7")]
    r.shuffle(notes)
    for i, m in enumerate(notes):
        b = bell(midi_hz(m), 0.35, 2.0, 1.2, 0.12) * 0.35
        s = n_(0.045 * i)
        out[s:s + len(b)] += b
    return wet(out, 0.25, 1.2, 7000)


def pickup(r):
    f = midi_hz(note("G6"))
    d = 0.16
    x = osc("sine", f, d) * 0.6 + osc("sine", f * 2, d) * 0.15 + osc("tri", f * 3, d) * 0.05
    return x * env(n_(d), 0.001, 0.02, 0.35, 0.12) * 0.7


def light_pickup(r):
    d = 0.55
    chord = sum(osc("sine", midi_hz(note(m)), d) for m in ("C5", "E5", "G5", "C6")) / 4
    sh = hp(noise(d), 5000) * 0.15
    return wet((chord + sh) * env(n_(d), 0.05, 0.1, 0.5, 0.3), 0.3) * 0.8


def gem_pickup(r):
    out = np.zeros(n_(0.5))
    for i, m in enumerate(("E6", "B6")):
        b = bell(midi_hz(note(m)), 0.4, 2.0, 1.6, 0.16) * 0.5
        out[n_(0.07 * i):n_(0.07 * i) + len(b)] += b
    return wet(out, 0.3)


def core_pickup(r):
    out = np.zeros(n_(1.4))
    low = bell(midi_hz(note("C4")), 1.2, 1.41, 3.0, 0.5, 0.3) * 0.5
    out[: len(low)] += low
    for i, m in enumerate(("C6", "E6", "G6", "C7", "E7")):
        b = bell(midi_hz(note(m)), 0.4, 2.0, 1.0, 0.15) * 0.25
        s = n_(0.08 + 0.06 * i)
        out[s:s + len(b)] += b
    return wet(out, 0.4, 1.8)


def explode(r):
    d = 1.0
    nz = sweep_lp(noise(d), 7000 * r.uniform(0.8, 1.1), 150, 24) * exp_decay(n_(d), 0.22)
    boom = kick(0.7, 110, 32, 0.5) * 1.1
    crackle = np.zeros(n_(d))
    for _ in range(16):
        i = r.integers(0, n_(0.6))
        k = hp(noise(0.008), 3000) * r.uniform(0.1, 0.4)
        crackle[i:i + len(k)] += k[: len(crackle) - i]
    return drive(mix(nz, boom, crackle), 2.0) * 0.85


def shardbomb(r):
    """The Shard Bomb: a soft thump, then a glassy burst that scatters in every direction."""
    d = 0.8
    n = n_(d)
    thump = kick(0.35, 140, 45, 0.28) * 0.7
    out = np.zeros(n)
    out[: len(thump)] += thump[:n]
    # a spray of tiny shatters, each a little higher, spreading out over 0.3 s
    for k in range(9):
        at = n_(0.02 + k * 0.03 * r.uniform(0.7, 1.3))
        f = 1700 * r.uniform(0.9, 1.15) * (1 + k * 0.06)
        L = n_(0.22)
        tone = sum(osc("sine", f * ratio, 0.22) * (0.3 / (1 + j)) for j, ratio in enumerate((1.0, 1.52, 2.21)))
        ping = (tone + hp(noise(0.22), 5000) * 0.25) * exp_decay(L, 0.05)
        out[at:at + L] += ping[: n - at] * (0.5 - k * 0.03)
    return wet(out, 0.3, 1.1, 7000) * 0.85


def embershard(r):
    """An ember shard popping into sparks: a short crackle with a warm body."""
    d = 0.25
    n = n_(d)
    body = bp(noise(d), 300, 1400) * exp_decay(n, 0.05) * 0.6
    crackle = np.zeros(n)
    for _ in range(6):
        i = r.integers(0, n_(0.15))
        k = hp(noise(0.006), 3500) * r.uniform(0.15, 0.4)
        crackle[i:i + len(k)] += k[: n - i]
    return drive(body + crackle, 1.6) * 0.7


# ----------------------------------------------------------- shard voices
# One short, distinct sound per shard type, so a burst can be told apart by ear.
def shard_glass(r):
    """Glass: a thin high ting."""
    d = 0.14
    ting = bell(2900 * r.uniform(0.97, 1.04), d, 2.0, 1.2, 0.05)
    tick = hp(noise(0.01), 5000) * exp_decay(n_(0.01), 0.002) * 0.4
    return mix(ting * 0.7, tick) * 0.8


def shard_crystal(r):
    """Crystal: a rising two-note ping that sings through the rock."""
    out = np.zeros(n_(0.22))
    a = sweep(1500, 2300, 0.1) * exp_decay(n_(0.1), 0.05)
    b = sweep(2300, 3400, 0.14) * exp_decay(n_(0.14), 0.06)
    out[: len(a)] += a * 0.5
    out[n_(0.06):n_(0.06) + len(b)] += b * 0.5
    return wet(out, 0.15, 0.6, 7000)


def shard_ember(r):
    """Ember: a warm pop that crackles apart."""
    return embershard(r) * 0.9


def shard_cinnabar(r):
    """Cinnabar: a heavy thud with a stone crack on top."""
    d = 0.3
    thud = kick(0.28, 120, 38, 0.6) * 0.9
    crack = bp(noise(d), 300, 1800) * exp_decay(n_(d), 0.04) * 0.5
    return drive(mix(thud, crack), 1.6) * 0.8


def shard_geode(r):
    """Geode: a little cascade of marble clinks."""
    out = np.zeros(n_(0.35))
    for i, m in enumerate(("A5", "D6", "F#6", "A6")):
        b = bell(midi_hz(note(m)), 0.2, 3.01, 1.0, 0.07) * 0.4
        out[n_(0.035 * i):n_(0.035 * i) + len(b)] += b[: len(out) - n_(0.035 * i)]
    return wet(out, 0.2, 0.7, 6500)


def shard_vein(r):
    """Vein: a ripping zig-zag, like a seam tearing."""
    d = 0.2
    f = 700 * (1 + 0.45 * np.sign(np.sin(np.linspace(0, 40, n_(d)))))
    x = lp(osc("saw", f, d, 0.5), 3500) * exp_decay(n_(d), 0.07)
    return drive(x * 0.7 + hp(noise(d), 3000) * exp_decay(n_(d), 0.03) * 0.2, 1.5) * 0.7


def shard_fault(r):
    """Fault: dry gravel, a grit of small cracks."""
    d = 0.22
    out = bp(noise(d), 250, 1500) * exp_decay(n_(d), 0.05) * 0.5
    for _ in range(7):
        i = r.integers(0, n_(0.16))
        k = hp(noise(0.007), 2000) * r.uniform(0.25, 0.6) * exp_decay(n_(0.007), 0.002)
        out[i:i + len(k)] += k[: len(out) - i]
    return drive(out, 1.4) * 0.8


def shard_cataclysm(r):
    """Cataclysm: a swelling boom with a bright chord riding it."""
    d = 0.6
    boom = kick(0.5, 130, 36, 0.8) * 0.9
    out = np.zeros(n_(d))
    out[: len(boom)] += boom[: len(out)]
    for i, m in enumerate(("C5", "G5", "C6", "E6")):
        b = bell(midi_hz(note(m)), 0.5, 2.0, 1.0, 0.18) * 0.28
        out[n_(0.03 * i):n_(0.03 * i) + len(b)] += b[: len(out) - n_(0.03 * i)]
    return wet(out, 0.3, 1.0, 6500) * 0.85


def shard_void(r):
    """Void: a wobbling, falling tone that curves away."""
    d = 0.28
    n = n_(d)
    vib = 1 + 0.05 * np.sin(np.linspace(0, 40, n))
    f = np.linspace(1000, 360, n) * vib
    x = osc("sine", f, d) * exp_decay(n, 0.1) * 0.7 + osc("tri", f * 0.5, d) * exp_decay(n, 0.08) * 0.25
    return wet(x, 0.18, 0.8, 4500)


def shard_prism(r):
    """Prism: a shimmer that splits into two bright bells."""
    out = np.zeros(n_(0.4))
    for i, m in enumerate(("C7", "G6")):
        b = bell(midi_hz(note(m)) * (1.003 if i else 1.0), 0.3, 2.01, 1.4, 0.1) * 0.4
        out[n_(0.045 * i):n_(0.045 * i) + len(b)] += b[: len(out) - n_(0.045 * i)]
    out += hp(noise(0.4), 6000) * exp_decay(n_(0.4), 0.06) * 0.15
    return wet(out, 0.25, 0.9, 8000)


def shard_rune(r):
    """Rune: a soft, hollow chime."""
    d = 0.4
    x = bell(midi_hz(note("A5")), d, 2.0, 0.8, 0.2) * 0.5 + osc("sine", 220, d) * exp_decay(n_(d), 0.15) * 0.25
    return wet(x, 0.25, 1.0, 5000)


def surge(r):
    """A Surge arms: a rising charge that locks in with a ping."""
    d = 0.5
    n = n_(d)
    rise = sweep(260, 1500, 0.4, "saw", 1.6) * env(n_(0.4), 0.02, 0.1, 0.8, 0.15) * 0.3
    out = np.zeros(n)
    out[: len(rise)] += lp(rise, 4000)
    ping = bell(midi_hz(note("E6")), 0.3, 2.0, 1.2, 0.12) * 0.6
    out[n_(0.35):n_(0.35) + len(ping)] += ping[: n - n_(0.35)]
    return wet(out, 0.2, 0.7, 7000)


def nova(r):
    """A Prism Nova: every crystal in reach rings at once."""
    out = np.zeros(n_(0.8))
    for i, m in enumerate(("C6", "E6", "G6", "C7", "E7", "G7")):
        b = bell(midi_hz(note(m)), 0.5, 2.0, 1.1, 0.2) * 0.3
        out[n_(0.03 * i):n_(0.03 * i) + len(b)] += b[: len(out) - n_(0.03 * i)]
    out += hp(noise(0.8), 5000) * exp_decay(n_(0.8), 0.1) * 0.2
    return wet(out, 0.35, 1.2, 8000)


def throw(r):
    d = 0.2
    n = n_(d)
    x = bp(noise(d), 600, 3000) * np.sin(np.linspace(0, np.pi, n)) ** 2
    return x * 0.6


def thrust_start(r):
    d = 0.18
    return bp(noise(d), 900, 4500) * env(n_(d), 0.01, 0.05, 0.4, 0.1) * 0.5


def land(r):
    d = 0.16
    return (sweep(110, 55, d) * exp_decay(n_(d), 0.05) + lp(noise(d), 500) * exp_decay(n_(d), 0.03) * 0.6) * 0.9


def clank(r):
    d = 0.3
    return wet(fm(520 * r.uniform(0.95, 1.05), d, 3.53, 4.0, 0.05) * exp_decay(n_(d), 0.08), 0.2) * 0.6


# ----------------------------------------------------------- progression
def levelup(r):
    out = np.zeros(n_(1.0))
    seq = ("C5", "E5", "G5", "C6")
    for i, m in enumerate(seq):
        f = midi_hz(note(m))
        x = (osc("square", f, 0.22, 0.25) * 0.18 + bell(f * 2, 0.22, 2.0, 0.8, 0.1) * 0.3) * env(n_(0.22), 0.004, 0.06, 0.5, 0.1)
        s = n_(0.075 * i)
        out[s:s + len(x)] += x
    ch = sum(osc("tri", midi_hz(note(m)), 0.6) for m in ("C5", "G5", "E6")) * env(n_(0.6), 0.01, 0.1, 0.5, 0.4) * 0.15
    s = n_(0.3)
    out[s:s + len(ch)] += ch[: len(out) - s]
    return wet(out, 0.3)


def boon_pick(r):
    out = np.zeros(n_(0.7))
    for i in range(7):
        m = note("C6") + [0, 2, 4, 7, 9, 12, 14][i]
        b = bell(midi_hz(m), 0.25, 2.0, 1.0, 0.08) * 0.22
        s = n_(0.035 * i)
        out[s:s + len(b)] += b
    return wet(out, 0.35, 1.4, 7000)


def reroll(r):
    out = np.zeros(n_(0.35))
    for i in range(7):
        k = bp(noise(0.02), 1500, 5000) * exp_decay(n_(0.02), 0.005) * r.uniform(0.3, 0.6)
        s = n_(0.04 * i + r.uniform(0, 0.01))
        out[s:s + len(k)] += k
    return out


def banish(r):
    d = 0.5
    return wet((sweep_lp(noise(d), 4000, 200, 16) * exp_decay(n_(d), 0.12) * 0.6 + sweep(300, 80, d) * exp_decay(n_(d), 0.15) * 0.4), 0.3)


def chain_big(r):
    out = np.zeros(n_(1.2))
    for i in range(14):
        m = note("C6") + int(r.choice([0, 2, 4, 7, 9, 12, 14, 16, 19]))
        b = bell(midi_hz(m), 0.3, 2.0, 1.2, 0.1) * r.uniform(0.12, 0.25)
        s = n_(r.uniform(0, 0.7))
        out[s:s + len(b)] += b
    return wet(out, 0.4, 1.6, 8000)


def second_wind(r):
    d = 1.6
    n = n_(d)
    pad = np.zeros(n)
    for m in ("C4", "G4", "E5", "C5"):
        for det in (0.996, 1.004):
            pad += lp(osc("saw", midi_hz(note(m)) * det, d), 1800) * 0.06
    pad *= env(n, 0.4, 0.3, 0.7, 0.6)
    b = bell(midi_hz(note("C6")), 1.0, 2.0, 1.5, 0.4) * 0.3
    pad[: len(b)] += b
    return wet(pad, 0.5, 2.5)


def achievement(r):
    out = np.zeros(n_(1.5))
    for i, m in enumerate(("G5", "C6", "E6", "G6")):
        b = bell(midi_hz(note(m)), 0.5, 2.0, 1.4, 0.2) * 0.3
        s = n_(0.09 * i)
        out[s:s + len(b)] += b
    ch = sum(osc("tri", midi_hz(note(m)), 0.9) for m in ("C5", "E5", "G5", "C6")) * env(n_(0.9), 0.02, 0.2, 0.5, 0.5) * 0.12
    s = n_(0.36)
    out[s:s + len(ch)] += ch[: len(out) - s]
    return wet(out, 0.35, 1.8)


def buy(r):
    out = np.zeros(n_(0.6))
    for i, (m, rt) in enumerate((("A5", 3.5), ("E6", 3.5))):
        b = fm(midi_hz(note(m)), 0.35, rt, 2.5, 0.05) * exp_decay(n_(0.35), 0.1) * 0.35
        s = n_(0.06 * i)
        out[s:s + len(b)] += b
    p = pickup(r)
    out[n_(0.12):n_(0.12) + len(p)] += p * 0.8
    return wet(out, 0.2)


def descend(r):
    d = 1.1
    n = n_(d)
    wh = sweep_lp(noise(d), 3000, 300, 20) * env(n, 0.05, 0.2, 0.6, 0.6) * 0.5
    clunk = kick(0.3, 90, 40, 1.0) * 0.6
    out = np.zeros(n)
    out += wh
    out[n_(0.05):n_(0.05) + len(clunk)] += clunk
    clank2 = fm(300, 0.3, 3.53, 3.0, 0.05) * exp_decay(n_(0.3), 0.1) * 0.25
    out[n_(0.08):n_(0.08) + len(clank2)] += clank2
    return wet(out, 0.25, 1.5)


def biome(r):
    d = 2.6
    g = fm(midi_hz(note("C3")), d, 1.41, 2.5, 0.8) * exp_decay(n_(d), 0.9) * 0.4
    s = fm(midi_hz(note("G4")), d, 2.0, 1.0, 0.5) * exp_decay(n_(d), 0.7) * 0.2
    return wet(g + s, 0.5, 3.0, 3000)


def run_end(r):
    out = np.zeros(n_(2.2))
    for i, m in enumerate(("E5", "C5", "A4")):
        b = bell(midi_hz(note(m)), 1.0, 2.0, 1.2, 0.35) * 0.35
        s = n_(0.28 * i)
        out[s:s + len(b)] += b
    fizz = bp(noise(0.8), 2000, 8000) * exp_decay(n_(0.8), 0.25) * 0.15
    out[: len(fizz)] += fizz
    return wet(out, 0.5, 2.5, 3000)


def heartbeat(r):
    out = np.zeros(n_(0.6))
    for s, a in ((0, 1.0), (0.18, 0.7)):
        k = sweep(90, 45, 0.15) * exp_decay(n_(0.15), 0.04) * a
        out[n_(s):n_(s) + len(k)] += k
    return lp(out, 300) * 0.9


def pylon(r):
    d = 1.3
    ign = bp(noise(0.3), 1500, 9000) * exp_decay(n_(0.3), 0.06) * 0.5
    ch = sum(bell(midi_hz(note(m)), d, 2.0, 1.2, 0.45) for m in ("D5", "F#5", "A5", "D6")) * 0.15
    out = np.zeros(n_(d))
    out[: len(ign)] += ign
    out += ch
    return wet(out, 0.45, 2.0)


# ------------------------------------------------------------ the dig itself
def cashout(r):
    """A chain pot paying out: a cascade of coins climbing a major arpeggio."""
    out = np.zeros(n_(1.3))
    steps = ("C6", "E6", "G6", "C7", "E7")
    for i in range(12):
        m = note(steps[min(len(steps) - 1, i // 3)]) + int(r.choice([0, 0, 12]))
        b = fm(midi_hz(m) * r.uniform(0.995, 1.005), 0.25, 3.5, 2.2, 0.04) * exp_decay(n_(0.25), 0.07) * r.uniform(0.18, 0.3)
        s = n_(0.045 * i + r.uniform(0, 0.02))
        out[s:s + len(b)] += b
    sh = hp(noise(0.9), 7000) * exp_decay(n_(0.9), 0.3) * 0.08
    out[: len(sh)] += sh
    return wet(out, 0.3, 1.4, 9000)


def seal_break(r):
    """A Strata Seal gives way: a deep stone crack, then a rising teal chord."""
    d = 2.6
    out = np.zeros(n_(d))
    crack = mix(lp(noise(0.5), 1200) * exp_decay(n_(0.5), 0.12) * 0.9, kick(0.6, 70, 30, 1.6) * 0.8)
    out[: len(crack)] += crack
    for i in range(10):
        b = break_rock(r) * 0.25
        s = n_(0.05 + 0.07 * i)
        out[s:s + len(b)] += b[: len(out) - s]
    ch = sum(bell(midi_hz(note(m)), 1.8, 2.0, 1.3, 0.6) for m in ("A4", "E5", "A5", "C#6", "E6")) * 0.12
    s = n_(0.35)
    out[s:s + len(ch)] += ch[: len(out) - s]
    return wet(out, 0.45, 2.6, 5000)


def geode(r):
    """A geode cracks: crystal splinters bloom into a shimmering chord."""
    out = np.zeros(n_(1.6))
    c1 = bp(noise(0.12), 2500, 9000) * exp_decay(n_(0.12), 0.03) * 0.6
    out[: len(c1)] += c1
    for i, m in enumerate(("E6", "G#6", "B6", "E7", "G#7")):
        b = bell(midi_hz(note(m)), 0.9, 3.0, 1.8, 0.35) * 0.16
        s = n_(0.03 * i)
        out[s:s + len(b)] += b
    return wet(out, 0.5, 2.2, 9000)


def relic(r):
    """A relic surfaces: a soft music-box phrase over a warm pad."""
    d = 2.2
    out = np.zeros(n_(d))
    for i, m in enumerate(("G5", "B5", "D6", "G6", "F#6", "D6")):
        b = bell(midi_hz(note(m)), 0.7, 2.0, 1.0, 0.3) * 0.22
        s = n_(0.12 * i)
        out[s:s + len(b)] += b
    pad = sum(lp(osc("saw", midi_hz(note(m)) * det, d), 1500) for m in ("G3", "D4", "B4") for det in (0.997, 1.003)) * 0.03
    out += pad * env(n_(d), 0.3, 0.3, 0.6, 1.0)
    return wet(out, 0.5, 2.5)


def discover(r):
    """A new ore for the Codex: two bright ascending notes."""
    out = np.zeros(n_(0.8))
    for i, m in enumerate(("D6", "A6", "D7")):
        b = bell(midi_hz(note(m)), 0.45, 2.0, 1.4, 0.16) * 0.26
        s = n_(0.07 * i)
        out[s:s + len(b)] += b
    return wet(out, 0.35, 1.6, 9000)


def heart_break(r):
    """The World's Heart opens: a long golden swell and a choir of bells."""
    d = 4.0
    n = n_(d)
    pad = np.zeros(n)
    for m in ("D3", "A3", "D4", "F#4", "A4", "D5"):
        for det in (0.995, 1.005):
            pad += lp(osc("saw", midi_hz(note(m)) * det, d), 2400) * 0.035
    pad *= env(n, 1.2, 0.5, 0.7, 1.4)
    boom = kick(1.0, 60, 28, 2.0) * 0.7
    pad[: len(boom)] += boom
    for i, m in enumerate(("D6", "F#6", "A6", "D7", "A6", "F#6", "D6")):
        b = bell(midi_hz(note(m)), 1.4, 2.0, 1.2, 0.5) * 0.14
        s = n_(0.8 + 0.22 * i)
        pad[s:s + len(b)] += b[: n - s]
    return wet(pad, 0.55, 3.5, 6000)


def drill_loop(r):
    """A seamless 1 s loop: motor whine (integer Hz) plus gritty chatter."""
    d = 1.0
    n = n_(d)
    k = n_(0.08)
    t = np.arange(n + k) / SR
    motor = np.sin(2 * np.pi * 110 * t) * 0.22 + np.sin(2 * np.pi * 220 * t) * 0.1 + np.sin(2 * np.pi * 330 * t) * 0.05
    grit = bp(np.random.uniform(-1, 1, n + k), 700, 3800) * (0.55 + 0.45 * np.sin(2 * np.pi * 24 * t)) * 0.5
    x = motor + grit
    # crossfade the tail into the head so the loop has no seam
    ramp = np.linspace(0, 1, k)
    out = x[:n].copy()
    out[:k] = x[:k] * ramp + x[n:n + k] * (1 - ramp)
    return out


def tip(r):
    out = np.zeros(n_(0.5))
    for i, m in enumerate(("A5", "E6")):
        b = bell(midi_hz(note(m)), 0.3, 2.0, 0.8, 0.12) * 0.3
        out[n_(0.06 * i):n_(0.06 * i) + len(b)] += b
    return wet(out, 0.25)


def chain_milestone(r):
    out = np.zeros(n_(1.4))
    seq = ("C6", "E6", "G6", "C7")
    for i, m in enumerate(seq):
        b = bell(midi_hz(note(m)), 0.5, 2.0, 1.4, 0.18) * 0.3
        s = n_(0.05 * i)
        out[s:s + len(b)] += b
    sh = hp(noise(0.8), 6000) * exp_decay(n_(0.8), 0.2) * 0.12
    out[: len(sh)] += sh
    boom = kick(0.4, 120, 50, 0.4) * 0.35
    out[: len(boom)] += boom
    return wet(out, 0.35, 1.6, 8000)


def death_gutter(r):
    """The lantern sputters and goes out."""
    d = 1.6
    n = n_(d)
    out = np.zeros(n)
    for _ in range(9):
        at = int(r.uniform(0, n_(1.0)))
        L = n_(0.04)
        c = bp(noise(0.04), 1500, 6000) * exp_decay(L, 0.01) * r.uniform(0.2, 0.5)
        out[at:at + L] += c[: n - at]
    fizz = sweep_lp(noise(d), 6000, 300, 16) * env(n, 0.02, 0.3, 0.5, 1.0) * 0.25
    tone = sweep(440, 110, d, "tri") * env(n, 0.05, 0.4, 0.4, 0.9) * 0.25
    return wet(out + fizz + tone, 0.5, 2.0, 2500)


RECIPES = {
    "ui_move": (ui_move, 3), "ui_select": (ui_select, 1), "ui_back": (ui_back, 1), "ui_deny": (ui_deny, 1), "tick": (tick, 3),
    "drill_rock": (drill_rock, 4), "drill_ore": (drill_ore, 3), "break_rock": (break_rock, 4), "break_ore": (break_ore, 3),
    "shatter": (shatter, 3), "crystal": (crystal, 3), "pickup": (pickup, 1), "light_pickup": (light_pickup, 1),
    "gem_pickup": (gem_pickup, 1), "core_pickup": (core_pickup, 1), "explode": (explode, 3), "shardbomb": (shardbomb, 2), "embershard": (embershard, 3),
    "shard_glass": (shard_glass, 3), "shard_crystal": (shard_crystal, 2), "shard_ember": (shard_ember, 3), "shard_cinnabar": (shard_cinnabar, 2),
    "shard_geode": (shard_geode, 2), "shard_vein": (shard_vein, 2), "shard_fault": (shard_fault, 3), "shard_cataclysm": (shard_cataclysm, 1),
    "shard_void": (shard_void, 2), "shard_prism": (shard_prism, 2), "shard_rune": (shard_rune, 2), "surge": (surge, 1), "nova": (nova, 1),
    "throw": (throw, 2), "thrust_start": (thrust_start, 2), "land": (land, 2), "clank": (clank, 2),
    "levelup": (levelup, 1), "boon_pick": (boon_pick, 1), "reroll": (reroll, 1), "banish": (banish, 1),
    "chain_big": (chain_big, 2), "second_wind": (second_wind, 1), "achievement": (achievement, 1), "buy": (buy, 2),
    "descend": (descend, 1), "biome": (biome, 1), "run_end": (run_end, 1), "heartbeat": (heartbeat, 1), "pylon": (pylon, 1),
    "tip": (tip, 1), "chain_milestone": (chain_milestone, 1), "death_gutter": (death_gutter, 1),
    "cashout": (cashout, 2), "seal_break": (seal_break, 1), "geode": (geode, 2), "relic": (relic, 1), "discover": (discover, 1),
    "heart_break": (heart_break, 1), "drill_loop": (drill_loop, 1),
}


def render_all():
    out = {}
    for key, (fn, n) in RECIPES.items():
        vs = []
        for i in range(n):
            rng = np.random.default_rng(hash((key, i)) & 0xFFFFFFFF)
            np.random.seed(int(rng.integers(0, 2**31)))
            x = fn(rng)
            # trim trailing silence
            nz = np.where(np.abs(x) > 1e-4)[0]
            if len(nz):
                x = x[: nz[-1] + 1]
            x = fade(x, 0.001, 0.008)
            vs.append(x)
        out[key] = vs
    return out
