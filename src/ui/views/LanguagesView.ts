/**
 * LanguagesView - Language selection grid
 */

export class LanguagesView {
  private viewId = 'languages-view';

  render(userEmail: string, isDemoMode: boolean): void {
    this.updateUserInfo(userEmail, isDemoMode);
    this.showView();
  }

  private showView(): void {
    document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
    const view = document.getElementById(this.viewId);
    if (view) {
      view.classList.add('active');
    }
  }

  private updateUserInfo(userEmail: string, isDemoMode: boolean): void {
    const userEmailEl = document.getElementById('user-email');
    const logoutBtn = document.getElementById('logout-btn');
    const backBtn = document.getElementById('back-from-languages-btn');

    if (userEmailEl) {
      const displayText = isDemoMode ? `Demo Mode - ${userEmail}` : `Logged in as: ${userEmail}`;
      userEmailEl.textContent = displayText;
    }

    if (isDemoMode) {
      if (logoutBtn) logoutBtn.style.display = 'none';
      if (backBtn) backBtn.style.display = 'block';
    } else {
      if (logoutBtn) logoutBtn.style.display = 'block';
      if (backBtn) backBtn.style.display = 'none';
    }
  }

  setLoading(loading: boolean): void {
    const spinner = document.getElementById('loading-spinner');
    if (spinner) {
      spinner.style.display = loading ? 'block' : 'none';
    }
  }

  renderLanguages(languages: any[], onLanguageSelect: (language: any) => void): void {
    const grid = document.getElementById('languages-grid');
    if (!grid) return;

    grid.innerHTML = '';

    languages.forEach((lang: any) => {
      const btn = document.createElement('button');
      btn.className = 'language-btn';
      btn.textContent = `${lang.name}\n(${lang.code})`;
      btn.addEventListener('click', () => onLanguageSelect(lang));
      grid.appendChild(btn);
    });
  }

  setError(message: string): void {
    const grid = document.getElementById('languages-grid');
    if (grid) {
      grid.innerHTML = `<p style="color: #d32f2f; grid-column: 1/3;">Error: ${message}</p>`;
    }
  }

  onLogoutClick(callback: () => void): void {
    const btn = document.getElementById('logout-btn');
    if (btn) {
      btn.addEventListener('click', callback);
    }
  }

  onBackClick(callback: () => void): void {
    const btn = document.getElementById('back-from-languages-btn');
    if (btn) {
      btn.addEventListener('click', callback);
    }
  }
}
