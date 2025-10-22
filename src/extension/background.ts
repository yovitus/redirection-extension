self.addEventListener('install', () => {
  console.log('Service worker installed (TS)');
});

self.addEventListener('activate', () => {
  console.log('Service worker activated (TS)');
});

(self as any).chrome.runtime.onMessage.addListener((request: any, sender: any, sendResponse: any) => {
  if (request.action === 'fetchVerse') {
    fetchBibleVerse()
      .then(data => sendResponse(data))
      .catch(error => sendResponse({ 
        success: false, 
        error: error.message 
      }));
    return true; 
  }
});

async function fetchBibleVerse(): Promise<{ success: boolean; verse?: string; reference?: string; error?: string }> {
  try {
    const bibleMetadata: Record<string, number> = {
      "Genesis": 50,
      "Exodus": 40,
      "Leviticus": 27,
      "Numbers": 36,
      "Deuteronomy": 34,
      "Joshua": 24,
      "Judges": 21,
      "Ruth": 4,
      "1 Samuel": 31,
      "2 Samuel": 24,
      "1 Kings": 22,
      "2 Kings": 25,
      "1 Chronicles": 29,
      "2 Chronicles": 36,
      "Ezra": 10,
      "Nehemiah": 13,
      "Esther": 10,
      "Job": 42,
      "Psalms": 150,
      "Proverbs": 31,
      "Ecclesiastes": 12,
      "Song of Solomon": 8,
      "Isaiah": 66,
      "Jeremiah": 52,
      "Lamentations": 5,
      "Ezekiel": 48,
      "Daniel": 12,
      "Hosea": 14,
      "Joel": 3,
      "Amos": 9,
      "Obadiah": 1,
      "Jonah": 4,
      "Micah": 7,
      "Nahum": 3,
      "Habakkuk": 3,
      "Zephaniah": 3,
      "Haggai": 2,
      "Zechariah": 14,
      "Malachi": 4,
      "Matthew": 28,
      "Mark": 16,
      "Luke": 24,
      "John": 21,
      "Acts": 28,
      "Romans": 16,
      "1 Corinthians": 16,
      "2 Corinthians": 13,
      "Galatians": 6,
      "Ephesians": 6,
      "Philippians": 4,
      "Colossians": 4,
      "1 Thessalonians": 5,
      "2 Thessalonians": 3,
      "1 Timothy": 6,
      "2 Timothy": 4,
      "Titus": 3,
      "Philemon": 1,
      "Hebrews": 13,
      "James": 5,
      "1 Peter": 5,
      "2 Peter": 3,
      "1 John": 5,
      "2 John": 1,
      "3 John": 1,
      "Jude": 1,
      "Revelation": 22
    };

    // Select a random book
    const books = Object.keys(bibleMetadata);
    const randomBook = books[Math.floor(Math.random() * books.length)] as keyof typeof bibleMetadata;

    // Select a random chapter
    const maxChapters = bibleMetadata[randomBook];
    const randomChapter = Math.floor(Math.random() * maxChapters) + 1;

    // Fetch the first verse of the random chapter
    const response = await fetch(`https://bible-api.com/${randomBook}+${randomChapter}:1`);
    if (!response.ok) {
      const errorText = await response.text();
      console.error(`Failed to fetch from Bible API. Status: ${response.status}, Response: ${errorText}`);
      throw new Error("Failed to fetch from Bible API");
    }

    const data = await response.json();

    const bookName = data.book_name || randomBook;
    const chapter = data.chapter || randomChapter;
    const verse = data.verse || 1;

    return {
      success: true,
      verse: data.text,
      reference: `${bookName} ${chapter}:${verse}`,
    };
  } catch (error) {
    console.error('Error fetching Bible verse:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}
