// User Types
export interface User {
  email: string;
  session: string;
  nativeLanguage?: string;
}

// Language Types
export interface Language {
  code: string;
  name: string;
}

// Article Types
export interface Article {
  id?: string;
  title: string;
  source: string;
  url: string;
  cefr_level: string;
  language?: string;
  content?: string;
  topics?: string[];
}

// Zeeguu API Response Types
export interface ZeeguuResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
}

// Analytics Event Types
export interface AnalyticsEvent {
  eventName: string;
  timestamp: number;
  userMode: 'demo' | 'authenticated';
  metadata?: Record<string, any>;
}

// View State Types
export type ViewType = 
  | 'welcome' 
  | 'login' 
  | 'languages' 
  | 'articles' 
  | 'article-reader';
