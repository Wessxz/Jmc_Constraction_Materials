<?php
require_once __DIR__ . '/../db.php';
require_once __DIR__ . '/../email.php';
require_method('POST');

$body  = get_json_body();
$email = strtolower(trim($body['email'] ?? ''));

if (!$email) {
    json_err('Email is required.');
}

$pdo  = get_db();
$stmt = $pdo->prepare('SELECT id, full_name, is_verified FROM users WHERE email = ? LIMIT 1');
$stmt->execute([$email]);
$user = $stmt->fetch();

if (!$user) {
    // Return success anyway to avoid user enumeration
    json_response(['success' => true, 'message' => 'If that email exists, a verification link has been sent.']);
}

if ($user['is_verified']) {
    json_response(['success' => true, 'message' => 'Your email is already verified. You can log in.']);
}

$token = bin2hex(random_bytes(32));
$upd   = $pdo->prepare('UPDATE users SET verification_token = ? WHERE id = ?');
$upd->execute([$token, $user['id']]);

send_verification_email($email, $user['full_name'], $token);

json_response(['success' => true, 'message' => 'Verification email resent. Please check your inbox.']);
