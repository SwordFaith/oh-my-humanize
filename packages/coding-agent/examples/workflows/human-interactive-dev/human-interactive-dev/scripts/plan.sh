#!/usr/bin/env sh
set -eu

mkdir -p artifacts
printf 'task=simulate-human-developer\nphase=planned\n' > artifacts/plan.txt
printf '{"summary":"planned interactive developer task","statePatch":[{"op":"set","path":"/phase","value":"planned"}]}\n'
