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
  });
  async function fetchZeeguuLanguages() {
    try {
      try {
        const sysResponse = await fetch("https://zeeguu.org/system_languages");
        if (sysResponse.ok) {
          const sysData = await sysResponse.json();
          if (sysData.learnable_languages && Array.isArray(sysData.learnable_languages)) {
            return {
              success: true,
              languages: sysData.learnable_languages
            };
          }
        }
      } catch (e) {
        console.log("system_languages endpoint not available, trying fallback");
      }
      const response = await fetch("https://zeeguu.org/available_languages");
      if (!response.ok) {
        throw new Error(`Failed to fetch from Zeeguu API. Status: ${response.status}`);
      }
      const text = await response.text();
      let languageCodes;
      try {
        languageCodes = JSON.parse(text);
      } catch {
        console.error("Response was not valid JSON:", text.substring(0, 100));
        throw new Error("API returned invalid data (possibly HTML). Using fallback languages.");
      }
      if (!Array.isArray(languageCodes)) {
        throw new Error("Invalid response format from API");
      }
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
        "ro": "Romanian",
        "pl": "Polish",
        "sv": "Swedish",
        "da": "Danish",
        "hu": "Hungarian",
        "uk": "Ukrainian",
        "el": "Greek"
      };
      const languages = languageCodes.map((code) => ({
        code,
        name: languageNames[code] || code.toUpperCase()
      }));
      return {
        success: true,
        languages
      };
    } catch (error) {
      console.error("Error fetching Zeeguu languages:", error);
      const fallbackLanguages = [
        { code: "de", name: "German" },
        { code: "es", name: "Spanish" },
        { code: "fr", name: "French" },
        { code: "en", name: "English" },
        { code: "nl", name: "Dutch" },
        { code: "it", name: "Italian" },
        { code: "pt", name: "Portuguese" },
        { code: "ru", name: "Russian" },
        { code: "no", name: "Norwegian" },
        { code: "pl", name: "Polish" },
        { code: "sv", name: "Swedish" },
        { code: "da", name: "Danish" }
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
})();
