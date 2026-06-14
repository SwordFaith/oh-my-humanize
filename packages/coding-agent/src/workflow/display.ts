import type { WorkflowNode } from "./definition";

export function formatWorkflowNodeRole(node: WorkflowNode): string {
	if (node.type === "agent") return workflowAgentRoleFromNodeId(node.id);
	if (node.type === "review") return workflowReviewRoleFromNodeId(node.id);
	if (node.type === "script") return workflowProgramRoleFromNodeId(node.id);
	if (node.type === "human") return "Human checkpoint";
	return titleCaseWorkflowWord(node.type);
}

export function formatWorkflowNodeDisplayName(nodeId: string): string {
	const words = workflowRoleNodeId(nodeId)
		.trim()
		.split(/\s+/u)
		.filter(word => word.length > 0);
	if (words.length === 0) return nodeId;
	return words.map((word, index) => formatWorkflowDisplayWord(word, index)).join(" ");
}

export function formatWorkflowAgentWorkItemLabel(node: WorkflowNode): string {
	return `${formatWorkflowNodeRole(node)} · ${formatWorkflowNodeDisplayName(node.id)}`;
}

function workflowAgentRoleFromNodeId(nodeId: string): string {
	const humanId = workflowRoleNodeId(nodeId);
	if (/(scout|explore|survey)/iu.test(humanId) && /parser/iu.test(humanId)) return "Parser scout";
	if (/(scout|explore|survey)/iu.test(humanId) && /\bcli\b/iu.test(humanId)) return "CLI scout";
	if (/(scout|explore|survey)/iu.test(humanId) && /\bux\b|ui|interface/iu.test(humanId)) return "UX scout";
	if (/quality/iu.test(humanId) && /(polish|fix|repair)/iu.test(humanId)) return "Quality polish";
	if (/(plan|design|architect)/iu.test(humanId)) return "Planner";
	if (/(review|check|verify|audit|judge|gate)/iu.test(humanId)) return "Reviewer";
	if (/(triage|inspect|investigate|research|repro|scout|explore|survey)/iu.test(humanId)) return "Investigator";
	if (/(build|implement|write|fix|patch|code|dev|polish)/iu.test(humanId)) return "Builder";
	return "Workflow agent";
}

function workflowReviewRoleFromNodeId(nodeId: string): string {
	const humanId = workflowRoleNodeId(nodeId);
	if (/quality/iu.test(humanId) && /(gate|review|check|verify|audit)/iu.test(humanId)) return "Quality gate";
	if (/(decision|choose|select|promote|gate)/iu.test(humanId)) return "Decision gate";
	if (/(security|safety)/iu.test(humanId)) return "Safety review";
	if (/(test|verify|validation|qa)/iu.test(humanId)) return "Validation review";
	return "Reviewer";
}

function workflowProgramRoleFromNodeId(nodeId: string): string {
	const humanId = workflowRoleNodeId(nodeId);
	if (/(seed|setup|bootstrap|init)/iu.test(humanId)) return "Setup";
	if (/(choose|select|branch|route|decide)/iu.test(humanId)) return "Branch selector";
	if (/(archive|record|evidence|snapshot)/iu.test(humanId)) return "Evidence archive";
	if (/(test|verify|validate|check)/iu.test(humanId)) return "Verifier";
	if (/(build|compile|bundle)/iu.test(humanId)) return "Build program";
	return "Program";
}

function workflowRoleNodeId(nodeId: string): string {
	return splitWorkflowNamespace(nodeId)
		.replace(/([a-z0-9])([A-Z])/gu, "$1 $2")
		.replace(/[_-]+/gu, " ");
}

function splitWorkflowNamespace(nodeId: string): string {
	return nodeId.split("__").at(-1) ?? nodeId;
}

function titleCaseWorkflowWord(value: string): string {
	const trimmed = value.trim();
	if (trimmed.length === 0) return "Node";
	return `${trimmed.slice(0, 1).toUpperCase()}${trimmed.slice(1)}`;
}

function formatWorkflowDisplayWord(word: string, index: number): string {
	const lower = word.toLowerCase();
	if (lower === "cli") return "CLI";
	if (lower === "ui") return "UI";
	if (lower === "ux") return "UX";
	if (lower === "api") return "API";
	if (lower === "llm") return "LLM";
	if (/^[A-Z0-9]{2,}$/u.test(word)) return word;
	if (index > 0) return lower;
	return `${lower.slice(0, 1).toUpperCase()}${lower.slice(1)}`;
}
