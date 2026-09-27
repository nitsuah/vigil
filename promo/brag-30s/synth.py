# Music + SFX for the Vigil 30s spot. 120 BPM, D minor.
# Usage: python3 synth.py <spot.json> <out.wav>
# Scene cuts sit on the bar (2s); event times come from spot.json so the
# chip pops, typing and clicks stay locked to the picture.
import json
import sys
import numpy as np
from scipy.signal import butter, sosfilt, fftconvolve
import wave

SPOT = json.load(open(sys.argv[1]))
OUT = sys.argv[2]
HOOK = SPOT['hook']
CLICKS = SPOT['clicks']
SR = 44100
DUR = float(SPOT['duration'])
N = int(SR * DUR)
rng = np.random.default_rng(7)
BEAT = 0.5

def hz(midi): return 440.0 * 2 ** ((midi - 69) / 12)
def db(x): return 10 ** (x / 20)
def lp(x, f, o=2): return sosfilt(butter(o, f, 'low', fs=SR, output='sos'), x)
def hp(x, f, o=2): return sosfilt(butter(o, f, 'high', fs=SR, output='sos'), x)
def bp(x, lo, hi, o=2): return sosfilt(butter(o, [lo, hi], 'band', fs=SR, output='sos'), x)

def place(buf, sig, t, gain=1.0):
    i = int(t * SR)
    if i >= len(buf): return
    s = sig[: len(buf) - i]
    buf[i:i + len(s)] += s * gain

def saw(f, n, harm=10, detune=0.0):
    t = np.arange(n) / SR
    out = np.zeros(n)
    for k in range(1, harm + 1):
        if f * k > 9000: break
        out += np.sin(2 * np.pi * f * k * t * (1 + detune)) / k
    return out

def env_adsr(n, a, r):
    e = np.ones(n)
    na, nr = int(a * SR), int(r * SR)
    e[:na] = np.linspace(0, 1, na)
    e[-nr:] *= np.linspace(1, 0, nr)
    return e

def pluck(f, dur=0.35, bright=4):
    n = int(dur * SR)
    t = np.arange(n) / SR
    s = np.zeros(n)
    for k in range(1, bright + 1):
        s += np.sin(2 * np.pi * f * k * t) * (0.55 ** (k - 1)) * np.exp(-t * (6 + 4 * k))
    s *= np.minimum(1, t / 0.003)
    return s

# Chords per 2s bar: Dm Bb F C (midi)
CHORDS = [[62, 65, 69], [58, 62, 65], [53, 57, 60, 65], [55, 60, 64]]
ROOTS = [50, 46, 53, 48]
DM_PENT = [62, 65, 67, 69, 72, 74, 77, 79, 81, 84]

music = np.zeros(N)
sfx = np.zeros(N)
kick_env = np.zeros(N)  # for sidechain

# --- Pad (whole piece), filtered darker during hook ---
pad = np.zeros(N)
BARS = int(DUR // 2) + 1
for bar in range(BARS):
    t0 = bar * 2.0
    n = int(2.6 * SR)
    ch = CHORDS[bar % 4]
    if bar >= BARS - 2: ch = CHORDS[0]
    v = np.zeros(n)
    for m in ch:
        for d in (-0.004, 0.0, 0.004):
            v += saw(hz(m), n, harm=8, detune=d)
    v *= env_adsr(n, 0.45, 0.8)
    place(pad, v, t0 - 0.2 if bar else 0, 1.0)
pad_hook = lp(pad, 700)
pad_open = lp(pad, 2200)
x = np.clip((np.arange(N) / SR - 1.1) / 1.9, 0, 1)  # opens up from the answer to the reveal
pad = pad_hook * (1 - x) + pad_open * x
pad *= 0.5 + 0.5 * np.clip((np.arange(N) / SR - 1.25) / 0.3, 0, 1)
music += pad * db(-27)

# --- Kick: four on the floor 3.0–18.5, half time in outro ---
def kick():
    n = int(0.35 * SR)
    t = np.arange(n) / SR
    f = 45 + 75 * np.exp(-t * 28)
    ph = 2 * np.pi * np.cumsum(f) / SR
    return np.sin(ph) * np.exp(-t * 11) + 0.15 * lp(rng.standard_normal(n), 1800) * np.exp(-t * 60)
OUTRO = SPOT['outroAt']
kicks = [3.0 + i * BEAT for i in range(int((OUTRO - 3.0) / BEAT))] + [OUTRO + i * 1.0 for i in range(int(DUR - OUTRO))]
for kt in kicks:
    place(music, kick(), kt, db(-9))
    place(kick_env, np.exp(-np.arange(int(0.3 * SR)) / SR * 9), kt, 1.0)
duck = 1 - 0.55 * np.clip(kick_env, 0, 1)

# --- Bass: 8th-note pulse on root from 3.0 ---
bass = np.zeros(N)
t = 3.0
while t < OUTRO + 1.0:
    bar = int(t // 2) % 4
    f = hz(ROOTS[bar] - 12 + 12)  # A2 region
    n = int(0.24 * SR)
    tt = np.arange(n) / SR
    s = (np.sin(2 * np.pi * f * tt) + 0.35 * np.sin(4 * np.pi * f * tt)) * np.exp(-tt * 7) * np.minimum(1, tt / 0.005)
    place(bass, s, t, 1.0)
    t += BEAT / 2
bass = lp(bass, 600)
music += bass * db(-13)

# --- Hats: offbeat 8ths 7.0–18.5 ---
for i in range(int((OUTRO - 7.0) / BEAT)):
    n = int(0.05 * SR)
    h = hp(rng.standard_normal(n), 7000) * np.exp(-np.arange(n) / SR * 90)
    place(music, h, 7.0 + i * BEAT + BEAT / 2, db(-31))

# --- Arp: 8th-note chord tones, octave up, 7.0–18.5 ---
arp = np.zeros(N)
t = 7.0; k = 0
while t < OUTRO - 1e-6:
    bar = int(t // 2) % 4
    ch = CHORDS[bar]
    m = ch[k % len(ch)] + 12 + (12 if k % 8 >= 6 else 0)
    place(arp, pluck(hz(m), 0.3, 3), t, 1.0)
    t += BEAT / 2; k += 1
music += lp(arp, 3500) * db(-27)

music *= duck

# --- SFX (in key, same room) ---
def tick(level=-34):
    n = int(0.018 * SR)
    s = bp(rng.standard_normal(n), 2500, 6000) * np.exp(-np.arange(n) / SR * 260)
    return s * db(level)

# Hook: repo chips pop up the D minor pentatonic, the count lands on a soft
# low hit, the question types, and its last letter hangs on an unresolved
# Bb/E chord that the groove at 3.0 resolves.
for i in range(10):
    place(sfx, pluck(hz(DM_PENT[i] + 12), 0.22, 2), HOOK['chipsStart'] + i * HOOK['chipGap'], db(-30 + i * 0.6))
def thud(m):
    n = int(0.5 * SR); t_ = np.arange(n) / SR
    return (np.sin(2 * np.pi * hz(m) * t_) * np.exp(-t_ * 9) + 0.25 * np.sin(2 * np.pi * hz(m + 12) * t_) * np.exp(-t_ * 12)) * np.minimum(1, t_ / 0.004)
place(sfx, thud(38), HOOK['countAt'], db(-18))
q = 'What do I work on next?'
for i, ch in enumerate(q):
    if ch != ' ': place(sfx, tick(-35), HOOK['typeAt'] + i / HOOK['typeCps'])
q_end = HOOK['typeAt'] + len(q) / HOOK['typeCps']

def chord_hit(notes, bass_midi, decay=2.4):
    n = int(1.6 * SR)
    t_ = np.arange(n) / SR
    s = np.sin(2 * np.pi * hz(bass_midi) * t_) * np.exp(-t_ * 3)
    for m in notes:
        s += 0.3 * np.sin(2 * np.pi * hz(m) * t_) * np.exp(-t_ * decay)
    return s * np.minimum(1, t_ / 0.004)
place(sfx, chord_hit([58, 64, 69], 46), q_end + 0.05, db(-20))
nr = int(0.9 * SR); tr = np.linspace(0, 1, nr); noise = rng.standard_normal(nr)
place(sfx, (bp(noise, 400, 1500) * (1 - tr) + bp(noise, 2000, 7000) * tr) * tr ** 2, 2.1, db(-29))

def whoosh(length=0.6, up=True):
    n = int(length * SR)
    tt = np.linspace(0, 1, n)
    noise = rng.standard_normal(n)
    lo, hi = bp(noise, 300, 1200), bp(noise, 1500, 5000)
    mix = lo * (1 - tt) + hi * tt if up else lo * tt + hi * (1 - tt)
    return mix * np.sin(np.pi * tt) ** 2
for tt in [a for _, a, _ in SPOT['scenes'][1:]]:
    place(sfx, whoosh(0.55), tt - 0.4, db(-25))

def impact(root_midi):
    n = int(1.6 * SR)
    t_ = np.arange(n) / SR
    s = np.sin(2 * np.pi * hz(root_midi - 12) * t_) * np.exp(-t_ * 3)
    for m in (root_midi, root_midi + 7, root_midi + 12, root_midi + 15):
        s += 0.3 * np.sin(2 * np.pi * hz(m) * t_) * np.exp(-t_ * 2.2)
    return s * np.minimum(1, t_ / 0.004)
place(sfx, impact(50), OUTRO + 0.1, db(-17))      # outro logo
place(sfx, pluck(hz(74), 0.6, 2), OUTRO + 1.2, db(-24))   # chips land: D5 + A5
place(sfx, pluck(hz(81), 0.8, 2), OUTRO + 1.27, db(-24))

# Clicks: soft click + tonal blip; P2 reveals more cards (rising pair),
# confirming the agent's edge gets a warm major-third "yes".
def click(m):
    n = int(0.03 * SR)
    c = bp(rng.standard_normal(n), 1500, 4000) * np.exp(-np.arange(n) / SR * 200) * 0.6
    s = pluck(hz(m), 0.3, 2)
    s[:n] += c
    return s
place(sfx, click(69), CLICKS['p2'], db(-21))
place(sfx, pluck(hz(74), 0.35, 2), CLICKS['p2'] + 0.14, db(-24))
# Inspect: the three checklist cards land on a rising D minor triad.
for i, at in enumerate(SPOT['cards']):
    place(sfx, pluck(hz([62, 65, 69][i]), 0.45, 3), at + 0.08, db(-22))
    place(sfx, whoosh(0.3), at - 0.12, db(-33))
# Fix All, then Create PR, then the PR-opened chime (F5 A5 D6, bright and short).
place(sfx, click(67), CLICKS['fixAll'], db(-21))
place(sfx, click(72), CLICKS['createPr'], db(-20))
for i, mm in enumerate([77, 81, 86]):
    place(sfx, pluck(hz(mm), 0.6, 2), SPOT['prOpenedAt'] + i * 0.07, db(-22))
place(sfx, click(65), CLICKS['confirm'], db(-21))
place(sfx, pluck(hz(69), 0.4, 2), CLICKS['confirm'] + 0.12, db(-23))
place(sfx, pluck(hz(74), 0.5, 2), CLICKS['confirm'] + 0.22, db(-23))

# Terminal: typing, tool call, result lines
for i, ch in enumerate(SPOT['question']):
    if ch != ' ': place(sfx, tick(-37), SPOT['questionAt'] + 0.1 + i / 34)
place(sfx, pluck(hz(81), 0.35, 2), SPOT['toolAt'], db(-23))
place(sfx, pluck(hz(77), 0.25, 1), SPOT['resultAt'], db(-30))
for i in range(4):
    place(sfx, pluck(hz([69, 72, 74, 77][i]), 0.18, 1), SPOT['resultAt'] + 0.3 + i * 0.28, db(-31))

# --- Shared room ---
def reverb(x, secs=1.8, seed=1):
    r = np.random.default_rng(seed)
    n = int(secs * SR)
    ir = r.standard_normal(n) * np.exp(-np.arange(n) / SR * (6.9 / secs))
    ir = lp(ir, 5000); ir /= np.sqrt(np.sum(ir ** 2))
    return fftconvolve(x, ir)[: len(x)]

dry = music + sfx
L = dry + 0.22 * reverb(music, seed=1) + 0.32 * reverb(sfx, seed=3)
R = dry + 0.22 * reverb(music, seed=2) + 0.32 * reverb(sfx, seed=4)
st = np.stack([L, R], 1)
st = hp(st.T, 30).T
# gentle bus glue + limiter-ish soft clip
st = st / np.max(np.abs(st)) * 0.9
st = np.tanh(st) / np.tanh(0.9)
fade = np.ones(N); nf = int(0.8 * SR); fade[-nf:] = np.linspace(1, 0, nf) ** 2
fin = np.ones(N); fin[:220] = np.linspace(0, 1, 220)
st *= (fade * fin)[:, None]
st *= db(-1.0) / np.max(np.abs(st))
pcm = (st * 32767).astype(np.int16)
with wave.open(OUT, 'wb') as w:
    w.setnchannels(2); w.setsampwidth(2); w.setframerate(SR); w.writeframes(pcm.tobytes())
print('ok', pcm.shape)
