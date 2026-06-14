#!/bin/sh
set -eu

ROOT=$(pwd)
PROJECT="$ROOT/workspace/recflow-lab"
OUT="$ROOT/workflow-output"
mkdir -p "$OUT"

{
	printf '# Static Probe\n\n'
	printf 'Type surface before implementation:\n\n'
	sed -n '1,220p' "$PROJECT/src/types.ts"
	printf '\nEngine surface before implementation:\n\n'
	sed -n '1,260p' "$PROJECT/src/engine.ts"
	printf '\nCLI surface before implementation:\n\n'
	sed -n '1,220p' "$PROJECT/src/cli.ts"
} > "$OUT/static-probe.md"

printf '%s\n' '{"summary":"static probe captured source surfaces for parallel agents","data":{"status":"captured"},"artifacts":["local://workflow-output/static-probe.md"]}'
