import { Ellipsis, truncateToWidth, visibleWidth } from "@oh-my-pi/pi-tui";
import type { WorkflowNode } from "./definition";
import type {
	WorkflowAttemptActivationRecord,
	WorkflowChangeRequestRecord,
	WorkflowCheckpointSnapshot,
	WorkflowRunAttemptSnapshot,
	WorkflowRunFamilySnapshot,
} from "./lifecycle";

export type WorkflowGraphNodeStatus =
	| "pending"
	| "running"
	| "completed"
	| "checkpointed"
	| "frontier"
	| "failed"
	| "aborted";

export interface WorkflowGraphView {
	familyId: string;
	objective?: string;
	latestFreezeId?: string;
	currentAttempt?: WorkflowGraphAttemptView;
	changes: WorkflowGraphChangeCounts;
	nodes: WorkflowGraphNodeView[];
	edges: WorkflowGraphEdgeView[];
	checkpoint?: WorkflowGraphCheckpointView;
	lineage: WorkflowGraphLineageView[];
	actions: string[];
}

export interface WorkflowGraphAttemptView {
	id: string;
	status: WorkflowRunAttemptSnapshot["status"];
	runtimeBindingId: string;
	checkpointId?: string;
}

export interface WorkflowGraphChangeCounts {
	approved: number;
	proposed: number;
	rejected: number;
}

export interface WorkflowGraphNodeView {
	id: string;
	kind: string;
	status: WorkflowGraphNodeStatus;
	summary?: string;
	error?: string;
	reason?: string;
	focused: boolean;
}

export interface WorkflowGraphEdgeView {
	from: string;
	to: string;
	condition?: string;
}

export interface WorkflowGraphCheckpointView {
	id: string;
	frontier: WorkflowGraphFrontierView[];
}

export interface WorkflowGraphFrontierView {
	from: string;
	to: string;
}

export interface WorkflowGraphLineageView {
	id: string;
	status: WorkflowChangeRequestRecord["status"];
	reason: string;
	actor?: string;
	applications: string[];
}

export interface WorkflowGraphRenderOptions {
	width?: number;
}

const WORKFLOW_DETAIL_PREVIEW_CHARS = 180;
const MIN_NODE_WIDTH = 31;
const DEFAULT_NODE_WIDTH = 49;
const MAX_NODE_WIDTH = 71;
const NODE_GAP_WIDTH = 3;

export function buildWorkflowGraphView(family: WorkflowRunFamilySnapshot): WorkflowGraphView {
	const latestFreeze = family.freezes.at(-1);
	const currentAttempt = family.attempts.at(-1);
	const currentFreeze =
		(currentAttempt ? family.freezes.find(freeze => freeze.id === currentAttempt.freezeId) : undefined) ??
		latestFreeze;
	const currentCheckpoint = currentAttempt ? findWorkflowCheckpointForAttempt(family, currentAttempt) : undefined;
	const nodeStatuses = buildWorkflowGraphNodeStatuses(family, currentAttempt, currentCheckpoint);
	const nodes =
		currentFreeze?.definition.nodes.map(node => {
			const status = nodeStatuses.get(node.id) ?? { status: "pending" as const };
			const view: WorkflowGraphNodeView = {
				id: node.id,
				kind: formatWorkflowNodeKind(node),
				status: status.status,
				focused: isFocusedWorkflowGraphNode(status.status),
			};
			if (status.summary !== undefined) view.summary = status.summary;
			if (status.error !== undefined) view.error = status.error;
			if (status.reason !== undefined) view.reason = status.reason;
			return view;
		}) ?? [];
	const edges =
		currentFreeze?.definition.edges.map(edge => {
			const view: WorkflowGraphEdgeView = { from: edge.from, to: edge.to };
			if (edge.condition?.source !== undefined) view.condition = edge.condition.source;
			return view;
		}) ?? [];
	const view: WorkflowGraphView = {
		familyId: family.id,
		changes: countWorkflowChangeRequests(family),
		nodes,
		edges,
		lineage: family.changeRequests.map(formatLineage),
		actions: formatWorkflowGraphActions(family, currentAttempt, currentCheckpoint),
	};
	if (family.objective !== undefined) view.objective = family.objective;
	if (latestFreeze?.id !== undefined) view.latestFreezeId = latestFreeze.id;
	if (currentAttempt !== undefined) {
		view.currentAttempt = {
			id: currentAttempt.id,
			status: currentAttempt.status,
			runtimeBindingId: currentAttempt.runtimeBindingSnapshot.id,
		};
		if (currentAttempt.checkpointId !== undefined) view.currentAttempt.checkpointId = currentAttempt.checkpointId;
	}
	if (currentCheckpoint !== undefined) {
		view.checkpoint = {
			id: currentCheckpoint.id,
			frontier: currentCheckpoint.frontierNodeIds.map(nodeId => ({
				from: nodeId,
				to: mapWorkflowCheckpointFrontierNode(family, currentCheckpoint, nodeId, currentFreeze),
			})),
		};
	}
	return view;
}

export function renderWorkflowGraphText(view: WorkflowGraphView, options: WorkflowGraphRenderOptions = {}): string {
	const lines: string[] = [`Workflow graph: ${view.familyId}`];
	if (view.objective !== undefined) lines.push(`Objective: ${view.objective}`);
	lines.push(`Latest freeze: ${view.latestFreezeId ?? "none"}`);
	if (view.currentAttempt !== undefined) {
		const checkpoint = view.currentAttempt.checkpointId ? ` from ${view.currentAttempt.checkpointId}` : "";
		lines.push(`Current attempt: ${view.currentAttempt.id} ${view.currentAttempt.status}${checkpoint}`);
		lines.push(`Runtime binding: ${view.currentAttempt.runtimeBindingId}`);
	} else {
		lines.push("Current attempt: none");
	}
	lines.push(
		`Changes: ${view.changes.approved} approved, ${view.changes.proposed} proposed, ${view.changes.rejected} rejected`,
	);
	lines.push("Diagram:");
	lines.push(...renderWorkflowGraphDiagram(view, options));
	if (view.checkpoint !== undefined) {
		lines.push(`Checkpoint frontier: ${view.checkpoint.id} ${formatCheckpointFrontier(view.checkpoint)}`);
	}
	if (view.lineage.length > 0) {
		lines.push("Mutable lineage:");
		for (const request of view.lineage) {
			const actor = request.actor === undefined ? "" : ` by ${request.actor}`;
			const applied = request.applications.length === 0 ? "" : ` applied=${request.applications.join(",")}`;
			lines.push(`- ${request.id} ${request.status}${actor}${applied} - ${request.reason}`);
		}
	}
	lines.push("Actions:");
	for (const action of view.actions) lines.push(`- ${action}`);
	return lines.join("\n");
}

export function renderWorkflowGraphDiagram(
	view: WorkflowGraphView,
	options: WorkflowGraphRenderOptions = {},
): string[] {
	if (view.nodes.length === 0) return ["(no frozen graph)"];
	const layout = layoutWorkflowGraph(view, options.width);
	const lines: string[] = [];
	for (let rankIndex = 0; rankIndex < layout.ranks.length; rankIndex += 1) {
		lines.push(...renderWorkflowGraphRank(rankIndex, layout));
		const connectorLines = renderWorkflowGraphConnector(rankIndex, layout);
		lines.push(...connectorLines);
		if (rankIndex < layout.ranks.length - 1 && connectorLines.length === 0) lines.push("");
	}
	if (layout.backEdges.length > 0) lines.push("", ...renderWorkflowGraphLoopbacks(layout.backEdges));
	return lines;
}

interface WorkflowGraphLayout {
	ranks: WorkflowGraphNodeView[][];
	rankByNodeId: Map<string, number>;
	forwardEdges: WorkflowGraphEdgeView[];
	backEdges: WorkflowGraphEdgeView[];
	nodeWidth: number;
	totalWidth: number;
}

function layoutWorkflowGraph(view: WorkflowGraphView, width: number | undefined): WorkflowGraphLayout {
	const order = new Map(view.nodes.map((node, index) => [node.id, index]));
	const forwardEdges = view.edges.filter(edge => !isWorkflowBackEdge(edge, order));
	const backEdges = view.edges.filter(edge => isWorkflowBackEdge(edge, order));
	const rankByNodeId = new Map(view.nodes.map(node => [node.id, 0]));
	for (let pass = 0; pass < view.nodes.length; pass += 1) {
		let changed = false;
		for (const edge of forwardEdges) {
			const sourceRank = rankByNodeId.get(edge.from);
			const targetRank = rankByNodeId.get(edge.to);
			if (sourceRank === undefined || targetRank === undefined) continue;
			const nextRank = sourceRank + 1;
			if (targetRank >= nextRank) continue;
			rankByNodeId.set(edge.to, nextRank);
			changed = true;
		}
		if (!changed) break;
	}
	const rankCount = Math.max(1, ...rankByNodeId.values()) + 1;
	const ranks = Array.from({ length: rankCount }, () => [] as WorkflowGraphNodeView[]);
	for (const node of view.nodes) {
		const rank = rankByNodeId.get(node.id) ?? 0;
		ranks[rank]!.push(node);
	}
	const maxRankSize = Math.max(1, ...ranks.map(rank => rank.length));
	const nodeWidth = workflowGraphNodeWidth(width, maxRankSize);
	return {
		ranks,
		rankByNodeId,
		forwardEdges,
		backEdges,
		nodeWidth,
		totalWidth: rankWidth(maxRankSize, nodeWidth),
	};
}

function isWorkflowBackEdge(edge: WorkflowGraphEdgeView, order: Map<string, number>): boolean {
	const sourceOrder = order.get(edge.from);
	const targetOrder = order.get(edge.to);
	if (sourceOrder === undefined || targetOrder === undefined) return false;
	return targetOrder <= sourceOrder;
}

function workflowGraphNodeWidth(width: number | undefined, maxRankSize: number): number {
	if (width === undefined || !Number.isFinite(width)) return DEFAULT_NODE_WIDTH;
	const safeRankSize = Math.max(1, maxRankSize);
	const available = Math.floor(width) - NODE_GAP_WIDTH * (safeRankSize - 1);
	const rankFitWidth = Math.floor(available / safeRankSize);
	const boundedWidth = Math.max(MIN_NODE_WIDTH, Math.min(MAX_NODE_WIDTH, rankFitWidth));
	return oddNodeWidth(boundedWidth);
}

function oddNodeWidth(width: number): number {
	return width % 2 === 0 ? width - 1 : width;
}

function rankWidth(rankSize: number, nodeWidth: number): number {
	return rankSize * nodeWidth + Math.max(0, rankSize - 1) * NODE_GAP_WIDTH;
}

function renderWorkflowGraphRank(rankIndex: number, layout: WorkflowGraphLayout): string[] {
	const rank = layout.ranks[rankIndex] ?? [];
	const boxes = rank.map(node =>
		renderWorkflowGraphNode(node, layout.nodeWidth, {
			incoming: hasIncomingWorkflowGraphConnector(node.id, rankIndex, layout),
			outgoing: hasOutgoingWorkflowGraphConnector(node.id, rankIndex, layout),
		}),
	);
	const rankContentWidth = rankWidth(rank.length, layout.nodeWidth);
	const leftPadding = " ".repeat(Math.max(0, Math.floor((layout.totalWidth - rankContentWidth) / 2)));
	const height = Math.max(...boxes.map(box => box.length));
	const rows: string[] = [];
	for (let lineIndex = 0; lineIndex < height; lineIndex += 1) {
		rows.push(
			`${leftPadding}${boxes
				.map(box => box[lineIndex] ?? " ".repeat(layout.nodeWidth))
				.join(" ".repeat(NODE_GAP_WIDTH))}`.trimEnd(),
		);
	}
	return rows;
}

function renderWorkflowGraphConnector(rankIndex: number, layout: WorkflowGraphLayout): string[] {
	const edges = layout.forwardEdges.filter(edge => layout.rankByNodeId.get(edge.from) === rankIndex);
	if (edges.length === 0) return [];
	const nextRankIndex = rankIndex + 1;
	const routedEdges = edges.filter(edge => {
		const targetRank = layout.rankByNodeId.get(edge.to);
		return targetRank !== undefined && targetRank >= nextRankIndex;
	});
	if (routedEdges.length === 0) return [];
	const directEdges: RoutedWorkflowGraphEdge[] = [];
	const skippedEdges: WorkflowGraphEdgeView[] = [];
	for (const edge of routedEdges) {
		const source = nodeCenter(edge.from, rankIndex, layout);
		const targetRank = layout.rankByNodeId.get(edge.to);
		if (source === undefined || targetRank === undefined) continue;
		const target = nodeCenter(edge.to, targetRank, layout);
		if (target === undefined) continue;
		if (targetRank === nextRankIndex) directEdges.push({ edge, source, target });
		else skippedEdges.push(edge);
	}
	const rows = renderWorkflowGraphConnectorRows(directEdges, layout.totalWidth);
	const labeledEdges = [
		...directEdges.filter(routed => routed.edge.condition !== undefined).map(routed => routed.edge),
		...skippedEdges,
	];
	for (const edge of labeledEdges) rows.push(`  edge ${edge.from} to ${formatEdgeTarget(edge)}`);
	return rows;
}

interface RoutedWorkflowGraphEdge {
	edge: WorkflowGraphEdgeView;
	source: number;
	target: number;
}

function renderWorkflowGraphConnectorRows(edges: RoutedWorkflowGraphEdge[], width: number): string[] {
	if (edges.length === 0) return [];
	const grid = createConnectorGrid(3, width);
	const targets = new Set<number>();
	for (const edge of edges) {
		drawConnectorStem(grid, 0, edge.source);
		drawConnectorBus(grid, 1, edge.source, edge.target);
		targets.add(edge.target);
	}
	for (const target of targets) {
		drawConnectorLanding(grid, 2, target);
	}
	return grid.map(row => connectorRowToString(row)).filter(line => line.trim().length > 0);
}

function hasIncomingWorkflowGraphConnector(nodeId: string, rankIndex: number, layout: WorkflowGraphLayout): boolean {
	if (rankIndex === 0) return false;
	return layout.forwardEdges.some(edge => {
		if (edge.to !== nodeId) return false;
		return layout.rankByNodeId.get(edge.from) === rankIndex - 1;
	});
}

function hasOutgoingWorkflowGraphConnector(nodeId: string, rankIndex: number, layout: WorkflowGraphLayout): boolean {
	return layout.forwardEdges.some(edge => {
		if (edge.from !== nodeId) return false;
		return layout.rankByNodeId.get(edge.to) === rankIndex + 1;
	});
}

function nodeCenter(nodeId: string, rankIndex: number, layout: WorkflowGraphLayout): number | undefined {
	const rank = layout.ranks[rankIndex];
	if (rank === undefined) return undefined;
	const nodeIndex = rank.findIndex(node => node.id === nodeId);
	if (nodeIndex === -1) return undefined;
	const rankContentWidth = rankWidth(rank.length, layout.nodeWidth);
	const leftOffset = Math.max(0, Math.floor((layout.totalWidth - rankContentWidth) / 2));
	return leftOffset + nodeIndex * (layout.nodeWidth + NODE_GAP_WIDTH) + Math.floor(layout.nodeWidth / 2);
}

function renderWorkflowGraphLoopbacks(edges: WorkflowGraphEdgeView[]): string[] {
	const lines = ["╭─ loopbacks"];
	for (let index = 0; index < edges.length; index += 1) {
		const branch = index === edges.length - 1 ? "╰" : "├";
		const edge = edges[index]!;
		lines.push(`${branch}─ ${edge.from} back to ${formatEdgeTarget(edge)}`);
	}
	return lines;
}

interface ConnectorCell {
	up: boolean;
	down: boolean;
	left: boolean;
	right: boolean;
}

type ConnectorDirection = "up" | "down" | "left" | "right";
type ConnectorGrid = ConnectorCell[][];

function createConnectorGrid(rows: number, width: number): ConnectorGrid {
	return Array.from({ length: rows }, () =>
		Array.from({ length: Math.max(1, width) }, () => ({
			up: false,
			down: false,
			left: false,
			right: false,
		})),
	);
}

function drawConnectorStem(grid: ConnectorGrid, row: number, column: number): void {
	addConnectorDirection(grid, row, column, "up");
	addConnectorDirection(grid, row, column, "down");
}

function drawConnectorBus(grid: ConnectorGrid, row: number, source: number, target: number): void {
	if (source === target) {
		addConnectorDirection(grid, row, source, "up");
		addConnectorDirection(grid, row, source, "down");
		return;
	}
	const left = Math.min(source, target);
	const right = Math.max(source, target);
	for (let column = left + 1; column < right; column += 1) {
		addConnectorDirection(grid, row, column, "left");
		addConnectorDirection(grid, row, column, "right");
	}
	addConnectorDirection(grid, row, source, "up");
	addConnectorDirection(grid, row, source, source < target ? "right" : "left");
	addConnectorDirection(grid, row, target, "down");
	addConnectorDirection(grid, row, target, source < target ? "left" : "right");
}

function drawConnectorLanding(grid: ConnectorGrid, row: number, column: number): void {
	addConnectorDirection(grid, row, column, "up");
	addConnectorDirection(grid, row, column, "down");
}

function addConnectorDirection(grid: ConnectorGrid, row: number, column: number, direction: ConnectorDirection): void {
	const cell = grid[row]?.[column];
	if (cell === undefined) return;
	cell[direction] = true;
}

function connectorRowToString(row: ConnectorCell[]): string {
	return row.map(connectorCellToChar).join("").replace(/\s+$/u, "");
}

function connectorCellToChar(cell: ConnectorCell): string {
	const { up, down, left, right } = cell;
	if (up && down && left && right) return "┼";
	if (up && down && left) return "┤";
	if (up && down && right) return "├";
	if (up && left && right) return "┴";
	if (down && left && right) return "┬";
	if (up && down) return "│";
	if (left && right) return "─";
	if (up && right) return "└";
	if (up && left) return "┘";
	if (down && right) return "┌";
	if (down && left) return "┐";
	if (up || down) return "│";
	if (left || right) return "─";
	return " ";
}

interface WorkflowGraphNodeJoints {
	incoming: boolean;
	outgoing: boolean;
}

function renderWorkflowGraphNode(
	node: WorkflowGraphNodeView,
	width: number,
	joints: WorkflowGraphNodeJoints = { incoming: false, outgoing: false },
): string[] {
	const border = node.focused ? doubleBorder() : singleBorder();
	const innerWidth = width - 2;
	const detail = formatWorkflowNodeDetail(node);
	const lines = [
		`${statusGlyph(node.status)} ${node.id}`,
		node.kind,
		detail ? `${node.status} - ${detail}` : node.status,
	];
	return [
		renderWorkflowGraphBorderLine(
			border.topLeft,
			border.horizontal,
			border.topRight,
			innerWidth,
			joints.incoming ? border.incomingTop : undefined,
		),
		...lines.map(line => `${border.vertical}${padCell(line, innerWidth)}${border.vertical}`),
		renderWorkflowGraphBorderLine(
			border.bottomLeft,
			border.horizontal,
			border.bottomRight,
			innerWidth,
			joints.outgoing ? border.outgoingBottom : undefined,
		),
	];
}

function renderWorkflowGraphBorderLine(
	left: string,
	horizontal: string,
	right: string,
	innerWidth: number,
	joint: string | undefined,
): string {
	if (joint === undefined || innerWidth <= 0) return `${left}${horizontal.repeat(innerWidth)}${right}`;
	const leftWidth = Math.floor(innerWidth / 2);
	const rightWidth = Math.max(0, innerWidth - leftWidth - 1);
	return `${left}${horizontal.repeat(leftWidth)}${joint}${horizontal.repeat(rightWidth)}${right}`;
}

function formatWorkflowNodeDetail(node: WorkflowGraphNodeView): string {
	const parts: string[] = [];
	if (node.summary) parts.push(formatSingleLineWorkflowDetail(node.summary));
	if (node.error) parts.push(`error: ${formatSingleLineWorkflowDetail(node.error)}`);
	if (node.reason) parts.push(`reason: ${formatSingleLineWorkflowDetail(node.reason)}`);
	return parts.join("; ");
}

function formatEdgeTarget(edge: WorkflowGraphEdgeView): string {
	return edge.condition === undefined ? edge.to : `${edge.to} when ${edge.condition}`;
}

function padCell(text: string, width: number): string {
	const clipped = truncateToWidth(text, width, Ellipsis.Ascii);
	return `${clipped}${" ".repeat(Math.max(0, width - visibleWidth(clipped)))}`;
}

function singleBorder(): {
	topLeft: string;
	topRight: string;
	bottomLeft: string;
	bottomRight: string;
	horizontal: string;
	vertical: string;
	incomingTop: string;
	outgoingBottom: string;
} {
	return {
		topLeft: "┌",
		topRight: "┐",
		bottomLeft: "└",
		bottomRight: "┘",
		horizontal: "─",
		vertical: "│",
		incomingTop: "┴",
		outgoingBottom: "┬",
	};
}

function doubleBorder(): {
	topLeft: string;
	topRight: string;
	bottomLeft: string;
	bottomRight: string;
	horizontal: string;
	vertical: string;
	incomingTop: string;
	outgoingBottom: string;
} {
	return {
		topLeft: "╔",
		topRight: "╗",
		bottomLeft: "╚",
		bottomRight: "╝",
		horizontal: "═",
		vertical: "║",
		incomingTop: "╧",
		outgoingBottom: "╤",
	};
}

function statusGlyph(status: WorkflowGraphNodeStatus): string {
	if (status === "completed") return "✓";
	if (status === "checkpointed") return "◆";
	if (status === "frontier") return "◇";
	if (status === "running") return "●";
	if (status === "failed") return "!";
	if (status === "aborted") return "×";
	return "○";
}

function countWorkflowChangeRequests(family: WorkflowRunFamilySnapshot): WorkflowGraphChangeCounts {
	const counts: WorkflowGraphChangeCounts = { approved: 0, proposed: 0, rejected: 0 };
	for (const request of family.changeRequests) {
		counts[request.status] += 1;
	}
	return counts;
}

function buildWorkflowGraphNodeStatuses(
	family: WorkflowRunFamilySnapshot,
	currentAttempt: WorkflowRunAttemptSnapshot | undefined,
	currentCheckpoint: WorkflowCheckpointSnapshot | undefined,
): Map<string, WorkflowGraphNodeStatusRecord> {
	const statuses = new Map<string, WorkflowGraphNodeStatusRecord>();
	const checkpointedActivationIds = new Set(currentCheckpoint?.completedActivationIds ?? []);
	if (currentCheckpoint) {
		for (const activationId of currentCheckpoint.completedActivationIds) {
			const activation = findWorkflowCheckpointActivation(family, currentCheckpoint, activationId);
			if (!activation) continue;
			const nodeId = currentCheckpoint.sourceMapping[activation.nodeId] ?? activation.nodeId;
			statuses.set(nodeId, {
				status: "checkpointed",
				summary: activation.output?.summary,
				error: activation.error,
				reason: activation.reason,
			});
		}
		for (const frontierNodeId of currentCheckpoint.frontierNodeIds) {
			const nodeId = mapWorkflowCheckpointFrontierNode(
				family,
				currentCheckpoint,
				frontierNodeId,
				currentWorkflowFreeze(family),
			);
			if (!statuses.has(nodeId)) statuses.set(nodeId, { status: "frontier" });
		}
	}
	if (currentAttempt) {
		const currentAttemptOwnsCheckpoint = currentAttempt.id === currentCheckpoint?.attemptId;
		for (const activation of currentAttempt.activations) {
			statuses.set(activation.nodeId, {
				status:
					currentAttemptOwnsCheckpoint && checkpointedActivationIds.has(activation.id)
						? "checkpointed"
						: activation.status,
				summary: activation.output?.summary,
				error: activation.error,
				reason: activation.reason,
			});
		}
	}
	return statuses;
}

interface WorkflowGraphNodeStatusRecord {
	status: WorkflowGraphNodeStatus;
	summary?: string;
	error?: string;
	reason?: string;
}

function mapWorkflowCheckpointFrontierNode(
	family: WorkflowRunFamilySnapshot,
	checkpoint: WorkflowCheckpointSnapshot,
	frontierNodeId: string,
	freeze: WorkflowRunFamilySnapshot["freezes"][number] | undefined,
): string {
	for (const mapping of approvedWorkflowCheckpointFrontierMappings(family, checkpoint, freeze?.id)) {
		const mapped = mapping[frontierNodeId];
		if (mapped !== undefined) return mapped;
	}
	for (const mapping of migrationFrontierMappings(freeze?.definition)) {
		const mapped = mapping[frontierNodeId];
		if (mapped !== undefined) return mapped;
	}
	return checkpoint.sourceMapping[frontierNodeId] ?? frontierNodeId;
}

function currentWorkflowFreeze(
	family: WorkflowRunFamilySnapshot,
): WorkflowRunFamilySnapshot["freezes"][number] | undefined {
	const currentAttempt = family.attempts.at(-1);
	return (
		(currentAttempt ? family.freezes.find(freeze => freeze.id === currentAttempt.freezeId) : undefined) ??
		family.freezes.at(-1)
	);
}

function migrationFrontierMappings(
	definition: WorkflowRunFamilySnapshot["freezes"][number]["definition"] | undefined,
): Array<Record<string, string>> {
	return definition?.migrations?.map(migration => migration.frontierMapping) ?? [];
}

function approvedWorkflowCheckpointFrontierMappings(
	family: WorkflowRunFamilySnapshot,
	checkpoint: WorkflowCheckpointSnapshot,
	freezeId: string | undefined,
): Array<Record<string, string>> {
	if (freezeId === undefined) return [];
	return family.changeRequests
		.filter(
			request =>
				request.status === "approved" &&
				(request.checkpointId === undefined || request.checkpointId === checkpoint.id) &&
				(request.attemptId === undefined || request.attemptId === checkpoint.attemptId) &&
				request.applications.some(
					application => application.target === "freeze" && application.freezeId === freezeId,
				),
		)
		.map(request => request.frontierMapping);
}

function findWorkflowCheckpointForAttempt(
	family: WorkflowRunFamilySnapshot,
	attempt: WorkflowRunAttemptSnapshot,
): WorkflowCheckpointSnapshot | undefined {
	if (attempt.checkpointId !== undefined) {
		return family.checkpoints.find(checkpoint => checkpoint.id === attempt.checkpointId);
	}
	return family.checkpoints.filter(checkpoint => checkpoint.attemptId === attempt.id).at(-1);
}

function findWorkflowCheckpointActivation(
	family: WorkflowRunFamilySnapshot,
	checkpoint: WorkflowCheckpointSnapshot,
	activationId: string,
): WorkflowAttemptActivationRecord | undefined {
	return family.attempts
		.find(attempt => attempt.id === checkpoint.attemptId)
		?.activations.find(candidate => candidate.id === activationId);
}

function isFocusedWorkflowGraphNode(status: WorkflowGraphNodeStatus): boolean {
	return status === "running" || status === "frontier" || status === "failed";
}

function formatWorkflowNodeKind(node: WorkflowNode): string {
	if (node.type === "agent") return `agent:${node.agent ?? "default"}`;
	if (node.type === "review") return `review:${node.agent ?? "default"}`;
	if (node.type === "script") return `script:${node.script?.language ?? "js"}`;
	if (node.type === "human") return "human";
	return node.type;
}

function formatCheckpointFrontier(checkpoint: WorkflowGraphCheckpointView): string {
	if (checkpoint.frontier.length === 0) return "none";
	return checkpoint.frontier.map(entry => `${entry.from} to ${entry.to}`).join(", ");
}

function formatLineage(request: WorkflowChangeRequestRecord): WorkflowGraphLineageView {
	const view: WorkflowGraphLineageView = {
		id: request.id,
		status: request.status,
		reason: request.reason,
		applications: request.applications.map(formatWorkflowChangeApplication),
	};
	if (request.approvedBy !== undefined) view.actor = request.approvedBy;
	if (request.rejectedBy !== undefined) view.actor = request.rejectedBy;
	return view;
}

function formatWorkflowChangeApplication(application: WorkflowChangeRequestRecord["applications"][number]): string {
	const targetId = application.freezeId ?? application.draftId;
	return targetId === undefined
		? `${application.target}:${application.actor}`
		: `${application.target}:${targetId}:${application.actor}`;
}

function formatWorkflowGraphActions(
	family: WorkflowRunFamilySnapshot,
	currentAttempt: WorkflowRunAttemptSnapshot | undefined,
	currentCheckpoint: WorkflowCheckpointSnapshot | undefined,
): string[] {
	const actions = [`Refresh: /workflow graph --family-id ${family.id}`];
	if (currentAttempt?.status === "running") {
		actions.push(`Interrupt: /workflow stop ${currentAttempt.id} --deadline-ms 30000`);
	}
	actions.push(`Propose change: /workflow request-change <file> --family-id ${family.id}`);
	const proposed = family.changeRequests.filter(request => request.status === "proposed");
	for (const request of proposed) {
		actions.push(`Approve: /workflow approve-change ${request.id} --actor human`);
		actions.push(`Reject: /workflow reject-change ${request.id} --actor human --reason <reason>`);
	}
	if (currentCheckpoint) {
		actions.push(`Restart: /workflow restart ${currentCheckpoint.id}`);
	}
	return actions;
}

function formatSingleLineWorkflowDetail(value: string): string {
	const compact = value.replace(/\s+/g, " ").trim();
	if (compact.length <= WORKFLOW_DETAIL_PREVIEW_CHARS) return compact;
	return `${compact.slice(0, WORKFLOW_DETAIL_PREVIEW_CHARS - 3)}...`;
}
