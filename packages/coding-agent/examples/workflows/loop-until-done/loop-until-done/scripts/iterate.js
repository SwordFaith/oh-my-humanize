import * as path from "node:path";

const taskDir = process.cwd();
const projectRoot = path.resolve(taskDir, "../../..");
const outputDir = path.join(taskDir, "workflow-output");
const probes = [
  { name: "todo-fixme", pattern: "TODO|FIXME" },
  { name: "unwrap", pattern: "unwrap\\(" },
  { name: "expect", pattern: "expect\\(" },
];
const stateFile = Bun.file(path.join(outputDir, "loop-state.json"));
const previous = await stateFile.exists() ? await stateFile.json() : { round: 0, history: [], findings: [] };
const round = previous.round + 1;
const probe = probes[round - 1];
if (!probe) {
  throw new Error(`no loop probe configured for round ${round}`);
}
const command = ["target/debug/rg", "-n", probe.pattern, "crates", "--glob", "*.rs"];
const child = Bun.spawn(command, { cwd: projectRoot, stdout: "pipe", stderr: "pipe" });
const stdout = await new Response(child.stdout).text();
const stderr = await new Response(child.stderr).text();
const exitCode = await child.exited;
if (exitCode !== 0 && exitCode !== 1) {
  await Bun.write(path.join(outputDir, `loop-round-${round}.log`), [`$ ${command.join(" ")}`, stdout, stderr].join("\n"));
  throw new Error(`loop probe ${probe.name} failed with exit code ${exitCode}`);
}
const lineCount = stdout.trim().length === 0 ? 0 : stdout.trim().split(/\r?\n/).length;
const shouldContinue = round < probes.length;
const finding = { round, name: probe.name, pattern: probe.pattern, lineCount };
const history = [...previous.history, { round, shouldContinue, probe: probe.name }];
const findings = [...previous.findings, finding];
const next = { round, history, findings, done: !shouldContinue };

await Bun.write(path.join(outputDir, "loop-state.json"), JSON.stringify(next, null, 2));
await Bun.write(path.join(outputDir, `loop-round-${round}.json`), JSON.stringify(finding, null, 2));
await Bun.write(path.join(outputDir, `loop-round-${round}.log`), [`$ ${command.join(" ")}`, stdout.slice(0, 4000), stderr].join("\n"));
console.log(JSON.stringify({
  summary: `loop round ${round} scanned ${probe.name}: ${lineCount} lines${shouldContinue ? ", continuing" : ", finishing"}`,
  data: { round, continue: shouldContinue, probe: probe.name, lineCount },
  statePatch: [
    { op: "set", path: "/loop/round", value: round },
    { op: "set", path: "/loop/done", value: !shouldContinue }
  ],
}));
