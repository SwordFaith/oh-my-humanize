#!/bin/sh
set -eu

ROOT=$(pwd)
PROJECT="$ROOT/workspace/recflow-lab"
OUT="$ROOT/workflow-output"

mkdir -p "$OUT"
{
	printf '# Contract Inspection\n\n'
	printf 'Project files:\n\n'
	find "$PROJECT/src" "$PROJECT/test" -maxdepth 2 -type f | sed "s#^$ROOT/##" | sort | sed 's/^/- /'
	printf '\nCurrent event symbols:\n\n'
	grep -R "events\\|collectEvents\\|ExecutionEvent" "$PROJECT/src" "$PROJECT/test" 2>/dev/null | sed "s#^$ROOT/##" | head -n 80 || true
} > "$OUT/contract-inspection.md"

printf '%s\n' '{"summary":"inspected recflow audit-event contract","statePatch":[{"op":"set","path":"/validation","value":{"status":"inspected","round":0,"summary":"contract inspection written","testLog":"workflow-output/contract-inspection.md"}}],"artifacts":["local://workflow-output/contract-inspection.md"]}'
