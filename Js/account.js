document.addEventListener('DOMContentLoaded', async () => {

    /* ----------------------------------
       LOAD LOGGED-IN USER FROM SERVER
    ---------------------------------- */
    let currentUser = null;

    try {
        const res = await fetch('/api/auth/me');
        const json = await res.json();

        if (json.success && json.user) {
            currentUser = json.user;
            populateProfile(currentUser);
        } else {
            // Not logged in  redirect to login
            window.location.href = 'login.html';
            return;
        }
    } catch (err) {
        console.error('Failed to fetch user profile:', err);
    }

    function populateProfile(user) {
        const name = user.full_name || '';
        const email = user.email || '';
        const phone = user.phone || '';
        const town = user.town || '';
        const address = user.address || '';

        // Sidebar greeting
        const displayUsername = document.getElementById('display-username');
        if (displayUsername) displayUsername.textContent = name;

        // Dashboard welcome message
        document.querySelectorAll('.welcome-name').forEach(el => el.textContent = name);

        // Account Details form
        const nameInput = document.getElementById('account-display-name');
        const emailInput = document.getElementById('account-email');
        if (nameInput) nameInput.value = name;
        if (emailInput) emailInput.value = email;

        // Address form
        const billName = document.getElementById('bill-name');
        const billPhone = document.getElementById('bill-phone');
        const billStreet = document.getElementById('bill-street');
        const billCity = document.getElementById('bill-city');
        if (billName) billName.value = name;
        if (billPhone) billPhone.value = phone;
        if (billStreet) billStreet.value = address;
        if (billCity) billCity.value = town;
    }

    /* ----------------------------------
       TAB NAVIGATION
    ---------------------------------- */
    const sidebarBtns = document.querySelectorAll('.sidebar-btn[data-target]');
    const contentSections = document.querySelectorAll('.content-section');

    sidebarBtns.forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.preventDefault();

            sidebarBtns.forEach(b => b.classList.remove('active'));
            contentSections.forEach(s => s.classList.remove('active'));

            btn.classList.add('active');
            const targetId = btn.getAttribute('data-target');
            document.getElementById(targetId).classList.add('active');
        });
    });

    // Open My Reservations (orders) tab by default
    document.querySelector('[data-target="orders-section"]')?.classList.add('active');
    document.getElementById('orders-section')?.classList.add('active');

    /* ----------------------------------
       TOAST NOTIFICATION
    ---------------------------------- */
    const toast = document.getElementById('toast');
    function showToast(message) {
        toast.textContent = message;
        toast.classList.add('show');
        setTimeout(() => toast.classList.remove('show'), 3000);
    }

    /* ----------------------------------
       ACCOUNT DETAILS FORM  Save to server
    ---------------------------------- */
    const detailsForm = document.getElementById('details-form');
    if (detailsForm) {
        detailsForm.addEventListener('submit', async (e) => {
            e.preventDefault();

            const newName    = document.getElementById('account-display-name').value.trim();
            const newEmail   = document.getElementById('account-email').value.trim();
            const currentPass = document.getElementById('current-pass').value;
            const newPass     = document.getElementById('new-pass').value;
            const confirmPass = document.getElementById('confirm-pass').value;

            if (newPass || confirmPass) {
                if (newPass !== confirmPass) {
                    showToast('New passwords do not match!');
                    return;
                }
            }

            const payload = { full_name: newName, email: newEmail };
            if (newPass) {
                payload.current_password = currentPass;
                payload.new_password = newPass;
            }

            try {
                const res = await fetch('/api/auth/update-profile', {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload)
                });
                const json = await res.json();

                if (json.success) {
                    currentUser = json.user;
                    populateProfile(currentUser);
                    document.getElementById('current-pass').value = '';
                    document.getElementById('new-pass').value = '';
                    document.getElementById('confirm-pass').value = '';
                    showToast('Account details saved successfully!');
                } else {
                    showToast(json.message || 'Failed to save changes.');
                }
            } catch (err) {
                showToast('Server error. Please try again.');
            }
        });
    }

    /* ----------------------------------
       ADDRESS FORM  Save to server
    ---------------------------------- */
    const addressForm = document.getElementById('address-form');
    if (addressForm) {
        addressForm.addEventListener('submit', async (e) => {
            e.preventDefault();

            const payload = {
                full_name: document.getElementById('bill-name').value.trim(),
                phone:     document.getElementById('bill-phone').value.trim(),
                address:   document.getElementById('bill-street').value.trim(),
                town:      document.getElementById('bill-city').value.trim(),
            };

            try {
                const res = await fetch('/api/auth/update-profile', {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload)
                });
                const json = await res.json();

                if (json.success) {
                    currentUser = json.user;
                    populateProfile(currentUser);
                    showToast('Address saved successfully!');
                } else {
                    showToast(json.message || 'Failed to save address.');
                }
            } catch (err) {
                showToast('Server error. Please try again.');
            }
        });
    }

    /* ----------------------------------
       BULK ORDERS (from server)
    ---------------------------------- */
    const bulkOrdersList = document.getElementById('bulk-orders-list');

    async function loadMyBulkOrders() {
        if (!bulkOrdersList || !currentUser) return;

        bulkOrdersList.innerHTML = '<p style="text-align:center; color:#94a3b8; padding:20px 0;">Loading</p>';

        try {
            const res  = await fetch('/api/bulk-orders/index.php?my=1');
            const json = await res.json();

            let orders = json.success && Array.isArray(json.data) ? json.data : [];

            if (orders.length === 0) {
                bulkOrdersList.innerHTML = `
                  <div style="text-align:center; padding:40px 20px; color:#94a3b8;">
                    <p style="font-size:1.1rem; margin-bottom:12px;">No bulk order inquiries yet.</p>
                    <a href="bulk-orders.html" class="btn" style="display:inline-block; padding:10px 24px;">Submit a Bulk Order</a>
                  </div>`;
                return;
            }

            const statusColors = {
                pending:    { color: '#92400e', bg: '#fef3c7' },
                quoted:     { color: '#1e40af', bg: '#dbeafe' },
                confirmed:  { color: '#065f46', bg: '#d1fae5' },
                processing: { color: '#6b21a8', bg: '#f3e8ff' },
                delivered:  { color: '#0e7490', bg: '#cffafe' },
                completed:  { color: '#14532d', bg: '#bbf7d0' },
                cancelled:  { color: '#991b1b', bg: '#fee2e2' },
            };

            const statusDesc = {
                pending:    'Waiting for a quote from our team.',
                quoted:     "We've sent you a quotation. Please wait for confirmation.",
                confirmed:  'Your order is confirmed and being processed.',
                processing: 'Your materials are being prepared.',
                delivered:  'Your order is out for delivery.',
                completed:  'Order completed successfully.',
                cancelled:  'This order has been cancelled.',
            };

            bulkOrdersList.innerHTML = orders.map(o => {
                const sc = statusColors[o.status] || { color: '#374151', bg: '#f3f4f6' };
                const badge = `<span style="background:${sc.bg};color:${sc.color};padding:3px 12px;border-radius:20px;font-size:0.78rem;font-weight:700;text-transform:capitalize;">${o.status}</span>`;
                const date  = o.created_at ? o.created_at.substring(0, 10) : '';
                const items = Array.isArray(o.items) && o.items.length > 0
                    ? o.items.map(i => {
                        const name  = i.name || i.description || 'Unknown item';
                        const qty   = i.qty   ? ` × ${i.qty} ${i.unit || 'pcs'}` : '';
                        const price = i.price ? ` -- ₱${Number(i.price).toLocaleString('en-PH', {minimumFractionDigits:2})}` : '';
                        const sub   = i.subtotal ? ` (₱${Number(i.subtotal).toLocaleString('en-PH', {minimumFractionDigits:2})} total)` : '';
                        return `<li><strong>${name}</strong>${qty}${price}${sub}</li>`;
                    }).join('')
                    : '<li style="color:#94a3b8;">No items listed.</li>';
                const quotedAmt = o.quoted_amount > 0
                    ? `<div class="bulk-card-row"><span>Quoted Amount</span><strong>₱${Number(o.quoted_amount).toLocaleString('en-PH', {minimumFractionDigits:2})}</strong></div>` : '';
                const finalAmt = o.final_amount > 0
                    ? `<div class="bulk-card-row"><span>Final Amount</span><strong>₱${Number(o.final_amount).toLocaleString('en-PH', {minimumFractionDigits:2})}</strong></div>` : '';
                const notes = o.quotation_notes
                    ? `<div class="bulk-card-row"><span>Admin Notes</span><strong>${o.quotation_notes}</strong></div>` : '';
                const cancelInfo = o.status === 'cancelled' && o.cancel_reason
                    ? `<div class="bulk-card-row" style="color:#dc2626;"><span>Cancel Reason</span><strong>${o.cancel_reason}</strong></div>` : '';

                // Show confirm/decline buttons only when status is 'quoted'
                const confirmSection = o.status === 'quoted' ? `
                  <div style="margin-top:14px; padding:14px 16px; background:#eff6ff; border:1px solid #bfdbfe; border-radius:10px;">
                    <p style="font-size:0.85rem; font-weight:600; color:#1e40af; margin:0 0 4px;">Quotation Ready</p>
                    <p style="font-size:0.82rem; color:#3b82f6; margin:0 0 12px;">
                      Our team has sent a quote of <strong>₱${Number(o.quoted_amount).toLocaleString('en-PH', {minimumFractionDigits:2})}</strong>.
                      ${o.quotation_notes ? `<br>Note: ${o.quotation_notes}` : ''}
                    </p>
                    <div style="display:flex; gap:8px; flex-wrap:wrap;">
                      <button onclick="confirmBulkQuote('${o.bulk_ref}')"
                        style="padding:8px 18px; background:#1d4ed8; color:#fff; border:none; border-radius:7px; font-size:0.82rem; font-weight:700; cursor:pointer;">
                        Agree & Confirm
                      </button>
                      <button onclick="declineBulkQuote('${o.bulk_ref}')"
                        style="padding:8px 18px; background:#fff; color:#dc2626; border:1px solid #fca5a5; border-radius:7px; font-size:0.82rem; font-weight:600; cursor:pointer;">
                        ✕ Decline
                      </button>
                    </div>
                  </div>` : '';

                return `
                <div style="border:1px solid #e2e8f0; border-radius:12px; padding:20px 24px; margin-bottom:16px; background:#fff; box-shadow:0 1px 4px rgba(0,0,0,0.05);">
                  <div style="display:flex; justify-content:space-between; align-items:flex-start; flex-wrap:wrap; gap:10px; margin-bottom:14px;">
                    <div>
                      <span style="font-size:1rem; font-weight:700; color:#0f172a;">${o.bulk_ref}</span>
                      <span style="margin-left:10px; color:#64748b; font-size:0.85rem;">${date}</span>
                    </div>
                    <div style="display:flex; align-items:center; gap:10px;">${badge}</div>
                  </div>
                  <p style="font-size:0.85rem; color:#64748b; margin:0 0 14px;">${statusDesc[o.status] || ''}</p>
                  <div style="display:grid; grid-template-columns:1fr 1fr; gap:8px; font-size:0.85rem; margin-bottom:14px;">
                    <div class="bulk-card-row"><span style="color:#94a3b8;">Project Type</span><strong>${o.project_type || '--'}</strong></div>
                    <div class="bulk-card-row"><span style="color:#94a3b8;">Preferred Date</span><strong>${o.preferred_date || '--'}</strong></div>
                    <div class="bulk-card-row"><span style="color:#94a3b8;">Address</span><strong>${o.address}</strong></div>
                    ${quotedAmt}${finalAmt}${notes}${cancelInfo}
                  </div>
                  ${confirmSection}
                  <details style="cursor:pointer; margin-top:12px;">
                    <summary style="font-size:0.85rem; font-weight:600; color:#f97316;">View Materials List</summary>
                    <ul style="margin:10px 0 0 16px; font-size:0.85rem; color:#374151; line-height:1.8;">${items}</ul>
                  </details>
                </div>`;
            }).join('');

        } catch (err) {
            bulkOrdersList.innerHTML = '<p style="text-align:center; color:#ef4444; padding:20px 0;">Could not load bulk orders.</p>';
        }
    }

    // Load when tab is clicked
    document.querySelector('[data-target="bulk-orders-section"]')?.addEventListener('click', loadMyBulkOrders);

    window.confirmBulkQuote = async function(ref) {
        if (!confirm(`Confirm and agree to the quotation for ${ref}?`)) return;
        try {
            const res  = await fetch(`/api/bulk-orders/${ref}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ action: 'confirm' }),
                credentials: 'include'
            });
            const json = await res.json();
            if (json.success) {
                showToast('Quotation confirmed! Our team will prepare your order.');
                loadMyBulkOrders();
            } else {
                showToast(json.error || 'Failed to confirm. Please try again.');
            }
        } catch (err) {
            showToast('Server error. Please try again.');
        }
    };

    window.declineBulkQuote = async function(ref) {
        if (!confirm(`Decline the quotation for ${ref}? This will cancel the order.`)) return;
        try {
            const res  = await fetch(`/api/bulk-orders/${ref}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ action: 'cancel', cancel_reason: 'Customer declined quotation' }),
                credentials: 'include'
            });
            const json = await res.json();
            if (json.success) {
                showToast('Quotation declined. Order has been cancelled.');
                loadMyBulkOrders();
            } else {
                showToast(json.error || 'Failed to decline. Please try again.');
            }
        } catch (err) {
            showToast('Server error. Please try again.');
        }
    };


    const logoutBtn = document.querySelector('.sidebar-btn[href="login.html"]');
    if (logoutBtn) {
        logoutBtn.addEventListener('click', async (e) => {
            e.preventDefault();
            await fetch('/api/auth/logout', { method: 'POST' });
            window.location.href = 'login.html';
        });
    }

    /* ----------------------------------
       ORDERS (from server)
    ---------------------------------- */
    const ordersTbody = document.getElementById('orders-tbody');

    async function loadMyOrders() {
        if (!ordersTbody || !currentUser) return;

        ordersTbody.innerHTML = '<tr><td colspan="5" style="text-align:center; color:#94a3b8; padding:20px 0;">Loading reservations</td></tr>';

        try {
            const res = await fetch('/api/orders/my');
            const json = await res.json();
            const orders = json.success ? json.data : [];

            if (orders.length === 0) {
                ordersTbody.innerHTML = '<tr><td colspan="5" style="text-align:center; color:#94a3b8; padding:20px 0;">No reservations yet.</td></tr>';
                return;
            }

            ordersTbody.innerHTML = '';
            orders.forEach(order => {
                const statusLabel = order.status.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
                const badgeClass = `status-${order.status.toLowerCase().replace(/_/g, '-')}`;
                const isPending = order.status === 'pending';

                const itemSummary = Array.isArray(order.items) && order.items.length > 0
                    ? order.items.map(i => `${i.qty || 1}x ${i.name}`).join(', ')
                    : '';

                const cancelBtn = isPending
                    ? `<button class="btn btn-small btn-cancel" data-order-id="${order.id}" data-order-ref="${order.order_ref || order.id}" style="margin-top:6px; background:#fee2e2; color:#dc2626; border:1px solid #fca5a5;">Cancel Reservation</button>`
                    : '';

                const tr = document.createElement('tr');
                tr.setAttribute('data-order-id', order.id);
                // Build discount label for total cell
                const discountInfo = order.discount_type
                    ? `<div style="font-size:0.75rem;color:#dc2626;margin-top:2px;">
                           ${order.discount_type === 'promo' ? '🏷 Promo' : '📦 Bulk'} -₱${Number(order.discount_amount||0).toLocaleString('en-PH',{minimumFractionDigits:2})}
                       </div>`
                    : '';
                tr.innerHTML = `
                    <td><strong>${order.order_ref || order.id}</strong></td>
                    <td>${order.date || ''}</td>
                    <td><span class="status-badge ${badgeClass}">${statusLabel}</span></td>
                    <td>
                      ₱${Number(order.total).toLocaleString('en-PH', {minimumFractionDigits:2})}
                      ${discountInfo}
                    </td>
                    <td>
                      <button class="btn btn-small" onclick="openOrderTracking('${order.order_ref || order.id}', ${JSON.stringify(order).replace(/"/g, '&quot;')})">Track</button>
                      ${cancelBtn}
                    </td>
                `;
                ordersTbody.appendChild(tr);
            });

            // Wire cancel buttons  open reason modal instead of confirm()
            ordersTbody.querySelectorAll('.btn-cancel').forEach(btn => {
                btn.addEventListener('click', () => {
                    const orderRef = btn.getAttribute('data-order-ref');
                    openCancelModal(orderRef, btn);
                });
            });
        } catch (err) {
            ordersTbody.innerHTML = '<tr><td colspan="5" style="text-align:center; color:#ef4444; padding:20px 0;">Could not load orders.</td></tr>';
        }
    }

    await loadMyOrders();

    window.toggleOrderDetails = function(btn) {
        const td = btn.closest('td');
        const details = td ? td.querySelector('.order-details') : null;
        if (!details) return;
        const isOpen = details.style.display !== 'none';
        details.style.display = isOpen ? 'none' : 'block';
        btn.textContent = isOpen ? 'View' : 'Hide';
    };

    // --- ORDER TRACKING MODAL ------------------------------------------------
    const TRACKING_STEPS = [
        { key: 'pending',          label: 'Order Placed',   icon: '1', desc: 'Your order has been received.' },
        { key: 'processing',       label: 'Preparing Order',  icon: '2', desc: 'Staff is preparing your order.' },
        { key: 'ready_for_pickup', label: 'Ready for Pickup',     icon: '3', desc: 'Your order is ready! Please pick up soon.' },
        { key: 'completed',        label: 'Completed',            icon: '4', desc: 'Order successfully completed.' },
    ];

    const STEP_ORDER = ['pending', 'processing', 'ready_for_pickup', 'completed'];

    window.openOrderTracking = function(ref, order) {
        // Debug: log order data
        console.log('Order data:', order);
        console.log('Order type:', order.order_type);
        console.log('Status:', order.status);
        console.log('Pickup expires at:', order.pickup_expires_at);
        
        // Build modal HTML
        // Treat 'delivered' as final completed step for display purposes
        const displayStatus = order.status === 'delivered' ? 'completed' : order.status;
        const currentStep = STEP_ORDER.indexOf(displayStatus);
        const isCancelled = order.status === 'cancelled';
        const itemsHtml = Array.isArray(order.items) && order.items.length > 0
            ? order.items.map(i => `
                <div class="track-item-row">
                    <span class="track-item-name">${i.name}</span>
                    <span class="track-item-qty">x${i.qty || 1}</span>
                </div>`).join('')
            : '<p style="color:#94a3b8; font-size:0.85rem;">No items.</p>';

        const stepsHtml = isCancelled
            ? `<div class="track-cancelled">
                <p>This reservation has been <strong>cancelled</strong>.</p>
                ${order.cancel_reason ? `<p style="margin-top:8px; color:#64748b; font-size:0.875rem;">Reason: <strong>${order.cancel_reason}</strong></p>` : ''}
                ${order.cancel_notes  ? `<p style="color:#64748b; font-size:0.85rem; margin-top:4px;">Notes: ${order.cancel_notes}</p>` : ''}
               </div>`
            : TRACKING_STEPS.map((step, i) => {
                const isDone   = i <= currentStep;
                const isActive = i === currentStep;
                return `
                <div class="track-step ${isDone ? 'done' : ''} ${isActive ? 'active' : ''}">
                    <div class="track-step-icon">${step.icon}</div>
                    <div class="track-step-body">
                        <div class="track-step-label">${step.label}</div>
                        <div class="track-step-desc">${step.desc}</div>
                    </div>
                    ${i < TRACKING_STEPS.length - 1 ? '<div class="track-step-line"></div>' : ''}
                </div>`;
            }).join('');

        const modalHtml = `
        <div class="track-modal-overlay" id="track-modal-overlay" onclick="if(event.target===this) closeOrderTracking()">
          <div class="track-modal">
            <div class="track-modal-header">
              <div>
                <h3>Reservation Status</h3>
                <p class="track-ref">${ref}</p>
              </div>
              <button class="track-close" onclick="closeOrderTracking()">?</button>
            </div>
            <div class="track-modal-body">
              <div class="track-timeline">
                ${stepsHtml}
              </div>
              <div class="track-order-info">
                <div class="track-info-row">
                  <span>Order Date</span>
                  <strong>${order.date || order.created_at?.split('T')[0] || ''}</strong>
                </div>
                <div class="track-info-row">
                  <span>Order Type</span>
                  <strong>${order.order_type || 'online'}</strong>
                </div>
                ${order.pickup_expires_at && (order.status === 'processing' || order.status === 'ready_for_pickup') ? `
                <div class="track-info-row" style="background:#fef3c7;padding:8px 12px;border-radius:6px;border:1px solid #fbbf24;margin-top:8px;">
                  <span style="color:#92400e;font-weight:600;">Pickup Deadline</span>
                  <strong style="color:#b45309;">${new Date(order.pickup_expires_at).toLocaleString('en-PH', {
                    month: 'short', day: 'numeric', year: 'numeric',
                    hour: '2-digit', minute: '2-digit', hour12: true
                  })}</strong>
                </div>` : ''}
                ${order.discount_type ? `
                <div class="track-info-row">
                  <span>Discount</span>
                  <strong style="color:#dc2626;">${order.discount_type === 'promo' ? '🏷 Promo (5%)' : '📦 Bulk (10%)'}  saved ₱${Number(order.discount_amount||0).toLocaleString('en-PH',{minimumFractionDigits:2})}</strong>
                </div>` : ''}
                <div class="track-info-row">
                  <span>Total</span>
                  <strong>₱${Number(order.total).toLocaleString('en-PH', {minimumFractionDigits:2})}</strong>
                </div>
              </div>
              <div class="track-items">
                <p class="track-items-title">Items Ordered</p>
                ${itemsHtml}
              </div>
            </div>
          </div>
        </div>`;

        document.body.insertAdjacentHTML('beforeend', modalHtml);
    };

    window.closeOrderTracking = function() {
        document.getElementById('track-modal-overlay')?.remove();
    };
    const reservationsTbody = document.getElementById('reservations-tbody');
    if (reservationsTbody) {
        reservationsTbody.innerHTML = '<tr><td colspan="4" style="text-align:center;">No reservations found.</td></tr>';
    }

    // --- CANCEL RESERVATION MODAL --------------------------------------------
    function openCancelModal(orderRef, triggerBtn) {
        // Remove any existing modal
        document.getElementById('cancel-modal-overlay')?.remove();

        const modalHtml = `
        <div class="cancel-modal-overlay" id="cancel-modal-overlay"
             onclick="if(event.target===this) document.getElementById('cancel-modal-overlay').remove()">
          <div class="cancel-modal" style="
            background:#fff; border-radius:12px; padding:28px 32px;
            width:100%; max-width:440px; box-shadow:0 20px 60px rgba(0,0,0,0.18);
            position:relative;">
            <h3 style="margin:0 0 6px; font-size:1.1rem; color:#0f172a;">Cancel Reservation</h3>
            <p style="color:#64748b; font-size:0.875rem; margin:0 0 20px;">
              Order <strong>${orderRef}</strong>  please let us know why you're cancelling.
            </p>

            <label style="display:block; font-weight:600; font-size:0.875rem; margin-bottom:6px; color:#374151;">
              Reason <span style="color:#dc2626;">*</span>
            </label>
            <select id="cancel-reason-select" style="
              width:100%; padding:10px 12px; border:1px solid #d1d5db;
              border-radius:8px; font-size:0.9rem; margin-bottom:16px;
              background:#fff; color:#0f172a;">
              <option value=""> Select a reason </option>
              <option value="Changed my mind">Changed my mind</option>
              <option value="Found a better price">Found a better price</option>
              <option value="Ordered by mistake">Ordered by mistake</option>
              <option value="Delivery time too long">Delivery time too long</option>
              <option value="Need to change items">Need to change items / wrong variant</option>
              <option value="Financial reasons">Financial reasons</option>
              <option value="Other">Other</option>
            </select>

            <label style="display:block; font-weight:600; font-size:0.875rem; margin-bottom:6px; color:#374151;">
              Additional notes <span style="color:#94a3b8; font-weight:400;">(optional)</span>
            </label>
            <textarea id="cancel-notes-input" rows="3" placeholder="Any extra details" style="
              width:100%; padding:10px 12px; border:1px solid #d1d5db;
              border-radius:8px; font-size:0.875rem; resize:vertical;
              margin-bottom:20px; box-sizing:border-box;"></textarea>

            <div id="cancel-modal-error" style="
              display:none; color:#dc2626; font-size:0.8rem;
              margin-bottom:12px; padding:8px 12px;
              background:#fee2e2; border-radius:6px;"></div>

            <div style="display:flex; gap:10px; justify-content:flex-end;">
              <button id="cancel-modal-dismiss" style="
                padding:9px 20px; border:1px solid #d1d5db; border-radius:8px;
                background:#f8fafc; color:#374151; cursor:pointer; font-size:0.9rem;">
                Keep Reservation
              </button>
              <button id="cancel-modal-confirm" style="
                padding:9px 20px; border:none; border-radius:8px;
                background:#dc2626; color:#fff; cursor:pointer; font-size:0.9rem; font-weight:600;">
                Confirm Cancellation
              </button>
            </div>
          </div>
        </div>`;

        document.body.insertAdjacentHTML('beforeend', modalHtml);

        // Style the overlay
        const overlay = document.getElementById('cancel-modal-overlay');
        overlay.style.cssText = `
            position:fixed; inset:0; background:rgba(0,0,0,0.45);
            display:flex; align-items:center; justify-content:center;
            z-index:9999; padding:16px;`;

        document.getElementById('cancel-modal-dismiss').addEventListener('click', () => overlay.remove());

        document.getElementById('cancel-modal-confirm').addEventListener('click', async () => {
            const reason = document.getElementById('cancel-reason-select').value.trim();
            const notes  = document.getElementById('cancel-notes-input').value.trim();
            const errBox = document.getElementById('cancel-modal-error');
            const confirmBtn = document.getElementById('cancel-modal-confirm');

            if (!reason) {
                errBox.textContent = 'Please select a reason before confirming.';
                errBox.style.display = 'block';
                return;
            }
            errBox.style.display = 'none';

            confirmBtn.disabled = true;
            confirmBtn.textContent = 'Cancelling';
            if (triggerBtn) { triggerBtn.disabled = true; triggerBtn.textContent = 'Cancelling'; }

            try {
                const res = await fetch(`/api/orders/cancel.php?ref=${orderRef}`, {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ cancel_reason: reason, cancel_notes: notes })
                });
                const json = await res.json();

                overlay.remove();

                if (json.success) {
                    const retRef = json.data?.cancel_ref;
                    const msg = retRef
                        ? `Reservation ${orderRef} cancelled. Cancellation record (${retRef}) submitted for admin review.`
                        : `Reservation ${orderRef} cancelled successfully.`;
                    showToast(msg);
                    await loadMyOrders();
                } else {
                    showToast(json.error || 'Could not cancel reservation.');
                    if (triggerBtn) { triggerBtn.disabled = false; triggerBtn.textContent = 'Cancel Reservation'; }
                }
            } catch (err) {
                overlay.remove();
                showToast('Server error. Please try again.');
                if (triggerBtn) { triggerBtn.disabled = false; triggerBtn.textContent = 'Cancel Reservation'; }
            }
        });
    }
});


