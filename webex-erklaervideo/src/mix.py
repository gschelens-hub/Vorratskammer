"""Mischt Sprecherin, Soundeffekte und (optional) Musik zur finalen Tonspur.

Aufruf: python3 -I mix.py <scenes_dir> <sfx_dir> <render_dir> <out.wav> [musik.mp3]
  scenes_dir : vo_01.wav … vo_10.wav und cues.json (aus prep_audio.py)
  sfx_dir    : ping.mp3, pop.mp3, whoosh.mp3, click.mp3
  render_dir : sfx_01.json … sfx_10.json (aus render.js)
"""
import json, subprocess, sys
import numpy as np

SR = 48000
scenes_dir, sfx_dir, render_dir, out = sys.argv[1:5]
music = sys.argv[5] if len(sys.argv) > 5 else None

def load(path, sr=SR):
    raw = subprocess.run(["ffmpeg", "-v", "error", "-i", path, "-f", "f32le", "-ac", "1", "-ar", str(sr), "-"],
                         capture_output=True, check=True).stdout
    return np.frombuffer(raw, dtype=np.float32).copy()

def db(x): return 10 ** (x / 20)

# Sprecherin
cues = json.load(open(f"{scenes_dir}/cues.json"))
vo_parts, starts, t = [], [], 0.0
for c in cues:
    a = load(f"{scenes_dir}/vo_{c['scene']:02d}.wav")
    n = int(round(c["duration"] * SR))
    a = np.pad(a, (0, max(0, n - len(a))))[:n]
    vo_parts.append(a); starts.append(t); t += c["duration"]
vo = np.concatenate(vo_parts)
N = len(vo)

# Soundeffekte: Vorlauf-Stille weg, Spitze normieren, Länge begrenzen
SPEC = {"pop": (0.35, -17), "click": (0.25, -15), "ping": (0.9, -15), "whoosh": (1.1, -19)}
lib = {}
for k, (maxlen, gain) in SPEC.items():
    a = load(f"{sfx_dir}/{k}.mp3")
    on = np.argmax(np.abs(a) > 0.03 * np.abs(a).max())
    a = a[max(0, on - int(0.004 * SR)):][: int(maxlen * SR)]
    fade = min(len(a), int(0.08 * SR))
    a[-fade:] *= np.linspace(1, 0, fade)
    lib[k] = a / (np.abs(a).max() + 1e-9) * db(gain)

fx = np.zeros(N, dtype=np.float32)
count = 0
for c, s0 in zip(cues, starts):
    for e in json.load(open(f"{render_dir}/sfx_{c['scene']:02d}.json")):
        a = lib[e["type"]] * e["vol"]
        i = int((s0 + e["t"]) * SR)
        if i >= N: continue
        j = min(N, i + len(a))
        fx[i:j] += a[: j - i]; count += 1

mix = vo + fx

# Musik (optional): Schleife, leise unter der Stimme, Ducking per Stimm-Hüllkurve
if music:
    m = load(music)
    reps = int(np.ceil(N / len(m)))
    m = np.tile(m, reps)[:N]
    env = np.abs(vo)
    k = int(0.25 * SR)
    env = np.convolve(env, np.ones(k) / k, mode="same")
    duck = 1 - 0.55 * np.clip(env / (env.max() * 0.25), 0, 1)
    m = m / (np.sqrt(np.mean(m ** 2)) + 1e-9) * db(-30) * duck
    fi, fo = int(1.0 * SR), int(2.5 * SR)
    m[:fi] *= np.linspace(0, 1, fi); m[-fo:] *= np.linspace(1, 0, fo)
    mix = mix + m

peak = np.abs(mix).max()
if peak > 0.98: mix = mix / peak * 0.98
tmp = out + ".raw.wav"
subprocess.run(["ffmpeg", "-v", "error", "-y", "-f", "f32le", "-ar", str(SR), "-ac", "1", "-i", "-",
                "-ac", "2", tmp], input=mix.astype(np.float32).tobytes(), check=True)
# Lautheit auf -16 LUFS für die Wiedergabe im Meeting
subprocess.run(["ffmpeg", "-v", "error", "-y", "-i", tmp, "-af", "loudnorm=I=-16:TP=-1.5:LRA=11", "-ar", str(SR), out], check=True)
print(f"Tonspur: {N / SR:.2f}s, {count} Soundeffekte, Musik: {'ja' if music else 'nein'}")
