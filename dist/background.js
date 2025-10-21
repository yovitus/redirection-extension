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
    if (request.action === "fetchVerse") {
      fetchBibleVerse().then((data) => sendResponse(data)).catch((error) => sendResponse({
        success: false,
        error: error.message
      }));
      return true;
    }
  });
  async function fetchBibleVerse() {
    try {
      const response = await fetch("https://www.biblegateway.com/");
      if (!response.ok) {
        throw new Error("Failed to fetch from BibleGateway");
      }
      const html = await response.text();
      const verseMatch = html.match(/<div class="votd-box">[\s\S]*?<a[^>]*>(.*?)<\/a>[\s\S]*?<\/div>/);
      const textMatch = html.match(/<p class="votd-text"[^>]*>(.*?)<\/p>/);
      if (textMatch && verseMatch) {
        const verse = textMatch[1].replace(/<[^>]+>/g, "").replace(/&quot;/g, '"').replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&#8217;/g, "'").replace(/&#8220;/g, '"').replace(/&#8221;/g, '"').trim();
        const reference = verseMatch[1].replace(/<[^>]+>/g, "").trim();
        return {
          success: true,
          verse,
          reference
        };
      }
      const votdMatch = html.match(/<div class="bible-verse-text"[^>]*>(.*?)<\/div>[\s\S]*?<a[^>]*class="verse-link"[^>]*>(.*?)<\/a>/);
      if (votdMatch) {
        return {
          success: true,
          verse: votdMatch[1].replace(/<[^>]+>/g, "").trim(),
          reference: votdMatch[2].replace(/<[^>]+>/g, "").trim()
        };
      }
      throw new Error("Could not parse verse from page");
    } catch (error) {
      console.error("Error fetching Bible verse:", error);
      return {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error"
      };
    }
  }
})();
