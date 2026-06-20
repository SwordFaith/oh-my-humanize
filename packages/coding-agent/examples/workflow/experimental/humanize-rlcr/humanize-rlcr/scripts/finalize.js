const archiveFile = "workflow-output/final-humanize-rlcr-archive.md";
const inventoryFile = "workflow-output/final-humanize-rlcr-inventory.json";

const state = workflowContext.state && typeof workflowContext.state === "object" ? workflowContext.state : {};
const humanize = state.humanize && typeof state.humanize === "object" ? state.humanize : {};
const ledger = humanize.ledger && typeof humanize.ledger === "object" ? humanize.ledger : {};
const operatorGate = humanize.operatorGate && typeof humanize.operatorGate === "object" ? humanize.operatorGate : {};
const startedAtMs = Number.isFinite(operatorGate.recordedAtMs) ? operatorGate.recordedAtMs : Date.now();
const elapsedMs = Math.max(0, Date.now() - startedAtMs);
const patchInventory = await currentPatchInventory();
await writeFinalReviewEvidence();
const evidenceFiles = await workflowEvidenceFiles();
const missingEvidence = requiredEvidenceGaps(evidenceFiles);
if (missingEvidence.length > 0) {
	throw new Error(`humanize RLCR finalize missing durable evidence: ${missingEvidence.join(", ")}`);
}
const final = {
	status: "done",
	rounds: Number.isFinite(ledger.currentRound) ? ledger.currentRound : 0,
	openIssueCount: Array.isArray(ledger.openIssues) ? ledger.openIssues.length : 0,
	queuedIssueCount: Array.isArray(ledger.queuedIssues) ? ledger.queuedIssues.length : 0,
	stagnation: ledger.stagnation ?? {},
	elapsedMs,
	archiveFile,
	inventoryFile,
	patchInventory,
	evidenceFiles,
};
const runtime = {
	startedAtMs,
	elapsedMs,
};
const inventory = {
	flow: "humanize-rlcr",
	status: final.status,
	rounds: final.rounds,
	openIssueCount: final.openIssueCount,
	queuedIssueCount: final.queuedIssueCount,
	elapsedMs,
	patchInventory,
	evidenceFiles,
	recordedAtMs: Date.now(),
};

await Bun.write(inventoryFile, JSON.stringify(inventory, null, 2));
await Bun.write(archiveFile, finalArchiveMarkdown(final, inventory));

return {
	summary: "humanize RLCR finalized with durable archive and patch inventory",
	statePatch: [
		{ op: "set", path: "/humanize/final", value: final },
		{ op: "set", path: "/humanize/runtime", value: runtime },
	],
};

async function currentPatchInventory() {
	const status = await runGit(["status", "--short", "--untracked-files=all"]);
	const stagedProjectFiles = [];
	const unstagedProjectFiles = [];
	const untrackedProjectFiles = [];
	for (const line of status.split(/\r?\n/u)) {
		if (!line.trim()) continue;
		const file = changedPathFromStatus(line);
		if (!file || ignoredWorkflowPath(file)) continue;
		const indexStatus = line[0] ?? " ";
		const worktreeStatus = line[1] ?? " ";
		if (indexStatus === "?" && worktreeStatus === "?") {
			untrackedProjectFiles.push(file);
			continue;
		}
		if (indexStatus !== " " && indexStatus !== "?") stagedProjectFiles.push(file);
		if (worktreeStatus !== " " && worktreeStatus !== "?") unstagedProjectFiles.push(file);
	}
	return {
		stagedProjectFiles: uniqueSorted(stagedProjectFiles),
		unstagedProjectFiles: uniqueSorted(unstagedProjectFiles),
		untrackedProjectFiles: uniqueSorted(untrackedProjectFiles),
	};
}

async function workflowEvidenceFiles() {
	const files = [];
	try {
		const glob = new Bun.Glob("workflow-output/**/*");
		for await (const file of glob.scan({ cwd: process.cwd(), onlyFiles: true })) {
			if (file === archiveFile || file === inventoryFile) continue;
			files.push(file);
		}
	} catch {
		return [];
	}
	return uniqueSorted(files);
}

async function writeFinalReviewEvidence() {
	await writeRequiredActivationOutput("codexCodeReview", "workflow-output/final-codex-code-review.json");
	await writeRequiredActivationOutput("finalAlignmentCheck", "workflow-output/final-alignment-check.json");
}

async function writeRequiredActivationOutput(nodeId, filePath) {
	const output = latestActivationOutput(nodeId);
	if (!output) {
		throw new Error(`humanize RLCR finalize requires completed ${nodeId} output before archive`);
	}
	await Bun.write(
		filePath,
		`${JSON.stringify(
			{
				flow: "humanize-rlcr",
				node: nodeId,
				output,
				recordedAtMs: Date.now(),
			},
			null,
			2,
		)}\n`,
	);
}

function latestActivationOutput(nodeId) {
	const activations = Array.isArray(workflowContext.completedActivations) ? workflowContext.completedActivations : [];
	for (let index = activations.length - 1; index >= 0; index -= 1) {
		const activation = activations[index];
		if (activation?.nodeId === nodeId) return activation.output ?? {};
	}
	return null;
}

function requiredEvidenceGaps(files) {
	const required = [
		{ label: "round summary", pattern: /^workflow-output\/round-\d+-summary\.json$/u },
		{ label: "diff discipline guard", pattern: /^workflow-output\/round-\d+-diff-discipline-guard\.json$/u },
		{ label: "summary review", pattern: /^workflow-output\/round-\d+-codex-summary-review\.json$/u },
		{ label: "code review", pattern: /^workflow-output\/final-codex-code-review\.json$/u },
		{ label: "final alignment", pattern: /^workflow-output\/final-alignment-check\.json$/u },
	];
	const missing = [];
	for (const item of required) {
		if (!files.some(file => item.pattern.test(file))) missing.push(item.label);
	}
	return missing;
}

async function runGit(args) {
	const child = Bun.spawn(["git", ...args], {
		stdout: "pipe",
		stderr: "pipe",
	});
	const stdoutPromise = new Response(child.stdout).text();
	const stderrPromise = new Response(child.stderr).text();
	const exitCode = await child.exited;
	const stdout = await stdoutPromise;
	const stderr = await stderrPromise;
	if (exitCode !== 0) {
		throw new Error(`humanize RLCR finalize could not inspect git state: ${stderr || stdout}`.slice(0, 1200));
	}
	return stdout;
}

function changedPathFromStatus(line) {
	const path = line.slice(3).trim();
	const renameArrow = " -> ";
	return path.includes(renameArrow) ? path.split(renameArrow).at(-1)?.trim() ?? path : path;
}

function ignoredWorkflowPath(file) {
	return (
		file === "task.md" ||
		file === "manifest-entry.json" ||
		file === "monitor-assignment.json" ||
		file === "evidence-ledger.jsonl" ||
		file === "progress.md" ||
		file.startsWith("workflow-output/") ||
		file.startsWith("transcripts/") ||
		file.includes("/.pytest_cache/") ||
		file.includes("/node_modules/") ||
		file.includes("/.venv/")
	);
}

function finalArchiveMarkdown(finalState, inventory) {
	return [
		"# Humanize RLCR Final Archive",
		"",
		"## Summary",
		"",
		`- Status: ${finalState.status}`,
		`- Rounds: ${finalState.rounds}`,
		`- Open issues: ${finalState.openIssueCount}`,
		`- Queued issues: ${finalState.queuedIssueCount}`,
		`- Elapsed ms: ${finalState.elapsedMs}`,
		"",
		"## Patch Inventory",
		"",
		"### Staged Project Files",
		"",
		listMarkdown(inventory.patchInventory.stagedProjectFiles),
		"",
		"### Unstaged Project Files",
		"",
		listMarkdown(inventory.patchInventory.unstagedProjectFiles),
		"",
		"### Untracked Project Files",
		"",
		listMarkdown(inventory.patchInventory.untrackedProjectFiles),
		"",
		"## Evidence Files",
		"",
		listMarkdown(inventory.evidenceFiles),
		"",
		"## Stagnation",
		"",
		JSON.stringify(finalState.stagnation, null, 2),
		"",
	].join("\n");
}

function listMarkdown(files) {
	return files.length > 0 ? files.map(file => `- ${file}`).join("\n") : "None.";
}

function uniqueSorted(files) {
	return [...new Set(files)].sort((left, right) => left.localeCompare(right, "en"));
}
