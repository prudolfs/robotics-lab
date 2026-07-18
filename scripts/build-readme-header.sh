#!/usr/bin/env bash
# Capture screenshots of the simulator with Playwright, then assemble them into
# the animated GIF used as the README header.
#
# Usage:
#   scripts/build-readme-header.sh [output.gif]
#
# Env knobs:
#   E2E_FRAME_COUNT=6     How many screenshots Playwright captures.
#   E2E_FRAME_MS=1200     Wall-clock ms between captures (sets GIF cadence).
#   WIDTH=1200            Output GIF width in pixels (height auto, kept even).
#   FRAMERATE=1.5         GIF playback fps (defaults to FRAME_COUNT / ~4s).
#
# Requires: pnpm, playwright (apps/simulator devDeps), ffmpeg on PATH.
# Reuses apps/simulator's Vite preview build via a dedicated playwright config
# in apps/simulator/screenshots/playwright.config.ts (testDir: ./screenshots),
# so the capture spec is kept out of the regular
# `pnpm -C apps/simulator test:e2e` run.

set -euo pipefail

out="${1:-docs/readme-header.gif}"
width="${WIDTH:-1200}"
count="${E2E_FRAME_COUNT:-6}"
frame_ms="${E2E_FRAME_MS:-1200}"

if [ ! -f "apps/simulator/package.json" ]; then
  echo "build-readme-header: must run from the repo root" >&2
  exit 1
fi
command -v ffmpeg >/dev/null || { echo "build-readme-header: missing dependency: ffmpeg" >&2; exit 1; }

# ── 1. Capture frames with Playwright ──────────────────────────────────────
# Playwright reads E2E_FRAMES_DIR to know where to write PNGs.
tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT
export E2E_FRAMES_DIR="$tmp/frames"
export E2E_FRAME_COUNT="$count"
export E2E_FRAME_MS="$frame_ms"

echo "build-readme-header: capturing $count frames with Playwright…"
pnpm -C apps/simulator exec playwright test \
	--config "$(pwd)/apps/simulator/screenshots/playwright.config.ts" \
	--project chromium

ls "$E2E_FRAMES_DIR"/frame-*.png >/dev/null

# ── 2. Assemble the GIF (two-pass palette, like the PDF variant) ────────────
# GIF fps from frame_ms so playback cadence matches capture cadence by default;
# FRAMERATE overrides it when a slower/smoother effect is wanted.
fr="${FRAMERATE:-$(awk -v ms="$frame_ms" 'BEGIN { printf "%.6f", 1000/ms }')}"
mkdir -p "$(dirname "$out")"

echo "build-readme-header: assembling GIF at ${width}px / ${fr} fps…"
# Two-pass palette generation visibly improves GIF quality over ffmpeg's
# default 256-colour quantiser.
ffmpeg -hide_banner -loglevel error -y \
  -framerate "$fr" -i "$E2E_FRAMES_DIR/frame-%04d.png" \
  -vf "scale=${width}:-2:flags=lanczos,palettegen=stats_mode=full" \
  "$tmp/palette.png"

ffmpeg -hide_banner -loglevel error -y \
  -framerate "$fr" -i "$E2E_FRAMES_DIR/frame-%04d.png" -i "$tmp/palette.png" \
  -filter_complex "[0:v]scale=${width}:-2:flags=lanczos[x];[x][1:v]paletteuse=dither=sierra2_4a" \
  -loop 0 "$out"

echo "build-readme-header: wrote $out"
