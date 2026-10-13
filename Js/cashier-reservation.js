/**
 * Reservation helper for cashier
 * Sets the currently loaded reservation order_ref
 */

window.setLoadedReservation = function(orderRef) {
  console.log('[setLoadedReservation] Called with:', orderRef);
  console.log('[setLoadedReservation] currentLoadedReservation exists?', typeof currentLoadedReservation !== 'undefined');
  
  if (typeof currentLoadedReservation !== 'undefined') {
    currentLoadedReservation = orderRef;
    console.log('[Cashier] ✅ Loaded reservation set to:', currentLoadedReservation);
  } else {
    console.error('[Cashier] ❌ currentLoadedReservation variable not found!');
  }
};

window.clearLoadedReservation = function() {
  if (typeof currentLoadedReservation !== 'undefined') {
    console.log('[Cashier] Clearing loaded reservation (was:', currentLoadedReservation, ')');
    currentLoadedReservation = null;
  }
};
