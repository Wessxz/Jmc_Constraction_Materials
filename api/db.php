<?php
// ─── Database connection & shared helpers ────────────────────────────────────
error_reporting(E_ALL);
ini_set('display_errors', 1);
ini_set('log_errors', 1);
ini_set('error_log', __DIR__ . '/../error.log');

// Load .env from project root
$envPath = __DIR__ . '/../.env';
if (file_exists($envPath)) {
    foreach (file($envPath, FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES) as $line) {
        $line = trim($line);
        if ($line === '' || $line[0] === '#' || strpos($line, '=') === false) continue;
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
            'secure'   => false,    // Set to false for localhost (no HTTPS)
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
        'availability_type' => $p['availability_type'] ?? 'both',
        'bulk_min_quantity' => isset($p['bulk_min_quantity']) ? (int)$p['bulk_min_quantity'] : null,
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
        'id'              => (int)$o['id'],
        'order_ref'       => $o['order_ref'],
        'user_id'         => $o['user_id'] ? (int)$o['user_id'] : null,
        'customer_name'   => $o['customer_name'],
        'date'            => $o['date'],
        'subtotal'        => (float)($o['subtotal'] ?? $o['total']),
        'discount_type'   => $o['discount_type'] ?? null,
        'discount_amount' => (float)($o['discount_amount'] ?? 0),
        'total'           => (float)$o['total'],
        'status'          => $o['status'],
        'cancel_reason'   => $o['cancel_reason'] ?? null,
        'cancel_notes'    => $o['cancel_notes']  ?? null,
        'order_type'      => $o['order_type'],
        'items'           => json_decode($o['items_json'] ?? '[]', true) ?? [],
        'pickup_ready_at' => $o['pickup_ready_at'] ?? null,
        'pickup_expires_at' => $o['pickup_expires_at'] ?? null,
        'created_at'      => $o['created_at'],
    ];
    if ($user) {
        $dict['customer_email']   = $user['email'];
        $dict['customer_phone']   = $user['phone'];
        $dict['customer_address'] = $user['address'];
        $dict['customer_town']    = $user['town'];
    }
    return $dict;
}

// ─── Sale helper: build full sale dict (unified orders+transactions) ──────────
function sale_to_dict(array $s): array {
    $pdo = get_db();
    $user = null;
    if (!empty($s['user_id'])) {
        $stmt = $pdo->prepare('SELECT full_name, email, phone, town, address FROM users WHERE id = ?');
        $stmt->execute([$s['user_id']]);
        $user = $stmt->fetch() ?: null;
    }
    
    $dict = [
        'id'              => (int)$s['id'],
        'order_ref'       => $s['order_ref'],
        'user_id'         => $s['user_id'] ? (int)$s['user_id'] : null,
        'customer_name'   => $s['customer_name'],
        'customer_phone'  => $s['customer_phone'],
        'customer_address' => $s['customer_address'],
        'date'            => $s['date'],
        'subtotal'        => (float)$s['subtotal'],
        'discount_type'   => $s['discount_type'] ?? null,
        'discount_amount' => (float)($s['discount_amount'] ?? 0),
        'total'           => (float)$s['total'],
        'tendered'        => $s['tendered'] ? (float)$s['tendered'] : null,
        'change'          => $s['change'] ? (float)$s['change'] : null,
        'status'          => $s['status'],
        'cancel_reason'   => $s['cancel_reason'] ?? null,
        'cancel_notes'    => $s['cancel_notes'] ?? null,
        'order_type'      => $s['order_type'],
        'items'           => json_decode($s['items_json'] ?? '[]', true) ?? [],
        'pickup_ready_at' => $s['pickup_ready_at'] ?? null,
        'pickup_expires_at' => $s['pickup_expires_at'] ?? null,
        'created_at'      => $s['created_at'],
        'updated_at'      => $s['updated_at'],
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
        'deliveryRef'     => $d['delivery_ref'],
        'order_id'        => $d['order_id'],
        'orderId'         => $d['order_id'],
        'customer_name'   => $d['customer_name'],
        'customerName'    => $d['customer_name'],
        'contact_number'  => $d['contact_number'],
        'contactNumber'   => $d['contact_number'],
        'address'         => $d['address'],
        'items'           => json_decode($d['items_json'] ?? '[]', true) ?? [],
        'total_amount'    => (float)$d['total_amount'],
        'totalAmount'     => (float)$d['total_amount'],
        'status'          => $d['status'],
        'delivery_person' => $d['delivery_person'],
        'deliveryPerson'  => $d['delivery_person'],
        'date_assigned'   => $d['date_assigned'],
        'dateAssigned'    => $d['date_assigned'],
        'date_completed'  => $d['date_completed'],
        'dateCompleted'   => $d['date_completed'],
        'delivery_count'  => (int)($d['delivery_count'] ?? 1),
        'deliveryCount'   => (int)($d['delivery_count'] ?? 1),
        'notes'           => $d['notes'],
        'photo_proof'     => $d['photo_proof'],
        'photoProof'      => $d['photo_proof'],
        'driver_remarks'  => $d['driver_remarks'],
        'driverRemarks'   => $d['driver_remarks'],
        'plate_number'    => $d['plate_number'],
        'plateNumber'     => $d['plate_number'],
        'truck_batch_id'  => isset($d['truck_batch_id']) ? (int)$d['truck_batch_id'] : null,
        'created_at'      => $d['created_at'],
        'createdAt'       => $d['created_at'],
    ];
}

// ─── Batch auto-complete helper ───────────────────────────────────────────────
// Call this after any delivery is marked 'delivered'.
// If ALL deliveries in the batch are now delivered/failed, mark the batch as 'completed'.
function maybe_complete_batch(PDO $pdo, int $batchId): void {
    if ($batchId <= 0) return;
    try {
        // Count deliveries in this batch that are NOT yet in a final state
        $stmt = $pdo->prepare(
            "SELECT COUNT(*) FROM deliveries
             WHERE truck_batch_id = ? AND status NOT IN ('delivered','failed')"
        );
        $stmt->execute([$batchId]);
        $remaining = (int)$stmt->fetchColumn();

        if ($remaining === 0) {
            $pdo->prepare(
                "UPDATE truck_batches SET status = 'completed' WHERE id = ? AND status != 'completed'"
            )->execute([$batchId]);
        }
    } catch (\Exception $e) { /* non-fatal */ }
}

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

// ─── Cancellation helper ─────────────────────────────────────────────────────
function cancellation_to_dict(array $c): array {
    return [
        'id'            => (int)$c['id'],
        'cancel_ref'    => $c['cancel_ref'],
        'order_ref'     => $c['order_ref'],
        'customer_name' => $c['customer_name'],
        'cancel_reason' => $c['cancel_reason'],
        'cancel_notes'  => $c['cancel_notes'],
        'items'         => json_decode($c['items_json'] ?? '[]', true) ?? [],
        'total_amount'  => (float)$c['total_amount'],
        'status'        => $c['status'],
        'reviewed_by'   => $c['reviewed_by'],
        'review_notes'  => $c['review_notes'],
        'created_at'    => $c['created_at'],
    ];
}

// ─── Bulk Order helper ───────────────────────────────────────────────────────
function bulk_to_dict(array $b): array {
    return [
        'id'              => (int)$b['id'],
        'bulk_ref'        => $b['bulk_ref'],
        'order_source'    => $b['order_source'],
        'customer_name'   => $b['customer_name'],
        'contact_number'  => $b['contact_number'],
        'email'           => $b['email'],
        'address'         => $b['address'],
        'project_type'    => $b['project_type'],
        'preferred_date'  => $b['preferred_date'],
        'items'           => json_decode($b['items_json'] ?? '[]', true) ?? [],
        'notes'           => $b['notes'],
        'quoted_amount'   => (float)$b['quoted_amount'],
        'final_amount'    => (float)$b['final_amount'],
        'discount_type'   => $b['discount_type']   ?? null,
        'discount_amount' => (float)($b['discount_amount'] ?? 0),
        'quotation_notes' => $b['quotation_notes'],
        'status'          => $b['status'],
        'handled_by'      => $b['handled_by'],
        'cancel_reason'   => $b['cancel_reason'],
        'user_id'         => $b['user_id'] ? (int)$b['user_id'] : null,
        'created_at'      => $b['created_at'],
        'updated_at'      => $b['updated_at'],
    ];
}

// ─── Stock deduction helper ───────────────────────────────────────────────────
// Deducts physical stock + releases reservation for all items in an order.
// Safe to call multiple times — checks prevStatus to avoid double-deducting.
// Call this whenever an order moves to 'delivered' or 'completed'.
function deduct_order_stock(PDO $pdo, string $orderRef): void {
    $stmt = $pdo->prepare('SELECT items_json, status FROM sales WHERE order_ref = ? LIMIT 1');
    $stmt->execute([$orderRef]);
    $order = $stmt->fetch();
    if (!$order) return;

    $items = json_decode($order['items_json'] ?? '[]', true) ?? [];

    foreach ($items as $item) {
        $name      = $item['name']       ?? '';
        $productId = isset($item['product_id']) ? (int)$item['product_id'] : 0;
        $qty       = max(1, (int)($item['qty'] ?? 1));

        // ── Try variant match first (e.g. "Angle Bar (5 inch)") ─────────────
        if (preg_match('/^(.+)\s+\((.+)\)$/', $name, $m)) {
            $baseName    = trim($m[1]);
            $variantSize = trim($m[2]);
            $pp = $pdo->prepare('SELECT id FROM products WHERE name = ? LIMIT 1');
            $pp->execute([$baseName]);
            $parentProd = $pp->fetch();
            if ($parentProd) {
                $vv = $pdo->prepare(
                    'SELECT id FROM product_variants WHERE product_id = ? AND size = ? LIMIT 1'
                );
                $vv->execute([$parentProd['id'], $variantSize]);
                $variant = $vv->fetch();
                if ($variant) {
                    $pdo->prepare(
                        'UPDATE product_variants
                         SET stock          = GREATEST(0, stock          - ?),
                             reserved_stock = GREATEST(0, reserved_stock - ?)
                         WHERE id = ?'
                    )->execute([$qty, $qty, $variant['id']]);
                    // Sync parent totals from variants
                    $pdo->prepare(
                        'UPDATE products
                         SET stock          = (SELECT COALESCE(SUM(stock),0)          FROM product_variants WHERE product_id = ?),
                             reserved_stock = (SELECT COALESCE(SUM(reserved_stock),0) FROM product_variants WHERE product_id = ?)
                         WHERE id = ?'
                    )->execute([$parentProd['id'], $parentProd['id'], $parentProd['id']]);
                    continue;
                }
                // Variant not found — fall through to product-level deduction
            }
        }

        // ── Match by product_id ───────────────────────────────────────────────
        if ($productId > 0) {
            $p = $pdo->prepare('SELECT id FROM products WHERE id = ? LIMIT 1');
            $p->execute([$productId]);
            $prod = $p->fetch();
            if ($prod) {
                $pdo->prepare(
                    'UPDATE products
                     SET stock          = GREATEST(0, stock          - ?),
                         reserved_stock = GREATEST(0, reserved_stock - ?)
                     WHERE id = ?'
                )->execute([$qty, $qty, $prod['id']]);
                continue;
            }
        }

        // ── Fallback: match by name ───────────────────────────────────────────
        if ($name) {
            $p = $pdo->prepare('SELECT id FROM products WHERE name = ? LIMIT 1');
            $p->execute([$name]);
            $prod = $p->fetch();
            if ($prod) {
                $pdo->prepare(
                    'UPDATE products
                     SET stock          = GREATEST(0, stock          - ?),
                         reserved_stock = GREATEST(0, reserved_stock - ?)
                     WHERE id = ?'
                )->execute([$qty, $qty, $prod['id']]);
            }
        }
    }
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
