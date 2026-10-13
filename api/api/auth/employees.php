<?php
require_once __DIR__ . '/../db.php';

$method = $_SERVER['REQUEST_METHOD'];
$id     = isset($_GET['id']) ? (int)$_GET['id'] : null;

if ($method === 'GET') {
    // List all non-customer, non-admin employees
    require_role('admin');
    $pdo  = get_db();
    $stmt = $pdo->query(
        "SELECT id, full_name, email, phone, role, created_at
         FROM users
         WHERE role IN ('staff','driver','cashier')
         ORDER BY created_at DESC"
    );
    $rows = $stmt->fetchAll();
    $out  = array_map(fn($u) => [
        'id'         => (int)$u['id'],
        'full_name'  => $u['full_name'],
        'email'      => $u['email'],
        'phone'      => $u['phone'],
        'role'       => $u['role'],
        'created_at' => $u['created_at'],
    ], $rows);
    json_ok($out);

} elseif ($method === 'DELETE') {
    require_role('admin');
    if (!$id) json_err('Employee ID required.', 400);

    $pdo  = get_db();
    $stmt = $pdo->prepare('SELECT id, role FROM users WHERE id = ? LIMIT 1');
    $stmt->execute([$id]);
    $emp  = $stmt->fetch();
    if (!$emp) json_err('Employee not found.', 404);

    if (in_array($emp['role'], ['admin', 'customer'], true)) {
        json_err('Cannot delete admin or customer accounts through this endpoint.', 403);
    }

    $pdo->prepare('DELETE FROM users WHERE id = ?')->execute([$id]);
    json_response(['success' => true, 'message' => 'Employee deleted.']);

} else {
    json_err('Method not allowed.', 405);
}
