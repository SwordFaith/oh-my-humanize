# Examples

Example code for omp-coding-agent SDK, hooks, and custom tools.

## Directories

### [sdk/](sdk/)
Programmatic usage via `createAgentSession()`. Shows how to customize models, prompts, tools, hooks, and session management.

### [hooks/](hooks/)
Example hooks for intercepting tool calls, adding safety gates, and integrating with external systems.

### [custom-tools/](custom-tools/)
Example custom tools that extend the agent's capabilities.

### [workflow-demos/](workflow-demos/)
Workflow-language demos and fixtures. These artifacts may be executable, but
they are not packaged practical workflows and should be used by explicit path.

### workflows/
Reserved for built-in practical workflow artifacts; the directory is
intentionally absent while no workflow has earned that tier. A workflow may be
added here only after it is generic, useful on real projects, and backed by
stable eight-hour-plus Project x Flow x Task validation evidence across more
than one real context. A single audited long-running run is candidate evidence,
not a built-in promotion. Unverified practical flows belong in an external
candidate directory such as `OMHFLOW_DIR`; seed-bound or teaching artifacts
belong in `workflow-demos/`.

## Documentation

- [SDK Reference](sdk/README.md)
- [Hooks Documentation](../docs/hooks.md)
- [Custom Tools Documentation](../docs/custom-tools.md)
- [Skills Documentation](../docs/skills.md)
