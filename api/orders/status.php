<?php
// PUT /api/orders/{ref}/status  — update order status (admin/staff/cashier)
require_once __DIR__ . '/../db.php';

// Set timezone to match Philippines
date_default_timezone_set('Asia/Manila');

// ─── PICKUP EXPIRATION CONFIG ───────────────────────────────────────────────
// Change this value to adjust pickup expiration time
// For testing: use '2 minutes', '5 minutes', '30 minutes'
// For production: use '5 hours'
define('PICKUP_EXPIRATION_TIME', '2 minutes');

require_method('PUT');

$ref = $_GET['ref'] ?? '';
if (!$ref) json_err('Order reference required.', 400);

// DEBUG: Log what we're looking for
error_log("STATUS_DEBUG: Looking for order_ref = '$ref'");

$pdo  = get_db();
$stmt = $pdo->prepare('SELECT * FROM sales WHERE order_ref = ? LIMIT 1');
$stmt->execute([$ref]);
$order = $stmt->fetch();

// DEBUG: Log result
error_log("STATUS_DEBUG: Order found = " . ($order ? 'YES' : 'NO'));

if (!$order) json_err('Order not found.', 404);

$body      = get_json_body();
$status    = trim($body['status']    ?? '');
$actorName = trim($body['actorName'] ?? 'System');
$actorRole = trim($body['actorRole'] ?? 'staff');

$allowed = ['pending', 'processing', 'ready_for_pickup', 'out_for_delivery', 'completed', 'delivered', 'cancelled'];
if (!$status || !in_array($status, $allowed, true)) {
    json_err('Invalid status. Allowed: ' . implode(', ', $allowed));
}

$items = json_decode($order['items_json'], true) ?? [];
$prevStatus = $order['status'];

// ─── Stock deduction logic ──────────────────────────────────────────────────
// IMPORTANT: Stock is deducted ONLY when cashier receives payment
// NOT when order is created or when admin processes
// This is handled in complete-payment.php endpoint

// ─── Pickup Expiration System ─────────────────────────────────────────────
// When admin clicks "Process" for orders, set expiration countdown.
// When admin clicks "Ready for Pickup", materials are ready and timer starts.
// If not picked up/completed within time limit, auto-cancel.
$pickupReadyAt = null;
$pickupExpiresAt = null;

if ($status === 'processing') {
    // Set processing time but no expiration yet
    $pickupReadyAt = date('Y-m-d H:i:s');
    
    $pdo->prepare('UPDATE sales SET status = ?, pickup_ready_at = ?, pickup_expires_at = NULL WHERE order_ref = ?')
        ->execute([$status, $pickupReadyAt, $ref]);
} elseif ($status === 'ready_for_pickup') {
    // Materials are ready - start the pickup expiration timer
    $pickupReadyAt = date('Y-m-d H:i:s');
    $pickupExpiresAt = date('Y-m-d H:i:s', strtotime('+' . PICKUP_EXPIRATION_TIME));
    
    $pdo->prepare('UPDATE sales SET status = ?, pickup_ready_at = ?, pickup_expires_at = ? WHERE order_ref = ?')
        ->execute([$status, $pickupReadyAt, $pickupExpiresAt, $ref]);
} else {
    $pdo->prepare('UPDATE sales SET status = ? WHERE order_ref = ?')
        ->execute([$status, $ref]);
}

write_log($actorName, $actorRole, 'update_order_status', 'order', $ref,
    "Order $ref status changed to \"$status\"");

// Fetch updated order
$stmt = $pdo->prepare('SELECT * FROM sales WHERE order_ref = ? LIMIT 1');
$stmt->execute([$ref]);
json_ok(sale_to_dict($stmt->fetch()), 'data');
