const state = workflowContext.state;
const humanize = state.humanize && typeof state.humanize === "object" ? state.humanize : {};
let taskText = "";

try {
	taskText = await Bun.file("task.md").text();
} catch {
	taskText = "";
}

const immutableGoal = taskText.trim().slice(0, 4000) || "Follow the operator-provided task brief and acceptance criteria.";
const ledger = {
	currentRound: 0,
	rounds: [],
	openIssues: [],
	queuedIssues: [],
	advisoryIssues: [],
	blockers: [],
	stagnation: {
		status: "none",
		sameFindingCount: 0,
	},
};

const goal = {
	immutableGoal,
	round: 0,
	acceptance: {
		source: taskText ? "task.md" : "operator prompt",
		status: "open",
	},
	ledger,
	precheck: humanize.precheck ?? {},
};

return {
	summary: "goal tracker initialized with durable RLCR ledger",
	statePatch: [
		{ op: "set", path: "/humanize/goal", value: goal },
		{ op: "set", path: "/humanize/ledger", value: ledger },
	],
};
