#!/usr/bin/env bash
# Capture simulator, drone planner and SLAM Studio sequentially, then build the GIF.
# Usage: scripts/build-readme-header.sh [output.gif]
# Requires: pnpm, local Chrome, Playwright Chromium, ffmpeg; WebGPU for the drone app.
# Knobs: WIDTH=1200 E2E_FRAME_COUNT=8 E2E_FRAME_MS=900 FRAMERATE=1.111111
# Frame count applies to each app. Servers started by the script are closed afterward.
set -euo pipefail
cd "$(dirname "$0")/.."
exec node scripts/generate-readme-gif.mjs "$@"
