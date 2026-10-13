<?php
// PUT /api/deliveries/{ref}/status
require_once __DIR__ . '/../db.php';
require_method('PUT');

$ref = $_GET['ref'] ?? '';
if (!$ref) json_err('Delivery reference required.', 400);

$pdo  = get_db();
$stmt = $pdo->prepare('SELECT * FROM deliveries WHERE delivery_ref = ? LIMIT 1');
$stmt->execute([$ref]);
$delivery = $stmt->fetch();
if (!$delivery) json_err('Delivery not found.', 404);

$body    = get_json_body();
$status  = trim($body['status'] ?? '');
$allowed = ['pending', 'out_for_delivery', 'delivered', 'failed'];
if (!$status || !in_array($status, $allowed, true)) {
    json_err('Invalid status. Allowed: ' . implode(', ', $allowed));
}

// Record delivery time when first marked as delivered; increment delivery cycle count
$updateFields = 'status = ?';
$params       = [$status];

if ($status === 'delivered' && $delivery['status'] !== 'delivered') {
    $updateFields .= ', date_completed = ?, delivery_count = delivery_count + 1';
    $params[]      = date('Y-m-d H:i:s');
}

$params[] = $ref;
$pdo->prepare("UPDATE deliveries SET $updateFields WHERE delivery_ref = ?")
    ->execute($params);

// ─── Sync order status when delivery is marked delivered ─────────────────────
if ($status === 'delivered' && $delivery['status'] !== 'delivered' && !empty($delivery['order_id'])) {
    $orderRef = $delivery['order_id'];
    
    // Check if this is a regular order in sales table
    $salesCheck = $pdo->prepare("SELECT id FROM sales WHERE order_ref = ? LIMIT 1");
    $salesCheck->execute([$orderRef]);
    if ($salesCheck->fetch()) {
        $pdo->prepare("UPDATE sales SET status = 'delivered' WHERE order_ref = ?")
            ->execute([$orderRef]);
    }
    
    // Check if this is a bulk order
    $bulkCheck = $pdo->prepare("SELECT id FROM bulk_orders WHERE bulk_ref = ? LIMIT 1");
    $bulkCheck->execute([$orderRef]);
    if ($bulkCheck->fetch()) {
        $pdo->prepare("UPDATE bulk_orders SET status = 'delivered', updated_at = NOW() WHERE bulk_ref = ?")
            ->execute([$orderRef]);
    }
    
    write_log('Admin', 'admin', 'update_order_status', 'order', $orderRef,
        "Order {$orderRef} marked delivered via delivery status update on $ref.");
}

$stmt->execute([$ref]);
$updated = $stmt->fetch();

// ─── Auto-complete batch if all its deliveries are done ───────────────────────
if ($status === 'delivered' && !empty($updated['truck_batch_id'])) {
    maybe_complete_batch($pdo, (int)$updated['truck_batch_id']);
}

json_ok(delivery_to_dict($updated), 'data');
