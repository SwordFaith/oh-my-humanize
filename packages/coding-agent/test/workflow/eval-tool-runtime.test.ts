import { afterAll, afterEach, describe, expect, it, vi } from "bun:test";
import { TempDir } from "@oh-my-pi/pi-utils";
import { Settings } from "../../src/config/settings";
import { disposeAllVmContexts } from "../../src/eval/js/context-manager";
import * as pythonExecutor from "../../src/eval/py/executor";
import * as pythonKernel from "../../src/eval/py/kernel";
import type { ToolSession } from "../../src/tools";
import { createEvalToolScriptRunner } from "../../src/workflow/eval-tool-runtime";

function createToolSession(
	cwd: string,
	outputMaxColumns?: number,
	options?: { python?: boolean; kernelMode?: "session" | "per-call"; kernelOwnerId?: string },
): ToolSession {
	const settings = Settings.isolated({
		"eval.js": true,
		"eval.py": options?.python ?? false,
	});
	if (outputMaxColumns !== undefined) {
		settings.override("tools.outputMaxColumns", outputMaxColumns);
	}
	if (options?.kernelMode !== undefined) {
		settings.override("python.kernelMode", options.kernelMode);
	}
	return {
		cwd,
		hasUI: false,
		getSessionFile: () => null,
		getSessionSpawns: () => "*",
		getEvalKernelOwnerId: () => options?.kernelOwnerId,
		settings,
		assertEvalExecutionAllowed: () => {},
	} as unknown as ToolSession;
}

afterEach(() => {
	vi.restoreAllMocks();
});

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

	it("runs Python workflow scripts as per-call evals instead of retaining the interactive session kernel", async () => {
		using tempDir = TempDir.createSync("@omp-workflow-eval-");
		vi.spyOn(pythonKernel, "checkPythonKernelAvailability").mockResolvedValue({ ok: true });
		const executeSpy = vi.spyOn(pythonExecutor, "executePython").mockResolvedValue({
			output: "workflow-python-ok",
			exitCode: 0,
			cancelled: false,
			truncated: false,
			artifactId: undefined,
			totalLines: 1,
			totalBytes: "workflow-python-ok".length,
			outputLines: 1,
			outputBytes: "workflow-python-ok".length,
			displayOutputs: [],
			stdinRequested: false,
		});
		const runner = createEvalToolScriptRunner(
			createToolSession(tempDir.path(), undefined, {
				python: true,
				kernelMode: "session",
				kernelOwnerId: "interactive-owner",
			}),
		);

		const result = await runner({
			activationId: "activation-python",
			nodeId: "python-script",
			code: 'print("workflow-python-ok")',
			language: "py",
			title: "python-script",
		});

		expect(result).toEqual({
			exitCode: 0,
			output: "workflow-python-ok",
			language: "py",
		});
		expect(executeSpy).toHaveBeenCalledTimes(1);
		const options = executeSpy.mock.calls[0]?.[1];
		expect(options?.kernelMode).toBe("per-call");
		expect(options?.kernelOwnerId).toBeUndefined();
	});
});
