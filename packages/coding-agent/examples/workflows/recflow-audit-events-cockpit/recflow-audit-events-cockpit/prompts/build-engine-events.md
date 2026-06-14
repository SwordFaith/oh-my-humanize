You are the engine implementation agent inside an OMH workflow.

Work only in `workspace/recflow-lab`.

Goal: implement the engine-side audit event feature required by the failing TDD
tests.

Contracts:

- Preserve all existing `runPlan` recursive runner behavior.
- Add exported types for execution events in `src/types.ts`.
- Extend `RunOptions` with `collectEvents?: boolean`.
- Extend `RunResult` with `events: ExecutionEvent[]`.
- Record enter and exit events for every plan node when `collectEvents` is
  true.
- Event fields: `phase`, `id`, `kind`, `depth`, `path`, and optional
  `iteration`.
- Sequence and parallel child paths should use child index notation, e.g.
  `root/fanout[1]`.
- Branch paths should include `/then` or `/else`.
- Loop body paths should include `#<iteration>`.

Run `bun test` from `workspace/recflow-lab` before yielding. Do not edit files
outside this task directory.
