document.getElementById('fetch-verse').addEventListener('click', async () => {
  const button = document.getElementById('fetch-verse');
  const verseContainer = document.getElementById('verse-container');
  const verseText = document.getElementById('verse-text');
  const verseReference = document.getElementById('verse-reference');
  const errorDiv = document.getElementById('error');

  // Reset UI
  const originalButtonText = button.textContent;
  button.disabled = true;
  button.textContent = 'Loading...';
  verseContainer.style.display = 'none';
  errorDiv.style.display = 'none';

  try {
    // Send message to background script to fetch the verse
    const response = await chrome.runtime.sendMessage({ action: 'fetchVerse' });

    if (response.success) {
      verseText.textContent = response.verse;
      verseReference.textContent = response.reference;
      verseContainer.style.display = 'block';
    } else {
      errorDiv.textContent = response.error || 'Failed to fetch verse';
      errorDiv.style.display = 'block';
    }
  } catch (error) {
    errorDiv.textContent = 'Error: ' + error.message;
    errorDiv.style.display = 'block';
  } finally {
    button.disabled = false;
    button.textContent = originalButtonText;
  }
});
