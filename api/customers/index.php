<?php
// GET    /api/customers       — list all customers
// DELETE /api/customers/{id}  — delete a customer
require_once __DIR__ . '/../db.php';

$method = $_SERVER['REQUEST_METHOD'];
$id     = isset($_GET['id']) ? (int)$_GET['id'] : null;
$pdo    = get_db();

if ($method === 'GET') {
    $rows = $pdo->query(
        "SELECT id, full_name, email, phone, town, address, is_active, created_at
         FROM users WHERE role = 'customer' ORDER BY created_at DESC"
    )->fetchAll();
    json_ok(array_map(fn($u) => [
        'id'         => (int)$u['id'],
        'full_name'  => $u['full_name'],
        'email'      => $u['email'],
        'phone'      => $u['phone'],
        'town'       => $u['town'],
        'address'    => $u['address'],
        'is_active'  => isset($u['is_active']) ? (int)$u['is_active'] : 1,
        'created_at' => $u['created_at'],
    ], $rows));

} elseif ($method === 'DELETE') {
    if (!$id) json_err('Customer ID required.', 400);

    $stmt = $pdo->prepare('SELECT id, role FROM users WHERE id = ? LIMIT 1');
    $stmt->execute([$id]);
    $user = $stmt->fetch();
    if (!$user)                       json_err('User not found.', 404);
    if ($user['role'] !== 'customer') json_err('Cannot delete non-customer via this endpoint.', 403);

    $pdo->prepare('DELETE FROM users WHERE id = ?')->execute([$id]);
    json_response(['success' => true, 'message' => 'Customer deleted.']);

} else {
    json_err('Method not allowed.', 405);
}
