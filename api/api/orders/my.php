<?php
// GET /api/orders/my — orders for the logged-in customer
require_once __DIR__ . '/../db.php';
require_method('GET');

$sess = require_auth();
$pdo  = get_db();

$stmt = $pdo->prepare(
    'SELECT * FROM sales WHERE user_id = ? ORDER BY created_at DESC'
);
$stmt->execute([$sess['id']]);
$rows = $stmt->fetchAll();

// Convert sales rows to order format
$orders = array_map(function($row) {
    return [
        'id'              => (int)$row['id'],
        'order_ref'       => $row['order_ref'],
        'user_id'         => $row['user_id'] ? (int)$row['user_id'] : null,
        'customer_name'   => $row['customer_name'],
        'date'            => $row['date'],
        'subtotal'        => (float)$row['subtotal'],
        'discount_type'   => $row['discount_type'] ?? null,
        'discount_amount' => (float)($row['discount_amount'] ?? 0),
        'total'           => (float)$row['total'],
        'status'          => $row['status'],
        'cancel_reason'   => $row['cancel_reason'] ?? null,
        'cancel_notes'    => $row['cancel_notes'] ?? null,
        'order_type'      => $row['order_type'],
        'items'           => json_decode($row['items_json'] ?? '[]', true) ?? [],
        'created_at'      => $row['created_at'],
    ];
}, $rows);

json_ok($orders);
