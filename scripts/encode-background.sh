#!/usr/bin/env bash
# Re-encode the ambient background video.
#
# The source was 2888x2160, 21.7 MB, with an audio track on a video the page
# plays MUTED. This produces the asset actually shipped in public/.
#
# Settings, and why:
#   scale=1920   the page renders it object-cover behind a scrim at 78%
#                opacity; 4K detail is not reaching anybody's eye
#   -an          the element is muted and looping. An audio track here is pure
#                payload
#   veryslow     measurably BOTH smaller and higher quality than `slow` at the
#                same CRF (2.65 MB / VMAF 92.7 vs 2.83 MB / 92.6). Encode time
#                is paid once
#   crf 23       chosen by measuring, not by eye. See below
#   aq-mode=3    the content is a starfield over a smooth gradient. Variance
#                adaptive quantisation keeps bitrate on the flat sky, which is
#                where banding would show once the page applies
#                brightness(1.55)
#   +faststart   moves the index to the front so playback starts before the
#                whole file has arrived
#
# Verified with VMAF against the original downscaled to the same resolution:
#
#   crf 30 slow      1.11 MB   85.6   visibly soft
#   crf 27 slow      1.77 MB   89.8
#   crf 24 slow      2.83 MB   92.6
#   crf 24 veryslow  2.65 MB   92.7
#   crf 23 veryslow  3.63 MB   94.2   <- shipped
#   crf 22 veryslow  4.23 MB   94.7   +17% size for +0.5 VMAF
#
# ~93 is the usual "visually indistinguishable" threshold. A single still frame
# looked fine even at crf 30, which is exactly why this was measured across
# every frame instead.
#
# ffmpeg is NOT a dependency of this project — an 82 MB binary on every install
# and every CI run, to re-encode an asset roughly never, is a bad trade. Get one
# for the length of this task and let it go again:
#
#   npm i -D ffmpeg-static && ./scripts/encode-background.sh <src> && npm rm ffmpeg-static
#
# or point FFMPEG at any ffmpeg you already have.
set -euo pipefail

FF="${FFMPEG:-./node_modules/ffmpeg-static/ffmpeg.exe}"
SRC="${1:?usage: encode-background.sh <source.mp4>}"

"$FF" -y -i "$SRC" -an \
  -vf "scale=1920:-2" \
  -c:v libx264 -preset veryslow -crf 23 -x264-params "aq-mode=3" \
  -pix_fmt yuv420p -movflags +faststart \
  public/purple-desert.mp4

# Poster: shown until the video can play through. 2400px and 573 KB for a
# placeholder was more than the thing it stands in for.
"$FF" -y -i "$SRC" -frames:v 1 -vf "scale=1600:-2" -q:v 6 public/purple-desert.jpg

ls -la public/purple-desert.mp4 public/purple-desert.jpg
