#!/usr/bin/env sh
set -eu

mkdir -p artifacts
rm -f \
  artifacts/implementation.txt \
  artifacts/candidate-a.txt \
  artifacts/candidate-b.txt \
  artifacts/evaluation.txt \
  artifacts/refine-count \
  artifacts/refinement.txt \
  artifacts/loop-decision.txt \
  artifacts/final-check.txt
printf 'reset=stale-loop-artifacts\n' > artifacts/reset-artifacts.txt
printf '{"summary":"reset stale artifacts before restarting implementation","statePatch":[{"op":"set","path":"/phase","value":"artifacts-reset"}]}\n'
