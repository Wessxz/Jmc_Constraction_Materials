<?php
// GET  /api/deliveries  — list all deliveries
// POST /api/deliveries  — create delivery
require_once __DIR__ . '/../db.php';

$method = $_SERVER['REQUEST_METHOD'];
$pdo    = get_db();

if ($method === 'GET') {
    $rows = $pdo->query('SELECT * FROM deliveries ORDER BY created_at DESC')->fetchAll();
    json_ok(array_map('delivery_to_dict', $rows));

} elseif ($method === 'POST') {
    $body          = get_json_body();
    $orderId       = trim($body['orderId']       ?? '');
    $customerName  = trim($body['customerName']  ?? '');
    $contactNumber = trim($body['contactNumber'] ?? '');
    $address       = trim($body['address']       ?? '');
    $items         = $body['items']              ?? [];
    $totalAmount   = (float)($body['totalAmount']   ?? 0);
    $plateNumber   = trim($body['plateNumber']   ?? '');

    if (!$customerName) json_err('Customer name is required.');
    if (empty($items))  json_err('Delivery must contain at least one item.');

    // Generate unique DEL-XXX ref
    do {
        $ref    = 'DEL-' . str_pad((string)random_int(100, 999), 3, '0', STR_PAD_LEFT);
        $exists = $pdo->prepare('SELECT id FROM deliveries WHERE delivery_ref = ? LIMIT 1');
        $exists->execute([$ref]);
    } while ($exists->fetch());

    $pdo->prepare(
        'INSERT INTO deliveries
         (delivery_ref, order_id, customer_name, contact_number, address, items_json, total_amount, plate_number)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
    )->execute([
        $ref, $orderId ?: null, $customerName,
        $contactNumber ?: null, $address ?: null,
        json_encode($items), $totalAmount, $plateNumber,
    ]);

    $row = $pdo->prepare('SELECT * FROM deliveries WHERE delivery_ref = ? LIMIT 1');
    $row->execute([$ref]);
    json_ok(delivery_to_dict($row->fetch()), 'data');

} else {
    json_err('Method not allowed.', 405);
}
