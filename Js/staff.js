document.addEventListener("DOMContentLoaded", async () => {
  // --- LOGOUT BUTTON ----------------------------------------------------------
  document.getElementById('admin-logout-btn')?.addEventListener('click', async (e) => {
    e.preventDefault();
    await fetch('/api/auth/logout', { method: 'POST' });
    window.location.href = 'login.html';
  });

  // --- BELL NOTIFICATION ------------------------------------------------------
  window.toggleStaffNotif = function() {
    const dropdown = document.getElementById('staff-notif-dropdown');
    dropdown.classList.toggle('open');
  };

  document.addEventListener('click', function(e) {
    const bell = document.getElementById('staff-notif-bell');
    if (bell && !bell.contains(e.target)) {
      document.getElementById('staff-notif-dropdown')?.classList.remove('open');
    }
  });

  function updateStaffNotifBell(productList) {
    const alerts = [];

    productList.forEach(p => {
      if (p.variants && p.variants.length > 0) {
        p.variants.forEach(v => {
          const minStock = v.min_stock ?? 5;
          if (v.stock <= minStock) {
            alerts.push({
              name: `${p.name} (${v.size})`,
              stock: v.stock,
              unit: p.unit || 'pcs',
              isCritical: v.stock <= Math.floor(minStock / 2),
            });
          }
        });
      } else {
        const minQty = p.minQuantity || 20;
        if (p.stock <= minQty) {
          alerts.push({
            name: p.name,
            stock: p.stock,
            unit: p.unit || 'pcs',
            isCritical: p.stock <= (p.criticalQuantity || 5),
          });
        }
      }
    });

    const badge = document.getElementById('staff-notif-badge');
    const list  = document.getElementById('staff-notif-list');
    if (!badge || !list) return;

    if (alerts.length === 0) {
      badge.style.display = 'none';
      list.innerHTML = '<li class="notif-empty">No alerts</li>';
    } else {
      badge.style.display = 'flex';
      badge.textContent = alerts.length;
      list.innerHTML = alerts.map(a => `
        <li>
          <span class="notif-item-name">${a.name}</span>
          <span class="notif-item-stock ${a.isCritical ? 'critical' : ''}">
            ${a.isCritical ? 'Critical' : 'Low'}: ${a.stock} ${a.unit}
          </span>
        </li>`).join('');
    }
  }

  // --- NAVIGATION LOGIC -------------------------------------------------------
  const navBtns = document.querySelectorAll(".nav-btn");
  const views = document.querySelectorAll(".view-section");
  const viewTitle = document.getElementById("current-view-title");

  navBtns.forEach(btn => {
    btn.addEventListener("click", (e) => {
      e.preventDefault();
      navBtns.forEach(b => b.classList.remove("active"));
      btn.classList.add("active");
      views.forEach(v => v.classList.remove("active"));
      const targetId = btn.getAttribute("data-target");
      const targetEl = document.getElementById(targetId);
      if (targetEl) targetEl.classList.add("active");

      if (viewTitle) {
        const spanText = btn.querySelector('span')?.innerText;
        viewTitle.innerText = spanText || btn.innerText;
      }
      
      // Show search bar only on Inventory view using visibility (maintains layout)
      const searchBar = document.getElementById("inventory-search-bar");
      const targetView = btn.getAttribute("data-target");
      if (searchBar) {
        searchBar.style.visibility = targetView === "inventory-view" ? "visible" : "hidden";
      }
      
      const searchInput = document.getElementById("inventory-search-input");
      if (searchInput) {
        searchInput.value = "";
        document.querySelectorAll(".data-table tbody tr").forEach(row => row.style.display = "");
      }
    });
  });

  // --- INVENTORY SEARCH FILTER (only for inventory) --------------------------
  const inventorySearchInput = document.getElementById("inventory-search-input");
  if (inventorySearchInput) {
    inventorySearchInput.addEventListener("input", (e) => {
      const term = e.target.value.toLowerCase();
      const inventoryView = document.getElementById("inventory-view");
      if (!inventoryView) return;
      
      const rows = inventoryView.querySelectorAll(".data-table tbody tr");
      rows.forEach(row => {
        const text = row.textContent.toLowerCase();
        row.style.display = text.includes(term) ? "" : "none";
      });
    });
  }

  // --- DELIVERY ITEMS MODAL LOGIC ---------------------------------------------
  window.viewDeliveryItems = async function(deliveryId) {
    const response = await DeliveriesAPI.getAllDeliveries();
    if (!response.success) return;
    const del = response.data.find(d => d.id === deliveryId);
    if (!del) return;

    const tbody = document.getElementById("view-delivery-items-body");
    tbody.innerHTML = "";

    // Backend to_dict() already parses items_json ? returns 'items' as an array
    const items = Array.isArray(del.items) ? del.items : [];

    if (items.length === 0) {
      tbody.innerHTML = `<tr><td colspan="2" style="text-align:center;">No items recorded.</td></tr>`;
    } else {
      items.forEach(item => {
        tbody.innerHTML += `
          <tr>
            <td>${item.name}</td>
            <td>${item.qty}</td>
          </tr>
        `;
      });
    }
    document.getElementById("view-delivery-items-modal").classList.add("active");
  };

  // --- STATE ------------------------------------------------------------------
  let products = [];
  // Remove old LOW_STOCK constant from staff.js context
  const LOW_STOCK = 20; // kept for backward compat but per-product thresholds are used

  const today = new Date().toISOString().split('T')[0];
  let mockOrders = [];

  async function loadOrders() {
    try {
      const res = await fetch('/api/orders');
      const json = await res.json();
      if (json.success) {
        mockOrders = json.data.map(o => ({
          id: o.id,
          order_ref: o.order_ref,
          customer: o.customer_name || o.customer || 'Walk-in',
          customer_name: o.customer_name || o.customer || 'Walk-in',
          date: o.date,
          total: o.total,
          status: o.status,
          order_type: o.order_type,
          cancel_reason: o.cancel_reason || null,
          cancel_notes:  o.cancel_notes  || null,
          items: Array.isArray(o.items) ? o.items.reduce((s, i) => s + (i.qty || 1), 0) : o.items
        }));
      }
    } catch (e) {
      console.error("Failed to load orders");
    }
  }

  // --- LOAD PRODUCTS FROM API --------------------------------------------------
  async function loadProducts() {
    const res = await fetch('/api/products');
    const json = await res.json();
    if (json.success) products = json.data;
    products.forEach((p, i) => { if (!p.sku) p.sku = `SKU-${1000 + i}`; });
    updateStaffNotifBell(products);
  }

  await loadProducts();
  await loadOrders();

  // --- DASHBOARD STATS ---------------------------------------------------------
  function updateDashboardStats() {
    const pendingTasks = mockOrders.filter(o => o.status === 'pending' || o.status === 'processing').length;
    const lowStockCount = products.filter(p => p.stock < (p.minQuantity || 20)).length;
    const criticalStockCount = products.filter(p => p.stock <= (p.criticalQuantity || 5)).length;
    const todaysOrders = mockOrders.filter(o => o.date === today);
    if (document.getElementById("stat-today-orders"))
      document.getElementById("stat-today-orders").innerText = todaysOrders.length;
    if (document.getElementById("stat-pending"))
      document.getElementById("stat-pending").innerText = pendingTasks;
    if (document.getElementById("stat-alerts"))
      document.getElementById("stat-alerts").innerText = lowStockCount;
    if (document.getElementById("stat-critical"))
      document.getElementById("stat-critical").innerText = criticalStockCount;
  }

  function renderActionOrders() {
    const body = document.getElementById("action-orders-body");
    if (!body) return;
    body.innerHTML = "";
    const actionOrders = mockOrders.filter(o => o.status === 'pending' || o.status === 'processing').slice(0, 5);
    if (actionOrders.length === 0) {
      body.innerHTML = `<tr><td colspan="4" style="text-align:center; padding: 20px;">No pending actions.</td></tr>`;
      return;
    }
    actionOrders.forEach(order => {
      body.innerHTML += `
        <tr>
          <td><strong>${order.id}</strong></td>
          <td>${order.customer}</td>
          <td>${order.date}</td>
          <td><span class="status ${order.status}">${order.status}</span></td>
        </tr>
      `;
    });
  }

  // --- ORDERS MANAGEMENT -------------------------------------------------------
  const orderFilter = document.getElementById("order-filter");

  function renderOrders(filterStatus = "all") {
    const body = document.getElementById("orders-table-body");
    if (!body) return;
    body.innerHTML = "";
    const filtered = filterStatus === "all" ? mockOrders : mockOrders.filter(o => o.status === filterStatus);

    const STATUS_CONFIG = {
      pending:                { label: 'Pending',          color: '#854d0e', bg: '#fef9c3' },
      processing:             { label: 'Processing',       color: '#075985', bg: '#e0f2fe' },
      delivered:              { label: 'Delivered',        color: '#065f46', bg: '#d1fae5' },
      completed:              { label: 'Completed',        color: '#166534', bg: '#bbf7d0' },
      cancelled:              { label: 'Cancelled',        color: '#991b1b', bg: '#fee2e2' },
      cancellation_requested: { label: 'Cancel Requested', color: '#7c2d12', bg: '#ffedd5' },
    };

    filtered.forEach(order => {
      const cfg = STATUS_CONFIG[order.status] || { label: order.status, color: '#333', bg: '#f1f5f9' };

      const reasonHtml = order.cancel_reason
        ? `<div style="font-size:0.75rem;color:#7c2d12;margin-top:3px;">Reason: ${order.cancel_reason}</div>`
        : '';

      body.innerHTML += `
        <tr style="${order.status === 'cancelled' && order.cancel_reason ? 'background:#fff7ed;' : ''}">
          <td><strong>${order.order_ref || order.id}</strong></td>
          <td>${order.customer_name || order.customer || 'Walk-in'}</td>
          <td>${order.date || ''}</td>
          <td>${order.items || ''}</td>
          <td>
            <span style="background:${cfg.bg};color:${cfg.color};padding:4px 10px;border-radius:12px;font-size:0.78rem;font-weight:600;">
              ${cfg.label}
            </span>
            ${reasonHtml}
          </td>
          <td>
            <button class="action-btn secondary btn-small" onclick="openStaffOrderModal('${order.order_ref || order.id}', '${order.status}', '${order.customer_name || order.customer || 'Walk-in'}', '${order.date || ''}', '${order.total || 0}', '${order.items || ''}')">
              Manage
            </button>
          </td>
        </tr>
      `;
    });
  }

  // --- ORDER STATUS MODAL (Staff) -----------------------------------------------
  window.openStaffOrderModal = function(orderRef, currentStatus, customer, date, total, items) {
    const existing = document.getElementById('staff-order-modal-overlay');
    if (existing) existing.remove();

    const NEXT_STEPS = [
      { status: 'processing', label: '⚙ Mark as Processing',    color: '#0284c7', desc: 'Preparing materials.' },
      { status: 'completed',  label: '✓ Mark as Completed',      color: '#16a34a', desc: 'Order completed.' },
      { status: 'cancelled',  label: '✕ Cancel Reservation',     color: '#dc2626', desc: 'Cancel this reservation.' },
    ];

    // If order is completed or delivered, show NO action buttons
    let buttonsHtml = '';
    if (currentStatus === 'completed' || currentStatus === 'delivered') {
      buttonsHtml = '<p style="color:#16a34a;font-size:0.9rem;text-align:center;padding:12px 0;background:#f0fdf4;border-radius:8px;font-weight:600;">✓ This order is already completed. No further actions available.</p>';
    } else {
      // Filter buttons: remove current status, and don't allow cancel if completed/delivered
      buttonsHtml = NEXT_STEPS
        .filter(s => s.status !== currentStatus)
        .filter(s => {
          // Don't show cancel option if order is completed or delivered
          if (s.status === 'cancelled' && (currentStatus === 'completed' || currentStatus === 'delivered')) {
            return false;
          }
          return true;
        })
        .map(s => `
          <button onclick="updateStaffOrderStatus('${orderRef}', '${s.status}')"
            style="background:${s.color};color:#fff;border:none;padding:10px 16px;border-radius:8px;
                   font-size:0.85rem;font-weight:600;cursor:pointer;display:flex;align-items:center;gap:8px;width:100%;">
            <span>${s.label}</span>
            <span style="font-size:0.75rem;opacity:0.85;margin-left:auto;">${s.desc}</span>
          </button>`).join('');
    }

    const overlay = document.createElement('div');
    overlay.id = 'staff-order-modal-overlay';
    overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.45);display:flex;align-items:center;justify-content:center;z-index:9999;padding:16px;';
    overlay.innerHTML = `
      <div style="background:#fff;border-radius:14px;width:100%;max-width:440px;box-shadow:0 20px 60px rgba(0,0,0,0.2);overflow:hidden;">
        <div style="padding:18px 22px;border-bottom:1px solid #f1f5f9;background:#f8fafc;display:flex;justify-content:space-between;align-items:center;">
          <div>
            <h3 style="margin:0;font-size:1rem;color:#1e293b;">Manage Reservation</h3>
            <p style="margin:2px 0 0;font-size:0.78rem;color:#64748b;font-family:monospace;">${orderRef}</p>
          </div>
          <button onclick="document.getElementById('staff-order-modal-overlay').remove()"
            style="background:none;border:none;font-size:1.2rem;cursor:pointer;color:#64748b;">×</button>
        </div>
        <div style="padding:18px 22px;">
          <div style="background:#f8fafc;border-radius:8px;padding:12px;margin-bottom:16px;font-size:0.83rem;">
            <div style="display:flex;justify-content:space-between;margin-bottom:6px;">
              <span style="color:#64748b;">Customer</span><strong>${customer}</strong>
            </div>
            <div style="display:flex;justify-content:space-between;margin-bottom:6px;">
              <span style="color:#64748b;">Date</span><strong>${date}</strong>
            </div>
            <div style="display:flex;justify-content:space-between;">
              <span style="color:#64748b;">Total</span><strong>₱${parseFloat(total||0).toLocaleString()}</strong>
            </div>
          </div>
          <p style="font-size:0.8rem;font-weight:600;color:#64748b;text-transform:uppercase;letter-spacing:0.05em;margin:0 0 10px;">Update Status</p>
          <div style="display:flex;flex-direction:column;gap:8px;">
            ${buttonsHtml || '<p style="color:#94a3b8;font-size:0.85rem;text-align:center;padding:12px 0;">No actions available for this status.</p>'}
          </div>
        </div>
      </div>`;
    document.body.appendChild(overlay);
    overlay.addEventListener('click', e => { if (e.target === overlay) overlay.remove(); });
  };

  window.updateStaffOrderStatus = async function(orderRef, newStatus) {
    try {
      const res = await fetch(`/api/orders/${orderRef}/status`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus, actorName: 'Staff Member', actorRole: 'staff' })
      });
      const json = await res.json();
      if (json.success) {
        document.getElementById('staff-order-modal-overlay')?.remove();
        const idx = mockOrders.findIndex(o => (o.order_ref || o.id) === orderRef);
        if (idx > -1) mockOrders[idx].status = newStatus;
        updateDashboardStats();
        renderActionOrders();
        renderOrders(document.getElementById('order-filter')?.value || 'all');
      } else {
        alert('Failed to update status: ' + (json.error || 'Unknown error'));
      }
    } catch (err) {
      alert('Server error. Please try again.');
    }
  };

  if (orderFilter) orderFilter.addEventListener('change', (e) => renderOrders(e.target.value));

  // --- ORDER MODAL -------------------------------------------------------------
  const modal = document.getElementById("order-modal");
  const closeModalBtn = document.querySelector(".close-modal");
  const modalBody = document.getElementById("modal-order-body");

  function openOrderModal(order) {
    if (!order || !modal) return;
    document.getElementById("modal-order-title").innerText = `Order Details: ${order.id}`;

    // Fetch full order details to get items array + customer info
    fetch('/api/orders')
      .then(r => r.json())
      .then(json => {
        const full = json.success ? json.data.find(o => o.id === order.id) : null;
        const items = full && Array.isArray(full.items) ? full.items : [];

        // Customer details block
        const phone   = full?.user_phone   || '';
        const email   = full?.user_email   || '';
        const address = full?.user_address || '';
        const town    = full?.user_town    || '';
        const isWalkin = !full?.user_phone && !full?.user_email;

        const customerDetailsHtml = isWalkin
          ? `<p style="color:#94a3b8; font-size:13px; font-style:italic; margin:0;">Walk-in / unregistered customer  no account details available.</p>`
          : `<div style="display:grid; grid-template-columns:1fr 1fr; gap:8px 20px; font-size:13px;">
              <div><span style="color:#64748b;">Phone</span><br><strong>${phone}</strong></div>
              <div><span style="color:#64748b;">Email</span><br><strong>${email}</strong></div>
              <div><span style="color:#64748b;">Address</span><br><strong>${address}</strong></div>
              <div><span style="color:#64748b;">Town / City</span><br><strong>${town}</strong></div>
            </div>`;

        const itemsHtml = items.length > 0
          ? items.map(i => `<tr>
              <td style="padding:4px 8px;">${i.name}</td>
              <td style="padding:4px 8px; text-align:center;">${i.qty || 1}</td>
              <td style="padding:4px 8px; text-align:right;">?${parseFloat(i.price || 0).toLocaleString()}</td>
            </tr>`).join('')
          : '<tr><td colspan="3" style="text-align:center; padding:8px; color:#94a3b8;">No item details.</td></tr>';

        modalBody.innerHTML = `
          <p><strong>Customer:</strong> ${order.customer}</p>
          <p><strong>Date:</strong> ${order.date}</p>
          <p><strong>Total:</strong> ?${parseFloat(order.total).toLocaleString()}</p>
          <div style="background:#f8fafc; border:1px solid #e2e8f0; border-radius:8px; padding:12px; margin:12px 0;">
            <p style="font-size:12px; font-weight:700; color:#475569; text-transform:uppercase; letter-spacing:0.05em; margin:0 0 8px;">Customer Details</p>
            ${customerDetailsHtml}
          </div>
          <hr style="border:0; border-top:1px solid #e2e8f0; margin:12px 0;" />
          <table style="width:100%; border-collapse:collapse; font-size:0.875rem;">
            <thead style="background:#f1f5f9;">
              <tr>
                <th style="padding:4px 8px; text-align:left;">Item</th>
                <th style="padding:4px 8px;">Qty</th>
                <th style="padding:4px 8px; text-align:right;">Price</th>
              </tr>
            </thead>
            <tbody>${itemsHtml}</tbody>
          </table>`;
      })
      .catch(() => {
        modalBody.innerHTML = `<p><strong>Customer:</strong> ${order.customer}</p><p><em style="color:#94a3b8;">Could not load item details.</em></p>`;
      });

    modal.classList.add("active");
  }

  if (closeModalBtn) closeModalBtn.addEventListener('click', () => modal && modal.classList.remove("active"));
  window.addEventListener('click', (e) => { if (e.target === modal) modal.classList.remove("active"); });

  // --- INVENTORY  (Restock via API) --------------------------------------------
  function renderInventory() {
    const body = document.getElementById("inventory-table-body");
    if (!body) return;
    body.innerHTML = "";

    const catFilter = document.getElementById('inventory-category-filter');
    const selectedCat = catFilter ? catFilter.value : 'all';
    const filtered = selectedCat === 'all' ? products : products.filter(p => p.category === selectedCat);

    filtered.forEach((p) => {
      const minQty = p.minQuantity || 20;
      const critQty = p.criticalQuantity || 5;
      const unit = p.unit || 'pcs';
      const origIndex = products.indexOf(p);
      const hasVariants = p.variants && p.variants.length > 0;

      // Determine parent status
      let stockLevel = 'in-stock', statusText = 'In Stock';
      if (!hasVariants) {
        if (p.stock <= critQty)    { stockLevel = 'critical-stock'; statusText = 'Critical'; }
        else if (p.stock < minQty) { stockLevel = 'low-stock';      statusText = 'Low Stock'; }
      } else {
        // For variants, show aggregate status
        const totalStock = p.variants.reduce((sum, v) => sum + (v.stock || 0), 0);
        const hasCritical = p.variants.some(v => v.stock <= (v.min_stock ? Math.floor(v.min_stock/2) : 2));
        const hasLow = p.variants.some(v => v.stock <= (v.min_stock || 5));
        if (hasCritical)    { stockLevel = 'critical-stock'; statusText = 'Critical'; }
        else if (hasLow)    { stockLevel = 'low-stock';      statusText = 'Low Stock'; }
      }

      // Parent row
      body.innerHTML += `
        <tr class="inv-parent-row" style="cursor:${hasVariants ? 'pointer' : 'default'};" 
            ${hasVariants ? `onclick="toggleStaffVariantRows('inv-${p.id}')"` : ''}>
          <td>
            <strong>${p.name}</strong>
            ${hasVariants ? `<span style="margin-left:6px;font-size:0.75rem;color:#f97316;font-weight:600;">(${p.variants.length} variants)</span>` : ''}
          </td>
          <td>${p.sku || '--'}</td>
          <td>${p.category || ''}</td>
          <td id="stock-display-${origIndex}"><strong style="color:${!hasVariants && p.stock <= critQty ? '#dc2626' : !hasVariants && p.stock < minQty ? '#d97706' : 'inherit'}">${hasVariants ? '--' : p.stock + ' ' + unit}</strong></td>
          <td>${minQty} ${unit}</td>
          <td style="color:#dc2626;font-weight:600;">${critQty} ${unit}</td>
          <td id="status-display-${origIndex}"><span class="status ${stockLevel}">${statusText}</span></td>
          <td>
            ${hasVariants 
              ? `<button class="action-btn secondary btn-small" onclick="event.stopPropagation(); toggleStaffVariantRows('inv-${p.id}')">View Variants</button>`
              : `<div style="display:flex;align-items:center;gap:4px;">
                   <input type="number" id="restock-input-${origIndex}" min="1" placeholder="Qty" class="stock-input" />
                   <button class="action-btn primary btn-small" onclick="restockItem(${origIndex})">Restock</button>
                 </div>`
            }
          </td>
        </tr>
      `;

      // Variant rows (hidden by default)
      if (hasVariants) {
        p.variants.forEach(v => {
          const minS = v.min_stock ?? 5;
          let vStockLevel = 'in-stock', vStatusText = 'In Stock';
          if (v.stock <= 0)                         { vStockLevel = 'critical-stock'; vStatusText = 'Out of Stock'; }
          else if (v.stock <= Math.floor(minS / 2)) { vStockLevel = 'critical-stock'; vStatusText = 'Critical'; }
          else if (v.stock <= minS)                 { vStockLevel = 'low-stock';      vStatusText = 'Low Stock'; }

          body.innerHTML += `
            <tr class="inv-variant-row inv-${p.id}" style="display:none;background:#f8fafc;">
              <td style="padding-left:28px;">
                <span style="color:#94a3b8;margin-right:4px;">└</span>
                <strong>${p.name}</strong> <span style="color:#64748b;font-size:0.8rem;">(${v.size})</span>
              </td>
              <td>${p.sku}</td>
              <td>${p.category || ''}</td>
              <td><strong style="color:${v.stock <= Math.floor(minS/2) ? '#dc2626' : v.stock <= minS ? '#d97706' : 'inherit'}">${v.stock} ${unit}</strong></td>
              <td>${minS} ${unit}</td>
              <td style="color:#dc2626;font-weight:600;">${Math.floor(minS/2)} ${unit}</td>
              <td><span class="status ${vStockLevel}">${vStatusText}</span></td>
              <td>
                <div style="display:flex;align-items:center;gap:4px;">
                  <input type="number" min="1" placeholder="Qty" class="stock-input" id="restock-v-${v.id}" />
                  <button class="action-btn primary btn-small" onclick="restockVariantStaff(${p.id}, ${v.id}, ${origIndex}, '${p.name}', '${v.size}')">Restock</button>
                </div>
              </td>
            </tr>
          `;
        });
      }
    });
  }

  // Toggle variant rows
  window.toggleStaffVariantRows = function(groupClass) {
    const rows = document.querySelectorAll(`.${groupClass}`);
    const isHidden = rows[0]?.style.display === 'none';
    rows.forEach(r => r.style.display = isHidden ? '' : 'none');
    
    const viewBtn = document.querySelector(`button[onclick*="toggleStaffVariantRows('${groupClass}')"]`);
    if (viewBtn) viewBtn.textContent = isHidden ? 'Hide Variants' : 'View Variants';
  };

  window.restockItem = async function(index) {
    const input = document.getElementById(`restock-input-${index}`);
    const qty = parseInt(input.value);
    if (!qty || qty <= 0) { alert("Please enter a valid quantity."); return; }

    const product = products[index];
    const res = await fetch(`/api/products/${product.id}/restock`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ quantity: qty, actorName: 'Staff Member', actorRole: 'staff' })
    });
    const json = await res.json();
    if (json.success) {
      products[index].stock = json.data.stock;
      input.value = "";
      updateDashboardStats();
      renderInventory();
      alert(`Successfully added ${qty} units to ${product.name}.`);
    } else {
      alert('Restock failed.');
    }
  };

  window.restockVariantStaff = async function(productId, variantId, productIndex, productName, variantSize) {
    const input = document.getElementById(`restock-v-${variantId}`);
    const qty = parseInt(input?.value);
    if (!qty || qty <= 0) { alert("Please enter a valid quantity."); return; }

    const res = await fetch(`/api/products/${productId}/restock?variant_id=${variantId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ quantity: qty, actorName: 'Staff Member', actorRole: 'staff' })
    });
    const json = await res.json();
    if (json.success) {
      const p = products[productIndex];
      if (p) {
        p.stock = json.data.stock;
        const v = p.variants?.find(v => v.id === variantId);
        if (v) v.stock += qty;
      }
      updateDashboardStats();
      renderInventory();
      alert(`Successfully added ${qty} units to ${productName} (${variantSize}).`);
    } else {
      alert('Restock failed.');
    }
  };

  // --- ADD PRODUCT MODAL -------------------------------------------------------
  const addModal = document.getElementById("add-product-modal");
  const openAddBtn = document.getElementById("staff-open-add-product-btn");
  const closeAddBtns = [
    document.getElementById("close-add-product-modal"),
    document.getElementById("cancel-add-product")
  ];
  const addForm = document.getElementById("add-product-form");
  const feedback = document.getElementById("form-feedback");

  if (openAddBtn) {
    openAddBtn.addEventListener("click", () => {
      addForm.reset();
      feedback.style.display = 'none';
      addModal.classList.add("active");
    });
  }

  closeAddBtns.forEach(btn => {
    if (btn) btn.addEventListener("click", () => addModal.classList.remove("active"));
  });

  if (addForm) {
    addForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      const name = document.getElementById("prod-name").value.trim();
      const price = parseFloat(document.getElementById("prod-price").value);
      const category = document.getElementById("prod-category").value;
      const stock = parseInt(document.getElementById("prod-stock").value);
      const minQuantity = parseInt(document.getElementById("prod-min-qty")?.value) || 20;
      const criticalQuantity = parseInt(document.getElementById("prod-critical-qty")?.value) || 5;
      const unit = (document.getElementById("prod-unit")?.value || 'pcs').trim();
      const specsRaw = document.getElementById("prod-specs")?.value.trim() || '';
      const specifications = specsRaw ? specsRaw.split(',').map(s => s.trim()).filter(Boolean) : [];
      const image = document.getElementById("prod-image").value.trim() || "img/concrete-hollow-block-300x300.jpg";

      if (!name || isNaN(price) || !category || isNaN(stock)) {
        feedback.innerText = "Please fill all required fields correctly.";
        feedback.style.display = "block";
        feedback.style.backgroundColor = "#fee2e2";
        feedback.style.color = "#991b1b";
        return;
      }

      const res = await fetch('/api/products', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, price, category, stock, minQuantity, criticalQuantity, unit, specifications, image, actorName: 'Staff Member', actorRole: 'staff' })
      });
      const json = await res.json();
      if (json.success) {
        products.push(json.data);
        updateDashboardStats();
        renderInventory();
        feedback.innerText = "Product added successfully!";
        feedback.style.display = "block";
        feedback.style.backgroundColor = "#d1fae5";
        feedback.style.color = "#065f46";
        setTimeout(() => addModal.classList.remove("active"), 1000);
      } else {
        feedback.innerText = json.message || "Failed to add product.";
        feedback.style.display = "block";
      }
    });
  }

  // --- DELIVERY MANAGEMENT (STAFF) ---------------------------------------------
  const deliveriesTableBody = document.getElementById("deliveries-table-body");
  const assignDriverModal = document.getElementById("assign-driver-modal");
  const closeAssignModalBtnStaff = document.getElementById("close-assign-modal");
  const cancelAssignDriverBtnStaff = document.getElementById("cancel-assign-driver");
  const assignDriverForm = document.getElementById("assign-driver-form");

  async function renderStaffDeliveries() {
    if (!deliveriesTableBody) return;
    const response = await DeliveriesAPI.getAllDeliveries();
    if (!response.success) return;
    const deliveries = response.data;
    deliveriesTableBody.innerHTML = "";

    deliveries.forEach(del => {
      const statusOptions = ['pending', 'out_for_delivery', 'delivered', 'failed'];
      const optionsHtml = statusOptions.map(opt => `
        <option value="${opt}" ${del.status === opt ? 'selected' : ''}>
          ${opt.replace(/_/g, ' ').toUpperCase()}
        </option>
      `).join('');

      deliveriesTableBody.innerHTML += `
        <tr>
          <td><strong>${del.id}</strong></td>
          <td>${del.customerName}<br><small>${del.address}</small></td>
          <td>${del.plateNumber ? `<strong>${del.plateNumber}</strong>` : '<em style="color:#aaa;"></em>'}</td>
          <td>${del.deliveryPerson ? `<strong>${del.deliveryPerson}</strong>` : '<em style="color:#aaa;">Unassigned</em>'}</td>
          <td style="text-align:center;">
            <span style="display:inline-block;background:#ede9fe;color:#6d28d9;padding:2px 8px;border-radius:20px;font-size:0.78rem;font-weight:700;">
              ${del.delivery_count ?? del.deliveryCount ?? 1}x
            </span>
          </td>
          <td style="font-size:0.78rem;">
            ${del.date_completed || del.dateCompleted
              ? `<span style="color:#065f46;font-weight:600;">${new Date(del.date_completed || del.dateCompleted).toLocaleString('en-PH',{month:'short',day:'numeric',hour:'2-digit',minute:'2-digit'})}</span>`
              : '<em style="color:#aaa;">Not yet</em>'}
          </td>
          <td>
            <select class="delivery-status-select" data-id="${del.id}">${optionsHtml}</select>
          </td>
          <td>
            <button class="action-btn btn-small primary assign-driver-btn" data-id="${del.id}">Assign</button>
            <button class="action-btn btn-small view-delivery-items-btn" onclick="viewDeliveryItems('${del.id}')">Items</button>
            ${del.photoProof ? `<button class="action-btn btn-small secondary" onclick="viewProof('${del.id}')">Proof</button>` : ''}
          </td>
        </tr>
      `;
    });

    document.querySelectorAll('.delivery-status-select').forEach(select => {
      select.addEventListener('change', async (e) => {
        await DeliveriesAPI.updateStatus(e.target.getAttribute('data-id'), e.target.value);
        renderStaffDeliveries();
      });
    });

    document.querySelectorAll('.assign-driver-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        document.getElementById('assign-delivery-id').value = e.target.getAttribute('data-id');
        document.getElementById('driver-name').value = '';
        document.getElementById('driver-notes').value = '';
        assignDriverModal.classList.add('active');
      });
    });
  }

  window.viewProof = async function(id) {
    const response = await DeliveriesAPI.getAllDeliveries();
    if (!response.success) return;
    const del = response.data.find(d => d.id === id);
    if (del && del.photoProof) {
      document.getElementById('proof-modal-img').src = del.photoProof;
      document.getElementById('proof-modal-notes').innerText = del.driverRemarks || 'No remarks provided.';
      document.getElementById('proof-modal').classList.add('active');
    }
  };

  [closeAssignModalBtnStaff, cancelAssignDriverBtnStaff].forEach(btn => {
    if (btn) btn.addEventListener('click', () => assignDriverModal.classList.remove('active'));
  });

  if (assignDriverForm) {
    assignDriverForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const id = document.getElementById('assign-delivery-id').value;
      const driver = document.getElementById('driver-name').value;
      const notes = document.getElementById('driver-notes').value;
      await DeliveriesAPI.assignDriver(id, driver, notes);
      assignDriverModal.classList.remove('active');
      renderStaffDeliveries();
    });
  }

  // --- INIT --------------------------------------------------------------------
  updateDashboardStats();
  renderActionOrders();
  renderOrders();
  renderInventory();
  renderStaffDeliveries();
  renderReturns();

  // Populate inventory category filter from API categories
  try {
    const catRes = await fetch('/api/categories');
    const catJson = await catRes.json();
    if (catJson.success) {
      const catFilter = document.getElementById('inventory-category-filter');
      if (catFilter) {
        catJson.data.forEach(c => {
          const opt = document.createElement('option');
          opt.value = c.name;
          opt.textContent = c.name;
          catFilter.appendChild(opt);
        });
        catFilter.addEventListener('change', renderInventory);
      }
    }
  } catch(e) { console.error('Failed to load categories for filter', e); }
});

// --- RETURNS MANAGEMENT (appended outside DOMContentLoaded for clarity) ------
// This block re-uses the same DOMContentLoaded context via the module pattern.
document.addEventListener('DOMContentLoaded', () => {

  const STAFF_NAME = 'Staff Member'; // In a real app, pull from session/API

  // --- RENDER RETURNS TABLE ------------------------------------------------
  window.renderReturns = async function () {
    const tbody = document.getElementById('returns-table-body');
    if (!tbody) return;
    try {
      const res = await fetch('/api/returns');
      const json = await res.json();
      if (!json.success) { tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;">Failed to load returns.</td></tr>'; return; }

      if (json.data.length === 0) {
        tbody.innerHTML = '<tr><td colspan="7" style="text-align:center; padding:20px; color:#94a3b8;">No return requests yet.</td></tr>';
        return;
      }

      tbody.innerHTML = json.data.map(r => {
        const items = r.items.map(i => `${i.qty}x ${i.name}`).join(', ');
        const statusColor = { pending: '#f59e0b', approved: '#10b981', rejected: '#ef4444' }[r.status] || '#64748b';
        const actionHtml = r.status === 'pending'
          ? `<button class="action-btn primary btn-small" onclick="openReturnReview('${r.id}')">Review</button>`
          : `<em style="color:#94a3b8; font-size:0.8rem;">By: ${r.handled_by || 'N/A'}</em>`;
        return `
          <tr>
            <td><strong>${r.return_ref || r.id}</strong></td>
            <td>${r.original_txn_ref || 'N/A'}</td>
            <td>${r.customer_name || 'N/A'}</td>
            <td><div style="font-size:0.8rem;">${items}</div><div style="color:#64748b;font-size:0.75rem; margin-top:2px;">${r.reason || ''}</div></td>
            <td style="font-weight:600; color:#0f172a;">₱${parseFloat(r.refund_amount || 0).toLocaleString()}</td>
            <td><span style="font-weight:600; color:${statusColor}; text-transform:capitalize;">${r.status}</span>${r.stock_restored ? '<br><small style="color:#10b981;">Stock Restored</small>' : ''}</td>
            <td>${actionHtml}</td>
          </tr>`;
      }).join('');
    } catch (err) {
      console.error('Failed to load returns', err);
    }
  };

  // --- OPEN RETURN REVIEW MODAL ---------------------------------------------
  window.openReturnReview = async function (returnRef) {
    const res = await fetch('/api/returns');
    const json = await res.json();
    if (!json.success) return;
    const ret = json.data.find(r => r.id === returnRef);
    if (!ret) return;

    document.getElementById('return-review-ref').value = returnRef;
    document.getElementById('return-review-notes').value = '';

    const itemRows = ret.items.map(i =>
      `<tr><td style="padding:4px 8px;">${i.name}</td><td style="padding:4px 8px; text-align:center;">${i.qty}</td><td style="padding:4px 8px; text-align:right;">₱${parseFloat(i.price || 0).toFixed(2)}</td></tr>`
    ).join('');

    document.getElementById('return-review-details').innerHTML = `
      <p><strong>Return ID:</strong> ${ret.return_ref || ret.id}</p>
      <p><strong>Order Ref:</strong> ${ret.original_txn_ref || 'N/A'}</p>
      <p><strong>Customer:</strong> ${ret.customer_name || 'N/A'}</p>
      <p><strong>Reason:</strong> ${ret.reason || 'No reason provided'}</p>
      <p><strong>Submitted:</strong> ${new Date(ret.created_at).toLocaleString()}</p>
      <table style="width:100%; border-collapse:collapse; margin-top:10px; font-size:0.875rem;">
        <thead style="background:#e2e8f0;"><tr><th style="padding:4px 8px;text-align:left;">Item</th><th style="padding:4px 8px;">Qty</th><th style="padding:4px 8px;text-align:right;">Unit Price</th></tr></thead>
        <tbody>${itemRows}</tbody>
      </table>
      <p style="margin-top:10px; font-weight:700; color:#0f172a;">Estimated Refund: ₱${parseFloat(ret.refund_amount || 0).toLocaleString()}</p>`;

    document.getElementById('return-review-modal').classList.add('active');
  };

  // --- APPROVE RETURN -------------------------------------------------------
  document.getElementById('approve-return-btn')?.addEventListener('click', async () => {
    const returnRef = document.getElementById('return-review-ref').value;
    const notes = document.getElementById('return-review-notes').value.trim();
    if (!confirm(`Approve return ${returnRef} and restore inventory stock?`)) return;

    const res = await fetch(`/api/returns/${returnRef}/approve`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ approvedBy: STAFF_NAME, approverRole: 'staff', notes })
    });
    const json = await res.json();
    if (json.success) {
      alert(`Return ${returnRef} approved. Stock has been restored.`);
      document.getElementById('return-review-modal').classList.remove('active');
      renderReturns();
    } else {
      alert(json.message || 'Failed to approve return.');
    }
  });

  // --- REJECT RETURN --------------------------------------------------------
  document.getElementById('reject-return-btn')?.addEventListener('click', async () => {
    const returnRef = document.getElementById('return-review-ref').value;
    const notes = document.getElementById('return-review-notes').value.trim();
    if (!notes) { alert('Please add a rejection reason in the Notes field.'); return; }
    if (!confirm(`Reject return ${returnRef}? No stock changes will be made.`)) return;

    const res = await fetch(`/api/returns/${returnRef}/reject`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ rejectedBy: STAFF_NAME, rejectorRole: 'staff', notes })
    });
    const json = await res.json();
    if (json.success) {
      alert(`Return ${returnRef} rejected.`);
      document.getElementById('return-review-modal').classList.remove('active');
      renderReturns();
    } else {
      alert(json.message || 'Failed to reject return.');
    }
  });

  // --- CLOSE RETURN REVIEW MODAL --------------------------------------------
  document.getElementById('close-return-review-modal')?.addEventListener('click', () => {
    document.getElementById('return-review-modal').classList.remove('active');
  });
  document.getElementById('cancel-return-review')?.addEventListener('click', () => {
    document.getElementById('return-review-modal').classList.remove('active');
  });

  // --- ACTIVITY LOG VIA API (log restock actions from staff) ---------------
  // The staff restock already logs server-side via the products API.
  // For order status updates, we patch the existing select listeners to
  // include actorName so the backend can record the actor.
  // This is handled by the actorName field sent in the fetch bodies in staff.js.
});


  // ═══════════════════════════════════════════════════════════════════════════
  // CANCELLATIONS
  // ═══════════════════════════════════════════════════════════════════════════

  window.loadCancellations = async function () {
    const tbody = document.getElementById('cancellations-table-body');
    if (!tbody) return;

    tbody.innerHTML = '<tr><td colspan="8" style="text-align:center; padding:16px; color:#94a3b8;">Loading...</td></tr>';

    try {
      const res = await fetch('/api/orders/cancellations', { credentials: 'include' });
      const json = await res.json();

      if (!json.success) {
        tbody.innerHTML = '<tr><td colspan="8" style="text-align:center;">Failed to load cancellations.</td></tr>';
        return;
      }

      const cancellations = json.data || [];
      const pending = cancellations.filter(c => c.status === 'pending').length;

      // Update stat card
      const statEl = document.getElementById('stat-cancellations');
      if (statEl) statEl.textContent = pending;

      if (cancellations.length === 0) {
        tbody.innerHTML = '<tr><td colspan="8" style="text-align:center; padding:20px; color:#94a3b8;">No cancellation requests yet.</td></tr>';
        return;
      }

      const statusColors = {
        pending:  { color: '#92400e', bg: '#fef3c7' },
        approved: { color: '#065f46', bg: '#d1fae5' },
        rejected: { color: '#991b1b', bg: '#fee2e2' },
      };

      tbody.innerHTML = cancellations.map(c => {
        const sc = statusColors[c.status] || { color: '#374151', bg: '#f3f4f6' };
        const badge = `<span style="background:${sc.bg};color:${sc.color};padding:3px 12px;border-radius:12px;font-size:0.8rem;font-weight:600;text-transform:capitalize;">${c.status}</span>`;
        const date = c.created_at ? c.created_at.substring(0, 10) : '--';
        const actionBtn = c.status === 'pending'
          ? `<button class="action-btn primary" style="font-size:0.8rem;padding:6px 14px;" onclick="openCancellationReview('${c.cancel_ref}')">Review</button>`
          : `<span style="color:#94a3b8;font-size:0.85rem;">Reviewed</span>`;
        
        return `<tr>
          <td><strong>${c.cancel_ref}</strong></td>
          <td>${c.order_ref}</td>
          <td>${c.customer_name || 'N/A'}</td>
          <td style="font-size:0.85rem;">${c.cancel_reason || '--'}</td>
          <td style="font-weight:600;">₱${Number(c.total_amount || 0).toLocaleString('en-PH', {minimumFractionDigits:2})}</td>
          <td>${date}</td>
          <td>${badge}</td>
          <td>${actionBtn}</td>
        </tr>`;
      }).join('');

    } catch (err) {
      console.error('Failed to load cancellations', err);
      tbody.innerHTML = '<tr><td colspan="8" style="text-align:center; color:#ef4444;">Error loading cancellations.</td></tr>';
    }
  };

  // Open cancellation review modal
  window.openCancellationReview = async function (cancelRef) {
    try {
      const res = await fetch('/api/orders/cancellations', { credentials: 'include' });
      const json = await res.json();
      if (!json.success) return;

      const record = json.data.find(c => c.cancel_ref === cancelRef);
      if (!record) return;

      const details = document.getElementById('cancellation-review-details');
      const itemsList = (record.items || []).map(i =>
        `<li style="margin:4px 0;">${i.name} × ${i.qty} -- ₱${Number(i.price || 0).toLocaleString('en-PH', {minimumFractionDigits:2})}</li>`
      ).join('');

      details.innerHTML = `
        <div style="display:grid; grid-template-columns:1fr 1fr; gap:10px; font-size:0.9rem;">
          <div><strong>Cancel Ref:</strong> ${record.cancel_ref}</div>
          <div><strong>Order Ref:</strong> ${record.order_ref}</div>
          <div><strong>Customer:</strong> ${record.customer_name || 'N/A'}</div>
          <div><strong>Date:</strong> ${record.created_at ? record.created_at.substring(0,10) : '--'}</div>
        </div>
        <div style="margin-top:12px;">
          <strong>Reason:</strong> ${record.cancel_reason || '--'}
          ${record.cancel_notes ? `<div style="color:#64748b; font-size:0.85rem; margin-top:4px;">Notes: ${record.cancel_notes}</div>` : ''}
        </div>
        <div style="margin-top:12px;">
          <strong>Total Amount:</strong> <span style="font-size:1.1rem; color:#0f172a;">₱${Number(record.total_amount || 0).toLocaleString('en-PH', {minimumFractionDigits:2})}</span>
        </div>
        <div style="margin-top:12px;">
          <strong>Items:</strong>
          <ul style="margin:6px 0 0 20px; line-height:1.6;">${itemsList || '<li>No items</li>'}</ul>
        </div>
      `;

      document.getElementById('cancellation-review-ref').value = cancelRef;
      document.getElementById('cancellation-review-notes').value = '';
      document.getElementById('cancellation-review-modal').classList.add('active');

    } catch (err) {
      console.error('Failed to load cancellation details', err);
      alert('Error loading cancellation details');
    }
  };

  // Close cancellation review modal
  document.getElementById('close-cancellation-review-modal')?.addEventListener('click', () => {
    document.getElementById('cancellation-review-modal').classList.remove('active');
  });
  document.getElementById('cancel-cancellation-review')?.addEventListener('click', () => {
    document.getElementById('cancellation-review-modal').classList.remove('active');
  });

  // Approve cancellation
  document.getElementById('approve-cancellation-btn')?.addEventListener('click', async () => {
    const ref = document.getElementById('cancellation-review-ref').value;
    const notes = document.getElementById('cancellation-review-notes').value.trim();

    if (!confirm(`Approve cancellation ${ref}? This will cancel the order and restore stock.`)) return;

    try {
      const res = await fetch(`/api/orders/cancellations?ref=${encodeURIComponent(ref)}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          action: 'approve',
          review_notes: notes || null
        })
      });

      const json = await res.json();
      if (json.success) {
        showToast(`Cancellation ${ref} approved. Order cancelled.`, 'success');
        document.getElementById('cancellation-review-modal').classList.remove('active');
        await loadCancellations();
      } else {
        showToast(json.message || 'Failed to approve cancellation', 'error');
      }
    } catch (err) {
      console.error('Failed to approve cancellation', err);
      showToast('Server error. Please try again.', 'error');
    }
  });

  // Reject cancellation
  document.getElementById('reject-cancellation-btn')?.addEventListener('click', async () => {
    const ref = document.getElementById('cancellation-review-ref').value;
    const notes = document.getElementById('cancellation-review-notes').value.trim();

    if (!confirm(`Reject cancellation ${ref}? The order will remain active.`)) return;

    try {
      const res = await fetch(`/api/orders/cancellations?ref=${encodeURIComponent(ref)}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          action: 'reject',
          review_notes: notes || null
        })
      });

      const json = await res.json();
      if (json.success) {
        showToast(`Cancellation ${ref} rejected. Order restored to pending.`, 'success');
        document.getElementById('cancellation-review-modal').classList.remove('active');
        await loadCancellations();
      } else {
        showToast(json.message || 'Failed to reject cancellation', 'error');
      }
    } catch (err) {
      console.error('Failed to reject cancellation', err);
      showToast('Server error. Please try again.', 'error');
    }
  });

  // Load cancellations when tab is clicked
  document.querySelector('[data-target="cancellations-view"]')?.addEventListener('click', () => {
    loadCancellations();
  });
