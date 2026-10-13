function renderProductGrid() {
  const productGrid = document.querySelector('.js-product-grid');
  const saleGrid = document.querySelector('.js-sale-grid');
  const saleSection = document.getElementById('sale-section');

  let bestSellingHtml = '';
  let saleHtml = '';

  // Use best-selling products from API (based on order count)
  const productsToDisplay = window._bestSelling && window._bestSelling.length > 0 
    ? window._bestSelling 
    : products.slice(0, 10);

  productsToDisplay.forEach((product, idx) => {
    const discount = product.discount || 0;
    const discountedPrice = (product.price * (1 - discount / 100)).toFixed(2);

    let priceHtml = '';
    if (discount > 0) {
      priceHtml = `<p class="price">
        <span class="discount-badge">-${discount}%</span>
        <span class="original-price">₱${parseFloat(product.price).toFixed(2)}</span>
        <span class="discounted-price">₱${discountedPrice}</span>
      </p>`;
    } else {
      priceHtml = `<p class="price">₱${parseFloat(product.price).toFixed(2)}</p>`;
    }

    bestSellingHtml += `
    <div class="product-card pq-trigger" data-idx="${idx}" style="cursor:pointer;">
      <div class="product-card-img-wrap">
        <img src="${product.image}" onerror="this.src='img/concrete-hollow-block-300x300.jpg'" alt="${product.name}" />
      </div>
      <div class="product-card-body">
        <h4 class="product-card-name">${product.name}</h4>
        ${priceHtml}
        <button class="add-to-cart-btn">Add to Cart</button>
      </div>
    </div>`;
  });

  if (productGrid) {
    productGrid.innerHTML = bestSellingHtml;
    productGrid.querySelectorAll('.pq-trigger').forEach(card => {
      card.addEventListener('click', () => {
        const idx = parseInt(card.dataset.idx);
        const product = productsToDisplay[idx];
        if (product && typeof openProductModal === 'function') openProductModal(product);
      });
    });
    wrapCarousel(productGrid);
  }

  // Sale Items -- only products with a discount
  const saleProducts = products.filter(p => (p.discount || 0) > 0).slice(0, 15);

  if (saleProducts.length > 0 && saleGrid && saleSection) {
    saleSection.style.display = 'block';

    saleProducts.forEach((product, idx) => {
      const discountedPrice = (product.price * (1 - product.discount / 100)).toFixed(2);
      saleHtml += `
      <div class="product-card pq-trigger" data-idx="${idx}" style="cursor:pointer;">
        <div class="product-card-img-wrap">
          <img src="${product.image}" onerror="this.src='img/concrete-hollow-block-300x300.jpg'" alt="${product.name}" />
        </div>
        <div class="product-card-body">
          <h4 class="product-card-name">${product.name}</h4>
          <p class="price">
            <span class="discount-badge">-${product.discount}%</span>
            <span class="original-price">₱${parseFloat(product.price).toFixed(2)}</span>
            <span class="discounted-price">₱${discountedPrice}</span>
          </p>
          <button class="add-to-cart-btn sale-btn">Add to Cart</button>
        </div>
      </div>`;
    });

    saleGrid.innerHTML = saleHtml;
    saleGrid.querySelectorAll('.pq-trigger').forEach(card => {
      card.addEventListener('click', () => {
        const product = saleProducts[parseInt(card.dataset.idx)];
        if (product && typeof openProductModal === 'function') openProductModal(product);
      });
    });
    wrapCarousel(saleGrid);
  }

  // New Arrivals -- last 8 products added (sorted by id descending)
  const newArrivalsGrid = document.querySelector('.js-new-arrivals-grid');
  if (newArrivalsGrid) {
    const newProducts = [...products].sort((a, b) => b.id - a.id).slice(0, 10);
    let newHtml = '';
    newProducts.forEach((product, idx) => {
      const discount = product.discount || 0;
      const discountedPrice = (product.price * (1 - discount / 100)).toFixed(2);
      let priceHtml = '';
      if (discount > 0) {
        priceHtml = `<p class="price">
          <span class="discount-badge">-${discount}%</span>
          <span class="original-price">₱${parseFloat(product.price).toFixed(2)}</span>
          <span class="discounted-price">₱${discountedPrice}</span>
        </p>`;
      } else {
        priceHtml = `<p class="price">₱${parseFloat(product.price).toFixed(2)}</p>`;
      }
      newHtml += `
      <div class="product-card pq-trigger" data-idx="${idx}" style="cursor:pointer;">
        <div class="product-card-img-wrap">
          <img src="${product.image}" onerror="this.src='img/concrete-hollow-block-300x300.jpg'" alt="${product.name}" />
        </div>
        <div class="product-card-body">
          <h4 class="product-card-name">${product.name}</h4>
          ${priceHtml}
          <button class="add-to-cart-btn">Add to Cart</button>
        </div>
      </div>`;
    });
    newArrivalsGrid.innerHTML = newHtml;
    newArrivalsGrid.querySelectorAll('.pq-trigger').forEach(card => {
      card.addEventListener('click', () => {
        const product = newProducts[parseInt(card.dataset.idx)];
        if (product && typeof openProductModal === 'function') openProductModal(product);
      });
    });
    wrapCarousel(newArrivalsGrid);
  }
}

// ── Carousel wrapper: adds prev/next arrows on mobile only ──
function wrapCarousel(grid) {
  if (window.innerWidth > 600) return;

  const parent = grid.parentNode;
  // Avoid double-wrapping
  if (parent.classList.contains('carousel-wrapper')) return;

  const wrapper = document.createElement('div');
  wrapper.className = 'carousel-wrapper';

  const prevBtn = document.createElement('button');
  prevBtn.className = 'carousel-btn prev';
  prevBtn.innerHTML = '&#10094;';

  const nextBtn = document.createElement('button');
  nextBtn.className = 'carousel-btn next';
  nextBtn.innerHTML = '&#10095;';

  parent.insertBefore(wrapper, grid);
  wrapper.appendChild(prevBtn);
  wrapper.appendChild(grid);
  wrapper.appendChild(nextBtn);

  const cardWidth = () => {
    const card = grid.querySelector('.product-card');
    return card ? card.offsetWidth + 12 : 160;
  };

  prevBtn.addEventListener('click', () => {
    grid.scrollBy({ left: -cardWidth() * 2, behavior: 'smooth' });
  });
  nextBtn.addEventListener('click', () => {
    grid.scrollBy({ left: cardWidth() * 2, behavior: 'smooth' });
  });
}

document.addEventListener('productsLoaded', renderProductGrid);
if (typeof products !== 'undefined' && products.length > 0) renderProductGrid();
