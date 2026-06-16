let taskText = "";
try {
	taskText = await Bun.file("task.md").text();
} catch {
	taskText = "";
}

const taskContract = taskText.trim();
if (!taskContract) {
	throw new Error("kda-humanize requires a task.md contract in the project root");
}

const recordedAtMs = Date.now();
const longRunningRequested = /\blong[-\s]?running\s*:\s*(?:yes|true)\b|\blong[-\s]?running\b|\b8[-\s]*hours?\b|\beight[-\s]+hours?\b|\bat\s+least\s+eight[-\s]+hours?\b|\b5[-\s]*days?\b|\bfive[-\s]+days?\b/iu.test(
	taskContract,
);
const minimumRuntimeMs = parseDurationMs(taskContract, "minimum runtime") ?? 8 * 60 * 60 * 1000;
const maximumRuntimeMs = parseDurationMs(taskContract, "maximum runtime") ?? 5 * 24 * 60 * 60 * 1000;

return {
	summary: "loaded KDA task contract from task.md",
	statePatch: [
		{ op: "set", path: "/taskContract", value: taskContract.slice(0, 8000) },
		{
			op: "set",
			path: "/kda/runtime",
			value: {
				startedAtMs: recordedAtMs,
				elapsedMs: 0,
				longRunning: {
					requested: longRunningRequested,
					minimumRuntimeMs,
					maximumRuntimeMs,
					minimumSatisfied: !longRunningRequested,
					remainingMinimumMs: longRunningRequested ? minimumRuntimeMs : 0,
				},
			},
		},
	],
};

function parseDurationMs(text, label) {
	const escaped = label.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
	const match = new RegExp(`${escaped}\\s*:\\s*(\\d+)\\s*(seconds?|minutes?|hours?|days?)`, "iu").exec(text);
	if (!match) return undefined;
	const amount = Number(match[1]);
	if (!Number.isFinite(amount)) return undefined;
	const unit = match[2].toLowerCase();
	if (unit.startsWith("second")) return amount * 1000;
	if (unit.startsWith("minute")) return amount * 60 * 1000;
	if (unit.startsWith("hour")) return amount * 60 * 60 * 1000;
	if (unit.startsWith("day")) return amount * 24 * 60 * 60 * 1000;
	return undefined;
}
