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

$pdo->prepare('UPDATE deliveries SET status = ? WHERE delivery_ref = ?')
    ->execute([$status, $ref]);

$stmt->execute([$ref]);
json_ok(delivery_to_dict($stmt->fetch()), 'data');
