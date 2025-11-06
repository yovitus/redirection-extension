"use strict";
(() => {
  // src/extension/background.ts
  self.addEventListener("install", () => {
    console.log("Service worker installed");
  });
  self.addEventListener("activate", () => {
    console.log("Service worker activated");
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
    if (request.action === "getUserLanguages") {
      getUserLanguages(request.session).then((data) => sendResponse(data)).catch((error) => sendResponse({
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
      if (!email || !password) {
        return {
          success: false,
          error: "Email and password are required"
        };
      }
      const domains = [
        "https://api.zeeguu.org",
        // Primary (fastest & reliable)
        "https://zeeguu.org",
        // Secondary
        "https://api.zeeguu.unibe.ch",
        // Fallback 1 (often times out)
        "https://zeeguu.unibe.ch"
        // Fallback 2 (often times out)
      ];
      for (const domain of domains) {
        try {
          const controller = new AbortController();
          const timeoutId = setTimeout(() => controller.abort(), 8e3);
          const response = await fetch(`${domain}/session/${email}`, {
            method: "POST",
            headers: {
              "Content-Type": "application/x-www-form-urlencoded",
              "Accept": "application/json"
            },
            body: `password=${encodeURIComponent(password)}`,
            signal: controller.signal
          });
          clearTimeout(timeoutId);
          if (response.ok) {
            const text = await response.text();
            let sessionId = text.trim();
            if (sessionId.startsWith("{")) {
              try {
                const json = JSON.parse(sessionId);
                sessionId = json.session || "";
              } catch {
                continue;
              }
            } else {
              sessionId = sessionId.replace(/[\"']/g, "");
            }
            if (!sessionId) {
              continue;
            }
            await new Promise((resolve) => {
              self.chrome.storage.local.set({
                zeeguu_session: sessionId,
                zeeguu_email: email,
                zeeguu_domain: domain,
                zeeguu_login_time: (/* @__PURE__ */ new Date()).toISOString()
              }, () => {
                resolve();
              });
            });
            return {
              success: true,
              session: sessionId
            };
          } else if (response.status === 401 || response.status === 403) {
            return {
              success: false,
              error: "Invalid email or password. Please check your credentials."
            };
          }
        } catch (e) {
          continue;
        }
      }
      return {
        success: false,
        error: "Invalid email or password. Please check your credentials."
      };
    } catch (error) {
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
  async function getUserLanguages(session) {
    try {
      if (!session) {
        return {
          success: false,
          error: "No session provided"
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
      const response = await fetch(`${domain}/user_languages?session=${session}`, {
        method: "GET",
        headers: {
          "Accept": "application/json"
        }
      });
      if (response.ok) {
        const data = await response.json();
        let languages = Array.isArray(data) ? data : data.languages || [];
        if (languages.length === 0) {
          return {
            success: true,
            languages: [{ code: "de", name: "German" }]
          };
        }
        return {
          success: true,
          languages
        };
      } else {
        throw new Error(`Failed to fetch user languages. Status: ${response.status}`);
      }
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : "Failed to fetch user languages"
      };
    }
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
