<?php
// PUT /api/auth/toggle-account-status — Enable/Disable user account (admin only)
require_once __DIR__ . '/../db.php';

require_method('PUT');

// Check authentication
start_session();
if (empty($_SESSION['user_id'])) {
    json_err('Unauthorized. Please login.', 401);
}

$userRole = $_SESSION['user_role'] ?? 'customer';
if (!in_array($userRole, ['admin', 'superadmin'], true)) {
    json_err('Forbidden. Admin access required.', 403);
}

$body   = get_json_body();
$userId = (int)($body['user_id'] ?? 0);
$status = isset($body['is_active']) ? (bool)$body['is_active'] : null;

if (!$userId) {
    json_err('User ID is required.');
}

if ($status === null) {
    json_err('Status (is_active) is required.');
}

$pdo  = get_db();
$stmt = $pdo->prepare('SELECT id, full_name, email, role, is_active FROM users WHERE id = ? LIMIT 1');
$stmt->execute([$userId]);
$user = $stmt->fetch();

if (!$user) {
    json_err('User not found.', 404);
}

// Prevent disabling superadmin accounts
if ($user['role'] === 'superadmin' && !$status) {
    json_err('Cannot disable superadmin accounts.', 403);
}

// Update account status
$pdo->prepare('UPDATE users SET is_active = ? WHERE id = ?')
    ->execute([$status ? 1 : 0, $userId]);

$action = $status ? 'enabled' : 'disabled';
write_log(
    $_SESSION['user_name'] ?? 'Admin',
    $_SESSION['user_role'] ?? 'admin',
    "account_$action",
    'user',
    $userId,
    "Account for {$user['full_name']} ({$user['email']}) has been $action."
);

json_ok([
    'user_id'   => $userId,
    'is_active' => $status,
    'message'   => "Account has been $action successfully.",
]);
