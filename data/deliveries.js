/**
 * data/deliveries.js
 * DeliveriesAPI now calls the Flask REST API instead of localStorage.
 * The public interface (method signatures + return shapes) is identical
 * so all existing callers (admin.js, staff.js, cashier.js, driver.js) work unchanged.
 */

class DeliveriesAPI {

  // POST /api/deliveries  — create a new delivery (called by cashier after checkout)
  static async createDelivery(deliveryData) {
    try {
      const res = await fetch('/api/deliveries', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(deliveryData)
      });
      const json = await res.json();
      return json;
    } catch (err) {
      console.error('[DeliveriesAPI] createDelivery error:', err);
      return { success: false, message: 'Network error.' };
    }
  }

  // GET /api/deliveries  — fetch all deliveries
  static async getAllDeliveries() {
    try {
      const res = await fetch('/api/deliveries');
      const json = await res.json();
      return json;
    } catch (err) {
      console.error('[DeliveriesAPI] getAllDeliveries error:', err);
      return { success: false, data: [] };
    }
  }

  // PUT /api/deliveries/<ref>/status  — update delivery status
  static async updateStatus(deliveryRef, newStatus) {
    try {
      const res = await fetch(`/api/deliveries/${deliveryRef}/status`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus })
      });
      const json = await res.json();
      return json;
    } catch (err) {
      console.error('[DeliveriesAPI] updateStatus error:', err);
      return { success: false };
    }
  }

  // PUT /api/deliveries/<ref>/assign  — assign a driver + notes
  static async assignDriver(deliveryRef, driverName, notes, plateNumber) {
    try {
      const res = await fetch(`/api/deliveries/${deliveryRef}/assign`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ driverName, notes, plateNumber })
      });
      const json = await res.json();
      return json;
    } catch (err) {
      console.error('[DeliveriesAPI] assignDriver error:', err);
      return { success: false };
    }
  }

  // GET /api/deliveries/driver/<name>  — get deliveries assigned to a driver
  static async getDeliveriesByDriver(driverName) {
    try {
      const res = await fetch(`/api/deliveries/driver?name=${encodeURIComponent(driverName)}`, {
        credentials: 'include'
      });
      const json = await res.json();
      return json;
    } catch (err) {
      console.error('[DeliveriesAPI] getDeliveriesByDriver error:', err);
      return { success: false, data: [] };
    }
  }

  // PUT /api/deliveries/<ref>/proof  — submit proof of delivery
  static async submitProofOfDelivery(deliveryRef, photoBase64, remarks) {
    try {
      const res = await fetch(`/api/deliveries/${deliveryRef}/proof`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ photoProof: photoBase64, driverRemarks: remarks })
      });
      const json = await res.json();
      return json;
    } catch (err) {
      console.error('[DeliveriesAPI] submitProofOfDelivery error:', err);
      return { success: false };
    }
  }
}

// Expose to global scope (used by admin.js, staff.js, cashier.js, driver.js)
window.DeliveriesAPI = DeliveriesAPI;
