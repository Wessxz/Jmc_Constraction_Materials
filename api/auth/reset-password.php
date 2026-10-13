<?php
error_reporting(E_ALL);
ini_set('display_errors', 1);

require_once __DIR__ . '/../db.php';
require_method('POST');

try {
    $body     = get_json_body();
    $token    = trim($body['token'] ?? '');
    $password = $body['password'] ?? '';

    if (!$token || !$password) {
        json_err('Token and password are required.');
    }

    if (strlen($password) < 6) {
        json_err('Password must be at least 6 characters.');
    }

    $pdo = get_db();

    // Verify token (removed time check for now to debug)
    $stmt = $pdo->prepare(
        'SELECT * FROM password_resets 
         WHERE token = ? AND used = 0 
         LIMIT 1'
    );
    $stmt->execute([$token]);
    $reset = $stmt->fetch();

    if (!$reset) {
        json_err('Invalid or expired reset token. Token not found or already used.', 400);
    }

    // Check expiration manually
    $expiresTime = strtotime($reset['expires_at']);
    $currentTime = time();
    
    if ($currentTime > $expiresTime) {
        json_err('Reset token has expired. Please request a new password reset.', 400);
    }

    // Get user
    $stmt = $pdo->prepare('SELECT * FROM users WHERE email = ? LIMIT 1');
    $stmt->execute([$reset['email']]);
    $user = $stmt->fetch();

    if (!$user) {
        json_err('User not found.', 404);
    }

    // Update password
    $passwordHash = password_hash($password, PASSWORD_BCRYPT);
    $stmt = $pdo->prepare('UPDATE users SET password_hash = ? WHERE id = ?');
    $stmt->execute([$passwordHash, $user['id']]);

    // Mark token as used
    $stmt = $pdo->prepare('UPDATE password_resets SET used = 1 WHERE token = ?');
    $stmt->execute([$token]);

    // Log the activity
    write_log(
        $user['full_name'],
        $user['role'],
        'password_reset',
        'user',
        (string)$user['id'],
        'Password was reset via email'
    );

    json_response([
        'success' => true,
        'message' => 'Password has been reset successfully. You can now login with your new password.'
    ]);

} catch (Exception $e) {
    error_log('Reset password error: ' . $e->getMessage());
    json_response(['success' => false, 'error' => $e->getMessage()], 500);
}
