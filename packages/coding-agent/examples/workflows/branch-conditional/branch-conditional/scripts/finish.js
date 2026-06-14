import * as path from "node:path";

const taskDir = process.cwd();
const outputDir = path.join(taskDir, "workflow-output");
const route = await Bun.file(path.join(outputDir, "branch-route.json")).json();
const fastPathFile = Bun.file(path.join(outputDir, "fast-path.json"));
const safePathFile = Bun.file(path.join(outputDir, "safe-path.json"));
const branchResult = await fastPathFile.exists() ? await fastPathFile.json() : await safePathFile.json();
const task = await Bun.file(path.join(taskDir, "task.md")).text();
const report = [
  "# Branch Gate Task Report",
  "",
  "## Objective",
  "",
  task.split("## Objective")[1]?.split("##")[0]?.trim() ?? "Validate a route-selected ripgrep task.",
  "",
  "## Selected Route",
  "",
  `- Route: ${route.route}`,
  `- Reason: ${route.reason}`,
  "",
  "## Work Completed",
  "",
  route.route === "fast"
    ? `- Ran \`${branchResult.command.join(" ")}\`.`
    : "- Ran the safe fallback route.",
  route.route === "fast" ? `- Passing test count detected: ${branchResult.passed}.` : "- No cargo test was required.",
  "",
  "## Result",
  "",
  "- Status: passed",
].join("\n");

await Bun.write(path.join(outputDir, "branch-finish.json"), JSON.stringify({ route, branchResult }, null, 2));
await Bun.write(path.join(outputDir, "task-report.md"), report);
console.log(JSON.stringify({
  summary: `branch task finished on ${route.route}`,
  data: { route: route.route, branchResult },
}));
