import { readFileSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { gzipSync } from "node:zlib";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const assetsDir = join(__dirname, "..", "apps", "web", "dist", "assets");

const thresholds = {
  indexGzipBytes: 85 * 1024,
  terminalPanelGzipBytes: 100 * 1024
};

function findLatestChunk(prefix) {
  const files = readdirSync(assetsDir).filter((file) => file.startsWith(prefix) && file.endsWith(".js"));
  if (files.length === 0) {
    throw new Error(`未找到 ${prefix}*.js`);
  }
  files.sort();
  return files.at(-1);
}

function gzipSizeOf(fileName) {
  const absPath = join(assetsDir, fileName);
  const raw = readFileSync(absPath);
  return gzipSync(raw).byteLength;
}

function formatKiB(bytes) {
  return `${(bytes / 1024).toFixed(2)} KiB`;
}

function check(label, fileName, limitBytes) {
  const size = gzipSizeOf(fileName);
  const pass = size <= limitBytes;
  const status = pass ? "PASS" : "FAIL";
  console.log(`[bundle-size] ${status} ${label}: ${fileName} gzip=${formatKiB(size)} threshold=${formatKiB(limitBytes)}`);
  return pass;
}

let ok = true;

try {
  const indexChunk = findLatestChunk("index-");
  const terminalPanelChunk = findLatestChunk("TerminalPanel-");

  ok = check("index", indexChunk, thresholds.indexGzipBytes) && ok;
  ok = check("TerminalPanel", terminalPanelChunk, thresholds.terminalPanelGzipBytes) && ok;
} catch (error) {
  console.error(`[bundle-size] FAIL ${(error).message}`);
  process.exit(1);
}

if (!ok) {
  process.exit(1);
}
