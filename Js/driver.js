// driver.js
document.addEventListener("DOMContentLoaded", async () => {
  const loginScreen = document.getElementById("driver-login-screen");
  const mainScreen = document.getElementById("driver-main-screen");
  const logoutBtn = document.getElementById("logout-btn");
  const activeDriverLabel = document.getElementById("active-driver-name");
  const container = document.getElementById("delivery-list-container");

  let currentDriver = null;

  // -- Try session-based auth first ------------------------------------------
  console.log('[Driver] Checking authentication...');
  try {
    const res = await fetch('/api/auth/me', { credentials: 'include' });
    const json = await res.json();
    console.log('[Driver] Auth response:', json);
    
    if (json.success && json.user && json.user.role === 'driver') {
      // Driver is logged in - use their full name directly
      currentDriver = json.user.full_name;
      console.log('[Driver] Auto-login successful. Driver:', currentDriver);
      showMainScreen(currentDriver);
      return; // Skip login screen completely
    } else {
      // Not a driver session - fall back to name-input screen
      console.log('[Driver] Not a driver session. Role:', json.user?.role);
      showLoginScreen();
    }
  } catch (err) {
    console.error('[Driver] Auth check failed:', err);
    showLoginScreen();
  }

  // -- Fallback: name-input login (for quick local testing) ------------------
  const loginBtn = document.getElementById("driver-login-btn");
  const driverNameInput = document.getElementById("login-driver-name");

  if (loginBtn) {
    loginBtn.addEventListener("click", () => {
      const name = driverNameInput ? driverNameInput.value.trim() : '';
      if (name) {
        currentDriver = name;
        showMainScreen(name);
      } else {
        alert("Please enter a valid driver name!");
      }
    });
  }

  logoutBtn?.addEventListener("click", async () => {
    await fetch('/api/auth/logout', { method: 'POST' });
    window.location.href = 'login.html';
  });

  function showLoginScreen() {
    if (loginScreen) loginScreen.style.display = "flex";
    if (mainScreen) mainScreen.style.display = "none";
  }

  function showMainScreen(name) {
    if (loginScreen) loginScreen.style.display = "none";
    if (mainScreen) mainScreen.style.display = "block";
    if (activeDriverLabel) activeDriverLabel.innerText = name;
    loadDeliveries();
  }

  window.loadDeliveries = async function() {
    if (!currentDriver) {
      container.innerHTML = "<p style='text-align:center; padding:20px; color:#64748b;'>Please log in first.</p>";
      return;
    }

    container.innerHTML = "<p style='text-align:center; padding:20px; color:#64748b;'>Loading your tasks...</p>";

    const res = await DeliveriesAPI.getDeliveriesByDriver(currentDriver);
    if (!res.success) {
      container.innerHTML = "<p style='text-align:center; padding:20px; color:#dc2626;'>Error loading deliveries.</p>";
      return;
    }

    // Sort: out_for_delivery first, then pending, then delivered
    const data = res.data.sort((a, b) => {
      const order = { out_for_delivery: 0, pending: 1, failed: 2, delivered: 3 };
      return (order[a.status] ?? 9) - (order[b.status] ?? 9);
    });

    renderCards(data);
  };

  function renderCards(deliveries) {
    // ── Summary bar ──────────────────────────────────────────────────────────
    const summaryBar = document.getElementById('driver-summary-bar');
    const statTotal   = document.getElementById('stat-total');
    const statPending = document.getElementById('stat-pending');
    const statDone    = document.getElementById('stat-done');
    const custList    = document.getElementById('customer-summary-list');

    if (deliveries.length === 0) {
      if (summaryBar) summaryBar.style.display = 'none';
      container.innerHTML = `
        <div class="empty-state">
          <h3>No Deliveries</h3>
          <p>You have no assigned tasks right now.</p>
        </div>
      `;
      return;
    }

    // Compute stats
    const total   = deliveries.length;
    const pending = deliveries.filter(d => d.status !== 'delivered' && d.status !== 'failed').length;
    const done    = deliveries.filter(d => d.status === 'delivered').length;

    if (summaryBar) summaryBar.style.display = 'block';
    if (statTotal)   statTotal.textContent   = total;
    if (statPending) statPending.textContent = pending;
    if (statDone)    statDone.textContent    = done;

    // Customer summary list -- each customer + their order ref
    if (custList) {
      const PREVIEW = 5;
      const allRows = deliveries.map((d, i) => {
        const isDone = d.status === 'delivered';
        const isBulk = d.order_id && d.order_id.startsWith('BLK-');
        return `
          <div class="cust-row" style="display:flex; align-items:center; justify-content:space-between; padding:5px 8px; background:${isDone ? '#f0fdf4' : '#f8fafc'}; border-radius:8px;">
            <div style="display:flex; align-items:center; gap:8px;">
              <span style="background:#e2e8f0; color:#475569; width:20px; height:20px; border-radius:50%; font-size:0.7rem; font-weight:700; display:flex; align-items:center; justify-content:center; flex-shrink:0;">${i + 1}</span>
              <div>
                <div style="font-size:0.82rem; font-weight:700; color:#0f172a;">${d.customerName}</div>
                <div style="font-size:0.72rem; color:#64748b;">${d.order_id || d.delivery_ref} ${isBulk ? '· Bulk' : ''}</div>
              </div>
            </div>
            <span style="font-size:0.7rem; font-weight:700; padding:2px 8px; border-radius:20px; ${
              isDone
                ? 'background:#d1fae5; color:#065f46;'
                : d.status === 'out_for_delivery'
                  ? 'background:#bfdbfe; color:#1e40af;'
                  : 'background:#fef9c3; color:#854d0e;'
            }">${isDone ? '✓ Done' : d.status === 'out_for_delivery' ? 'En Route' : 'Pending'}</span>
          </div>`;
      });

      const hasMore = allRows.length > PREVIEW;

      custList.innerHTML = `
        <div id="cust-preview" style="display:flex; flex-direction:column; gap:4px;">
          ${allRows.slice(0, PREVIEW).join('')}
        </div>
        ${hasMore ? `
          <div id="cust-all" style="display:none; flex-direction:column; gap:4px;">
            ${allRows.slice(PREVIEW).join('')}
          </div>
          <button onclick="toggleCustList(this)" 
            style="margin-top:8px; width:100%; padding:7px; background:#f1f5f9; border:1px solid #e2e8f0; border-radius:8px; font-size:0.78rem; font-weight:600; color:#475569; cursor:pointer;">
            View All ${allRows.length} customers ▼
          </button>
        ` : ''}
      `;
    }

    // ── Cards ─────────────────────────────────────────────────────────────────
    let html = '';
    deliveries.forEach((del, idx) => {
      const ref         = del.delivery_ref;
      const isCompleted = del.status === 'delivered';
      const isOut       = del.status === 'out_for_delivery';
      const isBulk      = del.order_id && del.order_id.startsWith('BLK-');
      const itemsHtml   = del.items.map(i => `<span style="display:inline-block; background:#e2e8f0; border-radius:6px; padding:2px 8px; font-size:0.78rem; margin:2px 2px 2px 0;">${i.qty}× ${i.name}</span>`).join('');
      const totalItems  = del.items.reduce((s, i) => s + (i.qty || 1), 0);

      html += `
        <div class="delivery-card" id="card-${ref}">
          <!-- Card header: sequence number + ref + order + status -->
          <div class="card-header">
            <div style="display:flex; align-items:center; gap:10px;">
              <div style="background:#f97316; color:#fff; width:32px; height:32px; border-radius:50%; font-size:0.85rem; font-weight:800; display:flex; align-items:center; justify-content:center; flex-shrink:0;">${idx + 1}</div>
              <div>
                <div style="font-weight:800; font-size:1rem; color:#0f172a;">${del.delivery_ref}</div>
                <div style="display:flex; align-items:center; gap:6px; margin-top:2px;">
                  <span style="font-size:0.78rem; color:#64748b;">${del.order_id || '--'}</span>
                  ${isBulk ? '<span style="background:#fef3c7; color:#92400e; padding:1px 6px; border-radius:8px; font-size:0.68rem; font-weight:700;">BULK</span>' : ''}
                </div>
              </div>
            </div>
            <span class="status-badge ${del.status}">
              ${del.status.replace(/_/g, ' ')}
            </span>
          </div>

          <!-- Customer info block -->
          <div style="background:#f8fafc; border-radius:10px; padding:12px;">
            <div style="font-size:1rem; font-weight:700; color:#0f172a; margin-bottom:4px;">👤 ${del.customerName}</div>
            ${del.contactNumber ? `<div style="font-size:0.85rem; color:#475569; margin-bottom:2px;">📞 <a href="tel:${del.contactNumber}" style="color:#1d4ed8; font-weight:600;">${del.contactNumber}</a></div>` : ''}
            ${del.address ? `<div style="font-size:0.82rem; color:#64748b;">📍 ${del.address}</div>` : ''}
          </div>

          <!-- Items -->
          <div>
            <div style="font-size:0.75rem; font-weight:700; color:#64748b; text-transform:uppercase; letter-spacing:0.05em; margin-bottom:6px;">
              Package · ${totalItems} item${totalItems !== 1 ? 's' : ''}
            </div>
            <div style="line-height:1.8;">${itemsHtml}</div>
          </div>

          ${del.notes ? `<div style="padding:8px 12px; background:#fffbeb; border-left:3px solid #f59e0b; border-radius:0 8px 8px 0; font-size:0.82rem; color:#92400e;"><strong>Note:</strong> ${del.notes}</div>` : ''}

          <!-- Actions -->
          <div class="actions">
            ${del.status === 'pending'
              ? `<div style="text-align:center; padding:10px; background:#fef9c3; border-radius:8px; font-size:0.85rem; color:#854d0e; font-weight:600;">⏳ Waiting for dispatch from base</div>`
              : ''}
            ${isOut
              ? `<button class="btn-large btn-success" onclick="toggleUploadUI('${ref}')">📷 Finish &amp; Upload Proof</button>`
              : ''}
            ${isCompleted
              ? `<div style="text-align:center; color:#10b981; font-weight:700; padding:10px; background:#f0fdf4; border-radius:8px;">✅ Delivered</div>`
              : ''}
          </div>

          <!-- Upload proof section -->
          <div class="upload-container" id="upload-ui-${ref}">
            <h3>Proof of Delivery</h3>
            <label class="camera-btn">
              Tap to Attach Photo
              <input type="file" accept="image/*" capture="environment" id="file-${ref}" onchange="previewImage(event, '${ref}')">
            </label>
            <img class="preview-img" id="preview-${ref}" />
            <textarea class="remark-input" id="remark-${ref}" placeholder="Enter any specific remarks (e.g. Left at gate)..."></textarea>
            <button class="btn-large btn-success" onclick="submitDelivery('${ref}')">Submit Complete Order</button>
            <button class="btn-large btn-secondary" onclick="toggleUploadUI('${ref}')">Cancel</button>
          </div>
        </div>
      `;
    });

    container.innerHTML = html;
  }

  window.toggleCustList = function(btn) {
    const allDiv = document.getElementById('cust-all');
    const isHidden = allDiv.style.display === 'none';
    allDiv.style.display = isHidden ? 'flex' : 'none';
    allDiv.style.flexDirection = 'column';
    allDiv.style.gap = '4px';
    const total = document.querySelectorAll('.cust-row').length;
    btn.textContent = isHidden
      ? 'Show Less ▲'
      : `View All ${total} customers ▼`;
  };

  window.toggleUploadUI = function(ref) {
    const ui = document.getElementById(`upload-ui-${ref}`);
    ui.style.display = (ui.style.display === 'flex') ? 'none' : 'flex';
  };

  window.previewImage = function(event, ref) {
    const file = event.target.files[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = function(e) {
        // Compress image before storing
        const img = new Image();
        img.onload = function() {
          const canvas = document.createElement('canvas');
          // Max 800px wide, keep aspect ratio
          const maxW = 800;
          const scale = img.width > maxW ? maxW / img.width : 1;
          canvas.width  = img.width  * scale;
          canvas.height = img.height * scale;
          canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
          // Compress to JPEG at 60% quality
          const compressed = canvas.toDataURL('image/jpeg', 0.6);

          const preview = document.getElementById(`preview-${ref}`);
          preview.src = compressed;
          preview.style.display = 'block';
          preview.setAttribute('data-b64', compressed);
        };
        img.src = e.target.result;
      };
      reader.readAsDataURL(file);
    }
  };

  window.submitDelivery = async function(ref) {
    const imgElement = document.getElementById(`preview-${ref}`);
    const b64 = imgElement?.getAttribute('data-b64');
    const remarks = document.getElementById(`remark-${ref}`).value.trim();

    if (!b64) {
      alert('Please take a proof of delivery photo!');
      return;
    }

    const btn = event.target;
    btn.disabled = true;
    btn.innerText = 'Submitting...';

    try {
      const res = await DeliveriesAPI.submitProofOfDelivery(ref, b64, remarks);
      if (res.success) {
        alert('Delivery completed successfully!');
        loadDeliveries();
      } else {
        alert(res.error || 'Error saving delivery completion.');
        btn.disabled = false;
        btn.innerText = 'Submit Complete Order';
      }
    } catch(err) {
      alert('Error saving delivery completion.');
      btn.disabled = false;
      btn.innerText = 'Submit Complete Order';
    }
  };

});
