import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { execSync } from "child_process";

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

// Run esbuild commands
const esbuildCmds = [
  `npx esbuild src/extension/background.ts --bundle --platform=browser --outfile=dist/background.js`,
  `npx esbuild src/extension/content.ts --bundle --platform=browser --outfile=dist/content.js`,
  `npx esbuild src/ui/popup.ts --bundle --platform=browser --outfile=dist/popup.js`
];

for (const cmd of esbuildCmds) {
  execSync(cmd, { stdio: "inherit", cwd: ROOT });
}

// Copy popup.html
fs.copyFileSync(path.join(ROOT, "src/ui/popup.html"), path.join(dist, "popup.html"));

// Copy overlay backdrop files (used to grey out the originating browser window)
fs.copyFileSync(path.join(ROOT, "src/ui/overlay_backdrop.html"), path.join(dist, "overlay_backdrop.html"));
fs.copyFileSync(path.join(ROOT, "src/ui/overlay_backdrop.js"), path.join(dist, "overlay_backdrop.js"));
// Copy overlay injection script (used to grey out the originating tab)
fs.copyFileSync(path.join(ROOT, "src/ui/overlay_inject.js"), path.join(dist, "overlay_inject.js"));

console.log("✓ Built to dist/");
