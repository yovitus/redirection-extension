# Zeeguu Overlay Extension

Single-purpose Chrome extension that opens the preset `https://zeeguu.org/exercises` inside a centered overlay window. The popup is a minimal launcher; the background worker only orchestrates overlay windows and cleans them up.

## Highlights

- 🪟 Opens the URL in a focused overlay window sized to your preference
- 🔒 Uses the browser’s own session/cookies (no credentials stored in the extension)
- ⚙️ Built with TypeScript + esbuild, bundled via a single `npm run build`

## Project Layout

```
extension/
├── manifest.json
├── src/
│   ├── extension/
│   │   ├── background.ts   # overlay window management (service worker)
│   │   └── content.ts      # minimal stub (unused at the moment)
│   └── ui/
│       ├── popup.html      # popup UI with the overlay launcher
│       ├── popup.ts        # launcher logic
│       ├── overlay_backdrop.* / overlay_inject.js # helper assets for overlays
│       └── utils/…         # (currently empty after cleanup)
├── scripts/copy-static.js  # build helper (bundles & copies to dist/)
├── package.json
└── dist/                   # output folder (gitignored)
```

## Build & Load

```bash
npm install
npm run build
```

`npm run build` bundles the background, content, and popup TypeScript entry points with esbuild and copies static files into `dist/`.

To test locally:

1. Open `chrome://extensions`
2. Enable **Developer mode**
3. Choose **Load unpacked** → select the `dist/` folder
4. Pin the extension and click it to open the overlay launcher

## Usage

1. Type or paste any URL (or use a preset button)
2. Press **Open Overlay**
3. A separate popup window appears, centered over the current Chrome window; a translucent backdrop briefly covers the originating tab until the overlay is closed.

## Development Notes

- Update popup UI or logic under `src/ui/popup.*`
- All overlay logic lives in `src/extension/background.ts`
- When you change anything, re-run `npm run build` and reload the unpacked extension

## License

MIT
