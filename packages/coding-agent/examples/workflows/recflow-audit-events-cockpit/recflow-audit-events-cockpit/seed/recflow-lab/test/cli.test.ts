import { describe, expect, it } from "bun:test";
import { mkdtemp, writeFile } from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";

describe("CLI", () => {
	it("prints recursive runner results as stable JSON", async () => {
		const dir = await mkdtemp(path.join(os.tmpdir(), "recflow-lab-"));
		const planPath = path.join(dir, "plan.json");
		await writeFile(
			planPath,
			JSON.stringify({
				kind: "sequence",
				id: "root",
				children: [
					{ kind: "task", id: "start" },
					{
						kind: "branch",
						id: "route",
						flag: "release",
						thenBranch: { kind: "task", id: "ship" },
						elseBranch: { kind: "task", id: "hold" },
					},
				],
			}),
		);

		const proc = Bun.spawn([process.execPath, "run", "src/cli.ts", planPath], {
			cwd: path.resolve(import.meta.dir, ".."),
			stdout: "pipe",
			stderr: "pipe",
		});
		const [stdout, stderr, exitCode] = await Promise.all([
			new Response(proc.stdout).text(),
			new Response(proc.stderr).text(),
			proc.exited,
		]);

		expect(exitCode).toBe(0);
		expect(stderr.trim()).toBe("");
		expect(JSON.parse(stdout)).toEqual({ trace: ["start", "ship"], counters: {} });
	});

	it("prints usage and exits non-zero when no plan path is provided", async () => {
		const proc = Bun.spawn([process.execPath, "run", "src/cli.ts"], {
			cwd: path.resolve(import.meta.dir, ".."),
			stdout: "pipe",
			stderr: "pipe",
		});
		const [stdout, stderr, exitCode] = await Promise.all([
			new Response(proc.stdout).text(),
			new Response(proc.stderr).text(),
			proc.exited,
		]);

		expect(exitCode).toBe(1);
		expect(stdout.trim()).toBe("");
		expect(stderr.trim()).toBe("usage: bun run src/cli.ts <plan.json>");
	});

	it("reports invalid plan JSON without stdout", async () => {
		const dir = await mkdtemp(path.join(os.tmpdir(), "recflow-lab-"));
		const planPath = path.join(dir, "bad-plan.json");
		await writeFile(planPath, "{not-json");

		const proc = Bun.spawn([process.execPath, "run", "src/cli.ts", planPath], {
			cwd: path.resolve(import.meta.dir, ".."),
			stdout: "pipe",
			stderr: "pipe",
		});
		const [stdout, stderr, exitCode] = await Promise.all([
			new Response(proc.stdout).text(),
			new Response(proc.stderr).text(),
			proc.exited,
		]);

		expect(exitCode).toBe(1);
		expect(stdout.trim()).toBe("");
		expect(stderr).toContain(`invalid JSON in plan file ${planPath}:`);
	});
});
