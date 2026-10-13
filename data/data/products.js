/**
 * data/products.js
 * Loads products from the Flask API and exposes them as the global `products` array.
 * All pages that previously loaded this as a static <script> will now get live data.
 */

// Global products array (kept synchronous-looking for backward compat with existing page JS)
var products = [];

// Immediately fetch from Flask API and populate the array, then fire a custom event
(async function loadProducts() {
  try {
    const res = await fetch('/api/products');
    const json = await res.json();
    if (json.success) {
      // Populate the array in-place so existing references still work
      json.data.forEach(p => products.push(p));
    }
  } catch (err) {
    console.error('[products.js] Failed to load products from API:', err);
  }
  // Fire event so pages can re-render after data is ready
  document.dispatchEvent(new Event('productsLoaded'));
})();