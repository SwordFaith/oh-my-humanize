#!/usr/bin/env sh
set -eu

mkdir -p artifacts
printf 'phase=implementation-started\n' > artifacts/implementation.txt
sleep 2
printf 'phase=implementation-finished\n' >> artifacts/implementation.txt
printf '{"summary":"implemented candidate scaffold","statePatch":[{"op":"set","path":"/phase","value":"implemented"}]}\n'
