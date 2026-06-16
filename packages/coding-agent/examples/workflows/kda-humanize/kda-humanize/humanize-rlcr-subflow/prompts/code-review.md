Review the current KDA candidate implementation and evidence.

Plan:
{{plan}}

Current review context:
{{reviewContext}}

Inspect the current worktree and workflow evidence as needed. On the first pass,
review the implementation after the summary-review phase. On later passes,
review the latest remediation against the previous blocking findings.

Return `ISSUES` when any blocking correctness, validation, safety, rollback, or
task-contract issue remains. Return `CLEAN` when no blocking issue remains, even
if advisory follow-up should be recorded for later.

Write findings first, then put exactly one token on the final non-empty line:
`ISSUES` or `CLEAN`.
