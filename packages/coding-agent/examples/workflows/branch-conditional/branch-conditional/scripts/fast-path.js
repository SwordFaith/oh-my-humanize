import * as path from "node:path";

const taskDir = process.cwd();
const projectRoot = path.resolve(taskDir, "../../..");
const outputDir = path.join(taskDir, "workflow-output");
const command = ["cargo", "test", "-p", "grep-searcher", "--lib"];
const child = Bun.spawn(command, { cwd: projectRoot, stdout: "pipe", stderr: "pipe" });
const stdout = await new Response(child.stdout).text();
const stderr = await new Response(child.stderr).text();
const exitCode = await child.exited;

await Bun.write(path.join(outputDir, "fast-path.log"), [`$ ${command.join(" ")}`, stdout, stderr].join("\n"));
if (exitCode !== 0) {
  throw new Error(`fast branch cargo validation failed with exit code ${exitCode}`);
}

const combined = `${stdout}\n${stderr}`;
const passed = Number(/test result: ok\. (\d+) passed/.exec(combined)?.[1] ?? 0);
const report = {
  branch: "fast",
  command,
  exitCode,
  passed,
};
await Bun.write(path.join(outputDir, "fast-path.json"), JSON.stringify(report, null, 2));
console.log(JSON.stringify({
  summary: `fast branch cargo validation passed with ${passed} tests`,
  data: { branch: "fast", passed },
  statePatch: [{ op: "set", path: "/branch/testsPassed", value: passed }],
}));
