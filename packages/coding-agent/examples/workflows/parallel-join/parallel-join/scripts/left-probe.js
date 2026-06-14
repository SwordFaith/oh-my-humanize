import * as path from "node:path";

const taskDir = process.cwd();
const projectRoot = path.resolve(taskDir, "../../..");
const outputDir = path.join(taskDir, "workflow-output");
const command = ["target/debug/rg", "-n", "struct ", "crates", "--glob", "*.rs"];
const start = performance.now();
const child = Bun.spawn(command, { cwd: projectRoot, stdout: "pipe", stderr: "pipe" });
const stdout = await new Response(child.stdout).text();
const stderr = await new Response(child.stderr).text();
const exitCode = await child.exited;
const elapsedMs = performance.now() - start;
const lineCount = stdout.trim().length === 0 ? 0 : stdout.trim().split(/\r?\n/).length;

await Bun.write(path.join(outputDir, "parallel-left.log"), [`$ ${command.join(" ")}`, stdout.slice(0, 4000), stderr].join("\n"));
await Bun.write(path.join(outputDir, "parallel-left.json"), JSON.stringify({ exitCode, elapsedMs, lineCount }, null, 2));
if (exitCode !== 0) {
  throw new Error(`left probe failed with exit code ${exitCode}`);
}
console.log(JSON.stringify({
  summary: `left probe found ${lineCount} struct lines`,
  data: { side: "left", lineCount, elapsedMs },
}));
