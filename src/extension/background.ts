self.addEventListener('install', () => {
  console.log('Service worker installed (TS)');
});

self.addEventListener('activate', () => {
  console.log('Service worker activated (TS)');
});

// Listen for messages from popup
(self as any).chrome.runtime.onMessage.addListener((request: any, sender: any, sendResponse: any) => {
  if (request.action === 'fetchVerse') {
    fetchBibleVerse()
      .then(data => sendResponse(data))
      .catch(error => sendResponse({ 
        success: false, 
        error: error.message 
      }));
    return true; // Keep the message channel open for async response
  }
});

async function fetchBibleVerse(): Promise<{ success: boolean; verse?: string; reference?: string; error?: string }> {
  try {
    // Fetch the BibleGateway page
    const response = await fetch('https://www.biblegateway.com/');
    
    if (!response.ok) {
      throw new Error('Failed to fetch from BibleGateway');
    }

    const html = await response.text();
    
    // Parse the HTML to extract verse of the day
    // BibleGateway uses specific classes for the verse of the day
    const verseMatch = html.match(/<div class="votd-box">[\s\S]*?<a[^>]*>(.*?)<\/a>[\s\S]*?<\/div>/);
    const textMatch = html.match(/<p class="votd-text"[^>]*>(.*?)<\/p>/);
    
    if (textMatch && verseMatch) {
      // Clean up HTML tags and decode entities
      const verse = textMatch[1]
        .replace(/<[^>]+>/g, '')
        .replace(/&quot;/g, '"')
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&#8217;/g, "'")
        .replace(/&#8220;/g, '"')
        .replace(/&#8221;/g, '"')
        .trim();
      
      const reference = verseMatch[1]
        .replace(/<[^>]+>/g, '')
        .trim();

      return {
        success: true,
        verse: verse,
        reference: reference
      };
    }
    
    // Alternative parsing method if the first one fails
    const votdMatch = html.match(/<div class="bible-verse-text"[^>]*>(.*?)<\/div>[\s\S]*?<a[^>]*class="verse-link"[^>]*>(.*?)<\/a>/);
    if (votdMatch) {
      return {
        success: true,
        verse: votdMatch[1].replace(/<[^>]+>/g, '').trim(),
        reference: votdMatch[2].replace(/<[^>]+>/g, '').trim()
      };
    }

    throw new Error('Could not parse verse from page');
  } catch (error) {
    console.error('Error fetching Bible verse:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    };
  }
}
