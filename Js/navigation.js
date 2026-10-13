// SEARCH FUNCTIONALITY
const searchBtn = document.querySelector('.search-button');
const searchInput = document.querySelector('.search');
if (searchBtn && searchInput) {
  searchBtn.addEventListener('click', () => {
    const query = searchInput.value.trim();
    if (query) {
      alert(`Search feature is under construction! You searched for: ${query}`);
    }
  });
}

// AUTH STATE  check if user is logged in and update header buttons
window._jmcLoggedIn = false;

document.addEventListener('DOMContentLoaded', async () => {
  try {
    const res = await fetch('/api/auth/me');
    const json = await res.json();

    if (json.success) {
      window._jmcLoggedIn = true;
      window._jmcUser = json.user;
      const user = json.user;

      if (typeof loadCartFromDB === 'function') loadCartFromDB();

      const headerActions = document.querySelector('.header-right') || document.querySelector('.header-actions');
      if (headerActions) {
        const loginBtn    = headerActions.querySelector('#login-link');
        const registerBtn = headerActions.querySelector('#register-link');

        if (loginBtn) {
          loginBtn.textContent = `Hi, ${user.full_name.split(' ')[0]}`;
          loginBtn.href = 'account.html';
          loginBtn.classList.remove('btn-login');
          loginBtn.classList.add('btn-register');
        }
        if (registerBtn) {
          registerBtn.textContent = 'Logout';
          registerBtn.href = '#';
          registerBtn.classList.remove('btn-register');
          registerBtn.classList.add('btn-login');
          registerBtn.addEventListener('click', async (e) => {
            e.preventDefault();
            await fetch('/api/auth/logout', { method: 'POST' });
            window.location.reload();
          });
        }
      }

      // Legacy topbar support
      const rightSide = document.querySelector('.right-side');
      if (rightSide) {
        rightSide.innerHTML = `
          <a href="account.html" style="color:white; margin-right:15px; text-decoration:none;">
            Welcome, <strong>${user.full_name}</strong>
          </a>
          <a href="#" id="logout-link" style="color:#ffda79;">Logout</a>
        `;
        document.getElementById('logout-link')?.addEventListener('click', async (e) => {
          e.preventDefault();
          await fetch('/api/auth/logout', { method: 'POST' });
          window.location.reload();
        });
      }
    } else {
      // ═══════════════════════════════════════════════════════════════════════
      // HANDLE SESSION KICKED OUT
      // ═══════════════════════════════════════════════════════════════════════
      if (json.logout && json.reason) {
        // User was logged out due to another device login
        const messages = {
          'Session logged out from another device': 'Your account was logged in from another device.',
          'Session expired due to inactivity': 'Your session has expired due to inactivity.',
          'Device mismatch detected': 'Security error: Device verification failed.'
        };
        
        const message = messages[json.reason] || json.message;
        
        // Store message to show on login page
        sessionStorage.setItem('loginMessage', message);
        
        // Redirect to login if on protected page
        const protectedPages = ['admin.html', 'cashier.html', 'account.html', 'staff.html', 'driver.html'];
        const currentPage = window.location.pathname.split('/').pop();
        
        if (protectedPages.includes(currentPage)) {
          window.location.href = '/login.html';
        }
      }
    }
  } catch (err) {
    console.error('Auth check error:', err);
  }
});
