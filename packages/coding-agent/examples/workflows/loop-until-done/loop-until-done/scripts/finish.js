import * as path from "node:path";

const taskDir = process.cwd();
const outputDir = path.join(taskDir, "workflow-output");
const state = await Bun.file(path.join(outputDir, "loop-state.json")).json();
const task = await Bun.file(path.join(taskDir, "task.md")).text();
const findingLines = state.findings.map(
  finding => `- Round ${finding.round} \`${finding.name}\`: ${finding.lineCount} matching lines.`,
);
const report = [
  "# Loop Gate Task Report",
  "",
  "## Objective",
  "",
  task.split("## Objective")[1]?.split("##")[0]?.trim() ?? "Run an iterative maintenance audit.",
  "",
  "## Iterations",
  "",
  ...findingLines,
  "",
  "## Result",
  "",
  `- Status: passed`,
  `- Completed rounds: ${state.round}`,
  `- Done: ${state.done}`,
].join("\n");
await Bun.write(path.join(outputDir, "loop-finish.json"), JSON.stringify({ completed: true, state }, null, 2));
await Bun.write(path.join(outputDir, "task-report.md"), report);
console.log(JSON.stringify({
  summary: `maintenance loop finished after ${state.round} rounds`,
  data: { rounds: state.round, done: state.done },
}));
