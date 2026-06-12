import { describe, expect, it } from "bun:test";
import type { Api, Model } from "@oh-my-pi/pi-ai";
import { buildModel } from "@oh-my-pi/pi-catalog/build";
import { parseWorkflowDefinition } from "../../src/workflow/definition";
import type { FlowFreeze } from "../../src/workflow/freeze";
import { buildWorkflowInspection, buildWorkflowLifecycleInspection } from "../../src/workflow/inspection";
import {
	approveWorkflowChangeRequest,
	proposeWorkflowChangeRequest,
	type RuntimeBindingSnapshot,
	reconstructWorkflowFamilies,
	recordWorkflowChangeRequestApplied,
	recordWorkflowFreeze,
	startWorkflowFamily,
	type WorkflowRunFamilySnapshot,
} from "../../src/workflow/lifecycle";
import type { WorkflowNodeRuntimeHost } from "../../src/workflow/node-runtime";
import { reconstructWorkflowRuns, type WorkflowRunStoreHost } from "../../src/workflow/run-store";
import { runWorkflow } from "../../src/workflow/runner";
import type { WorkflowActivation } from "../../src/workflow/scheduler";
import { createSessionWorkflowRuntimeHost } from "../../src/workflow/session-runtime";

const openAiModel: Model<Api> = buildModel({
	id: "gpt-4o",
	name: "GPT-4o",
	api: "openai-completions",
	provider: "openai",
	baseUrl: "https://openai.example.test",
	reasoning: false,
	input: ["text"],
	cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
	contextWindow: 128000,
	maxTokens: 8192,
});

const source = `
name: humanize-like-loop
version: 1
models:
  roles:
    builder: openai/gpt-4o
    reviewer: openai/gpt-4o
  defaults:
    agent: builder
    review: reviewer
nodes:
  planner:
    type: agent
    agent: task
    prompt: Plan the next build assignment.
  build:
    type: agent
    agent: task
    prompt:
      output:
        node: planner
        path: /data/nextPrompt
        activation: latest-completed
    writes:
      - /work
  review:
    type: review
    agent: reviewer
    model:
      role: reviewer
      unavailable: fail
    prompt: Review the build result.
    gates:
      - continue
      - finish
    writes:
      - /verdict
  finish:
    type: script
    prompt: return "workflow complete";
edges:
  - from: planner
    to: build
  - from: build
    to: review
  - from: review
    to: planner
    when: outputs.review.verdict == "continue"
  - from: review
    to: finish
    when: outputs.review.verdict == "finish"
`;

const agentRoutedLoopSource = `
name: agent-routed-loop
version: 1
models:
  roles:
    builder: openai/gpt-4o
nodes:
  router:
    type: agent
    agent: task
    model:
      role: builder
    prompt: Choose whether to fix another round or finish.
  fix:
    type: script
    prompt: return "fixed";
  finish:
    type: script
    prompt: return "done";
edges:
  - from: router
    to: fix
    when: outputs.router.route == "fix"
  - from: fix
    to: router
  - from: router
    to: finish
    when: outputs.router.route == "finish"
`;

const humanizeFallbackLoopSource = `
name: humanize-fallback-loop
version: 1
nodes:
  build:
    type: script
    prompt: return "built";
  review:
    type: review
    agent: reviewer
    prompt: Review the build result.
    gates:
      - CONTINUE
      - COMPLETE
    fallbackVerdict: CONTINUE
  finish:
    type: script
    prompt: return "done";
edges:
  - from: build
    to: review
  - from: review
    to: build
    when: outputs.review.verdict != "COMPLETE"
  - from: review
    to: finish
    when: outputs.review.verdict == "COMPLETE"
`;

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

describe("workflow end-to-end smoke", () => {
	it("runs a Humanize-like loop and exposes prompt provenance in inspection", async () => {
		const host = createHost();
		const definition = parseWorkflowDefinition(source, { sourcePath: "workflow.yml" });
		let planCount = 0;
		let buildCount = 0;
		let reviewCount = 0;
		const buildPrompts: string[] = [];
		const modelOverrides: Array<[string, string | undefined]> = [];
		const runtimeHost: WorkflowNodeRuntimeHost = {
			runAgentNode: async input => {
				modelOverrides.push([input.node.id, input.modelOverride]);
				if (input.node.id === "planner") {
					planCount++;
					return {
						summary: `planned ${planCount}`,
						data: { nextPrompt: `Build round ${planCount}` },
					};
				}
				buildCount++;
				buildPrompts.push(input.prompt ?? "");
				return {
					summary: `built ${buildCount}`,
					data: { round: buildCount },
					statePatch: [{ op: "set", path: "/work/round", value: buildCount }],
				};
			},
			runReviewNode: async input => {
				modelOverrides.push([input.node.id, input.modelOverride]);
				reviewCount++;
				const verdict = reviewCount === 1 ? "continue" : "finish";
				return {
					summary: `review ${verdict}`,
					verdict,
				};
			},
			runScriptNode: async () => ({
				summary: "workflow complete",
				data: { exitCode: 0 },
			}),
		};

		const result = await runWorkflow({
			host,
			definition,
			runId: "run-e2e",
			startNodeId: "planner",
			runtimeHost,
			modelResolution: { availableModels: [openAiModel] },
			maxActivations: 10,
			maxNodeActivations: 4,
		});

		expect(result.scheduler.activations.map(activation => [activation.nodeId, activation.status])).toEqual([
			["planner", "completed"],
			["build", "completed"],
			["review", "completed"],
			["planner", "completed"],
			["build", "completed"],
			["review", "completed"],
			["finish", "completed"],
		]);
		expect(buildPrompts).toEqual(["Build round 1", "Build round 2"]);
		expect(modelOverrides).toEqual([
			["planner", "openai/gpt-4o"],
			["build", "openai/gpt-4o"],
			["review", "openai/gpt-4o"],
			["planner", "openai/gpt-4o"],
			["build", "openai/gpt-4o"],
			["review", "openai/gpt-4o"],
		]);

		const reconstructed = reconstructWorkflowRuns(host.getBranch());
		const run = reconstructed[0];
		if (!run) throw new Error("expected reconstructed run");
		const inspection = buildWorkflowInspection(run);

		expect(run.state).toEqual({ work: { round: 2 }, verdict: "finish" });
		expect(inspection.graphRevisions).toEqual([{ id: "run-e2e:graph-0", nodeCount: 4, edgeCount: 4 }]);
		expect(inspection.modelAssignments.map(assignment => [assignment.nodeId, assignment.resolvedModel])).toEqual([
			["planner", "openai/gpt-4o"],
			["build", "openai/gpt-4o"],
			["review", "openai/gpt-4o"],
			["planner", "openai/gpt-4o"],
			["build", "openai/gpt-4o"],
			["review", "openai/gpt-4o"],
		]);
		expect(
			inspection.activations
				.filter(activation => activation.nodeId === "build")
				.map(activation => activation.prompt),
		).toEqual([
			{
				value: "Build round 1",
				byteLength: 13,
				contentHash: "sha256:88d770bb27b60717a4377c68b9c9dacb19260b9e3d4bb4d3ec6912c0dfaeff9c",
				source: {
					kind: "output",
					node: "planner",
					path: "/data/nextPrompt",
					activation: "latest-completed",
					activationId: "activation-1",
				},
			},
			{
				value: "Build round 2",
				byteLength: 13,
				contentHash: "sha256:0cebaf4ba498d8318e0b7b48168f5cb7991e1ff301f5900fe28d59b994bdc73b",
				source: {
					kind: "output",
					node: "planner",
					path: "/data/nextPrompt",
					activation: "latest-completed",
					activationId: "activation-4",
				},
			},
		]);
	});

	it("lets an agent node route the next workflow edge from structured output data", async () => {
		const host = createHost();
		const definition = parseWorkflowDefinition(agentRoutedLoopSource, { sourcePath: "workflow.yml" });
		let routerCount = 0;
		const runtimeHost: WorkflowNodeRuntimeHost = {
			runAgentNode: async () => {
				routerCount++;
				const route = routerCount === 1 ? "fix" : "finish";
				return {
					summary: `router selected ${route}`,
					data: { route },
				};
			},
			runScriptNode: async input => ({
				summary: `${input.node.id} completed`,
			}),
		};

		const result = await runWorkflow({
			host,
			definition,
			runId: "agent-route",
			startNodeId: "router",
			runtimeHost,
			modelResolution: { availableModels: [openAiModel] },
			maxActivations: 6,
			maxNodeActivations: 3,
		});

		expect(result.scheduler.activations.map(activation => [activation.nodeId, activation.status])).toEqual([
			["router", "completed"],
			["fix", "completed"],
			["router", "completed"],
			["finish", "completed"],
		]);
		expect(result.scheduler.state).toEqual({});
		const reconstructed = reconstructWorkflowRuns(host.getBranch());
		expect(reconstructed[0]?.activations.at(0)?.output?.data).toEqual({ route: "fix" });
		expect(reconstructed[0]?.activations.at(2)?.output?.data).toEqual({ route: "finish" });
	});

	it("routes a Humanize-style fallback review loop until final-line COMPLETE exits", async () => {
		const host = createHost();
		const definition = parseWorkflowDefinition(humanizeFallbackLoopSource, { sourcePath: "workflow.yml" });
		let reviewCount = 0;
		const runtimeHost = createSessionWorkflowRuntimeHost({
			cwd: process.cwd(),
			runEvalScript: async input => ({
				exitCode: 0,
				output: JSON.stringify({ summary: `${input.nodeId} completed` }),
			}),
			runAgentTask: async () => {
				reviewCount++;
				return {
					exitCode: 0,
					output:
						reviewCount === 1
							? "Review findings:\n- AC-2 still needs implementation."
							: "Review findings:\n- all acceptance criteria are satisfied\n\nCOMPLETE",
				};
			},
		});

		const result = await runWorkflow({
			host,
			definition,
			runId: "humanize-fallback",
			startNodeId: "build",
			runtimeHost,
			maxActivations: 8,
			maxNodeActivations: 4,
		});

		expect(result.scheduler.activations.map(activation => [activation.nodeId, activation.status])).toEqual([
			["build", "completed"],
			["review", "completed"],
			["build", "completed"],
			["review", "completed"],
			["finish", "completed"],
		]);
		const reconstructed = reconstructWorkflowRuns(host.getBranch());
		expect(reconstructed[0]?.activations.at(1)?.output?.data).toEqual({ verdict: "CONTINUE" });
		expect(reconstructed[0]?.activations.at(3)?.output?.data).toEqual({ verdict: "COMPLETE" });
	});

	it("records immutable lifecycle events for a frozen workflow attempt", async () => {
		const host = createHost();
		const definition = parseWorkflowDefinition(
			`
name: frozen-run-demo
version: 1
nodes:
  build:
    type: script
  review:
    type: script
edges:
  - from: build
    to: review
`,
			{ sourcePath: "workflow.yml" },
		);
		const freeze = createFreeze(
			"flowfreeze:e2e",
			definition.nodes.map(node => node.id),
		);
		const binding: RuntimeBindingSnapshot = {
			id: "binding-e2e",
			requestedRoles: { build: "script" },
			resolvedModels: {},
			tools: ["eval"],
			agents: [],
			unavailable: [],
			warnings: [],
		};
		const runtimeHost: WorkflowNodeRuntimeHost = {
			runScriptNode: async input => ({ summary: `ran ${input.node.id}` }),
		};

		await runWorkflow({
			host,
			definition,
			runId: "run-e2e-frozen",
			startNodeId: "build",
			runtimeHost,
			lifecycle: {
				familyId: "family-e2e",
				attemptId: "attempt-e2e-1",
				objective: "exercise lifecycle events",
				freeze,
				runtimeBindingSnapshot: binding,
			},
		});

		const runs = reconstructWorkflowRuns(host.getBranch());
		const families = reconstructWorkflowFamilies(host.getBranch());

		expect(runs[0]?.activations.map(activation => [activation.nodeId, activation.status])).toEqual([
			["build", "completed"],
			["review", "completed"],
		]);
		expect(families).toHaveLength(1);
		expect(families[0]?.id).toBe("family-e2e");
		expect(families[0]?.freezes.map(recordedFreeze => recordedFreeze.id)).toEqual(["flowfreeze:e2e"]);
		expect(families[0]?.attempts.map(attempt => [attempt.id, attempt.freezeId, attempt.status])).toEqual([
			["attempt-e2e-1", "flowfreeze:e2e", "completed"],
		]);
		expect(families[0]?.attempts[0]?.runtimeBindingSnapshot).toEqual(binding);
		expect(families[0]?.attempts[0]?.activations.map(activation => [activation.nodeId, activation.status])).toEqual([
			["build", "completed"],
			["review", "completed"],
		]);
	});

	it("runs a complete Phase 1 freeze-change-checkpoint-refreeze-restart lifecycle", async () => {
		const host = createHost();
		const freezeA = createFreeze("flowfreeze:phase1-a", ["build", "weakReview"]);
		const freezeB = createFreeze("flowfreeze:phase1-b", ["strongReview"]);
		const bindingA = binding("binding-phase1-a");
		const bindingB = binding("binding-phase1-b");
		const runtimeHost: WorkflowNodeRuntimeHost = {
			runScriptNode: async input => {
				if (input.node.id === "build") {
					return {
						summary: `ran ${input.node.id}`,
						statePatch: [{ op: "set", path: "/build/status", value: "built" }],
					};
				}
				return { summary: `ran ${input.node.id}` };
			},
		};

		startWorkflowFamily(host, { familyId: "family-phase1", objective: "complete phase 1 lifecycle" });
		recordWorkflowFreeze(host, freezeA, { familyId: "family-phase1" });
		const request = proposeWorkflowChangeRequest(host, {
			changeRequestId: "change-phase1",
			familyId: "family-phase1",
			attemptId: "attempt-phase1-1",
			actor: "agent:reviewer",
			origin: "internal-agent",
			reason: "upgrade weak review to strong review",
			operations: [
				{ op: "add_node", node: { id: "strongReview", type: "script" } },
				{ op: "remove_node", nodeId: "weakReview" },
			],
			frontierMapping: { weakReview: "strongReview" },
		});
		approveWorkflowChangeRequest(host, { changeRequestId: request.id, actor: "human:sihao" });

		await runWorkflow({
			host,
			definition: freezeA.definition,
			runId: "run-phase1-a",
			startNodeId: "build",
			runtimeHost,
			maxActivations: 1,
			lifecycle: {
				familyId: "family-phase1",
				attemptId: "attempt-phase1-1",
				freeze: freezeA,
				runtimeBindingSnapshot: bindingA,
				recordFamily: false,
				recordFreeze: false,
			},
		});

		let family = reconstructWorkflowFamilies(host.getBranch())[0];
		const checkpoint = family?.checkpoints[0];
		if (!family || !checkpoint) throw new Error("expected checkpoint after first phase attempt");
		recordWorkflowFreeze(host, freezeB, { familyId: family.id });
		recordWorkflowChangeRequestApplied(host, {
			changeRequestId: request.id,
			actor: "human:sihao",
			target: "freeze",
			freezeId: freezeB.id,
			reason: "strict refreeze passed",
		});

		await runWorkflow({
			host,
			definition: freezeB.definition,
			runId: "run-phase1-b",
			startNodeId: "strongReview",
			runtimeHost,
			initialState: checkpoint.state,
			completedActivations: completedActivationsForCheckpoint(family, checkpoint.completedActivationIds),
			startParentActivationIds: checkpoint.completedActivationIds,
			lifecycle: {
				familyId: family.id,
				attemptId: "attempt-phase1-2",
				checkpointId: checkpoint.id,
				freeze: freezeB,
				runtimeBindingSnapshot: bindingB,
				recordFamily: false,
				recordFreeze: false,
			},
		});

		family = reconstructWorkflowFamilies(host.getBranch())[0];
		if (!family) throw new Error("expected reconstructed family");
		const inspection = buildWorkflowLifecycleInspection(family);

		expect(reconstructWorkflowFamilies(host.getBranch())).toHaveLength(1);
		expect(inspection.freezeIds).toEqual(["flowfreeze:phase1-a", "flowfreeze:phase1-b"]);
		expect(inspection.attempts.map(attempt => [attempt.id, attempt.freezeId, attempt.status])).toEqual([
			["attempt-phase1-1", "flowfreeze:phase1-a", "stopped"],
			["attempt-phase1-2", "flowfreeze:phase1-b", "completed"],
		]);
		expect(inspection.checkpoints).toMatchObject([
			{
				id: "attempt-phase1-1:checkpoint-1",
				attemptId: "attempt-phase1-1",
				completedActivationCount: 1,
				frontierNodeIds: ["weakReview"],
				sourceMapping: { weakReview: "strongReview" },
			},
		]);
		expect(inspection.changeRequests).toMatchObject([
			{
				id: "change-phase1",
				status: "approved",
				approvedBy: "human:sihao",
				frontierMapping: { weakReview: "strongReview" },
				applications: [{ target: "freeze", freezeId: "flowfreeze:phase1-b" }],
			},
		]);
		expect(inspection.attempts.map(attempt => attempt.runtimeBindingSnapshot.id)).toEqual([
			"binding-phase1-a",
			"binding-phase1-b",
		]);
		expect(family.attempts.flatMap(attempt => attempt.activations.map(activation => activation.nodeId))).toEqual([
			"build",
			"strongReview",
		]);
	});
});

function completedActivationsForCheckpoint(
	family: WorkflowRunFamilySnapshot,
	completedActivationIds: string[],
): WorkflowActivation[] {
	const completedIds = new Set(completedActivationIds);
	const activations: WorkflowActivation[] = [];
	for (const attempt of family.attempts) {
		for (const activation of attempt.activations) {
			if (!completedIds.has(activation.id) || activation.status !== "completed") continue;
			const completed: WorkflowActivation = {
				id: activation.id,
				nodeId: activation.nodeId,
				graphRevisionId: `${attempt.id}:checkpoint`,
				status: "completed",
				parentActivationIds: activation.parentActivationIds,
			};
			if (activation.output !== undefined) completed.output = activation.output;
			activations.push(completed);
		}
	}
	return activations;
}

function binding(id: string): RuntimeBindingSnapshot {
	return {
		id,
		requestedRoles: {},
		resolvedModels: {},
		tools: ["eval"],
		agents: [],
		unavailable: [],
		warnings: [],
	};
}

function createFreeze(id: string, nodeIds: string[]): FlowFreeze {
	return {
		id,
		schemaVersion: "omhflow/v1",
		flowPath: `${id}.omhflow`,
		resourceDir: id,
		mainContentHash: "sha256:main",
		resourceHashes: [],
		resourceSnapshots: [],
		canonicalGraphHash: "sha256:graph",
		sourceMapping: {
			workflowBlocks: [{ id: "workflow:0", language: "yaml" }],
			nodes: Object.fromEntries(nodeIds.map(nodeId => [nodeId, { sourceBlock: "workflow:0" }])),
		},
		staticCheckReport: {
			status: "passed",
			checks: [{ name: "parse", status: "passed" }],
		},
		portableDefaults: { models: { roles: {}, defaults: {} } },
		definition: {
			name: "frozen-run-demo",
			version: 1,
			models: { roles: {}, defaults: {} },
			nodes: nodeIds.map(nodeId => ({ id: nodeId, type: "script" })),
			edges: nodeIds.length > 1 ? [{ from: nodeIds[0]!, to: nodeIds[1]! }] : [],
		},
	};
}
