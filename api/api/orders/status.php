<?php
// PUT /api/orders/{ref}/status  — update order status (admin/staff/cashier)
require_once __DIR__ . '/../db.php';
require_method('PUT');

$ref = $_GET['ref'] ?? '';
if (!$ref) json_err('Order reference required.', 400);

$pdo  = get_db();
$stmt = $pdo->prepare('SELECT * FROM sales WHERE order_ref = ? LIMIT 1');
$stmt->execute([$ref]);
$order = $stmt->fetch();
if (!$order) json_err('Order not found.', 404);

$body      = get_json_body();
$status    = trim($body['status']    ?? '');
$actorName = trim($body['actorName'] ?? 'System');
$actorRole = trim($body['actorRole'] ?? 'staff');

$allowed = ['pending', 'processing', 'out_for_delivery', 'completed', 'delivered', 'cancelled'];
if (!$status || !in_array($status, $allowed, true)) {
    json_err('Invalid status. Allowed: ' . implode(', ', $allowed));
}

$items = json_decode($order['items_json'], true) ?? [];

// ─── On cancellation: release reservation (no physical stock change) ──────────
if ($status === 'cancelled' && $order['status'] !== 'cancelled') {
    foreach ($items as $item) {
        $name      = $item['name']       ?? '';
        $productId = isset($item['product_id']) ? (int)$item['product_id'] : 0;
        $qty       = max(1, (int)($item['qty'] ?? 1));

        if ($productId > 0) {
            $p = $pdo->prepare('SELECT id FROM products WHERE id = ? LIMIT 1');
            $p->execute([$productId]);
            $prod = $p->fetch();
            if ($prod) {
                $pdo->prepare('UPDATE products SET reserved_stock = GREATEST(0, reserved_stock - ?) WHERE id = ?')
                    ->execute([$qty, $prod['id']]);
                continue;
            }
        }
        // Fallback: match by name
        $p = $pdo->prepare('SELECT id FROM products WHERE name = ? LIMIT 1');
        $p->execute([$name]);
        $prod = $p->fetch();
        if ($prod) {
            $pdo->prepare('UPDATE products SET reserved_stock = GREATEST(0, reserved_stock - ?) WHERE id = ?')
                ->execute([$qty, $prod['id']]);
        }
    }
}

// ─── On completion/delivery: stock was already deducted on dispatch ───────────
// We keep this as a safety fallback ONLY for orders NOT going through truck planner
// (e.g. walk-in orders marked completed directly by cashier/admin with no delivery record)
$fulfillStatuses = ['completed', 'delivered'];
$prevWasFulfilled = in_array($order['status'], $fulfillStatuses, true);
if (in_array($status, $fulfillStatuses, true) && !$prevWasFulfilled) {
    // Check if this order has a delivery record that was dispatched
    $delCheck = $pdo->prepare(
        "SELECT id FROM deliveries WHERE order_id = ? AND status IN ('out_for_delivery','delivered') LIMIT 1"
    );
    $delCheck->execute([$ref]);
    $wasDispatched = (bool)$delCheck->fetch();

    // Only deduct if NOT already dispatched (no truck planner used)
    if (!$wasDispatched) {
        deduct_order_stock($pdo, $ref);
    }
}

$pdo->prepare('UPDATE sales SET status = ? WHERE order_ref = ?')
    ->execute([$status, $ref]);

write_log($actorName, $actorRole, 'update_order_status', 'order', $ref,
    "Order $ref status changed to \"$status\"");

$stmt->execute([$ref]);
json_ok(order_to_dict($stmt->fetch()), 'data');
