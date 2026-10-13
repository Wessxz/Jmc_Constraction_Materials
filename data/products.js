// Global products array (kept synchronous-looking for backward compat with existing page JS)
var products = [];
var _bestSelling = []; // Best-selling products (loaded separately)

// Immediately fetch from API and populate the array, then fire a custom event
(async function loadProducts() {
  try {
    // Load all products
    const res = await fetch('/api/products/index.php');
    const json = await res.json();
    if (json.success) {
      json.data.forEach(p => products.push(p));
    }
  } catch (err) {
    console.error('[products.js] Failed to load products from API:', err);
  }
  
  // Load best-selling products
  try {
    const bsRes = await fetch('/api/products/best-selling.php');
    const bsJson = await bsRes.json();
    if (bsJson.success && bsJson.data) {
      _bestSelling = bsJson.data;
    }
  } catch (err) {
    console.error('[products.js] Failed to load best-selling:', err);
  }
  
  // Fire event so pages can re-render after data is ready
  document.dispatchEvent(new Event('productsLoaded'));
})();