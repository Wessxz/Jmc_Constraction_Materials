<?php
// ─── Database connection & shared helpers ────────────────────────────────────
error_reporting(0);
ini_set('display_errors', 0);

// Load .env from project root
$envPath = __DIR__ . '/../.env';
if (file_exists($envPath)) {
    foreach (file($envPath, FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES) as $line) {
        if (str_starts_with(trim($line), '#') || !str_contains($line, '=')) continue;
        [$key, $val] = explode('=', $line, 2);
        $_ENV[trim($key)] = trim($val);
        putenv(trim($key) . '=' . trim($val));
    }
}

define('DB_HOST',     $_ENV['DB_HOST']     ?? '127.0.0.1');
define('DB_PORT',     $_ENV['DB_PORT']     ?? '3306');
define('DB_USER',     $_ENV['DB_USER']     ?? 'root');
define('DB_PASS',     $_ENV['DB_PASSWORD'] ?? '');
define('DB_NAME',     $_ENV['DB_NAME']     ?? 'jmc_hardware');
define('SECRET_KEY',  $_ENV['SECRET_KEY']  ?? 'jmc-secret-key-change-in-production');
define('BASE_URL',    $_ENV['BASE_URL']    ?? 'http://localhost');
define('MAIL_USER',   $_ENV['MAIL_USERNAME'] ?? '');
define('MAIL_PASS',   $_ENV['MAIL_PASSWORD'] ?? '');
define('UPLOAD_DIR',  __DIR__ . '/../uploads/');
define('UPLOAD_URL',  'uploads/');

// ─── PDO singleton ────────────────────────────────────────────────────────────
function get_db(): PDO {
    static $pdo = null;
    if ($pdo === null) {
        $dsn = sprintf('mysql:host=%s;port=%s;dbname=%s;charset=utf8mb4',
            DB_HOST, DB_PORT, DB_NAME);
        $pdo = new PDO($dsn, DB_USER, DB_PASS, [
            PDO::ATTR_ERRMODE            => PDO::ERRMODE_EXCEPTION,
            PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
            PDO::ATTR_EMULATE_PREPARES   => false,
        ]);
    }
    return $pdo;
}

// ─── Response helpers ─────────────────────────────────────────────────────────
function json_response(array $data, int $status = 200): never {
    http_response_code($status);
    header('Content-Type: application/json');
    echo json_encode($data);
    exit;
}

function json_ok(mixed $data = null, string $key = 'data'): never {
    $res = ['success' => true];
    if ($data !== null) $res[$key] = $data;
    json_response($res);
}

function json_err(string $message, int $status = 400): never {
    json_response(['success' => false, 'error' => $message], $status);
}

// ─── Request helpers ──────────────────────────────────────────────────────────
function get_json_body(): array {
    $raw = file_get_contents('php://input');
    if (!$raw) return [];
    $decoded = json_decode($raw, true);
    return is_array($decoded) ? $decoded : [];
}

function require_method(string ...$methods): void {
    if (!in_array($_SERVER['REQUEST_METHOD'], $methods, true)) {
        json_err('Method not allowed', 405);
    }
}

// ─── Session helpers ──────────────────────────────────────────────────────────
function start_session(): void {
    if (session_status() === PHP_SESSION_NONE) {
        session_set_cookie_params([
            'lifetime' => 86400,
            'path'     => '/',
            'secure'   => false,   // set true when HTTPS
            'httponly' => true,
            'samesite' => 'Lax',
        ]);
        session_start();
    }
}

function current_user_id(): ?int {
    start_session();
    return isset($_SESSION['user_id']) ? (int)$_SESSION['user_id'] : null;
}

function require_auth(): array {
    start_session();
    if (empty($_SESSION['user_id'])) {
        json_err('Unauthorized', 401);
    }
    return [
        'id'        => (int)$_SESSION['user_id'],
        'role'      => $_SESSION['user_role']  ?? 'customer',
        'full_name' => $_SESSION['user_name']  ?? '',
    ];
}

function require_role(string ...$roles): array {
    $user = require_auth();
    if (!in_array($user['role'], $roles, true)) {
        json_err('Forbidden', 403);
    }
    return $user;
}

// ─── CORS headers ─────────────────────────────────────────────────────────────
function set_cors(): void {
    $origin = $_SERVER['HTTP_ORIGIN'] ?? '*';
    header("Access-Control-Allow-Origin: $origin");
    header('Access-Control-Allow-Credentials: true');
    header('Access-Control-Allow-Methods: GET, POST, PUT, DELETE, OPTIONS');
    header('Access-Control-Allow-Headers: Content-Type, Authorization');
    if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
        http_response_code(204);
        exit;
    }
}

// ─── Product helper: build full product dict including variants ───────────────
function product_to_dict(array $p): array {
    $pdo = get_db();
    $stmt = $pdo->prepare('SELECT * FROM product_variants WHERE product_id = ? ORDER BY id');
    $stmt->execute([$p['id']]);
    $variants = $stmt->fetchAll();
    $reserved = (int)($p['reserved_stock'] ?? 0);
    return [
        'id'               => (int)$p['id'],
        'name'             => $p['name'],
        'price'            => (float)$p['price'],
        'category'         => $p['category'],
        'stock'            => (int)$p['stock'],
        'reserved_stock'   => $reserved,
        'available_stock'  => max(0, (int)$p['stock'] - $reserved),
        'minQuantity'      => (int)$p['min_quantity'],
        'criticalQuantity' => (int)$p['critical_quantity'],
        'unit'             => $p['unit'],
        'specifications'   => json_decode($p['specifications'] ?? '[]', true) ?? [],
        'discount'         => (float)$p['discount'],
        'image'            => $p['image'],
        'sku'              => $p['sku'],
        'created_at'       => $p['created_at'],
        'variants'         => array_map(fn($v) => [
            'id'              => (int)$v['id'],
            'size'            => $v['size'],
            'price'           => (float)$v['price'],
            'stock'           => (int)$v['stock'],
            'reserved_stock'  => (int)($v['reserved_stock'] ?? 0),
            'available_stock' => max(0, (int)$v['stock'] - (int)($v['reserved_stock'] ?? 0)),
            'min_stock'       => (int)($v['min_stock'] ?? 5),
        ], $variants),
    ];
}

// ─── Order helper: build full order dict with user info ──────────────────────
function order_to_dict(array $o): array {
    $pdo = get_db();
    $user = null;
    if (!empty($o['user_id'])) {
        $s = $pdo->prepare('SELECT full_name, email, phone, town, address FROM users WHERE id = ?');
        $s->execute([$o['user_id']]);
        $user = $s->fetch() ?: null;
    }
    $dict = [
        'id'           => (int)$o['id'],
        'order_ref'    => $o['order_ref'],
        'user_id'      => $o['user_id'] ? (int)$o['user_id'] : null,
        'customer_name'=> $o['customer_name'],
        'date'         => $o['date'],
        'total'        => (float)$o['total'],
        'status'       => $o['status'],
        'cancel_reason'=> $o['cancel_reason'] ?? null,
        'cancel_notes' => $o['cancel_notes']  ?? null,
        'order_type'   => $o['order_type'],
        'items'        => json_decode($o['items_json'] ?? '[]', true) ?? [],
        'created_at'   => $o['created_at'],
    ];
    if ($user) {
        $dict['customer_email']   = $user['email'];
        $dict['customer_phone']   = $user['phone'];
        $dict['customer_address'] = $user['address'];
        $dict['customer_town']    = $user['town'];
    }
    return $dict;
}

// ─── Delivery helper ──────────────────────────────────────────────────────────
function delivery_to_dict(array $d): array {
    return [
        'id'              => (int)$d['id'],
        'delivery_ref'    => $d['delivery_ref'],
        'order_id'        => $d['order_id'],
        'customer_name'   => $d['customer_name'],
        'contact_number'  => $d['contact_number'],
        'address'         => $d['address'],
        'items'           => json_decode($d['items_json'] ?? '[]', true) ?? [],
        'total_amount'    => (float)$d['total_amount'],
        'status'          => $d['status'],
        'delivery_person' => $d['delivery_person'],
        'date_assigned'   => $d['date_assigned'],
        'date_completed'  => $d['date_completed'],
        'notes'           => $d['notes'],
        'photo_proof'     => $d['photo_proof'],
        'driver_remarks'  => $d['driver_remarks'],
        'plate_number'    => $d['plate_number'],
        'created_at'      => $d['created_at'],
    ];
}

// ─── Return helper ────────────────────────────────────────────────────────────
function return_to_dict(array $r): array {
    return [
        'id'               => (int)$r['id'],
        'return_ref'       => $r['return_ref'],
        'original_txn_ref' => $r['original_txn_ref'],
        'customer_name'    => $r['customer_name'],
        'reason'           => $r['reason'],
        'items'            => json_decode($r['items_json'] ?? '[]', true) ?? [],
        'refund_amount'    => (float)$r['refund_amount'],
        'status'           => $r['status'],
        'handled_by'       => $r['handled_by'],
        'notes'            => $r['notes'],
        'stock_restored'   => (bool)$r['stock_restored'],
        'created_at'       => $r['created_at'],
    ];
}

// ─── Log helper ───────────────────────────────────────────────────────────────
function write_log(string $actorName, string $actorRole, string $action,
                   string $targetType = '', string $targetId = '', string $details = ''): void {
    $pdo = get_db();
    $stmt = $pdo->prepare(
        'INSERT INTO activity_logs (actor_name, actor_role, action, target_type, target_id, details)
         VALUES (?, ?, ?, ?, ?, ?)'
    );
    $stmt->execute([$actorName, $actorRole, $action, $targetType ?: null, $targetId ?: null, $details]);
}

set_cors();
