set -eu

mkdir -p workflow-output
if [ ! -f progress.md ]; then
  printf '# Agent Build/Review Progress\n\n' > progress.md
fi

verify_result='not-specified'
verify_command=''
if [ -f task.md ]; then
  verify_command="$(sed -n -E 's/^[[:space:]]*(verify|verification command|validation command)[[:space:]]*:[[:space:]]*(.+)$/\2/ip' task.md | head -n 1)"
fi

{
  printf '# Initial Loop Snapshot\n\n'
  if [ -f task.md ]; then
    printf '## Task\n\n'
    sed -n '1,120p' task.md
    printf '\n'
  fi
  printf '## Files\n\n'
  find . -maxdepth 3 -type f | sort | sed 's#^\./#- #'
  printf '\n## Initial Verification Result\n\n'
  printf '```text\n'
  if [ -n "$verify_command" ]; then
    sh -c "$verify_command" && verify_result='pass' || verify_result='fail'
  else
    printf 'No verification command declared in task.md.\n'
  fi
  printf '```\n'
} > workflow-output/initial-loop-snapshot.md 2>&1

printf '{"summary":"initialized agent build/review loop with task-declared verification (%s)","statePatch":[{"op":"set","path":"/progress","value":{"file":"progress.md","snapshot":"workflow-output/initial-loop-snapshot.md","verification":"%s"}}]}\n' "$verify_result" "$verify_result"
