#!/usr/bin/env python3
"""Derive an auditable edit list from real timestamped UI observations.

This changes timing only. It never creates, modifies, reorders, or deletes frames.
Example used for the submission (run from workpaper):
  python3 scripts/edit-live-capture.py --manifest artifacts/live-capture/manifest.json \
    --output artifacts/live-capture/manifest.edited.json --gap-cap 5 \
    --hold 0:35 --hold 1:20 --hold 35:10 --hold 68:10 --hold 363:10 \
    --closing-hold 26.675
"""
import argparse
import bisect
import json
import math
from pathlib import Path


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--manifest", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--gap-cap", type=float, default=5)
    parser.add_argument("--hold", action="append", default=[], metavar="FRAME_INDEX:SECONDS")
    parser.add_argument("--closing-hold", type=float, default=20)
    args = parser.parse_args()
    if args.output.exists():
        parser.error("Choose a new output manifest; the source and existing edits are preserved.")
    source = json.loads(args.manifest.read_text())
    frames = source["frames"]
    timestamps = [frame["timestampMs"] for frame in frames]
    if not frames or any(not math.isfinite(t) or t < 0 for t in timestamps) or timestamps != sorted(timestamps):
        parser.error("Source frames must have finite, nonnegative, chronological timestamps.")
    if args.gap_cap <= 0 or args.closing_hold <= 0:
        parser.error("Gap cap and closing hold must be positive.")
    holds = {}
    for spec in args.hold:
        index, seconds = spec.split(":")
        index, seconds = int(index), float(seconds)
        if index < 0 or index >= len(frames) - 1 or not math.isfinite(seconds) or seconds < 0:
            parser.error("Hold index must precede the last frame, with nonnegative finite seconds.")
        holds[index] = holds.get(index, 0) + seconds * 1000
    edited_frames = []
    intervals = []
    cursor = 0.0
    for i, frame in enumerate(frames):
        if i:
            original_gap = timestamps[i] - timestamps[i - 1]
            retained_gap = min(original_gap, args.gap_cap * 1000)
            added_hold = holds.get(i - 1, 0)
            cursor += retained_gap + added_hold
            if original_gap != retained_gap or added_hold:
                intervals.append({"afterFrameIndex": i - 1, "sourceGapMs": original_gap,
                                  "retainedGapMs": retained_gap, "addedNarrationHoldMs": added_hold})
        edited_frames.append({**frame, "sourceTimestampMs": frame["timestampMs"], "timestampMs": round(cursor, 3)})
    duration = round(cursor + args.closing_hold * 1000, 3)
    scenes = []
    for scene in source.get("scenes", []):
        index = min(bisect.bisect_left(timestamps, scene["timestampMs"]), len(frames) - 1)
        scenes.append({**scene, "sourceTimestampMs": scene["timestampMs"],
                       "timestampMs": edited_frames[index]["timestampMs"], "firstObservedFrameIndex": index})
    for i, scene in enumerate(scenes):
        scene["endTimestampMs"] = scenes[i + 1]["timestampMs"] if i + 1 < len(scenes) else duration
    edit = {"sourceManifest": str(args.manifest.resolve()), "sourceDurationMs": source["durationMs"],
            "gapCapMs": args.gap_cap * 1000, "closingHoldMs": args.closing_hold * 1000,
            "addedNarrationHoldMs": sum(holds.values()) + args.closing_hold * 1000,
            "trimmedGapCount": sum(item["sourceGapMs"] > item["retainedGapMs"] for item in intervals),
            "timingDisclosure": "Real browser screenshots captured during live interaction. Long observation gaps are capped and selected observed screens held for narration. Actions remain in original order; no synthetic pointer, click animation, intermediate UI frames, or audio were added.",
            "sceneTimingDisclosure": "Scene cues align to the first captured frame at or after each original scene marker; the recorded screen may precede the next UI action.",
            "intervalEdits": intervals}
    result = {**source, "frames": edited_frames, "durationMs": duration, "scenes": scenes, "captureEdit": edit}
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(result, indent=2) + "\n")
    print(json.dumps({"output": str(args.output.resolve()), "durationSeconds": duration / 1000,
                      "sourceDurationSeconds": source["durationMs"] / 1000,
                      "trimmedGapCount": edit["trimmedGapCount"], "scenes": scenes}, indent=2))


if __name__ == "__main__":
    main()
