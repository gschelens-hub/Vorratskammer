#!/usr/bin/env bash
# Baut push-worker/552-push.js: eine einzige Datei zum Einfügen im Cloudflare-Dashboard (Worker → Code bearbeiten).
set -euo pipefail
cd "$(dirname "$0")/.."
npx --yes esbuild@0.24.0 push-worker/entry.js --bundle --format=esm --platform=neutral --target=es2022 \
  --banner:js="// 552 – Push-Zentrale. Automatisch erzeugt aus push-worker/handler.js – bitte dort ändern." \
  --outfile=push-worker/552-push.js --log-level=warning
echo "push-worker/552-push.js: $(wc -c < push-worker/552-push.js) Bytes"
