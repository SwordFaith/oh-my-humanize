const state = workflowContext.state && typeof workflowContext.state === "object" ? workflowContext.state : {};
const kda = state.kda && typeof state.kda === "object" ? state.kda : {};
const runtimeState = kda.runtime && typeof kda.runtime === "object" ? kda.runtime : {};
const longRunningState =
	runtimeState.longRunning && typeof runtimeState.longRunning === "object" ? runtimeState.longRunning : {};

const requested = longRunningState.requested === true;
const startedAtMs = finiteNumber(runtimeState.startedAtMs) ?? Date.now();
const minimumRuntimeMs = finiteNumber(longRunningState.minimumRuntimeMs) ?? 8 * 60 * 60 * 1000;
const maximumRuntimeMs = finiteNumber(longRunningState.maximumRuntimeMs) ?? 5 * 24 * 60 * 60 * 1000;
const elapsedMs = Math.max(0, Date.now() - startedAtMs);
const minimumSatisfied = !requested || elapsedMs >= minimumRuntimeMs;
const remainingMinimumMs = Math.max(0, minimumRuntimeMs - elapsedMs);
const runtime = {
	startedAtMs,
	elapsedMs,
	longRunning: {
		requested,
		minimumRuntimeMs,
		maximumRuntimeMs,
		minimumSatisfied,
		remainingMinimumMs,
	},
};
const hold = {
	status: minimumSatisfied ? "satisfied" : "pending",
	elapsedMs,
	remainingMinimumMs,
	checkedAtMs: Date.now(),
};
const summary = minimumSatisfied
	? `KDA long-running floor satisfied; elapsed ${formatDuration(elapsedMs)}`
	: `KDA long-running floor pending; elapsed ${formatDuration(elapsedMs)}, remaining ${formatDuration(
			remainingMinimumMs,
		)}`;

return {
	summary,
	data: { runtime, hold },
	statePatch: [
		{ op: "set", path: "/kda/runtime", value: runtime },
		{ op: "set", path: "/kda/longRunningHold", value: hold },
	],
};

function finiteNumber(value) {
	return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function formatDuration(durationMs) {
	const totalSeconds = Math.max(0, Math.round(durationMs / 1000));
	const seconds = totalSeconds % 60;
	const totalMinutes = Math.floor(totalSeconds / 60);
	const minutes = totalMinutes % 60;
	const hours = Math.floor(totalMinutes / 60);
	if (hours > 0) return `${hours}h${String(minutes).padStart(2, "0")}m`;
	if (minutes > 0) return `${minutes}m${String(seconds).padStart(2, "0")}s`;
	return `${seconds}s`;
}
