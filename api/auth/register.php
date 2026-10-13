<?php
require_once __DIR__ . '/../db.php';
require_once __DIR__ . '/../email.php';
require_method('POST');

$body      = get_json_body();
$fullName  = trim($body['full_name']  ?? '');
$email     = strtolower(trim($body['email']    ?? ''));
$password  = $body['password']  ?? '';
$phone     = trim($body['phone']     ?? '');
$town      = trim($body['town']      ?? '');
$address   = trim($body['address']   ?? '');
$role      = trim($body['role']      ?? 'customer');

if (!in_array($role, ['customer'], true)) {
    $role = 'customer';
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

// Validate phone number: must be exactly 11 digits, numbers only
if ($phone && !preg_match('/^\d{11}$/', $phone)) {
    json_err('Phone number must be exactly 11 digits (numbers only).');
}

$pdo = get_db();

$dup = $pdo->prepare('SELECT id FROM users WHERE email = ? LIMIT 1');
$dup->execute([$email]);
if ($dup->fetch()) {
    json_err('An account with that email already exists.');
}

$hash  = password_hash($password, PASSWORD_BCRYPT);
$token = bin2hex(random_bytes(32));

// is_verified = 0 — must verify email before logging in
$stmt = $pdo->prepare(
    'INSERT INTO users (full_name, email, password_hash, phone, town, address, role, is_verified, verification_token)
     VALUES (?, ?, ?, ?, ?, ?, ?, 0, ?)'
);
$stmt->execute([$fullName, $email, $hash, $phone ?: null, $town ?: null, $address ?: null, $role, $token]);

// Send verification email — registration still succeeds even if email fails
try {
    send_verification_email($email, $fullName, $token);
} catch (\Throwable $e) {
    error_log("Verification email failed for $email: " . $e->getMessage());
}

json_response([
    'success'              => true,
    'pending_verification' => true,
    'message'              => 'Registration successful. Please check your email to verify your account.',
], 201);
