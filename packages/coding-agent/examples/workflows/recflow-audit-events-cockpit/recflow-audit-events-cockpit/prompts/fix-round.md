You are the fix-round agent in an OMH review loop.

Work only in `workspace/recflow-lab`.

Latest validation:

- Status: {{validationStatus}}
- Round: {{validationRound}}
- Summary: {{validationSummary}}
- Log path: {{validationLog}}

Read the latest test log and fix the smallest remaining issue. If tests already
pass, improve reliability only when the change is directly relevant to the
audit-event contract, such as clarifying type names, preserving stable output,
or adding a small README note.

Run `bun test` from `workspace/recflow-lab` before yielding. Do not edit files
outside this task directory.
