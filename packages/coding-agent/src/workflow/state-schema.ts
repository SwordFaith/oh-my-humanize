export type WorkflowStateSchemaValueType = "string" | "number" | "boolean" | "object" | "array" | "null";

export interface WorkflowStateSchema {
	version: 1;
	shape: Record<string, WorkflowStateSchemaValueType>;
}

export class WorkflowStateSchemaError extends Error {
	constructor(message: string) {
		super(message);
		this.name = "WorkflowStateSchemaError";
	}
}

export function parseWorkflowStateSchema(value: unknown, label: string): WorkflowStateSchema {
	const raw = expectRecord(value, label);
	if (raw.version !== 1) {
		throw new WorkflowStateSchemaError(`${label}.version must be 1`);
	}
	const shape = expectRecord(raw.shape, `${label}.shape`);
	const parsedShape: Record<string, WorkflowStateSchemaValueType> = {};
	for (const [field, entry] of Object.entries(shape)) {
		if (field.length === 0) {
			throw new WorkflowStateSchemaError(`${label}.shape cannot declare an empty field name`);
		}
		parsedShape[field] = expectStateSchemaValueType(entry, `${label}.shape.${field}`);
	}
	return { version: 1, shape: parsedShape };
}

export function assertWorkflowStateWriteMatchesSchema(
	pointer: string,
	value: unknown,
	schema: WorkflowStateSchema | undefined,
): void {
	if (schema === undefined) return;
	const segments = parseJsonPointer(pointer);
	const field = segments[0];
	if (field === undefined) return;
	const expected = schema.shape[field];
	if (expected === undefined) {
		throw new WorkflowStateSchemaError(
			`workflow state schema rejects write to "${pointer}": top-level field "${field}" is not declared`,
		);
	}
	if (segments.length > 1) {
		if (expected === "object") return;
		throw new WorkflowStateSchemaError(
			`workflow state schema rejects write to "${pointer}": "/${escapeJsonPointerSegment(field)}" is ${expected} and cannot contain children`,
		);
	}
	const actual = workflowStateValueType(value);
	if (actual === expected) return;
	throw new WorkflowStateSchemaError(
		`workflow state schema rejects write to "${pointer}": expected ${expected}, received ${actual}`,
	);
}

function parseJsonPointer(pointer: string): string[] {
	if (!pointer.startsWith("/")) {
		throw new WorkflowStateSchemaError(`workflow state path must be a JSON pointer: ${pointer}`);
	}
	return pointer
		.slice(1)
		.split("/")
		.map(segment => segment.replaceAll("~1", "/").replaceAll("~0", "~"));
}

function escapeJsonPointerSegment(segment: string): string {
	return segment.replaceAll("~", "~0").replaceAll("/", "~1");
}

function workflowStateValueType(value: unknown): string {
	if (value === null) return "null";
	if (Array.isArray(value)) return "array";
	return typeof value;
}

function expectStateSchemaValueType(value: unknown, label: string): WorkflowStateSchemaValueType {
	if (
		value === "string" ||
		value === "number" ||
		value === "boolean" ||
		value === "object" ||
		value === "array" ||
		value === "null"
	) {
		return value;
	}
	throw new WorkflowStateSchemaError(`${label} must be string, number, boolean, object, array, or null`);
}

function expectRecord(value: unknown, label: string): Record<string, unknown> {
	if (isRecord(value)) return value;
	throw new WorkflowStateSchemaError(`${label} must be an object`);
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}
