// ═══════════════════════════════════════════════════════════════════════════════
// TRUCK DISPATCH SYSTEM - Constants and Configuration
// ═══════════════════════════════════════════════════════════════════════════════

// Truck capacity constants
const TRUCK_MAX_ORDERS = 10; // max bulk orders per truck
const TRUCK_MAX_ITEMS  = 50; // max items per truck (used for split logic)

// Export constants for use in other modules
if (typeof window !== 'undefined') {
  window.TRUCK_MAX_ORDERS = TRUCK_MAX_ORDERS;
  window.TRUCK_MAX_ITEMS = TRUCK_MAX_ITEMS;
}

console.log('[Dispatch System] Initialized - Max Orders:', TRUCK_MAX_ORDERS, 'Max Items:', TRUCK_MAX_ITEMS);
