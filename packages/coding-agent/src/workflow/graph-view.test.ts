import { describe, expect, it } from "bun:test";
import type { WorkflowDefinition } from "./definition";
import type { FlowFreeze } from "./freeze";
import { buildWorkflowGraphView, renderWorkflowGraphDiagram, type WorkflowGraphView } from "./graph-view";
import type { RuntimeBindingSnapshot, WorkflowRunFamilySnapshot } from "./lifecycle";

describe("buildWorkflowGraphView", () => {
	it("exposes interrupt guidance for a focused running program node", () => {
		const view = buildWorkflowGraphView(workflowFamilyWithRunningProgram());

		expect(view.focus?.nodeId).toBe("longRunningHold");
		expect(view.focus?.controls?.join("\n")).toContain(
			"/workflow interrupt attempt-1 longRunningHold --deadline-ms 30000",
		);
		expect(view.actions.join("\n")).toContain(
			"Interrupt Program · Long running hold: /workflow interrupt attempt-1 longRunningHold --deadline-ms 30000",
		);
	});
});

describe("renderWorkflowGraphDiagram", () => {
	it("keeps node text visible and marks loopback segments occluded by another node as dotted", () => {
		const diagram = renderWorkflowGraphDiagram(loopbackOcclusionView(), { width: 100 }).join("\n");

		expect(diagram.match(/Agent/g)?.length).toBe(2);
		expect(diagram.match(/Agent[ ┄]+·[ ┄]+runs[ ┄]+0/g)?.length).toBe(2);
		expect(diagram).toContain("┄");
	});

	it("places unrelated overlapping forward edge buses on separate visual lanes", () => {
		const lines = renderWorkflowGraphDiagram(overlappingForwardEdgesView(), { width: 82 });
		const firstTargetLabelLine = lines.findIndex(line => line.includes("○ c"));
		const connectorRows = lines.slice(5, Math.max(5, firstTargetLabelLine - 1));

		expect(connectorRows.filter(line => line.includes("─")).length).toBeGreaterThanOrEqual(2);
	});

	it("renders arrowheads for directed forward, skipped, and loopback routes", () => {
		const loopbackDiagram = renderWorkflowGraphDiagram(loopbackOcclusionView(), { width: 100 }).join("\n");
		const skippedDiagram = renderWorkflowGraphDiagram(skippedForwardEdgeView(), { width: 82 }).join("\n");

		expect(loopbackDiagram).toContain("▼");
		expect(loopbackDiagram).toContain("▲");
		expect(skippedDiagram).toMatch(/▼\s+to c/u);
	});
});

function loopbackOcclusionView(): WorkflowGraphView {
	return {
		familyId: "loopback-occlusion",
		changes: { approved: 0, proposed: 0, rejected: 0 },
		topology: { parallelFanOuts: 0, branchPoints: 0, joins: 0, loops: 1, subflows: 0 },
		nodes: [
			{ id: "start", kind: "Program", status: "completed", activationCount: 1, focused: false },
			{ id: "left", kind: "Agent", status: "pending", activationCount: 0, focused: false },
			{ id: "right", kind: "Agent", status: "pending", activationCount: 0, focused: false },
			{ id: "review", kind: "Reviewer", status: "pending", activationCount: 0, focused: false },
		],
		edges: [
			{ from: "start", to: "left" },
			{ from: "start", to: "right" },
			{ from: "left", to: "review" },
			{ from: "right", to: "review" },
			{ from: "review", to: "left", condition: "state.retry == true" },
		],
		lineage: [],
		actions: [],
	};
}

function overlappingForwardEdgesView(): WorkflowGraphView {
	return {
		familyId: "overlapping-forward-edges",
		changes: { approved: 0, proposed: 0, rejected: 0 },
		topology: { parallelFanOuts: 0, branchPoints: 0, joins: 0, loops: 0, subflows: 0 },
		nodes: [
			{ id: "a", kind: "Program", status: "completed", activationCount: 1, focused: false },
			{ id: "b", kind: "Program", status: "completed", activationCount: 1, focused: false },
			{ id: "c", kind: "Program", status: "pending", activationCount: 0, focused: false },
			{ id: "d", kind: "Program", status: "pending", activationCount: 0, focused: false },
		],
		edges: [
			{ from: "a", to: "d" },
			{ from: "b", to: "c" },
		],
		lineage: [],
		actions: [],
	};
}

function skippedForwardEdgeView(): WorkflowGraphView {
	return {
		familyId: "skipped-forward-edge",
		changes: { approved: 0, proposed: 0, rejected: 0 },
		topology: { parallelFanOuts: 0, branchPoints: 0, joins: 1, loops: 0, subflows: 0 },
		nodes: [
			{ id: "a", kind: "Program", status: "completed", activationCount: 1, focused: false },
			{ id: "b", kind: "Program", status: "completed", activationCount: 1, focused: false },
			{ id: "c", kind: "Program", status: "pending", activationCount: 0, focused: false },
		],
		edges: [
			{ from: "a", to: "b" },
			{ from: "b", to: "c" },
			{ from: "a", to: "c" },
		],
		lineage: [],
		actions: [],
	};
}

function workflowFamilyWithRunningProgram(): WorkflowRunFamilySnapshot {
	const definition: WorkflowDefinition = {
		name: "program-interrupt-smoke",
		version: 1,
		models: { roles: {}, defaults: {} },
		nodes: [
			{ id: "build", type: "agent" },
			{ id: "longRunningHold", type: "script", script: { language: "js", file: "hold.js" } },
			{ id: "archive", type: "script", script: { language: "js", file: "archive.js" } },
		],
		edges: [
			{ from: "build", to: "longRunningHold" },
			{ from: "longRunningHold", to: "archive" },
		],
	};
	return {
		id: "family-1",
		freezes: [flowFreeze(definition)],
		attempts: [
			{
				id: "attempt-1",
				familyId: "family-1",
				freezeId: "freeze-1",
				startNodeId: "build",
				status: "running",
				runtimeBindingSnapshot: runtimeBinding(),
				activations: [
					{ id: "activation-1", nodeId: "build", parentActivationIds: [], status: "completed" },
					{
						id: "activation-2",
						nodeId: "longRunningHold",
						parentActivationIds: ["activation-1"],
						status: "running",
					},
				],
			},
		],
		checkpoints: [],
		changeRequests: [],
	};
}

function flowFreeze(definition: WorkflowDefinition): FlowFreeze {
	return {
		id: "freeze-1",
		schemaVersion: "1",
		flowPath: "program-interrupt-smoke.omhflow",
		resourceDir: "program-interrupt-smoke",
		mainContentHash: "sha256:test",
		resourceHashes: [],
		resourceSnapshots: [],
		canonicalGraphHash: "sha256:test",
		sourceMapping: { workflowBlocks: [], nodes: {} },
		staticCheckReport: { status: "passed", checks: [] },
		portableDefaults: { models: definition.models },
		definition,
	};
}

function runtimeBinding(): RuntimeBindingSnapshot {
	return {
		id: "binding-1",
		requestedRoles: {},
		resolvedModels: {},
		tools: [],
		agents: [],
		unavailable: [],
		warnings: [],
	};
}
