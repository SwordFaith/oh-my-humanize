import * as path from "node:path";

const taskDir = process.cwd();
const outputDir = path.join(taskDir, "workflow-output");
await Bun.write(path.join(outputDir, "parallel-start.json"), JSON.stringify({ startedAt: Date.now() }, null, 2));
console.log(JSON.stringify({
  summary: "parallel fan-out ready",
  data: { ready: true },
  statePatch: [{ op: "set", path: "/parallel/ready", value: true }],
}));
