import { describe, expect, it } from "bun:test";
import * as path from "node:path";
import { freezeWorkflowArtifact } from "../../src/workflow/freeze";
import type { WorkflowNodeRuntimeHost } from "../../src/workflow/node-runtime";
import { loadWorkflowArtifact } from "../../src/workflow/package-loader";
import { reconstructWorkflowRuns, type WorkflowRunStoreHost } from "../../src/workflow/run-store";
import { runWorkflow } from "../../src/workflow/runner";
import type { WorkflowActivation } from "../../src/workflow/scheduler";
import type { WorkflowStatePatchOperation } from "../../src/workflow/state";

interface CapturedEntry {
	type: "custom";
	customType: string;
	data?: unknown;
}

function createHost(): WorkflowRunStoreHost & { entries: CapturedEntry[] } {
	const entries: CapturedEntry[] = [];
	return {
		entries,
		appendCustomEntry: (customType, data) => {
			entries.push({ type: "custom", customType, data });
			return `entry-${entries.length}`;
		},
		getBranch: () => entries,
	};
}

describe("mapped worker-verifier pool flow contract", () => {
	it("runs the example through worker, verifier, reducer, and expands the queue", async () => {
		const exampleDir = path.resolve(
			import.meta.dir,
			"../../examples/workflow/experimental/mapped-worker-verifier-pool",
		);
		const host = createHost();
		const startedActivations: WorkflowActivation[] = [];

		const runtimeHost: WorkflowNodeRuntimeHost = {
			runScriptNode: async input => {
				if (input.node.id === "pool.reducer") {
					const ctx = input.context;
					if (!ctx) return { summary: "reduced (no context)" };
					const state = ctx.state as Record<string, unknown>;
					const mapped = ctx.activation?.mapped;
					const itemKey = mapped?.itemKey;
					const pool = state.pool as Record<string, unknown> | undefined;
					const results = pool?.results as Record<string, { expand?: boolean; verdict?: string }> | undefined;
					const result = itemKey ? results?.[itemKey] : undefined;
					const patch: WorkflowStatePatchOperation[] = [];
					if (result?.expand === true || result?.verdict === "expand") {
						const queue = Array.isArray(pool?.queue) ? [...(pool.queue as Array<{ id: string }>)] : [];
						if (!queue.some(item => item.id === "task-3")) {
							queue.push({ id: "task-3" });
						}
						patch.push({ op: "set", path: "/pool/queue", value: queue });
					}
					const knownTasks = (state.plan as Record<string, string[]>)?.tasks ?? [];
					const allCompleted = knownTasks.every(task => results?.[task]?.verdict !== undefined);
					if (allCompleted && pool?.done === false) {
						patch.push({ op: "set", path: "/pool/done", value: true });
					}
					return { summary: `reduced ${itemKey ?? "seed"}`, statePatch: patch };
				}
				if (input.node.id === "plan") {
					return {
						summary: "seeded",
						statePatch: [
							{ op: "set", path: "/plan", value: { tasks: ["task-1", "task-2"] } },
							{ op: "set", path: "/pool/queue", value: [{ id: "task-1" }, { id: "task-2" }] },
							{ op: "set", path: "/pool/done", value: false },
							{ op: "set", path: "/pool/results", value: {} },
						],
					};
				}
				return { summary: "script ran" };
			},
			runAgentNode: async input => {
				startedActivations.push(input.activation);
				const mapped = input.activation.mapped;
				if (input.node.id === "pool.worker" && mapped) {
					return {
						summary: `processed ${mapped.itemKey}`,
						statePatch: [
							{
								op: "set",
								path: `/pool/results/${mapped.itemKey}`,
								value: { summary: `result-${mapped.itemKey}`, expand: mapped.itemKey === "task-1" },
							},
						],
					};
				}
				return { summary: "agent ran" };
			},
			runHumanNode: async () => ({ summary: "human ran" }),
			runReviewNode: async input => {
				startedActivations.push(input.activation);
				const mapped = input.activation.mapped;
				if (input.node.id === "pool.verifier" && mapped) {
					return {
						verdict: mapped.itemKey === "task-1" ? "expand" : "accept",
						summary: `verified ${mapped.itemKey}`,
						statePatch: [
							{
								op: "set",
								path: `/pool/results/${mapped.itemKey}/verdict`,
								value: mapped.itemKey === "task-1" ? "expand" : "accept",
							},
						],
					};
				}
				return { verdict: "accept", summary: "reviewed" };
			},
		};
		const artifact = await loadWorkflowArtifact(path.join(exampleDir, "mapped-worker-verifier-pool.omhflow"));
		const freeze = await freezeWorkflowArtifact(artifact);

		await runWorkflow({
			host,
			packageRoot: exampleDir,
			definition: freeze.definition,
			frozenResources: freeze.resourceSnapshots,
			runId: "mapped-pool-run-1",
			startNodeId: "plan",
			runtimeHost,
		});

		const runs = reconstructWorkflowRuns(host.getBranch());
		const run = runs[0];
		if (!run) throw new Error("expected a run");

		const reducerActivations = run.activations.filter(a => a.nodeId === "pool.reducer" && a.status === "completed");
		expect(reducerActivations).toHaveLength(3);

		const workerItems = run.activations
			.filter(a => a.nodeId === "pool.worker" && a.status === "completed")
			.map(a => a.mapped?.itemKey)
			.sort();
		expect(workerItems).toEqual(["task-1", "task-2", "task-3"]);

		const verifierItems = run.activations
			.filter(a => a.nodeId === "pool.verifier" && a.status === "completed")
			.map(a => a.mapped?.itemKey)
			.sort();
		expect(verifierItems).toEqual(["task-1", "task-2", "task-3"]);

		expect((run.state as Record<string, Record<string, unknown>>).pool?.done).toBe(true);
	});
});
