<?php
require_once __DIR__ . '/../db.php';
require_once __DIR__ . '/../email.php';
require_method('POST');

try {
    $body  = get_json_body();
    $email = trim($body['email'] ?? '');

    if (!$email) {
        json_err('Email is required.');
    }

    $pdo = get_db();

    // Check if password_resets table exists
    $stmt = $pdo->query("SHOW TABLES LIKE 'password_resets'");
    if ($stmt->rowCount() === 0) {
        json_err('System not configured. Please contact administrator. (Table missing)', 500);
    }

    // Check if user exists
    $stmt = $pdo->prepare('SELECT * FROM users WHERE email = ? LIMIT 1');
    $stmt->execute([$email]);
    $user = $stmt->fetch();

    // Always return success to prevent email enumeration attacks
    if (!$user) {
        json_response([
            'success' => true,
            'message' => 'If an account with that email exists, a password reset link has been sent.'
        ]);
    }

    // Generate secure token
    $token = bin2hex(random_bytes(32));
    $expires = date('Y-m-d H:i:s', time() + 3600); // 1 hour expiry

    // Store token in database
    $stmt = $pdo->prepare(
        'INSERT INTO password_resets (email, token, expires_at) 
         VALUES (?, ?, ?)
         ON DUPLICATE KEY UPDATE token = VALUES(token), expires_at = VALUES(expires_at), created_at = NOW()'
    );
    $stmt->execute([$email, $token, $expires]);

    // Send email
    $sent = send_password_reset_email($email, $user['full_name'], $token);

    json_response([
        'success' => true,
        'message' => 'If an account with that email exists, a password reset link has been sent.',
        'email_sent' => $sent
    ]);

} catch (Exception $e) {
    error_log('Forgot password error: ' . $e->getMessage());
    json_err('An error occurred. Please try again later.', 500);
}
