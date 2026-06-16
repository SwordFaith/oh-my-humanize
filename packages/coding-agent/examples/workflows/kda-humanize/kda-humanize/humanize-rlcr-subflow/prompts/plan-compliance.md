Review whether this KDA plan is safe to hand to the nested Humanize build/review
subflow.

{{plan}}

Return `PASS` only when the plan is relevant to the task contract, names a
bounded project scope, includes validation evidence, and does not require an
unsafe branch/worktree switch. Return `FAIL_RELEVANCE` when the plan is too
vague, off-scope, missing acceptance criteria, or not executable in the current
project. Return `FAIL_BRANCH_SWITCH` when the plan asks to switch branches,
rewrite unrelated history, or leave the current worktree.

Write the reason first, then put exactly one token on the final non-empty line:
`PASS`, `FAIL_RELEVANCE`, or `FAIL_BRANCH_SWITCH`.
