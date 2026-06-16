Inspect the current project workspace for this KDA task contract.

Task contract:

{{taskContract}}

Produce a compact workspace report with:

- project type, build/test system, and relevant entry points;
- files or modules that are likely in scope;
- existing validation, benchmark, or quality commands that match the contract;
- candidate axes worth trying, with expected tradeoffs;
- coupling risks, safety risks, and files that should not be touched;
- evidence artifacts that should be captured for promotion.

Do not make project changes in this node. Do not assume GPU, network, or
language-specific tooling unless the workspace or contract proves it.
