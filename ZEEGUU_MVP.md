# Zeeguu Language Learning Browser Extension - MVP

## Overview
This browser extension provides instant access to Zeeguu language learning platform directly from your browser popup, without requiring the user to visit the website.

## Features

### 1. **Language Selection**
- Browse 12+ supported languages (German, Spanish, French, Dutch, English, Italian, Portuguese, Russian, Japanese, Chinese, Norwegian, Romanian)
- Clean 2-column grid layout with smooth hover effects
- Responsive and fast language loading

### 2. **Learning Tips**
- Each language displays 3 personalized learning tips
- Tips cover beginner-friendly topics like:
  - German: Learn numbers 1-10, practice common verbs, master noun genders
  - Spanish: Learn greetings, practice verb conjugations, study common phrases
  - Japanese: Master Hiragana, learn Katakana, study basic grammar
  - And more...

### 3. **Quick Launch**
- "Start Learning" button opens Zeeguu.org in a new tab
- Pre-fills the language parameter (e.g., `?lang=de` for German)
- Seamless integration with Zeeguu web platform

### 4. **Modern UI**
- Gradient background (#667eea → #764ba2)
- Clean white container with subtle shadows
- Responsive buttons with hover animations
- Loading spinner while fetching languages
- Error handling with user-friendly messages

## Technical Implementation

### Architecture
```
Browser Extension (MVP)
├── Popup UI (popup.html + popup.js)
│   ├── Language Selector View
│   └── Language Detail View (with tips + action button)
├── Background Service Worker (background.ts)
│   ├── fetchZeeguuLanguages() - Calls https://zeeguu.org/available_languages
│   └── fetchLanguageInfo() - Returns local learning tips
└── Manifest Configuration
    └── CSP allows connections to https://zeeguu.org
```

### API Endpoints Used
- **`GET /available_languages`** - Public endpoint (no authentication needed)
  - Returns: Array of language codes (e.g., `["de", "es", "fr", ...]`)
  - Example: `https://zeeguu.org/available_languages`

### Data Flow
1. User clicks extension icon → popup.html loads
2. `loadLanguages()` → sends message to background worker
3. Background worker calls `https://zeeguu.org/available_languages`
4. Zeeguu API returns language codes
5. JavaScript maps codes to full names (e.g., "de" → "German")
6. Popup displays language grid with smooth animations
7. User clicks language → `showLanguageDetail()` displays tips
8. User clicks "Start Learning" → opens `https://zeeguu.org?lang=de`

### Build Process
```bash
npm run build:ts      # Compile TypeScript to JavaScript (esbuild)
npm run build         # Full build: TS + copy files to dist/
```

### File Structure
```
extension/
├── src/extension/background.ts          # Service worker with API calls
├── public/
│   ├── popup.html                       # Popup UI
│   ├── popup.js                         # Popup controller
│   ├── manifest.json                    # Extension configuration
│   └── content.js                       # Content script (minimal)
├── dist/                                # Built extension (ready for Chrome)
└── manifest.json                        # Root manifest copy
```

## MVP Limitations (By Design)

❌ **No user authentication** - Uses only public endpoints
❌ **No personalization** - No tracking user progress or preferences  
❌ **No data persistence** - No saving user selection between sessions
❌ **No article/exercise fetching** - Direct redirect to Zeeguu.org platform

✅ These limitations are intentional for this MVP phase and can be added in v2.

## Future Enhancements (v2.0)

1. **User Authentication**
   - Add login flow in popup
   - Store session token securely
   - Access `/user_articles/recommended` endpoint

2. **Personalized Learning**
   - Show user's current learning language
   - Display recommended articles
   - Track learning streak

3. **In-Popup Learning**
   - Show vocabulary cards
   - Practice exercises within popup
   - Daily lesson integration

4. **Data Persistence**
   - Remember last selected language
   - Save learning preferences
   - Sync with Zeeguu.org account

5. **Content Integration**
   - Highlight words on web pages (like existing browser extension)
   - Fetch definitions from Zeeguu API
   - Quick translation popup

## Permissions Required

```json
{
  "permissions": ["storage", "activeTab", "scripting", "tabs"],
  "host_permissions": ["<all_urls>"],
  "content_security_policy": {
    "extension_pages": "connect-src 'self' https://zeeguu.org"
  }
}
```

- **tabs**: Opens Zeeguu.org in new tab
- **connect-src https://zeeguu.org**: Allows API calls to Zeeguu backend

## Testing the Extension

### Load in Chrome/Opera
1. Open `chrome://extensions` (or equivalent in your browser)
2. Enable "Developer mode"
3. Click "Load unpacked"
4. Select the `dist/` folder from this project
5. Click the extension icon in the toolbar
6. Select a language and click "Start Learning"

### Manual Testing Checklist
- [ ] Popup loads without errors
- [ ] Language list appears (12+ languages)
- [ ] Click language → detail view shows with 3 tips
- [ ] Back button returns to language list
- [ ] "Start Learning" opens zeeguu.org with correct `?lang` parameter
- [ ] Error handling works if API is unreachable

## Zeeguu Platform Integration

This extension connects to the Zeeguu language learning platform:
- **Website**: https://zeeguu.org
- **API Base**: https://zeeguu.org/
- **Repository**: https://github.com/zeeguu/api
- **Main Purpose**: Track learner progress and recommend personalized exercises

For v2.0, we'll integrate deeper with:
- `/user_articles/recommended` - Personalized article recommendations
- `/user_words` - Words currently being studied
- `/available_topics` - Topics for filtering articles
- `/bookmarks_and_words` - Tracked vocabulary

## Next Steps

1. **Test MVP** - Load in Chrome/Opera and verify language fetching
2. **Gather Feedback** - Does language selection work smoothly?
3. **Plan v2.0** - Add user authentication and personalization
4. **Refactor UI** - Consider larger popup for richer content
5. **Deploy** - Submit to Chrome Web Store and Firefox Add-ons

---

**MVP Status**: ✅ Ready for Testing
**Built**: November 5, 2025
**Version**: 0.1.0
