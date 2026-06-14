import { describe, expect, it } from "bun:test";
import { runPlan } from "../src/engine";
import type { PlanNode } from "../src/types";

describe("runPlan", () => {
	it("recursively executes sequence, parallel, branch, and loop nodes", async () => {
		const plan: PlanNode = {
			kind: "sequence",
			id: "root",
			children: [
				{ kind: "task", id: "boot" },
				{
					kind: "parallel",
					id: "fanout",
					children: [
						{ kind: "task", id: "engine" },
						{
							kind: "sequence",
							id: "nested",
							children: [
								{ kind: "task", id: "cli" },
								{ kind: "task", id: "docs" },
							],
						},
					],
				},
				{
					kind: "branch",
					id: "route",
					flag: "release",
					thenBranch: { kind: "task", id: "ship" },
					elseBranch: { kind: "task", id: "hold" },
				},
				{ kind: "loop", id: "stabilize", counter: "round", until: 3, body: { kind: "task", id: "fix" } },
			],
		};

		const result = await runPlan(plan, { flags: { release: true }, maxIterations: 10 });

		expect(result.trace).toEqual(["boot", "engine", "cli", "docs", "ship", "fix", "fix", "fix"]);
		expect(result.counters).toEqual({ round: 3 });
	});

	it("uses the else branch when a flag is absent", async () => {
		const plan: PlanNode = {
			kind: "branch",
			id: "route",
			flag: "release",
			thenBranch: { kind: "task", id: "ship" },
			elseBranch: { kind: "task", id: "hold" },
		};

		const result = await runPlan(plan);

		expect(result.trace).toEqual(["hold"]);
		expect(result.counters).toEqual({});
	});

	it("skips loop bodies that already satisfy their counter target", async () => {
		const plan: PlanNode = {
			kind: "loop",
			id: "noop",
			counter: "round",
			until: 0,
			body: { kind: "task", id: "fix" },
		};

		const result = await runPlan(plan, { maxIterations: 1 });

		expect(result.trace).toEqual([]);
		expect(result.counters).toEqual({ round: 0 });
	});

	it("guards loops that do not converge inside the iteration budget", async () => {
		const plan: PlanNode = {
			kind: "loop",
			id: "too-long",
			counter: "round",
			until: 4,
			body: { kind: "task", id: "fix" },
		};

		await expect(runPlan(plan, { maxIterations: 2 })).rejects.toThrow("loop too-long exceeded maxIterations=2");
	});
});
