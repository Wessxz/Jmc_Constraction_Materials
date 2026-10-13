<?php
require_once __DIR__ . '/../db.php';
require_method('POST');
require_role('admin');

$body      = get_json_body();
$fullName  = trim($body['full_name'] ?? '');
$email     = strtolower(trim($body['email']     ?? ''));
$password  = $body['password']  ?? '';
$phone     = trim($body['phone']     ?? '');
$role      = trim($body['role']      ?? 'staff');

$allowedRoles = ['staff', 'driver', 'cashier'];
if (!in_array($role, $allowedRoles, true)) {
    json_err('Invalid role. Allowed: staff, driver, cashier.');
}
if (!$fullName || !$email || !$password) {
    json_err('Full name, email, and password are required.');
}
if (!filter_var($email, FILTER_VALIDATE_EMAIL)) {
    json_err('Invalid email address.');
}
if (strlen($password) < 6) {
    json_err('Password must be at least 6 characters.');
}

$pdo = get_db();
$dup = $pdo->prepare('SELECT id FROM users WHERE email = ? LIMIT 1');
$dup->execute([$email]);
if ($dup->fetch()) {
    json_err('An account with that email already exists.');
}

$hash = password_hash($password, PASSWORD_BCRYPT);
$stmt = $pdo->prepare(
    'INSERT INTO users (full_name, email, password_hash, phone, role, is_verified)
     VALUES (?, ?, ?, ?, ?, 1)'
);
$stmt->execute([$fullName, $email, $hash, $phone ?: null, $role]);
$userId = (int)$pdo->lastInsertId();

json_response([
    'success' => true,
    'user'    => [
        'id'        => $userId,
        'full_name' => $fullName,
        'email'     => $email,
        'phone'     => $phone ?: null,
        'role'      => $role,
    ],
], 201);
