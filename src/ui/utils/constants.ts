/**
 * Constants - Configuration and hardcoded values
 */

// API Endpoints - Ordered by priority
export const API_ENDPOINTS = {
  primary: 'https://api.zeeguu.unibe.ch',
  secondary: 'https://zeeguu.unibe.ch',
  fallback1: 'https://api.zeeguu.org',
  fallback2: 'https://zeeguu.org',
};

export const API_ROUTES = {
  login: '/session/{email}',
  languages: '/system_languages',
  articles: '/user_articles/recommended',
  languageInfo: '/language/{code}',
};

// Storage Keys for Chrome Storage
export const STORAGE_KEYS = {
  session: 'zeeguu_session',
  email: 'zeeguu_email',
  domain: 'zeeguu_domain',
  nativeLanguage: 'zeeguu_native_language',
  lastSync: 'zeeguu_last_sync',
};

// Timeouts (in milliseconds)
export const TIMEOUTS = {
  loginAttempt: 10000,
  apiCall: 8000,
  languagesFetch: 5000,
  articlesFetch: 8000,
};

// Analytics Events
export const ANALYTICS_EVENTS = {
  LOGIN_ATTEMPT: 'login_attempt',
  LOGIN_SUCCESS: 'login_success',
  LOGIN_FAILED: 'login_failed',
  LOGOUT: 'logout',
  DEMO_MODE_STARTED: 'demo_mode_started',
  LANGUAGES_LOADED: 'languages_loaded',
  ARTICLES_LOADED: 'articles_loaded',
  ARTICLE_OPENED: 'article_opened',
  APP_INITIALIZED: 'app_initialized',
};

// Error Messages
export const ERROR_MESSAGES = {
  invalidCredentials: 'Invalid email or password. Please check your credentials.',
  networkError: 'Network error. Please check your connection.',
  sessionExpired: 'Your session has expired. Please login again.',
  noSession: 'No active session. Please login first.',
  failedToFetch: 'Failed to fetch data. Please try again.',
  invalidEmail: 'Please enter a valid email address.',
  invalidPassword: 'Password cannot be empty.',
};

// UI Configuration
export const UI_CONFIG = {
  popupWidth: 450,
  popupHeight: 600,
  animationDuration: 200,
  articlePreviewLength: 200,
  maxArticlesPerLoad: 10,
};

// Demo Content
export const DEMO_LANGUAGES = [
  { code: 'de', name: 'German' },
  { code: 'es', name: 'Spanish' },
  { code: 'fr', name: 'French' },
  { code: 'it', name: 'Italian' },
  { code: 'nl', name: 'Dutch' },
  { code: 'pt', name: 'Portuguese' },
  { code: 'ru', name: 'Russian' },
  { code: 'ja', name: 'Japanese' },
  { code: 'pl', name: 'Polish' },
  { code: 'sv', name: 'Swedish' },
];
