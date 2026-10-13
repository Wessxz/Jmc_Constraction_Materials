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

  // PUT /api/deliveries/<id>/status  — update delivery status
  static async updateStatus(deliveryId, newStatus) {
    try {
      const res = await fetch(`/api/deliveries/${deliveryId}/status`, {
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

  // PUT /api/deliveries/<id>/assign  — assign a driver + notes
  static async assignDriver(deliveryId, driverName, notes) {
    try {
      const res = await fetch(`/api/deliveries/${deliveryId}/assign`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ driverName, notes })
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
      const name = encodeURIComponent(driverName);
      const res = await fetch(`/api/deliveries/driver/${name}`);
      const json = await res.json();
      return json;
    } catch (err) {
      console.error('[DeliveriesAPI] getDeliveriesByDriver error:', err);
      return { success: false, data: [] };
    }
  }

  // PUT /api/deliveries/<id>/proof  — submit proof of delivery
  static async submitProofOfDelivery(deliveryId, photoBase64, remarks) {
    try {
      const res = await fetch(`/api/deliveries/${deliveryId}/proof`, {
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
