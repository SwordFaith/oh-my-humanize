import * as path from "node:path";

const taskDir = process.cwd();
const projectRoot = path.resolve(taskDir, "../../..");
const outputDir = path.join(taskDir, "workflow-output");
const cargoToml = await Bun.file(path.join(projectRoot, "Cargo.toml")).text();
const route = cargoToml.includes("ripgrep") ? "fast" : "safe";
const report = {
  projectRoot,
  route,
  reason: route === "fast" ? "ripgrep workspace detected" : "fallback route",
};

await Bun.write(path.join(outputDir, "branch-route.json"), JSON.stringify(report, null, 2));
console.log(JSON.stringify({
  summary: `selected ${route} branch`,
  data: { route },
  statePatch: [{ op: "set", path: "/branch/route", value: route }],
}));
