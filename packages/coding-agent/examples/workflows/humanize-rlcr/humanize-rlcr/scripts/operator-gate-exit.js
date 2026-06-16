const state = workflowContext.state;
const humanize = state.humanize && typeof state.humanize === "object" ? state.humanize : {};
const operatorGate = humanize.operatorGate && typeof humanize.operatorGate === "object" ? humanize.operatorGate : {};
const decision = typeof operatorGate.decision === "string" ? operatorGate.decision : "unknown";
const status =
	decision === "hold" ? "held-by-operator" : decision === "stop" ? "stopped-by-operator" : "blocked-by-operator-gate";
const operatorExit = {
	status,
	decision,
	response: typeof operatorGate.response === "string" ? operatorGate.response : "",
	recordedAtMs: Number.isFinite(operatorGate.recordedAtMs) ? operatorGate.recordedAtMs : Date.now(),
	exitedAtMs: Date.now(),
};

return {
	summary: `operator gate exited before implementation: ${status}`,
	statePatch: [{ op: "set", path: "/humanize/operatorExit", value: operatorExit }],
};
