export const DEFAULT_WORKFLOW_MAX_RUNTIME_MS = 5 * 24 * 60 * 60 * 1000;

export function workflowMaxRuntimeStopReason(maxRuntimeMs: number): string {
	return `workflow max runtime elapsed after ${maxRuntimeMs}ms`;
}
