import * as path from "node:path";

const taskDir = process.cwd();
const outputDir = path.join(taskDir, "workflow-output");
const left = await Bun.file(path.join(outputDir, "parallel-left.json")).json();
const right = await Bun.file(path.join(outputDir, "parallel-right.json")).json();
const total = left.lineCount + right.lineCount;
const task = await Bun.file(path.join(taskDir, "task.md")).text();
const report = [
  "# Parallel Gate Task Report",
  "",
  "## Objective",
  "",
  task.split("## Objective")[1]?.split("##")[0]?.trim() ?? "Run a two-branch source shape audit.",
  "",
  "## Branch Results",
  "",
  `- Left probe: ${left.lineCount} \`struct\` lines in ${left.elapsedMs.toFixed(2)} ms.`,
  `- Right probe: ${right.lineCount} \`enum\` lines in ${right.elapsedMs.toFixed(2)} ms.`,
  `- Combined type-shape references: ${total}.`,
  "",
  "## Result",
  "",
  "- Status: passed",
  "- Join node consumed both branch artifacts before producing this report.",
].join("\n");

await Bun.write(path.join(outputDir, "parallel-collect.json"), JSON.stringify({ left, right, total }, null, 2));
await Bun.write(path.join(outputDir, "task-report.md"), report);
console.log(JSON.stringify({
  summary: `join collected ${total} total lines`,
  data: { total, left: left.lineCount, right: right.lineCount },
  statePatch: [{ op: "set", path: "/parallel/totalLines", value: total }],
}));
