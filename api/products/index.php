<?php
// GET /api/products  — list all products
// POST /api/products — create a new product
require_once __DIR__ . '/../db.php';

$method = $_SERVER['REQUEST_METHOD'];
$pdo    = get_db();

if ($method === 'GET') {
    $stmt = $pdo->query('SELECT * FROM products ORDER BY created_at DESC');
    $rows = $stmt->fetchAll();
    json_ok(array_map('product_to_dict', $rows));

} elseif ($method === 'POST') {
    $body = get_json_body();

    $name             = trim($body['name']             ?? '');
    $price            = (float)($body['price']          ?? 0);
    $category         = trim($body['category']         ?? 'Construction');
    $stock            = (int)($body['stock']            ?? 0);
    $minQty           = (int)($body['minQuantity']      ?? 20);
    $critQty          = (int)($body['criticalQuantity'] ?? 5);
    $unit             = trim($body['unit']              ?? 'pcs');
    
    // IMPORTANT: Get availability_type from request body
    $availability     = trim($body['availability_type'] ?? 'both');
    
    // DEBUG: Log what we received
    error_log("DEBUG: Received availability_type = " . var_export($body['availability_type'] ?? 'NOT SET', true));
    error_log("DEBUG: After trim availability = " . $availability);
    
    // VALIDATE: Must be one of the enum values
    if (!in_array($availability, ['both', 'bulk_only', 'walkin_only'])) {
        error_log("DEBUG: Invalid availability value '$availability', defaulting to 'both'");
        $availability = 'both';
    }
    
    $specifications   = json_encode($body['specifications'] ?? []);
    $discount         = (float)($body['discount']       ?? 0);
    $image            = trim($body['image']             ?? 'img/concrete-hollow-block-300x300.jpg');
    $actorName        = trim($body['actorName']         ?? 'System');
    $actorRole        = trim($body['actorRole']         ?? 'admin');

    if (!$name)       json_err('Product name is required.');
    if ($price <= 0)  json_err('Price must be greater than 0.');

    // Check for duplicate name
    $dup = $pdo->prepare('SELECT id FROM products WHERE LOWER(name) = LOWER(?) LIMIT 1');
    $dup->execute([$name]);
    if ($dup->fetch()) json_err("A product named \"$name\" already exists.");

    // Auto-generate SKU
    $maxSku = $pdo->query("SELECT MAX(CAST(SUBSTRING(sku,5) AS UNSIGNED)) AS m FROM products WHERE sku LIKE 'SKU-%'")->fetchColumn();
    $sku    = 'SKU-' . (max((int)$maxSku + 1, 1001));

    $stmt = $pdo->prepare(
        'INSERT INTO products (name, price, category, stock, min_quantity, critical_quantity, unit, availability_type, specifications, discount, image, sku)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
    );
    $stmt->execute([$name, $price, $category, $stock, $minQty, $critQty, $unit, $availability, $specifications, $discount, $image, $sku]);
    $id = (int)$pdo->lastInsertId();

    write_log($actorName, $actorRole, 'add_product', 'product', (string)$id,
        "Added product \"$name\" (SKU: $sku, stock: $stock)");

    $row = $pdo->prepare('SELECT * FROM products WHERE id = ?');
    $row->execute([$id]);
    json_ok(product_to_dict($row->fetch()), 'data');

} else {
    json_err('Method not allowed.', 405);
}
