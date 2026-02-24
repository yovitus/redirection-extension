import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { build } from "esbuild";

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

// Build with esbuild API (cross-platform)
const buildTargets = [
  { entry: "src/ui/popup.ts", outfile: "dist/popup.js", platform: "browser" },
  { entry: "src/ui/experiment.ts", outfile: "dist/experiment.js", platform: "browser" },
  { entry: "src/ui/overlay-inject.ts", outfile: "dist/overlay-inject.js", platform: "browser" },
  { entry: "src/extension/background.ts", outfile: "dist/background.js", platform: "browser" },
  { entry: "src/extension/dblogger.ts", outfile: "dist/dblogger.js", platform: "browser" },
  { entry: "src/extension/experiment-manager.ts", outfile: "dist/experiment-manager.js", platform: "browser" },

];

async function runBuilds() {
  for (const t of buildTargets) {
    await build({
      entryPoints: [path.join(ROOT, t.entry)],
      bundle: true,
      platform: t.platform,
      outfile: path.join(ROOT, t.outfile),
    });
  }
}

(async function main() {
  try {
    await runBuilds();

    // Copy popup.html
    fs.copyFileSync(path.join(ROOT, "src/ui/popup.html"), path.join(dist, "popup.html"));
    fs.copyFileSync(path.join(ROOT, "src/ui/experiment.html"), path.join(dist, "experiment.html"));

    console.log("✓ Built to dist/");
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
})();
