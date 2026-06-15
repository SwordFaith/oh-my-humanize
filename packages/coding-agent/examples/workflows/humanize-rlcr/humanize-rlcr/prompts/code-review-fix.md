Fix the review issues found by the Codex-style code review phase.

Current durable Humanize state:

```json
{{jsonStringify humanize}}
```

Fix only the blocking review issues. Keep queued and advisory findings recorded
without turning them into unbounded scope creep.

Keep the branch stable, update the goal tracker, and produce a concise
delta-first summary of changed files, tests, remaining risk, and which review
findings were fixed, deferred, or rejected. If a finding conflicts with a prior
round or repeats as a conceptual issue, request adjudication instead of
performing another blind point fix.
