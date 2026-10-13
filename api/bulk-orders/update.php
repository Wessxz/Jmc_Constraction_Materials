<?php
// PUT /api/bulk-orders/{ref}  — update status, quotation, or cancel (admin/staff)
require_once __DIR__ . '/../db.php';
require_method('PUT');

$ref  = $_GET['ref'] ?? '';
if (!$ref) json_err('Bulk order reference required.', 400);

$pdo  = get_db();
$stmt = $pdo->prepare('SELECT * FROM bulk_orders WHERE bulk_ref = ? LIMIT 1');
$stmt->execute([$ref]);
$bulk = $stmt->fetch();
if (!$bulk) json_err('Bulk order not found.', 404);

$body   = get_json_body();
$action = trim($body['action'] ?? '');

// 'confirm' action can be done by the customer who owns the order
// All other actions require admin/staff
if ($action === 'confirm') {
    start_session();
    $userId = $_SESSION['user_id'] ?? null;
    // Allow if logged-in user owns this bulk order, or if admin/staff
    $isOwner = $userId && $bulk['user_id'] == $userId;
    $isStaff = false;
    if (!empty($_SESSION['user_role']) && in_array($_SESSION['user_role'], ['admin','staff','cashier'])) {
        $isStaff = true;
    }
    if (!$isOwner && !$isStaff) json_err('Forbidden', 403);
    $sess = ['full_name' => $_SESSION['user_name'] ?? 'Customer', 'role' => $_SESSION['user_role'] ?? 'customer'];
} else {
    $sess = require_role('admin', 'staff', 'cashier');
}

$handledBy = trim($body['handled_by'] ?? $sess['full_name']);

// Valid status transitions
$transitions = [
    'quote'     => ['pending'],               // admin sets a quote
    'confirm'   => ['quoted'],                // customer/admin confirms
    'process'   => ['confirmed'],             // start preparing
    'deliver'   => ['processing'],            // out for delivery
    'complete'  => ['delivered'],             // done
    'cancel'    => ['pending','quoted','confirmed','processing'],
];

if (!array_key_exists($action, $transitions)) {
    json_err('Invalid action.', 400);
}

if (!in_array($bulk['status'], $transitions[$action])) {
    json_err("Cannot $action a bulk order that is currently '{$bulk['status']}'.", 400);
}

$newStatus = match($action) {
    'quote'    => 'quoted',
    'confirm'  => 'confirmed',
    'process'  => 'processing',
    'deliver'  => 'delivered',
    'complete' => 'completed',
    'cancel'   => 'cancelled',
};

$updates = ['status = ?', 'handled_by = ?', 'updated_at = NOW()'];
$params  = [$newStatus, $handledBy];

if ($action === 'quote') {
    $quotedAmount    = (float)($body['quoted_amount']   ?? 0);
    $quotationNotes  = trim($body['quotation_notes']    ?? '');
    $updates[] = 'quoted_amount = ?';
    $updates[] = 'quotation_notes = ?';
    $params[]  = $quotedAmount;
    $params[]  = $quotationNotes ?: null;
}

if ($action === 'complete') {
    $finalAmount  = (float)($body['final_amount']  ?? $bulk['quoted_amount']);
    $discountType = trim($body['discount_type']    ?? '');  // 'bulk' | 'promo' | ''
    $discountAmt  = (float)($body['discount_amount'] ?? 0);
    // Apply discount to final amount
    if ($discountType && $discountAmt <= 0) {
        $rates        = ['promo' => 0.05, 'bulk' => 0.10];
        $discountAmt  = $finalAmount * ($rates[$discountType] ?? 0);
    }
    $updates[] = 'final_amount = ?';
    $params[]  = max(0, $finalAmount - $discountAmt);
    if ($discountType) {
        $updates[] = 'discount_type = ?';
        $updates[] = 'discount_amount = ?';
        $params[]  = $discountType;
        $params[]  = $discountAmt;
    }
}

if ($action === 'cancel') {
    $cancelReason = trim($body['cancel_reason'] ?? '');
    if (!$cancelReason) json_err('Cancellation reason is required.', 400);
    $updates[] = 'cancel_reason = ?';
    $params[]  = $cancelReason;
}

$params[] = $ref;
$pdo->prepare('UPDATE bulk_orders SET ' . implode(', ', $updates) . ' WHERE bulk_ref = ?')
    ->execute($params);

// ─── Deduct stock when bulk order is completed ────────────────────────────────
if ($action === 'complete') {
    $items = json_decode($bulk['items_json'], true) ?? [];
    foreach ($items as $item) {
        $productId   = isset($item['product_id'])   ? (int)$item['product_id']   : 0;
        $variantId   = isset($item['variant_id'])   ? (int)$item['variant_id']   : 0;
        $qty         = max(1, (int)($item['qty'] ?? 1));
        $variantSize = trim($item['variant_size'] ?? '');
        $name        = trim($item['name']         ?? '');

        // Deduct from variant if variant_id is set
        if ($variantId > 0) {
            $pdo->prepare('UPDATE product_variants SET stock = GREATEST(0, stock - ?) WHERE id = ?')
                ->execute([$qty, $variantId]);
            // Sync parent stock from variants sum
            $vp = $pdo->prepare('SELECT product_id FROM product_variants WHERE id = ? LIMIT 1');
            $vp->execute([$variantId]);
            $vpRow = $vp->fetch();
            if ($vpRow) {
                $pdo->prepare('UPDATE products SET stock = (SELECT COALESCE(SUM(stock),0) FROM product_variants WHERE product_id = ?) WHERE id = ?')
                    ->execute([$vpRow['product_id'], $vpRow['product_id']]);
            }
        // Deduct from product directly if product_id is set
        } elseif ($productId > 0) {
            $pdo->prepare('UPDATE products SET stock = GREATEST(0, stock - ?) WHERE id = ?')
                ->execute([$qty, $productId]);
        // Fallback: match by name
        } elseif ($name) {
            $p = $pdo->prepare('SELECT id FROM products WHERE name = ? LIMIT 1');
            $p->execute([$name]);
            $prod = $p->fetch();
            if ($prod) {
                $pdo->prepare('UPDATE products SET stock = GREATEST(0, stock - ?) WHERE id = ?')
                    ->execute([$qty, $prod['id']]);
            }
        }
    }
}

write_log($handledBy, $sess['role'], "bulk_{$action}", 'bulk_order', $ref,
    "Bulk order $ref status changed to $newStatus by $handledBy.");

// ─── Auto-create delivery record when bulk order moves to processing ──────────
if ($action === 'process') {
    $existingDel = $pdo->prepare('SELECT id FROM deliveries WHERE order_id = ? LIMIT 1');
    $existingDel->execute([$ref]);

    if (!$existingDel->fetch()) {
        // Generate unique DEL ref
        do {
            $delRef    = 'DEL-' . str_pad((string)random_int(100, 99999), 3, '0', STR_PAD_LEFT);
            $delExists = $pdo->prepare('SELECT id FROM deliveries WHERE delivery_ref = ? LIMIT 1');
            $delExists->execute([$delRef]);
        } while ($delExists->fetch());

        // Get customer info from users table if user_id exists
        $deliveryContact = $bulk['contact_number'] ?? '';
        $deliveryAddress = $bulk['address']         ?? '';
        $deliveryName    = $bulk['customer_name']   ?? '';

        if (!empty($bulk['user_id'])) {
            $cu = $pdo->prepare('SELECT full_name, phone, address, town FROM users WHERE id = ? LIMIT 1');
            $cu->execute([$bulk['user_id']]);
            $userData = $cu->fetch();
            if ($userData) {
                $deliveryName    = $userData['full_name'] ?: $deliveryName;
                $deliveryContact = $userData['phone']     ?: $deliveryContact;
                $deliveryAddress = trim(($userData['address'] ?? '') . ' ' . ($userData['town'] ?? '')) ?: $deliveryAddress;
            }
        }

        $pdo->prepare(
            'INSERT INTO deliveries
             (delivery_ref, order_id, customer_name, contact_number, address, items_json, total_amount)
             VALUES (?, ?, ?, ?, ?, ?, ?)'
        )->execute([
            $delRef,
            $ref,
            $deliveryName,
            $deliveryContact ?: null,
            $deliveryAddress ?: null,
            $bulk['items_json'],
            (float)($bulk['quoted_amount'] ?: $bulk['final_amount']),
        ]);

        write_log($handledBy, $sess['role'], 'create_delivery', 'delivery', $delRef,
            "Delivery $delRef auto-created for bulk order $ref.");
    }
}

$stmt->execute([$ref]);
json_ok(bulk_to_dict($stmt->fetch()), 'data');
