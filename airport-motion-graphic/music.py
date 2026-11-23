"""Ambient score + sound design for the airport motion graphic (numpy only).
Writes output/music.wav (48 kHz stereo). Timings match the SCENES table in anim.js.
"""
import numpy as np, wave, os

SR = 48000
DUR = 38.0
N = int(SR * DUR)
t = np.arange(N) / SR
L = np.zeros(N); R = np.zeros(N)
rs = np.random.default_rng(4)

def note(n):  # MIDI -> Hz
    return 440.0 * 2 ** ((n - 69) / 12)

def add(sig, start, gain=1.0, pan=0.0):
    i = int(start * SR)
    if i >= N: return
    sig = sig[: N - i]
    l = np.cos((pan + 1) * np.pi / 4); r = np.sin((pan + 1) * np.pi / 4)
    if np.ndim(pan) == 0:
        L[i:i + len(sig)] += sig * gain * l * 1.414
        R[i:i + len(sig)] += sig * gain * r * 1.414

def add_panned(sig, start, gain, pan_curve):
    i = int(start * SR); sig = sig[: N - i]; p = pan_curve[: len(sig)]
    L[i:i + len(sig)] += sig * gain * np.cos((p + 1) * np.pi / 4) * 1.414
    R[i:i + len(sig)] += sig * gain * np.sin((p + 1) * np.pi / 4) * 1.414

def fft_filter(x, lo=None, hi=None):
    X = np.fft.rfft(x); f = np.fft.rfftfreq(len(x), 1 / SR)
    m = np.ones_like(f)
    if hi: m *= 1 / (1 + (f / hi) ** 4)
    if lo: m *= 1 / (1 + (lo / np.maximum(f, 1e-3)) ** 4)
    return np.fft.irfft(X * m, len(x))

def env(n, a, r, sus=1.0):
    e = np.ones(n) * sus
    na, nr = int(a * SR), int(r * SR)
    e[:na] = np.linspace(0, sus, na) ** 1.5 if na else e[:na]
    if nr: e[-nr:] *= np.linspace(1, 0, nr) ** 2
    return e

# ── pad: chord per scene ──
CH = [  # (start, end, midi notes)
    (0.0, 4.4, [53, 57, 60, 64, 67]),    # Fmaj9
    (4.4, 9.0, [50, 57, 60, 64, 65]),    # Dm9
    (9.0, 11.2, [46, 53, 57, 62, 64]),   # Bbmaj7#11
    (11.2, 16.2, [43, 53, 57, 58, 62]),  # Gm9
    (16.2, 19.4, [48, 55, 60, 62, 67]),  # Cadd9
    (19.4, 24.0, [45, 55, 60, 64, 67]),  # Am7
    (24.0, 26.6, [50, 57, 60, 64, 65]),  # Dm9
    (26.6, 29.0, [46, 53, 57, 60, 62]),  # Bbmaj9
    (29.0, 31.6, [48, 53, 55, 60, 67]),  # Csus4
    (31.6, 38.0, [41, 53, 57, 60, 64, 67]),  # Fmaj9 (resolve)
]
for a, b, notes in CH:
    s0 = max(0, a - 0.6); s1 = min(DUR, b + 1.2)
    n = int((s1 - s0) * SR); tt = np.arange(n) / SR
    e = env(n, 1.1 if a > 0 else 2.0, 1.6)
    for k, m in enumerate(notes):
        f = note(m + (12 if m < 48 and k > 0 else 0))
        for side, det in ((0, -0.0018), (1, 0.0018)):
            ff = f * (1 + det)
            ph = rs.uniform(0, 6.28)
            sig = (np.sin(2 * np.pi * ff * tt + ph) + 0.35 * np.sin(4 * np.pi * ff * tt + ph) + 0.12 * np.sin(6 * np.pi * ff * tt))
            sig *= (0.8 + 0.2 * np.sin(2 * np.pi * (0.15 + 0.05 * k) * tt + k))
            g = 0.055 if k else 0.0
            if side == 0: L[int(s0 * SR):int(s0 * SR) + n] += sig * e * g
            else: R[int(s0 * SR):int(s0 * SR) + n] += sig * e * g
    # bass
    bf = note(notes[0] - 12 if notes[0] >= 45 else notes[0])
    bass = np.sin(2 * np.pi * bf * tt) * e * 0.12
    add(bass, s0, 1.0)

# ── music-box arpeggio from S2 on ──
def bell(f, dur=1.8):
    n = int(dur * SR); tt = np.arange(n) / SR
    s = (np.sin(2 * np.pi * f * tt) * np.exp(-tt * 2.6) + 0.35 * np.sin(2 * np.pi * f * 2.76 * tt) * np.exp(-tt * 5)
         + 0.18 * np.sin(2 * np.pi * f * 5.4 * tt) * np.exp(-tt * 9))
    s[: int(0.004 * SR)] *= np.linspace(0, 1, int(0.004 * SR))
    return s
step = 0.5
tt0 = 4.6
pattern = [0, 2, 4, 3, 1, 4, 2, 3]
i = 0
while tt0 < 36.0:
    if not (16.2 <= tt0 < 19.3):  # leave room for the clocks
        chord = next(c for c in CH if c[0] <= tt0 < c[1])[2]
        tones = sorted(set([m % 12 for m in chord]))
        m = 72 + tones[pattern[i % 8] % len(tones)]
        if pattern[i % 8] == 4: m += 12 if m < 79 else 0
        add(bell(note(m)), tt0, 0.05 * (0.8 + 0.2 * np.sin(i)), pan=0.5 * np.sin(i * 1.3))
    tt0 += step; i += 1

# ── airport chime (ding-dong-dong) ──
def chime(start, g):
    for k, (m, dt) in enumerate([(76, 0.0), (72, 0.42), (67, 0.84)]):
        add(bell(note(m), 2.6) * 1.0, start + dt, g, pan=-0.1 + 0.1 * k)
chime(4.5, 0.11)
chime(31.9, 0.07)

# ── noise effects ──
def noise(d): return rs.standard_normal(int(d * SR))

# jet takeoff rumble in S1
d = 5.2; n = int(d * SR); tt = np.arange(n) / SR
jet = fft_filter(noise(d), lo=40, hi=900) * 0.6 + fft_filter(noise(d), lo=1500, hi=5000) * 0.12
je = (np.clip(tt / 4.0, 0, 1) ** 2.2) * np.clip((d - tt) / 0.9, 0, 1)
add_panned(jet * je, 0.0, 0.32, np.linspace(-0.2, 0.6, n))

def whoosh(center, g, dur=1.2, pan0=0.7, pan1=-0.7):
    n = int(dur * SR); tt = np.arange(n) / SR
    w = fft_filter(noise(dur), lo=250, hi=2500)
    e = np.sin(np.pi * np.clip(tt / dur, 0, 1)) ** 2
    add_panned(w * e, center - dur / 2, g, np.linspace(pan0, pan1, n))
whoosh(9.0, 0.22); whoosh(29.0, 0.22)

# doors slide open (S4)
whoosh(12.75, 0.12, 0.8, -0.3, 0.3)
# pixel dissolve sparkle
for k in range(46):
    st = 13.4 + rs.uniform(0, 2.0)
    add(bell(note(int(84 + rs.choice([0, 2, 4, 7, 9, 12]))), 0.6), st, 0.018, pan=rs.uniform(-0.8, 0.8))
# riser into white-out and soft bloom
d = 1.6; n = int(d * SR); tt = np.arange(n) / SR
ris = fft_filter(noise(d), lo=600, hi=7000) * (tt / d) ** 3
add(ris, 14.6, 0.12)
d = 2.5; n = int(d * SR); tt = np.arange(n) / SR
boom = np.sin(2 * np.pi * 55 * tt) * np.exp(-tt * 2.2) * 0.7 + fft_filter(noise(d), hi=300) * np.exp(-tt * 3) * 0.2
add(boom, 16.2, 0.22)

# clock ticks accelerating (S5)
tk = 16.4; gap = 0.5
while tk < 19.3:
    d = 0.05; n = int(d * SR); tt = np.arange(n) / SR
    click = fft_filter(noise(d), lo=1800, hi=6000) * np.exp(-tt * 140) + np.sin(2 * np.pi * 2200 * tt) * np.exp(-tt * 90) * 0.4
    add(click, tk, 0.12 if int((tk - 16.4) / 0.001) % 2 == 0 else 0.1, pan=rs.uniform(-0.5, 0.5))
    tk += gap; gap = max(0.07, gap * 0.86)

# light switches clunk on (S6), staggered with the ceiling strips
ON = 19.4 + 1.5
for k in range(8):
    d = 0.18; n = int(d * SR); tt = np.arange(n) / SR
    cl = fft_filter(noise(d), lo=120, hi=1800) * np.exp(-tt * 45) + np.sin(2 * np.pi * 90 * tt) * np.exp(-tt * 30) * 0.6
    add(cl, ON + (k + 1) * 0.07 * 1.0 - 0.05, 0.2 * (1 - k * 0.06), pan=-0.8 + k * 0.23)
d = 3.0; n = int(d * SR); tt = np.arange(n) / SR
hum = (np.sin(2 * np.pi * 120 * tt) * 0.5 + np.sin(2 * np.pi * 240 * tt) * 0.2) * np.clip(tt / 0.1, 0, 1) * np.clip((d - tt) / 1.5, 0, 1)
add(hum, ON + 0.1, 0.025)

# soft room tone throughout interior scenes
rt = fft_filter(rs.standard_normal(N), lo=60, hi=600)
mask = ((t > 4.4) & (t < 11.2)) | ((t > 16.2) & (t < 38))
rt *= np.convolve(mask.astype(float), np.ones(SR) / SR, 'same')
L += rt * 0.02; R += np.roll(rt, 2000) * 0.02

# ── reverb (FFT convolution with decaying noise) ──
def reverb(x, secs=2.6, mix=0.28):
    n = int(secs * SR); tt = np.arange(n) / SR
    ir = rs.standard_normal(n) * np.exp(-tt * 2.8)
    ir = fft_filter(ir, hi=5000); ir /= np.sqrt((ir ** 2).sum())
    size = 1 << int(np.ceil(np.log2(len(x) + n)))
    y = np.fft.irfft(np.fft.rfft(x, size) * np.fft.rfft(ir, size), size)[: len(x)]
    return x * (1 - mix) + y * mix * 1.6
L = reverb(L); R = reverb(R)

# master: fades + gentle limiter
fade = np.clip(t / 0.8, 0, 1) * np.clip((DUR - t) / 1.6, 0, 1)
L *= fade; R *= fade
peak = max(np.abs(L).max(), np.abs(R).max())
L = np.tanh(L / peak * 1.3) / np.tanh(1.3) * 0.89
R = np.tanh(R / peak * 1.3) / np.tanh(1.3) * 0.89
out = np.stack([L, R], 1)
os.makedirs('output', exist_ok=True)
with wave.open('output/music.wav', 'wb') as w:
    w.setnchannels(2); w.setsampwidth(2); w.setframerate(SR)
    w.writeframes((out * 32767).astype(np.int16).tobytes())
print('wrote output/music.wav', DUR, 's')
