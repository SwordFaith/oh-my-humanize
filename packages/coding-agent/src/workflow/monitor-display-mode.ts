export type WorkflowMonitorDisplayMode = "full" | "compact" | "collapsed";

export function parseWorkflowMonitorDisplayMode(input: string): WorkflowMonitorDisplayMode | undefined {
	switch (input) {
		case "full":
		case "show":
			return "full";
		case "compact":
			return "compact";
		case "collapsed":
		case "collapse":
		case "hide":
			return "collapsed";
		default:
			return undefined;
	}
}

export function workflowMonitorDisplayModeLabel(mode: WorkflowMonitorDisplayMode): string {
	if (mode === "collapsed") return "collapsed";
	return mode;
}
