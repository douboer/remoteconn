import { execSync } from "node:child_process";

const targets = ["prototype/liquid-console.js"];

for (const file of targets) {
  execSync(`node --check ${file}`, { stdio: "inherit" });
}

console.log("typecheck passed");
