/**
 * WelcomeView - Initial screen allowing user to choose login or demo
 */

export class WelcomeView {
  private viewId = 'welcome-view';

  render(): void {
    this.showView();
  }

  private showView(): void {
    this.setActiveView();
  }

  private setActiveView(): void {
    document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
    const view = document.getElementById(this.viewId);
    if (view) {
      view.classList.add('active');
    }
  }

  onLoginClick(callback: () => void): void {
    const btn = document.getElementById('login-choice-btn');
    if (btn) {
      btn.addEventListener('click', callback);
    }
  }

  onDemoClick(callback: () => void): void {
    const btn = document.getElementById('try-demo-btn');
    if (btn) {
      btn.addEventListener('click', callback);
    }
  }
}
