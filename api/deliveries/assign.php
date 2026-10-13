<?php
// PUT /api/deliveries/{ref}/assign  — assign a driver
require_once __DIR__ . '/../db.php';
require_method('PUT');

$ref = $_GET['ref'] ?? '';
if (!$ref) json_err('Delivery reference required.', 400);

$pdo  = get_db();
$stmt = $pdo->prepare('SELECT * FROM deliveries WHERE delivery_ref = ? LIMIT 1');
$stmt->execute([$ref]);
$delivery = $stmt->fetch();
if (!$delivery) json_err('Delivery not found.', 404);

$body        = get_json_body();
$driverName  = trim($body['driverName']  ?? '');
$notes       = trim($body['notes']       ?? '');
$plateNumber = trim($body['plateNumber'] ?? '');

if (!$driverName) json_err('Driver name is required.');

$dateAssigned = date('c'); // ISO 8601

$pdo->prepare(
    'UPDATE deliveries
     SET delivery_person = ?, notes = ?, date_assigned = ?, status = ?, plate_number = ?
     WHERE delivery_ref = ?'
)->execute([$driverName, $notes, $dateAssigned, 'out_for_delivery', $plateNumber ?: $delivery['plate_number'], $ref]);

// Order status stays as 'processing' while driver is assigned
// It will only update to 'delivered' when driver uploads proof of delivery

$stmt->execute([$ref]);
json_ok(delivery_to_dict($stmt->fetch()), 'data');
