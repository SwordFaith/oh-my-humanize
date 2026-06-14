#!/usr/bin/env sh
set -eu

mkdir -p artifacts
printf 'human=sihao\nintervention=add-pre-implementation-checkpoint\n' > artifacts/human-intervention.txt
printf '{"summary":"recorded human intervention before restarting implementation","statePatch":[{"op":"set","path":"/phase","value":"human-intervened"}]}\n'
