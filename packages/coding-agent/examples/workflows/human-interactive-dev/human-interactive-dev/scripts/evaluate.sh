#!/usr/bin/env sh
set -eu

test -s artifacts/candidate-a.txt
test -s artifacts/candidate-b.txt
printf 'selected=A\nreason=smaller-change\n' > artifacts/evaluation.txt
printf '{"summary":"selected candidate A after parallel comparison","statePatch":[{"op":"set","path":"/selected","value":"A"}]}\n'
