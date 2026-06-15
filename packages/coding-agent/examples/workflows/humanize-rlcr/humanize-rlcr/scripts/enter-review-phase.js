const state = workflowContext.state;
const humanize = state.humanize && typeof state.humanize === "object" ? state.humanize : {};
const ledger = humanize.ledger && typeof humanize.ledger === "object" ? humanize.ledger : {};
const reviewPhase = {
	baseBranch: "main",
	status: "active",
	enteredAfterRound: Number.isFinite(ledger.currentRound) ? ledger.currentRound : 0,
	openIssueCount: Array.isArray(ledger.openIssues) ? ledger.openIssues.length : 0,
	queuedIssueCount: Array.isArray(ledger.queuedIssues) ? ledger.queuedIssues.length : 0,
};

return {
	summary: "entered code review phase with ledger snapshot",
	statePatch: [{ op: "set", path: "/humanize/reviewPhase", value: reviewPhase }],
};
