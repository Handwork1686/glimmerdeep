"""Objective audio QA: levels, clipping, DC, spectral balance, loop seams; spectrogram sheet."""
import glob, os, subprocess, sys, json
import numpy as np
from PIL import Image

def load(path):
    raw = subprocess.run(['ffmpeg', '-loglevel', 'error', '-i', path, '-f', 'f32le', '-ac', '2', '-ar', '44100', '-'], capture_output=True).stdout
    return np.frombuffer(raw, dtype=np.float32).reshape(-1, 2).T

def lufs_approx(x):
    from scipy import signal
    # K-weighting approximation: high-shelf + highpass
    b, a = signal.butter(2, 60 / 22050, 'high')
    y = signal.lfilter(b, a, x, axis=1)
    ms = np.mean(y ** 2)
    return -0.691 + 10 * np.log10(ms + 1e-12)

def spectro(x, w=600, h=120):
    from scipy import signal
    m = x.mean(axis=0)
    f, t, S = signal.spectrogram(m, 44100, nperseg=1024, noverlap=512)
    S = 10 * np.log10(S + 1e-12)
    S = np.clip((S + 100) / 80, 0, 1)
    # log-frequency rows
    rows = np.geomspace(30, 16000, h)
    idx = np.searchsorted(f, rows).clip(0, len(f) - 1)
    img = S[idx][::-1]
    img = np.array(Image.fromarray((img * 255).astype(np.uint8)).resize((w, h)))
    return img

out = []
sheet = []
for path in sorted(glob.glob('public/assets/audio/music/*.ogg')) + sorted(glob.glob('public/assets/audio/sfx/*_0.ogg')):
    x = load(path)
    peak = float(np.max(np.abs(x)))
    l = lufs_approx(x)
    dc = float(np.abs(x.mean()))
    seam = float(np.abs(x[:, 0] - x[:, -1]).max()) if 'music' in path else 0
    cent = 0
    m = x.mean(axis=0)
    F = np.abs(np.fft.rfft(m[: 2**16] if len(m) > 2**16 else m))
    fr = np.fft.rfftfreq(min(len(m), 2**16), 1 / 44100)
    cent = float((F * fr).sum() / (F.sum() + 1e-9))
    out.append((os.path.basename(path), x.shape[1] / 44100, peak, l, dc, seam, cent))
    if 'music' in path:
        sheet.append(spectro(x))
for r in out:
    flag = []
    if r[2] > 0.99: flag.append('CLIP?')
    if r[4] > 0.01: flag.append('DC')
    if r[5] > 0.05: flag.append('SEAM')
    print(f"{r[0]:28s} {r[1]:6.2f}s peak {r[2]:.2f}  ~LUFS {r[3]:6.1f}  centroid {r[6]:6.0f}Hz {' '.join(flag)}")
if sheet:
    Image.fromarray(np.vstack(sheet)).save('tools/audio/spectrograms.png')
