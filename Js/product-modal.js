/**
 * Product Quick-View Modal
 * Opens when any product card is clicked on shop.html / Page.html
 * Supports: specifications (chip selector), quantity stepper, add-to-cart
 */

(function () {

  /* ── Build modal DOM once ────────────────────────────── */
  function createModal() {
    if (document.getElementById('pq-overlay')) return;

    const overlay = document.createElement('div');
    overlay.id = 'pq-overlay';
    overlay.className = 'pq-overlay';
    overlay.innerHTML = `
      <div class="pq-modal" role="dialog" aria-modal="true" aria-labelledby="pq-name">
        <button class="pq-close" id="pq-close" aria-label="Close">&times;</button>

        <div class="pq-image-pane">
          <img id="pq-img" src="" alt="" />
        </div>

        <div class="pq-info-pane">
          <span class="pq-category" id="pq-category"></span>
          <h2 class="pq-name"  id="pq-name"></h2>
          <div class="pq-price" id="pq-price"></div>
          <div class="pq-stock" id="pq-stock"></div>

          <hr class="pq-divider" />

          <!-- Specs section -- hidden when product has no specs -->
          <div id="pq-specs-section" style="display:none;">
            <p class="pq-specs-label"><span id="pq-spec-label">Size / Option:</span> <strong id="pq-spec-chosen">Choose a size / option</strong></p>
            <div class="pq-spec-chips" id="pq-spec-chips"></div>
            <hr class="pq-divider" style="margin-top:14px;" />
          </div>

          <p class="pq-unit" id="pq-unit"></p>

          <div class="pq-actions">
            <div class="pq-qty-stepper">
              <button id="pq-qty-minus" aria-label="Decrease quantity">&#8722;</button>
              <input  id="pq-qty-input" type="number" value="1" min="1" max="999" aria-label="Quantity" />
              <button id="pq-qty-plus"  aria-label="Increase quantity">&#43;</button>
            </div>
            <button class="pq-add-btn" id="pq-add-btn">ADD TO CART</button>
          </div>
          <p class="pq-qty-error" id="pq-qty-error" style="display:none;"></p>
        </div>
      </div>
    `;

    document.body.appendChild(overlay);

    /* Close handlers */
    document.getElementById('pq-close').addEventListener('click', closeModal);
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay && !document.getElementById('login-prompt-modal')) closeModal();
    });
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && !document.getElementById('login-prompt-modal')) closeModal();
    });

    /* Qty stepper */
    document.getElementById('pq-qty-minus').addEventListener('click', () => {
      const input = document.getElementById('pq-qty-input');
      if (parseInt(input.value) > 1) {
        input.value = parseInt(input.value) - 1;
        clearQtyError();
      }
    });
    document.getElementById('pq-qty-plus').addEventListener('click', () => {
      const input = document.getElementById('pq-qty-input');
      const max = parseInt(input.max) || 999;
      if (parseInt(input.value) < max) {
        input.value = parseInt(input.value) + 1;
        clearQtyError();
      } else {
        input.classList.add('pq-qty-max');
        setTimeout(() => input.classList.remove('pq-qty-max'), 600);
        showQtyError(`Only ${max} available in stock.`);
      }
    });
    document.getElementById('pq-qty-input').addEventListener('input', (e) => {
      const max = parseInt(e.target.max) || 999;
      const v = parseInt(e.target.value);
      if (!isNaN(v) && v > max) {
        showQtyError(`Only ${max} available in stock. You entered ${v}.`);
      } else {
        clearQtyError();
      }
    });
    document.getElementById('pq-qty-input').addEventListener('change', (e) => {
      let v = parseInt(e.target.value);
      const max = parseInt(e.target.max) || 999;
      if (isNaN(v) || v < 1) {
        e.target.value = 1;
        clearQtyError();
      } else if (v > max) {
        e.target.value = max;
        e.target.classList.add('pq-qty-max');
        setTimeout(() => e.target.classList.remove('pq-qty-max'), 600);
        showQtyError(`Only ${max} available in stock. Quantity set to maximum.`);
        setTimeout(clearQtyError, 3000);
      }
    });
  }

  /* ── Qty validation helpers ─────────────────────────── */
  function showQtyError(msg) {
    const el = document.getElementById('pq-qty-error');
    if (!el) return;
    el.textContent = msg;
    el.style.display = 'block';
  }

  function clearQtyError() {
    const el = document.getElementById('pq-qty-error');
    if (el) el.style.display = 'none';
  }

  /* ── Open modal with product data ────────────────────── */
  window.openProductModal = function (product) {
    createModal();

    const overlay = document.getElementById('pq-overlay');

    /* Image */
    const img = document.getElementById('pq-img');
    img.src = product.image || 'img/concrete-hollow-block-300x300.jpg';
    img.alt = product.name;
    img.onerror = () => { img.src = 'img/concrete-hollow-block-300x300.jpg'; };

    /* Basic info */
    document.getElementById('pq-category').textContent = product.category || '';
    document.getElementById('pq-name').textContent = product.name;
    const discount = product.discount || 0;
    const discountedPrice = discount > 0 ? product.price * (1 - discount / 100) : product.price;
    const effectivePrice = discountedPrice; // used when adding to cart
    if (discount > 0) {
      document.getElementById('pq-price').innerHTML =
        `<span style="background:#dc2626;color:white;padding:2px 8px;border-radius:12px;font-size:0.8rem;font-weight:700;margin-right:6px;">-${discount}%</span>` +
        `<span style="text-decoration:line-through;color:#94a3b8;font-size:0.9em;margin-right:4px;">₱${parseFloat(product.price).toLocaleString('en-PH', { minimumFractionDigits: 2 })}</span>` +
        `<span style="color:#dc2626;font-weight:700;">₱${discountedPrice.toLocaleString('en-PH', { minimumFractionDigits: 2 })}</span>`;
    } else {
      document.getElementById('pq-price').textContent = `₱${parseFloat(product.price).toLocaleString('en-PH', { minimumFractionDigits: 2 })}`;
    }

    /* Unit */
    const unit = product.unit || 'pcs';
    document.getElementById('pq-unit').textContent = `Unit: ${unit}`;

    /* Stock status */
    const stockEl = document.getElementById('pq-stock');
    const stock = product.stock ?? product.stockCount ?? 0;
    const minQty = product.minQuantity ?? product.min_quantity ?? 20;
    const critQty = product.criticalQuantity ?? product.critical_quantity ?? 5;

    stockEl.className = 'pq-stock';
    if (stock <= 0) {
      stockEl.textContent = 'Status: Out of stock';
      stockEl.classList.add('out');
    } else if (stock <= critQty) {
      stockEl.textContent = `Status: Critical -- only ${stock} ${unit} left`;
      stockEl.classList.add('critical');
    } else if (stock < minQty) {
      stockEl.textContent = `Status: Low stock -- ${stock} ${unit} remaining`;
      stockEl.classList.add('low-stock');
    } else {
      stockEl.textContent = `Status: ${stock} ${unit} in stock`;
      stockEl.classList.add('in-stock');
    }

    /* Qty input -- cap at available stock, accounting for what's already in cart */
    const qtyInput = document.getElementById('pq-qty-input');

    // How many of this product (any spec variant) is already in the cart?
    const cartAlreadyQty = (function () {
      if (typeof cart === 'undefined' || !Array.isArray(cart)) return 0;
      return cart.reduce((sum, item) => {
        // Match base product name (strip spec suffix like " (12mm)")
        const baseName = item.name.replace(/\s*\([^)]*\)\s*$/, '').trim();
        if (baseName === product.name) return sum + item.quantity;
        return sum;
      }, 0);
    })();

    const availableToAdd = Math.max(0, stock - cartAlreadyQty);

    qtyInput.value = availableToAdd > 0 ? '1' : '0';
    qtyInput.max = availableToAdd > 0 ? availableToAdd : 0;
    qtyInput.min = availableToAdd > 0 ? '1' : '0';
    qtyInput.style.color = '#0f172a';
    qtyInput.style.background = '#ffffff';
    clearQtyError();

    // If stock is fully in cart already, disable add button
    if (availableToAdd <= 0 && stock > 0) {
      const addBtnEl = document.getElementById('pq-add-btn');
      if (addBtnEl) {
        addBtnEl.disabled = true;
        addBtnEl.textContent = 'MAX IN CART';
      }
    }

    /* Variants chips -- use database variants */
    const variants = product.variants || [];
    let selectedSpec = null;
    let selectedSpecPrice = null;
    const specsSection = document.getElementById('pq-specs-section');
    const chipsContainer = document.getElementById('pq-spec-chips');
    const specChosen = document.getElementById('pq-spec-chosen');
    const specLabel = document.getElementById('pq-spec-label');

    if (variants.length > 0) {
      specsSection.style.display = 'block';
      chipsContainer.innerHTML = '';
      specChosen.textContent = 'Choose a size / option';
      specChosen.style.color = '';
      if (specLabel) specLabel.textContent = 'Size / Option:';

      variants.forEach(variant => {
        const chip = document.createElement('button');
        chip.className = 'pq-spec-chip';
        chip.textContent = variant.size;
        chip.addEventListener('click', () => {
          chipsContainer.querySelectorAll('.pq-spec-chip').forEach(c => c.classList.remove('selected'));
          chip.classList.add('selected');
          selectedSpec = variant.size;
          selectedSpecPrice = variant.price;
          specChosen.textContent = variant.size;
          specChosen.style.color = '#f97316';

          // Update stock display based on variant stock
          stockEl.className = 'pq-stock';
          const vStock = variant.stock;
          if (vStock <= 0) {
            stockEl.textContent = 'Status: Out of stock';
            stockEl.classList.add('out');
          } else if (vStock <= critQty) {
            stockEl.textContent = `Status: Critical -- only ${vStock} ${unit} left`;
            stockEl.classList.add('critical');
          } else if (vStock < minQty) {
            stockEl.textContent = `Status: Low stock -- ${vStock} ${unit} remaining`;
            stockEl.classList.add('low-stock');
          } else {
            stockEl.textContent = `Status: ${vStock} ${unit} in stock`;
            stockEl.classList.add('in-stock');
          }
          qtyInput.max = vStock > 0 ? vStock : 0;

          // Enable/disable ADD button based on variant stock
          const currentAddBtn = document.getElementById('pq-add-btn') || document.querySelector('.pq-add-btn');
          if (currentAddBtn) {
            currentAddBtn.disabled = vStock <= 0;
            currentAddBtn.textContent = vStock <= 0 ? 'OUT OF STOCK' : 'ADD TO CART';
          }

          // Update price display with variant price + discount
          const variantDiscounted = discount > 0 ? variant.price * (1 - discount / 100) : variant.price;
          if (discount > 0) {
            document.getElementById('pq-price').innerHTML =
              `<span style="background:#dc2626;color:white;padding:2px 8px;border-radius:12px;font-size:0.8rem;font-weight:700;margin-right:6px;">-${discount}%</span>` +
              `<span style="text-decoration:line-through;color:#94a3b8;font-size:0.9em;margin-right:4px;">₱${variant.price.toLocaleString('en-PH', { minimumFractionDigits: 2 })}</span>` +
              `<span style="color:#dc2626;font-weight:700;">₱${variantDiscounted.toLocaleString('en-PH', { minimumFractionDigits: 2 })}</span>`;
          } else {
            document.getElementById('pq-price').textContent =
              `₱${variant.price.toLocaleString('en-PH', { minimumFractionDigits: 2 })}`;
          }
        });
        chipsContainer.appendChild(chip);
      });
    } else {
      specsSection.style.display = 'none';
      selectedSpec = null;
      selectedSpecPrice = null;
    }

    /* Add to Cart button */
    const addBtn = document.getElementById('pq-add-btn');
    // If product has variants -- disable until one is selected
    if (variants.length > 0) {
      addBtn.disabled = true;
      addBtn.textContent = 'Select a size first';
    } else {
      addBtn.disabled = stock <= 0;
      addBtn.textContent = stock <= 0 ? 'OUT OF STOCK' : 'ADD TO CART';
    }

    // Remove old listener and attach fresh one
    const newAddBtn = addBtn.cloneNode(true);
    addBtn.parentNode.replaceChild(newAddBtn, addBtn);

    newAddBtn.addEventListener('click', () => {
      // Require variant selection if product has variants
      if (variants.length > 0 && !selectedSpec) {
        specChosen.style.color = '#dc2626';
        specChosen.textContent = 'Please choose an option';
        return;
      }

      const qty = parseInt(document.getElementById('pq-qty-input').value) || 1;
      const itemName = selectedSpec ? `${product.name} (${selectedSpec})` : product.name;
      // Apply discount on top of spec price (if any), otherwise use discounted base price
      const baseForCart = selectedSpecPrice !== null ? selectedSpecPrice : product.price;
      const finalPrice = discount > 0 ? baseForCart * (1 - discount / 100) : baseForCart;

      // Guard: re-check stock vs cart before adding
      const alreadyInCart = (function () {
        if (typeof cart === 'undefined' || !Array.isArray(cart)) return 0;
        const found = cart.find(i => i.name === itemName);
        return found ? found.quantity : 0;
      })();
      const remaining = stock - alreadyInCart;
      if (qty > remaining) {
        const qInput = document.getElementById('pq-qty-input');
        qInput.value = remaining > 0 ? remaining : 1;
        qInput.classList.add('pq-qty-max');
        setTimeout(() => qInput.classList.remove('pq-qty-max'), 600);
        if (remaining <= 0) {
          showQtyError('This item has reached its stock limit in your cart.');
          newAddBtn.textContent = 'MAX IN CART';
          newAddBtn.disabled = true;
        } else {
          showQtyError(`Only ${remaining} more available. Quantity adjusted to ${remaining}.`);
          setTimeout(clearQtyError, 3000);
        }
        return;
      }

      clearQtyError();

      if (typeof addToCart === 'function') {
        // If not logged in, addToCart will show the login prompt and return early
        // -- keep the product modal open so the user can come back after logging in
        if (!window._jmcLoggedIn) {
          addToCart(itemName, finalPrice, product.image, qty, product.id ?? null);
          return; // stop here -- modal stays open, login prompt appears on top
        }

        addToCart(itemName, finalPrice, product.image, qty, product.id ?? null);
      }

      // Visual feedback then close -- only reached when actually logged in
      newAddBtn.textContent = 'Added!';
      newAddBtn.style.background = '#16a34a';
      setTimeout(() => {
        newAddBtn.textContent = 'ADD TO CART';
        newAddBtn.style.background = '';
        closeModal();
      }, 900);
    });

    /* Open with animation */
    overlay.classList.add('open');
    document.body.style.overflow = 'hidden';
  };

  function closeModal() {
    const overlay = document.getElementById('pq-overlay');
    if (overlay) overlay.classList.remove('open');
    document.body.style.overflow = '';
  }

})();
