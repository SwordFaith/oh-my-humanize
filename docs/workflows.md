# Workflows

`omp` can run `.omhflow` workflow artifacts for mutable, auditable agentic
development flows. A workflow can be edited while it is in development, but a
production attempt runs against an immutable freeze. If the flow must change,
the operator stops the attempt, checkpoints it, applies an approved change,
freezes the new graph, and restarts from the checkpoint.

## Artifact Shape

A distributable workflow has two parts:

```text
my-flow.omhflow
my-flow/
  prompts/
  scripts/
  fixtures/
```

The `.omhflow` file contains YAML frontmatter plus a fenced workflow block. The
same-name directory contains prompts, scripts, templates, fixtures, and other
resources. Resource paths inside the flow resolve from that same-name directory.

## Built-In Flows

`omp` ships with built-in flows that can be addressed by name:

- `humanize-rlcr` — a Humanize-style review loop with implementation and review
  rounds.
- `kda-humanize-reference` — a KDA-style flow that imports a Humanize subflow.

List available flows:

```sh
omp workflow list
```

Built-in flows are packaged workflow artifacts, not infrastructure
dependencies. The workflow runtime, freeze checker, resolver, and CLI must also
work with any valid standalone `.omhflow + same-name directory` artifact supplied
by path or through `OMHFLOW_DIR`.

## Interactive Use

Use `/workflow` inside the TUI when a human operator should observe, steer,
interrupt, approve changes, or restart attempts.

```text
/workflow start humanize-rlcr --family-id my-feature --background
/workflow graph --family-id my-feature
/workflow manager --family-id my-feature
/workflow stop my-run:attempt-1 --deadline-ms 30000
/workflow restart my-run:attempt-1:checkpoint-1 --freeze-id flowfreeze:...
```

`/workflow start <flow-or-path>` accepts either a named built-in or installed
flow, a direct `.omhflow` path, a workflow YAML file, or a directory containing
`workflow.yml`.

## Non-Interactive Use

Use `omp workflow` for scripting, CI-style checks, or deterministic workflow
smoke runs without opening the TUI.

```sh
omp workflow freeze humanize-rlcr
omp workflow start ./my-flow.omhflow --run-id run-1 --max-activations 20
omp workflow start humanize-rlcr --json --max-activations 1
```

Headless workflow runs reuse the existing `omp` runtime boundary. Shell and JS
script nodes run directly. Agent and review nodes are delegated through the
normal `omp launch -p` path so model, provider, auth, tool, and settings
configuration stay in the existing oh-my-pi layer. Human nodes require the
interactive TUI path.

## Installing External Flows

External `.omhflow` artifacts are installed into the first directory from
`OMHFLOW_DIR`. If `OMHFLOW_DIR` is unset, `omp` uses `~/.omp/flows`.

```sh
omp workflow install ./my-flow.omhflow
omp workflow install ./my-flow.omhflow --force
omp workflow uninstall my-flow
```

`OMHFLOW_DIR` accepts a platform path list:

```sh
export OMHFLOW_DIR="$HOME/.omp/flows:$PWD/team-flows"
omp workflow list
omp workflow start team-release-hardening
```

For a named lookup, `omp` searches built-ins first, then each external flow
directory. External flow names must be unambiguous across `OMHFLOW_DIR` entries.
Each flow can be laid out either as `<dir>/<name>.omhflow` plus `<dir>/<name>/`,
or as `<dir>/<name>/<name>.omhflow` plus `<dir>/<name>/<name>/`.

## Authoring Notes

- Keep model and tool selections as portable defaults or capability
  declarations in the flow; actual resolution happens through `omp` settings and
  runtime configuration.
- Prefer small, reusable subflows over large monolithic graphs.
- Use review node outputs and edge conditions for loops such as
  `CONTINUE`/`COMPLETE` or `ISSUES`/`CLEAN`.
- Freeze a flow before treating it as production-safe:

```sh
omp workflow freeze ./my-flow.omhflow
```
