<?php
// PUT /api/deliveries/{ref}/proof  — driver submits proof of delivery (base64 photo)
require_once __DIR__ . '/../db.php';
require_method('PUT');

$ref = $_GET['ref'] ?? '';
if (!$ref) json_err('Delivery reference required.', 400);

$pdo  = get_db();
$stmt = $pdo->prepare('SELECT * FROM deliveries WHERE delivery_ref = ? LIMIT 1');
$stmt->execute([$ref]);
$delivery = $stmt->fetch();
if (!$delivery) json_err('Delivery not found.', 404);

$body          = get_json_body();
$photoProof    = $body['photoProof']    ?? '';
$driverRemarks = trim($body['driverRemarks'] ?? '');

if (!$photoProof) json_err('Photo proof is required.');

// Record exact datetime of delivery completion
$dateCompleted = date('Y-m-d H:i:s');

try {
    $pdo->prepare(
        'UPDATE deliveries
         SET photo_proof = ?, driver_remarks = ?, status = ?, date_completed = ?,
             delivery_count = delivery_count + 1
         WHERE delivery_ref = ?'
    )->execute([$photoProof, $driverRemarks, 'delivered', $dateCompleted, $ref]);
} catch (\Exception $e) {
    json_err('Failed to save proof: ' . $e->getMessage(), 500);
}

// ─── Sync order status to 'delivered' ────────────────────────────────────────
// Stock was already deducted on dispatch — just update order status here.
if (!empty($delivery['order_id'])) {
    $orderRef = $delivery['order_id'];
    
    try {
        // Check if this is a regular order in sales table
        $salesCheck = $pdo->prepare("SELECT id FROM sales WHERE order_ref = ? LIMIT 1");
        $salesCheck->execute([$orderRef]);
        if ($salesCheck->fetch()) {
            $pdo->prepare("UPDATE sales SET status = 'delivered' WHERE order_ref = ?")
                ->execute([$orderRef]);
        }
        
        // Check if this is a bulk order
        $bulkCheck = $pdo->prepare("SELECT * FROM bulk_orders WHERE bulk_ref = ? LIMIT 1");
        $bulkCheck->execute([$orderRef]);
        $bulkOrder = $bulkCheck->fetch();
        
        if ($bulkOrder) {
            // Update bulk_orders status
            $pdo->prepare("UPDATE bulk_orders SET status = 'delivered', updated_at = NOW() WHERE bulk_ref = ?")
                ->execute([$orderRef]);
            
            // ─── Insert bulk order into sales table for sales tracking ────────
            // Check if not already in sales table
            $salesExists = $pdo->prepare("SELECT id FROM sales WHERE order_ref = ? LIMIT 1");
            $salesExists->execute([$orderRef]);
            
            if (!$salesExists->fetch()) {
                // Calculate final amount (quoted or final, minus discount)
                $finalAmount = (float)($bulkOrder['final_amount'] ?: $bulkOrder['quoted_amount']);
                $discountAmount = (float)($bulkOrder['discount_amount'] ?? 0);
                $subtotal = $finalAmount + $discountAmount; // Reverse discount to get subtotal
                
                // Insert into sales for reporting
                $pdo->prepare(
                    "INSERT INTO sales 
                     (order_ref, user_id, customer_name, customer_phone, customer_address, 
                      date, order_type, subtotal, discount_type, discount_amount, total, 
                      items_json, status, created_at) 
                     VALUES (?, ?, ?, ?, ?, ?, 'bulk', ?, ?, ?, ?, ?, 'delivered', ?)"
                )->execute([
                    $orderRef,
                    $bulkOrder['user_id'],
                    $bulkOrder['customer_name'],
                    $bulkOrder['contact_number'],
                    $bulkOrder['address'],
                    date('Y-m-d H:i:s'),
                    $subtotal,
                    $bulkOrder['discount_type'],
                    $discountAmount,
                    $finalAmount,
                    $bulkOrder['items_json'],
                    $bulkOrder['created_at']
                ]);
            }
        }
    } catch (\Exception $e) { /* non-fatal */ }
    
    try {
        write_log('Driver', 'driver', 'update_order_status', 'order', $orderRef,
            "Order {$orderRef} marked delivered via proof upload on delivery $ref.");
    } catch (\Exception $e) { /* non-fatal */ }
}

$stmt->execute([$ref]);
$updated = $stmt->fetch();
if (!$updated) json_err('Delivery not found after update.', 500);

// ─── Auto-complete batch if all its deliveries are done ───────────────────────
if (!empty($updated['truck_batch_id'])) {
    maybe_complete_batch($pdo, (int)$updated['truck_batch_id']);
}

json_ok(delivery_to_dict($updated), 'data');
