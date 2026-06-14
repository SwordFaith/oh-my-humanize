import type { PlanNode, RunOptions, RunResult } from "./types";

export async function runPlan(plan: PlanNode, options: RunOptions = {}): Promise<RunResult> {
	const counters: Record<string, number> = {};
	const trace = await runNode(plan, options, counters);
	return { trace, counters };
}

async function runNode(node: PlanNode, options: RunOptions, counters: Record<string, number>): Promise<string[]> {
	switch (node.kind) {
		case "task":
			return [node.id];
		case "sequence": {
			const trace: string[] = [];
			for (const child of node.children) {
				trace.push(...(await runNode(child, options, counters)));
			}
			return trace;
		}
		case "parallel": {
			const traces = await Promise.all(node.children.map(child => runNode(child, options, counters)));
			return traces.flat();
		}
		case "branch":
			return runNode(options.flags?.[node.flag] === true ? node.thenBranch : node.elseBranch, options, counters);
		case "loop": {
			const trace: string[] = [];
			let iterations = 0;
			const maxIterations = options.maxIterations ?? 1000;
			counters[node.counter] ??= 0;

			while (counters[node.counter] < node.until) {
				if (iterations >= maxIterations) {
					throw new Error(`loop ${node.id} exceeded maxIterations=${maxIterations}`);
				}
				trace.push(...(await runNode(node.body, options, counters)));
				counters[node.counter] += 1;
				iterations += 1;
			}
			return trace;
		}
		default:
			throw new Error(`unknown plan node kind: ${(node as { kind?: string }).kind ?? "<missing>"}`);
	}
}
