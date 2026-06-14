#!/usr/bin/env sh
set -eu

mkdir -p artifacts
printf 'candidate=A\ntradeoff=small-change\n' > artifacts/candidate-a.txt
printf '{"summary":"prepared candidate A"}\n'
