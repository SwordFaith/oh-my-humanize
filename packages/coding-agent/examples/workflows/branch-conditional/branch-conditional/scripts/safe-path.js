import * as path from "node:path";

const taskDir = process.cwd();
const outputDir = path.join(taskDir, "workflow-output");
const report = {
  branch: "safe",
  reason: "fallback route does not run ripgrep-specific cargo tests",
};
await Bun.write(path.join(outputDir, "safe-path.json"), JSON.stringify(report, null, 2));
console.log(JSON.stringify({
  summary: "safe branch fallback completed",
  data: { branch: "safe" },
  statePatch: [{ op: "set", path: "/branch/testsPassed", value: 0 }],
}));
