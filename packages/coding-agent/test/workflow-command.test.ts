import { describe, expect, test } from "bun:test";
import { commands, isSubcommand, resolveCliArgv } from "@oh-my-pi/pi-coding-agent/cli-commands";
import { buildHeadlessAgentTaskArgs, resolveWorkflowCommandArgs } from "../src/cli/workflow-cli";

describe("workflow command is registered as a top-level subcommand", () => {
	test("CLI runner routes workflow commands to the workflow command, not launch", () => {
		const entry = commands.find(command => command.name === "workflow");

		expect(entry?.aliases).toContain("flow");
		expect(isSubcommand("workflow")).toBe(true);
		expect(isSubcommand("flow")).toBe(true);
		expect(resolveCliArgv(["workflow", "list"])).toEqual({ argv: ["workflow", "list"] });
		expect(resolveCliArgv(["flow", "start", "humanize-rlcr"])).toEqual({
			argv: ["flow", "start", "humanize-rlcr"],
		});
	});
});

describe("resolveWorkflowCommandArgs", () => {
	test("defaults to listing workflows", () => {
		expect(resolveWorkflowCommandArgs(undefined, [], {})).toEqual({
			action: "list",
			args: [],
			flags: {},
		});
	});

	test("keeps non-interactive start options typed for the runner", () => {
		expect(
			resolveWorkflowCommandArgs("start", ["humanize-rlcr"], {
				json: true,
				"run-id": "run-1",
				"family-id": "family-1",
				start: "planCompliancePrecheck",
				"max-activations": 5,
				"max-node-activations": 3,
				cwd: "/tmp/project",
			}),
		).toEqual({
			action: "start",
			args: ["humanize-rlcr"],
			flags: {
				json: true,
				runId: "run-1",
				familyId: "family-1",
				startNodeId: "planCompliancePrecheck",
				maxActivations: 5,
				maxNodeActivations: 3,
				cwd: "/tmp/project",
			},
		});
	});

	test("delegates headless agent nodes through the launch CLI with model and prompt preserved", () => {
		const args = buildHeadlessAgentTaskArgs("/repo", "Implement the workflow task.", "rust-cat/gpt-5.5");

		expect(args.slice(-7)).toEqual([
			"launch",
			"--cwd",
			"/repo",
			"--model",
			"rust-cat/gpt-5.5",
			"-p",
			"Implement the workflow task.",
		]);
	});
});
