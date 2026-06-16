Define the KDA task contract for this project run.

Return a concise, structured contract that another agent can execute without
guessing project policy. Include:

- objective and non-goals;
- target project area and files or modules to inspect first;
- candidate strategy: what alternatives should be explored or compared;
- validation command, benchmark command, or manual evidence required;
- promotion criteria and rollback criteria;
- constraints on runtime, dependencies, data, branch/base, and allowed edits;
- whether this run is exploratory, implementation-focused, or long-running
  validation.

If any required field is unknown, ask for it explicitly instead of inventing a
project-specific default.
