import { describe, expect, it } from "bun:test";
import { parseWorkflowDefinition } from "../../src/workflow/definition";
import { buildWorkflowInspection } from "../../src/workflow/inspection";
import {
	appendWorkflowActivationCompleted,
	appendWorkflowActivationStarted,
	reconstructWorkflowRuns,
	startWorkflowRun,
	type WorkflowRunStoreHost,
} from "../../src/workflow/run-store";

const source = `
name: inspect-demo
version: 1
nodes:
  build:
    type: agent
  review:
    type: review
edges:
  - from: build
    to: review
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

describe("workflow inspection model", () => {
	it("summarizes graph, state, activations, revisions, and model assignments", () => {
		const host = createHost();
		const definition = parseWorkflowDefinition(source, { sourcePath: "workflow.yml" });
		const run = startWorkflowRun(host, definition, { runId: "run-1" });
		appendWorkflowActivationStarted(host, run.id, {
			activationId: "activation-1",
			nodeId: "build",
			graphRevisionId: run.currentGraphRevisionId,
			parentActivationIds: [],
		});
		appendWorkflowActivationCompleted(host, run.id, {
			activationId: "activation-1",
			output: { summary: "built", artifacts: ["artifact://workflow/run-1/build.txt"] },
			modelAudit: {
				nodeId: "build",
				source: "workflow-default",
				requestedRole: "builder",
				requestedPattern: "openai/gpt-4o",
				unavailablePolicy: "fallback-to-parent",
				resolvedModel: "openai/gpt-4o",
				explicitThinkingLevel: false,
				fallbackUsed: false,
			},
		});

		const reconstructed = reconstructWorkflowRuns(host.getBranch())[0]!;
		const inspection = buildWorkflowInspection(reconstructed);

		expect(inspection).toEqual({
			runId: "run-1",
			currentGraphRevisionId: "run-1:graph-0",
			graph: {
				nodes: [
					{ id: "build", type: "agent" },
					{ id: "review", type: "review" },
				],
				edges: [{ from: "build", to: "review" }],
			},
			state: {},
			graphRevisions: [{ id: "run-1:graph-0", nodeCount: 2, edgeCount: 1 }],
			activations: [
				{
					id: "activation-1",
					nodeId: "build",
					graphRevisionId: "run-1:graph-0",
					parentActivationIds: [],
					status: "completed",
					summary: "built",
					artifacts: ["artifact://workflow/run-1/build.txt"],
					error: undefined,
				},
			],
			modelAssignments: [
				{
					activationId: "activation-1",
					nodeId: "build",
					source: "workflow-default",
					requestedRole: "builder",
					requestedPattern: "openai/gpt-4o",
					resolvedModel: "openai/gpt-4o",
					thinkingLevel: undefined,
					fallbackUsed: false,
					fallbackReason: undefined,
					error: undefined,
				},
			],
		});
	});
});
