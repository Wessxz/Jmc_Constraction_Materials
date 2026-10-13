<?php
require_once __DIR__ . '/../db.php';
// Accepts GET ?token=xxx  — redirects browser to login page

$token = trim($_GET['token'] ?? '');

if (!$token) {
    http_response_code(400);
    echo 'Missing verification token.';
    exit;
}

$pdo  = get_db();
$stmt = $pdo->prepare('SELECT id FROM users WHERE verification_token = ? LIMIT 1');
$stmt->execute([$token]);
$user = $stmt->fetch();

if (!$user) {
    http_response_code(400);
    echo 'Invalid or already-used verification token.';
    exit;
}

$upd = $pdo->prepare('UPDATE users SET is_verified = 1, verification_token = NULL WHERE id = ?');
$upd->execute([$user['id']]);

// Redirect to login page with verified flag
header('Location: /login.html?verified=1');
exit;
