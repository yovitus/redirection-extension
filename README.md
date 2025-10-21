# Chrome Extension with TypeScript

A simple Chrome extension that displays "Jesus is watching you" and fetches the daily Bible verse from BibleGateway.

## Features

- 📖 Fetch today's Bible verse from BibleGateway
- 👀 Clean popup interface
- 🔧 Built with TypeScript
- 🚀 Simple build process

## Project Structure

```
extension/
├── manifest.json           # Chrome extension manifest
├── src/
│   └── extension/
│       ├── background.ts   # Background service worker (TypeScript source)
│       └── content.ts      # Content script (TypeScript source)
├── public/
│   ├── icons/              # Extension icons (16x16, 48x48, 128x128)
│   ├── popup.html          # Popup UI
│   ├── popup.js            # Popup logic
│   ├── background.js       # Generated from background.ts (gitignored)
│   └── content.js          # Generated from content.ts (gitignored)
├── scripts/
│   └── copy-static.sh      # Build script to create dist/
└── dist/                   # Final extension build (gitignored)
```

## Getting Started

### Prerequisites

- Node.js (v18 or higher)
- npm
- Chrome or Chromium-based browser

### Installation

1. Clone the repository:
```bash
git clone <your-repo-url>
cd extension
```

2. Install dependencies:
```bash
npm install
```

3. Build the extension:
```bash
npm run build
```

This will:
- Compile TypeScript files (`src/extension/*.ts`) to JavaScript (`public/*.js`)
- Copy all necessary files to the `dist/` folder

### Loading the Extension in Chrome

1. Open Chrome and navigate to `chrome://extensions/`
2. Enable **Developer mode** (toggle in top-right corner)
3. Click **"Load unpacked"**
4. Select the `dist/` folder from this project
5. The extension should now appear in your toolbar!

### Using the Extension

1. Click the extension icon in your Chrome toolbar
2. You'll see "Jesus is watching you" message
3. Click **"Get Today's Bible Verse"** button
4. The daily Bible verse from BibleGateway will be displayed

## Development

### File Organization

- **Edit TypeScript source files**: `src/extension/background.ts` and `src/extension/content.ts`
- **Edit popup UI**: `public/popup.html` and `public/popup.js`
- **Don't edit**: `public/background.js` and `public/content.js` (these are auto-generated)

### Build Commands

```bash
# Build TypeScript and create dist/
npm run build

# Build TypeScript only (generates public/*.js)
npm run build:ts
```

### Development Workflow

1. Make changes to your source files
2. Run `npm run build`
3. Go to `chrome://extensions/`
4. Click the **reload icon** on your extension
5. Test your changes

## How It Works

### Background Script (`background.ts`)
- Runs as a service worker in the background
- Listens for messages from the popup
- Fetches the Bible verse from BibleGateway when requested
- Handles scraping and parsing of the verse

### Content Script (`content.ts`)
- Injected into web pages matching `<all_urls>`
- Currently logs to console (can be extended for page interaction)

### Popup (`popup.html` + `popup.js`)
- Simple HTML interface with a button
- Sends message to background script when button is clicked
- Displays the fetched verse or error message

## Manifest Permissions

The extension requires:
- `storage` - For future data storage
- `activeTab` - To interact with the current tab
- `scripting` - For content script injection
- `host_permissions: ["<all_urls>"]` - To fetch from BibleGateway

## Customization

### Change the Popup Message
Edit `public/popup.html` - modify the `<h1>` tag

### Modify Bible Verse Fetching
Edit `src/extension/background.ts` - modify the `fetchBibleVerse()` function

### Add New Functionality
1. Edit TypeScript files in `src/extension/`
2. Run `npm run build`
3. Reload extension in Chrome

## Troubleshooting

### Extension won't load
- Make sure you've run `npm run build` first
- Check that `dist/` folder exists and contains files
- Verify manifest.json has no syntax errors

### Bible verse not fetching
- Check browser console for errors (F12 → Console)
- BibleGateway might have changed their HTML structure
- Check background script logs in `chrome://extensions/` → Inspect background page

### Changes not appearing
- Always run `npm run build` after making changes
- Click reload icon on extension in `chrome://extensions/`
- Hard refresh popup (close and reopen)

## Git Workflow

The following files are gitignored (auto-generated):
- `dist/` - Final build output
- `public/background.js` - Generated from TypeScript
- `public/content.js` - Generated from TypeScript

When someone clones your repo, they need to run:
```bash
npm install
npm run build
```

## License

This project is open source and available under the MIT License.
