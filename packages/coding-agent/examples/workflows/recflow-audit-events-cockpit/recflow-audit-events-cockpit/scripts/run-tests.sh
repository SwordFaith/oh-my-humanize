#!/bin/sh
set -eu

ROOT=$(pwd)
PROJECT="$ROOT/workspace/recflow-lab"
OUT="$ROOT/workflow-output"
mkdir -p "$OUT"

ROUND_FILE="$OUT/round.txt"
ROUND=0
if [ -f "$ROUND_FILE" ]; then
	ROUND=$(cat "$ROUND_FILE")
fi
ROUND=$((ROUND + 1))
printf '%s\n' "$ROUND" > "$ROUND_FILE"

LOG="$OUT/test-round-$ROUND.log"
STATUS=fail
if (cd "$PROJECT" && bun test) > "$LOG" 2>&1; then
	STATUS=pass
fi
cp "$LOG" "$OUT/test.log"

SUMMARY="round $ROUND tests $STATUS"
MIN_ROUNDS_MET=false
if [ "$ROUND" -ge 3 ]; then
	MIN_ROUNDS_MET=true
fi

cat > "$OUT/test-status.json" <<JSON
{
  "status": "$STATUS",
  "round": $ROUND,
  "minimumRoundsMet": $MIN_ROUNDS_MET,
  "summary": "$SUMMARY",
  "testLog": "workflow-output/test-round-$ROUND.log"
}
JSON

printf '{"summary":%s,"data":{"status":%s,"round":%s,"minimumRoundsMet":%s},"statePatch":[{"op":"set","path":"/validation","value":{"status":%s,"round":%s,"minimumRoundsMet":%s,"summary":%s,"testLog":%s}}],"artifacts":["local://workflow-output/test-round-%s.log","local://workflow-output/test-status.json"]}\n' \
	"$(printf '%s' "$SUMMARY" | jq -Rs .)" \
	"$(printf '%s' "$STATUS" | jq -Rs .)" \
	"$ROUND" \
	"$MIN_ROUNDS_MET" \
	"$(printf '%s' "$STATUS" | jq -Rs .)" \
	"$ROUND" \
	"$MIN_ROUNDS_MET" \
	"$(printf '%s' "$SUMMARY" | jq -Rs .)" \
	"$(printf '%s' "workflow-output/test-round-$ROUND.log" | jq -Rs .)" \
	"$ROUND"
