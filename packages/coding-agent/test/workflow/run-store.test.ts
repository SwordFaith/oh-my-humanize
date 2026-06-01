import { describe, expect, it } from "bun:test";
import { parseWorkflowDefinition, type WorkflowDefinition } from "../../src/workflow/definition";
import {
	appendWorkflowGraphRevision,
	appendWorkflowStatePatch,
	reconstructWorkflowRuns,
	startWorkflowRun,
	WORKFLOW_RUN_EVENT_TYPE,
	type WorkflowRunStoreHost,
} from "../../src/workflow/run-store";

const source = `
name: run-store-demo
version: 1
nodes:
  build:
    type: agent
edges: []
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

function renamedDefinition(definition: WorkflowDefinition): WorkflowDefinition {
	return {
		...definition,
		name: "renamed-workflow",
	};
}

describe("workflow run store", () => {
	it("stores the initial definition snapshot when a run starts", () => {
		const host = createHost();
		const definition = parseWorkflowDefinition(source, { sourcePath: "workflow.yml" });

		const run = startWorkflowRun(host, definition, { runId: "run-1" });

		expect(run.id).toBe("run-1");
		expect(run.currentGraphRevisionId).toBe("run-1:graph-0");
		expect(host.entries).toHaveLength(1);
		expect(host.entries[0]).toMatchObject({
			customType: WORKFLOW_RUN_EVENT_TYPE,
			data: {
				event: "run_started",
				runId: "run-1",
				graphRevisionId: "run-1:graph-0",
				definitionSnapshot: definition,
			},
		});

		const reconstructed = reconstructWorkflowRuns(host.getBranch());
		expect(reconstructed).toHaveLength(1);
		expect(reconstructed[0]?.definition.name).toBe("run-store-demo");
		expect(reconstructed[0]?.graphRevisions.map(revision => revision.id)).toEqual(["run-1:graph-0"]);
	});

	it("appends graph revisions without mutating prior revisions", () => {
		const host = createHost();
		const definition = parseWorkflowDefinition(source, { sourcePath: "workflow.yml" });
		const run = startWorkflowRun(host, definition, { runId: "run-1" });
		const nextDefinition = renamedDefinition(definition);

		const revision = appendWorkflowGraphRevision(host, run.id, nextDefinition, {
			graphRevisionId: "run-1:graph-1",
			parentGraphRevisionId: run.currentGraphRevisionId,
			reason: "rename workflow",
		});

		expect(revision.id).toBe("run-1:graph-1");
		expect(host.entries).toHaveLength(2);
		const reconstructed = reconstructWorkflowRuns(host.getBranch());

		expect(reconstructed[0]?.currentGraphRevisionId).toBe("run-1:graph-1");
		expect(reconstructed[0]?.definition.name).toBe("renamed-workflow");
		expect(reconstructed[0]?.graphRevisions.map(entry => entry.definition.name)).toEqual([
			"run-store-demo",
			"renamed-workflow",
		]);
	});

	it("ignores unrelated custom entries and orphan graph revisions during reconstruction", () => {
		const host = createHost();
		const definition = parseWorkflowDefinition(source, { sourcePath: "workflow.yml" });

		host.appendCustomEntry("other-feature", { ok: true });
		appendWorkflowGraphRevision(host, "missing-run", definition, { graphRevisionId: "missing-run:graph-1" });
		startWorkflowRun(host, definition, { runId: "run-1" });

		const reconstructed = reconstructWorkflowRuns(host.getBranch());

		expect(reconstructed.map(run => run.id)).toEqual(["run-1"]);
		expect(reconstructed[0]?.currentGraphRevisionId).toBe("run-1:graph-0");
	});

	it("reconstructs current state from appended state patches", () => {
		const host = createHost();
		const definition = parseWorkflowDefinition(source, { sourcePath: "workflow.yml" });
		const run = startWorkflowRun(host, definition, { runId: "run-1" });

		appendWorkflowStatePatch(host, run.id, {
			patch: [
				{ op: "set", path: "/round", value: 1 },
				{ op: "set", path: "/verdict", value: "continue" },
			],
			reason: "review verdict",
		});

		const reconstructed = reconstructWorkflowRuns(host.getBranch());

		expect(reconstructed[0]?.state).toEqual({ round: 1, verdict: "continue" });
	});
});
