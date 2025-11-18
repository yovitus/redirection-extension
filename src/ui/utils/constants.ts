/**
 * Constants - Configuration and hardcoded values
 */

// Storage Keys for Chrome Storage
export const STORAGE_KEYS = {
  session: 'zeeguu_session',
  email: 'zeeguu_email',
  domain: 'zeeguu_domain',
};

// Timeouts (in milliseconds)
export const TIMEOUTS = {
  apiCall: 8000,
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
