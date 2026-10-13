<?php
// GET    /api/products/{id}/variants
// POST   /api/products/{id}/variants
// PUT    /api/products/{id}/variants/{vid}
// DELETE /api/products/{id}/variants/{vid}
require_once __DIR__ . '/../db.php';

$method    = $_SERVER['REQUEST_METHOD'];
$productId = (int)($_GET['id']  ?? 0);
$variantId = isset($_GET['vid']) ? (int)$_GET['vid'] : null;
$pdo       = get_db();

if (!$productId) json_err('Product ID required.', 400);

// Verify product exists
$check = $pdo->prepare('SELECT id FROM products WHERE id = ? LIMIT 1');
$check->execute([$productId]);
if (!$check->fetch()) json_err('Product not found.', 404);

// ─── Helper: sync parent product stock, reserved_stock & price from variants ──
function sync_parent_from_variants(PDO $pdo, int $productId): void {
    $stockRow = $pdo->prepare(
        'SELECT COALESCE(SUM(stock), 0) as total_stock,
                COALESCE(SUM(reserved_stock), 0) as total_reserved,
                COALESCE(MIN(price), 0) as min_price
         FROM product_variants WHERE product_id = ?'
    );
    $stockRow->execute([$productId]);
    $row = $stockRow->fetch();

    $pdo->prepare('UPDATE products SET stock = ?, reserved_stock = ?, price = ? WHERE id = ?')
        ->execute([(int)$row['total_stock'], (int)$row['total_reserved'], (float)$row['min_price'], $productId]);
}

if ($method === 'GET') {
    $stmt = $pdo->prepare('SELECT * FROM product_variants WHERE product_id = ? ORDER BY id');
    $stmt->execute([$productId]);
    $rows = $stmt->fetchAll();
    json_ok(array_map(fn($v) => [
        'id'              => (int)$v['id'],
        'size'            => $v['size'],
        'price'           => (float)$v['price'],
        'stock'           => (int)$v['stock'],
        'reserved_stock'  => (int)($v['reserved_stock'] ?? 0),
        'available_stock' => max(0, (int)$v['stock'] - (int)($v['reserved_stock'] ?? 0)),
        'min_stock'       => (int)($v['min_stock'] ?? 5),
    ], $rows));

} elseif ($method === 'POST') {
    $body     = get_json_body();
    $size     = trim($body['size']      ?? '');
    $price    = (float)($body['price']  ?? 0);
    $stock    = (int)($body['stock']    ?? 0);
    $minStock = (int)($body['min_stock'] ?? 5);

    if (!$size)      json_err('Variant size is required.');
    if ($price <= 0) json_err('Variant price must be greater than 0.');

    // Check for duplicate size in same product
    $dup = $pdo->prepare('SELECT id FROM product_variants WHERE product_id = ? AND LOWER(size) = LOWER(?) LIMIT 1');
    $dup->execute([$productId, $size]);
    if ($dup->fetch()) json_err("A variant with size \"$size\" already exists for this product.");

    $stmt = $pdo->prepare(
        'INSERT INTO product_variants (product_id, size, price, stock, min_stock) VALUES (?, ?, ?, ?, ?)'
    );
    $stmt->execute([$productId, $size, $price, $stock, $minStock]);
    $vid = (int)$pdo->lastInsertId();

    // ── Sync parent stock & price ──────────────────────────────────────────────
    sync_parent_from_variants($pdo, $productId);

    $row = $pdo->prepare('SELECT * FROM product_variants WHERE id = ?');
    $row->execute([$vid]);
    $v = $row->fetch();
    json_ok([
        'id'              => (int)$v['id'],
        'size'            => $v['size'],
        'price'           => (float)$v['price'],
        'stock'           => (int)$v['stock'],
        'reserved_stock'  => (int)($v['reserved_stock'] ?? 0),
        'available_stock' => max(0, (int)$v['stock'] - (int)($v['reserved_stock'] ?? 0)),
        'min_stock'       => (int)($v['min_stock'] ?? 5),
    ], 'data');

} elseif ($method === 'PUT') {
    if (!$variantId) json_err('Variant ID required.', 400);
    $body = get_json_body();

    $fields = [];
    $params = [];
    if (array_key_exists('size', $body)) {
        $newSize = trim($body['size']);
        // Check duplicate size (excluding current variant)
        $dup = $pdo->prepare('SELECT id FROM product_variants WHERE product_id = ? AND LOWER(size) = LOWER(?) AND id != ? LIMIT 1');
        $dup->execute([$productId, $newSize, $variantId]);
        if ($dup->fetch()) json_err("A variant with size \"$newSize\" already exists for this product.");
        $fields[] = 'size = ?';  $params[] = $newSize;
    }
    if (array_key_exists('price', $body))     { $fields[] = 'price = ?';     $params[] = (float)$body['price']; }
    if (array_key_exists('stock', $body))     { $fields[] = 'stock = ?';     $params[] = (int)$body['stock']; }
    if (array_key_exists('min_stock', $body)) { $fields[] = 'min_stock = ?'; $params[] = (int)$body['min_stock']; }

    if (empty($fields)) json_err('No fields to update.');

    $params[] = $variantId;
    $params[] = $productId;
    $pdo->prepare('UPDATE product_variants SET ' . implode(', ', $fields) . ' WHERE id = ? AND product_id = ?')
        ->execute($params);

    // ── Sync parent stock & price ──────────────────────────────────────────────
    sync_parent_from_variants($pdo, $productId);

    $row = $pdo->prepare('SELECT * FROM product_variants WHERE id = ?');
    $row->execute([$variantId]);
    $v = $row->fetch();
    if (!$v) json_err('Variant not found.', 404);

    json_ok([
        'id'              => (int)$v['id'],
        'size'            => $v['size'],
        'price'           => (float)$v['price'],
        'stock'           => (int)$v['stock'],
        'reserved_stock'  => (int)($v['reserved_stock'] ?? 0),
        'available_stock' => max(0, (int)$v['stock'] - (int)($v['reserved_stock'] ?? 0)),
        'min_stock'       => (int)($v['min_stock'] ?? 5),
    ], 'data');

} elseif ($method === 'DELETE') {
    if (!$variantId) json_err('Variant ID required.', 400);

    $del = $pdo->prepare('DELETE FROM product_variants WHERE id = ? AND product_id = ?');
    $del->execute([$variantId, $productId]);
    if ($del->rowCount() === 0) json_err('Variant not found.', 404);

    // ── Sync parent stock & price ──────────────────────────────────────────────
    sync_parent_from_variants($pdo, $productId);

    json_response(['success' => true]);

} else {
    json_err('Method not allowed.', 405);
}
