#!/bin/sh
set -eu

script_dir=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
project_dir=$(CDPATH= cd -- "$script_dir/.." && pwd)
temporary_dir=$(mktemp -d "${TMPDIR:-/tmp}/workpaper-video.XXXXXX")
trap 'rm -rf "$temporary_dir"' EXIT HUP INT TERM

# System frameworks only. Keep compiler caches inside the temporary directory.
/usr/bin/xcrun swiftc -module-cache-path "$temporary_dir/modules" \
  "$script_dir/render-walkthrough.swift" -o "$temporary_dir/render-walkthrough"
"$temporary_dir/render-walkthrough" \
  --input "$project_dir/artifacts" \
  --output "$project_dir/submission/WALKTHROUGH.mp4" \
  "$@"
