window.handleRegister = async function(form) {
    const btn = form.querySelector('.btn-submit') || form.querySelector('[type="submit"]');

    // Collect input values
    const fullName = form.querySelector('input[name="full_name"]').value.trim();
    const email    = form.querySelector('input[name="email"]').value.trim();
    const phone    = form.querySelector('input[name="phone"]').value.trim();
    const town     = form.querySelector('input[name="town"]').value.trim();
    const address  = form.querySelector('input[name="address"]').value.trim();
    const password = form.querySelector('input[name="password"]').value;
    const confirmPassword = document.getElementById('confirm-password')?.value || '';

    if (password !== confirmPassword) {
      alert("Passwords do not match!");
      return;
    }

    // Validate phone number: must be exactly 11 digits, numbers only
    if (!/^\d{11}$/.test(phone)) {
      alert("Phone number must be exactly 11 digits (numbers only).");
      return;
    }

    if (btn) { btn.disabled = true; btn.innerText = "Creating..."; }

    try {
      const res = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          full_name: fullName,
          email: email,
          phone: phone,
          town: town,
          address: address,
          password: password,
          role: 'customer'
        })
      });
      const json = await res.json();
      
      if (json.success) {
        // Preserve redirect parameter
        const urlParams = new URLSearchParams(window.location.search);
        const redirectParam = urlParams.get('redirect') ? `?redirect=${urlParams.get('redirect')}` : '';
        
        if (json.pending_verification) {
          form.innerHTML = `
            <div style="text-align:center; padding: 20px;">
              <div style="font-size:48px; margin-bottom:16px;">&#9993;</div>
              <h3 style="color:#1e3a8a; margin-bottom:10px;">Check your email!</h3>
              <p style="color:#475569; margin-bottom:6px;">We sent a verification link to:</p>
              <p style="font-weight:700; color:#0f172a; margin-bottom:20px;">${email}</p>
              <p style="color:#64748b; font-size:14px;">Click the link in the email to activate your account.</p>
              <a href="login.html${redirectParam}" style="display:inline-block; margin-top:20px; padding:10px 24px;
                background:#f97316; color:white; border-radius:8px; text-decoration:none;
                font-weight:700;">Go to Login</a>
            </div>
          `;
        } else {
          alert('Account created successfully! You can now log in.');
          window.location.href = `login.html${redirectParam}`;
        }
      } else {
        alert(json.error || json.message || 'Registration failed.');
      }
    } catch (err) {
      alert('An error occurred during registration. Check if server is running.');
      console.error(err);
    } finally {
      if (btn) { btn.disabled = false; btn.innerText = "Create Account"; }
    }
};
