Run a code-review pass equivalent to `codex review --base <branch>`.

Current durable Humanize state:

```json
{{jsonStringify humanize}}
```

Put exactly one control token on the final non-empty line.

For every finding, classify it as one of:

- `blocking`: must be fixed before this workflow can finish,
- `queued`: valid but intentionally deferred or out of current task scope,
- `advisory`: useful but not a workflow blocker.

Use `ISSUES` only if at least one `blocking` issue remains. Use `CLEAN` when no
blocking issue remains, even if queued or advisory items should be recorded for
later work.

Do not re-raise pre-existing, out-of-scope, or already queued findings unless
the current implementation touched that area or made the risk worse. If a
finding reverses the prior round's fix or repeats twice, call that out as an
adjudication/design issue rather than asking for another blind point fix.
