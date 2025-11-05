/**
 * ArticleReaderView - Modal for reading individual articles
 */

export class ArticleReaderView {
  private viewId = 'article-reader-view';

  render(article: any, isDemoMode: boolean): void {
    this.setArticleContent(article, isDemoMode);
    this.showView();
  }

  private showView(): void {
    document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
    const view = document.getElementById(this.viewId);
    if (view) {
      view.classList.add('active');
    }
  }

  private setArticleContent(article: any, isDemoMode: boolean): void {
    const titleEl = document.getElementById('reader-title');
    const sourceEl = document.getElementById('reader-source');
    const levelEl = document.getElementById('reader-level');
    const contentEl = document.getElementById('reader-content');

    if (titleEl) titleEl.textContent = article.title || 'Untitled';
    if (sourceEl) sourceEl.textContent = article.source || 'Unknown';
    if (levelEl) levelEl.textContent = `Level: ${article.cefr_level || 'A1'}`;

    if (contentEl) {
      if (isDemoMode) {
        contentEl.innerHTML = `
          <p>${article.title}</p>
          <p>From: ${article.source}</p>
          <p>Language Level: ${article.cefr_level || 'A1'}</p>
          <hr style="border: none; border-top: 1px solid #e0e0e0; margin: 16px 0;">
          <p>This is a sample article from Zeeguu. In demo mode, you're seeing a preview of how articles would appear in the reader.</p>
          <p>To read the full article with interactive features like word translations, vocabulary tracking, and exercises, please login to your Zeeguu account.</p>
          <p>Click the "Open in Zeeguu" button below to visit the article on zeeguu.org or login to access the full reading experience.</p>
        `;
      } else {
        contentEl.innerHTML = `<p>${article.title}</p><p>Loading article content...</p>`;
      }
    }
  }

  onBackClick(callback: () => void): void {
    const btn = document.getElementById('reader-back-btn');
    if (btn) {
      btn.addEventListener('click', callback);
    }
  }

  onOpenClick(callback: (url: string) => void): void {
    const btn = document.getElementById('reader-open-btn');
    if (btn) {
      btn.addEventListener('click', () => {
        const contentEl = document.getElementById('reader-content');
        // Get the article URL from data attribute or use default
        const url = (contentEl as any)?.dataset?.url || 'https://zeeguu.org';
        callback(url);
      });
    }
  }

  setOpenButtonUrl(url: string): void {
    const btn = document.getElementById('reader-open-btn');
    if (btn) {
      btn.dataset.url = url;
    }
  }
}
