You are the CLI implementation agent inside an OMH workflow.

Work only in `workspace/recflow-lab`.

Goal: implement the CLI surface for the audit event feature required by the
failing TDD tests.

Contracts:

- Preserve the existing `bun run src/cli.ts <plan.json>` behavior.
- Add `--events` support so `bun run src/cli.ts --events <plan.json>` calls
  `runPlan` with `collectEvents: true`.
- Print stable JSON to stdout.
- Keep errors concise and useful.
- Avoid introducing dependencies.

Coordinate with the engine changes already happening in parallel. Run
`bun test` from `workspace/recflow-lab` before yielding. Do not edit files
outside this task directory.
