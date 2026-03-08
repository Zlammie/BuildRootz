/* eslint-disable @typescript-eslint/no-require-imports */
const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const targets = [".next", ".turbo"];

for (const target of targets) {
  const fullPath = path.join(root, target);
  if (!fs.existsSync(fullPath)) continue;
  fs.rmSync(fullPath, { recursive: true, force: true });
  console.log(`[cache] removed ${target}`);
}
