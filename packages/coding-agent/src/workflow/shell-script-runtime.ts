import { executeBash } from "../exec/bash-executor";
import type { ToolSession } from "../tools";
import type { WorkflowScriptEvalResult, WorkflowShellScriptRunner } from "./session-runtime";

const WORKFLOW_SHELL_TIMEOUT_MS = 60 * 60 * 1000;

export function createShellScriptRunner(toolSession: ToolSession): WorkflowShellScriptRunner {
	return async request => {
		const result = await executeBash(request.code, {
			cwd: toolSession.cwd,
			timeout: WORKFLOW_SHELL_TIMEOUT_MS,
			signal: request.signal,
			sessionKey: workflowShellSessionKey(toolSession, request.activationId),
			useUserShell: true,
			outputMaxColumns: 0,
		});
		const scriptResult: WorkflowScriptEvalResult = {
			exitCode: result.exitCode ?? 1,
			output: result.output.trim(),
			language: request.language,
		};
		if (result.artifactId !== undefined) {
			scriptResult.artifactId = result.artifactId;
		}
		if (result.cancelled) {
			scriptResult.error = result.output.trim() || "shell script cancelled";
		} else if (result.exitCode === undefined) {
			scriptResult.error = "shell script missing exit status";
		} else if (result.exitCode !== 0) {
			scriptResult.error = `exit code ${result.exitCode}`;
		}
		return scriptResult;
	};
}

function workflowShellSessionKey(toolSession: ToolSession, activationId: string): string {
	const sessionId = toolSession.getSessionId?.() ?? "session";
	return `${sessionId}:workflow:${activationId}`;
}
