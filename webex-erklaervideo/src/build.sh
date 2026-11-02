#!/usr/bin/env bash
# Baut das Erklärvideo komplett aus Sprachaufnahme, Wort-Zeitstempeln und Soundeffekten.
# Aufruf: ./build.sh <arbeitsordner> [musik.mp3]
#   Erwartet im Arbeitsordner: audio/vo_take1.mp3, audio/words1.json, sfx/{pop,click,ping,whoosh}.mp3
set -euo pipefail
W="$1"; MUSIC="${2:-}"
SRC="$(cd "$(dirname "$0")" && pwd)"

# 1) Tonspur in Szenen schneiden, Tempo straffen, Cues erzeugen
python3 -I "$SRC/prep_audio.py" "$W/audio/vo_take1.mp3" "$W/audio/words1.json" "$W/scenes"

# 2) Szenen rendern (eine MP4 pro Szene)
node "$SRC/render.js" "$W/scenes/cues.json" "$W/render" --jobs 4

# 3) Szenen verlustfrei zusammenfügen
ls "$W"/render/scene_*.mp4 | sort | sed "s|^|file '|; s|$|'|" > "$W/render/concat.txt"
ffmpeg -v error -y -f concat -safe 0 -i "$W/render/concat.txt" -c copy "$W/video_noaudio.mp4"

# 4) Ton mischen (Stimme + Soundeffekte + optional Musik)
python3 -I "$SRC/mix.py" "$W/scenes" "$W/sfx" "$W/render" "$W/audio_mix.wav" $MUSIC

# 5) Ton anlegen, Video unverändert übernehmen
ffmpeg -v error -y -i "$W/video_noaudio.mp4" -i "$W/audio_mix.wav" -map 0:v -map 1:a \
  -c:v copy -c:a aac -b:a 192k -shortest -movflags +faststart "$W/webex_erklaervideo.mp4"
ffprobe -v error -show_entries format=duration -of csv=p=0 "$W/webex_erklaervideo.mp4"
