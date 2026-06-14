export type PlanNode =
	| { kind: "task"; id: string }
	| { kind: "sequence"; id: string; children: PlanNode[] }
	| { kind: "parallel"; id: string; children: PlanNode[] }
	| { kind: "branch"; id: string; flag: string; thenBranch: PlanNode; elseBranch: PlanNode }
	| { kind: "loop"; id: string; counter: string; until: number; body: PlanNode };

export interface RunOptions {
	flags?: Record<string, boolean>;
	maxIterations?: number;
}

export interface RunResult {
	trace: string[];
	counters: Record<string, number>;
}
