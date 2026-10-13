let allProducts = [];
let activeCategory = 'all';

// Load categories from API and build the nav
async function loadCategories() {
  const catMenu = document.querySelector('.category-menu');
  if (!catMenu) return;

  // Check URL param first  e.g. shop.html?category=Electrical
  const urlParam = new URLSearchParams(window.location.search).get('category');
  if (urlParam) activeCategory = urlParam;

  try {
    const res = await fetch('/api/categories');
    const json = await res.json();
    if (!json.success) return;

    json.data.forEach(cat => {
      const a = document.createElement('a');
      a.href = `shop.html?category=${encodeURIComponent(cat.name)}`;
      a.classList.add('cat-filter');
      a.dataset.category = cat.name;
      a.textContent = cat.name;
      // Highlight if it matches active
      if (cat.name === activeCategory) a.classList.add('active');
      catMenu.appendChild(a);
    });

  } catch (e) {
    console.error('Failed to load categories', e);
  }

  // Highlight "All" if no category selected
  const allLink = document.querySelector('.cat-filter[data-category="all"]');
  if (allLink) {
    if (activeCategory === 'all') allLink.classList.add('active');
    else allLink.classList.remove('active');
  }

  // On shop.html  clicking filters without page reload
  if (window.location.pathname.includes('shop.html')) {
    document.querySelectorAll('.cat-filter').forEach(link => {
      link.addEventListener('click', (e) => {
        e.preventDefault();
        document.querySelectorAll('.cat-filter').forEach(l => l.classList.remove('active'));
        link.classList.add('active');
        activeCategory = link.dataset.category || 'all';
        history.replaceState(null, '', activeCategory === 'all'
          ? 'shop.html'
          : `shop.html?category=${encodeURIComponent(activeCategory)}`
        );
        renderShop();
      });
    });
  }

  // After categories and activeCategory are set, render products
  if (allProducts.length > 0) renderShop();
}

function renderShop() {
  // Filter by category AND exclude bulk_only products
  let filtered = activeCategory === 'all'
    ? allProducts
    : allProducts.filter(p => p.category === activeCategory);
  
  // IMPORTANT: Exclude products that are bulk_only (they can only be ordered through bulk orders)
  filtered = filtered.filter(p => {
    const availType = p.availability_type || 'both';
    return availType !== 'bulk_only';
  });

  const shopGrid = document.querySelector('.js-shop-grid');
  if (!shopGrid) return;

  if (filtered.length === 0) {
    shopGrid.innerHTML = `<p style="text-align:center; color:#94a3b8; padding:40px 0; grid-column:1/-1;">No products found in this category.</p>`;
    return;
  }

  let html = '';
  filtered.forEach((product, idx) => {
    const hasSpecs = Array.isArray(product.specifications) && product.specifications.length > 0;
    const specsBadge = hasSpecs
      ? `<span class="specs-badge">${product.specifications.length} size${product.specifications.length > 1 ? 's' : ''} available</span>`
      : '';
    const discount = product.discount || 0;
    const discountedPrice = discount > 0 ? product.price * (1 - discount / 100) : product.price;
    const priceLine = discount > 0
      ? `<p class="price">
           <span class="discount-badge">-${discount}%</span>
           <span class="original-price" style="text-decoration:line-through;color:#94a3b8;font-size:0.85em;margin-right:4px;">₱${parseFloat(product.price).toFixed(2)}</span>
           <span style="color:#dc2626;font-weight:700;">₱${discountedPrice.toFixed(2)}</span>
         </p>`
      : `<p class="price">₱${parseFloat(product.price).toFixed(2)}</p>`;
    html += `
    <div class="shop-card pq-trigger" data-product-idx="${idx}" style="cursor:pointer;">
      <img src="${product.image}" onerror="this.src='img/concrete-hollow-block-300x300.jpg'" />
      <h4>${product.name}</h4>
      ${specsBadge}
      ${priceLine}
      <button class="add-to-cart-btn" data-product-idx="${idx}">Add to Cart</button>
    </div>`;
  });

  shopGrid.innerHTML = html;

  // Clicking anywhere on the card (or the button) opens the quick-view modal
  shopGrid.querySelectorAll('.pq-trigger').forEach(card => {
    card.addEventListener('click', (e) => {
      const idx = parseInt(card.dataset.productIdx);
      const product = filtered[idx];
      if (product && typeof openProductModal === 'function') {
        openProductModal(product);
      }
    });
  });
}

function initShop() {
  allProducts = [...products];

  // Handle ?search= URL param from homepage search
  const searchParam = new URLSearchParams(window.location.search).get('search');
  if (searchParam) {
    const searchInput = document.querySelector('.search-input, .search, #product-search');
    if (searchInput) searchInput.value = searchParam;
    const q = searchParam.toLowerCase();
    allProducts = products.filter(p =>
      p.name.toLowerCase().includes(q) ||
      (p.category && p.category.toLowerCase().includes(q)) ||
      (p.unit && p.unit.toLowerCase().includes(q))
    );
  }

  // Filter out bulk_only products from shop (they should only appear in bulk orders)
  allProducts = allProducts.filter(p => {
    const availType = p.availability_type || 'both';
    return availType !== 'bulk_only';
  });

  renderShop();
}

// Run after products are loaded from API
document.addEventListener('productsLoaded', initShop);
// Fallback if already loaded
if (typeof products !== 'undefined' && products.length > 0) initShop();
