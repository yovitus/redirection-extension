/**
 * AuthService - Handles all authentication operations
 * Communicates with background service worker for API calls
 */

import { User, ZeeguuResponse } from '../types/index';
import { STORAGE_KEYS, ERROR_MESSAGES, TIMEOUTS } from '../utils/constants';

export class AuthService {
  /**
   * Authenticate user with email and password
   * Hits the correct Zeeguu login endpoint
   */
  static async login(email: string, password: string): Promise<ZeeguuResponse<User>> {
    // Validate input
    if (!email || !email.includes('@')) {
      return {
        success: false,
        error: ERROR_MESSAGES.invalidEmail,
      };
    }

    if (!password) {
      return {
        success: false,
        error: ERROR_MESSAGES.invalidPassword,
      };
    }

    try {
      const response = await this.sendMessageWithTimeout({
        action: 'login',
        email: email.trim(),
        password: password,
      }, 20000);

      if (response.success) {
        return {
          success: true,
          data: {
            email: email,
            session: response.session,
          },
        };
      } else {
        return {
          success: false,
          error: response.error || ERROR_MESSAGES.invalidCredentials,
        };
      }
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : ERROR_MESSAGES.networkError,
      };
    }
  }

  /**
   * Get current session from storage
   */
  static async getSession(): Promise<ZeeguuResponse<User>> {
    try {
      const response = await this.sendMessageWithTimeout({
        action: 'getSession',
      }, TIMEOUTS.apiCall);

      if (response.success && response.session) {
        return {
          success: true,
          data: {
            email: response.email,
            session: response.session,
          },
        };
      } else {
        return {
          success: false,
          error: ERROR_MESSAGES.noSession,
        };
      }
    } catch (error) {
      return {
        success: false,
        error: ERROR_MESSAGES.networkError,
      };
    }
  }

  /**
   * Logout and clear session
   */
  static async logout(): Promise<ZeeguuResponse<null>> {
    try {
      await this.sendMessageWithTimeout({
        action: 'log out',
      }, TIMEOUTS.apiCall);

      return {
        success: true,
      };
    } catch {
      return {
        success: true,
      };
    }
  }

  /**
   * Helper: Send message to background with timeout
   */
  private static sendMessageWithTimeout(
    message: any,
    timeoutMs: number
  ): Promise<any> {
    return new Promise((resolve, reject) => {
      let timeoutId: any = null;
      let hasResponded = false;

      timeoutId = setTimeout(() => {
        if (!hasResponded) {
          hasResponded = true;
          reject(new Error('Login request timeout - server not responding'));
        }
      }, timeoutMs);

      try {
        chrome.runtime.sendMessage(message, (response) => {
          if (!hasResponded) {
            hasResponded = true;
            if (timeoutId) clearTimeout(timeoutId);
            
            if (chrome.runtime.lastError) {
              reject(new Error(chrome.runtime.lastError.message));
            } else {
              resolve(response);
            }
          }
        });
      } catch (error) {
        if (!hasResponded) {
          hasResponded = true;
          if (timeoutId) clearTimeout(timeoutId);
          reject(error);
        }
      }
    });
  }

  /**
   * Validate email format
   */
  static isValidEmail(email: string): boolean {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  }

  /**
   * Check if password meets minimum requirements
   */
  static isValidPassword(password: string): boolean {
    return !!(password && password.length >= 1); // Zeeguu accepts any non-empty password
  }
}
