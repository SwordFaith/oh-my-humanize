import { afterEach, describe, expect, it } from "bun:test";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import { resetSettingsForTest, Settings } from "../../src/config/settings";
import type { ToolSession } from "../../src/tools";
import { createShellScriptRunner } from "../../src/workflow/shell-script-runtime";

const tempRoot = path.resolve(process.cwd(), "../../temp/test-workflow-shell-runtime");
const tempDirs: string[] = [];

async function createTempDir(): Promise<string> {
	await fs.mkdir(tempRoot, { recursive: true });
	const dir = await fs.mkdtemp(path.join(tempRoot, "case-"));
	tempDirs.push(dir);
	return dir;
}

function createToolSession(cwd: string): ToolSession {
	const settings = Settings.isolated({});
	return {
		cwd,
		hasUI: false,
		getSessionFile: () => null,
		getSessionSpawns: () => "*",
		getSessionId: () => "workflow-shell-test",
		settings,
	} as unknown as ToolSession;
}

afterEach(async () => {
	resetSettingsForTest();
	await Promise.all(tempDirs.splice(0).map(dir => fs.rm(dir, { recursive: true, force: true })));
});

describe("workflow shell script runtime adapter", () => {
	it("runs shell scripts in the workflow cwd and preserves stdout for structured output parsing", async () => {
		const cwd = await createTempDir();
		await Bun.write(path.join(cwd, "input.txt"), "workflow input\n");
		const runner = createShellScriptRunner(createToolSession(cwd));

		const result = await runner({
			activationId: "activation-build",
			nodeId: "build",
			code: [
				"cat input.txt",
				'printf \'%s\\n\' \'{"summary":"shell build ok","data":{"source":"input.txt"}}\'',
			].join("\n"),
			language: "sh",
			title: "build",
		});

		expect(result).toEqual({
			exitCode: 0,
			output: 'workflow input\n{"summary":"shell build ok","data":{"source":"input.txt"}}',
			language: "sh",
		});
	});

	it("preserves long structured JSON output lines for workflow state parsing", async () => {
		resetSettingsForTest();
		await Settings.init({
			inMemory: true,
			overrides: { "tools.outputMaxColumns": 96 },
		});
		const cwd = await createTempDir();
		const runner = createShellScriptRunner(createToolSession(cwd));
		const longCommand = `mkdir -p workflow-output && GOCACHE="$(pwd)/workflow-output/go-build" GOMODCACHE="$(pwd)/workflow-output/go-mod" go test ./... ${"x".repeat(520)}`;

		const result = await runner({
			activationId: "activation-long-json",
			nodeId: "load-contract",
			code: [
				`LONG_COMMAND='${longCommand}'`,
				'jq -cn --arg command "$LONG_COMMAND" \'{summary:"loaded baseline contract",statePatch:[{op:"set",path:"/baseline/command",value:$command}]}\'',
			].join("\n"),
			language: "sh",
			title: "load-contract",
		});

		const parsed = JSON.parse(result.output) as {
			summary: string;
			statePatch: [{ value: string }];
		};
		expect(parsed.summary).toBe("loaded baseline contract");
		expect(parsed.statePatch[0].value).toBe(longCommand);
		expect(result.output).not.toContain("…");
	});

	it("returns non-zero shell exits as workflow script failures", async () => {
		const cwd = await createTempDir();
		const runner = createShellScriptRunner(createToolSession(cwd));

		const result = await runner({
			activationId: "activation-fail",
			nodeId: "fail",
			code: "echo before failure\nexit 7",
			language: "sh",
			title: "fail",
		});

		expect(result.exitCode).toBe(7);
		expect(result.output).toContain("before failure");
		expect(result.error).toBe("exit code 7");
		expect(result.language).toBe("sh");
	});
});
