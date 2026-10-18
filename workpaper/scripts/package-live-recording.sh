#!/bin/sh
set -eu
script_dir=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
temporary_dir=$(mktemp -d "${TMPDIR:-/tmp}/workpaper-live-video.XXXXXX")
trap 'rm -rf "$temporary_dir"' EXIT HUP INT TERM
/usr/bin/xcrun swiftc -module-cache-path "$temporary_dir/modules" \
  "$script_dir/package-live-recording.swift" -o "$temporary_dir/package-live-recording"
"$temporary_dir/package-live-recording" "$@"
