// cashier.js
// Basic state
let cart = [];
let todaysTransactions = [];
let currentLoadedReservation = null; // Track loaded reservation order_ref

// DOM Elements -- assigned after DOM ready (see DOMContentLoaded at bottom)
let productGrid, searchInput, cartContainer, emptyCartMsg;
let subtotalEl, taxEl, totalEl, btnTotalValEl, checkoutBtn, clearCartBtn;
let paymentTotalDue, tenderedInput, paymentChange, confirmPaymentBtn, quickCashContainer;

const formatMoney = (amount) => `₱${amount.toFixed(2)}`;

// Products global is populated by data/products.js

// --- INITIALIZE -------------------------------------------------------------
async function initPOS() {
  updateDateTime();
  setInterval(updateDateTime, 1000);
  setupEventListeners();
  loadTransactions();

  // Load categories first, then products
  await loadCategories(); 

  // Wait for products -- handle both cases: already loaded or still loading
  if (products.length > 0) {
    applyFilters();
  } else {
    // Give products.js a chance to finish (in case event already fired)
    await new Promise(resolve => {
      const onLoaded = () => { resolve(); };
      document.addEventListener('productsLoaded', onLoaded, { once: true });
      // Fallback: if products load within 3s but event missed, poll
      const poll = setInterval(() => {
        if (products.length > 0) {
          clearInterval(poll);
          document.removeEventListener('productsLoaded', onLoaded);
          resolve();
        }
      }, 200);
      setTimeout(() => { clearInterval(poll); resolve(); }, 5000);
    });
    applyFilters();
  }
}

// --- CATEGORIES --------------------------------------------------------------
let activeCategory = 'all';

async function loadCategories() {
  try {
    const res  = await fetch('/api/categories');
    const json = await res.json();
    if (json.success && json.data.length > 0) {
      populateCategoryBtns(json.data);
    }
  } catch(e) {
    console.warn('Could not load categories:', e);
  }
}

function populateCategoryBtns(categories = []) {
  const container = document.getElementById('category-filters');
  if (!container) return;

  container.innerHTML = `<button class="category-btn active" data-category="all">All</button>`;
  categories.forEach(cat => {
    const btn = document.createElement('button');
    btn.className = 'category-btn';
    btn.dataset.category = cat.name;
    btn.textContent = cat.name;
    container.appendChild(btn);
  });

  container.querySelectorAll('.category-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      container.querySelectorAll('.category-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      activeCategory = btn.dataset.category;
      applyFilters();
    });
  });
}

function applyFilters() {
  const term = document.getElementById('product-search')?.value.toLowerCase() || '';
  let filtered = products;
  if (activeCategory && activeCategory !== 'all') {
    filtered = filtered.filter(p => p.category?.toLowerCase() === activeCategory.toLowerCase());
  }
  if (term) {
    filtered = filtered.filter(p => p.name.toLowerCase().includes(term));
  }
  // Discounted products first
  filtered = [...filtered].sort((a, b) => (b.discount || 0) - (a.discount || 0));
  renderProducts(filtered);
}

function updateDateTime() {
  const el = document.getElementById('current-date-time');
  if (el) el.innerText = new Date().toLocaleString();
}

// --- RENDER PRODUCTS ---------------------------------------------------------
function renderProducts(productsToRender) {
  const grid = document.getElementById('pos-product-grid');
  if (!grid) return;
  if (productsToRender.length === 0) {
    grid.innerHTML = `<div style="grid-column: 1/-1; text-align: center; padding: 40px; color: var(--gray-400);">No products found.</div>`;
    return;
  }
  let html = '';
  productsToRender.forEach(product => {
    const minQty = product.minQuantity || 20;
    const critQty = product.criticalQuantity || 5;
    const unit = product.unit || 'pcs';
    const availableStock = (product.available_stock !== undefined && product.available_stock !== null)
      ? product.available_stock
      : product.stock;
    const stockClass = availableStock <= critQty ? 'critical' : availableStock < minQty ? 'low' : '';
    const specsAttr = Array.isArray(product.specifications) && product.specifications.length
      ? encodeURIComponent(JSON.stringify(product.specifications))
      : '';

    // Apply discount if available
    const discount = product.discount || 0;
    const finalPrice = discount > 0
      ? parseFloat((product.price * (1 - discount / 100)).toFixed(2))
      : product.price;

    const priceDisplay = discount > 0
      ? `<div class="product-price">
           <span style="text-decoration:line-through; color:#94a3b8; font-size:0.75rem; font-weight:400;">${formatMoney(product.price)}</span>
           <span style="color:#dc2626;">${formatMoney(finalPrice)} / ${unit}</span>
           <span style="background:#dc2626; color:white; font-size:10px; font-weight:700; padding:1px 5px; border-radius:8px; margin-left:2px;">-${discount}%</span>
         </div>`
      : `<div class="product-price">${formatMoney(finalPrice)} / ${unit}</div>`;

    html += `
    <div class="product-card" onclick="addToCartClick('${encodeURIComponent(product.name)}', ${finalPrice}, ${availableStock}, '${product.image}', '${unit}', '${specsAttr}', ${product.id || 'null'})">
      <div class="product-img-wrapper">
        <span class="stock-badge ${stockClass}">Stock: ${availableStock} ${unit}</span>
        <img src="${product.image}" alt="${product.name}" class="product-img" onerror="this.src='Icons/download (1).png'">
      </div>
      <div class="product-info">
        <h4 class="product-name">${product.name}</h4>
        ${priceDisplay}
      </div>
    </div>
    `;
  });
  grid.innerHTML = html;
}

function handleSearch(e) {
  applyFilters();
}

function setupEventListeners() {
  if (searchInput) searchInput.addEventListener('input', handleSearch);
  if (clearCartBtn) {
    clearCartBtn.addEventListener('click', () => {
      if (confirm('Clear the entire order?')) {
        cart = [];
        currentLoadedReservation = null; // Clear loaded reservation too
        updateCartUI();
      }
    });
  }
  if (checkoutBtn) checkoutBtn.addEventListener('click', openPaymentModal);
  if (tenderedInput) tenderedInput.addEventListener('input', calculateChange);
  if (confirmPaymentBtn) confirmPaymentBtn.addEventListener('click', completeTransaction);
}

// --- CART --------------------------------------------------------------------
// Entry point from product card click  shows spec selector if product has options
function addToCartClick(encodedName, price, maxStock, image, unit, encodedSpecs, productId = null) {
  const name = decodeURIComponent(encodedName);

  // Check if product has variants (with individual pricing)
  const pid = productId ? parseInt(productId) : null;
  const product = products.find(p => (pid && p.id === pid) || p.name === name);
  if (product && product.variants && product.variants.length > 0) {
    openVariantModal(product, image, unit);
    return;
  }

  // Fall back to spec selector if specs exist
  const specs = (encodedSpecs && encodedSpecs !== 'null' && encodedSpecs !== '')
    ? JSON.parse(decodeURIComponent(encodedSpecs))
    : [];

  if (specs.length > 0) {
    openSpecModal(name, price, maxStock, image, unit, specs, pid);
  } else {
    addToCart(encodedName, price, maxStock, image, unit, null, pid);
  }
}

// Variant picker modal  shows each size with its own price and stock
function openVariantModal(product, image, unit) {
  document.getElementById('variant-select-modal')?.remove();

  const variantsHtml = product.variants.map(v => {
    const available = v.available_stock ?? (v.stock - (v.reserved_stock || 0));
    const outOfStock = available <= 0;
    const discount = product.discount || 0;
    const finalPrice = discount > 0
      ? parseFloat((v.price * (1 - discount / 100)).toFixed(2))
      : v.price;

    const priceLabel = discount > 0
      ? `<span style="text-decoration:line-through;color:#94a3b8;"">?${v.price.toFixed(2)}</span> <span style="color:#dc2626;font-weight:700;">?${finalPrice.toFixed(2)}</span>`
      : `<span style="color:#f97316;font-weight:700;">?${finalPrice.toFixed(2)}</span>`;

    const stockClass = available <= 5 && !outOfStock ? 'low' : '';

    return `<button class="variant-btn" ${outOfStock ? 'disabled' : ''}
      data-price="${finalPrice}" data-max="${available}"
      data-name="${encodeURIComponent(product.name)}" data-size="${encodeURIComponent(v.size)}"
      data-pid="${product.id}" data-image="${image}" data-unit="${unit}">
      <span class="variant-btn-name">${v.size}</span>
      <span class="variant-btn-price">${priceLabel} / ${unit}</span>
      <span class="variant-btn-stock ${stockClass}">Stock: ${available} ${unit}${outOfStock ? '  Out of Stock' : ''}</span>
    </button>`;
  }).join('');

  const modal = document.createElement('div');
  modal.id = 'variant-select-modal';
  modal.className = 'picker-overlay';
  modal.innerHTML = `
    <div class="picker-box">
      <div class="picker-header">
        <div>
          <h3 class="picker-title">Select Variant</h3>
          <p class="picker-subtitle">${product.name}</p>
        </div>
        <button class="picker-close" onclick="document.getElementById('variant-select-modal').remove()">&times;</button>
      </div>
      <div class="picker-list">${variantsHtml}</div>
      <div class="picker-qty-row" id="variant-qty-row" style="display:none;">
        <label>Quantity:</label>
        <div class="picker-qty-control">
          <button class="picker-qty-btn" onclick="adjustPickerQty(-1)">-</button>
          <input type="number" class="picker-qty-input" id="picker-qty" value="1" min="1" />
          <button class="picker-qty-btn" onclick="adjustPickerQty(1)">+</button>
        </div>
        <button class="picker-add-btn" id="picker-add-btn" onclick="confirmVariantAdd()">Add to Cart</button>
      </div>
    </div>`;
  document.body.appendChild(modal);

  // When a variant is selected, show qty row
  modal.querySelectorAll('.variant-btn:not(:disabled)').forEach(btn => {
    btn.addEventListener('click', () => {
      // Highlight selected
      modal.querySelectorAll('.variant-btn').forEach(b => b.style.background = '');
      btn.style.background = '#fff3e8';
      btn.style.borderColor = '#f97316';
      modal.setAttribute('data-selected', btn.dataset.size);
      modal.setAttribute('data-selected-price', btn.dataset.price);
      modal.setAttribute('data-selected-max', btn.dataset.max);
      modal.setAttribute('data-selected-name', btn.dataset.name);
      modal.setAttribute('data-selected-pid', btn.dataset.pid);
      modal.setAttribute('data-selected-image', btn.dataset.image);
      modal.setAttribute('data-selected-unit', btn.dataset.unit);

      const qtyInput = document.getElementById('picker-qty');
      qtyInput.value = 1;
      qtyInput.max = btn.dataset.max;
      document.getElementById('variant-qty-row').style.display = 'flex';
    });
  });
}

function adjustPickerQty(delta) {
  const input = document.getElementById('picker-qty');
  if (!input) return;
  const max = parseInt(input.max) || 9999;
  const newVal = Math.max(1, Math.min(max, parseInt(input.value || 1) + delta));
  input.value = newVal;
}

function confirmVariantAdd() {
  const modal = document.getElementById('variant-select-modal');
  if (!modal) return;
  const qty      = parseInt(document.getElementById('picker-qty').value) || 1;
  const price    = parseFloat(modal.getAttribute('data-selected-price'));
  const maxStock = parseInt(modal.getAttribute('data-selected-max'));
  const name     = modal.getAttribute('data-selected-name');
  const size     = decodeURIComponent(modal.getAttribute('data-selected'));
  const pid      = parseInt(modal.getAttribute('data-selected-pid'));
  const image    = modal.getAttribute('data-selected-image');
  const unit     = modal.getAttribute('data-selected-unit');

  modal.remove();
  addToCartWithQty(name, price, maxStock, image, unit, size, pid, qty);
}

function selectVariant(productId, encodedName, price, maxStock, image, unit, encodedSize) {
  document.getElementById('variant-select-modal')?.remove();
  addToCart(encodedName, price, maxStock, image, unit, decodeURIComponent(encodedSize), productId);
}

// Show spec/option selection modal
function openSpecModal(name, price, maxStock, image, unit, specs, productId = null) {
  document.getElementById('spec-select-modal')?.remove();

  const optionsHtml = specs.map(s =>
    `<button class="spec-btn"
      data-spec="${encodeURIComponent(s)}"
      data-price="${price}" data-max="${maxStock}"
      data-name="${encodeURIComponent(name)}" data-pid="${productId ?? ''}"
      data-image="${image}" data-unit="${unit}">${s}</button>`
  ).join('');

  const modal = document.createElement('div');
  modal.id = 'spec-select-modal';
  modal.className = 'picker-overlay';
  modal.innerHTML = `
    <div class="picker-box">
      <div class="picker-header">
        <div>
          <h3 class="picker-title">Select Option</h3>
          <p class="picker-subtitle">${name}</p>
        </div>
        <button class="picker-close" onclick="document.getElementById('spec-select-modal').remove()">&times;</button>
      </div>
      <div class="spec-list">${optionsHtml}</div>
      <div class="picker-qty-row" id="spec-qty-row" style="display:none;">
        <label>Quantity:</label>
        <div class="picker-qty-control">
          <button class="picker-qty-btn" onclick="adjustSpecQty(-1)">-</button>
          <input type="number" class="picker-qty-input" id="spec-qty" value="1" min="1" />
          <button class="picker-qty-btn" onclick="adjustSpecQty(1)">+</button>
        </div>
        <button class="picker-add-btn" id="spec-add-btn" onclick="confirmSpecAdd()">Add to Cart</button>
      </div>
    </div>`;
  document.body.appendChild(modal);

  modal.querySelectorAll('.spec-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      modal.querySelectorAll('.spec-btn').forEach(b => { b.style.background=''; b.style.color=''; });
      btn.style.background = '#f97316';
      btn.style.color = 'white';
      modal.setAttribute('data-selected-spec', btn.dataset.spec);
      modal.setAttribute('data-selected-price', btn.dataset.price);
      modal.setAttribute('data-selected-max', btn.dataset.max);
      modal.setAttribute('data-selected-name', btn.dataset.name);
      modal.setAttribute('data-selected-pid', btn.dataset.pid);
      modal.setAttribute('data-selected-image', btn.dataset.image);
      modal.setAttribute('data-selected-unit', btn.dataset.unit);

      const qtyInput = document.getElementById('spec-qty');
      qtyInput.value = 1;
      qtyInput.max = btn.dataset.max;
      document.getElementById('spec-qty-row').style.display = 'flex';
    });
  });
}

function adjustSpecQty(delta) {
  const input = document.getElementById('spec-qty');
  if (!input) return;
  const max = parseInt(input.max) || 9999;
  input.value = Math.max(1, Math.min(max, parseInt(input.value || 1) + delta));
}

function confirmSpecAdd() {
  const modal = document.getElementById('spec-select-modal');
  if (!modal) return;
  const qty   = parseInt(document.getElementById('spec-qty').value) || 1;
  const price = parseFloat(modal.getAttribute('data-selected-price'));
  const max   = parseInt(modal.getAttribute('data-selected-max'));
  const name  = modal.getAttribute('data-selected-name');
  const spec  = decodeURIComponent(modal.getAttribute('data-selected-spec'));
  const pid   = modal.getAttribute('data-selected-pid') || null;
  const image = modal.getAttribute('data-selected-image');
  const unit  = modal.getAttribute('data-selected-unit');

  modal.remove();
  addToCartWithQty(name, price, max, image, unit, spec, pid ? parseInt(pid) : null, qty);
}

function selectSpec(encodedName, price, maxStock, image, unit, encodedSpec, productId = null) {
  document.getElementById('spec-select-modal')?.remove();
  addToCart(encodedName, price, maxStock, image, unit, decodeURIComponent(encodedSpec), productId);
}

function addToCart(encodedName, price, maxStock, image, unit, selectedSpec, productId = null) {
  addToCartWithQty(encodedName, price, maxStock, image, unit, selectedSpec, productId, 1);
}

function addToCartWithQty(encodedName, price, maxStock, image, unit, selectedSpec, productId, qty) {
  const name = decodeURIComponent(encodedName);
  const cartKey = selectedSpec ? `${name} [${selectedSpec}]` : name;
  const existing = cart.find(i => i.cartKey === cartKey);
  if (existing) {
    const newQty = existing.qty + qty;
    if (newQty <= maxStock) existing.qty = newQty;
    else alert(`Cannot add more. Only ${maxStock} ${unit || 'pcs'} in stock.`);
  } else {
    if (maxStock > 0 && qty <= maxStock) {
      cart.push({ cartKey, name, selectedSpec, price, qty, maxStock, image, unit: unit || 'pcs', product_id: productId ?? null });
    } else if (maxStock <= 0) {
      alert('Out of stock!');
    } else {
      alert(`Only ${maxStock} ${unit || 'pcs'} available.`);
    }
  }
  updateCartUI();
}

function updateQty(index, change) {
  const item = cart[index];
  const newQty = item.qty + change;
  if (newQty > 0 && newQty <= item.maxStock) item.qty = newQty;
  else if (newQty > item.maxStock) alert(`Cannot add more. Only ${item.maxStock} ${item.unit || 'pcs'} in stock.`);
  else if (newQty === 0) { removeFromCart(index); return; }
  updateCartUI();
}

function setQty(index, value) {
  const item = cart[index];
  const qty  = parseInt(value);
  if (isNaN(qty) || qty < 1) {
    removeFromCart(index);
    return;
  }
  if (qty > item.maxStock) {
    alert(`Only ${item.maxStock} ${item.unit || 'pcs'} available in stock.`);
    item.qty = item.maxStock;
  } else {
    item.qty = qty;
  }
  updateCartUI();
}

function removeFromCart(index) {
  cart.splice(index, 1);
  updateCartUI();
}

function updateCartUI() {
  if (cart.length === 0) {
    cartContainer.innerHTML = '';
    cartContainer.appendChild(emptyCartMsg);
    emptyCartMsg.style.display = 'flex';
    checkoutBtn.disabled = true;
    clearCartBtn.style.display = 'none';
    // Reset totals to zero
    subtotalEl.innerText = formatMoney(0);
    taxEl.innerText      = formatMoney(0);
    totalEl.innerText    = formatMoney(0);
    if (btnTotalValEl) btnTotalValEl.innerText = '0.00';
  } else {
    emptyCartMsg.style.display = 'none';
    clearCartBtn.style.display = 'block';
    let html = '';
    let subtotal = 0;
    cart.forEach((item, index) => {
      const itemTotal = item.price * item.qty;
      subtotal += itemTotal;
      const specLabel = item.selectedSpec ? `<div class="item-spec" style="font-size:0.75rem;color:#64748b;">Option: ${item.selectedSpec}</div>` : '';
      html += `
      <div class="cart-item">
        <img src="${item.image}" alt="${item.name}" class="item-img" onerror="this.src='Icons/download (1).png'">
        <div class="item-details">
          <div class="item-header">
            <span class="item-name">${item.cartKey}</span>
            <button class="item-remove" onclick="removeFromCart(${index})">&times;</button>
          </div>
          ${specLabel}
          <div class="item-price">${formatMoney(item.price)} / ${item.unit || 'pcs'}</div>
          <div class="item-actions">
            <div class="qty-control">
              <button class="qty-btn" onclick="updateQty(${index}, -1)">-</button>
              <input type="number" class="qty-input" value="${item.qty}" min="1" max="${item.maxStock}"
                onchange="setQty(${index}, this.value)" onclick="this.select()">
              <button class="qty-btn" onclick="updateQty(${index}, 1)">+</button>
            </div>
            <div class="item-total">${formatMoney(itemTotal)}</div>
          </div>
        </div>
      </div>`;
    });
    cartContainer.innerHTML = html;
    const total = subtotal;
    subtotalEl.innerText = formatMoney(subtotal);
    taxEl.innerText = formatMoney(0);
    totalEl.innerText = formatMoney(total);
    btnTotalValEl.innerText = total.toFixed(2);
    checkoutBtn.disabled = false;
  }
}

function getCartTotal() {
  return cart.reduce((sum, item) => sum + item.price * item.qty, 0);
}

// --- MODALS ------------------------------------------------------------------
function openModal(id) { document.getElementById(id).classList.add('active'); }
function closeModal(id) {
  document.getElementById(id).classList.remove('active');
  if (id === 'payment-modal') {
    tenderedInput.value = '';
    paymentChange.innerText = '₱0.00';
    confirmPaymentBtn.disabled = true;
    // Clear customer fields
    const nameEl = document.getElementById('walkin-name');
    const phoneEl = document.getElementById('walkin-phone');
    const addrEl  = document.getElementById('walkin-address');
    if (nameEl)  nameEl.value  = '';
    if (phoneEl) phoneEl.value = '';
    if (addrEl)  addrEl.value  = '';
  }
}

function openPaymentModal() {
  const total = getCartTotal();
  paymentTotalDue.innerText = formatMoney(total);
  tenderedInput.value = '';
  generateQuickCashOptions(total);
  openModal('payment-modal');
  setTimeout(() => tenderedInput.focus(), 100);
}

function generateQuickCashOptions(total) {
  quickCashContainer.innerHTML = '';
  let html = `<button class="cash-btn" onclick="setTenderedAmount(${total})">Exact: ${formatMoney(total)}</button>`;
  [100, 200, 500, 1000].forEach(bill => {
    if (bill > total && bill - total <= bill)
      html += `<button class="cash-btn" onclick="setTenderedAmount(${bill})">${formatMoney(bill)}</button>`;
  });
  const round100 = Math.ceil(total / 100) * 100;
  if (round100 > total && ![100, 200, 500, 1000].includes(round100))
    html += `<button class="cash-btn" onclick="setTenderedAmount(${round100})">${formatMoney(round100)}</button>`;
  quickCashContainer.innerHTML = html;
}

function setTenderedAmount(amount) { tenderedInput.value = amount; calculateChange(); }

function calculateChange() {
  const total = getCartTotal();
  const tendered = parseFloat(tenderedInput.value) || 0;
  const change = tendered - total;
  if (change >= 0) {
    paymentChange.innerText = formatMoney(change);
    paymentChange.style.color = 'var(--success)';
    confirmPaymentBtn.disabled = false;
  } else {
    paymentChange.innerText = `Need ${formatMoney(Math.abs(change))} more`;
    paymentChange.style.color = 'var(--accent)';
    confirmPaymentBtn.disabled = true;
  }
}

// --- COMPLETE TRANSACTION (saves to Flask API) --------------------------------
async function completeTransaction() {
  const total = getCartTotal();
  const tendered = parseFloat(tenderedInput.value);
  const change = tendered - total;

  const txnId = 'TXN-' + Math.floor(Date.now() / 1000);
  let serverOrderRef = null; // will hold the real ORD-XXXXX from the API

  // Check if this is completing an existing reservation
  const isCompletingReservation = currentLoadedReservation !== null;
  const existingOrderRef = currentLoadedReservation;

  // Save to API
  try {
    if (isCompletingReservation) {
      // UPDATE existing reservation to completed + deduct stock
      console.log('[cashier] Completing existing reservation:', existingOrderRef);
      
      const apiRes = await fetch(`/api/orders/${existingOrderRef}/complete`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tendered,
          change,
          cashier_name: 'Cashier',
          cashier_role: 'cashier'
        })
      });
      
      console.log('[cashier] API Response status:', apiRes.status);
      console.log('[cashier] API Response ok:', apiRes.ok);
      
      const apiJson = await apiRes.json();
      console.log('[cashier] API Response body:', apiJson);
      
      if (apiJson.success) {
        serverOrderRef = existingOrderRef;
        currentLoadedReservation = null; // Clear after completion
        console.log('[cashier] ✅ Reservation completed successfully');
      } else {
        console.error('[cashier] ❌ API returned success=false:', apiJson.error);
        // Don't return - continue to show receipt anyway
      }
      
    } else {
      // CREATE new walk-in order (stock deducted immediately)
      console.log('[cashier] Creating new walk-in order');
      
      const apiRes = await fetch('/api/orders/index.php', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          customer_name: document.getElementById('walkin-name')?.value.trim() || 'Walk-in Customer',
          customer_phone: document.getElementById('walkin-phone')?.value.trim() || null,
          customer_address: document.getElementById('walkin-address')?.value.trim() || null,
          items: cart.map(i => ({
            name: i.cartKey,
            price: i.price,
            qty: i.qty,
            image: i.image,
            unit: i.unit || 'pcs',
            spec: i.selectedSpec || null,
            product_id: i.product_id ?? null
          })),
          total,
          tendered,
          change,
          actorName: 'Cashier',
          actorRole: 'cashier',
          order_type: 'walk-in',  // Explicitly mark as walk-in
          force_walk_in: true     // Override session user_id
        })
      });
      
      const apiJson = await apiRes.json();
      if (apiJson.success && apiJson.order?.order_ref) {
        serverOrderRef = apiJson.order.order_ref; // e.g. "ORD-12345"
      } else {
        console.warn('[cashier] API returned failure:', apiJson.error);
      }
    }
  } catch (err) {
    console.error('[cashier] Failed to save transaction:', err);
    // Don't show alert if order is completing - just log error
    // Continue to show receipt anyway
  }

  // Reduce local stock display -- match by base product name
  cart.forEach(item => {
    const product = products.find(p => p.name === item.name);
    if (product) product.stock = Math.max(0, product.stock - item.qty);
  });

  const txn = {
    id: txnId,
    orderRef: serverOrderRef,  // real ORD-XXXXX from DB (null if API failed)
    timestamp: new Date(),
    items: [...cart],
    total,
    tendered,
    change,
    customerName: document.getElementById('walkin-name')?.value.trim() || 'Walk-in Customer',
    customerPhone: document.getElementById('walkin-phone')?.value.trim() || null,
    customerAddress: document.getElementById('walkin-address')?.value.trim() || null,
    status: 'Completed'
  };

  todaysTransactions.unshift(txn);

  renderProducts(products);
  closeModal('payment-modal');
  generateReceipt(txn);
  cart = [];
  updateCartUI();
  updateHistoryTable();
}

// --- RECEIPT -----------------------------------------------------------------
function generateReceipt(txn) {
  const receiptEl = document.getElementById('receipt-content');
  let itemsHtml = '';
  txn.items.forEach(item => {
    const specNote = item.selectedSpec ? ` <em style="font-size:0.75rem;color:#64748b;">[${item.selectedSpec}]</em>` : '';
    const unitLabel = item.unit || 'pcs';
    itemsHtml += `
      <tr>
        <td class="col-qty">${item.qty} ${unitLabel}</td>
        <td class="col-name">${item.name}${specNote}</td>
        <td class="col-price">${formatMoney(item.price * item.qty)}</td>
      </tr>`;
  });
  receiptEl.innerHTML = `
    <div class="receipt-header">
      <h3>JMC Materials Hardware</h3>
      <div>421 Purok 2, Muntinlupa, Manila</div>
      <div>Tel: +63 9683743025</div>
      <div style="margin-top: 8px;">Order ID: ${txn.orderRef || txn.id}</div>
      <div>Date: ${txn.timestamp.toLocaleString()}</div>
      <div style="margin-top:6px; font-weight:600;">Customer: ${txn.customerName}</div>
      ${txn.customerPhone ? `<div>Contact: ${txn.customerPhone}</div>` : ''}
      ${txn.customerAddress ? `<div>Address: ${txn.customerAddress}</div>` : ''}
    </div>
    <div class="receipt-items"><table>${itemsHtml}</table></div>
    <div class="receipt-totals">
      <div class="receipt-row bold"><span>TOTAL DUE</span><span>${formatMoney(txn.total)}</span></div>
      <div class="receipt-row" style="margin-top: 12px;"><span>CASH TENDERED</span><span>${formatMoney(txn.tendered)}</span></div>
      <div class="receipt-row"><span>CHANGE</span><span>${formatMoney(txn.change)}</span></div>
    </div>
    <div class="receipt-footer">
      <div>*** THANK YOU FOR YOUR BUSINESS ***</div>
      <div>Please keep this receipt for returns.</div>
    </div>
  `;
  const scheduleBtn = document.getElementById('open-delivery-modal-btn');
  if (scheduleBtn) scheduleBtn.setAttribute('data-txn-id', txn.id);
  openModal('receipt-modal');
}

// --- TRANSACTION HISTORY -----------------------------------------------------
async function loadTransactions() { 
  // Load today's transactions from API
  const tbody = document.getElementById('history-table-body');
  const emptyMsg = document.getElementById('empty-history-msg');
  
  if (tbody) tbody.innerHTML = '<tr><td colspan="6" style="text-align:center; padding:20px; color:#64748b;">Loading...</td></tr>';
  if (emptyMsg) emptyMsg.style.display = 'none';
  
  try {
    const res = await fetch('/api/orders', { credentials: 'include' });
    const json = await res.json();
    
    if (json.success && json.data) {
      const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
      
      // Filter for today's walk-in orders (completed)
      const todayOrders = json.data.filter(order => {
        const orderDate = order.date || order.created_at?.split(' ')[0] || order.created_at?.split('T')[0];
        return orderDate === today && 
               order.order_type === 'walk-in' && 
               order.status === 'completed';
      });
      
      // Update the local array for receipt reprinting
      todaysTransactions = todayOrders.map(order => ({
        id: order.order_ref,
        orderRef: order.order_ref,
        timestamp: new Date(order.created_at || order.date),
        items: order.items || [],
        total: order.total,
        tendered: order.tendered || order.total,
        change: order.change || 0,
        customerName: order.customer_name || 'Walk-in Customer',
        customerPhone: order.customer_phone,
        customerAddress: order.customer_address,
        status: 'Completed'
      }));
      
      updateHistoryTable();
    } else {
      if (tbody) tbody.innerHTML = '';
      if (emptyMsg) emptyMsg.style.display = 'block';
    }
  } catch(err) {
    console.error('[cashier] Failed to load transactions:', err);
    if (tbody) tbody.innerHTML = '<tr><td colspan="6" style="text-align:center; padding:20px; color:#dc2626;">Failed to load transactions</td></tr>';
  }
}

function updateHistoryTable() {
  const tbody = document.getElementById('history-table-body');
  const emptyMsg = document.getElementById('empty-history-msg');
  if (!tbody || !emptyMsg) return;
  
  if (todaysTransactions.length === 0) {
    tbody.innerHTML = '';
    emptyMsg.style.display = 'block';
    return;
  }
  emptyMsg.style.display = 'none';
  let html = '';
  todaysTransactions.forEach(txn => {
    const time = txn.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    const itemCount = txn.items.reduce((sum, i) => sum + (i.qty || 1), 0);
    html += `
      <tr>
        <td>${time}</td>
        <td>${txn.id}</td>
        <td>${itemCount} items</td>
        <td style="font-weight: 600;">${formatMoney(txn.total)}</td>
        <td><span class="status-badge">Paid</span></td>
        <td><button class="view-receipt-btn" onclick="reprintReceipt('${txn.id}')">Receipt</button></td>
      </tr>`;
  });
  tbody.innerHTML = html;
}

function reprintReceipt(txnId) {
  const txn = todaysTransactions.find(t => t.id === txnId);
  if (txn) { closeModal('history-modal'); generateReceipt(txn); }
}

// --- STARTUP -----------------------------------------------------------------
document.addEventListener('DOMContentLoaded', () => {
  // Assign DOM elements now that the DOM is ready
  productGrid      = document.getElementById('pos-product-grid');
  searchInput      = document.getElementById('product-search');
  cartContainer    = document.getElementById('cart-container');
  emptyCartMsg     = document.getElementById('empty-cart-msg');
  subtotalEl       = document.getElementById('summary-subtotal');
  taxEl            = document.getElementById('summary-tax');
  totalEl          = document.getElementById('summary-total');
  btnTotalValEl    = document.getElementById('btn-total-val');
  checkoutBtn      = document.getElementById('checkout-btn');
  clearCartBtn     = document.getElementById('clear-cart-btn');
  paymentTotalDue  = document.getElementById('payment-total-due');
  tenderedInput    = document.getElementById('tendered-amount');
  paymentChange    = document.getElementById('payment-change');
  confirmPaymentBtn= document.getElementById('confirm-payment-btn');
  quickCashContainer = document.getElementById('quick-cash-container');

  // --- LOGOUT BUTTON ----------------------------------------------------------
  document.getElementById('cashier-logout-btn')?.addEventListener('click', async (e) => {
    e.preventDefault();
    await fetch('/api/auth/logout', { method: 'POST' });
    window.location.href = 'login.html';
  });

  initPOS();

  // Delivery scheduling
  const scheduleDeliveryBtn = document.getElementById('open-delivery-modal-btn');
  const deliveryForm = document.getElementById('delivery-form');
  const submitDeliveryBtn = document.getElementById('submit-delivery-btn');

  if (scheduleDeliveryBtn) {
    scheduleDeliveryBtn.addEventListener('click', (e) => {
      const txnId = e.target.getAttribute('data-txn-id');
      if (!txnId) return;
      closeModal('receipt-modal');
      if (deliveryForm) deliveryForm.reset();
      deliveryForm.setAttribute('data-txn-id', txnId);
      // Pre-fill customer details from transaction
      const txn = todaysTransactions.find(t => t.id === txnId);
      if (txn) {
        const nameEl = document.getElementById('del-customer-name');
        const phoneEl = document.getElementById('del-contact');
        const addrEl  = document.getElementById('del-address');
        if (nameEl && txn.customerName && txn.customerName !== 'Walk-in Customer')
          nameEl.value = txn.customerName;
        if (phoneEl && txn.customerPhone) phoneEl.value = txn.customerPhone;
        if (addrEl  && txn.customerAddress) addrEl.value  = txn.customerAddress;
      }
      openModal('delivery-modal');
    });
  }

  if (deliveryForm) {
    deliveryForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      submitDeliveryBtn.disabled = true;
      submitDeliveryBtn.innerText = "Creating...";

      const txnId = deliveryForm.getAttribute('data-txn-id');
      const txn = todaysTransactions.find(t => t.id === txnId);
      if (!txn) {
        alert("Transaction not found.");
        submitDeliveryBtn.disabled = false;
        return;
      }

      const deliveryData = {
        orderId: txn.orderRef || txn.id,  // use real ORD-XXXXX if available, fallback to TXN id
        customerName: document.getElementById('del-customer-name').value,
        contactNumber: document.getElementById('del-contact').value,
        address: document.getElementById('del-address').value,
        plateNumber: document.getElementById('del-plate-number')?.value?.trim() || '',
        items: txn.items.map(i => ({ name: i.cartKey || i.name, qty: i.qty, unit: i.unit || 'pcs' })),
        totalAmount: txn.total
      };

      try {
        const response = await DeliveriesAPI.createDelivery(deliveryData);
        if (response.success) {
          alert('Delivery successfully scheduled!');
          closeModal('delivery-modal');
        } else {
          alert('Failed to schedule delivery.');
        }
      } catch (err) {
        alert('An error occurred while scheduling delivery.');
      } finally {
        submitDeliveryBtn.disabled = false;
        submitDeliveryBtn.innerText = "Submit Delivery";
      }
    });
  }
});

// --- RETURNS -----------------------------------------------------------------
let returnRowCount = 1;

function addReturnRow() {
  const tbody = document.getElementById('return-items-body');
  const idx = returnRowCount++;
  const tr = document.createElement('tr');
  tr.id = `return-item-row-${idx}`;
  tr.innerHTML = `
    <td style="padding:6px; border:1px solid #e2e8f0;">
      <input type="text" class="ret-item-name" placeholder="Product name" required
        style="width:100%; padding:6px; border:1px solid #ccc; border-radius:4px;">
    </td>
    <td style="padding:6px; border:1px solid #e2e8f0;">
      <input type="number" class="ret-item-qty" min="1" value="1" required
        style="width:100%; padding:6px; border:1px solid #ccc; border-radius:4px; text-align:center;">
    </td>
    <td style="padding:6px; border:1px solid #e2e8f0;">
      <input type="number" class="ret-item-price" min="0" step="0.01" placeholder="0.00"
        style="width:100%; padding:6px; border:1px solid #ccc; border-radius:4px; text-align:right;">
    </td>
    <td style="padding:6px; border:1px solid #e2e8f0; text-align:center;">
      <button type="button" onclick="removeReturnRow(${idx})"
        style="background:none; border:none; color:#ef4444; font-size:1.1rem; cursor:pointer;"></button>
    </td>`;
  tbody.appendChild(tr);
  updateReturnTotal();
}

function removeReturnRow(idx) {
  const row = document.getElementById(`return-item-row-${idx}`);
  if (row) row.remove();
  updateReturnTotal();
}

function updateReturnTotal() {
  const names = document.querySelectorAll('#return-items-body .ret-item-name');
  if (names.length === 0) {
    document.getElementById('return-total-display').style.display = 'none';
    return;
  }
  let total = 0;
  document.querySelectorAll('#return-items-body tr').forEach(row => {
    const qty = parseFloat(row.querySelector('.ret-item-qty')?.value) || 0;
    const price = parseFloat(row.querySelector('.ret-item-price')?.value) || 0;
    total += qty * price;
  });
  const display = document.getElementById('return-total-display');
  document.getElementById('return-total-val').innerText = formatMoney(total);
  display.style.display = total > 0 ? 'block' : 'none';
}

// Wire up live total recalculation
document.addEventListener('input', (e) => {
  if (e.target.classList.contains('ret-item-qty') || e.target.classList.contains('ret-item-price')) {
    updateReturnTotal();
  }
});

// ─── Return Order Lookup ───────────────────────────────────────────────────────
window.lookupReturnOrder = async function() {
  const ref     = document.getElementById('ret-txn-ref').value.trim();
  const btn     = document.getElementById('ret-lookup-btn');
  const msg     = document.getElementById('ret-lookup-msg');

  if (!ref) { msg.textContent = 'Please enter an order reference.'; msg.style.color = '#dc2626'; msg.style.display = 'block'; return; }

  btn.disabled    = true;
  btn.textContent = '…';
  msg.style.display = 'none';

  try {
    // Try admin orders endpoint first
    const res2  = await fetch('/api/orders', { credentials: 'include' });
    const json2 = await res2.json();
    const order = (json2.data || []).find(o => o.order_ref === ref);

    if (!order) {
      msg.textContent = `Order "${ref}" not found.`;
      msg.style.color = '#dc2626';
      msg.style.display = 'block';
      btn.disabled = false; btn.textContent = 'Look up';
      return;
    }

    // Only allow delivered or completed orders for returns
    if (!['delivered', 'completed'].includes(order.status)) {
      msg.textContent = `Order "${ref}" is ${order.status} — only delivered or completed orders can be returned.`;
      msg.style.color = '#dc2626';
      msg.style.display = 'block';
      btn.disabled = false; btn.textContent = 'Look up';
      return;
    }

    fillReturnFromOrder(order);
    msg.textContent = `Order found — ${order.customer_name || ''} · ${order.date || ''}`;
    msg.style.color = '#16a34a';
    msg.style.display = 'block';
  } catch (e) {
    msg.textContent = 'Failed to look up order.';
    msg.style.color = '#dc2626';
    msg.style.display = 'block';
  } finally {
    btn.disabled = false;
    btn.textContent = 'Look up';
  }
};

function fillReturnFromOrder(order) {
  // Auto-fill customer
  const custInput = document.getElementById('ret-customer');
  if (custInput && order.customer_name) custInput.value = order.customer_name;

  // Auto-fill date purchased
  const datePurch = document.getElementById('ret-date-purchased');
  if (datePurch && order.date) datePurch.value = order.date;

  // Auto-fill date returned to today
  const dateRet = document.getElementById('ret-date-returned');
  if (dateRet && !dateRet.value) dateRet.value = new Date().toISOString().split('T')[0];

  // Pre-populate items table
  const tbody = document.getElementById('return-items-body');
  if (!tbody || !Array.isArray(order.items) || order.items.length === 0) return;

  tbody.innerHTML = '';
  returnRowCount = 0;
  order.items.forEach(item => {
    const idx = returnRowCount++;
    const tr  = document.createElement('tr');
    tr.id = `return-item-row-${idx}`;
    tr.innerHTML = `
      <td style="padding:6px; border:1px solid #e2e8f0;">
        <input type="text" class="ret-item-name form-input-sm" value="${item.name || ''}" required
          style="width:100%; padding:6px; border:1px solid #ccc; border-radius:4px;">
      </td>
      <td style="padding:6px; border:1px solid #e2e8f0;">
        <input type="number" class="ret-item-qty form-input-sm text-center" min="1" value="${item.qty || 1}" required
          style="width:100%; padding:6px; border:1px solid #ccc; border-radius:4px; text-align:center;">
      </td>
      <td style="padding:6px; border:1px solid #e2e8f0;">
        <input type="number" class="ret-item-price form-input-sm text-right" min="0" step="0.01" value="${item.price || ''}"
          style="width:100%; padding:6px; border:1px solid #ccc; border-radius:4px; text-align:right;">
      </td>
      <td style="padding:6px; border:1px solid #e2e8f0; text-align:center;">
        <button type="button" class="ret-remove-btn" onclick="removeReturnRow(${idx})">×</button>
      </td>`;
    tbody.appendChild(tr);
  });
  updateReturnTotal();
}

document.addEventListener('DOMContentLoaded', () => {
  const returnForm = document.getElementById('return-form');
  if (returnForm) {
    returnForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const submitBtn = document.getElementById('submit-return-btn');
      const feedback = document.getElementById('return-feedback');
      submitBtn.disabled = true;
      submitBtn.innerText = 'Submitting';

      const txnRef = document.getElementById('ret-txn-ref').value.trim();
      const customer = document.getElementById('ret-customer').value.trim() || 'Walk-in Customer';
      const reason = document.getElementById('ret-reason').value.trim();
      const datePurchased = document.getElementById('ret-date-purchased').value;
      const dateReturned = document.getElementById('ret-date-returned').value || new Date().toISOString().split('T')[0];

      // Collect return items
      const items = [];
      document.querySelectorAll('#return-items-body tr').forEach(row => {
        const name = row.querySelector('.ret-item-name')?.value.trim();
        const qty = parseInt(row.querySelector('.ret-item-qty')?.value) || 0;
        const price = parseFloat(row.querySelector('.ret-item-price')?.value) || 0;
        if (name && qty > 0) items.push({ name, qty, price });
      });

      if (items.length === 0) {
        feedback.innerText = 'Please add at least one return item.';
        feedback.style.backgroundColor = '#fee2e2';
        feedback.style.color = '#991b1b';
        feedback.style.display = 'block';
        submitBtn.disabled = false;
        submitBtn.innerText = 'Submit Return';
        return;
      }

      try {
        const res = await fetch('/api/returns/index.php', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            originalTxnRef: txnRef,
            customerName: customer,
            reason,
            datePurchased,
            dateReturned,
            items,
            handledBy: 'Cashier',
            handlerRole: 'cashier'
          })
        });
        const json = await res.json();
        console.log('Return API Response:', json); // Debug log
        
        if (json.success) {
          const returnRef = json.data?.return_ref || json.return_ref || 'Unknown';
          feedback.innerText = `Return ${returnRef} submitted and pending staff approval.`;
          feedback.style.backgroundColor = '#d1fae5';
          feedback.style.color = '#065f46';
          feedback.style.display = 'block';
          returnForm.reset();
          document.getElementById('return-items-body').innerHTML = `
            <tr id="return-item-row-0">
              <td style="padding:6px; border:1px solid #e2e8f0;"><input type="text" class="ret-item-name" placeholder="Product name" required style="width:100%; padding:6px; border:1px solid #ccc; border-radius:4px;"></td>
              <td style="padding:6px; border:1px solid #e2e8f0;"><input type="number" class="ret-item-qty" min="1" value="1" required style="width:100%; padding:6px; border:1px solid #ccc; border-radius:4px; text-align:center;"></td>
              <td style="padding:6px; border:1px solid #e2e8f0;"><input type="number" class="ret-item-price" min="0" step="0.01" placeholder="0.00" style="width:100%; padding:6px; border:1px solid #ccc; border-radius:4px; text-align:right;"></td>
              <td style="padding:6px; border:1px solid #e2e8f0; text-align:center;"><button type="button" onclick="removeReturnRow(0)" style="background:none; border:none; color:#ef4444; font-size:1.1rem; cursor:pointer;"></button></td>
            </tr>`;
          returnRowCount = 1;
          document.getElementById('return-total-display').style.display = 'none';
          setTimeout(() => closeModal('return-modal'), 1800);
        } else {
          feedback.innerText = json.message || 'Failed to submit return.';
          feedback.style.backgroundColor = '#fee2e2';
          feedback.style.color = '#991b1b';
          feedback.style.display = 'block';
        }
      } catch (err) {
        feedback.innerText = 'Network error. Please try again.';
        feedback.style.backgroundColor = '#fee2e2';
        feedback.style.color = '#991b1b';
        feedback.style.display = 'block';
      } finally {
        submitBtn.disabled = false;
        submitBtn.innerText = 'Submit Return';
      }
    });
  }
});

// ── Load Reservation functions are defined in cashier.html inline script ──────
