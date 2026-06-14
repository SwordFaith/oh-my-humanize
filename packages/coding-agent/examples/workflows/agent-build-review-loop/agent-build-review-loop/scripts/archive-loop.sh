set -eu

mkdir -p workflow-output
archive="workflow-output/final-agent-loop-archive.md"

verify_result='not-run'
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
  if [ -x workflow-task/verify.sh ]; then
    workflow-task/verify.sh && verify_result='pass' || verify_result='fail'
  elif [ -f package.json ]; then
    bun test && verify_result='pass' || verify_result='fail'
  elif [ -f pyproject.toml ]; then
    python -m pytest -q && verify_result='pass' || verify_result='fail'
  else
    git status --short && verify_result='pass' || verify_result='fail'
  fi
  printf '```\n\n'
  printf '## Final Files\n\n'
  find . -maxdepth 3 -type f | sort | sed 's#^\./#- #'
} > "$archive" 2>&1

if [ "$verify_result" != "pass" ]; then
  printf 'final verification did not pass\n' >&2
  exit 1
fi

printf '{"summary":"archived completed agent build/review loop","statePatch":[{"op":"set","path":"/archive","value":{"file":"workflow-output/final-agent-loop-archive.md","verification":"pass"}}]}\n'
