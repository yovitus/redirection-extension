"use strict";
(() => {
  // src/extension/background.ts
  self.addEventListener("install", () => {
    console.log("Service worker installed (TS)");
  });
  self.addEventListener("activate", () => {
    console.log("Service worker activated (TS)");
  });
  self.chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === "fetchLanguages") {
      fetchZeeguuLanguages().then((data) => sendResponse(data)).catch((error) => sendResponse({
        success: false,
        error: error.message
      }));
      return true;
    }
    if (request.action === "fetchLanguageInfo") {
      fetchLanguageInfo(request.languageCode).then((data) => sendResponse(data)).catch((error) => sendResponse({
        success: false,
        error: error.message
      }));
      return true;
    }
    if (request.action === "login") {
      authenticateUser(request.email, request.password).then((data) => sendResponse(data)).catch((error) => sendResponse({
        success: false,
        error: error.message
      }));
      return true;
    }
    if (request.action === "getSession") {
      getStoredSession().then((data) => sendResponse(data)).catch((error) => sendResponse({
        success: false,
        error: error.message
      }));
      return true;
    }
    if (request.action === "fetchArticles") {
      fetchRecommendedArticles(request.session, request.language).then((data) => sendResponse(data)).catch((error) => sendResponse({
        success: false,
        error: error.message
      }));
      return true;
    }
    if (request.action === "log out") {
      clearSession().then((data) => sendResponse(data)).catch((error) => sendResponse({
        success: false,
        error: error.message
      }));
      return true;
    }
    if (request.action === "openOverlay") {
      try {
        const url = request.url;
        const width = request.width || 900;
        const height = request.height || 700;
        openOverlayWindow(url, width, height).then((win) => sendResponse({ success: true, windowId: win && win.id })).catch((err) => sendResponse({ success: false, error: err && err.message ? err.message : String(err) }));
        return true;
      } catch (err) {
        sendResponse({ success: false, error: err && err.message ? err.message : String(err) });
        return false;
      }
    }
    if (request.action === "closeOverlayFromTab") {
      try {
        const chromeApi = self.chrome;
        const tabId = sender && sender.tab && sender.tab.id;
        if (typeof tabId !== "number")
          return sendResponse({ success: false, error: "No tabId" });
        let foundPopupId = null;
        for (const [popupId, mappedTabId] of overlayToTab.entries()) {
          if (mappedTabId === tabId) {
            foundPopupId = popupId;
            break;
          }
        }
        if (foundPopupId) {
          try {
            chromeApi.windows.remove(foundPopupId);
          } catch (e) {
          }
          try {
            chromeApi.tabs.sendMessage(tabId, { action: "removeOverlay" }, () => {
            });
          } catch (e) {
          }
          overlayToTab.delete(foundPopupId);
        }
        sendResponse({ success: true });
      } catch (e) {
        sendResponse({ success: false, error: e && e.message ? e.message : String(e) });
      }
      return true;
    }
  });
  async function fetchZeeguuLanguages() {
    try {
      const endpoints = [
        "https://zeeguu.org/system_languages",
        "https://api.zeeguu.org/system_languages",
        "https://zeeguu.unibe.ch/system_languages",
        "https://api.zeeguu.unibe.ch/system_languages"
      ];
      let lastError = null;
      for (const endpoint of endpoints) {
        try {
          console.log(`Attempting to fetch from: ${endpoint}`);
          const sysResponse = await fetch(endpoint, {
            method: "GET",
            headers: {
              "Accept": "application/json"
            }
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
                languages: sysData.learnable_languages
              };
            }
          }
        } catch (e) {
          console.log(`Endpoint ${endpoint} failed:`, e);
          lastError = e instanceof Error ? e : new Error(String(e));
          continue;
        }
      }
      console.error("All API endpoints failed, using fallback languages");
      const fallbackLanguages = [
        { code: "de", name: "German" },
        { code: "es", name: "Spanish" },
        { code: "fr", name: "French" },
        { code: "nl", name: "Dutch" },
        { code: "en", name: "English" },
        { code: "it", name: "Italian" },
        { code: "pt", name: "Portuguese" },
        { code: "ru", name: "Russian" },
        { code: "ja", name: "Japanese" },
        { code: "pl", name: "Polish" },
        { code: "sv", name: "Swedish" },
        { code: "da", name: "Danish" },
        { code: "no", name: "Norwegian" },
        { code: "hu", name: "Hungarian" },
        { code: "ro", name: "Romanian" },
        { code: "uk", name: "Ukrainian" },
        { code: "el", name: "Greek" }
      ];
      return {
        success: true,
        languages: fallbackLanguages
      };
    } catch (error) {
      console.error("Error in fetchZeeguuLanguages:", error);
      const fallbackLanguages = [
        { code: "de", name: "German" },
        { code: "es", name: "Spanish" },
        { code: "fr", name: "French" },
        { code: "nl", name: "Dutch" },
        { code: "en", name: "English" },
        { code: "it", name: "Italian" },
        { code: "pt", name: "Portuguese" },
        { code: "ru", name: "Russian" },
        { code: "ja", name: "Japanese" },
        { code: "pl", name: "Polish" },
        { code: "sv", name: "Swedish" },
        { code: "da", name: "Danish" },
        { code: "no", name: "Norwegian" },
        { code: "hu", name: "Hungarian" },
        { code: "ro", name: "Romanian" },
        { code: "uk", name: "Ukrainian" },
        { code: "el", name: "Greek" }
      ];
      return {
        success: true,
        languages: fallbackLanguages
      };
    }
  }
  async function openOverlayWindow(url, width, height) {
    return new Promise((resolve, reject) => {
      try {
        if (!url || typeof url !== "string")
          return reject(new Error("Invalid URL"));
        const chromeApi = self.chrome;
        chromeApi.windows.getCurrent({ populate: false }, (currentWin) => {
          try {
            const cw = currentWin && typeof currentWin.width === "number" ? currentWin.width : 1200;
            const ch = currentWin && typeof currentWin.height === "number" ? currentWin.height : 800;
            const cleft = typeof currentWin.left === "number" ? currentWin.left : 0;
            const ctop = typeof currentWin.top === "number" ? currentWin.top : 0;
            const left = cleft + Math.max(0, Math.round((cw - width) / 2));
            const top = ctop + Math.max(0, Math.round((ch - height) / 2));
            chromeApi.tabs.query({ active: true, windowId: currentWin.id }, (tabs) => {
              const activeTab = tabs && tabs[0] || null;
              const tabId = activeTab && typeof activeTab.id === "number" ? activeTab.id : null;
              const injectAndCreate = () => {
                chromeApi.windows.create({
                  url,
                  type: "popup",
                  width,
                  height,
                  left,
                  top,
                  focused: true
                }, (createdWin) => {
                  if (chromeApi.runtime.lastError) {
                    return reject(new Error(chromeApi.runtime.lastError.message));
                  }
                  try {
                    if (createdWin && createdWin.id && tabId !== null) {
                      overlayToTab.set(createdWin.id, tabId);
                    }
                  } catch (e) {
                  }
                  resolve(createdWin);
                });
              };
              if (tabId !== null) {
                try {
                  chromeApi.scripting.executeScript({ target: { tabId }, files: ["overlay_inject.js"] }, () => {
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
  var overlayToTab = /* @__PURE__ */ new Map();
  self.chrome.windows.onRemoved.addListener((windowId) => {
    try {
      const chromeApi = self.chrome;
      if (overlayToTab.has(windowId)) {
        const tabId = overlayToTab.get(windowId);
        overlayToTab.delete(windowId);
        try {
          chromeApi.tabs.sendMessage(tabId, { action: "removeOverlay" }, () => {
          });
        } catch (e) {
        }
      }
    } catch (e) {
      console.warn("onRemoved cleanup error", e);
    }
  });
  async function fetchLanguageInfo(languageCode) {
    try {
      const tips = {
        "de": ["Learn numbers 1-10", "Practice common verbs", "Master gender of nouns"],
        "es": ["Learn greetings", "Practice verb conjugations", "Study common phrases"],
        "fr": ["Focus on pronunciation", "Learn verb tenses", "Practice listening"],
        "nl": ["Master noun genders", "Learn common words", "Practice speaking"],
        "en": ["Expand vocabulary", "Practice pronunciation", "Study grammar basics"],
        "it": ["Learn verb forms", "Practice pronunciation", "Study common phrases"],
        "pt": ["Learn verb conjugations", "Practice listening", "Study grammar"],
        "ru": ["Master Cyrillic alphabet", "Learn cases", "Practice pronunciation"],
        "ja": ["Master Hiragana", "Learn Katakana", "Study basic grammar"],
        "zh": ["Learn Pinyin", "Master tone marks", "Study radicals"],
        "no": ["Learn basic grammar", "Practice pronunciation", "Study verb forms"],
        "ro": ["Learn verb tenses", "Practice listening", "Study common words"]
      };
      const languageNames = {
        "de": "German",
        "es": "Spanish",
        "fr": "French",
        "nl": "Dutch",
        "en": "English",
        "it": "Italian",
        "pt": "Portuguese",
        "ru": "Russian",
        "ja": "Japanese",
        "zh": "Chinese",
        "no": "Norwegian",
        "ro": "Romanian"
      };
      return {
        success: true,
        info: `Learning ${languageNames[languageCode] || languageCode}`,
        tips: tips[languageCode] || ["Keep practicing!", "Stay consistent", "Have fun learning!"]
      };
    } catch (error) {
      console.error("Error fetching language info:", error);
      return {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error"
      };
    }
  }
  async function authenticateUser(email, password) {
    try {
      const domains = [
        "https://zeeguu.unibe.ch",
        "https://api.zeeguu.unibe.ch",
        "https://zeeguu.org",
        "https://api.zeeguu.org"
      ];
      for (const domain of domains) {
        try {
          console.log(`Attempting login with domain: ${domain}`);
          const response = await fetch(`${domain}/session/${email}`, {
            method: "POST",
            headers: {
              "Content-Type": "application/x-www-form-urlencoded",
              "Accept": "application/json"
            },
            body: `password=${encodeURIComponent(password)}`
          });
          if (response.ok) {
            const text = await response.text();
            const sessionId = text.trim().replace(/[\"']/g, "");
            await new Promise((resolve) => {
              self.chrome.storage.local.set({
                zeeguu_session: sessionId,
                zeeguu_email: email,
                zeeguu_domain: domain
              }, () => {
                console.log(`Successfully authenticated with ${domain}`);
                resolve();
              });
            });
            return {
              success: true,
              session: sessionId
            };
          }
        } catch (e) {
          console.log(`Domain ${domain} failed:`, e);
          continue;
        }
      }
      return {
        success: false,
        error: "Invalid email or password. Please check your credentials."
      };
    } catch (error) {
      console.error("Authentication error:", error);
      return {
        success: false,
        error: error instanceof Error ? error.message : "Authentication failed"
      };
    }
  }
  async function getStoredSession() {
    return new Promise((resolve) => {
      self.chrome.storage.local.get(
        ["zeeguu_session", "zeeguu_email", "zeeguu_domain"],
        (items) => {
          if (items.zeeguu_session) {
            resolve({
              success: true,
              session: items.zeeguu_session,
              email: items.zeeguu_email,
              domain: items.zeeguu_domain
            });
          } else {
            resolve({
              success: false,
              error: "No session found"
            });
          }
        }
      );
    });
  }
  async function clearSession() {
    return new Promise((resolve) => {
      self.chrome.storage.local.remove(
        ["zeeguu_session", "zeeguu_email", "zeeguu_domain"],
        () => {
          console.log("Session cleared");
          resolve({ success: true });
        }
      );
    });
  }
  async function fetchRecommendedArticles(session, language) {
    try {
      if (!session) {
        const demoArticles = getDemoArticles(language);
        return {
          success: true,
          articles: demoArticles
        };
      }
      const sessionData = await getStoredSession();
      if (!sessionData.success || !sessionData.domain) {
        return {
          success: false,
          error: "No valid session"
        };
      }
      const domain = sessionData.domain;
      console.log(`Fetching articles from ${domain}`);
      const response = await fetch(`${domain}/user_articles/recommended?session=${session}`, {
        method: "GET",
        headers: {
          "Accept": "application/json"
        }
      });
      if (response.ok) {
        const articles = await response.json();
        console.log(`Fetched ${articles.length} recommended articles`);
        return {
          success: true,
          articles: articles.slice(0, 5)
          // Return top 5 articles
        };
      } else {
        throw new Error(`Failed to fetch articles. Status: ${response.status}`);
      }
    } catch (error) {
      console.error("Error fetching articles:", error);
      return {
        success: false,
        error: error instanceof Error ? error.message : "Failed to fetch articles"
      };
    }
  }
  function getDemoArticles(language) {
    const demoArticlesByLanguage = {
      "de": [
        { title: "Die Vorteile des Lesens", source: "Deutsch Lernen", cefr_level: "A2", url: "https://zeeguu.org" },
        { title: "Berlins Geschichte", source: "Deutsche Kultur", cefr_level: "B1", url: "https://zeeguu.org" },
        { title: "Umweltschutz in Deutschland", source: "Nachrichten", cefr_level: "B2", url: "https://zeeguu.org" },
        { title: "Deutsche K\xFCche erkunden", source: "Lifestyle", cefr_level: "A2", url: "https://zeeguu.org" },
        { title: "Kultur und Traditionen", source: "Das Magazin", cefr_level: "B1", url: "https://zeeguu.org" }
      ],
      "es": [
        { title: "La literatura espa\xF1ola moderna", source: "Cultura", cefr_level: "B1", url: "https://zeeguu.org" },
        { title: "Recetas de comida espa\xF1ola", source: "Gastronom\xEDa", cefr_level: "A2", url: "https://zeeguu.org" },
        { title: "Ciudades de Espa\xF1a para visitar", source: "Viajes", cefr_level: "A2", url: "https://zeeguu.org" },
        { title: "Historia de Madrid", source: "Educaci\xF3n", cefr_level: "B2", url: "https://zeeguu.org" },
        { title: "Tradiciones espa\xF1olas", source: "Sociedad", cefr_level: "B1", url: "https://zeeguu.org" }
      ],
      "fr": [
        { title: "La Cuisine Fran\xE7aise", source: "Gastronomie", cefr_level: "A2", url: "https://zeeguu.org" },
        { title: "Paris et ses monuments", source: "Tourisme", cefr_level: "A1", url: "https://zeeguu.org" },
        { title: "Litt\xE9rature fran\xE7aise classique", source: "\xC9dition", cefr_level: "B2", url: "https://zeeguu.org" },
        { title: "Arts et culture fran\xE7ais", source: "Culture", cefr_level: "B1", url: "https://zeeguu.org" },
        { title: "Traditions de France", source: "Lifestyle", cefr_level: "A2", url: "https://zeeguu.org" }
      ],
      "it": [
        { title: "La dolce vita italiana", source: "Stile di vita", cefr_level: "A2", url: "https://zeeguu.org" },
        { title: "Storia dell'arte italiana", source: "Arte", cefr_level: "B1", url: "https://zeeguu.org" },
        { title: "La cucina italiana", source: "Gastronomia", cefr_level: "A1", url: "https://zeeguu.org" },
        { title: "Citt\xE0 da visitare in Italia", source: "Turismo", cefr_level: "A2", url: "https://zeeguu.org" },
        { title: "Tradizioni italiane", source: "Cultura", cefr_level: "B1", url: "https://zeeguu.org" }
      ],
      "nl": [
        { title: "Nederland op ontdekking", source: "Toerisme", cefr_level: "A2", url: "https://zeeguu.org" },
        { title: "Nederlandse cultuur en tradities", source: "Cultuur", cefr_level: "B1", url: "https://zeeguu.org" },
        { title: "Amsterdam: Een rondleiding", source: "Steden", cefr_level: "A2", url: "https://zeeguu.org" },
        { title: "Typisch Nederlands eten", source: "Keuken", cefr_level: "A1", url: "https://zeeguu.org" },
        { title: "Nederlandse geschiedenis", source: "Educatie", cefr_level: "B2", url: "https://zeeguu.org" }
      ]
    };
    return demoArticlesByLanguage[language || "en"] || [
      { title: "Welcome to Language Learning", source: "Demo Content", cefr_level: "A1", url: "https://zeeguu.org" },
      { title: "Start Your Journey", source: "Learning Hub", cefr_level: "A1", url: "https://zeeguu.org" },
      { title: "Common Phrases", source: "Daily Learning", cefr_level: "A1", url: "https://zeeguu.org" },
      { title: "Culture and Traditions", source: "World Culture", cefr_level: "A2", url: "https://zeeguu.org" },
      { title: "Practice Makes Perfect", source: "Tips & Tricks", cefr_level: "A1", url: "https://zeeguu.org" }
    ];
  }
})();
