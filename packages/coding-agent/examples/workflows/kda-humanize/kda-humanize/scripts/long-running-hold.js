const state = workflowContext.state && typeof workflowContext.state === "object" ? workflowContext.state : {};
const kda = state.kda && typeof state.kda === "object" ? state.kda : {};
const runtime = kda.runtime && typeof kda.runtime === "object" ? kda.runtime : {};
const longRunning = runtime.longRunning && typeof runtime.longRunning === "object" ? runtime.longRunning : {};
const requested = longRunning.requested === true;
const minimumSatisfied = longRunning.minimumSatisfied === true;

if (!requested || minimumSatisfied) {
	return {
		summary: requested
			? "KDA long-running hold skipped; minimum runtime already satisfied"
			: "KDA long-running hold skipped; task did not request long-running evidence",
	};
}

const delaySeconds = parseDelaySeconds(Bun.env.OMH_LONG_RUNNING_HOLD_SECONDS);
if (delaySeconds > 0) {
	await Bun.sleep(delaySeconds * 1000);
}

return {
	summary: "KDA long-running hold tick completed",
	data: { delaySeconds },
};

function parseDelaySeconds(value) {
	if (value === undefined || value.trim() === "") return 300;
	const parsed = Number(value);
	if (!Number.isFinite(parsed) || parsed < 0) return 300;
	return Math.floor(parsed);
}
