let selectedLanguage = null;

// Initialize popup
window.addEventListener('DOMContentLoaded', () => {
  loadLanguages();
  setupEventListeners();
});

function setupEventListeners() {
  document.getElementById('back-btn').addEventListener('click', goBackToLanguages);
  document.getElementById('start-learning-btn').addEventListener('click', openZeeguu);
}

async function loadLanguages() {
  const spinner = document.getElementById('loading-spinner');
  const grid = document.getElementById('languages-grid');
  const errorDiv = document.getElementById('error');

  spinner.style.display = 'block';
  errorDiv.style.display = 'none';
  grid.innerHTML = '';

  try {
    const response = await chrome.runtime.sendMessage({ action: 'fetchLanguages' });

    if (response.success && response.languages) {
      response.languages.forEach((lang) => {
        const btn = document.createElement('button');
        btn.className = 'language-btn';
        btn.textContent = `${lang.name}\n(${lang.code})`;
        btn.addEventListener('click', () => showLanguageDetail(lang));
        grid.appendChild(btn);
      });
    } else {
      throw new Error(response.error || 'Failed to fetch languages');
    }
  } catch (error) {
    errorDiv.textContent = '❌ ' + error.message;
    errorDiv.style.display = 'block';
    console.error('Error loading languages:', error);
  } finally {
    spinner.style.display = 'none';
  }
}

function showLanguageDetail(language) {
  selectedLanguage = language;
  const languagesView = document.getElementById('languages-view');
  const detailView = document.getElementById('language-detail');

  document.getElementById('detail-title').textContent = language.name;

  // Fetch language info from background
  chrome.runtime.sendMessage(
    { action: 'fetchLanguageInfo', languageCode: language.code },
    (response) => {
      if (response.success && response.tips) {
        const tipsList = document.getElementById('tips-list');
        tipsList.innerHTML = '';
        response.tips.forEach((tip) => {
          const li = document.createElement('li');
          li.textContent = tip;
          tipsList.appendChild(li);
        });
      }
    }
  );

  languagesView.classList.add('hidden');
  detailView.classList.add('active');
}

function goBackToLanguages() {
  document.getElementById('languages-view').classList.remove('hidden');
  document.getElementById('language-detail').classList.remove('active');
  selectedLanguage = null;
}

function openZeeguu() {
  if (selectedLanguage) {
    chrome.tabs.create({
      url: `https://zeeguu.org?lang=${selectedLanguage.code}`,
    });
  }
}
