import { describe, expect, it } from "bun:test";
import type { WorkflowDefinition, WorkflowNode } from "../definition";
import { runWorkflow } from "../runner";
import { createSessionWorkflowRuntimeHost } from "../session-runtime";

describe("createSessionWorkflowRuntimeHost review nodes", () => {
	it("uses the first non-empty line as the verdict before falling back", async () => {
		const host = createSessionWorkflowRuntimeHost({
			cwd: "/workspace",
			runAgentTask: async () => ({
				exitCode: 0,
				output: "COMPLETE\nValidation passed after the required loop round.",
			}),
		});
		if (host.runReviewNode === undefined) throw new Error("review runtime missing");

		const node: WorkflowNode = {
			id: "reviewAuditEvents",
			type: "review",
			prompt: "Return a verdict on the first line.",
			gates: ["CONTINUE", "COMPLETE"],
			fallbackVerdict: "CONTINUE",
		};

		const output = await host.runReviewNode({
			node,
			activation: {
				id: "activation-1",
				nodeId: node.id,
				graphRevisionId: "graph-1",
				status: "running",
				parentActivationIds: [],
			},
			prompt: node.prompt,
			gates: node.gates,
			fallbackVerdict: node.fallbackVerdict,
		});

		expect(output.verdict).toBe("COMPLETE");
		expect(output.summary).toBe("COMPLETE\nValidation passed after the required loop round.");
	});

	it("routes one-line reviewer verdict prefixes before falling back", async () => {
		const result = await runRetryReview("COMPLETE Validation passed after the required loop round.");

		expect(result.scheduler.activations.map(activation => activation.nodeId)).toEqual(["review", "done"]);
		expect(result.scheduler.state).toEqual({ verdict: "COMPLETE" });
	});

	it("routes reviewer object summary verdict prefixes before falling back", async () => {
		const result = await runRetryReview(
			JSON.stringify({ summary: "COMPLETE Validation passed after the required loop round." }),
		);

		expect(result.scheduler.activations.map(activation => activation.nodeId)).toEqual(["review", "done"]);
		expect(result.scheduler.state).toEqual({ verdict: "COMPLETE" });
	});
});

async function runRetryReview(reviewOutput: string) {
	const host = createSessionWorkflowRuntimeHost({
		cwd: "/workspace",
		runAgentTask: async () => ({
			exitCode: 0,
			output: reviewOutput,
		}),
		runShellScript: async input => ({
			exitCode: 0,
			output: `${input.nodeId} completed`,
		}),
	});

	return runWorkflow({
		host: new MemoryWorkflowHost(),
		definition: retryReviewDefinition(),
		runId: "run-1",
		startNodeId: "review",
		runtimeHost: host,
	});
}

class MemoryWorkflowHost {
	appendCustomEntry(): string {
		return "entry-1";
	}

	getBranch(): [] {
		return [];
	}
}

function retryReviewDefinition(): WorkflowDefinition {
	return {
		name: "retry-review",
		version: 1,
		models: { roles: {}, defaults: {} },
		nodes: [
			{
				id: "review",
				type: "review",
				prompt: "Return a verdict.",
				gates: ["CONTINUE", "COMPLETE"],
				fallbackVerdict: "CONTINUE",
				writes: ["/verdict"],
			},
			{
				id: "retry",
				type: "script",
				script: { language: "sh", code: "retry" },
			},
			{
				id: "done",
				type: "script",
				script: { language: "sh", code: "done" },
			},
		],
		edges: [
			{ from: "review", to: "retry", condition: { source: 'outputs.review.verdict == "CONTINUE"' } },
			{ from: "review", to: "done", condition: { source: 'outputs.review.verdict != "CONTINUE"' } },
		],
	};
}
