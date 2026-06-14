#!/usr/bin/env sh
set -eu

test -s artifacts/plan.txt
test -s artifacts/human-intervention.txt
test -s artifacts/implementation.txt
test -s artifacts/evaluation.txt
test -s artifacts/refinement.txt
test "$(cat artifacts/refine-count)" = "2"
printf 'status=complete\n' > artifacts/final-check.txt
printf '{"summary":"final check passed after human intervention, parallel comparison, and loop"}\n'
