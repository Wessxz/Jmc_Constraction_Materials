<?php
// PUT /api/orders/{ref}/cancel — customer cancels their own pending order
// Immediately cancels and creates a return record visible to admin/staff.
ini_set('display_errors', 0);
ini_set('log_errors', 1);
ini_set('error_log', __DIR__ . '/cancel_debug.log');
error_reporting(E_ALL);
require_once __DIR__ . '/../db.php';
require_method('PUT');

$sess = require_auth();
$ref  = $_GET['ref'] ?? '';
error_log("[cancel.php] HIT — ref=$ref method={$_SERVER['REQUEST_METHOD']}");
if (!$ref) json_err('Order reference required.', 400);

$pdo  = get_db();
$stmt = $pdo->prepare('SELECT * FROM sales WHERE order_ref = ? LIMIT 1');
$stmt->execute([$ref]);
$order = $stmt->fetch();

if (!$order) json_err('Order not found.', 404);

// Only the owning customer can cancel their own order
if ($sess['role'] === 'customer' && (int)$order['user_id'] !== $sess['id']) {
    json_err('You can only cancel your own orders.', 403);
}

if ($order['status'] !== 'pending') {
    json_err('Only pending orders can be cancelled.');
}

$body         = get_json_body();
$cancelReason = trim($body['cancel_reason'] ?? '');
$cancelNotes  = trim($body['cancel_notes']  ?? '');

if (!$cancelReason) {
    json_err('A cancellation reason is required.');
}

// ── Release reservation for each item ────────────────────────────────────────
$items = json_decode($order['items_json'], true) ?? [];
foreach ($items as $item) {
    $name      = $item['name']       ?? '';
    $productId = isset($item['product_id']) ? (int)$item['product_id'] : 0;
    $qty       = max(1, (int)($item['qty'] ?? 1));

    // Try variant match first
    if (preg_match('/^(.+)\s+\((.+)\)$/', $name, $m)) {
        $baseName    = trim($m[1]);
        $variantSize = trim($m[2]);
        $pp = $pdo->prepare('SELECT id FROM products WHERE name = ? LIMIT 1');
        $pp->execute([$baseName]);
        $parentProd = $pp->fetch();
        if ($parentProd) {
            $vv = $pdo->prepare('SELECT id FROM product_variants WHERE product_id = ? AND size = ? LIMIT 1');
            $vv->execute([$parentProd['id'], $variantSize]);
            $variant = $vv->fetch();
            if ($variant) {
                $pdo->prepare('UPDATE product_variants SET reserved_stock = GREATEST(0, reserved_stock - ?) WHERE id = ?')
                    ->execute([$qty, $variant['id']]);
                $pdo->prepare('UPDATE products SET reserved_stock = (SELECT COALESCE(SUM(reserved_stock),0) FROM product_variants WHERE product_id = ?) WHERE id = ?')
                    ->execute([$parentProd['id'], $parentProd['id']]);
                continue;
            }
        }
    }

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

    $p = $pdo->prepare('SELECT id FROM products WHERE name = ? LIMIT 1');
    $p->execute([$name]);
    $prod = $p->fetch();
    if ($prod) {
        $pdo->prepare('UPDATE products SET reserved_stock = GREATEST(0, reserved_stock - ?) WHERE id = ?')
            ->execute([$qty, $prod['id']]);
    }
}

// ── Mark order as cancelled ───────────────────────────────────────────────────
$pdo->prepare('UPDATE sales SET status = ?, cancel_reason = ?, cancel_notes = ? WHERE order_ref = ?')
    ->execute(['cancelled', $cancelReason, $cancelNotes ?: null, $ref]);

// ── Auto-create a cancellation record so admin/staff can review ───────────────
$customerName = $order['customer_name'] ?? $sess['full_name'] ?? 'Customer';

do {
    $cancelRef = 'CAN-' . str_pad((string)random_int(1000, 9999), 4, '0', STR_PAD_LEFT);
    $exists    = $pdo->prepare('SELECT id FROM order_cancellations WHERE cancel_ref = ? LIMIT 1');
    $exists->execute([$cancelRef]);
} while ($exists->fetch());

$pdo->prepare(
    'INSERT INTO order_cancellations
     (cancel_ref, order_ref, customer_name, cancel_reason, cancel_notes, items_json, total_amount)
     VALUES (?, ?, ?, ?, ?, ?, ?)'
)->execute([
    $cancelRef,
    $ref,
    $customerName,
    $cancelReason,
    $cancelNotes ?: null,
    $order['items_json'],
    (float)($order['total'] ?? 0),
]);
error_log("[cancel.php] INSERT order_cancellations OK — cancel_ref=$cancelRef order_ref=$ref");

// ── Log the action ────────────────────────────────────────────────────────────
write_log($sess['full_name'], $sess['role'], 'cancel_order', 'order', $ref,
    "Order $ref cancelled by {$sess['full_name']}. Reason: $cancelReason. Cancellation record $cancelRef created.");

$stmt->execute([$ref]);
json_ok([
    'order'      => order_to_dict($stmt->fetch()),
    'cancel_ref' => $cancelRef,
], 'data');
