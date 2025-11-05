# Zeeguu Extension - Project Structure Summary

## Current State (Nov 5, 2025)

Your project is now **modular and scalable** with a foundation for future growth.

```
src/ui/
├── popup.html                 (UI markup)
├── popup.ts                   (Current - will be refactored to route)
├── STRUCTURE_GUIDE.md         (This documentation)
│
├── types/
│   └── index.ts              ✅ CREATED - All TypeScript interfaces
│       • User, Article, Language
│       • ZeeguuResponse<T>
│       • ViewType
│
├── utils/
│   ├── constants.ts          ✅ CREATED - All hardcoded values
│   │   • API endpoints
│   │   • Storage keys
│   │   • Event names
│   │   • Timeouts
│   │
│   ├── analytics.ts          ✅ CREATED - User tracking service
│   │   • trackEvent()
│   │   • getEvents()
│   │   • exportEvents()
│   │
│   └── storage.ts            ✅ CREATED - Chrome storage abstraction
│       • set(), get(), remove()
│       • saveSession(), getSession()
│
├── services/                 (TBD - for next phase)
│   ├── zeeguuService.ts
│   ├── authService.ts
│   └── [others]
│
└── views/                    (TBD - for next phase)
    ├── WelcomeView.ts
    ├── LoginView.ts
    ├── LanguagesView.ts
    ├── ArticlesView.ts
    └── ArticleReaderView.ts
```

## What You Get Right Now

### 1. **Analytics Ready** 📊
Your analytics system is already in place:
```typescript
analyticsService.trackEvent(
  'ARTICLE_OPENED',
  isDemoMode ? 'demo' : 'authenticated',
  { articleId: '123', duration: 45000 }
);
```

### 2. **Storage Abstraction** 💾
Easy storage management (can swap implementations later):
```typescript
await StorageService.saveSession(session, email);
const { session, email } = await StorageService.getSession();
```

### 3. **Type Safety** 🔒
All your data is strongly typed:
```typescript
const article: Article = {
  title: 'La dolce vita italiana',
  source: 'Lifestyle',
  url: 'https://zeeguu.org',
  cefr_level: 'A2'
};
```

### 4. **Easy to Extend** 🚀
Adding new features doesn't break existing code:
- New event? Add to `ANALYTICS_EVENTS`
- New API endpoint? Add to `constants.ts`
- New data type? Add interface to `types/index.ts`

## Next Steps (When Ready)

### Phase 1: Extract Views
Move each view into its own file in `views/`:
- `WelcomeView.ts` - Login/Demo choice
- `LoginView.ts` - Login form logic
- `LanguagesView.ts` - Language selection
- `ArticlesView.ts` - Article list
- `ArticleReaderView.ts` - Reader modal

### Phase 2: Create Services
Extract business logic into `services/`:
- `zeeguuService.ts` - All Zeeguu API calls
- `authService.ts` - Authentication
- `languageService.ts` - Language management

### Phase 3: Refactor popup.ts
```typescript
// New popup.ts would look like:
class PopupRouter {
  private currentView: ViewType = 'welcome';
  
  async initialize() {
    const session = await StorageService.getSession();
    if (session.session) {
      this.showView('languages');
      analyticsService.trackEvent('APP_OPENED', 'authenticated');
    } else {
      this.showView('welcome');
      analyticsService.trackEvent('APP_OPENED', 'demo');
    }
  }
  
  private showView(view: ViewType) {
    // View logic here
  }
}
```

## Benefits of This Structure

| Aspect | Before | After |
|--------|--------|-------|
| **File Size** | 400+ lines in popup.ts | ~50 lines per view |
| **Testing** | Hard to test | Each service testable |
| **Analytics** | None | Built-in tracking |
| **Reusability** | Code duplication | Shared services |
| **Scalability** | Gets messy | Easy to add features |
| **Data Collection** | Manual tracking | Centralized system |

## How to Use This Foundation

### When adding a new feature:

1. **Define the type** (if new data structure):
   ```typescript
   // types/index.ts
   export interface NewFeature {
     id: string;
     name: string;
   }
   ```

2. **Add constants**:
   ```typescript
   // utils/constants.ts
   export const ANALYTICS_EVENTS = {
     // ... existing
     NEW_FEATURE_USED: 'new_feature_used'
   };
   ```

3. **Create service** (if needed):
   ```typescript
   // services/newFeatureService.ts
   export class NewFeatureService {
     // Your logic here
   }
   ```

4. **Use in view**:
   ```typescript
   import { NewFeatureService } from '../services/newFeatureService';
   import { analyticsService } from '../utils/analytics';
   
   const service = new NewFeatureService();
   analyticsService.trackEvent('NEW_FEATURE_USED', userMode);
   ```

## For Your Data Collection Needs

The `analyticsService` is already set up to:
- ✅ Track events locally (Chrome storage)
- ✅ Add metadata to events
- ✅ Export all events as JSON
- ✅ Group events by type
- ✅ Generate summaries

Future: You can extend it to send data to your server:
```typescript
// Later: Send to your analytics backend
public async sendToServer(): Promise<void> {
  const events = this.exportEvents();
  await fetch('https://your-server.com/analytics', {
    method: 'POST',
    body: events
  });
}
```

---

**Status**: ✅ Foundation complete. Ready for scalable development!
