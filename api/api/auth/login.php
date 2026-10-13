<?php
require_once __DIR__ . '/../db.php';
require_method('POST');

$body  = get_json_body();
$email = trim($body['email'] ?? '');
$pass  = $body['password'] ?? '';

if (!$email || !$pass) {
    json_err('Email and password are required.');
}

$pdo  = get_db();
$stmt = $pdo->prepare('SELECT * FROM users WHERE email = ? LIMIT 1');
$stmt->execute([$email]);
$user = $stmt->fetch();

if (!$user || !password_verify($pass, $user['password_hash'])) {
    json_err('Invalid email or password.', 401);
}

// Block unverified customers
if ($user['role'] === 'customer' && empty($user['is_verified'])) {
    json_response([
        'success'              => false,
        'pending_verification' => true,
        'message'              => 'Please verify your email before logging in.',
    ], 403);
}

start_session();
$_SESSION['user_id']   = $user['id'];
$_SESSION['user_role'] = $user['role'];
$_SESSION['user_name'] = $user['full_name'];

$out = [
    'id'        => (int)$user['id'],
    'full_name' => $user['full_name'],
    'email'     => $user['email'],
    'phone'     => $user['phone'],
    'town'      => $user['town'],
    'address'   => $user['address'],
    'role'      => $user['role'],
];

json_response(['success' => true, 'user' => $out]);
