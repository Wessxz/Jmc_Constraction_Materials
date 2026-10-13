
let cart = [];
let bestSellingProducts = []; // Store best-selling product IDs

// DOM Elements
let cartSidebar, cartIcon, closeCartBtn, cartItemsContainer, cartTotalEl, cartBadge, checkoutBtn;

// Initialize cart when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
  cartSidebar = document.getElementById("cart-sidebar");
  cartIcon = document.querySelector(".cart");
  closeCartBtn = document.getElementById("close-cart-btn");
  cartItemsContainer = document.getElementById("cart-items");
  cartTotalEl = document.getElementById("cart-total-price");
  cartBadge = document.getElementById("cart-badge");
  checkoutBtn = document.querySelector(".checkout-btn");

  loadBestSellingProducts(); // Load best-selling product IDs
  initCart();
});

// -- Load best-selling product IDs -------------------------------

async function loadBestSellingProducts() {
  try {
    const res = await fetch('/api/products/best-selling.php');
    const json = await res.json();

    if (res.ok && json.success && json.data) {
      bestSellingProducts = json.data.map(p => p.id);
      console.log('[cart] Best-selling product IDs loaded:', bestSellingProducts);
    }
  } catch (err) {
    console.error('[cart] Failed to load best-selling products:', err);
  }
}

// -- Load cart from database -------------------------------------

async function loadCartFromDB() {
  if (!window._jmcLoggedIn) return;

  try {
    const res = await fetch('/api/cart/', {
      credentials: 'include'
    });

    const json = await res.json();

    if (!res.ok || !json.success) {
      console.error('[cart] Failed to load cart:', json);
      return;
    }

    cart = (json.data || []).map(item => ({
      id: item.id,
      name: item.name,
      price: Number(item.price) || 0,
      image: item.image || '',
      quantity: Number(item.quantity) || 1,
      product_id: item.product_id
    }));

    updateCartUI();

  } catch (err) {
    console.error('[cart] Failed to load cart:', err);
  }
}

// -- Initialize cart ---------------------------------------------

function initCart() {
  if (cartSidebar && closeCartBtn) {
    document.querySelectorAll('.cart').forEach(icon => {
      icon.addEventListener("click", () => {
        cartSidebar.classList.add("open");
      });
    });

    closeCartBtn.addEventListener("click", () => {
      cartSidebar.classList.remove("open");
    });
  }

  if (checkoutBtn) {
    checkoutBtn.addEventListener("click", async () => {
      if (cart.length === 0) {
        alert("Your reservation is empty!");
        return;
      }

      checkoutBtn.disabled = true;
      checkoutBtn.innerText = "Processing Reservation...";

      const total = cart.reduce(
        (sum, item) => sum + (item.price * item.quantity),
        0
      );

      try {
        const res = await fetch('/api/orders/index.php', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          credentials: 'include',
          body: JSON.stringify({
            customer_name: window._jmcUser
              ? window._jmcUser.full_name
              : 'Storefront Customer',

            items: cart.map(item => ({
              name: item.name,
              price: item.price,
              qty: item.quantity,
              image: item.image,
              product_id: item.product_id ?? null
            })),

            total: total,
            tendered: total,
            change: 0,

            actorName: window._jmcUser
              ? window._jmcUser.full_name
              : 'Customer',

            actorRole: 'customer'
          })
        });

        const json = await res.json();

        if (res.ok && json.success) {
          const orderId =
            json.order?.order_ref ||
            json.order?.id ||
            'N/A';

          // Clear cart from database after successful reservation
          const clearRes = await fetch('/api/cart/', {
            method: 'DELETE',
            credentials: 'include'
          });

          if (!clearRes.ok) {
            console.error('[cart] Failed to clear database cart.');
          }

          cart = [];
          updateCartUI();

          document.getElementById("cart-sidebar")?.classList.remove("open");

          const msg = document.createElement('div');
          msg.id = 'order-success-overlay';

          msg.innerHTML = `
            <div class="order-success-card">
              <h2 class="order-success-title">
                Reservation Confirmed!
              </h2>

              <p class="order-success-sub">
                Your reservation has been received and is
                <strong>pending confirmation</strong>.
                We will contact you shortly.
              </p>

              <p class="order-success-id">
                Reservation ID: <strong>${orderId}</strong>
              </p>

              <div class="order-success-actions">
                <a href="account.html" class="order-view-btn">
                  View My Reservations
                </a>

                <button
                  onclick="document.getElementById('order-success-overlay').remove()"
                  class="order-continue-btn">
                  Continue Browsing
                </button>
              </div>
            </div>
          `;

          document.body.appendChild(msg);

        } else {
          alert(
            'Reservation failed: ' +
            (json.error || json.message || 'Unknown error. Please try again.')
          );
        }

      } catch (err) {
        console.error('[cart] Checkout error:', err);

        alert(
          'Could not connect to the server. Make sure the app is running.'
        );

      } finally {
        checkoutBtn.disabled = false;
        checkoutBtn.innerText = "Confirm Reservation";
      }
    });
  }
}

// -- Add to cart -------------------------------------------------

async function addToCart(
  productName,
  productPrice,
  productImage,
  qty = 1,
  productId = null
) {
  if (!window._jmcLoggedIn) {
    showLoginPrompt();
    return;
  }

  try {
    const res = await fetch('/api/cart/', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      credentials: 'include',
      body: JSON.stringify({
        product_id: productId,
        name: productName,
        price: parseFloat(productPrice),
        image: productImage,
        quantity: qty
      })
    });

    const json = await res.json();

    if (!res.ok || !json.success) {
      console.error('[cart] Failed to add item:', json);

      alert(
        'Failed to add item: ' +
        (json.error || json.message || 'Please try again.')
      );

      return;
    }

    const existing = cart.find(item => item.name === productName);

    if (existing) {
      existing.quantity += qty;

      if (json.data?.id != null) {
        existing.id = json.data.id;
      }

    } else {
      cart.push({
        id: json.data?.id ?? null,
        name: productName,
        price: parseFloat(productPrice),
        image: productImage,
        quantity: qty,
        product_id: productId
      });
    }

    updateCartUI();

    document.getElementById("cart-sidebar")?.classList.add("open");

  } catch (err) {
    console.error('[cart] Failed to add item:', err);
    alert('Could not connect to the server. Please try again.');
  }
}

// -- Remove from cart --------------------------------------------

async function removeFromCart(index) {
  const item = cart[index];

  if (!item) return;

  if (item.id == null) {
    console.error('[cart] Cannot remove item: missing database ID.', item);
    alert('Cannot remove this item because its database ID is missing.');
    return;
  }

  try {
    const res = await fetch(`/api/cart/${item.id}`, {
      method: 'DELETE',
      credentials: 'include'
    });

    const json = await res.json();

    if (!res.ok || json.success === false) {
      console.error('[cart] Failed to remove item:', json);

      alert(
        'Failed to remove item: ' +
        (json.error || json.message || 'Please try again.')
      );

      return;
    }

    cart.splice(index, 1);
    updateCartUI();

  } catch (err) {
    console.error('[cart] Failed to remove item:', err);
    alert('Could not connect to the server. Please try again.');
  }
}

// -- Show login prompt -------------------------------------------

function showLoginPrompt() {
  const existing = document.getElementById('login-prompt-modal');

  if (existing) existing.remove();

  const modal = document.createElement('div');
  modal.id = 'login-prompt-modal';

  modal.style.cssText = `
    position: fixed;
    inset: 0;
    background: rgba(0,0,0,0.5);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 10000;
    backdrop-filter: blur(2px);
  `;

  modal.addEventListener('click', (e) => e.stopPropagation());

  modal.innerHTML = `
    <div style="
      background: white;
      border-radius: 16px;
      padding: 36px 32px;
      max-width: 400px;
      width: 90%;
      text-align: center;
      box-shadow: 0 20px 60px rgba(0,0,0,0.2);
    ">
      <h2 style="
        font-size: 20px;
        font-weight: 700;
        color: #1e293b;
        margin-bottom: 10px;
      ">
        Create an Account First
      </h2>

      <p style="
        color: #64748b;
        font-size: 14px;
        margin-bottom: 28px;
        line-height: 1.6;
      ">
        You need to be logged in to add items to your reservation
        and submit reservations.
      </p>

      <div style="
        display: flex;
        gap: 12px;
        justify-content: center;
      ">
        <a href="login.html" style="
          padding: 11px 24px;
          border-radius: 8px;
          font-weight: 600;
          font-size: 14px;
          text-decoration: none;
          border: 1.5px solid #e2e8f0;
          color: #1e293b;
        ">
          Login
        </a>

        <a href="register.html" style="
          padding: 11px 24px;
          border-radius: 8px;
          font-weight: 600;
          font-size: 14px;
          text-decoration: none;
          background: #f97316;
          color: white;
          border: 1.5px solid #f97316;
        ">
          Create Account
        </a>
      </div>

      <button
        onclick="document.getElementById('login-prompt-modal').remove()"
        style="
          margin-top: 18px;
          background: none;
          border: none;
          color: #94a3b8;
          font-size: 13px;
          cursor: pointer;
        ">
        Maybe later
      </button>
    </div>
  `;

  document.body.appendChild(modal);
}

// -- Update cart UI ----------------------------------------------

function updateCartUI() {
  const cartItemsContainer = document.getElementById("cart-items");
  const cartTotalEl = document.getElementById("cart-total-price");
  const cartBadge = document.getElementById("cart-badge");

  if (!cartItemsContainer || !cartTotalEl) return;

  cartItemsContainer.innerHTML = "";

  let total = 0;
  let totalItems = 0;
  let hasBestSelling = false; // Track if cart has best-selling items

  cart.forEach((item, index) => {
    total += item.price * item.quantity;
    totalItems += item.quantity;

    // Check if this item is a best-selling product
    const isBestSelling = item.product_id && bestSellingProducts.includes(item.product_id);
    if (isBestSelling) {
      hasBestSelling = true;
      console.log('[cart] Best-selling item found:', item.name, 'ID:', item.product_id);
    }

    const itemEl = document.createElement("div");
    itemEl.classList.add("cart-item");

    itemEl.innerHTML = `
      <img
        src="${item.image}"
        alt="${item.name}"
        class="cart-item-img"
        onerror="this.src='img/concrete-hollow-block-300x300.jpg'"
      />

      <div class="cart-item-details">
        <div class="cart-item-title">${item.name}</div>
        <div class="cart-item-price">₱${item.price.toFixed(2)}</div>
        <div class="cart-item-quantity">Qty: ${item.quantity}</div>
        ${isBestSelling ? '<div class="cart-item-badge">Best-Selling</div>' : ''}
      </div>

      <button
        class="remove-item-btn"
        onclick="removeFromCart(${index})">
        X
      </button>
    `;

    cartItemsContainer.appendChild(itemEl);
  });

  // Update disclaimer in footer
  updateCartFooterDisclaimer(hasBestSelling);
  console.log('[cart] Has best-selling items:', hasBestSelling);

  cartTotalEl.innerText = `₱${total.toFixed(2)}`;

  if (cartBadge) {
    cartBadge.innerText = totalItems;
    cartBadge.style.display = totalItems > 0 ? "flex" : "none";
  }
}

// -- Update cart footer disclaimer ---------------------------

function updateCartFooterDisclaimer(hasBestSelling) {
  const cartFooter = document.querySelector(".cart-footer");
  if (!cartFooter) return;

  // Remove existing disclaimer if present
  const existingDisclaimer = cartFooter.querySelector(".cart-disclaimer");
  if (existingDisclaimer) {
    existingDisclaimer.remove();
  }

  // Add disclaimer if best-selling items are in cart
  if (hasBestSelling) {
    const disclaimer = document.createElement("div");
    disclaimer.classList.add("cart-disclaimer");
    disclaimer.innerHTML = `
      <div class="disclaimer-text">
        <strong>Notice:</strong> Best-selling products are in high demand and may require additional preparation time for your reservation.
      </div>
    `;
    
    // Insert at the beginning of footer (before total and checkout button)
    cartFooter.insertBefore(disclaimer, cartFooter.firstChild);
  }
}