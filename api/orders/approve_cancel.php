<?php
// PUT /api/orders/{ref}/approve_cancel
// Admin or Staff accepts or rejects a cancellation request.
// Body: { "action": "accept"|"reject", "actorName": "...", "actorRole": "..." }
require_once __DIR__ . '/../db.php';
require_method('PUT');

$ref = $_GET['ref'] ?? '';
if (!$ref) json_err('Order reference required.', 400);

$sess = require_role('admin', 'staff');

$pdo  = get_db();
$stmt = $pdo->prepare('SELECT * FROM orders WHERE order_ref = ? LIMIT 1');
$stmt->execute([$ref]);
$order = $stmt->fetch();
if (!$order) json_err('Order not found.', 404);

if ($order['status'] !== 'cancellation_requested') {
    json_err('This order does not have a pending cancellation request.');
}

$body      = get_json_body();
$action    = trim($body['action']    ?? '');
$actorName = trim($body['actorName'] ?? ($sess['full_name'] ?? 'Staff'));
$actorRole = trim($body['actorRole'] ?? $sess['role']);

if (!in_array($action, ['accept', 'reject'], true)) {
    json_err('Invalid action. Use "accept" or "reject".');
}

if ($action === 'accept') {
    // ── Release reservation and mark as cancelled ─────────────────────────────
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

    $pdo->prepare('UPDATE orders SET status = ? WHERE order_ref = ?')
        ->execute(['cancelled', $ref]);

    write_log($actorName, $actorRole, 'cancel_approved', 'order', $ref,
        "Cancellation of order $ref approved by $actorName. Reason: " . ($order['cancel_reason'] ?? '—'));

} else {
    // ── Reject: restore order back to pending ─────────────────────────────────
    $pdo->prepare('UPDATE orders SET status = ?, cancel_reason = NULL, cancel_notes = NULL WHERE order_ref = ?')
        ->execute(['pending', $ref]);

    write_log($actorName, $actorRole, 'cancel_rejected', 'order', $ref,
        "Cancellation request for order $ref rejected by $actorName.");
}

$stmt->execute([$ref]);
json_ok(order_to_dict($stmt->fetch()), 'data');
