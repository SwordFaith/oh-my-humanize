set -eu

mkdir -p workflow-output
if [ ! -f progress.md ]; then
  printf '# Agent Build/Review Progress\n\n' > progress.md
fi

verify_result='not-run'
{
  printf '# Seed Snapshot\n\n'
  if [ -f task.md ]; then
    printf '## Task\n\n'
    sed -n '1,120p' task.md
    printf '\n'
  fi
  printf '## Files\n\n'
  find . -maxdepth 3 -type f | sort | sed 's#^\./#- #'
  printf '\n## Initial Verification Result\n\n'
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
  printf '```\n'
} > workflow-output/seed-snapshot.md 2>&1

printf '{"summary":"seeded agent build/review progress and baseline verification (%s)","statePatch":[{"op":"set","path":"/progress","value":{"file":"progress.md","snapshot":"workflow-output/seed-snapshot.md","verification":"%s"}}]}\n' "$verify_result" "$verify_result"
