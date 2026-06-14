#!/usr/bin/env sh
set -eu

mkdir -p artifacts
count=0
if [ -f artifacts/refine-count ]; then
  count="$(cat artifacts/refine-count)"
fi
count=$((count + 1))
printf '%s\n' "$count" > artifacts/refine-count
printf 'iteration=%s\n' "$count" >> artifacts/refinement.txt
printf '{"summary":"ran refinement iteration %s"}\n' "$count"
