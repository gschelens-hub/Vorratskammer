#!/usr/bin/env bash
# Baut 552.zip zum Hochladen bei Cloudflare (Pages → Direkt hochladen).
set -euo pipefail
cd "$(dirname "$0")/.."
rm -f 552.zip
(cd app && zip -q -X -r ../552.zip . -x '.*')
unzip -l 552.zip
