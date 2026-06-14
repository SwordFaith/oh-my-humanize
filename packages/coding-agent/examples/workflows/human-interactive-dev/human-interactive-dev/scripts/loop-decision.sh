#!/usr/bin/env sh
set -eu

count="$(cat artifacts/refine-count)"
if [ "$count" -lt 2 ]; then
  verdict=retry
  summary="requested another refinement iteration"
else
  verdict=finish
  summary="accepted refinement after loop"
fi
printf 'verdict=%s\n' "$verdict" > artifacts/loop-decision.txt
printf '{"summary":"%s","statePatch":[{"op":"set","path":"/verdict","value":"%s"}]}\n' "$summary" "$verdict"
