/**
 * LoginView - Email/password login form
 */

export class LoginView {
  private viewId = 'login-view';

  render(): void {
    this.showView();
  }

  private showView(): void {
    document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
    const view = document.getElementById(this.viewId);
    if (view) {
      view.classList.add('active');
    }
  }

  onSubmit(callback: (email: string, password: string) => void): void {
    const form = document.getElementById('login-form') as HTMLFormElement;
    if (form) {
      form.addEventListener('submit', (e: Event) => {
        e.preventDefault();
        const emailInput = document.getElementById('email') as HTMLInputElement;
        const passwordInput = document.getElementById('password') as HTMLInputElement;

        if (emailInput && passwordInput) {
          callback(emailInput.value, passwordInput.value);
        }
      });
    }
  }

  onBackClick(callback: () => void): void {
    const btn = document.getElementById('back-from-login-btn');
    if (btn) {
      btn.addEventListener('click', callback);
    }
  }

  setError(message: string): void {
    const errorDiv = document.getElementById('login-error');
    if (errorDiv) {
      errorDiv.textContent = '❌ ' + message;
      errorDiv.classList.add('show');
    }
  }

  clearError(): void {
    const errorDiv = document.getElementById('login-error');
    if (errorDiv) {
      errorDiv.classList.remove('show');
      errorDiv.textContent = '';
    }
  }

  reset(): void {
    const form = document.getElementById('login-form') as HTMLFormElement;
    if (form) {
      form.reset();
    }
    this.clearError();
  }

  setButtonDisabled(disabled: boolean): void {
    const btn = document.getElementById('login-btn') as HTMLButtonElement;
    if (btn) {
      btn.disabled = disabled;
    }
  }
}
