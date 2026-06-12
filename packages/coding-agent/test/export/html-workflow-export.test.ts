import { describe, expect, it } from "bun:test";
import { Buffer } from "node:buffer";
import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import { exportSessionToHtml, getTemplate } from "../../src/export/html";
import { SessionManager } from "../../src/session/session-manager";
import { parseWorkflowDefinition } from "../../src/workflow/definition";
import type { FlowFreeze } from "../../src/workflow/freeze";
import type { WorkflowInspection, WorkflowLifecycleInspection } from "../../src/workflow/inspection";
import {
	completeWorkflowAttempt,
	recordWorkflowFreeze,
	startWorkflowAttempt,
	startWorkflowFamily,
} from "../../src/workflow/lifecycle";
import {
	appendWorkflowActivationCompleted,
	appendWorkflowActivationStarted,
	appendWorkflowStatePatch,
	startWorkflowRun,
} from "../../src/workflow/run-store";

const workflowSource = `
name: export-visible-workflow
version: 1
models:
  defaults:
    agent: openai/gpt-4o
nodes:
  build:
    type: agent
    agent: task
    prompt: Build the artifact.
edges: []
`;

interface ExportedSessionData {
	entries?: unknown[];
	workflowInspections?: WorkflowInspection[];
	workflowLifecycleInspections?: WorkflowLifecycleInspection[];
}

describe("HTML export workflow inspection support", () => {
	it("exports compact workflow inspection data reconstructed from session events", async () => {
		const dir = await fs.mkdtemp(path.join(os.tmpdir(), "omp-html-workflow-export-"));
		const sm = SessionManager.create(dir, dir);
		const outputPath = path.join(dir, "session.html");
		const definition = parseWorkflowDefinition(workflowSource, { sourcePath: path.join(dir, "workflow.yml") });
		try {
			startWorkflowRun(sm, definition, { runId: "run-export", graphRevisionId: "graph-0" });
			appendWorkflowActivationStarted(sm, "run-export", {
				activationId: "activation-1",
				nodeId: "build",
				graphRevisionId: "graph-0",
				parentActivationIds: [],
				input: {
					prompt: {
						value: "Build the artifact.",
						byteLength: 19,
						contentHash: "sha256:export-prompt",
						source: { kind: "inline", text: "Build the artifact." },
					},
				},
			});
			appendWorkflowActivationCompleted(sm, "run-export", {
				activationId: "activation-1",
				output: {
					summary: "built package",
					artifacts: ["artifact://build-log"],
				},
				modelAudit: {
					nodeId: "build",
					source: "workflow-default",
					requestedPattern: "openai/gpt-4o",
					unavailablePolicy: "fallback-to-parent",
					resolvedModel: "openai/gpt-4o",
					explicitThinkingLevel: false,
					fallbackUsed: false,
				},
			});
			appendWorkflowStatePatch(sm, "run-export", {
				patch: [{ op: "set", path: "/score", value: 0.92 }],
				reason: "export fixture",
			});

			await exportSessionToHtml(sm, undefined, { outputPath });
			const exported = decodeSessionData(await Bun.file(outputPath).text());

			expect(exported.workflowInspections).toEqual([
				{
					runId: "run-export",
					currentGraphRevisionId: "graph-0",
					graph: {
						nodes: [{ id: "build", type: "agent" }],
						edges: [],
					},
					state: { score: 0.92 },
					graphRevisions: [{ id: "graph-0", nodeCount: 1, edgeCount: 0 }],
					pendingGraphPatchProposals: [],
					appliedGraphPatches: [],
					activations: [
						{
							id: "activation-1",
							nodeId: "build",
							graphRevisionId: "graph-0",
							parentActivationIds: [],
							status: "completed",
							prompt: {
								value: "Build the artifact.",
								byteLength: 19,
								contentHash: "sha256:export-prompt",
								source: { kind: "inline", text: "Build the artifact." },
							},
							summary: "built package",
							artifacts: ["artifact://build-log"],
						},
					],
					modelAssignments: [
						{
							activationId: "activation-1",
							nodeId: "build",
							source: "workflow-default",
							requestedPattern: "openai/gpt-4o",
							resolvedModel: "openai/gpt-4o",
							fallbackUsed: false,
						},
					],
				},
			]);
		} finally {
			await sm.close();
			await fs.rm(dir, { recursive: true, force: true });
		}
	});

	it("exports workflow lifecycle inspection data reconstructed from session events", async () => {
		const dir = await fs.mkdtemp(path.join(os.tmpdir(), "omp-html-workflow-export-"));
		const sm = SessionManager.create(dir, dir);
		const outputPath = path.join(dir, "session.html");
		try {
			startWorkflowFamily(sm, { familyId: "family-export", objective: "ship export" });
			const freeze = createFreeze("flowfreeze:export");
			recordWorkflowFreeze(sm, freeze, { familyId: "family-export" });
			startWorkflowAttempt(sm, {
				familyId: "family-export",
				attemptId: "attempt-export-1",
				freezeId: freeze.id,
				startNodeId: "build",
				runtimeBindingSnapshot: {
					id: "binding-export",
					requestedRoles: { builder: "openai/gpt-4o" },
					resolvedModels: { builder: "openai/gpt-4o" },
					tools: ["task"],
					agents: ["task"],
					unavailable: [],
					warnings: [],
				},
			});
			completeWorkflowAttempt(sm, {
				attemptId: "attempt-export-1",
				summary: "exported lifecycle",
			});

			await exportSessionToHtml(sm, undefined, { outputPath });
			const exported = decodeSessionData(await Bun.file(outputPath).text());

			expect(exported.workflowLifecycleInspections).toMatchObject([
				{
					familyId: "family-export",
					objective: "ship export",
					freezeIds: ["flowfreeze:export"],
					attempts: [
						{
							id: "attempt-export-1",
							freezeId: "flowfreeze:export",
							status: "completed",
							summary: "exported lifecycle",
							runtimeBindingSnapshot: { id: "binding-export" },
						},
					],
				},
			]);
		} finally {
			await sm.close();
			await fs.rm(dir, { recursive: true, force: true });
		}
	});

	it("redacts frozen resource text from raw HTML session entries", async () => {
		const dir = await fs.mkdtemp(path.join(os.tmpdir(), "omp-html-workflow-export-"));
		const sm = SessionManager.create(dir, dir);
		const outputPath = path.join(dir, "session.html");
		try {
			startWorkflowFamily(sm, { familyId: "family-export" });
			recordWorkflowFreeze(sm, createFreeze("flowfreeze:export-secret", "SECRET_PROMPT_TEXT"), {
				familyId: "family-export",
			});

			await exportSessionToHtml(sm, undefined, { outputPath });
			const html = await Bun.file(outputPath).text();
			const exported = decodeSessionData(html);

			expect(html).not.toContain("SECRET_PROMPT_TEXT");
			expect(JSON.stringify(exported.entries)).not.toContain("SECRET_PROMPT_TEXT");
			expect(JSON.stringify(exported.entries)).toContain("[redacted from HTML export]");
		} finally {
			await sm.close();
			await fs.rm(dir, { recursive: true, force: true });
		}
	});

	it("includes a workflow overview renderer in the generated template", () => {
		const template = getTemplate();
		expect(template).toContain("renderWorkflowOverview");
		expect(template).toContain("workflow-overview");
		expect(template).toContain("workflowInspections");
	});
});

function decodeSessionData(html: string): ExportedSessionData {
	const match = html.match(/<script id="session-data" type="application\/json">([^<]+)<\/script>/);
	if (!match) throw new Error("session data script not found");
	return JSON.parse(Buffer.from(match[1], "base64").toString("utf8")) as ExportedSessionData;
}

function createFreeze(id: string, resourceText?: string): FlowFreeze {
	return {
		id,
		schemaVersion: "omhflow/v1",
		flowPath: `${id}.omhflow`,
		resourceDir: id,
		mainContentHash: `sha256:main-${id}`,
		resourceHashes: [],
		resourceSnapshots:
			resourceText === undefined
				? []
				: [
						{
							path: "prompts/build.md",
							hash: `sha256:resource-${id}`,
							text: resourceText,
							byteLength: resourceText.length,
						},
					],
		canonicalGraphHash: `sha256:graph-${id}`,
		sourceMapping: {
			workflowBlocks: [{ id: "workflow:0", language: "yaml" }],
			nodes: { build: { sourceBlock: "workflow:0" } },
		},
		staticCheckReport: { status: "passed", checks: [{ name: "fixture", status: "passed" }] },
		portableDefaults: { models: { roles: { builder: "openai/gpt-4o" }, defaults: { agent: "builder" } } },
		definition: {
			name: id,
			version: 1,
			models: { roles: { builder: "openai/gpt-4o" }, defaults: { agent: "builder" } },
			nodes: [{ id: "build", type: "agent" }],
			edges: [],
		},
	};
}
