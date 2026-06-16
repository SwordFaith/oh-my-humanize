Review whether this KDA plan is safe to hand to the nested Humanize build/review
subflow.

{{plan}}

Return `PASS` only when the plan is relevant to the task contract, names a
bounded project scope, includes validation evidence, and does not require an
unsafe branch/worktree switch. Return `FAIL_RELEVANCE` when the plan is too
vague, off-scope, missing acceptance criteria, or not executable in the current
project. Return `FAIL_BRANCH_SWITCH` when the plan asks to switch branches,
rewrite unrelated history, or leave the current worktree.

A validation gap can be executable when the plan explicitly repairs it. Do not
return `FAIL_RELEVANCE` solely because a validation command target or missing
validation file is absent before implementation when the plan explicitly makes
creating or fixing that artifact part of the candidate scope, keeps the repair
bounded to the task contract, and requires the final validation command to pass.
Return `FAIL_RELEVANCE` when the plan ignores the missing artifact, treats a
placeholder as sufficient evidence, or cannot explain how the validation target
will become meaningful.

Write the reason first, then put exactly one token on the final non-empty line:
`PASS`, `FAIL_RELEVANCE`, or `FAIL_BRANCH_SWITCH`.
