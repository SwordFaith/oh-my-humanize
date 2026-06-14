#!/bin/sh
set -eu

ROOT=$(pwd)
PROJECT="$ROOT/workspace/recflow-lab"
OUT="$ROOT/workflow-output"
mkdir -p "$OUT"

FINAL_LOG="$OUT/final-test.log"
if (cd "$PROJECT" && bun test) > "$FINAL_LOG" 2>&1; then
	STATUS=pass
else
	STATUS=fail
fi

{
	printf '# Recflow Audit Events Outcome\n\n'
	printf '%s\n' "- Final test status: $STATUS"
	printf '%s\n' "- Final test log: workflow-output/final-test.log"
	printf '%s\n' "- Workspace: workspace/recflow-lab"
	printf '\n## Implemented Surface\n\n'
	grep -R "ExecutionEvent\\|collectEvents\\|--events" "$PROJECT/src" "$PROJECT/test" | sed "s#^$ROOT/##" | head -n 120 || true
} > "$OUT/outcome.md"

printf '{"summary":%s,"data":{"status":%s},"statePatch":[{"op":"set","path":"/archive","value":{"status":%s,"summary":%s,"testLog":"workflow-output/final-test.log"}}],"artifacts":["local://workflow-output/outcome.md","local://workflow-output/final-test.log"]}\n' \
	"$(printf '%s' "archived audit-event extension with final tests $STATUS" | jq -Rs .)" \
	"$(printf '%s' "$STATUS" | jq -Rs .)" \
	"$(printf '%s' "$STATUS" | jq -Rs .)" \
	"$(printf '%s' "final tests $STATUS" | jq -Rs .)"
