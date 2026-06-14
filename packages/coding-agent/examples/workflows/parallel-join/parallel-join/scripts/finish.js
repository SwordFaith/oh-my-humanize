import * as path from "node:path";

const taskDir = process.cwd();
const outputDir = path.join(taskDir, "workflow-output");
const collected = await Bun.file(path.join(outputDir, "parallel-collect.json")).json();
await Bun.write(path.join(outputDir, "parallel-finish.json"), JSON.stringify({ completed: true, collected }, null, 2));
console.log(JSON.stringify({
  summary: `parallel join finished with ${collected.total} total lines`,
  data: { total: collected.total },
}));
