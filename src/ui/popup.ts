/**
 * popup.ts - UI Router (Frontend Orchestrator)
 * 
 * Role: Main controller for the extension's popup interface
 * Responsibilities:
 * - Imports and wires up 5 view classes (WelcomeView, LoginView, LanguagesView, ArticlesView, ArticleReaderView)
 * - Manages global state (currentSession, currentEmail, selectedLanguage, isDemoMode)
 * - Routes between views (Welcome → Login → Languages → Articles → ArticleReader)
 * - Sends messages to background.ts for all data/API needs
 * - Handles user interactions and updates views based on responses
 * 
 * Architecture:
 * User clicks button → popup.ts handler fires → sends message to background.ts
 *   → background.ts returns data → popup.ts calls view.render() → View updates DOM
 */

import { WelcomeView } from './views/WelcomeView';
import { LoginView } from './views/LoginView';
import { LanguagesView } from './views/LanguagesView';
import { ArticlesView } from './views/ArticlesView';
import { ArticleReaderView } from './views/ArticleReaderView';
import { AuthService } from './services/authService';

// State management
let currentSession: string | null = null;
let currentEmail: string | null = null;
let selectedLanguage: any = null;
let isDemoMode: boolean = false;
let currentArticle: any = null;

// View instances
const welcomeView = new WelcomeView();
const loginView = new LoginView();
const languagesView = new LanguagesView();
const articlesView = new ArticlesView();
const articleReaderView = new ArticleReaderView();

window.addEventListener('DOMContentLoaded', () => {
  checkSession();
  setupEventListeners();
});

function setupEventListeners() {
  welcomeView.onLoginClick(() => showLoginView());
  welcomeView.onDemoClick(() => startDemoMode());

  loginView.onSubmit((email, password) => handleLogin(email, password));
  loginView.onBackClick(showWelcomeView);

  languagesView.onLogoutClick(handleLogout);
  languagesView.onBackClick(() => {
    isDemoMode = false;
    currentEmail = null;
    showWelcomeView();
  });

  articlesView.onBackClick(goBackToLanguages);

  articleReaderView.onBackClick(() => showArticlesView());
  articleReaderView.onOpenClick((url) => {
    chrome.tabs.create({ url });
  });
}

async function checkSession() {
  const result = await AuthService.getSession();
  if (result.success && result.data) {
    currentSession = result.data.session;
    currentEmail = result.data.email;
    showLanguagesView();
  } else {
    showWelcomeView();
  }
}

function showWelcomeView() {
  welcomeView.render();
}

function startDemoMode() {
  isDemoMode = true;
  currentEmail = 'Demo User';
  currentSession = null;
  showLanguagesView();
}

function showLoginView() {
  loginView.render();
}

function showLanguagesView() {
  languagesView.render(currentEmail || '', isDemoMode);
  loadLanguages();
}

function showArticlesView() {
  articlesView.render(selectedLanguage?.name || 'Articles');
  loadArticles();
}

async function handleLogin(email: string, password: string) {
  loginView.setButtonDisabled(true);
  loginView.clearError();
  loginView.setLoading(true);

  console.log('[Popup] Login attempt with email:', email);

  try {
    const result = await AuthService.login(email, password);
    console.log('[Popup] AuthService.login result:', result);

    if (result.success && result.data) {
      console.log('[Popup] Login successful, storing session');
      currentSession = result.data.session;
      currentEmail = result.data.email;
      loginView.reset();
      loginView.setLoading(false);
      showLanguagesView();
    } else {
      console.log('[Popup] Login failed:', result.error);
      loginView.setError(result.error || 'Login failed');
      loginView.setLoading(false);
    }
  } catch (error: any) {
    console.log('[Popup] Login error:', error);
    loginView.setError(error.message || 'An unexpected error occurred');
    loginView.setLoading(false);
  } finally {
    loginView.setButtonDisabled(false);
  }
}

async function loadLanguages() {
  languagesView.setLoading(true);

  try {
    const response: any = await chrome.runtime.sendMessage({ action: 'fetchLanguages' });

    if (response.success && response.languages) {
      languagesView.renderLanguages(response.languages, selectLanguage);
    } else {
      languagesView.setError(response.error || 'Failed to load languages');
    }
  } catch (error: any) {
    languagesView.setError(error.message);
  } finally {
    languagesView.setLoading(false);
  }
}

function selectLanguage(language: any) {
  selectedLanguage = language;
  showArticlesView();
}

function showArticleReader(article: any) {
  currentArticle = article;
  articleReaderView.setOpenButtonUrl(article.url || 'https://zeeguu.org');
  articleReaderView.render(article, isDemoMode);
}

async function loadArticles() {
  articlesView.setLoading(true);

  try {
    const response: any = await chrome.runtime.sendMessage({
      action: 'fetchArticles',
      session: currentSession,
      language: selectedLanguage?.code,
    });

    if (response.success && response.articles) {
      articlesView.renderArticles(response.articles, showArticleReader);
    } else {
      articlesView.setError(response.error || 'Failed to load articles');
    }
  } catch (error: any) {
    articlesView.setError(error.message);
  } finally {
    articlesView.setLoading(false);
  }
}

function goBackToLanguages() {
  selectedLanguage = null;
  showLanguagesView();
}

async function handleLogout() {
  const result = await AuthService.logout();
  currentSession = null;
  currentEmail = null;
  isDemoMode = false;
  selectedLanguage = null;
  showWelcomeView();
}
