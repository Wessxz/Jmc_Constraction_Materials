<?php
// GET /api/deliveries/driver/{name}  — get deliveries assigned to a driver
require_once __DIR__ . '/../db.php';
require_method('GET');

$name = urldecode($_GET['name'] ?? '');
if (!$name) json_err('Driver name is required.', 400);

$pdo  = get_db();
$stmt = $pdo->prepare(
    'SELECT * FROM deliveries
     WHERE LOWER(delivery_person) = LOWER(?)
     ORDER BY created_at DESC'
);
$stmt->execute([$name]);
$rows = $stmt->fetchAll();

json_ok(array_map('delivery_to_dict', $rows));
