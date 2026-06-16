Review the code-review remediation for the KDA candidate.

{{fixSummary}}

Return `ISSUES` when any blocking correctness, validation, safety, rollback, or
task-contract issue remains. Return `CLEAN` when no blocking issue remains, even
if advisory follow-up should be recorded for later.

Write findings first, then put exactly one token on the final non-empty line:
`ISSUES` or `CLEAN`.
