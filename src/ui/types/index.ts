// User Types
export interface User {
  email: string;
  session: string;
}

// Zeeguu API Response Types
export interface ZeeguuResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
}
