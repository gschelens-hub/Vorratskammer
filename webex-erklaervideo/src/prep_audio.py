"""Schneidet die Sprachaufnahme in 10 Szenen, strafft das Tempo und erzeugt cues.json.

Aufruf: python3 -I prep_audio.py <vo.mp3> <words.json> <outdir> [N=ersatz.mp3,ersatz_words.json ...]
  Optional ersetzt N=… die Szene N durch eine separat vertonte Aufnahme.
"""
import json, subprocess, sys, re, os

FPS = 30
TEMPO = 1.12          # Sprechtempo-Faktor (Rubberband, Tonhöhe bleibt)
LEAD, TAIL = 0.22, 0.35
FIRST_LEAD, LAST_TAIL = 0.6, 1.5
PAD_PRE, PAD_POST = 0.04, 0.10   # Sicherheitsrand beim Ausschneiden

vo, words_path, out = sys.argv[1:4]
overrides = {int(a.split("=")[0]): a.split("=")[1].split(",") for a in sys.argv[4:]}
os.makedirs(out, exist_ok=True)
words = json.load(open(words_path))["words"]

def silences(path, noise=-40, d=0.3):
    r = subprocess.run(["ffmpeg", "-hide_banner", "-nostats", "-i", path, "-af",
                        f"silencedetect=noise={noise}dB:d={d}", "-f", "null", "-"],
                       capture_output=True, text=True).stderr
    st = [float(x) for x in re.findall(r"silence_start: ([\d.]+)", r)]
    en = [float(x) for x in re.findall(r"silence_end: ([\d.]+)", r)]
    return list(zip(st, en))

total = float(subprocess.run(["ffprobe", "-v", "error", "-show_entries", "format=duration",
                              "-of", "csv=p=0", vo], capture_output=True, text=True).stdout)
sil = silences(vo)

# Szenen anhand der "[long"-Marker trennen
scenes, cur = [], []
for w in words:
    t = w["text"]
    if t.startswith("[long"):
        scenes.append(cur); cur = []
    elif t == "pause]" or (t.startswith("[") and t.endswith("]") and t != "[chuckles]"):
        continue
    else:
        cur.append(w)
scenes.append(cur)
assert len(scenes) == 10, len(scenes)

# Sprechbereich je Szene: an Stille-Grenzen ausrichten
bounds = []
for i, sc in enumerate(scenes):
    s, e = sc[0]["start"], sc[-1]["end"]
    # Start: Ende der Stille, die kurz vor dem ersten Wort liegt
    cand = [b for a, b in sil if b <= sc[0]["end"] - 0.1 and b >= s - 1.2]
    if i > 0 and cand: s = max(cand)
    if i == 0: s = max(0.0, s - 0.05)
    cand = [a for a, b in sil if a >= sc[-1]["start"] + 0.1 and a <= e + 0.6]
    if i < 9 and cand: e = min(cand)
    if i == 9: e = min(total, e + 0.25)
    bounds.append((max(0, s - PAD_PRE), min(total, e + PAD_POST)))

srcs = [vo] * 10
for n, (ovo, ow) in overrides.items():
    ws = [w for w in json.load(open(ow))["words"] if not (w["text"].startswith("[") and w["text"].endswith("]"))]
    scenes[n - 1] = ws
    otot = float(subprocess.run(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", ovo],
                                capture_output=True, text=True).stdout)
    osil = silences(ovo)
    e = ws[-1]["end"]
    cand = [a for a, b in osil if a >= ws[-1]["start"] + 0.1 and a <= e + 0.6]
    if cand: e = min(cand)
    bounds[n - 1] = (max(0, ws[0]["start"] - 0.05 - PAD_PRE), min(otot, e + PAD_POST))
    srcs[n - 1] = ovo

cues, durations = [], []
for i, ((s, e), sc) in enumerate(zip(bounds, scenes)):
    lead = FIRST_LEAD if i == 0 else LEAD
    tail = LAST_TAIL if i == 9 else TAIL
    speech = (e - s) / TEMPO
    dur = round((lead + speech + tail) * FPS) / FPS
    durations.append(dur)
    seg = f"{out}/vo_{i+1:02d}.wav"
    subprocess.run(["ffmpeg", "-v", "error", "-y", "-ss", f"{s:.3f}", "-to", f"{e:.3f}", "-i", srcs[i],
                    "-af", f"rubberband=tempo={TEMPO}:pitchq=quality,afade=t=in:d=0.02,"
                           f"areverse,afade=t=in:d=0.04,areverse,adelay={int(lead*1000)}:all=1,apad,"
                           f"atrim=0:{dur:.6f}",
                    "-ar", "48000", "-ac", "1", seg], check=True)
    cues.append({
        "scene": i + 1, "duration": dur,
        "words": [{"t": w["text"], "s": round(lead + (w["start"] - s) / TEMPO, 3),
                   "e": round(lead + (w["end"] - s) / TEMPO, 3)} for w in sc],
    })
    print(f"Szene {i+1:2d}: Quelle {s:6.2f}-{e:6.2f}  ->  {dur:5.2f}s")

json.dump(cues, open(f"{out}/cues.json", "w"), ensure_ascii=False, indent=1)
print(f"Gesamt: {sum(durations):.2f}s")
