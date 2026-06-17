import { afterAll, describe, expect, it } from "bun:test";
import { TempDir } from "@oh-my-pi/pi-utils";
import { Settings } from "../../src/config/settings";
import { disposeAllVmContexts } from "../../src/eval/js/context-manager";
import type { ToolSession } from "../../src/tools";
import { createEvalToolScriptRunner } from "../../src/workflow/eval-tool-runtime";

function createToolSession(cwd: string, outputMaxColumns?: number): ToolSession {
	const settings = Settings.isolated({
		"eval.js": true,
		"eval.py": false,
	});
	if (outputMaxColumns !== undefined) {
		settings.override("tools.outputMaxColumns", outputMaxColumns);
	}
	return {
		cwd,
		hasUI: false,
		getSessionFile: () => null,
		getSessionSpawns: () => "*",
		settings,
		assertEvalExecutionAllowed: () => {},
	} as unknown as ToolSession;
}

afterAll(async () => {
	await disposeAllVmContexts();
});

describe("workflow eval tool runtime adapter", () => {
	it("runs workflow script requests through the existing eval tool", async () => {
		using tempDir = TempDir.createSync("@omp-workflow-eval-");
		const runner = createEvalToolScriptRunner(createToolSession(tempDir.path()));

		const result = await runner({
			activationId: "activation-script",
			nodeId: "script",
			code: 'return "workflow-ok";',
			language: "js",
			title: "script",
		});

		expect(result).toEqual({
			exitCode: 0,
			output: "workflow-ok",
			language: "js",
		});
	});

	it("returns raw cell stdout so structured workflow JSON can be parsed", async () => {
		using tempDir = TempDir.createSync("@omp-workflow-eval-");
		const runner = createEvalToolScriptRunner(createToolSession(tempDir.path()));
		const structured = {
			summary: "validation passed",
			data: { reviewPrompt: "Review the validation report." },
		};

		const result = await runner({
			activationId: "activation-script",
			nodeId: "script",
			code: `console.log(${JSON.stringify(JSON.stringify(structured))});`,
			language: "js",
			title: "script",
		});

		expect(result.output).toBe(JSON.stringify(structured));
	});

	it("does not column-truncate long structured stdout used as workflow data", async () => {
		using tempDir = TempDir.createSync("@omp-workflow-eval-");
		const runner = createEvalToolScriptRunner(createToolSession(tempDir.path(), 64));
		const reviewPrompt = `Review validation details:\n${"line ".repeat(80)}`;
		const structured = {
			summary: "validation passed",
			data: { reviewPrompt },
			statePatch: [{ op: "set", path: "/reviewPrompt", value: reviewPrompt }],
		};

		const result = await runner({
			activationId: "activation-script",
			nodeId: "script",
			code: `console.log(${JSON.stringify(JSON.stringify(structured))});`,
			language: "js",
			title: "script",
		});

		expect(result.output).toBe(JSON.stringify(structured));
		expect(result.output).not.toContain("…");
	});

	it("honors workflow script runtime budgets instead of the eval default", async () => {
		using tempDir = TempDir.createSync("@omp-workflow-eval-");
		const runner = createEvalToolScriptRunner(createToolSession(tempDir.path()));

		const result = await runner({
			activationId: "activation-timeout",
			nodeId: "slow-validation",
			code: 'await Bun.sleep(1500); return { summary: "late" };',
			language: "js",
			title: "slow-validation",
			timeoutMs: 1_000,
		});

		expect(result.exitCode).not.toBe(0);
		expect(result.error?.toLowerCase()).toMatch(/time(?:d)? out|timeout/u);
	}, 5_000);
});
