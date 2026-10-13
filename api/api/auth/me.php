<?php
require_once __DIR__ . '/../db.php';
require_method('GET');

start_session();

if (empty($_SESSION['user_id'])) {
    json_response(['success' => false, 'message' => 'Not logged in.'], 401);
}

$pdo  = get_db();
$stmt = $pdo->prepare('SELECT id, full_name, email, phone, town, address, role FROM users WHERE id = ? LIMIT 1');
$stmt->execute([$_SESSION['user_id']]);
$user = $stmt->fetch();

if (!$user) {
    // Session refers to a deleted user
    session_destroy();
    json_response(['success' => false, 'message' => 'User not found.'], 401);
}

json_response([
    'success' => true,
    'user'    => [
        'id'        => (int)$user['id'],
        'full_name' => $user['full_name'],
        'email'     => $user['email'],
        'phone'     => $user['phone'],
        'town'      => $user['town'],
        'address'   => $user['address'],
        'role'      => $user['role'],
    ],
]);
