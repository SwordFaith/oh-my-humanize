const state = workflowContext.state;
const humanize = state.humanize && typeof state.humanize === "object" ? state.humanize : {};
const ledger = humanize.ledger && typeof humanize.ledger === "object" ? humanize.ledger : {};
const final = {
	status: "done",
	rounds: Number.isFinite(ledger.currentRound) ? ledger.currentRound : 0,
	openIssueCount: Array.isArray(ledger.openIssues) ? ledger.openIssues.length : 0,
	queuedIssueCount: Array.isArray(ledger.queuedIssues) ? ledger.queuedIssues.length : 0,
	stagnation: ledger.stagnation ?? {},
};

return {
	summary: "humanize RLCR finalized with durable ledger summary",
	statePatch: [{ op: "set", path: "/humanize/final", value: final }],
};
