#!/usr/bin/env bash
# Build and package extension to dist/
set -e
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

# Clean and create dist
rm -rf "$ROOT/dist"
mkdir -p "$ROOT/dist"

# Copy manifest and icons
cp "$ROOT/manifest.json" "$ROOT/dist/"
cp -R "$ROOT/src/ui/icons" "$ROOT/dist/"

# Compile TypeScript to dist
esbuild "$ROOT/src/extension/background.ts" --bundle --platform=browser --outfile="$ROOT/dist/background.js"
esbuild "$ROOT/src/extension/content.ts" --bundle --platform=browser --outfile="$ROOT/dist/content.js"
esbuild "$ROOT/src/ui/popup.ts" --bundle --platform=browser --outfile="$ROOT/dist/popup.js"

# Copy UI files
cp "$ROOT/src/ui/popup.html" "$ROOT/dist/"

echo "✓ Built to dist/"
