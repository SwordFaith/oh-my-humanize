set -eu

mkdir -p workflow-output
archive="workflow-output/final-agent-loop-archive.md"

verify_result='not-specified'
verify_command=''
if [ -f task.md ]; then
  verify_command="$(sed -n -E 's/^[[:space:]]*(verify|verification command|validation command)[[:space:]]*:[[:space:]]*(.+)$/\2/ip' task.md | head -n 1)"
fi

{
  printf '# Agent Build/Review Loop Archive\n\n'
  if [ -f task.md ]; then
    printf '## Task\n\n'
    sed -n '1,160p' task.md
    printf '\n'
  fi
  printf '## Progress\n\n'
  sed -n '1,160p' progress.md
  printf '\n## Final Verification\n\n'
  printf '```text\n'
  if [ -n "$verify_command" ]; then
    sh -c "$verify_command" && verify_result='pass' || verify_result='fail'
  else
    printf 'No verification command declared in task.md.\n'
  fi
  printf '```\n\n'
  printf '## Final Files\n\n'
  find . -maxdepth 3 -type f | sort | sed 's#^\./#- #'
} > "$archive" 2>&1

if [ "$verify_result" != "pass" ]; then
  printf 'final task-declared verification did not pass\n' >&2
  exit 1
fi

printf '{"summary":"archived completed agent build/review loop","statePatch":[{"op":"set","path":"/archive","value":{"file":"workflow-output/final-agent-loop-archive.md","verification":"pass"}}]}\n'
