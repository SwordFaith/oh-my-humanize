Ask the human operator two focused questions before the RLCR loop starts.

Current durable Humanize state:

```json
{{jsonStringify humanize}}
```

The questions should verify:

1. Which components the plan changes.
2. How the changed components connect.

The human response must explicitly choose proceed, hold for clarification, or
stop. Do not treat silence, ambiguity, or a weak answer as implicit approval. If
the answer is weak, explain the plan and ask whether to proceed, hold, or stop.
