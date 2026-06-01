import type { CustomEntry, SessionEntry } from "../session/session-manager";
import type { WorkflowDefinition } from "./definition";

export const WORKFLOW_RUN_EVENT_TYPE = "workflow-run-event";

export interface WorkflowRunStoreHost {
	appendCustomEntry(customType: string, data?: unknown): string;
	getBranch(): Array<Pick<CustomEntry, "type" | "customType" | "data"> | SessionEntry>;
}

export interface WorkflowGraphRevision {
	id: string;
	parentId?: string;
	definition: WorkflowDefinition;
	reason?: string;
}

export interface WorkflowRunSnapshot {
	id: string;
	currentGraphRevisionId: string;
	definition: WorkflowDefinition;
	graphRevisions: WorkflowGraphRevision[];
	state: Record<string, unknown>;
}

export interface StartWorkflowRunOptions {
	runId: string;
	graphRevisionId?: string;
}

export interface AppendWorkflowGraphRevisionOptions {
	graphRevisionId: string;
	parentGraphRevisionId?: string;
	reason?: string;
}

export interface AppendWorkflowStatePatchOptions {
	patch: WorkflowStatePatchOperation[];
	reason?: string;
}

export interface WorkflowStatePatchOperation {
	op: "set";
	path: string;
	value: unknown;
}

export type WorkflowRunEvent =
	| WorkflowRunStartedEvent
	| WorkflowGraphRevisionCreatedEvent
	| WorkflowStatePatchAppliedEvent;

export interface WorkflowRunStartedEvent {
	event: "run_started";
	runId: string;
	graphRevisionId: string;
	definitionSnapshot: WorkflowDefinition;
}

export interface WorkflowGraphRevisionCreatedEvent {
	event: "graph_revision_created";
	runId: string;
	graphRevisionId: string;
	parentGraphRevisionId?: string;
	definitionSnapshot: WorkflowDefinition;
	reason?: string;
}

export interface WorkflowStatePatchAppliedEvent {
	event: "state_patch_applied";
	runId: string;
	patch: WorkflowStatePatchOperation[];
	reason?: string;
}

export function startWorkflowRun(
	host: WorkflowRunStoreHost,
	definition: WorkflowDefinition,
	options: StartWorkflowRunOptions,
): WorkflowRunSnapshot {
	const graphRevisionId = options.graphRevisionId ?? `${options.runId}:graph-0`;
	const event: WorkflowRunStartedEvent = {
		event: "run_started",
		runId: options.runId,
		graphRevisionId,
		definitionSnapshot: definition,
	};
	host.appendCustomEntry(WORKFLOW_RUN_EVENT_TYPE, event);
	return {
		id: options.runId,
		currentGraphRevisionId: graphRevisionId,
		definition,
		graphRevisions: [{ id: graphRevisionId, definition }],
		state: {},
	};
}

export function appendWorkflowGraphRevision(
	host: WorkflowRunStoreHost,
	runId: string,
	definition: WorkflowDefinition,
	options: AppendWorkflowGraphRevisionOptions,
): WorkflowGraphRevision {
	const event: WorkflowGraphRevisionCreatedEvent = {
		event: "graph_revision_created",
		runId,
		graphRevisionId: options.graphRevisionId,
		definitionSnapshot: definition,
	};
	if (options.parentGraphRevisionId !== undefined) event.parentGraphRevisionId = options.parentGraphRevisionId;
	if (options.reason !== undefined) event.reason = options.reason;
	host.appendCustomEntry(WORKFLOW_RUN_EVENT_TYPE, event);
	return {
		id: options.graphRevisionId,
		parentId: options.parentGraphRevisionId,
		definition,
		reason: options.reason,
	};
}

export function appendWorkflowStatePatch(
	host: WorkflowRunStoreHost,
	runId: string,
	options: AppendWorkflowStatePatchOptions,
): void {
	const event: WorkflowStatePatchAppliedEvent = {
		event: "state_patch_applied",
		runId,
		patch: options.patch,
	};
	if (options.reason !== undefined) event.reason = options.reason;
	host.appendCustomEntry(WORKFLOW_RUN_EVENT_TYPE, event);
}

export function reconstructWorkflowRuns(
	entries: WorkflowRunStoreHost["getBranch"] extends () => infer T ? T : never,
): WorkflowRunSnapshot[] {
	const runs = new Map<string, WorkflowRunSnapshot>();
	for (const entry of entries) {
		const event = workflowEventFromEntry(entry);
		if (!event) continue;
		if (event.event === "run_started") {
			runs.set(event.runId, {
				id: event.runId,
				currentGraphRevisionId: event.graphRevisionId,
				definition: event.definitionSnapshot,
				graphRevisions: [{ id: event.graphRevisionId, definition: event.definitionSnapshot }],
				state: {},
			});
			continue;
		}
		const run = runs.get(event.runId);
		if (!run) continue;
		if (event.event === "state_patch_applied") {
			applyStatePatch(run.state, event.patch);
			continue;
		}
		run.currentGraphRevisionId = event.graphRevisionId;
		run.definition = event.definitionSnapshot;
		run.graphRevisions.push({
			id: event.graphRevisionId,
			parentId: event.parentGraphRevisionId,
			definition: event.definitionSnapshot,
			reason: event.reason,
		});
	}
	return [...runs.values()];
}

function applyStatePatch(state: Record<string, unknown>, patch: WorkflowStatePatchOperation[]): void {
	for (const operation of patch) {
		setStatePath(state, operation.path, operation.value);
	}
}

function setStatePath(state: Record<string, unknown>, pointer: string, value: unknown): void {
	const segments = parseJsonPointer(pointer);
	if (segments.length === 0) {
		throw new Error("workflow state patch cannot replace the state root");
	}
	let current: Record<string, unknown> = state;
	for (const segment of segments.slice(0, -1)) {
		const existing = current[segment];
		if (isRecord(existing)) {
			current = existing;
			continue;
		}
		const next: Record<string, unknown> = {};
		current[segment] = next;
		current = next;
	}
	const leaf = segments.at(-1);
	if (leaf === undefined) {
		throw new Error("workflow state patch cannot replace the state root");
	}
	current[leaf] = value;
}

function parseJsonPointer(pointer: string): string[] {
	if (!pointer.startsWith("/")) {
		throw new Error(`workflow state patch path must be a JSON pointer: ${pointer}`);
	}
	return pointer
		.slice(1)
		.split("/")
		.map(segment => segment.replaceAll("~1", "/").replaceAll("~0", "~"));
}

function workflowEventFromEntry(entry: unknown): WorkflowRunEvent | undefined {
	if (!isRecord(entry)) return undefined;
	if (entry.type !== "custom" || entry.customType !== WORKFLOW_RUN_EVENT_TYPE) return undefined;
	return isWorkflowRunEvent(entry.data) ? entry.data : undefined;
}

function isWorkflowRunEvent(value: unknown): value is WorkflowRunEvent {
	if (!isRecord(value)) return false;
	if (
		value.event !== "run_started" &&
		value.event !== "graph_revision_created" &&
		value.event !== "state_patch_applied"
	) {
		return false;
	}
	if (typeof value.runId !== "string") return false;
	if (value.event === "state_patch_applied") {
		return Array.isArray(value.patch);
	}
	if (typeof value.graphRevisionId !== "string") return false;
	return isRecord(value.definitionSnapshot);
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}
