# Zeeguu Overlay Extension

Chrome extension that opens any URL you type (plus a preset `https://zeeguu.org/exercises` shortcut) inside a centered overlay window. The popup is a minimal launcher; the background worker only orchestrates overlay windows and cleans them up.

## Highlights

- Opens arbitrary URLs in a focused overlay window sized to your preference
- Uses the browser’s own session/cookies (no credentials stored in the extension)
- Built entirely with TypeScript + esbuild (background, popup, overlay helpers)
- Popup remembers a personal list of domains and re-opens the Zeeguu exercises overlay when you land on matching sites
- Injects a lightweight translucent backdrop so the originating tab dims while the overlay popup is active
- Remembers the immediately previous domain per tab, so the overlay stays quiet while you browse multiple pages on the same distraction site and only re-triggers after you leave and come back

## Project Layout

```
extension/
├── manifest.json          # Chrome manifest v3 definition
├── package.json           # npm metadata + build script
├── tsconfig.json          # shared TypeScript compiler options
├── scripts/
│   ├── copy-static.js     # build script (cleans dist, runs esbuild, copies assets)
│   └── copy-static.sh     # optional bash helper used during prototyping
├── src/
│   ├── extension/
│   │   ├── background.ts  # service worker that manages overlay windows
│   │   └── content.ts     # placeholder for future tab-level messaging
│   └── ui/
│       ├── popup.html     # popup markup
│       ├── popup.ts       # popup logic (inputs, presets, messaging)
│       ├── overlay-backdrop.html  # translucent backdrop markup injected per tab
│       ├── overlay-backdrop.ts    # backdrop styling/behavior script
│       ├── overlay-inject.ts      # helper that injects the backdrop bundle
│       └── icons/
│           ├── icon16.png
│           ├── icon48.png
│           └── icon128.png
├── dist/                  # generated output loaded into Chrome (gitignored)
└── node_modules/          # local dependencies (generated)
```

## Build & Load

```bash
npm install
npm run build
```

`npm run build` runs `scripts/copy-static.js`, which cleans `dist/`, bundles the background/content/popup/overlay entry points with esbuild, and copies the manifest, icons, popup markup, and backdrop HTML into the output directory.

To test locally:

1. Open `chrome://extensions`
2. Enable **Developer mode**
3. Choose **Load unpacked** → select the `dist/` folder
4. Pin the extension and click it to open the overlay launcher

## Usage

1. Type or paste any URL (or use a preset button) in the popup; press **Open Overlay** to spawn it immediately.
2. Use **Save Site** to remember the current host. Saved entries show up as quick-launch links inside the popup.
3. When you navigate to any saved domain in a normal tab, the background worker automatically opens the Zeeguu exercises overlay (centered and dimming the source tab with the translucent backdrop) so you can dive straight into practice — it stays silent while you keep hopping between pages on that same domain, and fires again once you detour to a different site and come back.
4. Remove saved domains anytime from the popup list.

## Development Notes

- Update popup UI or logic under `src/ui/popup.*`
- Overlay window orchestration lives in `src/extension/background.ts`
- The translucent page backdrop + injector live in `src/ui/overlay-backdrop.ts` and `src/ui/overlay-inject.ts` (built alongside the main bundle)
- Saved site metadata (used for both popup quick launches and auto-launching Zeeguu exercises) is stored via `chrome.storage.local` under the `savedSites` key
- When you change anything, re-run `npm run build` and reload the unpacked extension

## License

MIT
