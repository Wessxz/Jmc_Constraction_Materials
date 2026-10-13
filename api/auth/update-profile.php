<?php
require_once __DIR__ . '/../db.php';
require_method('PUT');

$sess = require_auth();
$body = get_json_body();
$pdo  = get_db();

// Fetch current user
$stmt = $pdo->prepare('SELECT * FROM users WHERE id = ? LIMIT 1');
$stmt->execute([$sess['id']]);
$user = $stmt->fetch();
if (!$user) json_err('User not found.', 404);

$fields = [];
$params = [];

// Basic profile fields
foreach (['full_name', 'phone', 'town', 'address'] as $field) {
    if (array_key_exists($field, $body)) {
        $fields[] = "$field = ?";
        $params[]  = trim($body[$field]);
    }
}

// Email change
if (!empty($body['email'])) {
    $newEmail = strtolower(trim($body['email']));
    if ($newEmail !== $user['email']) {
        if (!filter_var($newEmail, FILTER_VALIDATE_EMAIL)) {
            json_err('Invalid email address.');
        }
        $dup = $pdo->prepare('SELECT id FROM users WHERE email = ? AND id != ? LIMIT 1');
        $dup->execute([$newEmail, $sess['id']]);
        if ($dup->fetch()) json_err('That email is already in use.');
        $fields[] = 'email = ?';
        $params[]  = $newEmail;
    }
}

// Password change
if (!empty($body['new_password'])) {
    $currentPass = $body['current_password'] ?? '';
    if (!password_verify($currentPass, $user['password_hash'])) {
        json_err('Current password is incorrect.');
    }
    if (strlen($body['new_password']) < 6) {
        json_err('New password must be at least 6 characters.');
    }
    $fields[] = 'password_hash = ?';
    $params[]  = password_hash($body['new_password'], PASSWORD_BCRYPT);
}

if (empty($fields)) {
    json_err('No fields to update.');
}

$params[] = $sess['id'];
$sql = 'UPDATE users SET ' . implode(', ', $fields) . ' WHERE id = ?';
$pdo->prepare($sql)->execute($params);

// Return fresh user
$stmt->execute([$sess['id']]);
$user = $stmt->fetch();

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
