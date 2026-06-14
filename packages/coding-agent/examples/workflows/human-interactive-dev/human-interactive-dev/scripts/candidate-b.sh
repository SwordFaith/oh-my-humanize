#!/usr/bin/env sh
set -eu

mkdir -p artifacts
printf 'candidate=B\ntradeoff=broader-refactor\n' > artifacts/candidate-b.txt
printf '{"summary":"prepared candidate B"}\n'
