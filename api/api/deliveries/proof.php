<?php
// PUT /api/deliveries/{ref}/proof  — driver submits proof of delivery (base64 photo)
require_once __DIR__ . '/../db.php';
require_method('PUT');

$ref = $_GET['ref'] ?? '';
if (!$ref) json_err('Delivery reference required.', 400);

$pdo  = get_db();
$stmt = $pdo->prepare('SELECT * FROM deliveries WHERE delivery_ref = ? LIMIT 1');
$stmt->execute([$ref]);
$delivery = $stmt->fetch();
if (!$delivery) json_err('Delivery not found.', 404);

$body          = get_json_body();
$photoProof    = $body['photoProof']    ?? '';
$driverRemarks = trim($body['driverRemarks'] ?? '');

if (!$photoProof) json_err('Photo proof is required.');

$dateCompleted = date('c');

$pdo->prepare(
    'UPDATE deliveries
     SET photo_proof = ?, driver_remarks = ?, status = ?, date_completed = ?
     WHERE delivery_ref = ?'
)->execute([$photoProof, $driverRemarks, 'delivered', $dateCompleted, $ref]);

$stmt->execute([$ref]);
json_ok(delivery_to_dict($stmt->fetch()), 'data');
