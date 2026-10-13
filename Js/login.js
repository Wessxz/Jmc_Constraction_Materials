window.handleLogin = async function(form) {
  const btn = document.getElementById('submit-btn');
  const errorBox = document.getElementById('error-box');

  /* Get values from form */
  const email = form.querySelector('input[name="email"]').value.trim();
  const password = form.querySelector('input[name="password"]').value;

  /* Hide old error */
  errorBox.style.display = 'none';

  /* Disable button while loading */
  btn.disabled = true;
  btn.textContent = 'Signing in...';

  try {
    console.log('[Login] Attempting login to:', '/api/auth/login.php');
    console.log('[Login] Email:', email);
    
    const res = await fetch('/api/auth/login.php', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ email, password })
    });
    
    console.log('[Login] Response status:', res.status);
    
    if (!res.ok) {
      throw new Error(`HTTP ${res.status}`);
    }
    
    const json = await res.json();
    console.log('[Login] Response data:', json);

    if (json.success) {
      /* Check for redirect parameter */
      const urlParams = new URLSearchParams(window.location.search);
      const redirectTo = urlParams.get('redirect');
      
      /* Redirect based on role or redirect parameter */
      const role = json.user.role;
      if (role === 'admin')   window.location.href = 'admin.html';
      else if (role === 'staff')   window.location.href = 'staff.html';
      else if (role === 'cashier') window.location.href = 'cashier.html';
      else if (role === 'driver')  window.location.href = 'driver.html';
      else {
        // Customer: redirect to specified page or default to Page.html
        window.location.href = redirectTo || 'Page.html';
      }
    } else {
      /* Show specific message for unverified accounts */
      if (json.pending_verification) {
        errorBox.innerHTML = `${json.message}<br><small style="color:#94a3b8;">Didn't receive the email? <a href="#" onclick="resendVerification('${email.replace(/'/g,"\\'")}'); return false;" style="color:#f97316;">Resend verification email</a></small>`;
      } else {
        errorBox.textContent = json.message || 'Invalid email or password.';
      }
      errorBox.style.display = 'block';
      btn.disabled = false;
      btn.textContent = 'Login';
    }
  } catch (err) {
    errorBox.textContent = 'Login failed. Make sure the server is running.';
    errorBox.style.display = 'block';
    btn.disabled = false;
    btn.textContent = 'Login';
  }
};

// Show success message if redirected from email verification
document.addEventListener('DOMContentLoaded', () => {
  const params = new URLSearchParams(window.location.search);
  if (params.get('verified') === '1') {
    const errorBox = document.getElementById('error-box');
    if (errorBox) {
      errorBox.textContent = 'Email verified successfully! You can now log in.';
      errorBox.style.display = 'block';
      errorBox.style.background = '#d1fae5';
      errorBox.style.color = '#065f46';
      errorBox.style.border = '1px solid #6ee7b7';
    }
  }
});

async function resendVerification(email) {
  try {
    const res = await fetch('/api/auth/resend-verification', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email })
    });
    const json = await res.json();
    alert(json.message || 'Verification email sent!');
  } catch (err) {
    alert('Failed to resend. Please try again.');
  }
}
