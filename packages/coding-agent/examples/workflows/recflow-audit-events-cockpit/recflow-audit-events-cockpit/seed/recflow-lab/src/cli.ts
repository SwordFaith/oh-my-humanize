import { runPlan } from "./engine";
import type { PlanNode } from "./types";

async function main(argv: string[]): Promise<void> {
	const planPath = argv[2];
	if (!planPath) {
		console.error("usage: bun run src/cli.ts <plan.json>");
		process.exit(1);
	}

	let raw: string;
	try {
		raw = await Bun.file(planPath).text();
	} catch (error) {
		throw new Error(
			`failed to read plan file ${planPath}: ${error instanceof Error ? error.message : String(error)}`,
		);
	}

	let plan: PlanNode;
	try {
		plan = JSON.parse(raw) as PlanNode;
	} catch (error) {
		throw new Error(
			`invalid JSON in plan file ${planPath}: ${error instanceof Error ? error.message : String(error)}`,
		);
	}

	const result = await runPlan(plan, { flags: { release: true }, maxIterations: 8 });
	console.log(JSON.stringify({ trace: result.trace, counters: result.counters }));
}

main(process.argv).catch(error => {
	console.error(error instanceof Error ? error.message : String(error));
	process.exit(1);
});
