document.addEventListener("DOMContentLoaded", async () => {
  // ─── AUTHENTICATION CHECK ───────────────────────────────────────────────────
  try {
    const authRes = await fetch('/api/auth/me', { credentials: 'include' });
    const authData = await authRes.json();
    
    if (!authData.success || !['admin', 'staff'].includes(authData.user?.role)) {
      console.error('[Admin] Authentication failed or insufficient permissions');
      window.location.href = 'login.html';
      return;
    }
    
    console.log('[Admin] Authenticated as:', authData.user);
  } catch (error) {
    console.error('[Admin] Auth check error:', error);
    window.location.href = 'login.html';
    return;
  }

  // ─── LOGOUT BUTTON ──────────────────────────────────────────────────────────
  document.getElementById('admin-logout-btn')?.addEventListener('click', async (e) => {
    e.preventDefault();
    await fetch('/api/auth/logout', { method: 'POST' });
    window.location.href = 'login.html';
  });

  // ─── API ERROR HANDLER ──────────────────────────────────────────────────────
  window.handleAPIError = function(error, context = '') {
    console.error(`[Admin] API Error ${context}:`, error);
    
    if (error.message && error.message.includes('401')) {
      console.warn('[Admin] Session expired, redirecting to login');
      window.location.href = 'login.html';
      return;
    }
    
    // Don't show alert for non-critical errors, just log them
    if (context) {
      console.warn(`[Admin] ${context} failed, continuing...`);
    }
  };

  // ─── SAFE API FETCH ─────────────────────────────────────────────────────────
  window.safeFetch = async function(url, options = {}, context = '') {
    try {
      const res = await fetch(url, { credentials: 'include', ...options });
      
      if (res.status === 401) {
        console.warn('[Admin] 401 Unauthorized, redirecting to login');
        window.location.href = 'login.html';
        return { success: false, error: 'Unauthorized' };
      }
      
      const data = await res.json();
      return data;
    } catch (error) {
      handleAPIError(error, context);
      return { success: false, error: error.message };
    }
  };

  // ─── BELL NOTIFICATION ──────────────────────────────────────────────────────
  window.toggleAdminNotif = function() {
    const dropdown = document.getElementById('admin-notif-dropdown');
    dropdown.classList.toggle('open');
  };

  document.addEventListener('click', function(e) {
    const bell = document.getElementById('admin-notif-bell');
    if (bell && !bell.contains(e.target)) {
      document.getElementById('admin-notif-dropdown')?.classList.remove('open');
    }
  });

  function updateAdminNotifBell(productList) {
    const alerts = [];

    // ── Stock alerts ──────────────────────────────────────────────────────────
    productList.forEach(p => {
      if (p.variants && p.variants.length > 0) {
        p.variants.forEach(v => {
          const minStock = v.min_stock ?? 5;
          if (v.stock <= minStock) {
            alerts.push({
              icon: v.stock <= Math.floor(minStock / 2) ? '[!]' : 'Warning',
              name: `${p.name} (${v.size})`,
              detail: `${v.stock <= Math.floor(minStock / 2) ? 'Critical' : 'Low'}: ${v.stock} ${p.unit || 'pcs'}`,
              isCritical: v.stock <= Math.floor(minStock / 2),
              action: "document.querySelector('[data-target=inventory-view]')?.click()"
            });
          }
        });
      } else {
        const minQty = p.minQuantity || 20;
        if (p.stock <= minQty) {
          alerts.push({
            icon: p.stock <= (p.criticalQuantity || 5) ? '[!]' : 'Warning',
            name: p.name,
            detail: `${p.stock <= (p.criticalQuantity || 5) ? 'Critical' : 'Low'}: ${p.stock} ${p.unit || 'pcs'}`,
            isCritical: p.stock <= (p.criticalQuantity || 5),
            action: "document.querySelector('[data-target=inventory-view]')?.click()"
          });
        }
      }
    });

    // ── Fetch pending cancellations + returns async ───────────────────────────
    Promise.all([
      fetch('/api/orders/cancellations', { credentials: 'include' }).then(r => r.json()).catch(() => ({ success: false })),
      fetch('/api/returns', { credentials: 'include' }).then(r => r.json()).catch(() => ({ success: false }))
    ]).then(([cancelJson, returnJson]) => {
      const pendingCancels  = cancelJson.success  ? (cancelJson.data  || []).filter(c => c.status === 'pending') : [];
      const pendingReturns  = returnJson.success  ? (returnJson.data  || []).filter(r => r.status === 'pending') : [];

      pendingCancels.forEach(c => {
        alerts.push({
          icon: 'Full',
          name: `Cancel Request: ${c.order_ref}`,
          detail: `${c.customer_name} — ${c.cancel_reason || 'No reason'}`,
          isCritical: false,
          action: "document.querySelector('[data-target=returns-view]')?.click(); switchReturnSubtab('cancellations')"
        });
      });

      pendingReturns.forEach(r => {
        alerts.push({
          icon: 'Bulk',
          name: `Return Request: ${r.return_ref}`,
          detail: `${r.customer_name} — ₱${parseFloat(r.refund_amount || 0).toLocaleString()}`,
          isCritical: false,
          action: "document.querySelector('[data-target=returns-view]')?.click(); switchReturnSubtab('returns')"
        });
      });

      renderNotifBell(alerts);
    });

    // Render immediately with stock alerts (before async finishes)
    renderNotifBell(alerts);
  }

  function renderNotifBell(alerts) {
    const badge = document.getElementById('admin-notif-badge');
    const list  = document.getElementById('admin-notif-list');
    if (!badge || !list) return;

    if (alerts.length === 0) {
      badge.style.display = 'none';
      list.innerHTML = '<li class="notif-empty">No alerts</li>';
    } else {
      badge.style.display = 'flex';
      badge.textContent = alerts.length;
      list.innerHTML = alerts.map(a => `
        <li onclick="${a.action}" style="cursor:${a.action ? 'pointer' : 'default'};">
          <span class="notif-item-name">${a.icon} ${a.name}</span>
          <span class="notif-item-stock ${a.isCritical ? 'critical' : ''}" style="font-size:0.75rem;color:#64748b;">
            ${a.detail}
          </span>
        </li>`).join('');
    }
  }

  // ─── NAVIGATION LOGIC ───────────────────────────────────────────────────────
  const navBtns = document.querySelectorAll(".nav-btn");
  const views = document.querySelectorAll(".view-section");

  navBtns.forEach(btn => {
    btn.addEventListener("click", (e) => {
      e.preventDefault();
      navBtns.forEach(b => b.classList.remove("active"));
      btn.classList.add("active");
      views.forEach(v => v.classList.remove("active"));
      const targetId = btn.getAttribute("data-target");
      const targetEl = document.getElementById(targetId);
      if (targetEl) targetEl.classList.add("active");
      
      if (targetId === "dashboard-view") {
        setTimeout(() => {
          if (window.salesChartInstance && typeof window.salesChartInstance.resize === 'function') window.salesChartInstance.resize();
          if (window.inventoryChartInstance && typeof window.inventoryChartInstance.resize === 'function') window.inventoryChartInstance.resize();
          if (window.logisticsChartInstance && typeof window.logisticsChartInstance.resize === 'function') window.logisticsChartInstance.resize();
        }, 60);
      }
      
      const searchInput = document.getElementById("global-search-input");
      if (searchInput) {
        searchInput.value = "";
        document.querySelectorAll(".data-table tbody tr").forEach(row => row.style.display = "");
      }
    });
  });

  // ─── DROPDOWN NAVIGATION TOGGLE ────────────────────────────────────────────
  const dropdownToggles = document.querySelectorAll(".nav-dropdown-toggle");
  dropdownToggles.forEach(toggle => {
    toggle.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      const dropdown = toggle.closest(".nav-dropdown");
      
      // Safety check: if no parent dropdown found, skip
      if (!dropdown) return;
      
      const isOpen = dropdown.classList.contains("open");
      
      // Close all other dropdowns
      document.querySelectorAll(".nav-dropdown").forEach(d => d.classList.remove("open"));
      
      // Toggle current dropdown
      if (!isOpen) {
        dropdown.classList.add("open");
      }
    });
  });

  // Close dropdowns when clicking outside
  document.addEventListener("click", (e) => {
    if (!e.target.closest(".nav-dropdown")) {
      document.querySelectorAll(".nav-dropdown").forEach(d => d.classList.remove("open"));
    }
  });

  // ─── GLOBAL SEARCH FILTER ───────────────────────────────────────────────────
  const globalSearchInput = document.getElementById("global-search-input");
  if (globalSearchInput) {
    globalSearchInput.addEventListener("input", (e) => {
      const term = e.target.value.toLowerCase();
      const activeView = document.querySelector(".view-section.active");
      if (!activeView) return;
      
      const rows = activeView.querySelectorAll(".data-table tbody tr");
      rows.forEach(row => {
        const text = row.textContent.toLowerCase();
        row.style.display = text.includes(term) ? "" : "none";
      });
    });
  }

  // ─── DELIVERY ITEMS MODAL LOGIC ─────────────────────────────────────────────
  window.viewDeliveryItems = async function(deliveryRef) {
    const response = await DeliveriesAPI.getAllDeliveries();
    if (!response.success) return;
    const del = response.data.find(d => d.delivery_ref === deliveryRef);
    if (!del) return;

    const tbody = document.getElementById("view-delivery-items-body");
    tbody.innerHTML = "";

    // Backend to_dict() already parses items_json -> returns 'items' as an array
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

  // ─── LOAD DATA FROM API ──────────────────────────────────────────────────────
  let products = [];
  let orders = [];
  let allOrders = [];

  // ─── CATEGORIES ─────────────────────────────────────────────────────────────
  let categoriesList = [];

  async function loadCategories() {
    try {
      const res = await fetch('/api/categories', { credentials: 'include' });
      const json = await res.json();
      if (json.success) {
        categoriesList = json.data;
        renderCategoriesTable();
        populateCategoryDropdowns();
      }
    } catch (e) { console.error('Failed to load categories', e); }
  }

  function renderCategoriesTable() {
    const body = document.getElementById('categories-table-body');
    if (!body) return;
    if (categoriesList.length === 0) {
      body.innerHTML = `<tr><td colspan="3" style="text-align:center; color:#94a3b8;">No categories yet.</td></tr>`;
      return;
    }
    body.innerHTML = categoriesList.map((c, i) => `
      <tr>
        <td>${i + 1}</td>
        <td><strong>${c.name}</strong></td>
        <td>
          <button class="action-btn btn-small delete-btn" onclick="deleteCategory(${c.id}, '${c.name}')">Delete</button>
        </td>
      </tr>
    `).join('');
  }

  function populateCategoryDropdowns() {
    const selects = ['prod-category', 'edit-prod-category'];
    selects.forEach(id => {
      const sel = document.getElementById(id);
      if (!sel) return;
      const currentVal = sel.value;
      sel.innerHTML = '<option value="">Select Category</option>' +
        categoriesList.map(c => `<option value="${c.name}">${c.name}</option>`).join('');
      if (currentVal) sel.value = currentVal;
    });
  }

  window.deleteCategory = async function(id, name) {
    if (!confirm(`Delete category "${name}"? Products in this category will not be deleted.`)) return;
    const res = await fetch(`/api/categories/index.php?id=${id}`, { method: 'DELETE', credentials: 'include' });
    const json = await res.json();
    if (json.success) {
      categoriesList = categoriesList.filter(c => c.id !== id);
      renderCategoriesTable();
      populateCategoryDropdowns();
    } else {
      alert('Failed to delete category.');
    }
  };

  // Add Category modal
  const addCatModal = document.getElementById('add-category-modal');
  document.getElementById('open-add-category-btn')?.addEventListener('click', () => {
    document.getElementById('add-category-form').reset();
    document.getElementById('cat-feedback').style.display = 'none';
    addCatModal.classList.add('active');
  });
  [document.getElementById('close-add-category-modal'), document.getElementById('cancel-add-category')].forEach(btn => {
    btn?.addEventListener('click', () => addCatModal.classList.remove('active'));
  });
  document.getElementById('add-category-form')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const name = document.getElementById('cat-name').value.trim();
    const feedback = document.getElementById('cat-feedback');
    const res = await fetch('/api/categories/index.php', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ name })
    });
    const json = await res.json();
    feedback.style.display = 'block';
    if (json.success) {
      categoriesList.push(json.data);
      renderCategoriesTable();
      populateCategoryDropdowns();
      feedback.textContent = `Category "${name}" added!`;
      feedback.style.backgroundColor = '#d1fae5';
      feedback.style.color = '#065f46';
      setTimeout(() => addCatModal.classList.remove('active'), 900);
    } else {
      feedback.textContent = json.message || 'Failed to add category.';
      feedback.style.backgroundColor = '#fee2e2';
      feedback.style.color = '#991b1b';
    }
  });

  await loadCategories();

  // ─── BANNERS ─────────────────────────────────────────────────────────────────
  async function loadBanners() {
    try {
      // Add cache-busting timestamp + random to force fresh data from server
      const timestamp = new Date().getTime();
      const random = Math.random();
      const res = await fetch(`/api/banners?_=${timestamp}&r=${random}`, { 
        credentials: 'include',
        cache: 'no-store', // Strongest no-cache directive
        headers: {
          'Cache-Control': 'no-cache, no-store, must-revalidate',
          'Pragma': 'no-cache',
          'Expires': '0'
        }
      });
      const json = await res.json();
      console.log('Banners loaded:', json);
      console.log('Number of banners:', json.data ? json.data.length : 0);
      console.log('Banner details:', json.data);
      if (json.success) renderBanners(json.data);
    } catch (e) { console.error('Failed to load banners', e); }
  }

  function renderBanners(banners) {
    const grid = document.getElementById('banners-grid');
    if (!grid) return;
    grid.innerHTML = banners.map(b => `
      <div class="card" style="padding:0; overflow:hidden; position:relative;">
        <img src="${b.url}" alt="Banner ${b.id}"
          style="width:100%; height:180px; object-fit:cover; display:block;"
          onerror="this.src='img/slide1.png'">
        <div style="padding:12px 16px; display:flex; justify-content:space-between; align-items:center;">
          <span style="font-weight:600; color:#475569;">Banner ${b.id}</span>
          <div style="display:flex; gap:8px;">
            <label class="action-btn primary btn-small" style="cursor:pointer; margin:0;">
              Replace
              <input type="file" accept="image/*" style="display:none;"
                onchange="replaceBanner(${b.id}, this)">
            </label>
            <button class="action-btn btn-small delete-btn"
              onclick="deleteBanner(${b.id})">Delete</button>
          </div>
        </div>
      </div>
    `).join('');
  }

  window.replaceBanner = async function(id, input) {
    if (!input.files[0]) return;
    const formData = new FormData();
    formData.append('image', input.files[0]);
    formData.append('banner_id', id);
    
    console.log('Replacing banner ID:', id);
    
    // Use POST with banner_id to trigger replace logic
    const res = await fetch(`/api/banners`, { 
      method: 'POST', 
      body: formData,
      credentials: 'include'
    });
    
    const json = await res.json();
    console.log('Replace response:', json);
    
    if (json.success) { 
      alert('Banner updated!'); 
      setTimeout(() => loadBanners(), 1000);
    }
    else {
      console.error('Replace banner error:', json);
      alert('Failed to update banner: ' + (json.error || json.message || 'Unknown error'));
    }
  };

  window.deleteBanner = async function(id) {
    if (!confirm('Delete this banner?')) return;
    const res = await fetch(`/api/banners/${id}`, { 
      method: 'DELETE',
      credentials: 'include'
    });
    const json = await res.json();
    if (json.success) {
      // Delay to ensure file is written on Hostinger (increased to 1 second)
      setTimeout(() => loadBanners(), 1000);
    }
    else alert(json.message || 'Failed to delete banner.');
  };

  // Add new banner - SAME PATTERN AS PRODUCTS
  document.getElementById('add-banner-input')?.addEventListener('change', async function() {
    if (!this.files[0]) return;
    
    console.log('Adding banner - File selected:', this.files[0].name);
    
    // Step 1: Upload image file FIRST (separate endpoint)
    const formData = new FormData();
    formData.append('image', this.files[0]);
    
    console.log('Step 1: Uploading image to /api/banners/upload-image.php...');
    
    const uploadRes = await fetch('/api/banners/upload-image.php', { 
      method: 'POST', 
      body: formData,
      credentials: 'include'
    });
    
    const uploadJson = await uploadRes.json();
    console.log('Upload response:', uploadJson);
    
    if (!uploadJson.success) {
      alert('Failed to upload image: ' + (uploadJson.error || 'Unknown error'));
      this.value = '';
      return;
    }
    
    // Step 2: Add banner with the uploaded image path
    console.log('Step 2: Adding banner to JSON with path:', uploadJson.path);
    
    const addRes = await fetch('/api/banners', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ url: uploadJson.path })
    });
    
    const addJson = await addRes.json();
    console.log('Add banner response:', addJson);
    
    if (addJson.success) { 
      alert('Banner added!'); 
      console.log('New banner added:', addJson.data);
      setTimeout(() => {
        console.log('Reloading banners after add...');
        loadBanners();
      }, 1000);
    }
    else {
      console.error('Add banner error:', addJson);
      alert('Failed to add banner: ' + (addJson.error || addJson.message || 'Unknown error'));
    }
    
    this.value = '';
  });

  await loadBanners();

  async function loadAll() {
    // Products
    const pRes = await fetch('/api/products', { credentials: 'include' });
    const pJson = await pRes.json();
    if (pJson.success) {
      products = pJson.data;
      updateAdminNotifBell(products);
    }

    // Stats + orders from dashboard endpoint
    async function loadDashboardStats(startDate = null, endDate = null) {
      const params = new URLSearchParams();
      if (startDate) params.append('start_date', startDate);
      if (endDate) params.append('end_date', endDate);
      
      const sRes = await fetch(`/api/dashboard/stats?${params.toString()}`, { credentials: 'include' });
      const sJson = await sRes.json();
      
      if (sJson.success) {
        orders = sJson.recentOrders;

        const setEl = (id, v) => { const el = document.getElementById(id); if (el) el.innerText = v; };
        
        // ══ PRIMARY HERO METRIC - SALES REVENUE ═══════════════════════════════
        const salesNum = Number(sJson.todaySales || 0);
        setEl('hero-sales-amount', `₱${salesNum.toLocaleString('en-PH', {minimumFractionDigits:2})}`);
        
        // ══ 4 PRIMARY METRIC PILLARS & STATS ══════════════════════════════════
        setEl('mini-pending-orders', sJson.pendingOrders || 0);
        setEl('mini-pending-deliveries', sJson.pendingDeliveries || 0);
        setEl('mini-low-stock', sJson.lowStockCount || 0);
        setEl('mini-pending-returns', sJson.pendingReturns || 0);
        
        const totalOrdersNum = sJson.totalOrders || 0;
        setEl('stat-total-orders', totalOrdersNum);
        setEl('stat-completed-orders', sJson.completedOrders || 0);
        
        const avgOrder = totalOrdersNum > 0 ? salesNum / totalOrdersNum : 0;
        setEl('stat-avg-order-val', `₱${Math.round(avgOrder).toLocaleString('en-PH')}`);
        
        // Payment methods from orders
        const recentOrdersList = sJson.recentOrders || [];
        let cashCount = 0, gcashCount = 0, bankCount = 0;
        recentOrdersList.forEach(o => {
          const pm = (o.payment_method || o.paymentMethod || '').toLowerCase();
          if (pm === 'cash') cashCount++;
          else if (pm === 'gcash') gcashCount++;
          else if (pm.includes('bank')) bankCount++;
          else cashCount++;
        });
        setEl('pay-cash-count', cashCount);
        setEl('pay-gcash-count', gcashCount);
        setEl('pay-bank-count', bankCount);
        
        // ══ URGENT ALERTS BANNER ═══════════════════════════════════════════════
        const criticalCount = sJson.criticalStockCount || 0;
        const pendingDeliveriesCount = sJson.pendingDeliveries || 0;
        const pendingReturnsCount = sJson.pendingReturns || 0;
        
        const urgentItems = [];
        if (criticalCount > 0) {
          urgentItems.push(`<strong>${criticalCount} critical stock items</strong> need immediate restocking`);
        }
        if (pendingDeliveriesCount > 8) {
          urgentItems.push(`<strong>${pendingDeliveriesCount} deliveries</strong> waiting for driver assignment`);
        }
        if (pendingReturnsCount > 5) {
          urgentItems.push(`<strong>${pendingReturnsCount} returns</strong> pending review`);
        }
        
        const urgentBanner = document.getElementById('urgent-alerts-banner');
        const urgentList = document.getElementById('urgent-alerts-list');
        if (urgentBanner && urgentList) {
          if (urgentItems.length > 0) {
            urgentList.innerHTML = urgentItems.join('<br>');
            urgentBanner.style.display = 'block';
          } else {
            urgentBanner.style.display = 'none';
          }
        }
        
        // ══ CHART 30-DAY TOTAL ══════════════════════════════════════════════════
        setEl('chart-total-30d', `₱${Number(sJson.totalSales || 0).toLocaleString('en-PH', {minimumFractionDigits:2})}`);
        
        // ══ COLLAPSIBLE & ADDITIONAL METRICS ═══════════════════════════════════
        setEl('stat-total-sales', `₱${Number(sJson.totalSales || 0).toLocaleString('en-PH', {minimumFractionDigits:2})}`);
        setEl('stat-delivered-orders', sJson.deliveredOrders || 0);
        setEl('stat-pending-orders-count', sJson.pendingOrdersCount || 0);
        setEl('stat-cancelled-orders', sJson.cancelledOrders || 0);
        setEl('stat-return-orders', sJson.returnOrders || 0);
        setEl('stat-total-products', sJson.totalProducts || 0);
        
        // ══ RECENT ORDERS (Right column bottom) ═════════════════════════════════
        const recentDiv = document.getElementById('dashboard-recent-orders');
        if (recentDiv) {
          const recent = (sJson.recentOrders || []).slice(0, 5);
          if (recent.length === 0) {
            recentDiv.innerHTML = '<p style="text-align:center; color:#94a3b8; padding:30px;">No orders yet.</p>';
          } else {
            const statusColors = {
              pending: '#f59e0b', processing: '#3b82f6',
              completed: '#10b981', delivered: '#10b981',
              cancelled: '#ef4444'
            };
            recentDiv.innerHTML = recent.map(o => {
              const color = statusColors[o.status] || '#64748b';
              return `
                <div style="padding:8px 0; border-bottom:1px solid #f1f5f9;">
                  <div style="font-weight:600; color:#0f172a;">${o.order_ref || o.id}</div>
                  <div style="color:#64748b; font-size:11px; margin-top:2px;">
                    ${o.customer_name} • ₱${Number(o.total).toLocaleString('en-PH', {minimumFractionDigits:2})}
                  </div>
                  <div style="font-size:10px; margin-top:2px;">
                    <span style="color:${color}; font-weight:600;">${(o.status || '').toUpperCase()}</span>
                  </div>
                </div>
              `;
            }).join('');
          }
        }
        
        // Load top products (Left column bottom)
        loadTopProducts();
      }

      // All orders for the comprehensive table (regular + bulk)
      try {
        await loadAllOrders();
      } catch (e) { console.error('Failed to load all orders', e); }
    }
    
    // ═══════════════════════════════════════════════════════════════════════════
    // DATE FILTER FUNCTIONALITY
    // ═══════════════════════════════════════════════════════════════════════════
    
    // Calculate date range based on selected option
    function getDateRange(filterValue) {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      
      let startDate, endDate;
      
      switch(filterValue) {
        case 'today':
          startDate = endDate = formatDate(today);
          break;
          
        case 'yesterday':
          const yesterday = new Date(today);
          yesterday.setDate(yesterday.getDate() - 1);
          startDate = endDate = formatDate(yesterday);
          break;
          
        case 'this_week':
          const weekStart = new Date(today);
          weekStart.setDate(today.getDate() - today.getDay()); // Sunday
          startDate = formatDate(weekStart);
          endDate = formatDate(today);
          break;
          
        case 'last_week':
          const lastWeekEnd = new Date(today);
          lastWeekEnd.setDate(today.getDate() - today.getDay() - 1); // Last Saturday
          const lastWeekStart = new Date(lastWeekEnd);
          lastWeekStart.setDate(lastWeekEnd.getDate() - 6); // Last Sunday
          startDate = formatDate(lastWeekStart);
          endDate = formatDate(lastWeekEnd);
          break;
          
        case 'this_month':
          const monthStart = new Date(today.getFullYear(), today.getMonth(), 1);
          startDate = formatDate(monthStart);
          endDate = formatDate(today);
          break;
          
        case 'last_month':
          const lastMonthStart = new Date(today.getFullYear(), today.getMonth() - 1, 1);
          const lastMonthEnd = new Date(today.getFullYear(), today.getMonth(), 0);
          startDate = formatDate(lastMonthStart);
          endDate = formatDate(lastMonthEnd);
          break;
          
        default:
          startDate = endDate = null;
      }
      
      return { startDate, endDate };
    }
    
    // Format date as YYYY-MM-DD
    function formatDate(date) {
      const year = date.getFullYear();
      const month = String(date.getMonth() + 1).padStart(2, '0');
      const day = String(date.getDate()).padStart(2, '0');
      return `${year}-${month}-${day}`;
    }
    
    // Load charts with optional date filter
    async function loadChartsWithFilter(startDate = null, endDate = null) {
      try {
        const params = new URLSearchParams();
        if (startDate) params.append('start_date', startDate);
        if (endDate) params.append('end_date', endDate);
        
        const cRes = await fetch(`/api/dashboard/charts?${params.toString()}`, { credentials: 'include' });
        const cJson = await cRes.json();
        if (cJson.success) {
          renderCharts(cJson);
        }
      } catch (e) { console.error('Failed to load charts', e); }
    }
    
    // Helper to update hero card labels dynamically with date filter
    function updateHeroLabels(presetKey) {
      const salesLabel = document.getElementById('hero-sales-label');
      const delivLabel = document.getElementById('hero-deliveries-label');
      
      const salesMap = {
        today: "Today's Sales",
        yesterday: "Yesterday's Sales",
        this_week: "This Week's Sales",
        last_week: "Last Week's Sales",
        this_month: "This Month's Sales",
        last_month: "Last Month's Sales",
        custom: "Sales (Selected Range)"
      };
      const delivMap = {
        today: "Total Deliveries Today",
        yesterday: "Total Deliveries Yesterday",
        this_week: "Deliveries This Week",
        last_week: "Deliveries Last Week",
        this_month: "Deliveries This Month",
        last_month: "Deliveries Last Month",
        custom: "Deliveries (Selected Range)"
      };
      
      if (salesLabel) salesLabel.innerText = salesMap[presetKey] || "Today's Sales";
      if (delivLabel) delivLabel.innerText = delivMap[presetKey] || "Total Deliveries Today";
    }

    // Date filter dropdown change
    const dateFilterDropdown = document.getElementById('dashboard-date-filter');
    const customDateInputs = document.getElementById('custom-date-inputs');
    
    if (dateFilterDropdown) {
      dateFilterDropdown.addEventListener('change', (e) => {
        const value = e.target.value;
        updateHeroLabels(value);
        
        if (value === 'custom') {
          // Show custom date inputs
          if (customDateInputs) {
            customDateInputs.style.display = 'flex';
          }
        } else {
          // Hide custom inputs and apply preset filter
          if (customDateInputs) {
            customDateInputs.style.display = 'none';
          }
          
          const { startDate, endDate } = getDateRange(value);
          
          // Reload all unified dashboard components simultaneously
          loadDashboardStats(startDate, endDate);
          loadChartsWithFilter(startDate, endDate);
          if (window.loadLogisticsData) window.loadLogisticsData(startDate, endDate);
        }
      });
    }
    
    // Apply custom date range
    const applyCustomBtn = document.getElementById('apply-custom-filter');
    if (applyCustomBtn) {
      applyCustomBtn.addEventListener('click', () => {
        const startInput = document.getElementById('filter-start-date');
        const endInput = document.getElementById('filter-end-date');
        
        if (startInput && endInput && startInput.value && endInput.value) {
          updateHeroLabels('custom');
          // Reload all unified dashboard components simultaneously
          loadDashboardStats(startInput.value, endInput.value);
          loadChartsWithFilter(startInput.value, endInput.value);
          if (window.loadLogisticsData) window.loadLogisticsData(startInput.value, endInput.value);
        } else {
          alert('Please select both start and end dates');
        }
      });
    }

    // ═══ MANAGEMENT REPORT MODAL ══════════════════════════════════════════════
    window.openDashboardReportModal = function() {
      const modal = document.getElementById('dashboard-report-modal');
      if (!modal) return;

      const dateFilter = document.getElementById('dashboard-date-filter');
      const filterVal = dateFilter ? dateFilter.value : 'today';
      const dateTextMap = {
        today: 'Today (' + new Date().toLocaleDateString('en-PH') + ')',
        yesterday: 'Yesterday',
        this_week: 'This Week',
        last_week: 'Last Week',
        this_month: 'This Month (' + new Date().toLocaleDateString('en-PH', { month: 'long', year: 'numeric' }) + ')',
        last_month: 'Last Month',
        custom: 'Custom Date Range'
      };

      const setEl = (id, v) => { const el = document.getElementById(id); if (el) el.innerText = v; };

      setEl('report-timestamp', (dateTextMap[filterVal] || 'Today') + ' • ' + new Date().toLocaleTimeString('en-PH', { hour: '2-digit', minute: '2-digit' }));
      
      // Pull current live stats from the dashboard
      const salesVal = document.getElementById('hero-sales-amount')?.innerText || '₱0.00';
      const totalOrdersVal = document.getElementById('stat-total-orders')?.innerText || '0';
      const completedVal = document.getElementById('stat-completed-orders')?.innerText || '0';
      const pendingOrders = parseInt(document.getElementById('mini-pending-orders')?.innerText || '0') || 0;
      const pendingDeliveries = parseInt(document.getElementById('mini-pending-deliveries')?.innerText || '0') || 0;
      const stockAlerts = document.getElementById('mini-low-stock')?.innerText || '0';
      const driversCount = document.getElementById('logistics-total-drivers')?.innerText || '0';

      setEl('report-total-sales', salesVal);
      setEl('report-total-orders', totalOrdersVal);
      setEl('report-completed-orders', completedVal);
      setEl('report-pending-count', (pendingOrders + pendingDeliveries) + ' items');
      setEl('report-stock-alerts', stockAlerts + ' items');
      setEl('report-active-drivers', driversCount + ' drivers');

      // Top products table
      const topProdSource = document.getElementById('top-products-list');
      const reportTableEl = document.getElementById('report-top-products-table');
      if (reportTableEl) {
        if (topProdSource && topProdSource.children.length > 0 && !topProdSource.innerText.includes('Loading')) {
          reportTableEl.innerHTML = topProdSource.innerHTML;
        } else {
          reportTableEl.innerHTML = '<div style="color:#64748b; padding:8px 0;">Regular hardware materials in active demand (Cement, Rebar, Plywood, Nails, PVC).</div>';
        }
      }

      modal.classList.add('active');
    };

    window.printReportModalContent = function() {
      window.print();
    };
    
    // Initial load
    await loadDashboardStats();

    // Pending deliveries + bulk orders for dashboard
    try {
      const [delRes, bulkRes] = await Promise.all([
        fetch('/api/deliveries', { credentials: 'include' }).then(r => r.json()),
        fetch('/api/bulk-orders', { credentials: 'include' }).then(r => r.json()),
      ]);
      const setEl = (id, v) => { const el = document.getElementById(id); if (el) el.innerText = v; };
      if (delRes.success)  setEl('stat-pending-deliveries', (delRes.data || []).filter(d => d.status === 'pending').length);
      if (bulkRes.success) setEl('stat-pending-bulk', (bulkRes.data || []).filter(b => b.status === 'pending').length);
    } catch (e) { console.error('Failed to load delivery/bulk stats', e); }

    // ═══ LOAD LOGISTICS DATA ═══════════════════════════════════════════════════
    window.loadLogisticsData = async function(startDate = null, endDate = null) {
      const startTime = performance.now();
      console.log('Loading logistics data...');
      if (startDate && endDate) {
        console.log(`Date filter applied: ${startDate} to ${endDate}`);
      }
      
      // Show loading state
      const heroEl = document.getElementById('hero-deliveries-count');
      if (heroEl) heroEl.innerHTML = '<div style="font-size:2rem;">...</div>';
      
      try {
        const setEl = (id, v) => { 
          const el = document.getElementById(id); 
          if (el) el.innerText = v;
        };
        
        // Fetch deliveries data only (skip batch for speed)
        const fetchStart = performance.now();
        console.log('Fetching deliveries data...');
        const delRes = await fetch('/api/deliveries', { credentials: 'include' }).then(r => r.json());
        console.log(`Fetch completed in ${(performance.now() - fetchStart).toFixed(0)}ms`);

        if (delRes.success) {
          let deliveries = delRes.data || [];
          console.log(`Found ${deliveries.length} total deliveries`);
          
          // Apply date filter if provided
          if (startDate && endDate) {
            deliveries = deliveries.filter(d => {
              if (!d.created_at) return false;
              const deliveryDate = d.created_at.split(' ')[0]; // Get YYYY-MM-DD part
              return deliveryDate >= startDate && deliveryDate <= endDate;
            });
            console.log(`After date filter: ${deliveries.length} deliveries`);
          }
          
          const processStart = performance.now();
          
          // Get today's date
          const today = new Date().toISOString().split('T')[0];
          
          // Calculate all counts in one pass for efficiency
          let todayCount = 0, pending = 0, inTransit = 0, completed = 0, failed = 0;
          const uniqueDrivers = new Set();
          const uniqueBatches = new Set();
          let totalDeliveryMinutes = 0;
          let completedWithDuration = 0;
          
          deliveries.forEach(d => {
            // Today's deliveries
            if (d.created_at && d.created_at.startsWith(today)) todayCount++;
            
            // Status counts
            if (d.status === 'pending' || d.status === 'scheduled') {
              pending++;
            } else if (d.status === 'in_transit' || d.status === 'out_for_delivery') {
              inTransit++;
            } else if (d.status === 'delivered' || d.status === 'completed') {
              completed++;
              // Calculate completion time if timestamps are recorded
              const startStr = d.date_assigned || d.dateAssigned || d.created_at || d.createdAt;
              const endStr = d.date_completed || d.dateCompleted;
              if (startStr && endStr) {
                const startMs = new Date(startStr).getTime();
                const endMs = new Date(endStr).getTime();
                if (!isNaN(startMs) && !isNaN(endMs) && endMs > startMs) {
                  const diffMins = (endMs - startMs) / (1000 * 60);
                  if (diffMins > 0 && diffMins <= 10080) { // filter valid ranges up to 7 days
                    totalDeliveryMinutes += diffMins;
                    completedWithDuration++;
                  }
                }
              }
            } else if (d.status === 'failed' || d.status === 'cancelled') {
              failed++;
            }
            
            // Unique drivers
            const driver = d.driver_name || d.delivery_person || d.deliveryPerson;
            if (driver && String(driver).trim() !== '') uniqueDrivers.add(String(driver).trim());

            // Unique truck batches
            const batchId = d.truck_batch_id || d.truckBatchId;
            if (batchId) uniqueBatches.add(batchId);
          });
          
          console.log(`Data processed in ${(performance.now() - processStart).toFixed(0)}ms`);
          
          // Update all elements - use filtered deliveries count, not just today's
          setEl('hero-deliveries-count', deliveries.length); // Fixed: show filtered count
          setEl('logistics-pending', pending);
          setEl('logistics-transit', inTransit);
          setEl('logistics-completed', completed);
          setEl('logistics-batches', uniqueBatches.size);
          setEl('logistics-chart-total-30d', deliveries.length);
          
          // Recent deliveries list
          const listStart = performance.now();
          const recentDiv = document.getElementById('logistics-recent-deliveries');
          if (recentDiv) {
            const recent = deliveries
              .sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0))
              .slice(0, 5);
            
            if (recent.length === 0) {
              recentDiv.innerHTML = '<p style="text-align:center; color:#94a3b8; padding:30px;">No deliveries yet.</p>';
            } else {
              const statusColors = {
                pending: '#f59e0b', scheduled: '#f59e0b',
                in_transit: '#3b82f6', out_for_delivery: '#3b82f6',
                delivered: '#10b981', completed: '#10b981',
                failed: '#ef4444', cancelled: '#ef4444'
              };
              
              recentDiv.innerHTML = recent.map(d => {
                const color = statusColors[d.status] || '#64748b';
                const statusText = (d.status || '').replace(/_/g, ' ').toUpperCase();
                return `
                  <div style="padding:8px 0; border-bottom:1px solid #f1f5f9;">
                    <div style="font-weight:600; color:#0f172a;">${d.delivery_ref || d.id}</div>
                    <div style="color:#64748b; font-size:11px; margin-top:2px;">
                      ${d.customer_name || 'N/A'} • ${d.address || 'No address'}
                    </div>
                    <div style="font-size:10px; margin-top:2px;">
                      <span style="color:${color}; font-weight:600;">${statusText}</span>
                    </div>
                  </div>
                `;
              }).join('');
            }
          }
          console.log(`List rendered in ${(performance.now() - listStart).toFixed(0)}ms`);
          
          // Show More Stats
          setEl('logistics-total-drivers', uniqueDrivers.size || 0);
          
          const activeTrucksToday = deliveries.filter(d => 
            d.created_at && d.created_at.startsWith(today) && 
            (d.status === 'in_transit' || d.status === 'out_for_delivery')
          ).length;
          setEl('logistics-active-trucks', activeTrucksToday);

          let avgTimeStr = 'N/A';
          if (completedWithDuration > 0) {
            const avgMins = Math.round(totalDeliveryMinutes / completedWithDuration);
            if (avgMins >= 60) {
              const hrs = Math.floor(avgMins / 60);
              const mins = avgMins % 60;
              avgTimeStr = mins > 0 ? `${hrs}h ${mins}m` : `${hrs}h`;
            } else {
              avgTimeStr = `${avgMins}m`;
            }
          } else if (completed > 0) {
            avgTimeStr = '~1.5h';
          } else {
            avgTimeStr = '0h';
          }
          setEl('logistics-avg-time', avgTimeStr);
          
          // Success rate
          const totalAttempted = deliveries.filter(d => d.status !== 'pending' && d.status !== 'scheduled').length;
          const successRate = totalAttempted > 0 ? Math.round((completed / totalAttempted) * 100) : 0;
          setEl('logistics-success-rate', successRate + '%');
          
          // Render chart AFTER everything else (non-blocking)
          setTimeout(() => {
            const chartStart = performance.now();
            console.log('Rendering chart...');
            renderLogisticsChart(deliveries);
            console.log(`Chart rendered in ${(performance.now() - chartStart).toFixed(0)}ms`);
          }, 100);
          
          const totalTime = (performance.now() - startTime).toFixed(0);
          console.log(`TOTAL LOAD TIME: ${totalTime}ms`);
        } else {
          console.error('Failed to load deliveries:', delRes);
          if (heroEl) heroEl.innerText = '0';
        }
      } catch (e) {
        console.error('Failed to load logistics data:', e);
        if (heroEl) heroEl.innerText = '0';
      }
    };

    // ═══ LOAD INVENTORY DATA ════════════════════════════════════════════════════
    window.loadInventoryData = async function(startDate = null, endDate = null) {
      const startTime = performance.now();
      console.log('Loading inventory data...');
      if (startDate && endDate) {
        console.log(`Date filter applied: ${startDate} to ${endDate}`);
      }
      
      // Show loading state
      const heroEl = document.getElementById('hero-products-count');
      if (heroEl) heroEl.innerHTML = '<div style="font-size:2rem;">...</div>';
      
      try {
        const setEl = (id, v) => { 
          const el = document.getElementById(id); 
          if (el) el.innerText = v;
        };
        
        // Fetch products data
        const fetchStart = performance.now();
        console.log('Fetching products data...');
        const prodRes = await fetch('/api/products', { credentials: 'include' }).then(r => r.json());
        console.log(`Fetch completed in ${(performance.now() - fetchStart).toFixed(0)}ms`);

        if (prodRes.success) {
          let products = prodRes.data || [];
          console.log(`Found ${products.length} total products`);
          
          // Date filter doesn't make sense for inventory (it's current state, not historical)
          // But we'll keep the parameters for consistency with other views
          
          const processStart = performance.now();
          
          // Calculate inventory metrics
          let outOfStock = 0, lowStock = 0, criticalStock = 0, totalValue = 0;
          const categoryCounts = {};
          const categoryStock = {};
          
          products.forEach(p => {
            const stock = parseInt(p.stock) || 0;
            const price = parseFloat(p.price) || 0;
            const minQty = parseInt(p.min_quantity) || 20;
            const critQty = parseInt(p.critical_quantity) || 5;
            const category = p.category || 'Uncategorized';
            
            // Stock status
            if (stock === 0) outOfStock++;
            else if (stock <= critQty) criticalStock++;
            else if (stock <= minQty) lowStock++;
            
            // Total value
            totalValue += stock * price;
            
            // Category grouping
            if (!categoryCounts[category]) {
              categoryCounts[category] = 0;
              categoryStock[category] = 0;
            }
            categoryCounts[category]++;
            categoryStock[category] += stock;
          });
          
          console.log(`Data processed in ${(performance.now() - processStart).toFixed(0)}ms`);
          
          // Update hero metric
          setEl('hero-products-count', products.length);
          
          // Update 4 mini cards
          setEl('inventory-out-stock', outOfStock);
          setEl('inventory-low', lowStock);
          setEl('inventory-critical', criticalStock);
          
          // Format total value
          const valueEl = document.getElementById('inventory-value');
          if (valueEl) {
            if (totalValue >= 1000000) {
              valueEl.innerText = '₱' + (totalValue / 1000000).toFixed(1) + 'M';
            } else if (totalValue >= 1000) {
              valueEl.innerText = '₱' + (totalValue / 1000).toFixed(0) + 'K';
            } else {
              valueEl.innerText = '₱' + totalValue.toFixed(0);
            }
          }
          
          // Update category count
          const categoryCount = Object.keys(categoryCounts).length;
          setEl('inventory-categories-count', categoryCount);
          
          // Top Categories (by value)
          const listStart = performance.now();
          const topCatDiv = document.getElementById('inventory-top-categories');
          if (topCatDiv) {
            const categoryValues = {};
            products.forEach(p => {
              const cat = p.category || 'Uncategorized';
              const val = (parseInt(p.stock) || 0) * (parseFloat(p.price) || 0);
              categoryValues[cat] = (categoryValues[cat] || 0) + val;
            });
            
            const sorted = Object.entries(categoryValues)
              .sort((a, b) => b[1] - a[1])
              .slice(0, 5);
            
            if (sorted.length === 0) {
              topCatDiv.innerHTML = '<p style="text-align:center; color:#94a3b8; padding:30px;">No categories</p>';
            } else {
              topCatDiv.innerHTML = sorted.map(([cat, val]) => {
                const valStr = val >= 1000000 ? `₱${(val/1000000).toFixed(1)}M` : 
                               val >= 1000 ? `₱${(val/1000).toFixed(0)}K` : 
                               `₱${val.toFixed(0)}`;
                return `
                  <div style="display:flex; justify-content:space-between; padding:4px 0;">
                    <span style="color:#0f172a; font-weight:500;">${cat}</span>
                    <span style="color:#10b981; font-weight:700;">${valStr}</span>
                  </div>
                `;
              }).join('');
            }
          }
          
          // Stock Alerts List
          const alertsDiv = document.getElementById('inventory-alerts-list');
          if (alertsDiv) {
            const alerts = products
              .filter(p => (parseInt(p.stock) || 0) <= (parseInt(p.min_quantity) || 20))
              .sort((a, b) => (parseInt(a.stock) || 0) - (parseInt(b.stock) || 0))
              .slice(0, 8);
            
            if (alerts.length === 0) {
              alertsDiv.innerHTML = '<p style="text-align:center; color:#94a3b8; padding:30px;">All stock levels healthy</p>';
            } else {
              alertsDiv.innerHTML = alerts.map(p => {
                const stock = parseInt(p.stock) || 0;
                const critQty = parseInt(p.critical_quantity) || 5;
                const color = stock === 0 ? '#dc2626' : stock <= critQty ? '#ef4444' : '#f59e0b';
                const status = stock === 0 ? 'OUT OF STOCK' : stock <= critQty ? 'CRITICAL' : 'LOW';
                
                return `
                  <div style="padding:8px 0; border-bottom:1px solid #f1f5f9;">
                    <div style="font-weight:600; color:#0f172a; font-size:12px;">${p.name}</div>
                    <div style="display:flex; justify-content:space-between; margin-top:4px;">
                      <span style="font-size:11px; color:#64748b;">${p.category}</span>
                      <span style="font-size:11px; color:${color}; font-weight:700;">${stock} ${p.unit} • ${status}</span>
                    </div>
                  </div>
                `;
              }).join('');
            }
          }
          console.log(`Lists rendered in ${(performance.now() - listStart).toFixed(0)}ms`);
          
          // Show More Stats
          setEl('inventory-total-skus', products.length);
          
          const avgStock = products.length > 0 ? 
            Math.round(products.reduce((sum, p) => sum + (parseInt(p.stock) || 0), 0) / products.length) : 0;
          setEl('inventory-avg-stock', avgStock);
          
          const restockNeeded = products.filter(p => (parseInt(p.stock) || 0) <= (parseInt(p.min_quantity) || 20)).length;
          setEl('inventory-restock-needed', restockNeeded);
          
          // Healthy Stock Rate calculation
          const healthyRate = products.length > 0 
            ? Math.round(((products.length - restockNeeded) / products.length) * 100) 
            : 100;
          setEl('inventory-turnover', healthyRate + '%');
          
          // Render chart AFTER everything else (non-blocking)
          setTimeout(() => {
            const chartStart = performance.now();
            console.log('Rendering chart...');
            renderInventoryChart(categoryStock);
            console.log(`Chart rendered in ${(performance.now() - chartStart).toFixed(0)}ms`);
          }, 100);
          
          const totalTime = (performance.now() - startTime).toFixed(0);
          console.log(`TOTAL LOAD TIME: ${totalTime}ms`);
        } else {
          console.error('Failed to load products:', prodRes);
          if (heroEl) heroEl.innerText = '0';
        }
      } catch (e) {
        console.error('Failed to load inventory data:', e);
        if (heroEl) heroEl.innerText = '0';
      }
    };

    // Render logistics chart
    function renderLogisticsChart(deliveries) {
      const canvas = document.getElementById('logisticsChart');
      if (!canvas || !window.Chart) return;
      
      // Group by date (last 30 days)
      const last30Days = {};
      for (let i = 29; i >= 0; i--) {
        const date = new Date();
        date.setDate(date.getDate() - i);
        const dateStr = date.toISOString().split('T')[0];
        last30Days[dateStr] = 0;
      }
      
      deliveries.forEach(d => {
        const date = (d.created_at || '').split(' ')[0];
        if (last30Days.hasOwnProperty(date)) {
          last30Days[date]++;
        }
      });
      
      const labels = Object.keys(last30Days).map(d => {
        const date = new Date(d);
        return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
      });
      const data = Object.values(last30Days);
      
      // Destroy existing chart if any
      if (window.logisticsChartInstance) {
        window.logisticsChartInstance.destroy();
      }
      
      window.logisticsChartInstance = new Chart(canvas, {
        type: 'line',
        data: {
          labels: labels,
          datasets: [{
            label: 'Deliveries',
            data: data,
            borderColor: '#3b82f6',
            backgroundColor: 'rgba(59, 130, 246, 0.1)',
            borderWidth: 2,
            tension: 0.4,
            fill: true
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: { display: false }
          },
          scales: {
            y: {
              beginAtZero: true,
              ticks: { precision: 0 }
            }
          }
        }
      });
    }

    // Render inventory chart
    function renderInventoryChart(categoryStock) {
      const canvas = document.getElementById('inventoryChart');
      if (!canvas || !window.Chart) return;
      
      // Sort categories by stock level
      const sorted = Object.entries(categoryStock)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 8); // Top 8 categories
      
      const labels = sorted.map(([cat]) => cat);
      const data = sorted.map(([, stock]) => stock);
      
      // Color palette for categories
      const colors = [
        '#10b981', '#3b82f6', '#f59e0b', '#ef4444', 
        '#8b5cf6', '#ec4899', '#14b8a6', '#f97316'
      ];
      
      // Destroy existing chart if any
      if (window.inventoryChartInstance) {
        window.inventoryChartInstance.destroy();
      }
      
      window.inventoryChartInstance = new Chart(canvas, {
        type: 'bar',
        data: {
          labels: labels,
          datasets: [{
            label: 'Stock Units',
            data: data,
            backgroundColor: colors.slice(0, labels.length),
            borderColor: colors.slice(0, labels.length),
            borderWidth: 1
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: { display: false }
          },
          scales: {
            y: {
              beginAtZero: true,
              ticks: { precision: 0 }
            }
          }
        }
      });
    }

    // Charts
    try {
      const cRes = await fetch('/api/dashboard/charts', { credentials: 'include' });
      const cJson = await cRes.json();
      if (cJson.success) {
        renderCharts(cJson);
      }
    } catch (e) { console.error('Failed to load charts', e); }

    // Customers
    try {
      const cuRes = await fetch('/api/customers', { credentials: 'include' });
      const cuJson = await cuRes.json();
      if (cuJson.success) {
        const custList = cuJson.data || [];
        renderCustomers(custList);
        
        // Populate dashboard customer metrics
        const setEl = (id, v) => { const el = document.getElementById(id); if (el) el.innerText = v; };
        setEl('stat-total-customers', custList.length);
        const curMonth = new Date().toISOString().slice(0, 7);
        const newCount = custList.filter(c => c.created_at && c.created_at.startsWith(curMonth)).length;
        setEl('stat-new-customers', `+${newCount} this month`);
      }
    } catch (e) { console.error('Failed to load customers', e); }

    // Employees (Staff & Driver)
    try {
      const eRes = await fetch('/api/auth/employees', { credentials: 'include' });
      const eJson = await eRes.json();
      if (eJson.success) {
        const empList = eJson.data || [];
        renderEmployees(empList);
        
        // Populate dashboard employee metrics
        const setEl = (id, v) => { const el = document.getElementById(id); if (el) el.innerText = v; };
        setEl('stat-active-staff', `${empList.length} staff`);
      }
    } catch (e) { console.error('Failed to load employees', e); }

    renderProductsManagement();
    renderOrderManagement(allOrders);
    renderInventory();
    renderDeliveries();
    populateProductFilter();
    populateInventoryFilter();

    // Load unified dashboard logistics & inventory data immediately
    if (window.loadLogisticsData) {
      window.loadLogisticsData();
    }
    if (window.loadInventoryData) {
      window.loadInventoryData();
    }
  }

  await loadAll();

  // ─── LOAD TOP PRODUCTS FOR DASHBOARD ───────────────────────────────────────
  async function loadTopProducts() {
    try {
      const res = await fetch('/api/products/best-selling', { credentials: 'include' });
      const data = await res.json();
      
      if (data.success && data.data.length > 0) {
        const list = document.getElementById('top-products-list');
        if (list) {
          list.innerHTML = data.data.slice(0, 5).map((p, i) => `
            <div style="padding:4px 0;">
              <span style="color:#94a3b8; font-weight:600;">${i+1}.</span>
              <span style="font-weight:600; color:#0f172a;">${p.name}</span>
              <div style="font-size:11px; color:#64748b; margin-left:14px;">
                ${p.sold_quantity} ${p.unit || 'pcs'} sold
              </div>
            </div>
          `).join('');
        }
      }
    } catch (e) {
      console.error('Failed to load top products:', e);
    }
  }

  // ─── DASHBOARD CHARTS (NO HOVER TOOLTIPS) ──────────────────────────────
  function renderCharts(cData) {
    if (!document.getElementById('salesChart')) return;
    
    // Common options: NO TOOLTIPS = professional look
    const commonOpts = {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          display: false, // Hide legend for cleaner look
        },
        tooltip: {
          enabled: false  // ← NO HOVER TOOLTIPS! (professional look per user requirement)
        }
      }
    };
    
    // Sales Over Time (Line) - LARGE CHART for Option A Dashboard
    const salesCanvas = document.getElementById('salesChart');
    const existingSalesChart = Chart.getChart(salesCanvas);
    if (existingSalesChart) existingSalesChart.destroy();
    if (window.salesChartInstance) {
      window.salesChartInstance.destroy();
    }
    
    window.salesChartInstance = new Chart(salesCanvas, {
      type: 'line',
      data: {
        labels: cData.salesLabels || [],
        datasets: [{
          label: 'Daily Sales (₱)',
          data: cData.salesData || [],
          borderColor: '#f97316',
          backgroundColor: 'rgba(249, 115, 22, 0.1)',
          borderWidth: 3,
          fill: true,
          tension: 0.3,
          pointRadius: 4,
          pointBackgroundColor: '#f97316',
          pointBorderColor: '#fff',
          pointBorderWidth: 2
        }]
      },
      options: {
        ...commonOpts,
        scales: {
          y: {
            beginAtZero: true,
            ticks: {
              callback: (val) => '₱' + val.toLocaleString(),
              font: { size: 10 }
            },
            grid: { color: '#f1f5f9' }
          },
          x: {
            ticks: { font: { size: 10 } },
            grid: { display: false }
          }
        }
      }
    });

    // Option A only has 1 main chart - removed statusChart and inventoryChart
  }

  // ─── CUSTOMERS DIRECTORY ───────────────────────────────────────────────────
  function renderCustomers(customerList) {
    const body = document.getElementById("customers-table-body");
    if (!body) return;
    let html = "";
    customerList.forEach(c => {
      html += `
        <tr>
          <td><strong>${c.id}</strong></td>
          <td>${c.full_name || 'N/A'}</td>
          <td>${c.email}</td>
          <td>${c.phone || 'N/A'}</td>
          <td>${c.town || 'N/A'}</td>
          <td>${c.created_at || 'Unknown'}</td>
          <td>
             <button class="action-btn btn-small delete-btn" onclick="deleteCustomer(${c.id})">Delete</button>
          </td>
        </tr>
      `;
    });
    body.innerHTML = html;
  }

  window.deleteCustomer = async function(id) {
    if(!confirm('Are you sure you want to permanently delete this customer?')) return;
    try {
      const res = await fetch(`/api/customers/${id}`, { method: 'DELETE' });
      const json = await res.json();
      if(json.success) {
        alert('Customer deleted.');
        loadAll();
      } else {
        alert(json.message || 'Failed to delete customer.');
      }
    } catch (e) { console.error(e); }
  }

  // ─── EMPLOYEES DIRECTORY ───────────────────────────────────────────────────
  function renderEmployees(employeeList) {
    const body = document.getElementById("employees-table-body");
    if (!body) return;
    let html = "";
    employeeList.forEach(e => {
      const roleClass = e.role === 'staff' ? 'in-stock' : 'low-stock';
      html += `
        <tr>
          <td><strong>${e.id}</strong></td>
          <td>${e.full_name || 'N/A'}</td>
          <td>${e.email}</td>
          <td><span class="status ${roleClass}">${e.role.toUpperCase()}</span></td>
          <td>${e.phone || 'N/A'}</td>
          <td>
             <button class="action-btn btn-small delete-btn" onclick="deleteEmployee(${e.id})">Remove</button>
          </td>
        </tr>
      `;
    });
    body.innerHTML = html;
  }

  window.deleteEmployee = async function(id) {
    if(!confirm('Are you sure you want to permanently delete this employee account?')) return;
    try {
      const res = await fetch(`/api/auth/employees/${id}`, { method: 'DELETE' });
      const json = await res.json();
      if(json.success) {
        alert('Employee deleted.');
        loadAll();
      } else {
        alert(json.message || 'Failed to delete employee.');
      }
    } catch (e) { console.error(e); }
  }

  const addEmployeeModal = document.getElementById("add-employee-modal");
  const openAddEmployeeBtn = document.getElementById("open-add-employee-btn");
  if (openAddEmployeeBtn) {
    openAddEmployeeBtn.addEventListener("click", () => {
      document.getElementById("add-employee-form").reset();
      addEmployeeModal.classList.add("active");
    });
  }

  [document.getElementById("close-add-employee-modal"), document.getElementById("cancel-add-employee")].forEach(btn => {
    if (btn) btn.addEventListener("click", () => addEmployeeModal.classList.remove("active"));
  });

  const addEmployeeForm = document.getElementById("add-employee-form");
  if (addEmployeeForm) {
    addEmployeeForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      
      const payload = {
        full_name: document.getElementById("emp-name").value,
        email: document.getElementById("emp-email").value,
        password: document.getElementById("emp-password").value,
        phone: document.getElementById("emp-phone").value,
        role: document.getElementById("emp-role").value
      };

      try {
        const res = await fetch('/api/auth/register-employee', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });
        const json = await res.json();
        
        if (json.success) {
          alert('Employee successfully registered!');
          addEmployeeModal.classList.remove("active");
          loadAll();
        } else {
          alert('Registration failed: ' + json.message);
        }
      } catch (err) {
        console.error("Failed to register employee:", err);
      }
    });
  }

  function renderProductsManagement() {
    const productsTableBody = document.getElementById("products-table-body");
    if (!productsTableBody) return;

    // Category filter
    const catFilter = document.getElementById('product-category-filter');
    const selectedCat = catFilter ? catFilter.value : 'all';

    let html = "";
    const filtered = selectedCat === 'all' ? products : products.filter(p => p.category === selectedCat);

    filtered.forEach((p) => {
      const discountBadge = p.discount > 0
        ? `<span style="background:#fef2f2;color:#dc2626;padding:2px 7px;border-radius:12px;font-size:0.75rem;font-weight:700;">-${p.discount}%</span>`
        : '<span style="color:#94a3b8;">--</span>';

      html += `
        <tr>
          <td><img src="${p.image}" class="img-cell" alt="${p.name}" style="width:48px;height:48px;object-fit:cover;border-radius:6px;"></td>
          <td><strong>${p.name}</strong><br><small style="color:#94a3b8;">₱${parseFloat(p.price).toFixed(2)} / ${p.unit || 'pcs'}</small></td>
          <td>${p.category || 'Construction'}</td>
          <td>${discountBadge}</td>
          <td>
            <button class="action-btn btn-small primary" onclick="openManageVariants(${p.id}, '${p.name.replace(/'/g,"\\'")}')">Variants</button>
            <button class="action-btn btn-small edit-btn" onclick="openEditProduct(${p.id})">Edit</button>
            <button class="action-btn btn-small delete-btn" onclick="deleteProduct(${p.id})">Delete</button>
          </td>
        </tr>
      `;
    });
    productsTableBody.innerHTML = html;
    
    // Update stock alert stats if elements exist
    const alertsEl = document.getElementById("stat-alerts");
    if (alertsEl) alertsEl.innerText = products.filter(p => p.stock < (p.minQuantity || 20)).length;
    
    const criticalEl = document.getElementById("stat-critical") || document.getElementById("stat-critical-stock");
    if (criticalEl) criticalEl.innerText = products.filter(p => p.stock <= (p.criticalQuantity || 5)).length;
  }

  // Populate product category filter dropdown
  function populateProductFilter() {
    const catFilter = document.getElementById('product-category-filter');
    if (!catFilter) return;
    catFilter.innerHTML = '<option value="all">All Categories</option>' +
      categoriesList.map(c => `<option value="${c.name}">${c.name}</option>`).join('');
    catFilter.addEventListener('change', renderProductsManagement);
  }

  window.deleteProduct = async function(productId) {
    if (!confirm('Are you sure you want to delete this product?')) return;
    const res = await fetch(`/api/products/${productId}`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ actorName: 'Admin', actorRole: 'admin' })
    });
    const json = await res.json();
    if (json.success) {
      products = products.filter(p => p.id !== productId);
      renderProductsManagement();
      renderInventory();
    } else {
      alert(json.error || json.message || 'Failed to delete product.');
    }
  };

  // ─── VARIANTS MANAGEMENT ──────────────────────────────────────────────────
  let currentVariantProductId = null;

  window.openManageVariants = async function(productId, productName) {
    currentVariantProductId = productId;
    document.getElementById('variants-product-name').textContent = productName;
    document.getElementById('new-variant-size').value  = '';
    document.getElementById('new-variant-price').value = '';
    document.getElementById('new-variant-stock').value = '';
    document.getElementById('new-variant-min').value   = '';
    document.getElementById('variants-feedback').style.display = 'none';
    document.getElementById('variants-modal').classList.add('active');
    await loadVariants(productId);
  };

  async function loadVariants(productId) {
    const listEl = document.getElementById('variants-list');
    listEl.innerHTML = '<p style="color:#94a3b8; font-size:0.875rem;">Loading…</p>';
    try {
      const res  = await fetch(`/api/products/${productId}/variants`);
      const json = await res.json();
      const variants = json.data || [];

      if (variants.length === 0) {
        listEl.innerHTML = '<p style="color:#94a3b8; font-size:0.875rem; text-align:center; padding:12px 0;">No variants yet. Add one below.</p>';
        return;
      }

      listEl.innerHTML = `
        <table style="width:100%; border-collapse:collapse; font-size:0.875rem;">
          <thead>
            <tr style="background:#f8fafc; color:#64748b; font-size:0.78rem; font-weight:600;">
              <th style="padding:8px 10px; text-align:left;">Size / Label</th>
              <th style="padding:8px 10px; text-align:right;">Price</th>
              <th style="padding:8px 10px; text-align:right;">Stock</th>
              <th style="padding:8px 10px; text-align:right;">Min Stock</th>
              <th style="padding:8px 10px;"></th>
            </tr>
          </thead>
          <tbody>
            ${variants.map(v => `
              <tr style="border-bottom:1px solid #f1f5f9;">
                <td style="padding:8px 10px; font-weight:600;">${v.size}</td>
                <td style="padding:8px 10px; text-align:right;">₱${Number(v.price).toLocaleString('en-PH', {minimumFractionDigits:2})}</td>
                <td style="padding:8px 10px; text-align:right;">${v.stock}</td>
                <td style="padding:8px 10px; text-align:right;">${v.min_stock ?? 5}</td>
                <td style="padding:8px 10px; text-align:right;">
                  <button onclick="deleteVariant(${productId}, ${v.id})"
                    style="background:#fee2e2; color:#dc2626; border:none; border-radius:5px; padding:3px 10px; font-size:0.78rem; cursor:pointer; font-weight:600;">
                    Remove
                  </button>
                </td>
              </tr>`).join('')}
          </tbody>
        </table>`;
    } catch (e) {
      listEl.innerHTML = '<p style="color:#ef4444; font-size:0.875rem;">Failed to load variants.</p>';
    }
  }

  window.addVariant = async function() {
    const size  = document.getElementById('new-variant-size').value.trim();
    const price = parseFloat(document.getElementById('new-variant-price').value);
    const stock = parseInt(document.getElementById('new-variant-stock').value);
    const min   = parseInt(document.getElementById('new-variant-min').value) || 5;
    const fb    = document.getElementById('variants-feedback');

    if (!size || isNaN(price) || isNaN(stock)) {
      fb.textContent = 'Size, Price, and Stock are required.';
      fb.style.cssText = 'display:block; background:#fee2e2; color:#dc2626; padding:8px 12px; border-radius:6px; font-size:0.875rem;';
      return;
    }

    const res  = await fetch(`/api/products/${currentVariantProductId}/variants`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ size, price, stock, min_stock: min })
    });
    const json = await res.json();

    if (json.success) {
      fb.textContent = `Variant "${size}" added!`;
      fb.style.cssText = 'display:block; background:#d1fae5; color:#065f46; padding:8px 12px; border-radius:6px; font-size:0.875rem;';
      document.getElementById('new-variant-size').value  = '';
      document.getElementById('new-variant-price').value = '';
      document.getElementById('new-variant-stock').value = '';
      document.getElementById('new-variant-min').value   = '';
      // Refresh variants list + products cache
      await loadVariants(currentVariantProductId);
      const pRes = await fetch('/api/products', { credentials: 'include' });
      const pJson = await pRes.json();
      if (pJson.success) products = pJson.data;
    } else {
      fb.textContent = json.error || 'Failed to add variant.';
      fb.style.cssText = 'display:block; background:#fee2e2; color:#dc2626; padding:8px 12px; border-radius:6px; font-size:0.875rem;';
    }
  };

  window.deleteVariant = async function(productId, variantId) {
    if (!confirm('Remove this variant?')) return;
    const res  = await fetch(`/api/products/${productId}/variants/${variantId}`, { method: 'DELETE' });
    const json = await res.json();
    if (json.success) {
      await loadVariants(productId);
      const pRes = await fetch('/api/products', { credentials: 'include' });
      const pJson = await pRes.json();
      if (pJson.success) products = pJson.data;
    } else {
      alert(json.error || 'Failed to delete variant.');
    }
  };

  window.openEditProduct = function(id) {
    const p = products.find(prod => prod.id === id);
    if (!p) return;
    document.getElementById("edit-prod-id").value = p.id;
    document.getElementById("edit-prod-name").value = p.name;
    document.getElementById("edit-prod-price").value = p.price;
    document.getElementById("edit-prod-category").value = p.category;
    document.getElementById("edit-prod-stock").value = p.stock;
    document.getElementById("edit-prod-min-qty").value = p.minQuantity || 20;
    document.getElementById("edit-prod-critical-qty").value = p.criticalQuantity || 5;
    document.getElementById("edit-prod-unit").value = p.unit || 'pcs';
    document.getElementById("edit-prod-discount").value = p.discount || 0;
    document.getElementById("edit-prod-image").value = p.image || '';
    // Show current image preview
    const editPreview = document.getElementById('edit-prod-image-preview');
    if (editPreview) editPreview.src = p.image || 'img/concrete-hollow-block-300x300.jpg';
    document.getElementById('edit-prod-image-name').textContent = 'No file chosen (keep current)';
    // Clear any previously chosen file
    const editFileInput = document.getElementById('edit-prod-image-file');
    if (editFileInput) editFileInput.value = '';
    document.getElementById("edit-product-modal").classList.add("active");
    // Load variants for this product
    loadVariants(id);
  };

  // Track current product id for variants
  let currentEditProductId = null;

  async function loadVariants(productId) {
    currentEditProductId = productId;
    const res = await fetch(`/api/products/${productId}/variants`);
    const json = await res.json();
    renderVariantsList(json.success ? json.data : []);
  }

  function renderVariantsList(variants) {
    const list = document.getElementById('variants-list');
    if (!list) return;

    // Show/hide parent stock fields based on whether variants exist
    const parentStockFields = document.getElementById('parent-stock-fields');
    if (parentStockFields) {
      parentStockFields.style.display = variants.length > 0 ? 'none' : '';
    }

    if (variants.length === 0) {
      list.innerHTML = '<p style="color:#94a3b8;font-size:13px;">No variants yet. Add one below.</p>';
      return;
    }
    list.innerHTML = variants.map(v => `
      <div style="display:grid;grid-template-columns:1fr 1fr 1fr 1fr auto;gap:8px;align-items:center;margin-bottom:8px;padding:8px;background:#f8fafc;border-radius:6px;border:1px solid #e2e8f0;">
        <span style="font-size:13px;font-weight:600;">${v.size}</span>
        <span style="font-size:13px;">₱${parseFloat(v.price).toFixed(2)}</span>
        <span style="font-size:13px;">${v.stock} pcs</span>
        <span style="font-size:12px;color:#f59e0b;">Alert at: ${v.min_stock ?? 5}</span>
        <button onclick="deleteVariant(${v.id})" class="action-btn btn-small delete-btn">Delete</button>
      </div>
    `).join('');
  }

  window.addVariant = async function() {
    const size     = document.getElementById('new-variant-size').value.trim();
    const price    = parseFloat(document.getElementById('new-variant-price').value);
    const stock    = parseInt(document.getElementById('new-variant-stock').value) || 0;
    const minStock = parseInt(document.getElementById('new-variant-min-stock').value) || 5;

    if (!size || isNaN(price) || price <= 0) {
      alert('Size and price are required.');
      return;
    }

    const res = await fetch(`/api/products/${currentEditProductId}/variants`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ size, price, stock, min_stock: minStock })
    });
    const json = await res.json();
    if (json.success) {
      document.getElementById('new-variant-size').value = '';
      document.getElementById('new-variant-price').value = '';
      document.getElementById('new-variant-stock').value = '';
      document.getElementById('new-variant-min-stock').value = '5';
      loadVariants(currentEditProductId);
      await loadAll();
    } else {
      alert(json.message || 'Failed to add variant.');
    }
  };

  window.deleteVariant = async function(variantId) {
    if (!confirm('Delete this variant?')) return;
    const res = await fetch(`/api/products/${currentEditProductId}/variants/${variantId}`, {
      method: 'DELETE'
    });
    const json = await res.json();
    if (json.success) {
      loadVariants(currentEditProductId);
      await loadAll();
    }
  };

  const editProductForm = document.getElementById("edit-product-form");
  if (editProductForm) {
    editProductForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      const id = document.getElementById("edit-prod-id").value;

      // Upload new image if one was chosen, otherwise keep current
      let image = document.getElementById("edit-prod-image").value;
      const editFileInput = document.getElementById("edit-prod-image-file");
      if (editFileInput && editFileInput.files[0]) {
        const uploaded = await uploadProductImage(editFileInput);
        if (uploaded) image = uploaded;
      }

      const data = {
        name: document.getElementById("edit-prod-name").value,
        price: parseFloat(document.getElementById("edit-prod-price").value),
        category: document.getElementById("edit-prod-category").value,
        stock: parseInt(document.getElementById("edit-prod-stock").value),
        minQuantity: parseInt(document.getElementById("edit-prod-min-qty").value) || 20,
        criticalQuantity: parseInt(document.getElementById("edit-prod-critical-qty").value) || 5,
        unit: document.getElementById("edit-prod-unit").value.trim() || 'pcs',
        discount: parseFloat(document.getElementById("edit-prod-discount").value) || 0,
        image,
        actorName: 'Admin',
        actorRole: 'admin'
      };

      try {
        const res = await fetch(`/api/products/${id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(data)
        });
        const json = await res.json();
        if (json.success) {
          document.getElementById("edit-product-modal").classList.remove("active");
          await loadAll();
          alert("Product updated!");
        } else {
          alert(json.message || 'Update failed.');
        }
      } catch (err) {
        console.error("Failed to update product:", err);
      }
    });
  }

  // ─── ORDER MANAGEMENT ────────────────────────────────────────────────────────
  async function loadAllOrders() {
    // Load regular orders + bulk orders
    const oRes = await fetch('/api/orders', { credentials: 'include' });
    const oJson = await oRes.json();
    if (oJson.success) allOrders = oJson.data.map(o => ({ ...o, _type: 'order' }));

    // Load bulk orders and merge
    try {
      const bRes = await fetch('/api/bulk-orders', { credentials: 'include' });
      const bJson = await bRes.json();
      if (bJson.success) {
        const bulkAsOrders = bJson.data.map(b => ({
          id:            b.id,
          order_ref:     b.bulk_ref,
          customer_name: b.customer_name,
          date:          b.created_at ? b.created_at.substring(0, 10) : '--',
          total:         b.quoted_amount || b.final_amount || 0,
          status:        b.status,
          items:         b.items || [],
          discount_type: b.discount_type || null,
          discount_amount: b.discount_amount || 0,
          _type:         'bulk',
          _bulk_ref:     b.bulk_ref,
        }));
        allOrders = [...allOrders, ...bulkAsOrders];
      }
    } catch (e) { /* bulk orders optional */ }

    // Sort all by date/timestamp descending (newest first)
    allOrders.sort((a, b) => {
      const aDate = a.created_at || a.date || '';
      const bDate = b.created_at || b.date || '';
      return bDate > aDate ? 1 : -1;
    });

    renderOrderManagement(allOrders);
  }

  function renderOrderManagement(orderList) {
    const body = document.getElementById("orders-table-body");
    let html = "";

    const STATUS_CONFIG = {
      pending:                 { label: 'Pending',            color: '#854d0e', bg: '#fef9c3' },
      processing:              { label: 'Processing',         color: '#075985', bg: '#e0f2fe' },
      out_for_delivery:        { label: 'Out for Delivery',   color: '#6d28d9', bg: '#f5f3ff' },
      quoted:                  { label: 'Quoted',             color: '#1e40af', bg: '#dbeafe' },
      confirmed:               { label: 'Confirmed',          color: '#065f46', bg: '#d1fae5' },
      delivered:               { label: 'Delivered',          color: '#065f46', bg: '#d1fae5' },
      completed:               { label: 'Completed',          color: '#166534', bg: '#bbf7d0' },
      cancelled:               { label: 'Cancelled',          color: '#991b1b', bg: '#fee2e2' },
      cancellation_requested:  { label: 'Cancel Requested',   color: '#7c2d12', bg: '#ffedd5' },
    };

    orderList.forEach(order => {
      const cfg = STATUS_CONFIG[order.status] || { label: order.status, color: '#333', bg: '#f1f5f9' };
      const isBulk = order._type === 'bulk';
      const isWalkIn = order.order_type === 'walk-in';
      const itemSummary = Array.isArray(order.items) && order.items.length
        ? order.items.map(i => `${i.qty||1}x ${i.name || i.description}`).join(', ')
        : '--';

      const typeBadge = isBulk
        ? `<span style="background:#fef3c7;color:#92400e;padding:2px 8px;border-radius:12px;font-size:0.75rem;font-weight:700;">Bulk</span>`
        : isWalkIn
        ? `<span style="background:#fecdd3;color:#881391;padding:2px 8px;border-radius:12px;font-size:0.75rem;font-weight:700;">Walk-in</span>`
        : `<span style="background:#e0f2fe;color:#0369a1;padding:2px 8px;border-radius:12px;font-size:0.75rem;font-weight:700;">Online</span>`;

      const reasonHtml = order.cancel_reason
        ? `<div style="font-size:0.75rem;color:#7c2d12;margin-top:3px;">Reason: ${order.cancel_reason}</div>`
        : '';

      const discountBadge = order.discount_type
        ? `<div style="font-size:0.73rem;color:#dc2626;margin-top:2px;">
             ${order.discount_type === 'promo' ? 'Promo Promo' : 'Bulk Bulk'} -₱${parseFloat(order.discount_amount||0).toFixed(2)}
           </div>`
        : '';

      const manageBtn = isBulk
        ? (() => {
            // Bulk order -- show different buttons based on status
            if (order.status === 'confirmed') {
              return `<button class="action-btn btn-small primary"
                onclick="startBulkProcessing('${order.order_ref}')"
                style="background:#f97316;color:#fff;">
                Processing Start Processing
              </button>`;
            } else if (['processing','delivered','completed'].includes(order.status)) {
              return `<span style="font-size:0.78rem;color:#64748b;">Managing in Deliveries</span>`;
            } else {
              return `<button class="action-btn btn-small secondary"
                onclick="document.querySelector('[data-target=\\'bulk-orders-view\\']')?.click()"
                style="background:#f1f5f9;color:#475569;">
                View in Bulk Orders
              </button>`;
            }
          })()
        : `<button class="action-btn btn-small edit-btn" onclick="openOrderStatusModal('${order.order_ref || order.id}', '${order.status}', ${JSON.stringify(itemSummary).replace(/"/g,'&quot;')}, '${(order.customer_name || 'Walk-in').replace(/'/g,"\\'")}', '${order.date || ''}', '${order.total}')">
             Manage
           </button>
           <button class="action-btn btn-small secondary" style="background:#f1f5f9;color:#475569;" onclick="printPurchaseOrder('${order.order_ref || order.id}')">
             Print PO
           </button>`;

      html += `
        <tr style="${order.status === 'cancelled' && order.cancel_reason ? 'background:#fff7ed;' : ''}">
          <td><strong>${order.order_ref || order.id}</strong></td>
          <td>${typeBadge}</td>
          <td>${order.customer_name || 'Walk-in'}</td>
          <td>${order.date || '--'}</td>
          <td>
            ₱${parseFloat(order.total).toLocaleString()}
            ${discountBadge}
          </td>
          <td>
            <span class="order-status-badge" style="background:${cfg.bg};color:${cfg.color};padding:4px 10px;border-radius:12px;font-size:0.78rem;font-weight:600;">
              ${cfg.label}
            </span>
            ${reasonHtml}
          </td>
          <td>${manageBtn}</td>
        </tr>
      `;
    });

    if (body) body.innerHTML = html;
  }

  // ─── START BULK PROCESSING (from Order Management) ───────────────────────────
  window.startBulkProcessing = async function(bulkRef) {
    if (!confirm(`Start processing bulk order ${bulkRef}? This will create a delivery record.`)) return;
    try {
      const res  = await fetch(`/api/bulk-orders/${bulkRef}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ action: 'process' })
      });
      const json = await res.json();
      if (json.success) {
        alert(`Bulk order ${bulkRef} is now processing. A delivery record has been created.`);
        await loadAllOrders();
        renderDeliveries();
      } else {
        alert(json.error || 'Failed to start processing.');
      }
    } catch (err) {
      alert('Server error. Please try again.');
    }
  };

  // ─── ORDER STATUS MODAL (Admin) ───────────────────────────────────────────────
  window.openOrderStatusModal = function(orderRef, currentStatus, itemSummary, customer, date, total) {
    const existing = document.getElementById('order-status-modal-overlay');
    if (existing) existing.remove();

    const NEXT_STEPS = [
      { status: 'processing', label: 'Mark as Processing', color: '#0284c7', desc: 'Staff is preparing the materials.' },
      { status: 'cancelled',  label: 'Cancel Reservation', color: '#dc2626', desc: 'Cancel this reservation.' },
    ];

    // Only show actions for pending orders — processing and beyond are handled by cashier or truck planner
    const isActionable = currentStatus === 'pending';
    const isCompleted  = ['completed', 'delivered', 'cancelled'].includes(currentStatus);
    const isProcessing = currentStatus === 'processing';

    const buttonsHtml = isCompleted
      ? `<div style="text-align:center;padding:16px;background:#f0fdf4;border-radius:8px;color:#166534;font-size:0.85rem;font-weight:600;">
           Order is ${currentStatus} — no further actions needed.
         </div>`
      : isProcessing
      ? `<div style="text-align:center;padding:16px;background:#eff6ff;border-radius:8px;color:#1e40af;font-size:0.85rem;font-weight:600;">
           Order is being processed. Customer will pay at the cashier.<br>
           <span style="font-weight:400;font-size:0.8rem;color:#64748b;">Cashier will complete this order upon payment.</span>
         </div>
         <button class="order-action-btn" onclick="updateOrderStatus('${orderRef}', 'cancelled', 'Admin', 'admin')"
           style="background:#dc2626;color:#fff;border:none;padding:10px 16px;border-radius:8px;font-size:0.85rem;font-weight:600;cursor:pointer;width:100%;margin-top:8px;">
           Cancel Reservation
         </button>`
      : isActionable
      ? NEXT_STEPS.map(s => `
          <button class="order-action-btn" onclick="updateOrderStatus('${orderRef}', '${s.status}', 'Admin', 'admin')"
            style="background:${s.color};color:#fff;border:none;padding:10px 16px;border-radius:8px;
                   font-size:0.85rem;font-weight:600;cursor:pointer;display:flex;align-items:center;gap:8px;width:100%;">
            <span>${s.label}</span>
            <span style="font-size:0.75rem;opacity:0.85;margin-left:auto;">${s.desc}</span>
          </button>`).join('')
      : `<div style="text-align:center;padding:16px;background:#f8fafc;border-radius:8px;color:#64748b;font-size:0.85rem;">
           No actions available for this order status.
         </div>`;

    const overlay = document.createElement('div');
    overlay.id = 'order-status-modal-overlay';
    overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.45);display:flex;align-items:center;justify-content:center;z-index:9999;padding:16px;';
    overlay.innerHTML = `
      <div style="background:#fff;border-radius:14px;width:100%;max-width:460px;box-shadow:0 20px 60px rgba(0,0,0,0.2);overflow:hidden;">
        <div style="padding:18px 22px;border-bottom:1px solid #f1f5f9;background:#f8fafc;display:flex;justify-content:space-between;align-items:center;">
          <div>
            <h3 style="margin:0;font-size:1rem;color:#1e293b;">Manage Reservation</h3>
            <p style="margin:2px 0 0;font-size:0.78rem;color:#64748b;font-family:monospace;">${orderRef}</p>
          </div>
          <button onclick="document.getElementById('order-status-modal-overlay').remove()" 
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
            <div style="display:flex;justify-content:space-between;margin-bottom:6px;">
              <span style="color:#64748b;">Total</span><strong>₱${parseFloat(total).toLocaleString()}</strong>
            </div>
            <div style="margin-top:8px;padding-top:8px;border-top:1px solid #e2e8f0;">
              <span style="color:#64748b;">Items:</span> ${itemSummary}
            </div>
          </div>
          <p style="font-size:0.8rem;font-weight:600;color:#64748b;text-transform:uppercase;letter-spacing:0.05em;margin:0 0 10px;">Update Status</p>
          <div style="display:flex;flex-direction:column;gap:8px;">
            ${buttonsHtml}
          </div>
        </div>
      </div>`;
    document.body.appendChild(overlay);
    overlay.addEventListener('click', e => { if (e.target === overlay) overlay.remove(); });
  };

  window.updateOrderStatus = async function(orderRef, newStatus, actorName, actorRole) {
    try {
      const res = await fetch(`/api/orders/${orderRef}/status`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus, actorName, actorRole })
      });
      const json = await res.json();
      if (json.success) {
        document.getElementById('order-status-modal-overlay')?.remove();
        // Refresh orders list
        await loadAllOrders();
      } else {
        alert('Failed to update status: ' + (json.error || 'Unknown error'));
      }
    } catch (err) {
      alert('Server error. Please try again.');
    }
  };

  // ─── PRINT PURCHASE ORDER ────────────────────────────────────────────────────
  window.printPurchaseOrder = function(orderRef) {
    const order = allOrders.find(o => (o.order_ref || o.id) == orderRef);
    if (!order) { alert('Order not found.'); return; }

    const items = Array.isArray(order.items) ? order.items : [];
    const subtotal  = parseFloat(order.subtotal  || order.total);
    const discAmt   = parseFloat(order.discount_amount || 0);
    const total     = parseFloat(order.total);
    const discType  = order.discount_type
      ? (order.discount_type === 'promo' ? 'Promo Discount (5%)' : 'Bulk Order Discount (10%)')
      : null;

    const itemRows = items.map((item, i) => {
      const unitPrice = parseFloat(item.price || 0);
      const qty       = parseInt(item.qty || item.quantity || 1);
      const lineTotal = unitPrice * qty;
      return `
        <tr>
          <td style="padding:8px 12px;border-bottom:1px solid #e2e8f0;">${i + 1}</td>
          <td style="padding:8px 12px;border-bottom:1px solid #e2e8f0;">${item.name}</td>
          <td style="padding:8px 12px;border-bottom:1px solid #e2e8f0;text-align:center;">${qty}</td>
          <td style="padding:8px 12px;border-bottom:1px solid #e2e8f0;text-align:right;">₱${unitPrice.toFixed(2)}</td>
          <td style="padding:8px 12px;border-bottom:1px solid #e2e8f0;text-align:right;font-weight:600;">₱${lineTotal.toFixed(2)}</td>
        </tr>`;
    }).join('');

    const discountRow = discType ? `
      <tr>
        <td colspan="4" style="padding:6px 12px;text-align:right;color:#dc2626;">${discType}</td>
        <td style="padding:6px 12px;text-align:right;color:#dc2626;font-weight:600;">-- ₱${discAmt.toFixed(2)}</td>
      </tr>` : '';

    const poNumber = `PO-${orderRef}`;
    const printDate = new Date().toLocaleDateString('en-PH', { year:'numeric', month:'long', day:'numeric' });

    const w = window.open('', '_blank', 'width=800,height=700');
    w.document.write(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>Purchase Order - ${poNumber}</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: 'Helvetica Neue', Arial, sans-serif; color: #1e293b; background: white; padding: 40px; }
    .po-header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 32px; border-bottom: 3px solid #f97316; padding-bottom: 20px; }
    .brand-name { font-size: 1.6rem; font-weight: 800; color: #f97316; }
    .brand-sub  { font-size: 0.85rem; color: #64748b; margin-top: 4px; }
    .po-title   { text-align: right; }
    .po-title h1 { font-size: 1.4rem; font-weight: 700; color: #1e293b; }
    .po-title p  { font-size: 0.85rem; color: #64748b; margin-top: 4px; }
    .po-meta { display: grid; grid-template-columns: 1fr 1fr; gap: 24px; margin-bottom: 28px; }
    .po-meta-box { background: #f8fafc; border-radius: 8px; padding: 14px 18px; }
    .po-meta-box h3 { font-size: 0.75rem; text-transform: uppercase; letter-spacing: 0.05em; color: #94a3b8; margin-bottom: 8px; }
    .po-meta-box p  { font-size: 0.9rem; margin-bottom: 4px; }
    table { width: 100%; border-collapse: collapse; margin-bottom: 20px; }
    thead tr { background: #f97316; color: white; }
    thead th { padding: 10px 12px; text-align: left; font-size: 0.82rem; font-weight: 700; text-transform: uppercase; letter-spacing: 0.04em; }
    thead th:last-child, thead th:nth-child(3), thead th:nth-child(4) { text-align: right; }
    thead th:nth-child(3) { text-align: center; }
    .totals-section { display: flex; justify-content: flex-end; }
    .totals-box { min-width: 280px; }
    .total-row { display: flex; justify-content: space-between; padding: 6px 0; font-size: 0.9rem; border-bottom: 1px solid #f1f5f9; }
    .total-row.grand { font-size: 1.05rem; font-weight: 700; border-bottom: none; padding-top: 10px; color: #f97316; }
    .discount-row { color: #dc2626; }
    .po-footer { margin-top: 40px; border-top: 1px solid #e2e8f0; padding-top: 16px; display: flex; justify-content: space-between; font-size: 0.78rem; color: #94a3b8; }
    .sig-line { margin-top: 50px; border-top: 1px solid #334155; width: 200px; font-size: 0.78rem; color: #475569; padding-top: 4px; }
    .sig-block { display: flex; justify-content: space-between; margin-top: 40px; }
    @media print {
      body { padding: 20px; }
      .no-print { display: none; }
    }
  </style>
</head>
<body>
  <div class="po-header">
    <div>
      <div class="brand-name">JMC Materials</div>
      <div class="brand-sub">Hardware & Construction Supplies</div>
      <div class="brand-sub" style="margin-top:2px;">San Pedro, Laguna, Philippines</div>
    </div>
    <div class="po-title">
      <h1>PURCHASE ORDER</h1>
      <p>${poNumber}</p>
      <p>Date: ${printDate}</p>
    </div>
  </div>

  <div class="po-meta">
    <div class="po-meta-box">
      <h3>Bill To / Customer</h3>
      <p><strong>${order.customer_name || 'Walk-in Customer'}</strong></p>
      ${order.customer_phone ? `<p>Tel: ${order.customer_phone}</p>` : ''}
      ${order.customer_address ? `<p>Addr: ${order.customer_address}${order.customer_town ? ', ' + order.customer_town : ''}</p>` : ''}
      ${order.customer_email ? `<p>Email: ${order.customer_email}</p>` : ''}
    </div>
    <div class="po-meta-box">
      <h3>Order Details</h3>
      <p><strong>Order Ref:</strong> ${order.order_ref || order.id}</p>
      <p><strong>Order Date:</strong> ${order.date || '--'}</p>
      <p><strong>Order Type:</strong> ${order.order_type || '--'}</p>
      <p><strong>Status:</strong> ${(order.status || '').charAt(0).toUpperCase() + (order.status || '').slice(1)}</p>
    </div>
  </div>

  <table>
    <thead>
      <tr>
        <th>#</th>
        <th>Item / Description</th>
        <th style="text-align:center;">Qty</th>
        <th style="text-align:right;">Unit Price</th>
        <th style="text-align:right;">Amount</th>
      </tr>
    </thead>
    <tbody>
      ${itemRows}
    </tbody>
  </table>

  <div class="totals-section">
    <div class="totals-box">
      <div class="total-row">
        <span>Subtotal</span>
        <span>₱${subtotal.toFixed(2)}</span>
      </div>
      ${discType ? `<div class="total-row discount-row"><span>${discType}</span><span>-- ₱${discAmt.toFixed(2)}</span></div>` : ''}
      <div class="total-row grand">
        <span>TOTAL AMOUNT</span>
        <span>₱${total.toFixed(2)}</span>
      </div>
    </div>
  </div>

  <div class="sig-block">
    <div>
      <div class="sig-line">Prepared by</div>
    </div>
    <div>
      <div class="sig-line">Approved by</div>
    </div>
    <div>
      <div class="sig-line">Received by / Customer Signature</div>
    </div>
  </div>

  <div class="po-footer">
    <span>JMC Materials · jmcmaterials.com</span>
    <span>Generated: ${new Date().toLocaleString('en-PH')}</span>
  </div>

  <div class="no-print" style="margin-top:30px;text-align:center;">
    <button onclick="window.print()" style="padding:12px 32px;background:#f97316;color:white;border:none;border-radius:8px;font-size:1rem;font-weight:700;cursor:pointer;">
      Print Print / Save as PDF
    </button>
    <button onclick="window.close()" style="padding:12px 24px;background:#f1f5f9;color:#475569;border:none;border-radius:8px;font-size:1rem;cursor:pointer;margin-left:12px;">
      Close
    </button>
  </div>
</body>
</html>`);
    w.document.close();
    w.focus();
  };

  window.viewOrder = function(id) {
    const order = allOrders.find(o => o.id === id);
    if (!order) return;
    
    document.getElementById("view-order-customer").textContent = order.customer || 'Walk-in';
    document.getElementById("view-order-date").textContent = order.date;
    document.getElementById("view-order-status").textContent = order.status;
    document.getElementById("view-order-total").textContent = `₱${parseFloat(order.total).toLocaleString()}`;
    
    // Customer details section
    const detailsEl = document.getElementById("view-order-customer-details");
    if (detailsEl) {
      const phone   = order.user_phone   || '--';
      const email   = order.user_email   || '--';
      const address = order.user_address || '--';
      const town    = order.user_town    || '--';
      const isWalkin = !order.user_phone && !order.user_email;
      detailsEl.innerHTML = isWalkin
        ? `<p style="color:#94a3b8; font-size:13px; font-style:italic;">Walk-in / unregistered customer -- no account details available.</p>`
        : `
          <div style="display:grid; grid-template-columns:1fr 1fr; gap:8px 20px; font-size:13px; margin-top:4px;">
            <div><span style="color:#64748b;">Phone</span><br><strong>${phone}</strong></div>
            <div><span style="color:#64748b;">Email</span><br><strong>${email}</strong></div>
            <div><span style="color:#64748b;">Address</span><br><strong>${address}</strong></div>
            <div><span style="color:#64748b;">Town / City</span><br><strong>${town}</strong></div>
          </div>`;
    }

    const itemsBody = document.getElementById("view-order-items-body");
    itemsBody.innerHTML = "";
    
    if (order.items && order.items.length > 0) {
      order.items.forEach(item => {
        let price = item.price || 0;
        let subtotal = price * item.qty;
        itemsBody.innerHTML += `
          <tr>
            <td>${item.name}</td>
            <td>₱${parseFloat(price).toLocaleString()}</td>
            <td>${item.qty}</td>
            <td>₱${parseFloat(subtotal).toLocaleString()}</td>
            <td>${item.notes || '-'}</td>
          </tr>
        `;
      });
    } else {
      itemsBody.innerHTML = `<tr><td colspan="4" style="text-align:center;">No items record.</td></tr>`;
    }
    
    document.getElementById("view-order-modal").classList.add("active");
  };

  // ─── INVENTORY ───────────────────────────────────────────────────────────────

  function renderInventory() {
    const inventoryTableBody = document.getElementById("inventory-table-body");
    if (!inventoryTableBody) return;

    const catFilter = document.getElementById('inventory-category-filter');
    const selectedCat = catFilter ? catFilter.value : 'all';
    const filtered = selectedCat === 'all' ? products : products.filter(p => p.category === selectedCat);

    let html = "";
    filtered.forEach(p => {
      const minQty = p.minQuantity || 20;
      const critQty = p.criticalQuantity || 5;
      const unit = p.unit || 'pcs';
      const hasVariants = p.variants && p.variants.length > 0;

      // Determine parent status
      let stockLevel = 'in-stock', statusText = 'In Stock';
      if (hasVariants) {
        const hasOut      = p.variants.some(v => v.stock <= 0);
        const hasCritical = p.variants.some(v => v.stock > 0 && v.stock <= Math.floor((v.min_stock ?? 5) / 2));
        const hasLow      = p.variants.some(v => v.stock > Math.floor((v.min_stock ?? 5) / 2) && v.stock <= (v.min_stock ?? 5));
        if (hasOut || hasCritical)    { stockLevel = 'critical-stock'; statusText = 'Critical'; }
        else if (hasLow)              { stockLevel = 'low-stock';      statusText = 'Low Stock'; }
      } else {
        if (p.stock <= 0)             { stockLevel = 'critical-stock'; statusText = 'Out of Stock'; }
        else if (p.stock <= critQty)  { stockLevel = 'critical-stock'; statusText = 'Critical'; }
        else if (p.stock < minQty)    { stockLevel = 'low-stock';      statusText = 'Low Stock'; }
      }

      // Parent row
      html += `
        <tr class="inv-parent-row" style="cursor:${hasVariants ? 'pointer' : 'default'};" 
            ${hasVariants ? `onclick="toggleVariantRows('inv-${p.id}')"` : ''}>
          <td>
            <strong>${p.name}</strong>
            ${hasVariants ? `<span style="margin-left:6px;font-size:0.75rem;color:#f97316;font-weight:600;">(${p.variants.length} variants)</span>` : ''}
          </td>
          <td>${p.sku || '--'}</td>
          <td>${p.category || '--'}</td>
          <td><strong style="color:${stockLevel === 'critical-stock' ? '#dc2626' : stockLevel === 'low-stock' ? '#d97706' : 'inherit'}">${p.stock} ${unit}</strong></td>
          <td>${hasVariants ? '--' : minQty + ' ' + unit}</td>
          <td style="color:#dc2626;font-weight:600;">${hasVariants ? '--' : critQty + ' ' + unit}</td>
          <td><span class="status ${stockLevel}">${statusText}</span></td>
          <td>
            ${hasVariants 
              ? `<button class="action-btn secondary btn-small" onclick="event.stopPropagation(); toggleVariantRows('inv-${p.id}')">View Variants</button>`
              : `<div style="display:flex;align-items:center;gap:4px;">
                   <input type="number" id="restock-qty-${p.id}" min="1" placeholder="Qty" style="width:55px;padding:4px 6px;border:1px solid #ccc;border-radius:4px;font-size:0.82rem;" />
                   <button class="action-btn primary btn-small" onclick="restockProduct(${p.id}, '${p.name}')">Restock</button>
                 </div>`
            }
          </td>
        </tr>
      `;

      // Variant rows (hidden by default)
      if (hasVariants) {
        p.variants.forEach(v => {
          const minS = v.min_stock ?? 5;
          let vLevel = 'in-stock', vText = 'In Stock';
          if (v.stock <= 0)                         { vLevel = 'critical-stock'; vText = 'Out of Stock'; }
          else if (v.stock <= Math.floor(minS / 2)) { vLevel = 'critical-stock'; vText = 'Critical'; }
          else if (v.stock <= minS)                 { vLevel = 'low-stock';      vText = 'Low Stock'; }

          html += `
            <tr class="inv-variant-row inv-${p.id}" style="display:none;background:#f8fafc;">
              <td style="padding-left:28px;">
                <span style="color:#94a3b8;margin-right:4px;">└</span>
                <span style="font-size:0.88rem;font-weight:500;">${v.size}</span>
              </td>
              <td style="color:#94a3b8;font-size:0.82rem;">--</td>
              <td style="color:#94a3b8;font-size:0.82rem;">--</td>
              <td><strong style="color:${vLevel === 'critical-stock' ? '#dc2626' : vLevel === 'low-stock' ? '#d97706' : 'inherit'};font-size:0.88rem;">${v.stock} ${unit}</strong></td>
              <td style="font-size:0.82rem;">${minS} ${unit}</td>
              <td style="color:#dc2626;font-size:0.82rem;">${Math.floor(minS/2)} ${unit}</td>
              <td><span class="status ${vLevel}" style="font-size:0.75rem;">${vText}</span></td>
              <td>
                <div style="display:flex;align-items:center;gap:4px;">
                  <input type="number" id="restock-qty-v${v.id}" min="1" placeholder="Qty" style="width:55px;padding:4px 6px;border:1px solid #ccc;border-radius:4px;font-size:0.82rem;" />
                  <button class="action-btn primary btn-small" onclick="restockVariant(${p.id}, ${v.id}, '${p.name}', '${v.size}')">Restock</button>
                </div>
              </td>
            </tr>
          `;
        });
      }
    });
    inventoryTableBody.innerHTML = html;
  }

  window.toggleVariantRows = function(groupClass) {
    const rows = document.querySelectorAll(`.${groupClass}`);
    const btn = document.querySelector(`[onclick*="toggleVariantRows('${groupClass}')"]`);
    const isHidden = rows[0]?.style.display === 'none';
    rows.forEach(r => r.style.display = isHidden ? '' : 'none');

    const parentRow = document.querySelector(`.inv-parent-row[onclick*="${groupClass}"]`);
    if (parentRow) {
      const arrow = parentRow.querySelector('span[style*="color:#f97316"]');
      if (arrow) arrow.textContent = isHidden ? `(${rows.length} variants)` : `(${rows.length} variants)`;
    }
    const viewBtn = document.querySelector(`button[onclick*="toggleVariantRows('${groupClass}')"]`);
    if (viewBtn) viewBtn.textContent = isHidden ? 'Hide Variants' : 'View Variants';
  };

  // Populate inventory category filter
  function populateInventoryFilter() {
    const catFilter = document.getElementById('inventory-category-filter');
    if (!catFilter) return;
    catFilter.innerHTML = '<option value="all">All Categories</option>' +
      categoriesList.map(c => `<option value="${c.name}">${c.name}</option>`).join('');
    catFilter.addEventListener('change', renderInventory);
  }

  window.restockProduct = async function(productId, productName) {
    const input = document.getElementById(`restock-qty-${productId}`);
    const qty = parseInt(input ? input.value : prompt(`How many units to add for "${productName}"?`));
    if (!qty || qty <= 0) { alert('Please enter a valid quantity.'); return; }
    const res = await fetch(`/api/products/${productId}/restock`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ quantity: qty, actorName: 'Admin', actorRole: 'admin' })
    });
    const json = await res.json();
    if (json.success) {
      const p = products.find(p => p.id === productId);
      if (p) p.stock = json.data.stock;
      renderInventory();
      renderProductsManagement();
      alert(`Restocked ${qty} units for ${productName}.`);
    } else {
      alert('Restock failed.');
    }
  };

  window.restockVariant = async function(productId, variantId, productName, variantSize) {
    const input = document.getElementById(`restock-qty-v${variantId}`);
    const qty = parseInt(input ? input.value : prompt(`How many units to add for "${productName} (${variantSize})"?`));
    if (!qty || qty <= 0) { alert('Please enter a valid quantity.'); return; }
    const res = await fetch(`/api/products/${productId}/restock?variant_id=${variantId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ quantity: qty, actorName: 'Admin', actorRole: 'admin' })
    });
    const json = await res.json();
    if (json.success) {
      // Update local variant stock
      const p = products.find(p => p.id === productId);
      if (p) {
        p.stock = json.data.stock;
        const v = p.variants?.find(v => v.id === variantId);
        if (v) v.stock += qty;
      }
      renderInventory();
      renderProductsManagement();
      alert(`Restocked ${qty} units for ${productName} (${variantSize}).`);
    } else {
      alert('Restock failed.');
    }
  };

  // ─── ADD PRODUCT MODAL ───────────────────────────────────────────────────────
  const addModal = document.getElementById("add-product-modal");
  const openAddBtn = document.getElementById("open-add-product-btn");
  const closeAddBtns = [
    document.getElementById("close-add-product-modal"),
    document.getElementById("cancel-add-product")
  ];
  const addForm = document.getElementById("add-product-form");
  const feedback = document.getElementById("form-feedback");

  // Image file picker -- Add form
  const prodImageFile = document.getElementById('prod-image-file');
  if (prodImageFile) {
    prodImageFile.addEventListener('change', () => {
      const file = prodImageFile.files[0];
      if (!file) return;
      document.getElementById('prod-image-name').textContent = file.name;
      // Show local preview immediately
      const reader = new FileReader();
      reader.onload = e => {
        document.getElementById('prod-image-preview').src = e.target.result;
      };
      reader.readAsDataURL(file);
    });
  }

  // Image file picker -- Edit form
  const editProdImageFile = document.getElementById('edit-prod-image-file');
  if (editProdImageFile) {
    editProdImageFile.addEventListener('change', () => {
      const file = editProdImageFile.files[0];
      if (!file) return;
      document.getElementById('edit-prod-image-name').textContent = file.name;
      const reader = new FileReader();
      reader.onload = e => {
        document.getElementById('edit-prod-image-preview').src = e.target.result;
      };
      reader.readAsDataURL(file);
    });
  }

  async function uploadProductImage(fileInput) {
    const file = fileInput.files[0];
    if (!file) return null;
    const formData = new FormData();
    formData.append('image', file);
    const res = await fetch('/api/products/upload-image.php', { method: 'POST', body: formData });
    const json = await res.json();
    return json.success ? json.path : null;
  }

  if (openAddBtn) {
    openAddBtn.addEventListener("click", () => {
      addForm.reset();
      feedback.style.display = 'none';
      document.getElementById('prod-image-preview').src = 'img/concrete-hollow-block-300x300.jpg';
      document.getElementById('prod-image-name').textContent = 'No file chosen';
      document.getElementById('prod-image').value = 'img/concrete-hollow-block-300x300.jpg';
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
      const minQuantity = parseInt(document.getElementById("prod-min-qty").value) || 20;
      const criticalQuantity = parseInt(document.getElementById("prod-critical-qty").value) || 5;
      const unit = (document.getElementById("prod-unit").value || 'pcs').trim();
      const discount = parseFloat(document.getElementById("prod-discount").value) || 0;

      if (!name || isNaN(price) || !category || isNaN(stock)) {
        feedback.innerText = "Please fill all required fields correctly.";
        feedback.style.display = "block";
        feedback.style.backgroundColor = "#fee2e2";
        feedback.style.color = "#991b1b";
        return;
      }

      // Upload image file if one was chosen
      let image = document.getElementById("prod-image").value || "img/concrete-hollow-block-300x300.jpg";
      const fileInput = document.getElementById("prod-image-file");
      if (fileInput && fileInput.files[0]) {
        const uploaded = await uploadProductImage(fileInput);
        if (uploaded) image = uploaded;
      }

      const res = await fetch('/api/products/index.php', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ name, price, category, stock, minQuantity, criticalQuantity, unit, discount, image, actorName: 'Admin', actorRole: 'admin' })
      });
      const json = await res.json();

      if (json.success) {
        products.push(json.data);
        renderProductsManagement();
        renderInventory();

        feedback.innerText = "Product added successfully!";
        feedback.style.display = "block";
        feedback.style.backgroundColor = "#d1fae5";
        feedback.style.color = "#065f46";

        setTimeout(() => addModal.classList.remove("active"), 1000);
      } else {
        feedback.innerText = json.message || "Failed to add product.";
        feedback.style.display = "block";
        feedback.style.backgroundColor = "#fee2e2";
        feedback.style.color = "#991b1b";
      }
    });
  }

  // ─── DELIVERY MANAGEMENT ─────────────────────────────────────────────────────
  // NOTE: Driver assignment is now handled exclusively via Truck Planner.
  // This view is monitor-only. Status changes only happen through:
  //   pending -> out_for_delivery  : Truck Planner dispatch
  //   out_for_delivery -> delivered: Driver uploads proof
  //   delivered -> (no change)     : final state

  async function renderDeliveries() {
    const deliveriesTableBody = document.getElementById("deliveries-table-body");
    if (!deliveriesTableBody) return;

    const response = await DeliveriesAPI.getAllDeliveries();
    if (!response.success) return;
    const deliveries = response.data;

    let total = deliveries.length, pending = 0, out = 0, done = 0;
    let html = "";

    deliveries.forEach(del => {
      if (del.status === 'pending')           pending++;
      else if (del.status === 'out_for_delivery') out++;
      else if (del.status === 'delivered')    done++;

      // ── Status badge ──────────────────────────────────────────────────────
      const statusColors = {
        pending:          { bg: '#fef9c3', color: '#854d0e' },
        out_for_delivery: { bg: '#dbeafe', color: '#1e40af' },
        delivered:        { bg: '#dcfce7', color: '#166534' },
        failed:           { bg: '#fee2e2', color: '#991b1b' },
      };
      const sc = statusColors[del.status] || { bg: '#f1f5f9', color: '#475569' };
      const statusBadge = `<span style="background:${sc.bg};color:${sc.color};padding:3px 10px;border-radius:20px;font-size:0.75rem;font-weight:700;white-space:nowrap;">
        ${del.status.replace(/_/g, ' ').toUpperCase()}
      </span>`;

      // ── Batch info ────────────────────────────────────────────────────────
      const batchInfo = del.truck_batch_id
        ? `<span style="font-size:0.72rem;color:#6d28d9;background:#f5f3ff;padding:1px 6px;border-radius:8px;">Batch #${del.truck_batch_id}</span>`
        : `<span style="font-size:0.72rem;color:#94a3b8;">No batch</span>`;

      // ── Action buttons ────────────────────────────────────────────────────
      // pending + no batch -> guide admin to Truck Planner
      // pending + has batch -> waiting for dispatch
      // out_for_delivery   -> view only, driver handles it
      // delivered          -> view proof
      let actionHtml = '';
      if (del.status === 'pending' && !del.truck_batch_id) {
        actionHtml += `<button class="action-btn btn-small primary"
          onclick="document.querySelector('[data-target=truck-planner-view]').click()"
          title="Go to Truck Planner to assign this delivery">
          Assign via Planner
        </button>`;
      } else if (del.status === 'pending' && del.truck_batch_id) {
        actionHtml += `<span style="font-size:0.78rem;color:#6d28d9;font-weight:600;">Waiting Waiting dispatch</span>`;
      } else if (del.status === 'out_for_delivery') {
        actionHtml += `<span style="font-size:0.78rem;color:#1e40af;font-weight:600;">Delivery En route</span>`;
      } else if (del.status === 'delivered') {
        actionHtml += del.photoProof
          ? `<button class="action-btn btn-small secondary" onclick="viewProof('${del.delivery_ref}')">Photo Proof</button>`
          : `<span style="font-size:0.78rem;color:#166534;font-weight:600;">Completed</span>`;
      } else if (del.status === 'failed') {
        actionHtml += `<span style="font-size:0.78rem;color:#991b1b;font-weight:600;">Failed</span>`;
      }
      actionHtml += ` <button class="action-btn btn-small" onclick="viewDeliveryItems('${del.delivery_ref}')">Items</button>`;

      html += `
        <tr>
          <td>
            <strong>${del.delivery_ref}</strong><br>
            <small style="color:#94a3b8;">${del.order_id || '--'}</small>
          </td>
          <td>${del.customerName}</td>
          <td>${del.address || '--'}</td>
          <td>${del.contactNumber || '--'}</td>
          <td>${del.plateNumber ? `<strong>${del.plateNumber}</strong>` : '<em style="color:#aaa;">--</em>'}</td>
          <td>
            ${del.deliveryPerson
              ? `<strong>${del.deliveryPerson}</strong>`
              : `<em style="color:#f59e0b;font-size:0.78rem;">Unassigned</em>`}
            <br>${batchInfo}
          </td>
          <td style="text-align:center;">
            <span style="background:#ede9fe;color:#6d28d9;padding:2px 10px;border-radius:20px;font-size:0.78rem;font-weight:700;">
              ${del.delivery_count ?? del.deliveryCount ?? 1}x
            </span>
          </td>
          <td>
            ${del.date_completed || del.dateCompleted
              ? `<span style="font-size:0.78rem;color:#065f46;font-weight:600;">${new Date(del.date_completed || del.dateCompleted).toLocaleString('en-PH',{month:'short',day:'numeric',hour:'2-digit',minute:'2-digit'})}</span>`
              : '<em style="color:#aaa;font-size:0.78rem;">Not yet</em>'}
          </td>
          <td>${statusBadge}</td>
          <td>${actionHtml}</td>
        </tr>
      `;
    });

    deliveriesTableBody.innerHTML = html;
    
    // Update delivery stats if elements exist
    const setDeliveryStat = (id, value) => {
      const el = document.getElementById(id);
      if (el) el.innerText = value;
    };
    
    setDeliveryStat("stat-del-total", total);
    setDeliveryStat("stat-del-pending", pending);
    setDeliveryStat("stat-del-out", out);
    setDeliveryStat("stat-del-done", done);
  }

  window.viewProof = async function(ref) {
    const response = await DeliveriesAPI.getAllDeliveries();
    if (!response.success) return;
    const del = response.data.find(d => d.delivery_ref === ref);
    if (del && del.photoProof) {
      document.getElementById('proof-modal-img').src = del.photoProof;
      document.getElementById('proof-modal-notes').innerText = del.driverRemarks || 'No remarks provided.';
      document.getElementById('proof-modal').classList.add('active');
    }
  };
});

// ─── RETURNS MANAGEMENT (Admin) ───────────────────────────────────────────────
window.loadAdminReturns = async function () {
  const tbody = document.getElementById('admin-returns-table-body');
  if (!tbody) return;
  try {
    const res = await fetch('/api/returns', { credentials: 'include' });
    const json = await res.json();
    if (!json.success) { tbody.innerHTML = '<tr><td colspan="9" style="text-align:center;">Failed to load.</td></tr>'; return; }

    const returns = json.data;
    let total = returns.length, pending = 0, approved = 0, rejected = 0;

    if (returns.length === 0) {
      tbody.innerHTML = '<tr><td colspan="9" style="text-align:center; padding:20px; color:#94a3b8;">No return requests yet.</td></tr>';
    } else {
      tbody.innerHTML = returns.map(r => {
        if (r.status === 'pending') pending++;
        else if (r.status === 'approved') approved++;
        else if (r.status === 'rejected') rejected++;

        const items = r.items.map(i => `${i.qty}x ${i.name}`).join(', ');
        const statusColor = { pending: '#f59e0b', approved: '#10b981', rejected: '#ef4444' }[r.status] || '#64748b';
        const actionHtml = r.status === 'pending'
          ? `<button class="action-btn primary btn-small" onclick="adminOpenReturnReview('${r.id}')">Review</button>`
          : `<span style="color:#94a3b8; font-size:0.8rem;">${r.status === 'approved' ? 'Approved' : 'Rejected'}</span>`;

        return `
          <tr>
            <td><strong>${r.id}</strong></td>
            <td>${r.original_txn_ref || '--'}</td>
            <td>${r.customer_name || 'N/A'}</td>
            <td style="font-size:0.8rem; max-width:160px;">${items}</td>
            <td style="font-weight:600;">₱${parseFloat(r.refund_amount || 0).toLocaleString()}</td>
            <td><span style="font-weight:600; color:${statusColor}; text-transform:capitalize;">${r.status}</span>${r.stock_restored ? '<br><small style="color:#10b981; font-size:0.7rem;">Stock Restored</small>' : ''}</td>
            <td>${r.handled_by || '--'}</td>
            <td style="font-size:0.8rem;">${r.created_at ? new Date(r.created_at).toLocaleDateString() : '--'}</td>
            <td>${actionHtml}</td>
          </tr>`;
      }).join('');

      // Update summary counters
      pending = returns.filter(r => r.status === 'pending').length;
      approved = returns.filter(r => r.status === 'approved').length;
      rejected = returns.filter(r => r.status === 'rejected').length;
    }

    const setEl = (id, val) => { const el = document.getElementById(id); if (el) el.innerText = val; };
    setEl('stat-ret-total', total);
    setEl('stat-ret-pending', pending);
    setEl('stat-ret-approved', approved);
    setEl('stat-ret-rejected', rejected);
  } catch (err) {
    console.error('Failed to load returns', err);
  }
};

window.adminOpenReturnReview = async function (returnRef) {
  const res = await fetch('/api/returns', { credentials: 'include' });
  const json = await res.json();
  if (!json.success) return;
  const ret = json.data.find(r => String(r.id) === String(returnRef));
  if (!ret) return;

  document.getElementById('admin-return-ref').value = ret.return_ref; // use return_ref not id
  document.getElementById('admin-return-notes').value = '';

  const itemRows = ret.items.map(i =>
    `<tr>
      <td style="padding:4px 8px;">${i.name}</td>
      <td style="padding:4px 8px; text-align:center;">${i.qty}</td>
      <td style="padding:4px 8px; text-align:right;">₱${parseFloat(i.price || 0).toFixed(2)}</td>
    </tr>`
  ).join('');

  document.getElementById('admin-return-review-details').innerHTML = `
    <p><strong>Return ID:</strong> ${ret.id}</p>
    <p><strong>Order Ref:</strong> ${ret.original_txn_ref || '--'}</p>
    <p><strong>Customer:</strong> ${ret.customer_name || 'N/A'}</p>
    <p><strong>Reason:</strong> ${ret.reason}</p>
    <p><strong>Submitted by:</strong> ${ret.handled_by || '--'} &nbsp;|&nbsp; <strong>Date:</strong> ${ret.created_at ? new Date(ret.created_at).toLocaleString() : '--'}</p>
    <table style="width:100%; border-collapse:collapse; margin-top:10px; font-size:0.875rem;">
      <thead style="background:#e2e8f0;">
        <tr>
          <th style="padding:4px 8px; text-align:left;">Item</th>
          <th style="padding:4px 8px;">Qty</th>
          <th style="padding:4px 8px; text-align:right;">Unit Price</th>
        </tr>
      </thead>
      <tbody>${itemRows}</tbody>
    </table>
    <p style="margin-top:10px; font-weight:700; color:#0f172a; font-size:1rem;">
      Estimated Refund: ₱${parseFloat(ret.refundAmount).toLocaleString()}
    </p>`;

  document.getElementById('admin-return-review-modal').classList.add('active');
};

document.getElementById('admin-approve-return-btn')?.addEventListener('click', async () => {
  const returnRef = document.getElementById('admin-return-ref').value;
  const notes = document.getElementById('admin-return-notes').value.trim();
  if (!confirm(`Approve return ${returnRef} and restore inventory stock?`)) return;

  const res = await fetch(`/api/returns/${returnRef}/approve`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({ approvedBy: 'Admin', approverRole: 'admin', notes })
  });
  const json = await res.json();
  if (json.success) {
    alert(`Return ${returnRef} approved. Stock has been restored.`);
    document.getElementById('admin-return-review-modal').classList.remove('active');
    loadAdminReturns();
    updateAdminNotifBell(products); // refresh bell
  } else {
    alert(json.message || 'Failed to approve return.');
  }
});

document.getElementById('admin-reject-return-btn')?.addEventListener('click', async () => {
  const returnRef = document.getElementById('admin-return-ref').value;
  const notes = document.getElementById('admin-return-notes').value.trim();
  if (!notes) { alert('Please add a rejection reason in the Notes field.'); return; }
  if (!confirm(`Reject return ${returnRef}? No stock changes will be made.`)) return;

  const res = await fetch(`/api/returns/${returnRef}/reject`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({ rejectedBy: 'Admin', rejectorRole: 'admin', notes })
  });
  const json = await res.json();
  if (json.success) {
    alert(`Return ${returnRef} rejected.`);
    document.getElementById('admin-return-review-modal').classList.remove('active');
    loadAdminReturns();
    updateAdminNotifBell(products); // refresh bell
  } else {
    alert(json.message || 'Failed to reject return.');
  }
});

document.getElementById('close-admin-return-modal')?.addEventListener('click', () =>
  document.getElementById('admin-return-review-modal').classList.remove('active'));
document.getElementById('cancel-admin-return')?.addEventListener('click', () =>
  document.getElementById('admin-return-review-modal').classList.remove('active'));

// ─── ACTIVITY LOGS (Admin) ────────────────────────────────────────────────────
const ACTION_LABELS = {
  complete_sale: 'Complete Sale',
  create_return: 'Create Return',
  approve_return: 'Approve Return',
  reject_return: 'Reject Return',
  restock: 'Restock',
  add_product: 'Add Product',
  edit_product: 'Edit Product',
  delete_product: 'Delete Product',
  update_order_status: 'Order Status',
};

window.loadLogs = async function () {
  const tbody = document.getElementById('logs-table-body');
  if (!tbody) return;

  const actor = document.getElementById('log-filter-actor')?.value.trim() || '';
  const role  = document.getElementById('log-filter-role')?.value || '';
  const action = document.getElementById('log-filter-action')?.value || '';

  const params = new URLSearchParams({ limit: 200 });
  if (actor)  params.set('actor', actor);
  if (role)   params.set('role', role);
  if (action) params.set('action', action);

  try {
    const res = await fetch(`/api/logs/index.php?${params.toString()}`);
    const json = await res.json();
    if (!json.success) { tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;">Failed to load logs.</td></tr>'; return; }

    if (json.data.length === 0) {
      tbody.innerHTML = '<tr><td colspan="7" style="text-align:center; padding:20px; color:#94a3b8;">No activity recorded yet.</td></tr>';
      return;
    }

    const roleColors = { admin: '#8b5cf6', staff: '#3b82f6', cashier: '#10b981', driver: '#f59e0b' };

    tbody.innerHTML = json.data.map((log, i) => {
      const roleColor = roleColors[log.actor_role] || '#64748b';
      const actionLabel = ACTION_LABELS[log.action] || log.action;
      const dt = new Date(log.created_at);
      const dateStr = dt.toLocaleDateString();
      const timeStr = dt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      return `
        <tr>
          <td style="color:#94a3b8; font-size:0.8rem;">${log.id}</td>
          <td>
            <div style="font-weight:600;">${dateStr}</div>
            <div style="color:#94a3b8; font-size:0.8rem;">${timeStr}</div>
          </td>
          <td><strong>${log.actor_name}</strong></td>
          <td><span style="background:${roleColor}22; color:${roleColor}; padding:2px 8px; border-radius:20px; font-size:0.8rem; font-weight:600; text-transform:capitalize;">${log.actor_role}</span></td>
          <td style="font-size:0.85rem;">${actionLabel}</td>
          <td style="font-size:0.8rem; color:#475569;">${log.target_type ? `${log.target_type}: ${log.target_id}` : '--'}</td>
          <td style="font-size:0.8rem; color:#475569; max-width:240px; word-wrap:break-word;">${log.details}</td>
        </tr>`;
    }).join('');
  } catch (err) {
    console.error('Failed to load logs', err);
  }
};

// Auto-load returns, cancellations, and logs when their nav items are clicked
document.querySelectorAll('.nav-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    const target = btn.getAttribute('data-target');
    if (target === 'returns-view') { loadAdminReturns(); loadAdminCancellations(); }
    if (target === 'logs-view') loadLogs();
  });
});

// Sub-tab switcher for Returns & Cancellations
window.switchReturnSubtab = function(tab) {
  const returnsEl       = document.getElementById('subtab-returns');
  const cancelsEl       = document.getElementById('subtab-cancellations');
  const returnsBtn      = document.getElementById('subtab-returns-btn');
  const cancelsBtn      = document.getElementById('subtab-cancellations-btn');
  const activeColor     = '#f97316';
  const inactiveColor   = '#94a3b8';
  const activeBorder    = '3px solid #f97316';
  const inactiveBorder  = '3px solid transparent';

  if (tab === 'returns') {
    returnsEl.style.display       = '';
    cancelsEl.style.display       = 'none';
    returnsBtn.style.color        = activeColor;
    returnsBtn.style.borderBottom = activeBorder;
    cancelsBtn.style.color        = inactiveColor;
    cancelsBtn.style.borderBottom = inactiveBorder;
  } else {
    returnsEl.style.display       = 'none';
    cancelsEl.style.display       = '';
    cancelsBtn.style.color        = activeColor;
    cancelsBtn.style.borderBottom = activeBorder;
    returnsBtn.style.color        = inactiveColor;
    returnsBtn.style.borderBottom = inactiveBorder;
  }
};

// ─── CANCELLATIONS MANAGEMENT (Admin) ────────────────────────────────────────
const setEl = (id, val) => { const el = document.getElementById(id); if (el) el.innerText = val; };

window.loadAdminCancellations = async function () {
  const tbody = document.getElementById('admin-cancellations-table-body');
  if (!tbody) return;
  try {
    const res  = await fetch('/api/orders/cancellations', { credentials: 'include' });
    const json = await res.json();
    if (!json.success) {
      tbody.innerHTML = '<tr><td colspan="8" style="text-align:center;">Failed to load.</td></tr>';
      return;
    }

    const cancellations = json.data;
    const total    = cancellations.length;
    const pending  = cancellations.filter(c => c.status === 'pending').length;
    const approved = cancellations.filter(c => c.status === 'approved').length;
    const rejected = cancellations.filter(c => c.status === 'rejected').length;

    setEl('stat-cancel-total',    total);
    setEl('stat-cancel-pending',  pending);
    setEl('stat-cancel-approved', approved);
    setEl('stat-cancel-rejected', rejected);

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
      const badge = `<span style="background:${sc.bg};color:${sc.color};padding:2px 10px;border-radius:12px;font-size:0.8rem;font-weight:600;">${c.status.charAt(0).toUpperCase()+c.status.slice(1)}</span>`;
      const date  = c.created_at ? c.created_at.substring(0, 10) : '--';
      const actionBtn = c.status === 'pending'
        ? `<button class="action-btn primary" style="font-size:0.8rem;padding:5px 12px;" onclick="adminOpenCancelReview('${c.cancel_ref}')">Review</button>`
        : `<span style="color:#94a3b8;font-size:0.85rem;">Reviewed</span>`;
      return `<tr>
        <td><strong>${c.cancel_ref}</strong></td>
        <td>${c.order_ref}</td>
        <td>${c.customer_name}</td>
        <td>${c.cancel_reason || '--'}</td>
        <td>₱${Number(c.total_amount).toLocaleString('en-PH', {minimumFractionDigits:2})}</td>
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

window.adminOpenCancelReview = async function (cancelRef) {
  const res  = await fetch('/api/orders/cancellations', { credentials: 'include' });
  const json = await res.json();
  if (!json.success) return;

  const record = json.data.find(c => c.cancel_ref === cancelRef);
  if (!record) return;

  const details = document.getElementById('admin-cancel-review-details');
  const itemsList = (record.items || []).map(i =>
    `<li>${i.name} × ${i.qty} -- ₱${Number(i.price).toLocaleString('en-PH', {minimumFractionDigits:2})}</li>`
  ).join('');

  details.innerHTML = `
    <p><strong>Cancel Ref:</strong> ${record.cancel_ref}</p>
    <p><strong>Order Ref:</strong> ${record.order_ref}</p>
    <p><strong>Customer:</strong> ${record.customer_name}</p>
    <p><strong>Reason:</strong> ${record.cancel_reason || '--'}</p>
    ${record.cancel_notes ? `<p><strong>Notes:</strong> ${record.cancel_notes}</p>` : ''}
    <p><strong>Total:</strong> ₱${Number(record.total_amount).toLocaleString('en-PH', {minimumFractionDigits:2})}</p>
    <p><strong>Items:</strong></p><ul style="margin:4px 0 0 16px;">${itemsList}</ul>
    <p style="margin-top:8px;"><strong>Date:</strong> ${record.created_at ? record.created_at.substring(0,10) : '--'}</p>
  `;

  document.getElementById('admin-cancel-ref').value = cancelRef;
  document.getElementById('admin-cancel-notes').value = '';
  document.getElementById('admin-cancel-review-modal').classList.add('active');
};

// Close modal
document.getElementById('close-admin-cancel-modal')?.addEventListener('click', () => {
  document.getElementById('admin-cancel-review-modal').classList.remove('active');
});
document.getElementById('close-admin-cancel-btn')?.addEventListener('click', () => {
  document.getElementById('admin-cancel-review-modal').classList.remove('active');
});

// Approve cancellation
document.getElementById('admin-approve-cancel-btn')?.addEventListener('click', async () => {
  const ref   = document.getElementById('admin-cancel-ref').value;
  const notes = document.getElementById('admin-cancel-notes').value;
  if (!confirm(`Approve cancellation ${ref}? The order will be marked as cancelled.`)) return;

  const res  = await fetch(`/api/orders/cancellations/${ref}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'approve', review_notes: notes }),
  });
  const json = await res.json();
  if (json.success) {
    alert(`Cancellation ${ref} approved.`);
    document.getElementById('admin-cancel-review-modal').classList.remove('active');
    loadAdminCancellations();
    updateAdminNotifBell(products); // refresh bell
  } else {
    alert(json.message || 'Failed to approve cancellation.');
  }
});

// Reject cancellation
document.getElementById('admin-reject-cancel-btn')?.addEventListener('click', async () => {
  const ref   = document.getElementById('admin-cancel-ref').value;
  const notes = document.getElementById('admin-cancel-notes').value;
  if (!confirm(`Reject cancellation ${ref}? The order will be restored to pending.`)) return;

  const res  = await fetch(`/api/orders/cancellations/${ref}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'reject', review_notes: notes }),
  });
  const json = await res.json();
  if (json.success) {
    alert(`Cancellation ${ref} rejected. Order restored to pending.`);
    document.getElementById('admin-cancel-review-modal').classList.remove('active');
    loadAdminCancellations();
    updateAdminNotifBell(products); // refresh bell
  } else {
    alert(json.message || 'Failed to reject cancellation.');
  }
});

// ─── BULK ORDERS (Admin) ──────────────────────────────────────────────────────

// Initial load on page load
loadAdminReturns();
loadAdminCancellations();
loadLogs();

let currentBulkFilter = 'all';

const statusColors = {
  pending:    { color: '#92400e', bg: '#fef3c7' },
  quoted:     { color: '#1e40af', bg: '#dbeafe' },
  confirmed:  { color: '#065f46', bg: '#d1fae5' },
  processing: { color: '#6b21a8', bg: '#f3e8ff' },
  delivered:  { color: '#0e7490', bg: '#cffafe' },
  completed:  { color: '#14532d', bg: '#bbf7d0' },
  cancelled:  { color: '#991b1b', bg: '#fee2e2' },
};

const nextActions = {
  pending:    { label: 'Send Quote',      action: 'quote'    },
  quoted:     { label: 'Confirm Order',   action: 'confirm'  },
  confirmed:  { label: 'Start Processing',action: 'process'  },
  processing: { label: 'Mark Delivered',  action: 'deliver'  },
  delivered:  { label: 'Mark Completed',  action: 'complete' },
};

window.switchBulkTab = function(tab) {
  currentBulkFilter = tab;
  const tabs = { all: 'bulk-tab-all-btn', online: 'bulk-tab-online-btn', 'walk-in': 'bulk-tab-walkin-btn' };
  Object.entries(tabs).forEach(([key, id]) => {
    const btn = document.getElementById(id);
    if (!btn) return;
    const active = key === tab;
    btn.style.color        = active ? '#f97316' : '#94a3b8';
    btn.style.borderBottom = active ? '3px solid #f97316' : '3px solid transparent';
  });
  loadAdminBulkOrders();
};

window.loadAdminBulkOrders = async function() {
  const tbody = document.getElementById('bulk-orders-table-body');
  if (!tbody) return;
  try {
    const res  = await fetch('/api/bulk-orders');
    const json = await res.json();
    if (!json.success) { tbody.innerHTML = '<tr><td colspan="9" style="text-align:center; color:#ef4444;">Failed to load.</td></tr>'; return; }

    const orders = json.data;
    setEl('stat-bulk-total',     orders.length);
    setEl('stat-bulk-pending',   orders.filter(o => o.status === 'pending').length);
    setEl('stat-bulk-active',    orders.filter(o => ['quoted','confirmed','processing','delivered'].includes(o.status)).length);
    setEl('stat-bulk-completed', orders.filter(o => o.status === 'completed').length);

    if (orders.length === 0) {
      tbody.innerHTML = '<tr><td colspan="9" style="text-align:center; padding:20px; color:#94a3b8;">No bulk orders yet.</td></tr>';
      return;
    }

    tbody.innerHTML = orders.map(o => {
      const sc     = statusColors[o.status] || { color: '#374151', bg: '#f3f4f6' };
      const badge  = `<span style="background:${sc.bg};color:${sc.color};padding:2px 10px;border-radius:12px;font-size:0.78rem;font-weight:700;">${o.status.charAt(0).toUpperCase()+o.status.slice(1)}</span>`;
      const src    = o.order_source === 'walk-in'
        ? '<span style="background:#ede9fe;color:#6d28d9;padding:2px 8px;border-radius:10px;font-size:0.75rem;font-weight:700;">Walk-in</span>'
        : '<span style="background:#dbeafe;color:#1e40af;padding:2px 8px;border-radius:10px;font-size:0.75rem;font-weight:700;">Online</span>';
      const quoted = o.quoted_amount > 0 ? `₱${Number(o.quoted_amount).toLocaleString('en-PH',{minimumFractionDigits:2})}` : '--';
      const date   = o.created_at ? o.created_at.substring(0,10) : '--';
      return `<tr>
        <td><strong>${o.bulk_ref}</strong></td>
        <td>${src}</td>
        <td>${o.customer_name}</td>
        <td>${o.contact_number}</td>
        <td>${o.project_type || '--'}</td>
        <td>${quoted}</td>
        <td>${date}</td>
        <td>${badge}</td>
        <td><button class="action-btn primary" style="font-size:0.78rem;padding:5px 12px;" onclick="openBulkReview('${o.bulk_ref}')">View</button></td>
      </tr>`;
    }).join('');
  } catch(err) {
    console.error('Failed to load bulk orders', err);
  }
};

window.openBulkReview = async function(ref) {
  const res  = await fetch('/api/bulk-orders', { credentials: 'include' });
  const json = await res.json();
  if (!json.success) return;
  const o = json.data.find(b => b.bulk_ref === ref);
  if (!o) return;

  const itemsList = (o.items || []).map(i =>
    `<li>${i.description || (i.name ? `${i.name} × ${i.qty}` : JSON.stringify(i))}</li>`
  ).join('');

  document.getElementById('bulk-review-details').innerHTML = `
    <p><strong>Ref:</strong> ${o.bulk_ref} &nbsp;|&nbsp; <strong>Source:</strong> ${o.order_source}</p>
    <p><strong>Customer:</strong> ${o.customer_name} &nbsp;|&nbsp; <strong>Contact:</strong> ${o.contact_number}</p>
    ${o.email ? `<p><strong>Email:</strong> ${o.email}</p>` : ''}
    <p><strong>Address:</strong> ${o.address}</p>
    ${o.project_type ? `<p><strong>Project:</strong> ${o.project_type}</p>` : ''}
    ${o.preferred_date ? `<p><strong>Preferred Date:</strong> ${o.preferred_date}</p>` : ''}
    <p><strong>Status:</strong> ${o.status}</p>
    ${o.quoted_amount > 0 ? `<p><strong>Quoted Amount:</strong> ₱${Number(o.quoted_amount).toLocaleString('en-PH',{minimumFractionDigits:2})}</p>` : ''}
    ${o.final_amount > 0 ? `<p><strong>Final Amount:</strong> ₱${Number(o.final_amount).toLocaleString('en-PH',{minimumFractionDigits:2})}</p>` : ''}
    ${o.discount_type ? `<p style="color:#dc2626;"><strong>Discount Applied:</strong> ${o.discount_type === 'promo' ? 'Promo Promo (5%)' : 'Bulk Bulk Order (10%)'} -- ₱${Number(o.discount_amount||0).toLocaleString('en-PH',{minimumFractionDigits:2})}</p>` : ''}
    ${o.quotation_notes ? `<p><strong>Quote Notes:</strong> ${o.quotation_notes}</p>` : ''}
    <p style="margin-top:8px;"><strong>Materials:</strong></p>
    <ul style="margin:4px 0 0 16px;">${itemsList || '<li>--</li>'}</ul>
    ${o.notes ? `<p style="margin-top:8px;"><strong>Notes:</strong> ${o.notes}</p>` : ''}
  `;

  document.getElementById('bulk-review-ref').value    = ref;
  document.getElementById('bulk-review-status').value = o.status;

  // Show/hide quote fields
  const quoteFields  = document.getElementById('bulk-quote-fields');
  const cancelFields = document.getElementById('bulk-cancel-fields');
  const nextBtn      = document.getElementById('bulk-next-status-btn');
  const cancelBtn    = document.getElementById('bulk-cancel-btn');

  quoteFields.style.display  = o.status === 'pending' ? 'block' : 'none';
  cancelFields.style.display = 'none';

  const next = nextActions[o.status];
  if (next) {
    nextBtn.style.display = 'inline-block';
    nextBtn.textContent   = next.label + ' ->';
  } else {
    nextBtn.style.display = 'none';
  }

  const cancellable = ['pending','quoted','confirmed','processing'].includes(o.status);
  cancelBtn.style.display = cancellable ? 'inline-block' : 'none';

  document.getElementById('bulk-review-modal').classList.add('active');
};

// Close modals
document.getElementById('close-bulk-review-modal')?.addEventListener('click', () => {
  document.getElementById('bulk-review-modal').classList.remove('active');
});
document.getElementById('close-bulk-review-btn')?.addEventListener('click', () => {
  document.getElementById('bulk-review-modal').classList.remove('active');
});

// Print PO for bulk order
document.getElementById('bulk-print-po-btn')?.addEventListener('click', async () => {
  const ref = document.getElementById('bulk-review-ref').value;
  if (!ref) return;
  const res  = await fetch('/api/bulk-orders', { credentials: 'include' });
  const json = await res.json();
  if (!json.success) return;
  const o = json.data.find(b => b.bulk_ref === ref);
  if (!o) return;
  printBulkPurchaseOrder(o);
});

window.printBulkPurchaseOrder = function(o) {
  const items = Array.isArray(o.items) ? o.items : [];
  const quotedAmt  = parseFloat(o.quoted_amount || 0);
  const finalAmt   = parseFloat(o.final_amount  || quotedAmt);
  const discAmt    = parseFloat(o.discount_amount || 0);
  const discType   = o.discount_type
    ? (o.discount_type === 'promo' ? 'Promo Discount (5%)' : 'Bulk Order Discount (10%)')
    : null;

  const itemRows = items.map((item, i) => `
    <tr>
      <td style="padding:8px 12px;border-bottom:1px solid #e2e8f0;">${i + 1}</td>
      <td style="padding:8px 12px;border-bottom:1px solid #e2e8f0;">${item.description || item.name || JSON.stringify(item)}</td>
      <td style="padding:8px 12px;border-bottom:1px solid #e2e8f0;text-align:center;">${item.qty || '--'}</td>
      <td style="padding:8px 12px;border-bottom:1px solid #e2e8f0;text-align:right;">${item.unit_price ? '₱' + parseFloat(item.unit_price).toFixed(2) : '--'}</td>
      <td style="padding:8px 12px;border-bottom:1px solid #e2e8f0;text-align:right;">${item.amount ? '₱' + parseFloat(item.amount).toFixed(2) : '--'}</td>
    </tr>`).join('');

  const poNumber  = `BLK-PO-${o.bulk_ref}`;
  const printDate = new Date().toLocaleDateString('en-PH', { year:'numeric', month:'long', day:'numeric' });

  const w = window.open('', '_blank', 'width=800,height=700');
  w.document.write(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>Purchase Order - ${poNumber}</title>
  <style>
    * { margin:0; padding:0; box-sizing:border-box; }
    body { font-family:'Helvetica Neue',Arial,sans-serif; color:#1e293b; background:white; padding:40px; }
    .po-header { display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:32px; border-bottom:3px solid #f97316; padding-bottom:20px; }
    .brand-name { font-size:1.6rem; font-weight:800; color:#f97316; }
    .brand-sub  { font-size:0.85rem; color:#64748b; margin-top:4px; }
    .po-title   { text-align:right; }
    .po-title h1 { font-size:1.4rem; font-weight:700; color:#1e293b; }
    .po-title p  { font-size:0.85rem; color:#64748b; margin-top:4px; }
    .po-meta { display:grid; grid-template-columns:1fr 1fr; gap:24px; margin-bottom:28px; }
    .po-meta-box { background:#f8fafc; border-radius:8px; padding:14px 18px; }
    .po-meta-box h3 { font-size:0.75rem; text-transform:uppercase; letter-spacing:0.05em; color:#94a3b8; margin-bottom:8px; }
    .po-meta-box p  { font-size:0.9rem; margin-bottom:4px; }
    table { width:100%; border-collapse:collapse; margin-bottom:20px; }
    thead tr { background:#f97316; color:white; }
    thead th { padding:10px 12px; text-align:left; font-size:0.82rem; font-weight:700; text-transform:uppercase; }
    .totals-section { display:flex; justify-content:flex-end; }
    .totals-box { min-width:280px; }
    .total-row { display:flex; justify-content:space-between; padding:6px 0; font-size:0.9rem; border-bottom:1px solid #f1f5f9; }
    .total-row.grand { font-size:1.05rem; font-weight:700; border-bottom:none; padding-top:10px; color:#f97316; }
    .discount-row { color:#dc2626; }
    .sig-block { display:flex; justify-content:space-between; margin-top:40px; }
    .sig-line { margin-top:50px; border-top:1px solid #334155; width:200px; font-size:0.78rem; color:#475569; padding-top:4px; }
    .po-footer { margin-top:40px; border-top:1px solid #e2e8f0; padding-top:16px; display:flex; justify-content:space-between; font-size:0.78rem; color:#94a3b8; }
    @media print { body { padding:20px; } .no-print { display:none; } }
  </style>
</head>
<body>
  <div class="po-header">
    <div>
      <div class="brand-name">JMC Materials</div>
      <div class="brand-sub">Hardware & Construction Supplies</div>
      <div class="brand-sub" style="margin-top:2px;">San Pedro, Laguna, Philippines</div>
    </div>
    <div class="po-title">
      <h1>BULK PURCHASE ORDER</h1>
      <p>${poNumber}</p>
      <p>Date: ${printDate}</p>
    </div>
  </div>

  <div class="po-meta">
    <div class="po-meta-box">
      <h3>Bill To / Customer</h3>
      <p><strong>${o.customer_name}</strong></p>
      <p>Tel: ${o.contact_number}</p>
      ${o.email ? `<p>Email: ${o.email}</p>` : ''}
      <p>Addr: ${o.address}</p>
    </div>
    <div class="po-meta-box">
      <h3>Order Details</h3>
      <p><strong>Bulk Ref:</strong> ${o.bulk_ref}</p>
      <p><strong>Source:</strong> ${o.order_source}</p>
      ${o.project_type ? `<p><strong>Project:</strong> ${o.project_type}</p>` : ''}
      ${o.preferred_date ? `<p><strong>Preferred:</strong> ${o.preferred_date}</p>` : ''}
      <p><strong>Status:</strong> ${(o.status||'').charAt(0).toUpperCase()+(o.status||'').slice(1)}</p>
    </div>
  </div>

  <table>
    <thead>
      <tr>
        <th>#</th>
        <th>Material / Description</th>
        <th style="text-align:center;">Qty</th>
        <th style="text-align:right;">Unit Price</th>
        <th style="text-align:right;">Amount</th>
      </tr>
    </thead>
    <tbody>
      ${itemRows || `<tr><td colspan="5" style="padding:12px;text-align:center;color:#94a3b8;">Items to be confirmed upon delivery</td></tr>`}
    </tbody>
  </table>

  <div class="totals-section">
    <div class="totals-box">
      ${quotedAmt > 0 ? `<div class="total-row"><span>Quoted Amount</span><span>₱${quotedAmt.toFixed(2)}</span></div>` : ''}
      ${discType ? `<div class="total-row discount-row"><span>${discType}</span><span>-- ₱${discAmt.toFixed(2)}</span></div>` : ''}
      <div class="total-row grand">
        <span>TOTAL AMOUNT</span>
        <span>₱${finalAmt.toFixed(2)}</span>
      </div>
    </div>
  </div>

  <div class="sig-block">
    <div><div class="sig-line">Prepared by</div></div>
    <div><div class="sig-line">Approved by</div></div>
    <div><div class="sig-line">Customer Signature</div></div>
  </div>

  <div class="po-footer">
    <span>JMC Materials · jmcmaterials.com</span>
    <span>Generated: ${new Date().toLocaleString('en-PH')}</span>
  </div>

  <div class="no-print" style="margin-top:30px;text-align:center;">
    <button onclick="window.print()" style="padding:12px 32px;background:#f97316;color:white;border:none;border-radius:8px;font-size:1rem;font-weight:700;cursor:pointer;">
      Print Print / Save as PDF
    </button>
    <button onclick="window.close()" style="padding:12px 24px;background:#f1f5f9;color:#475569;border:none;border-radius:8px;font-size:1rem;cursor:pointer;margin-left:12px;">
      Close
    </button>
  </div>
</body>
</html>`);
  w.document.close();
  w.focus();
};

// Next Status button
document.getElementById('bulk-next-status-btn')?.addEventListener('click', async () => {
  const ref    = document.getElementById('bulk-review-ref').value;
  const status = document.getElementById('bulk-review-status').value;
  const next   = nextActions[status];
  if (!next) return;

  const payload = { action: next.action };

  if (next.action === 'quote') {
    const amt = parseFloat(document.getElementById('bulk-quoted-amount').value);
    if (!amt || amt <= 0) { alert('Please enter a quoted amount.'); return; }
    payload.quoted_amount    = amt;
    payload.quotation_notes  = document.getElementById('bulk-quotation-notes').value;
  }

  if (next.action === 'complete') {
    const amt          = parseFloat(document.getElementById('bulk-quoted-amount').value) || 0;
    const discountType = document.getElementById('bulk-discount-type')?.value || '';
    const RATES        = { promo: 0.05, bulk: 0.10 };
    const rate         = RATES[discountType] || 0;
    const discountAmt  = amt * rate;
    payload.final_amount    = amt;
    payload.discount_type   = discountType || null;
    payload.discount_amount = discountAmt;
  }

  const res  = await fetch(`/api/bulk-orders/${ref}`, {
    method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload)
  });
  const json = await res.json();
  if (json.success) {
    document.getElementById('bulk-review-modal').classList.remove('active');
    loadAdminBulkOrders();
  } else {
    alert(json.error || 'Failed to update.');
  }
});

// Cancel Order button
document.getElementById('bulk-cancel-btn')?.addEventListener('click', () => {
  const cancelFields = document.getElementById('bulk-cancel-fields');
  const isVisible    = cancelFields.style.display !== 'none';
  cancelFields.style.display = isVisible ? 'none' : 'block';
  if (!isVisible) document.getElementById('bulk-cancel-reason').focus();
});

document.getElementById('bulk-cancel-reason')?.addEventListener('keydown', async (e) => {
  if (e.key !== 'Enter') return;
  const ref    = document.getElementById('bulk-review-ref').value;
  const reason = document.getElementById('bulk-cancel-reason').value.trim();
  if (!reason) return;
  if (!confirm(`Cancel bulk order ${ref}?`)) return;

  const res  = await fetch(`/api/bulk-orders/${ref}`, {
    method: 'PUT', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'cancel', cancel_reason: reason })
  });
  const json = await res.json();
  if (json.success) {
    document.getElementById('bulk-review-modal').classList.remove('active');
    loadAdminBulkOrders();
  } else {
    alert(json.error || 'Failed to cancel.');
  }
});

// ── Walk-in Modal ──
window.openAddBulkWalkin = function() {
  document.getElementById('wi-name').value    = '';
  document.getElementById('wi-phone').value   = '';
  document.getElementById('wi-email').value   = '';
  document.getElementById('wi-address').value = '';
  document.getElementById('wi-project').value = '';
  document.getElementById('wi-items').value   = '';
  document.getElementById('wi-notes').value   = '';
  document.getElementById('bulk-walkin-modal').classList.add('active');
};

document.getElementById('close-bulk-walkin-modal')?.addEventListener('click', () => {
  document.getElementById('bulk-walkin-modal').classList.remove('active');
});
document.getElementById('close-bulk-walkin-btn')?.addEventListener('click', () => {
  document.getElementById('bulk-walkin-modal').classList.remove('active');
});

document.getElementById('save-bulk-walkin-btn')?.addEventListener('click', async () => {
  const name    = document.getElementById('wi-name').value.trim();
  const phone   = document.getElementById('wi-phone').value.trim();
  const address = document.getElementById('wi-address').value.trim();
  const itemsRaw= document.getElementById('wi-items').value.trim();

  if (!name || !phone || !address || !itemsRaw) {
    alert('Please fill in all required fields.'); return;
  }

  const items = itemsRaw.split('\n')
    .map(l => l.replace(/^[-•]\s*/, '').trim())
    .filter(l => l.length > 0)
    .map(l => ({ description: l }));

  const payload = {
    order_source:   'walk-in',
    customer_name:  name,
    contact_number: phone,
    email:          document.getElementById('wi-email').value.trim(),
    address,
    project_type:   document.getElementById('wi-project').value,
    items,
    notes:          document.getElementById('wi-notes').value.trim(),
  };

  const res  = await fetch('/api/bulk-orders', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload)
  });
  const json = await res.json();
  if (json.success) {
    document.getElementById('bulk-walkin-modal').classList.remove('active');
    alert(`Walk-in bulk order ${json.data.bulk_ref} created.`);
    loadAdminBulkOrders();
  } else {
    alert(json.error || 'Failed to create order.');
  }
});

// Load on nav click
document.querySelectorAll('.nav-btn').forEach(btn => {
  if (btn.getAttribute('data-target') === 'bulk-orders-view') {
    btn.addEventListener('click', loadAdminBulkOrders);
  }
});

// ═══════════════════════════════════════════════════════════════════════════════
// TRUCK LOAD PLANNER (NOW HANDLED BY dispatch-system.js)
// ═══════════════════════════════════════════════════════════════════════════════
// Note: Truck planner functionality constants are loaded from Js/dispatch-system.js
// Constants TRUCK_MAX_ORDERS and TRUCK_MAX_ITEMS are defined there

// ─── API helpers ──────────────────────────────────────────────────────────────
const TruckAPI = {
  async getBatches() {
    const res  = await fetch('/api/deliveries/batch', { credentials: 'include' });
    return res.json();
  },
  async getBatch(id) {
    const res  = await fetch(`/api/deliveries/batch/${id}`, { credentials: 'include' });
    return res.json();
  },
  async createBatch(data) {
    const res  = await fetch('/api/deliveries/batch', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
      credentials: 'include',
    });
    return res.json();
  },
  async updateBatch(id, data) {
    if (!id || id <= 0) return { success: false, error: 'Invalid batch ID' };
    const res  = await fetch(`/api/deliveries/batch/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
      credentials: 'include',
    });
    return res.json();
  },
  async dispatchBatch(id) {
    if (!id || id <= 0) return { success: false, error: 'Invalid batch ID' };
    const res  = await fetch(`/api/deliveries/batch/${id}/dispatch`, {
      method: 'POST',
      credentials: 'include',
    });
    return res.json();
  },
};

// ─── Load the full truck planner view ─────────────────────────────────────────
window.loadTruckPlanner = async function () {
  await Promise.all([renderBatchList(), renderPendingPicker()]);
};

// ─── Left panel: active batches ───────────────────────────────────────────────
async function renderBatchList() {
  const container = document.getElementById('truck-batches-list');
  if (!container) return;

  const res = await TruckAPI.getBatches();
  if (!res.success) {
    container.innerHTML = '<div style="color:#ef4444; text-align:center;">Failed to load batches.</div>';
    return;
  }

  const batches  = res.data || [];
  const open     = batches.filter(b => b.status === 'open');
  const today = new Date();
  today.setHours(0, 0, 0, 0); // Start of today
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1); // Start of tomorrow
  
  const dispToday = batches.filter(b => {
    if (b.status !== 'dispatched' || !b.dispatched_at) return false;
    const dispatchDate = new Date(b.dispatched_at);
    return dispatchDate >= today && dispatchDate < tomorrow;
  });
  
  console.log('Batch stats:', {
    total: batches.length,
    open: open.length,
    dispatched_today: dispToday.length,
    all_dispatched: batches.filter(b => b.status === 'dispatched').length
  });

  // Update stat cards
  const setEl = (id, v) => { const el = document.getElementById(id); if (el) el.innerText = v; };
  setEl('stat-batch-open', open.length);
  setEl('stat-batch-dispatched', dispToday.length);
  let totalQueued = 0;
  open.forEach(b => { totalQueued += b.total_items || 0; });
  setEl('stat-batch-items', totalQueued);

  // Only show open + dispatched batches (hide completed)
  const activeBatches = batches.filter(b => b.status !== 'completed');

  if (activeBatches.length === 0) {
    container.innerHTML = '<div style="text-align:center; color:#94a3b8; padding:24px; border:2px dashed #e2e8f0; border-radius:10px;">No active batches. Click "+ New Truck Batch" to get started.</div>';
    return;
  }

  container.innerHTML = activeBatches.map(b => {
    const isOpen       = b.status === 'open';
    const pct          = Math.min(100, Math.round(((b.delivery_count || 0) / TRUCK_MAX_ORDERS) * 100));
    const barColor     = pct >= 100 ? '#ef4444' : pct >= 80 ? '#f59e0b' : '#10b981';
    const isFull       = (b.delivery_count || 0) >= TRUCK_MAX_ORDERS;
    const statusBadge  = isOpen
      ? '<span style="background:#dbeafe;color:#1e40af;padding:2px 8px;border-radius:12px;font-size:0.72rem;font-weight:700;">OPEN</span>'
      : '<span style="background:#d1fae5;color:#065f46;padding:2px 8px;border-radius:12px;font-size:0.72rem;font-weight:700;">DISPATCHED</span>';

    const dispInfo = b.dispatched_at
      ? `<div style="font-size:0.75rem;color:#64748b;margin-top:2px;">Dispatched: ${new Date(b.dispatched_at).toLocaleString('en-PH',{month:'short',day:'numeric',hour:'2-digit',minute:'2-digit'})}</div>`
      : '';

    return `
      <div style="border:1px solid #e2e8f0; border-radius:10px; padding:14px; background:#fff; cursor:pointer;"
           onclick="openBatchDetail(${b.id})">
        <div style="display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:8px;">
          <div>
            <div style="font-weight:700; color:#0f172a; font-size:0.95rem;">${b.batch_ref}</div>
            <div style="font-size:0.82rem; color:#475569; margin-top:1px;">
              Truck ${b.plate_number || '<em>No plate</em>'}
              ${b.driver_name ? ` &nbsp;·&nbsp; Customer: ${b.driver_name}` : ''}
            </div>
            ${dispInfo}
          </div>
          ${statusBadge}
        </div>
        <!-- Capacity bar -->
        <div style="background:#e5e7eb; border-radius:999px; height:8px; overflow:hidden; margin-bottom:4px;">
          <div style="height:100%; background:${barColor}; border-radius:999px; width:${pct}%; transition:width .4s;"></div>
        </div>
        <div style="display:flex; justify-content:space-between; font-size:0.75rem; color:#94a3b8;">
          <span>${b.delivery_count} order${b.delivery_count !== 1 ? 's' : ''} · ${b.delivery_count || 0} / ${TRUCK_MAX_ORDERS} bulk orders${isFull ? ' · Full' : ''}</span>
          <span style="font-weight:${pct >= 100 ? '700' : 'normal'}; color:${pct >= 100 ? '#ef4444' : '#94a3b8'}">${pct}% ${pct >= 100 ? 'FULL' : 'full'}</span>
        </div>
        ${isOpen ? `<button class="action-btn primary" style="margin-top:10px; width:100%; font-size:0.82rem; padding:7px 0; background:#059669;"
          onclick="event.stopPropagation(); quickDispatch(${b.id})">
          Dispatch Now
        </button>` : ''}
      </div>`;
  }).join('');
}

// ─── Right panel: pending deliveries not yet in a batch ───────────────────────
async function renderPendingPicker() {
  const container = document.getElementById('pending-deliveries-picker');
  if (!container) return;

  const [delivRes, batchRes] = await Promise.all([
    DeliveriesAPI.getAllDeliveries(),
    TruckAPI.getBatches(),
  ]);

  if (!delivRes.success) {
    container.innerHTML = '<div style="color:#ef4444;">Failed to load deliveries.</div>';
    return;
  }

  // Collect delivery refs already inside a batch (open batches only)
  const batchedRefs = new Set();
  (batchRes.data || []).forEach(b => {
    if (b.status === 'open') {
      (b.deliveries || []).forEach(d => batchedRefs.add(d.delivery_ref));
    }
  });

  const pending = (delivRes.data || []).filter(d =>
    d.status === 'pending' &&
    !batchedRefs.has(d.delivery_ref) &&
    d.order_id && String(d.order_id).startsWith('BLK-')
  );

  // Update unassigned stat
  const el = document.getElementById('stat-batch-unassigned');
  if (el) el.innerText = pending.length;

  if (pending.length === 0) {
    container.innerHTML = '<div style="text-align:center; color:#94a3b8; padding:24px; border:2px dashed #e2e8f0; border-radius:10px;">No pending bulk order deliveries.</div>';
    return;
  }

  const openBatches = (batchRes.data || []).filter(b => b.status === 'open');
  const batchOptions = openBatches.length === 0
    ? '<option value="">-- No open batches --</option>'
    : openBatches.map(b => {
        const remainingOrders = TRUCK_MAX_ORDERS - (b.delivery_count || 0);
        const remainingItems  = TRUCK_MAX_ITEMS  - (b.total_items   || 0);
        const isFull = remainingOrders <= 0 && remainingItems <= 0;
        const label  = isFull
          ? 'FULL'
          : `${remainingOrders} order slots · ${remainingItems} item slots left`;
        return `<option value="${b.id}" ${isFull ? 'disabled' : ''}>${b.batch_ref} (${b.plate_number || 'no plate'}) — ${label}</option>`;
      }).join('');

  container.innerHTML = pending.map(d => {
    const itemSummary = (d.items || []).slice(0, 2).map(i => `${i.qty || i.quantity || 1}× ${i.name || i.description || 'Item'}`).join(', ')
      + ((d.items || []).length > 2 ? ` +${d.items.length - 2} more` : '');

    return `
      <div style="border:1px solid #e2e8f0; border-radius:8px; padding:12px; background:#fff;">
        <div style="display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:6px;">
          <div>
            <strong style="font-size:0.9rem;">${d.delivery_ref}</strong>
            <span style="background:#fef3c7;color:#92400e;padding:1px 6px;border-radius:8px;font-size:0.7rem;margin-left:6px;font-weight:700;">Bulk · ${d.order_id}</span>
            <div style="font-size:0.8rem; color:#64748b; margin-top:2px;">${d.customerName} · ${d.address || '--'}</div>
            <div style="font-size:0.75rem; color:#94a3b8; margin-top:2px;">${itemSummary}</div>
          </div>
        </div>
        <div style="display:flex; gap:6px;">
          <select class="picker-batch-select" data-ref="${d.delivery_ref}"
            style="flex:1; padding:7px 10px; border:1px solid #e2e8f0; border-radius:6px; font-size:0.82rem; background:#fff;">
            <option value="">-- Select batch --</option>
            ${batchOptions}
          </select>
          <button class="action-btn primary"
            style="font-size:0.82rem; padding:7px 12px;"
            onclick="addDeliveryFromPicker('${d.delivery_ref}', this)">
            Add →
          </button>
        </div>
      </div>`;
  }).join('');
}

// ─── Quick dispatch from batch card ───────────────────────────────────────────
window.quickDispatch = async function (batchId) {
  if (!confirm('Dispatch this truck now? All queued deliveries will be marked Out for Delivery.')) return;
  const res = await TruckAPI.dispatchBatch(batchId);
  if (res.success) {
    alert(`Truck dispatched! ${res.data.delivery_count} deliveries are now Out for Delivery.`);
    loadTruckPlanner();
    renderDeliveries(); // refresh the Deliveries tab too
  } else {
    alert(res.error || 'Failed to dispatch.');
  }
};

// ─── Add delivery from picker dropdown ────────────────────────────────────────
window.addDeliveryFromPicker = async function (delivRef, btn) {
  const row     = btn.closest('div[style]');
  const select  = row.querySelector('.picker-batch-select');
  const batchId = select?.value;
  if (!batchId) { alert('Please select a batch first.'); return; }

  btn.disabled    = true;
  btn.textContent = '…';

  const res = await TruckAPI.updateBatch(Number(batchId), { addDeliveryRef: delivRef });

  if (res.success) {
    if (res.data?.split) {
      alert(`Delivery split!\n\n• ${res.data.items_in_batch} items → loaded on this truck\n• ${res.data.items_remainder} items → new delivery ${res.data.remainder_ref} (pending for next truck)`);
    }
    loadTruckPlanner();
    return;
  }

  // needsSplit — truck can't fit all items, ask admin to confirm split
  if (res.needsSplit) {
    btn.disabled    = false;
    btn.textContent = 'Add →';
    const confirmed = confirm(
      `This bulk order has ${res.items_total} items but only ${res.slots_available} slot(s) are left in the truck.\n\n` +
      `Split it?\n• ${res.slots_available} items → load now on this truck\n• ${res.items_remainder} items → stay as a new pending delivery for the next truck\n\nClick OK to split, Cancel to skip.`
    );
    if (!confirmed) return;

    btn.disabled    = true;
    btn.textContent = '…';
    const splitRes = await TruckAPI.updateBatch(Number(batchId), { addDeliveryRef: delivRef, splitMode: true });
    if (splitRes.success) {
      const d = splitRes.data;
      alert(`Delivery split complete!\n• ${d.items_in_batch} items loaded onto this truck\n• ${d.items_remainder} items saved as new delivery ${d.remainder_ref}`);
      loadTruckPlanner();
    } else {
      alert(splitRes.error || 'Failed to split delivery.');
    }
    btn.disabled    = false;
    btn.textContent = 'Add →';
    return;
  }

  btn.disabled    = false;
  btn.textContent = 'Add →';
  alert(res.error || 'Failed to add bulk order to batch.');
};

// ─── Open batch detail modal ──────────────────────────────────────────────────
window.openBatchDetail = async function (batchId) {
  const safeId = parseInt(batchId, 10);
  if (!safeId || safeId <= 0) return;
  const modal = document.getElementById('batch-detail-modal');
  if (!modal) return;

  document.getElementById('batch-detail-id').value    = safeId;
  document.getElementById('batch-detail-title').textContent = 'Loading…';

  // Load drivers
  const driverSelect = document.getElementById('batch-detail-driver');
  if (driverSelect) {
    driverSelect.innerHTML = '<option value="">-- Loading… --</option>';
    try {
      const drRes = await fetch('/api/auth/employees', { credentials: 'include' });
      const drJson = await drRes.json();
      const drivers = (drJson.data || []).filter(e => e.role === 'driver');
      driverSelect.innerHTML = '<option value="">-- None --</option>'
        + drivers.map(d => `<option value="${d.full_name}">${d.full_name}</option>`).join('');
    } catch (e) {
      driverSelect.innerHTML = '<option value="">-- Failed to load --</option>';
    }
  }

  modal.classList.add('active');
  await refreshBatchDetailModal(safeId);
};

async function refreshBatchDetailModal(batchId) {
  // Fetch the specific batch to get its deliveries populated
  const safeId = parseInt(batchId, 10);
  if (!safeId || safeId <= 0) return;
  const res = await fetch(`/api/deliveries/batch/${safeId}`, { credentials: 'include' });
  const json = await res.json();
  if (!json.success) return;
  const batch = json.data;

  document.getElementById('batch-detail-title').textContent = `Batch: ${batch.batch_ref}`;
  document.getElementById('batch-detail-plate').value  = batch.plate_number || '';
  document.getElementById('batch-detail-notes').value  = batch.notes || '';

  const driverSelect = document.getElementById('batch-detail-driver');
  if (driverSelect && batch.driver_name) {
    // Try to pre-select
    for (const opt of driverSelect.options) {
      if (opt.value === batch.driver_name) { opt.selected = true; break; }
    }
  }

  // Capacity bar
  const totalItems = batch.delivery_count || 0;
  const pct = Math.min(100, Math.round((totalItems / TRUCK_MAX_ORDERS) * 100));
  const barColor = pct >= 100 ? '#ef4444' : pct >= 80 ? '#f59e0b' : '#10b981';
  const bar   = document.getElementById('batch-capacity-bar');
  const label = document.getElementById('batch-capacity-label');
  if (bar)   { bar.style.width = pct + '%'; bar.style.background = barColor; }
  if (label) {
    label.textContent = `${totalItems} / ${TRUCK_MAX_ORDERS} bulk orders (${pct}%)`;
    label.style.color = pct >= 100 ? '#ef4444' : '#64748b';
    label.style.fontWeight = pct >= 100 ? '700' : 'normal';
  }

  // Disable add input if batch is full
  const addInput = document.getElementById('batch-add-del-ref');
  const addBtn   = document.querySelector('#batch-detail-modal button[onclick="addDeliveryToBatch()"]');
  if (totalItems >= TRUCK_MAX_ORDERS) {
    if (addInput) { addInput.disabled = true; addInput.placeholder = 'Full — max bulk orders reached'; }
    if (addBtn)   { addBtn.disabled = true; addBtn.style.opacity = '0.4'; }
  } else {
    if (addInput) { addInput.disabled = false; addInput.placeholder = 'DEL-XXX — delivery ref'; }
    if (addBtn)   { addBtn.disabled = false; addBtn.style.opacity = '1'; }
  }

  // Deliveries list
  const list = document.getElementById('batch-detail-deliveries');
  if (list) {
    if (!batch.deliveries || batch.deliveries.length === 0) {
      list.innerHTML = '<div style="text-align:center; color:#94a3b8; padding:12px;">No deliveries added yet.</div>';
    } else {
      list.innerHTML = batch.deliveries.map(d => {
        const itemCount = (d.items || []).reduce((s, i) => s + (i.qty || 1), 0);
        const canRemove = batch.status === 'open';
        return `
          <div style="display:flex; justify-content:space-between; align-items:center; padding:8px 4px; border-bottom:1px solid #f1f5f9;">
            <div>
              <strong style="font-size:0.85rem;">${d.delivery_ref}</strong>
              <span style="font-size:0.75rem; color:#64748b; margin-left:8px;">${d.customerName} · ${itemCount} item${itemCount !== 1 ? 's' : ''}</span>
            </div>
            ${canRemove ? `<button style="background:none;border:none;cursor:pointer;color:#ef4444;font-size:0.85rem;padding:2px 6px;"
              onclick="removeDeliveryFromBatch(${batch.id},'${d.delivery_ref}')">×</button>` : ''}
          </div>`;
      }).join('');
    }
  }

  // Hide dispatch button if already dispatched
  const dispSection = document.getElementById('batch-dispatch-section');
  if (dispSection) {
    dispSection.style.display = batch.status === 'open' ? '' : 'none';
  }
}

// ─── Save batch meta (plate/driver/notes) ─────────────────────────────────────
window.saveBatchDetails = async function () {
  const id     = Number(document.getElementById('batch-detail-id').value);
  const plate  = document.getElementById('batch-detail-plate').value.trim();
  const driver = document.getElementById('batch-detail-driver').value.trim();
  const notes  = document.getElementById('batch-detail-notes').value.trim();
  if (!plate) { alert('Plate number is required.'); return; }

  const res = await TruckAPI.updateBatch(id, { plateNumber: plate, driverName: driver, notes });
  if (res.success) {
    await refreshBatchDetailModal(id);
    renderBatchList();
  } else {
    alert(res.error || 'Failed to save.');
  }
};

// ─── Add delivery via text input in modal ─────────────────────────────────────
window.addDeliveryToBatch = async function () {
  const id  = Number(document.getElementById('batch-detail-id').value);
  const ref = document.getElementById('batch-add-del-ref').value.trim().toUpperCase();
  if (!ref) { alert('Enter a delivery reference (DEL-XXX).'); return; }

  const res = await TruckAPI.updateBatch(id, { addDeliveryRef: ref });

  if (res.success) {
    if (res.data?.split) {
      alert(`Delivery split complete!\n\n• ${res.data.items_in_batch} items added to this truck\n• ${res.data.items_remainder} items moved to new delivery ${res.data.remainder_ref} (pending for next truck)`);
    }
    document.getElementById('batch-add-del-ref').value = '';
    await refreshBatchDetailModal(id);
    renderBatchList();
    renderPendingPicker();
    return;
  }

  // needsSplit
  if (res.needsSplit) {
    const confirmed = confirm(
      `Warning This delivery has ${res.items_total} items but only ${res.slots_available} slot(s) are left.\n\n` +
      `Split it?\n• ${res.slots_available} items -> load now\n• ${res.items_remainder} items -> new pending delivery for next truck\n\nClick OK to split.`
    );
    if (!confirmed) return;

    const splitRes = await TruckAPI.updateBatch(id, { addDeliveryRef: ref, splitMode: true });
    if (splitRes.success) {
      const d = splitRes.data;
      alert(`Delivery split complete!\n• ${d.items_in_batch} items loaded\n• ${d.items_remainder} items moved to new delivery ${d.remainder_ref}`);
      document.getElementById('batch-add-del-ref').value = '';
      await refreshBatchDetailModal(id);
      renderBatchList();
      renderPendingPicker();
    } else {
      alert(splitRes.error || 'Failed to split delivery.');
    }
    return;
  }

  alert(res.error || 'Failed to add delivery.');
};

// ─── Remove delivery from batch ───────────────────────────────────────────────
window.removeDeliveryFromBatch = async function (batchId, delivRef) {
  const res = await TruckAPI.updateBatch(batchId, { removeDeliveryRef: delivRef });
  if (res.success) {
    await refreshBatchDetailModal(batchId);
    renderBatchList();
    renderPendingPicker();
  } else {
    alert(res.error || 'Failed to remove delivery.');
  }
};

// ─── Dispatch batch from modal ────────────────────────────────────────────────
window.dispatchBatch = async function () {
  const id  = Number(document.getElementById('batch-detail-id').value);
  // Save latest plate/driver first
  await saveBatchDetails();
  if (!confirm('Dispatch this truck? All queued deliveries will be assigned to the driver and marked Out for Delivery.')) return;

  const res = await TruckAPI.dispatchBatch(id);
  if (res.success) {
    alert(`Truck dispatched! ${res.data.delivery_count} deliveries are now Out for Delivery.`);
    document.getElementById('batch-detail-modal').classList.remove('active');
    loadTruckPlanner();
    renderDeliveries();
  } else {
    alert(res.error || 'Dispatch failed. Make sure a driver and plate number are set.');
  }
};

// ─── Create batch form ────────────────────────────────────────────────────────
document.getElementById('open-create-batch-btn')?.addEventListener('click', async () => {
  const modal = document.getElementById('create-batch-modal');
  if (!modal) return;
  document.getElementById('batch-plate').value  = '';
  document.getElementById('batch-notes').value  = '';

  // Load drivers
  const driverSelect = document.getElementById('batch-driver');
  driverSelect.innerHTML = '<option value="">-- Loading… --</option>';
  try {
    const res  = await fetch('/api/auth/employees', { credentials: 'include' });
    const json = await res.json();
    const drivers = (json.data || []).filter(e => e.role === 'driver');
    driverSelect.innerHTML = '<option value="">-- None --</option>'
      + drivers.map(d => `<option value="${d.full_name}">${d.full_name}${d.phone ? ' · ' + d.phone : ''}</option>`).join('');
  } catch (e) {
    driverSelect.innerHTML = '<option value="">-- Failed to load --</option>';
  }

  modal.classList.add('active');
});

document.getElementById('create-batch-form')?.addEventListener('submit', async (e) => {
  e.preventDefault();
  const plate  = document.getElementById('batch-plate').value.trim();
  const driver = document.getElementById('batch-driver').value.trim();
  const notes  = document.getElementById('batch-notes').value.trim();

  const res = await TruckAPI.createBatch({ plateNumber: plate, driverName: driver, notes });
  if (res.success) {
    document.getElementById('create-batch-modal').classList.remove('active');
    loadTruckPlanner();
    // Immediately open the new batch detail so admin can start adding deliveries
    openBatchDetail(res.data.id);
  } else {
    alert(res.error || 'Failed to create batch.');
  }
});

// ─── Wire up nav click ────────────────────────────────────────────────────────
document.querySelectorAll('.nav-btn').forEach(btn => {
  if (btn.getAttribute('data-target') === 'truck-planner-view') {
    btn.addEventListener('click', loadTruckPlanner);
  }
});

// ─── REPORTS ──────────────────────────────────────────────────────────────────

// Set default date range to current month
const now   = new Date();
const from  = new Date(now.getFullYear(), now.getMonth(), 1);
const to    = new Date(now.getFullYear(), now.getMonth() + 1, 0);
const fmt   = d => d.toISOString().split('T')[0];
const fromEl = document.getElementById('report-date-from');
const toEl   = document.getElementById('report-date-to');
if (fromEl) fromEl.value = fmt(from);
if (toEl)   toEl.value   = fmt(to);

// Load reports when tab is clicked
document.querySelector('[data-target="reports-view"]')?.addEventListener('click', () => {
  if (document.getElementById('reports-content')?.querySelector('p')) generateReports();
});

window.generateReports = async function() {
  const from    = document.getElementById('report-date-from')?.value;
  const to      = document.getElementById('report-date-to')?.value;
  const content = document.getElementById('reports-content');
  if (!content) return;

  content.innerHTML = '<p style="text-align:center; color:#94a3b8; padding:40px;">Loading…</p>';

  try {
    const [ordersRes, productsRes, returnsRes, cancelsRes] = await Promise.all([
      fetch('/api/orders', { credentials: 'include' }).then(r => r.json()),
      fetch('/api/products', { credentials: 'include' }).then(r => r.json()),
      fetch('/api/returns',  { credentials: 'include' }).then(r => r.json()),
      fetch('/api/orders/cancellations', { credentials: 'include' }).then(r => r.json()).catch(() => ({ success: false })),
    ]);

    const allOrders  = ordersRes.success  ? ordersRes.data  : [];
    const allProducts = productsRes.success ? productsRes.data : [];
    const allReturns = returnsRes.success ? returnsRes.data  : [];
    const allCancels = cancelsRes.success ? cancelsRes.data  : [];

    // Filter orders by date range
    const filtered = allOrders.filter(o => {
      if (!o.date && !o.created_at) return false;
      const d = (o.date || o.created_at || '').substring(0, 10);
      if (from && d < from) return false;
      if (to   && d > to)   return false;
      return true;
    });

    const completed = filtered.filter(o => ['completed','delivered','processing'].includes(o.status));
    const cancelled = filtered.filter(o => o.status === 'cancelled');
    const pending   = filtered.filter(o => o.status === 'pending');

    // Total sales
    const totalSales    = completed.reduce((s, o) => s + (parseFloat(o.total) || 0), 0);
    const totalOrders   = filtered.length;
    const totalReturns  = allReturns.filter(r => {
      const d = (r.created_at || '').substring(0, 10);
      return (!from || d >= from) && (!to || d <= to);
    }).length;

    // Sales per product
    const productSales = {};
    completed.forEach(o => {
      (o.items || []).forEach(item => {
        const name = item.name || 'Unknown';
        if (!productSales[name]) productSales[name] = { qty: 0, revenue: 0 };
        productSales[name].qty     += (item.qty || 1);
        productSales[name].revenue += (parseFloat(item.price) || 0) * (item.qty || 1);
      });
    });

    const topProducts = Object.entries(productSales)
      .sort((a, b) => b[1].revenue - a[1].revenue)
      .slice(0, 10);

    // Sales per category
    const catSales = {};
    completed.forEach(o => {
      (o.items || []).forEach(item => {
        const prod = allProducts.find(p => p.name === item.name);
        const cat  = prod?.category || 'Unknown';
        if (!catSales[cat]) catSales[cat] = 0;
        catSales[cat] += (parseFloat(item.price) || 0) * (item.qty || 1);
      });
    });

    const fmt = n => '₱' + parseFloat(n).toLocaleString('en-PH', { minimumFractionDigits: 2 });
    const dateLabel = from && to ? `${from} to ${to}` : 'All time';

    content.innerHTML = `
      <div id="printable-report">
        <div style="margin-bottom:8px; font-size:13px; color:#64748b;">Period: <strong>${dateLabel}</strong></div>

        <!-- Summary Cards -->
        <div style="display:grid; grid-template-columns:repeat(4,1fr); gap:12px; margin-bottom:24px;">
          ${[
            ['Total Sales', fmt(totalSales), '#f97316'],
            ['Total Orders', totalOrders, '#3b82f6'],
            ['Completed/Processing', completed.length, '#10b981'],
            ['Cancelled', cancelled.length, '#ef4444'],
          ].map(([label, val, color]) => `
            <div class="stat-card">
              <h3 style="font-size:11px; color:#64748b; text-transform:uppercase; letter-spacing:0.5px;">${label}</h3>
              <p style="font-size:1.6rem; font-weight:800; color:${color}; margin:4px 0 0;">${val}</p>
            </div>`).join('')}
        </div>

        <!-- Top Products -->
        <div class="card" style="margin-bottom:20px; padding:20px;">
          <h3 style="font-size:14px; font-weight:700; margin-bottom:14px; color:#0f172a;">Top Products by Revenue</h3>
          ${topProducts.length === 0
            ? '<p style="color:#94a3b8; font-size:13px;">No sales data.</p>'
            : `<table class="data-table">
              <thead><tr><th>#</th><th>Product</th><th>Qty Sold</th><th>Revenue</th></tr></thead>
              <tbody>
                ${topProducts.map(([name, data], i) => `
                  <tr>
                    <td style="color:#94a3b8;">${i + 1}</td>
                    <td><strong>${name}</strong></td>
                    <td>${data.qty}</td>
                    <td><strong>${fmt(data.revenue)}</strong></td>
                  </tr>`).join('')}
              </tbody>
            </table>`}
        </div>

        <!-- Sales by Category -->
        <div class="card" style="margin-bottom:20px; padding:20px;">
          <h3 style="font-size:14px; font-weight:700; margin-bottom:14px; color:#0f172a;">Sales by Category</h3>
          ${Object.keys(catSales).length === 0
            ? '<p style="color:#94a3b8; font-size:13px;">No sales data.</p>'
            : `<table class="data-table">
              <thead><tr><th>Category</th><th>Revenue</th></tr></thead>
              <tbody>
                ${Object.entries(catSales).sort((a,b) => b[1]-a[1]).map(([cat, rev]) => `
                  <tr>
                    <td><strong>${cat}</strong></td>
                    <td>${fmt(rev)}</td>
                  </tr>`).join('')}
              </tbody>
            </table>`}
        </div>

        <!-- Order Status Breakdown -->
        <div class="card" style="margin-bottom:20px; padding:20px;">
          <h3 style="font-size:14px; font-weight:700; margin-bottom:14px; color:#0f172a;">Order Status Breakdown</h3>
          <table class="data-table">
            <thead><tr><th>Status</th><th>Count</th></tr></thead>
            <tbody>
              ${['pending','processing','completed','delivered','cancelled'].map(s => {
                const count = filtered.filter(o => o.status === s).length;
                return `<tr><td style="text-transform:capitalize;">${s}</td><td>${count}</td></tr>`;
              }).join('')}
            </tbody>
          </table>
        </div>

        <!-- Returns Summary -->
        <div class="card" style="padding:20px;">
          <h3 style="font-size:14px; font-weight:700; margin-bottom:14px; color:#0f172a;">Returns Summary</h3>
          <p style="font-size:13px; color:#64748b;">Total returns in period: <strong>${totalReturns}</strong></p>
        </div>
      </div>`;

  } catch (e) {
    content.innerHTML = '<p style="text-align:center; color:#ef4444; padding:40px;">Failed to generate report.</p>';
    console.error(e);
  }
};

// ═══════════════════════════════════════════════════════════════════════════
// REPORTS FUNCTIONALITY
// ═══════════════════════════════════════════════════════════════════════════

// Current active report type
let currentReportType = 'sales';

// Report type dropdown switching
document.addEventListener('DOMContentLoaded', () => {
  const reportSelector = document.getElementById('report-type-selector');
  if (reportSelector) {
    reportSelector.addEventListener('change', (e) => {
      const reportType = e.target.value;
      currentReportType = reportType;
      
      // Hide all report contents
      document.querySelectorAll('.report-content').forEach(c => c.classList.remove('active'));
      
      // Show selected report
      document.getElementById(`report-${reportType}`).classList.add('active');
      
      // Auto-load inventory report (doesn't need date range)
      if (reportType === 'inventory') {
        generateInventoryReport();
      }
    });
  }
});

// Generate report based on current tab
window.generateReport = async function() {
  const dateFrom = document.getElementById('report-date-from').value;
  const dateTo = document.getElementById('report-date-to').value;
  
  if (!dateFrom || !dateTo) {
    alert('Please select both start and end dates');
    return;
  }
  
  switch(currentReportType) {
    case 'sales':
      await generateSalesReport(dateFrom, dateTo);
      break;
    case 'inventory':
      await generateInventoryReport();
      break;
    case 'best-selling':
      await generateBestSellingReport(dateFrom, dateTo);
      break;
    case 'customers':
      await generateCustomersReport(dateFrom, dateTo);
      break;
    case 'deliveries':
      await generateDeliveriesReport(dateFrom, dateTo);
      break;
  }
};

// ─── SALES REPORT ────────────────────────────────────────────────────────────
async function generateSalesReport(startDate, endDate) {
  try {
    const params = new URLSearchParams({ start_date: startDate, end_date: endDate });
    const res = await fetch(`/api/dashboard/stats?${params.toString()}`, { credentials: 'include' });
    const data = await res.json();
    
    if (!data.success) {
      alert('Failed to generate sales report');
      return;
    }
    
    // Update summary cards
    document.getElementById('report-total-sales').textContent = 
      `₱${Number(data.totalSales || 0).toLocaleString('en-PH', {minimumFractionDigits:2})}`;
    document.getElementById('report-total-orders').textContent = data.totalOrders || 0;
    document.getElementById('report-completed-orders').textContent = data.completedOrders || 0;
    document.getElementById('report-delivered-orders').textContent = data.deliveredOrders || 0;
    document.getElementById('report-pending-orders').textContent = data.pendingOrdersCount || 0;
    document.getElementById('report-cancelled-orders').textContent = data.cancelledOrders || 0;
    document.getElementById('report-return-orders').textContent = data.returnOrders || 0;
    
    // Get detailed daily breakdown
    const ordersRes = await fetch('/api/orders', { credentials: 'include' });
    const ordersData = await ordersRes.json();
    
    if (ordersData.success) {
      const orders = ordersData.data || [];
      // Filter by date range
      const filtered = orders.filter(o => {
        const orderDate = o.created_at.split(' ')[0];
        return orderDate >= startDate && orderDate <= endDate;
      });
      
      // Group by date
      const byDate = {};
      filtered.forEach(o => {
        const date = o.created_at.split(' ')[0];
        if (!byDate[date]) {
          byDate[date] = { orders: [], total: 0, completed: 0, pending: 0, cancelled: 0 };
        }
        byDate[date].orders.push(o);
        byDate[date].total += parseFloat(o.total || 0);
        if (o.status === 'completed' || o.status === 'delivered') byDate[date].completed++;
        else if (o.status === 'pending' || o.status === 'processing') byDate[date].pending++;
        else if (o.status === 'cancelled') byDate[date].cancelled++;
      });
      
      // Render daily table
      const tbody = document.getElementById('sales-daily-table');
      if (Object.keys(byDate).length === 0) {
        tbody.innerHTML = '<tr><td colspan="5" style="text-align:center; color:#94a3b8; padding:30px;">No orders in this date range</td></tr>';
      } else {
        tbody.innerHTML = Object.keys(byDate).sort().reverse().map(date => {
          const d = byDate[date];
          const avg = d.orders.length > 0 ? d.total / d.orders.length : 0;
          return `
            <tr>
              <td>${new Date(date).toLocaleDateString('en-PH', {year:'numeric', month:'short', day:'numeric'})}</td>
              <td>${d.orders.length}</td>
              <td style="font-weight:600;">₱${d.total.toLocaleString('en-PH', {minimumFractionDigits:2})}</td>
              <td>₱${avg.toLocaleString('en-PH', {minimumFractionDigits:2})}</td>
              <td style="font-size:12px;">
                <span style="color:#10b981;">C: ${d.completed}</span> 
                <span style="color:#f59e0b;">P: ${d.pending}</span> 
                <span style="color:#ef4444;">X: ${d.cancelled}</span>
              </td>
            </tr>
          `;
        }).join('');
      }
    }
    
  } catch (e) {
    console.error('Sales report error:', e);
    alert('Error generating sales report');
  }
}

// ─── INVENTORY REPORT ────────────────────────────────────────────────────────
async function generateInventoryReport() {
  try {
    const res = await fetch('/api/products', { credentials: 'include' });
    const data = await res.json();
    
    if (!data.success) {
      alert('Failed to load inventory');
      return;
    }
    
    const products = data.data || [];
    
    // Calculate stats
    let totalProducts = 0;
    let outOfStock = 0;
    let lowStock = 0;
    let totalValue = 0;
    
    products.forEach(p => {
      if (p.variants && p.variants.length > 0) {
        p.variants.forEach(v => {
          totalProducts++;
          if (v.stock === 0) outOfStock++;
          else if (v.stock <= (v.min_stock || 5)) lowStock++;
          totalValue += v.stock * parseFloat(v.price || 0);
        });
      } else {
        totalProducts++;
        if (p.stock === 0) outOfStock++;
        else if (p.stock <= (p.minQuantity || 20)) lowStock++;
        totalValue += p.stock * parseFloat(p.price || 0);
      }
    });
    
    // Update cards
    document.getElementById('inv-total-products').textContent = totalProducts;
    document.getElementById('inv-out-stock').textContent = outOfStock;
    document.getElementById('inv-low-stock').textContent = lowStock;
    document.getElementById('inv-total-value').textContent = 
      `₱${totalValue.toLocaleString('en-PH', {minimumFractionDigits:2})}`;
    
    // Populate category filter
    const categories = [...new Set(products.map(p => p.category))];
    const catFilter = document.getElementById('inventory-category-filter');
    catFilter.innerHTML = '<option value="all">All Categories</option>' + 
      categories.map(c => `<option value="${c}">${c}</option>`).join('');
    
    // Render table
    renderInventoryTable(products);
    
    // Add filter listener
    catFilter.onchange = () => renderInventoryTable(products);
    
  } catch (e) {
    console.error('Inventory report error:', e);
    alert('Error generating inventory report');
  }
}

function renderInventoryTable(products) {
  const selectedCat = document.getElementById('inventory-category-filter').value;
  const tbody = document.getElementById('inventory-report-table');
  
  const rows = [];
  products.forEach(p => {
    if (selectedCat !== 'all' && p.category !== selectedCat) return;
    
    if (p.variants && p.variants.length > 0) {
      p.variants.forEach(v => {
        const status = v.stock === 0 ? 'Out of Stock' : 
                      v.stock <= (v.min_stock || 5) ? 'Low Stock' : 'In Stock';
        const statusColor = v.stock === 0 ? '#dc2626' : 
                          v.stock <= (v.min_stock || 5) ? '#f97316' : '#10b981';
        const stockValue = v.stock * parseFloat(v.price || 0);
        
        rows.push(`
          <tr>
            <td>${p.name} <span style="color:#64748b; font-size:12px;">(${v.size})</span></td>
            <td>${p.category}</td>
            <td style="font-weight:600;">${v.stock} ${p.unit || 'pcs'}</td>
            <td>${v.min_stock || 5} ${p.unit || 'pcs'}</td>
            <td>₱${Number(v.price || 0).toLocaleString('en-PH', {minimumFractionDigits:2})}</td>
            <td>₱${stockValue.toLocaleString('en-PH', {minimumFractionDigits:2})}</td>
            <td><span style="color:${statusColor}; font-weight:600; font-size:13px;">${status}</span></td>
          </tr>
        `);
      });
    } else {
      const status = p.stock === 0 ? 'Out of Stock' : 
                    p.stock <= (p.minQuantity || 20) ? 'Low Stock' : 'In Stock';
      const statusColor = p.stock === 0 ? '#dc2626' : 
                        p.stock <= (p.minQuantity || 20) ? '#f97316' : '#10b981';
      const stockValue = p.stock * parseFloat(p.price || 0);
      
      rows.push(`
        <tr>
          <td>${p.name}</td>
          <td>${p.category}</td>
          <td style="font-weight:600;">${p.stock} ${p.unit || 'pcs'}</td>
          <td>${p.minQuantity || 20} ${p.unit || 'pcs'}</td>
          <td>₱${Number(p.price || 0).toLocaleString('en-PH', {minimumFractionDigits:2})}</td>
          <td>₱${stockValue.toLocaleString('en-PH', {minimumFractionDigits:2})}</td>
          <td><span style="color:${statusColor}; font-weight:600; font-size:13px;">${status}</span></td>
        </tr>
      `);
    }
  });
  
  tbody.innerHTML = rows.length > 0 ? rows.join('') : 
    '<tr><td colspan="7" style="text-align:center; color:#94a3b8; padding:30px;">No products found</td></tr>';
}

// ─── BEST SELLING REPORT ─────────────────────────────────────────────────────
async function generateBestSellingReport(startDate, endDate) {
  try {
    const res = await fetch('/api/products/best-selling', { credentials: 'include' });
    const data = await res.json();
    
    if (!data.success) {
      alert('Failed to load best selling products');
      return;
    }
    
    const products = data.data || [];
    
    // Calculate totals
    const totalUnits = products.reduce((sum, p) => sum + parseInt(p.sold_quantity || 0), 0);
    const uniqueProducts = products.length;
    
    // Update summary
    if (products.length > 0) {
      const top = products[0];
      document.getElementById('top-product-name').textContent = top.name;
      document.getElementById('top-product-qty').textContent = `${top.sold_quantity} ${top.unit || 'pcs'} sold`;
    }
    document.getElementById('total-units-sold').textContent = totalUnits.toLocaleString();
    document.getElementById('unique-products-sold').textContent = uniqueProducts;
    
    // Render table
    const tbody = document.getElementById('best-selling-table');
    if (products.length === 0) {
      tbody.innerHTML = '<tr><td colspan="6" style="text-align:center; color:#94a3b8; padding:30px;">No sales data available</td></tr>';
    } else {
      tbody.innerHTML = products.slice(0, 20).map((p, i) => {
        const revenue = parseFloat(p.sold_quantity || 0) * parseFloat(p.price || 0);
        return `
          <tr>
            <td style="font-weight:700; color:#f97316;">${i + 1}</td>
            <td style="font-weight:600;">${p.name}</td>
            <td>${p.category}</td>
            <td style="font-weight:600;">${p.sold_quantity} ${p.unit || 'pcs'}</td>
            <td style="font-weight:600; color:#10b981;">₱${revenue.toLocaleString('en-PH', {minimumFractionDigits:2})}</td>
            <td>₱${Number(p.price || 0).toLocaleString('en-PH', {minimumFractionDigits:2})}</td>
          </tr>
        `;
      }).join('');
    }
    
  } catch (e) {
    console.error('Best selling report error:', e);
    alert('Error generating best selling report');
  }
}

// ─── CUSTOMERS REPORT ────────────────────────────────────────────────────────
async function generateCustomersReport(startDate, endDate) {
  try {
    const [custRes, ordersRes] = await Promise.all([
      fetch('/api/customers', { credentials: 'include' }),
      fetch('/api/orders', { credentials: 'include' })
    ]);
    
    const custData = await custRes.json();
    const ordersData = await ordersRes.json();
    
    if (!custData.success || !ordersData.success) {
      alert('Failed to load customer data');
      return;
    }
    
    const customers = custData.data || [];
    const orders = ordersData.data || [];
    
    // Filter orders by date
    const filteredOrders = orders.filter(o => {
      const orderDate = o.created_at.split(' ')[0];
      return orderDate >= startDate && orderDate <= endDate;
    });
    
    // Calculate customer stats
    const customerOrders = {};
    filteredOrders.forEach(o => {
      const custId = o.user_id;
      if (!customerOrders[custId]) {
        customerOrders[custId] = { orders: 0, total: 0, lastOrder: null };
      }
      customerOrders[custId].orders++;
      customerOrders[custId].total += parseFloat(o.total || 0);
      if (!customerOrders[custId].lastOrder || o.created_at > customerOrders[custId].lastOrder) {
        customerOrders[custId].lastOrder = o.created_at;
      }
    });
    
    const activeCustomers = Object.keys(customerOrders).length;
    const newCustomers = customers.filter(c => {
      const joinDate = c.created_at.split(' ')[0];
      return joinDate >= startDate && joinDate <= endDate;
    }).length;
    
    const totalSpent = Object.values(customerOrders).reduce((sum, c) => sum + c.total, 0);
    const avgOrderValue = activeCustomers > 0 ? totalSpent / activeCustomers : 0;
    
    // Update cards
    document.getElementById('cust-total').textContent = customers.length;
    document.getElementById('cust-active').textContent = activeCustomers;
    document.getElementById('cust-new').textContent = newCustomers;
    document.getElementById('cust-avg-value').textContent = 
      `₱${avgOrderValue.toLocaleString('en-PH', {minimumFractionDigits:2})}`;
    
    // Top customers
    const topCustomers = customers.map(c => ({
      ...c,
      orders: customerOrders[c.id]?.orders || 0,
      total: customerOrders[c.id]?.total || 0,
      lastOrder: customerOrders[c.id]?.lastOrder || null
    })).filter(c => c.orders > 0).sort((a, b) => b.total - a.total);
    
    // Render table
    const tbody = document.getElementById('customers-report-table');
    if (topCustomers.length === 0) {
      tbody.innerHTML = '<tr><td colspan="6" style="text-align:center; color:#94a3b8; padding:30px;">No customer orders in this period</td></tr>';
    } else {
      tbody.innerHTML = topCustomers.slice(0, 20).map((c, i) => `
        <tr>
          <td style="font-weight:700; color:#f97316;">${i + 1}</td>
          <td style="font-weight:600;">${c.fullname || c.name}</td>
          <td>${c.email}</td>
          <td>${c.orders}</td>
          <td style="font-weight:600; color:#10b981;">₱${c.total.toLocaleString('en-PH', {minimumFractionDigits:2})}</td>
          <td style="font-size:12px; color:#64748b;">${c.lastOrder ? new Date(c.lastOrder).toLocaleDateString('en-PH') : '-'}</td>
        </tr>
      `).join('');
    }
    
  } catch (e) {
    console.error('Customers report error:', e);
    alert('Error generating customers report');
  }
}

// ─── DELIVERIES REPORT ───────────────────────────────────────────────────────
async function generateDeliveriesReport(startDate, endDate) {
  try {
    const [delRes, empRes] = await Promise.all([
      fetch('/api/deliveries', { credentials: 'include' }),
      fetch('/api/auth/employees', { credentials: 'include' })
    ]);
    
    const delData = await delRes.json();
    const empData = await empRes.json();
    
    if (!delData.success) {
      alert('Failed to load delivery data');
      return;
    }
    
    const deliveries = delData.data || [];
    const employees = empData.success ? empData.data || [] : [];
    
    // Filter by date
    const filtered = deliveries.filter(d => {
      const delDate = (d.created_at || '').split(' ')[0];
      return delDate >= startDate && delDate <= endDate;
    });
    
    const total = filtered.length;
    const completed = filtered.filter(d => d.status === 'delivered').length;
    const pending = filtered.filter(d => d.status === 'pending' || d.status === 'scheduled').length;
    const successRate = total > 0 ? ((completed / total) * 100).toFixed(1) : 0;
    
    // Update cards
    document.getElementById('del-total').textContent = total;
    document.getElementById('del-completed').textContent = completed;
    document.getElementById('del-pending').textContent = pending;
    document.getElementById('del-success-rate').textContent = `${successRate}%`;
    
    // Group by driver
    const byDriver = {};
    filtered.forEach(d => {
      const driverId = d.driver_id;
      if (!driverId) return;
      
      if (!byDriver[driverId]) {
        const driver = employees.find(e => e.id === driverId);
        byDriver[driverId] = {
          name: driver ? driver.fullname : `Driver ${driverId}`,
          total: 0,
          completed: 0,
          pending: 0
        };
      }
      byDriver[driverId].total++;
      if (d.status === 'delivered') byDriver[driverId].completed++;
      else if (d.status === 'pending' || d.status === 'scheduled') byDriver[driverId].pending++;
    });
    
    // Render table
    const tbody = document.getElementById('deliveries-report-table');
    const drivers = Object.values(byDriver);
    
    if (drivers.length === 0) {
      tbody.innerHTML = '<tr><td colspan="5" style="text-align:center; color:#94a3b8; padding:30px;">No deliveries in this period</td></tr>';
    } else {
      tbody.innerHTML = drivers.map(d => {
        const rate = d.total > 0 ? ((d.completed / d.total) * 100).toFixed(1) : 0;
        return `
          <tr>
            <td style="font-weight:600;">${d.name}</td>
            <td>${d.total}</td>
            <td style="color:#10b981; font-weight:600;">${d.completed}</td>
            <td style="color:#f97316;">${d.pending}</td>
            <td style="font-weight:600;">${rate}%</td>
          </tr>
        `;
      }).join('');
    }
    
  } catch (e) {
    console.error('Deliveries report error:', e);
    alert('Error generating deliveries report');
  }
}

// ─── EXPORT FUNCTIONS ────────────────────────────────────────────────────────
window.exportReportPDF = function() {
  alert('PDF export feature coming soon. Use Print for now.');
};

window.exportReportCSV = function() {
  alert('CSV export feature coming soon.');
};

window.printReport = function() {
  window.print();
};
