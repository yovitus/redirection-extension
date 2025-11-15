/**
 * background.ts - Service Worker (Backend)
 * 
 * Role: The backend orchestrator of the extension
 * Responsibilities:
 * - Listens for messages from popup/content (runtime.onMessage)
 * - Handles all network requests: fetches languages, articles, login, session management
 * - Stores session in chrome.storage.local
 * - Returns demo articles when no session exists
 * 
 * Flow: popup.ts sends messages → background.ts processes → sends response back
 */

self.addEventListener('install', () => {
  console.log('Service worker installed');
});

self.addEventListener('activate', () => {
  console.log('Service worker activated');
});

(self as any).chrome.runtime.onMessage.addListener((request: any, sender: any, sendResponse: any) => {
  if (request.action === 'fetchLanguages') {
    fetchZeeguuLanguages()
      .then(data => sendResponse(data))
      .catch(error => sendResponse({ 
        success: false, 
        error: error.message 
      }));
    return true; 
  }
  if (request.action === 'fetchLanguageInfo') {
    fetchLanguageInfo(request.languageCode)
      .then(data => sendResponse(data))
      .catch(error => sendResponse({ 
        success: false, 
        error: error.message 
      }));
    return true; 
  }
  if (request.action === 'login') {
    authenticateUser(request.email, request.password)
      .then(data => sendResponse(data))
      .catch(error => sendResponse({ 
        success: false, 
        error: error.message 
      }));
    return true;
  }
  if (request.action === 'getSession') {
    getStoredSession()
      .then(data => sendResponse(data))
      .catch(error => sendResponse({ 
        success: false, 
        error: error.message 
      }));
    return true;
  }
  if (request.action === 'getUserLanguages') {
    getUserLanguages(request.session)
      .then(data => sendResponse(data))
      .catch(error => sendResponse({ 
        success: false, 
        error: error.message 
      }));
    return true;
  }
  if (request.action === 'fetchArticles') {
    fetchRecommendedArticles(request.session, request.language)
      .then(data => sendResponse(data))
      .catch(error => sendResponse({ 
        success: false, 
        error: error.message 
      }));
    return true;
  }
  if (request.action === 'log out') {
    clearSession()
      .then(data => sendResponse(data))
      .catch(error => sendResponse({ 
        success: false, 
        error: error.message 
      }));
    return true;
  }
  // Open a lightweight overlay popup window using the browser's session
  if (request.action === 'openOverlay') {
    try {
      const url = request.url;
      const width = request.width || 900;
      const height = request.height || 700;

      openOverlayWindow(url, width, height)
        .then(win => sendResponse({ success: true, windowId: win && (win as any).id }))
        .catch((err: any) => sendResponse({ success: false, error: err && err.message ? err.message : String(err) }));

      return true; // keep sendResponse async
    } catch (err: any) {
      sendResponse({ success: false, error: err && err.message ? err.message : String(err) });
      return false;
    }
  }
  // Request from injected tab to close the overlay popup
  if (request.action === 'closeOverlayFromTab') {
    try {
      const chromeApi = (self as any).chrome;
      const tabId = sender && sender.tab && sender.tab.id;
      if (typeof tabId !== 'number') return sendResponse({ success: false, error: 'No tabId' });

      // find popup window id mapped to this tab
      let foundPopupId: number | null = null;
      for (const [popupId, mappedTabId] of overlayToTab.entries()) {
        if (mappedTabId === tabId) { foundPopupId = popupId; break; }
      }

      if (foundPopupId) {
        try { chromeApi.windows.remove(foundPopupId); } catch (e) {}
        // explicitly notify the tab to remove the injected overlay (in case onRemoved cleanup doesn't run yet)
        try { chromeApi.tabs.sendMessage(tabId, { action: 'removeOverlay' }, () => {}); } catch (e) {}
        // cleanup mapping
        overlayToTab.delete(foundPopupId);
      }

      sendResponse({ success: true });
    } catch (e: any) {
      sendResponse({ success: false, error: e && e.message ? e.message : String(e) });
    }
    return true;
  }
});

async function fetchZeeguuLanguages(): Promise<{ success: boolean; languages?: any; error?: string }> {
  try {
    // List of API endpoints to try in order
    const endpoints = [
      'https://zeeguu.org/system_languages',
      'https://api.zeeguu.org/system_languages',
      'https://zeeguu.unibe.ch/system_languages',
      'https://api.zeeguu.unibe.ch/system_languages',
    ];

    let lastError: Error | null = null;

    for (const endpoint of endpoints) {
      try {
        console.log(`Attempting to fetch from: ${endpoint}`);
        const sysResponse = await fetch(endpoint, {
          method: 'GET',
          headers: {
            'Accept': 'application/json',
          },
        });

        if (sysResponse.ok) {
          const text = await sysResponse.text();
          let sysData;
          
          try {
            sysData = JSON.parse(text);
          } catch {
            console.warn(`Failed to parse JSON from ${endpoint}, skipping`);
            lastError = new Error(`Invalid JSON from ${endpoint}`);
            continue;
          }

          if (sysData.learnable_languages && Array.isArray(sysData.learnable_languages)) {
            console.log(`Successfully fetched from ${endpoint}`);
            return {
              success: true,
              languages: sysData.learnable_languages,
            };
          }
        }
      } catch (e) {
        console.log(`Endpoint ${endpoint} failed:`, e);
        lastError = e instanceof Error ? e : new Error(String(e));
        continue;
      }
    }

    // If all endpoints failed, use fallback
    console.error('All API endpoints failed, using fallback languages');
    const fallbackLanguages = [
      { code: 'de', name: 'German' },
      { code: 'es', name: 'Spanish' },
      { code: 'fr', name: 'French' },
      { code: 'nl', name: 'Dutch' },
      { code: 'en', name: 'English' },
      { code: 'it', name: 'Italian' },
      { code: 'pt', name: 'Portuguese' },
      { code: 'ru', name: 'Russian' },
      { code: 'ja', name: 'Japanese' },
      { code: 'pl', name: 'Polish' },
      { code: 'sv', name: 'Swedish' },
      { code: 'da', name: 'Danish' },
      { code: 'no', name: 'Norwegian' },
      { code: 'hu', name: 'Hungarian' },
      { code: 'ro', name: 'Romanian' },
      { code: 'uk', name: 'Ukrainian' },
      { code: 'el', name: 'Greek' },
    ];

    return {
      success: true,
      languages: fallbackLanguages,
    };
  } catch (error) {
    console.error('Error in fetchZeeguuLanguages:', error);
    
    // Return fallback languages when any error occurs
    const fallbackLanguages = [
      { code: 'de', name: 'German' },
      { code: 'es', name: 'Spanish' },
      { code: 'fr', name: 'French' },
      { code: 'nl', name: 'Dutch' },
      { code: 'en', name: 'English' },
      { code: 'it', name: 'Italian' },
      { code: 'pt', name: 'Portuguese' },
      { code: 'ru', name: 'Russian' },
      { code: 'ja', name: 'Japanese' },
      { code: 'pl', name: 'Polish' },
      { code: 'sv', name: 'Swedish' },
      { code: 'da', name: 'Danish' },
      { code: 'no', name: 'Norwegian' },
      { code: 'hu', name: 'Hungarian' },
      { code: 'ro', name: 'Romanian' },
      { code: 'uk', name: 'Ukrainian' },
      { code: 'el', name: 'Greek' },
    ];

    return {
      success: true,
      languages: fallbackLanguages,
    };
  }
}

async function openOverlayWindow(url: string, width: number, height: number): Promise<any> {
  return new Promise((resolve, reject) => {
    try {
      // Ensure url is a string
      if (!url || typeof url !== 'string') return reject(new Error('Invalid URL'));

      const chromeApi = (self as any).chrome;

      // Get current window to center overlay on top of it
      chromeApi.windows.getCurrent({ populate: false }, (currentWin: any) => {
            try {
              const cw = currentWin && typeof currentWin.width === 'number' ? currentWin.width : 1200;
              const ch = currentWin && typeof currentWin.height === 'number' ? currentWin.height : 800;
              const cleft = typeof currentWin.left === 'number' ? currentWin.left : 0;
              const ctop = typeof currentWin.top === 'number' ? currentWin.top : 0;

              const left = cleft + Math.max(0, Math.round((cw - width) / 2));
              const top = ctop + Math.max(0, Math.round((ch - height) / 2));

              // Try to inject a grey overlay into the active tab of the current window
              chromeApi.tabs.query({ active: true, windowId: currentWin.id }, (tabs: any[]) => {
                const activeTab = (tabs && tabs[0]) || null;
                const tabId = activeTab && typeof activeTab.id === 'number' ? activeTab.id : null;

                const injectAndCreate = () => {
                  // Create the content popup on top, centered relative to current window
                  chromeApi.windows.create({
                    url,
                    type: 'popup',
                    width,
                    height,
                    left,
                    top,
                    focused: true
                  }, (createdWin: any) => {
                    if (chromeApi.runtime.lastError) {
                      return reject(new Error(chromeApi.runtime.lastError.message));
                    }
                    // If we injected into a tab, track mapping so we can remove overlay later
                    try {
                      if (createdWin && createdWin.id && tabId !== null) {
                        overlayToTab.set(createdWin.id, tabId);
                      }
                    } catch (e) {}
                    resolve(createdWin);
                  });
                };

                if (tabId !== null) {
                  // inject helper file that adds a full-page semi-transparent div
                  try {
                    chromeApi.scripting.executeScript({ target: { tabId }, files: ['overlay_inject.js'] }, () => {
                      // ignore injection errors, still create popup
                      injectAndCreate();
                    });
                  } catch (e) {
                    injectAndCreate();
                  }
                } else {
                  injectAndCreate();
                }
              });
            } catch (e) {
              reject(e);
            }
      });
    } catch (e) {
      reject(e);
    }
  });
}

// Map popup window id -> originating tab id (we inject an overlay into that tab)
const overlayToTab: Map<number, number> = new Map();

// When a popup window is removed, tell the originating tab to remove the injected overlay
(self as any).chrome.windows.onRemoved.addListener((windowId: number) => {
  try {
    const chromeApi = (self as any).chrome;
    if (overlayToTab.has(windowId)) {
      const tabId = overlayToTab.get(windowId)!;
      overlayToTab.delete(windowId);
      try {
        chromeApi.tabs.sendMessage(tabId, { action: 'removeOverlay' }, () => {});
      } catch (e) {}
    }
  } catch (e) {
    console.warn('onRemoved cleanup error', e);
  }
});

async function fetchLanguageInfo(languageCode: string): Promise<{ success: boolean; info?: string; tips?: string[]; error?: string }> {
  try {
    const tips: Record<string, string[]> = {
      'de': ['Learn numbers 1-10', 'Practice common verbs', 'Master gender of nouns'],
      'es': ['Learn greetings', 'Practice verb conjugations', 'Study common phrases'],
      'fr': ['Focus on pronunciation', 'Learn verb tenses', 'Practice listening'],
      'nl': ['Master noun genders', 'Learn common words', 'Practice speaking'],
      'en': ['Expand vocabulary', 'Practice pronunciation', 'Study grammar basics'],
      'it': ['Learn verb forms', 'Practice pronunciation', 'Study common phrases'],
      'pt': ['Learn verb conjugations', 'Practice listening', 'Study grammar'],
      'ru': ['Master Cyrillic alphabet', 'Learn cases', 'Practice pronunciation'],
      'ja': ['Master Hiragana', 'Learn Katakana', 'Study basic grammar'],
      'zh': ['Learn Pinyin', 'Master tone marks', 'Study radicals'],
      'no': ['Learn basic grammar', 'Practice pronunciation', 'Study verb forms'],
      'ro': ['Learn verb tenses', 'Practice listening', 'Study common words'],
    };

    const languageNames: Record<string, string> = {
      'de': 'German',
      'es': 'Spanish',
      'fr': 'French',
      'nl': 'Dutch',
      'en': 'English',
      'it': 'Italian',
      'pt': 'Portuguese',
      'ru': 'Russian',
      'ja': 'Japanese',
      'zh': 'Chinese',
      'no': 'Norwegian',
      'ro': 'Romanian',
    };

    return {
      success: true,
      info: `Learning ${languageNames[languageCode] || languageCode}`,
      tips: tips[languageCode] || ['Keep practicing!', 'Stay consistent', 'Have fun learning!'],
    };
  } catch (error) {
    console.error('Error fetching language info:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

// Authentication & Session Management
async function authenticateUser(email: string, password: string): Promise<{ success: boolean; session?: string; error?: string }> {
  try {
    // Validate inputs
    if (!email || !password) {
      return {
        success: false,
        error: 'Email and password are required',
      };
    }

    // Try fastest/most reliable endpoints first
    const domains = [
      'https://api.zeeguu.org',       // Primary (fastest & reliable)
      'https://zeeguu.org',           // Secondary
      'https://api.zeeguu.unibe.ch',  // Fallback 1 (often times out)
      'https://zeeguu.unibe.ch',      // Fallback 2 (often times out)
    ];

    for (const domain of domains) {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 8000);

        const response = await fetch(`${domain}/session/${email}`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            'Accept': 'application/json',
          },
          body: `password=${encodeURIComponent(password)}`,
          signal: controller.signal,
        });

        clearTimeout(timeoutId);

        if (response.ok) {
          const text = await response.text();
          let sessionId = text.trim();
          
          if (sessionId.startsWith('{')) {
            try {
              const json = JSON.parse(sessionId);
              sessionId = json.session || '';
            } catch {
              continue;
            }
          } else {
            sessionId = sessionId.replace(/[\"']/g, '');
          }
          
          if (!sessionId) {
            continue;
          }
          
          await new Promise<void>((resolve) => {
            (self as any).chrome.storage.local.set({
              zeeguu_session: sessionId,
              zeeguu_email: email,
              zeeguu_domain: domain,
              zeeguu_login_time: new Date().toISOString(),
            }, () => {
              resolve();
            });
          });

          return {
            success: true,
            session: sessionId,
          };
        } else if (response.status === 401 || response.status === 403) {
          return {
            success: false,
            error: 'Invalid email or password. Please check your credentials.',
          };
        }
      } catch (e: any) {
        continue;
      }
    }

    return {
      success: false,
      error: 'Invalid email or password. Please check your credentials.',
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Authentication failed',
    };
  }
}

async function getStoredSession(): Promise<{ success: boolean; session?: string; email?: string; domain?: string; error?: string }> {
  return new Promise((resolve) => {
    (self as any).chrome.storage.local.get(
      ['zeeguu_session', 'zeeguu_email', 'zeeguu_domain'],
      (items: any) => {
        if (items.zeeguu_session) {
          resolve({
            success: true,
            session: items.zeeguu_session,
            email: items.zeeguu_email,
            domain: items.zeeguu_domain,
          });
        } else {
          resolve({
            success: false,
            error: 'No session found',
          });
        }
      }
    );
  });
}

async function getUserLanguages(session: string): Promise<{ success: boolean; languages?: any[]; error?: string }> {
  try {
    if (!session) {
      return {
        success: false,
        error: 'No session provided',
      };
    }

    const sessionData = await getStoredSession();
    if (!sessionData.success || !sessionData.domain) {
      return {
        success: false,
        error: 'No valid session',
      };
    }

    const domain = sessionData.domain;
    const response = await fetch(`${domain}/user_languages?session=${session}`, {
      method: 'GET',
      headers: {
        'Accept': 'application/json',
      },
    });

    if (response.ok) {
      const data = await response.json();
      let languages = Array.isArray(data) ? data : data.languages || [];
      
      if (languages.length === 0) {
        return {
          success: true,
          languages: [{ code: 'de', name: 'German' }],
        };
      }

      return {
        success: true,
        languages: languages,
      };
    } else {
      throw new Error(`Failed to fetch user languages. Status: ${response.status}`);
    }
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to fetch user languages',
    };
  }
}

async function clearSession(): Promise<{ success: boolean }> {
  return new Promise((resolve) => {
    (self as any).chrome.storage.local.remove(
      ['zeeguu_session', 'zeeguu_email', 'zeeguu_domain'],
      () => {
        console.log('Session cleared');
        resolve({ success: true });
      }
    );
  });
}

async function fetchRecommendedArticles(session: string, language?: string): Promise<{ success: boolean; articles?: any; error?: string }> {
  try {
    // If no session (demo mode), return demo articles
    if (!session) {
      const demoArticles = getDemoArticles(language);
      return {
        success: true,
        articles: demoArticles,
      };
    }

    const sessionData = await getStoredSession();
    if (!sessionData.success || !sessionData.domain) {
      return {
        success: false,
        error: 'No valid session',
      };
    }

    const domain = sessionData.domain;
    console.log(`Fetching articles from ${domain}`);

    const response = await fetch(`${domain}/user_articles/recommended?session=${session}`, {
      method: 'GET',
      headers: {
        'Accept': 'application/json',
      },
    });

    if (response.ok) {
      const articles = await response.json();
      console.log(`Fetched ${articles.length} recommended articles`);
      return {
        success: true,
        articles: articles.slice(0, 5), // Return top 5 articles
      };
    } else {
      throw new Error(`Failed to fetch articles. Status: ${response.status}`);
    }
  } catch (error) {
    console.error('Error fetching articles:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to fetch articles',
    };
  }
}

function getDemoArticles(language?: string): any[] {
  const demoArticlesByLanguage: Record<string, any[]> = {
    'de': [
      { title: 'Die Vorteile des Lesens', source: 'Deutsch Lernen', cefr_level: 'A2', url: 'https://zeeguu.org' },
      { title: 'Berlins Geschichte', source: 'Deutsche Kultur', cefr_level: 'B1', url: 'https://zeeguu.org' },
      { title: 'Umweltschutz in Deutschland', source: 'Nachrichten', cefr_level: 'B2', url: 'https://zeeguu.org' },
      { title: 'Deutsche Küche erkunden', source: 'Lifestyle', cefr_level: 'A2', url: 'https://zeeguu.org' },
      { title: 'Kultur und Traditionen', source: 'Das Magazin', cefr_level: 'B1', url: 'https://zeeguu.org' },
    ],
    'es': [
      { title: 'La literatura española moderna', source: 'Cultura', cefr_level: 'B1', url: 'https://zeeguu.org' },
      { title: 'Recetas de comida española', source: 'Gastronomía', cefr_level: 'A2', url: 'https://zeeguu.org' },
      { title: 'Ciudades de España para visitar', source: 'Viajes', cefr_level: 'A2', url: 'https://zeeguu.org' },
      { title: 'Historia de Madrid', source: 'Educación', cefr_level: 'B2', url: 'https://zeeguu.org' },
      { title: 'Tradiciones españolas', source: 'Sociedad', cefr_level: 'B1', url: 'https://zeeguu.org' },
    ],
    'fr': [
      { title: 'La Cuisine Française', source: 'Gastronomie', cefr_level: 'A2', url: 'https://zeeguu.org' },
      { title: 'Paris et ses monuments', source: 'Tourisme', cefr_level: 'A1', url: 'https://zeeguu.org' },
      { title: 'Littérature française classique', source: 'Édition', cefr_level: 'B2', url: 'https://zeeguu.org' },
      { title: 'Arts et culture français', source: 'Culture', cefr_level: 'B1', url: 'https://zeeguu.org' },
      { title: 'Traditions de France', source: 'Lifestyle', cefr_level: 'A2', url: 'https://zeeguu.org' },
    ],
    'it': [
      { title: 'La dolce vita italiana', source: 'Stile di vita', cefr_level: 'A2', url: 'https://zeeguu.org' },
      { title: 'Storia dell\'arte italiana', source: 'Arte', cefr_level: 'B1', url: 'https://zeeguu.org' },
      { title: 'La cucina italiana', source: 'Gastronomia', cefr_level: 'A1', url: 'https://zeeguu.org' },
      { title: 'Città da visitare in Italia', source: 'Turismo', cefr_level: 'A2', url: 'https://zeeguu.org' },
      { title: 'Tradizioni italiane', source: 'Cultura', cefr_level: 'B1', url: 'https://zeeguu.org' },
    ],
    'nl': [
      { title: 'Nederland op ontdekking', source: 'Toerisme', cefr_level: 'A2', url: 'https://zeeguu.org' },
      { title: 'Nederlandse cultuur en tradities', source: 'Cultuur', cefr_level: 'B1', url: 'https://zeeguu.org' },
      { title: 'Amsterdam: Een rondleiding', source: 'Steden', cefr_level: 'A2', url: 'https://zeeguu.org' },
      { title: 'Typisch Nederlands eten', source: 'Keuken', cefr_level: 'A1', url: 'https://zeeguu.org' },
      { title: 'Nederlandse geschiedenis', source: 'Educatie', cefr_level: 'B2', url: 'https://zeeguu.org' },
    ],
  };

  // Return articles for the selected language, or general demo articles
  return demoArticlesByLanguage[language || 'en'] || [
    { title: 'Welcome to Language Learning', source: 'Demo Content', cefr_level: 'A1', url: 'https://zeeguu.org' },
    { title: 'Start Your Journey', source: 'Learning Hub', cefr_level: 'A1', url: 'https://zeeguu.org' },
    { title: 'Common Phrases', source: 'Daily Learning', cefr_level: 'A1', url: 'https://zeeguu.org' },
    { title: 'Culture and Traditions', source: 'World Culture', cefr_level: 'A2', url: 'https://zeeguu.org' },
    { title: 'Practice Makes Perfect', source: 'Tips & Tricks', cefr_level: 'A1', url: 'https://zeeguu.org' },
  ];
}
