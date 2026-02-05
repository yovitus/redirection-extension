# Website List Extension

Chrome extension that lets you store and manage a simple list of websites in the popup.

## Highlights

- Simple popup UI for adding/removing websites
- Stores data in `chrome.storage.local`
- Built with TypeScript + esbuild

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
│   │   ├── background.ts  # empty background script (no behavior)
│   │   └── content.ts     # empty content script (no behavior)
│   └── ui/
│       ├── popup.html     # popup markup
│       ├── popup.ts       # popup logic (inputs, storage)
│       ├── overlay-backdrop.html  # unused placeholder
│       ├── overlay-backdrop.ts    # unused placeholder
│       ├── overlay-inject.ts      # unused placeholder
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

`npm run build` runs `scripts/copy-static.js`, which cleans `dist/`, bundles the entry points with esbuild, and copies the manifest, icons, and popup markup into the output directory.

To test locally:

1. Open `chrome://extensions`
2. Enable **Developer mode**
3. Choose **Load unpacked** → select the `dist/` folder
4. Pin the extension and click it to open the website list

## Usage

1. Type a website in the popup and press **Save website**.
2. Remove saved websites anytime from the list.

## Development Notes

- Update popup UI or logic under `src/ui/popup.*`
- Saved website data is stored via `chrome.storage.local` under the `savedSites` key
- When you change anything, re-run `npm run build` and reload the unpacked extension

## License

MIT
