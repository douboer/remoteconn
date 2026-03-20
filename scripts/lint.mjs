import { readFileSync } from "node:fs";

const files = [
  "prototype/liquid-console.html",
  "prototype/liquid-console.css",
  "prototype/liquid-console.js",
  "prototype/README.md"
];

let failed = false;

for (const file of files) {
  const content = readFileSync(file, "utf8");
  const lines = content.split("\n");

  lines.forEach((line, idx) => {
    if (/\s+$/.test(line)) {
      console.error(`${file}:${idx + 1} 存在行尾空格`);
      failed = true;
    }

    if (/\t/.test(line)) {
      console.error(`${file}:${idx + 1} 存在 tab，请改为空格`);
      failed = true;
    }
  });
}

if (failed) {
  process.exit(1);
}

console.log("lint passed");
