#!/bin/sh
set -eu

ROOT=$(pwd)
PROJECT="$ROOT/workspace/recflow-lab"
OUT="$ROOT/workflow-output"
mkdir -p "$OUT"

LOG="$OUT/quality-check.log"
STATUS=fail
if (cd "$PROJECT" && bun test) > "$LOG" 2>&1; then
	STATUS=pass
fi

printf '{"summary":%s,"data":{"status":%s},"statePatch":[{"op":"set","path":"/quality","value":{"status":%s,"summary":%s,"testLog":"workflow-output/quality-check.log"}}],"artifacts":["local://workflow-output/quality-check.log"]}\n' \
	"$(printf '%s' "quality subflow tests $STATUS" | jq -Rs .)" \
	"$(printf '%s' "$STATUS" | jq -Rs .)" \
	"$(printf '%s' "$STATUS" | jq -Rs .)" \
	"$(printf '%s' "quality subflow tests $STATUS" | jq -Rs .)"
