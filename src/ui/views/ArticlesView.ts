/**
 * ArticlesView - Display list of articles for selected language
 */

export class ArticlesView {
  private viewId = 'articles-view';

  render(languageName: string): void {
    const articlesTitle = document.getElementById('articles-title');
    if (articlesTitle) {
      articlesTitle.textContent = `${languageName} - Articles`;
    }
    this.showView();
  }

  private showView(): void {
    document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
    const view = document.getElementById(this.viewId);
    if (view) {
      view.classList.add('active');
    }
  }

  setLoading(loading: boolean): void {
    const loadingEl = document.getElementById('articles-loading');
    if (loadingEl) {
      loadingEl.style.display = loading ? 'block' : 'none';
    }
  }

  renderArticles(articles: any[], onArticleClick: (article: any) => void): void {
    const list = document.getElementById('articles-list');
    if (!list) return;

    list.innerHTML = '';

    if (!articles || articles.length === 0) {
      list.innerHTML = '<p style="color: #999; text-align: center; padding: 20px;">No articles found</p>';
      return;
    }

    articles.forEach((article: any) => {
      const card = document.createElement('div');
      card.className = 'article-card';
      card.innerHTML = `
        <div class="article-title">${article.title || 'Untitled'}</div>
        <div class="article-meta">${article.source || 'Unknown'} • ${article.cefr_level || 'A1'}</div>
      `;
      card.addEventListener('click', () => onArticleClick(article));
      list.appendChild(card);
    });
  }

  setError(message: string): void {
    const list = document.getElementById('articles-list');
    if (list) {
      list.innerHTML = `<p style="color: #d32f2f;">Error: ${message}</p>`;
    }
  }

  onBackClick(callback: () => void): void {
    const btn = document.getElementById('back-btn');
    if (btn) {
      btn.addEventListener('click', callback);
    }
  }
}
