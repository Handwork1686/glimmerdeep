"""Small numpy synthesizer: oscillators, envelopes, filters, drums, effects."""
from __future__ import annotations

import numpy as np
from scipy import signal
from scipy.ndimage import maximum_filter1d

SR = 44100


def t_axis(dur: float) -> np.ndarray:
    return np.arange(int(dur * SR)) / SR


def midi_hz(m: float) -> float:
    return 440.0 * 2 ** ((m - 69) / 12)


NOTE = {"C": 0, "D": 2, "E": 4, "F": 5, "G": 7, "A": 9, "B": 11}


def note(s: str) -> int:
    """'C4' 'F#3' 'Bb2' -> midi number."""
    n = NOTE[s[0].upper()]
    i = 1
    if s[i] in "#b":
        n += 1 if s[i] == "#" else -1
        i += 1
    return n + 12 * (int(s[i:]) + 1)


# ------------------------------------------------------------- oscillators
def phase_of(freq, n: int) -> np.ndarray:
    f = np.broadcast_to(np.asarray(freq, dtype=np.float64), (n,))
    return np.cumsum(f) / SR


def polyblep(t: np.ndarray, dt: np.ndarray) -> np.ndarray:
    out = np.zeros_like(t)
    m1 = t < dt
    x = t[m1] / dt[m1]
    out[m1] = x + x - x * x - 1
    m2 = t > 1 - dt
    x = (t[m2] - 1) / dt[m2]
    out[m2] = x * x + x + x + 1
    return out


def osc(kind: str, freq, dur: float, pw: float = 0.5, phase0: float = 0.0) -> np.ndarray:
    n = int(dur * SR)
    if n <= 0:
        return np.zeros(0)
    ph = (phase_of(freq, n) + phase0) % 1.0
    f = np.broadcast_to(np.asarray(freq, dtype=np.float64), (n,))
    dt = np.clip(f / SR, 1e-6, 0.5)
    if kind == "sine":
        return np.sin(2 * np.pi * ph)
    if kind == "tri":
        return 4 * np.abs(ph - 0.5) - 1
    if kind == "saw":
        return (2 * ph - 1) - polyblep(ph, dt)
    if kind == "square":
        sq = np.where(ph < pw, 1.0, -1.0)
        sq += polyblep(ph, dt)
        sq -= polyblep((ph + 1 - pw) % 1.0, dt)
        return sq
    if kind == "noise":
        return np.random.uniform(-1, 1, n)
    raise ValueError(kind)


def env(n: int, a: float, d: float, s: float, r: float, hold: float | None = None) -> np.ndarray:
    """ADSR. `hold` = gate length in seconds (defaults to whole buffer minus release)."""
    e = np.zeros(n)
    A, D, R = int(a * SR), int(d * SR), int(r * SR)
    gate = int((hold if hold is not None else n / SR - r) * SR)
    gate = max(1, min(n, gate))
    i = 0
    if A > 0:
        k = min(A, gate)
        e[:k] = np.linspace(0, 1, A)[:k]
        i = k
    if i < gate:
        k = min(D, gate - i)
        if k > 0:
            e[i:i + k] = 1 + (s - 1) * (np.linspace(0, 1, D)[:k] ** 0.7)
            i += k
        if i < gate:
            e[i:gate] = s
            i = gate
    last = e[gate - 1] if gate > 0 else 0
    if R > 0 and gate < n:
        k = min(R, n - gate)
        e[gate:gate + k] = last * (1 - np.linspace(0, 1, R)[:k]) ** 2
    return e


def exp_decay(n: int, tau: float) -> np.ndarray:
    return np.exp(-np.arange(n) / SR / max(tau, 1e-4))


# ------------------------------------------------------------------ filters
def lp(x: np.ndarray, cutoff: float, order: int = 2) -> np.ndarray:
    cutoff = min(cutoff, SR * 0.45)
    b, a = signal.butter(order, cutoff / (SR / 2), "low")
    return signal.lfilter(b, a, x)


def hp(x: np.ndarray, cutoff: float, order: int = 2) -> np.ndarray:
    b, a = signal.butter(order, max(10, cutoff) / (SR / 2), "high")
    return signal.lfilter(b, a, x)


def bp(x: np.ndarray, lo: float, hi: float, order: int = 2) -> np.ndarray:
    b, a = signal.butter(order, [max(10, lo) / (SR / 2), min(hi, SR * 0.45) / (SR / 2)], "band")
    return signal.lfilter(b, a, x)


def sweep_lp(x: np.ndarray, start: float, end: float, steps: int = 32) -> np.ndarray:
    """Piecewise lowpass sweep (cheap time-varying filter)."""
    out = np.zeros_like(x)
    n = len(x)
    seg = max(1, n // steps)
    zi = None
    for i in range(0, n, seg):
        k = i / max(1, n - 1)
        cut = start * (end / start) ** k
        b, a = signal.butter(2, min(cut, SR * 0.45) / (SR / 2), "low")
        if zi is None:
            zi = signal.lfilter_zi(b, a) * 0
        y, zi = signal.lfilter(b, a, x[i:i + seg], zi=zi)
        out[i:i + seg] = y
    return out


# ------------------------------------------------------------------ effects
def drive(x: np.ndarray, amt: float) -> np.ndarray:
    return np.tanh(x * amt) / np.tanh(amt)


def crush(x: np.ndarray, bits: int = 6, down: int = 2) -> np.ndarray:
    q = 2 ** (bits - 1)
    y = np.round(x * q) / q
    if down > 1:
        y = np.repeat(y[::down], down)[: len(x)]
    return y


def impulse(seconds: float = 2.2, damp: float = 3000, seed: int = 1, pre: float = 0.012) -> np.ndarray:
    rng = np.random.default_rng(seed)
    n = int(seconds * SR)
    ir = rng.uniform(-1, 1, n) * exp_decay(n, seconds / 6.5)
    ir = lp(ir, damp)
    ir[: int(pre * SR)] = 0
    return ir / np.sqrt(np.sum(ir ** 2))


_IR_CACHE: dict = {}


def reverb(x: np.ndarray, seconds: float = 2.2, damp: float = 3000, seed: int = 1) -> np.ndarray:
    key = (seconds, damp, seed)
    if key not in _IR_CACHE:
        _IR_CACHE[key] = impulse(seconds, damp, seed)
    return signal.fftconvolve(x, _IR_CACHE[key])[: len(x) + len(_IR_CACHE[key])]


def delay(x: np.ndarray, t: float, fb: float = 0.35, repeats: int = 5, tone: float = 4000) -> np.ndarray:
    d = int(t * SR)
    out = np.zeros(len(x) + d * repeats)
    out[: len(x)] += x
    tap = x.copy()
    for k in range(1, repeats + 1):
        tap = lp(tap, tone) * fb
        out[d * k:d * k + len(tap)] += tap
    return out


def limiter(x: np.ndarray, ceiling: float = 0.89, release: float = 0.08) -> np.ndarray:
    """Look-ahead-ish peak limiter on mono or stereo arrays."""
    mono = np.max(np.abs(x), axis=0) if x.ndim == 2 else np.abs(x)
    peak = maximum_filter1d(mono, size=int(0.004 * SR) + 1)
    gain = np.minimum(1.0, ceiling / np.maximum(peak, 1e-9))
    # smooth release
    b, a = signal.butter(1, (1 / release) / (SR / 2))
    g = signal.filtfilt(b, a, gain)
    g = np.minimum(g, gain)
    return x * g


def fade(x: np.ndarray, a: float = 0.002, r: float = 0.01) -> np.ndarray:
    n = len(x)
    A, R = min(n, int(a * SR)), min(n, int(r * SR))
    y = x.copy()
    if A:
        y[:A] *= np.linspace(0, 1, A)
    if R:
        y[-R:] *= np.linspace(1, 0, R)
    return y


# ------------------------------------------------------------- instruments
def karplus(freq: float, dur: float, decay: float = 0.996, bright: float = 0.5, seed: int = 0) -> np.ndarray:
    n = int(dur * SR)
    p = max(2, int(SR / freq))
    rng = np.random.default_rng(seed)
    buf = rng.uniform(-1, 1, p)
    buf = lp(buf, 1500 + 8000 * bright)
    out = np.empty(n)
    # vectorised in blocks of one period
    i = 0
    while i < n:
        k = min(p, n - i)
        out[i:i + k] = buf[:k]
        nxt = decay * 0.5 * (buf + np.roll(buf, -1))
        buf = nxt
        i += k
    return out


def fm(freq: float, dur: float, ratio: float = 2.0, index: float = 2.0, idecay: float = 0.3) -> np.ndarray:
    n = int(dur * SR)
    t = np.arange(n) / SR
    ienv = index * np.exp(-t / idecay)
    mod = np.sin(2 * np.pi * freq * ratio * t) * ienv
    return np.sin(2 * np.pi * freq * t + mod)


def kick(dur: float = 0.45, f0: float = 150, f1: float = 44, punch: float = 1.0) -> np.ndarray:
    n = int(dur * SR)
    t = np.arange(n) / SR
    f = f1 + (f0 - f1) * np.exp(-t / 0.045)
    x = np.sin(2 * np.pi * np.cumsum(f) / SR) * exp_decay(n, 0.16)
    click = hp(np.random.uniform(-1, 1, n), 2000) * exp_decay(n, 0.004) * 0.3 * punch
    return drive(x + click, 1.6)


def snare(dur: float = 0.25, tone: float = 185) -> np.ndarray:
    n = int(dur * SR)
    body = osc("sine", tone, dur) * exp_decay(n, 0.05) * 0.6
    nz = bp(np.random.uniform(-1, 1, n), 1200, 7000) * exp_decay(n, 0.07)
    return drive(body + nz, 1.3)


def hat(dur: float = 0.06, open_: bool = False) -> np.ndarray:
    n = int((0.3 if open_ else dur) * SR)
    x = hp(np.random.uniform(-1, 1, n), 7000)
    return x * exp_decay(n, 0.09 if open_ else 0.018) * 0.6


def shaker(dur: float = 0.09) -> np.ndarray:
    n = int(dur * SR)
    x = bp(np.random.uniform(-1, 1, n), 4000, 11000)
    e = np.minimum(1, np.arange(n) / (0.012 * SR)) * exp_decay(n, 0.03)
    return x * e * 0.5


def tom(freq: float = 110, dur: float = 0.4) -> np.ndarray:
    n = int(dur * SR)
    t = np.arange(n) / SR
    f = freq * (1 + 0.6 * np.exp(-t / 0.03))
    return np.sin(2 * np.pi * np.cumsum(f) / SR) * exp_decay(n, 0.13)


def normalize(x: np.ndarray, peak: float = 0.9) -> np.ndarray:
    m = np.max(np.abs(x))
    return x if m < 1e-9 else x * (peak / m)


def rms_db(x: np.ndarray) -> float:
    return 20 * np.log10(np.sqrt(np.mean(x ** 2)) + 1e-12)
