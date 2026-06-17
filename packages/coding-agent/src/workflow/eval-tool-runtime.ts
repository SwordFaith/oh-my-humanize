import type { AgentToolResult } from "@oh-my-pi/pi-agent-core";
import type { EvalToolDetails } from "../eval/types";
import type { ToolSession } from "../tools";
import { EvalTool, type EvalToolParams } from "../tools/eval";
import type { WorkflowScriptEvalResult, WorkflowScriptEvalRunner } from "./session-runtime";

export function createEvalToolScriptRunner(toolSession: ToolSession): WorkflowScriptEvalRunner {
	return async request => {
		const evalTool = new EvalTool(await workflowScriptToolSession(toolSession));
		const cell: EvalToolParams["cells"][number] = {
			language: request.language,
			code: request.code,
			title: request.title,
		};
		const timeout = workflowScriptEvalTimeoutSeconds(request.timeoutMs);
		if (timeout !== undefined) {
			cell.timeout = timeout;
		}
		const params: EvalToolParams = {
			cells: [cell],
		};
		const result = await evalTool.execute(`workflow-${request.activationId}`, params);
		return workflowScriptResultFromEvalTool(request.language, result);
	};
}

async function workflowScriptToolSession(toolSession: ToolSession): Promise<ToolSession> {
	if (toolSession.settings.get("tools.outputMaxColumns") === 0) return toolSession;
	const settings = await toolSession.settings.cloneForCwd(toolSession.cwd);
	settings.override("tools.outputMaxColumns", 0);
	return { ...toolSession, settings };
}

function workflowScriptResultFromEvalTool(
	language: WorkflowScriptEvalResult["language"],
	result: AgentToolResult<EvalToolDetails | undefined>,
): WorkflowScriptEvalResult {
	const details = result.details;
	const output = textContent(result.content);
	const exitCode = exitCodeFromEvalDetails(details);
	const scriptResult: WorkflowScriptEvalResult = {
		exitCode,
		output,
		language,
	};
	if (details?.isError) {
		scriptResult.error = output || "eval script failed";
	}
	const artifactId = details?.meta?.truncation?.artifactId;
	if (artifactId !== undefined) {
		scriptResult.artifactId = artifactId;
	}
	return scriptResult;
}

function exitCodeFromEvalDetails(details: EvalToolDetails | undefined): number {
	const firstCell = details?.cells?.[0];
	if (firstCell?.exitCode !== undefined) return firstCell.exitCode;
	return details?.isError ? 1 : 0;
}

function workflowScriptEvalTimeoutSeconds(timeoutMs: number | undefined): number | undefined {
	if (timeoutMs === undefined) return undefined;
	return Math.max(1, Math.min(3600, Math.ceil(timeoutMs / 1000)));
}

function textContent(content: Array<{ type: string; text?: string }>): string {
	return content
		.filter(item => item.type === "text" && typeof item.text === "string")
		.map(item => item.text)
		.join("\n")
		.trim();
}
