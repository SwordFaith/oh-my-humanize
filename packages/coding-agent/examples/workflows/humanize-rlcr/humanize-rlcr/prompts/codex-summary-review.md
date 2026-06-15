Review the round summary against the immutable goal and acceptance criteria.

Current durable Humanize state:

```json
{{jsonStringify humanize}}
```

Write review findings, then put exactly one control token on the final
non-empty line.

End with `COMPLETE` only when the implementation phase should transition to
code review. Require concrete acceptance evidence, verification evidence or a
valid blocker explanation, and negative-test/regression-risk coverage before
emitting `COMPLETE`.

Use `CONTINUE` when implementation should do another round. If the flow is
stagnating, explicitly say which prior finding repeated and whether human
steering or design adjudication is needed, then end with `CONTINUE`.

Otherwise write the findings without a terminal control token; the workflow maps
that unmatched review text to `CONTINUE`.
