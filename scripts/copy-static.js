import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { execFileSync } from "child_process";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, "..");
const dist = path.join(ROOT, "dist");

// Clean and create dist folder
fs.rmSync(dist, { recursive: true, force: true });
fs.mkdirSync(dist, { recursive: true });

// Copy manifest and icons
fs.copyFileSync(path.join(ROOT, "manifest.json"), path.join(dist, "manifest.json"));

fs.cpSync(path.join(ROOT, "src/ui/icons"), path.join(dist, "icons"), {
  recursive: true,
});

// Run esbuild commands (use local binary to avoid network hangs)
const esbuildBin = path.join(
  ROOT,
  "node_modules",
  ".bin",
  process.platform === "win32" ? "esbuild.cmd" : "esbuild"
);

const esbuildCmds = [
  ["src/ui/popup.ts", "--bundle", "--platform=browser", "--outfile=dist/popup.js"],
  ["src/ui/overlay-inject.ts", "--bundle", "--platform=browser", "--outfile=dist/overlay-inject.js"],
  ["src/extension/background.ts", "--bundle", "--platform=browser", "--outfile=dist/background.js"]
];

for (const cmd of esbuildCmds) {
  execFileSync(esbuildBin, cmd, { stdio: "inherit", cwd: ROOT });
}

// Copy popup.html
fs.copyFileSync(path.join(ROOT, "src/ui/popup.html"), path.join(dist, "popup.html"));

console.log("✓ Built to dist/");
