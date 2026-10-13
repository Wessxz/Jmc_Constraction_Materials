<?php
// PUT  /api/products/{id}  — update product
// DELETE /api/products/{id} — delete product
require_once __DIR__ . '/../db.php';

$method = $_SERVER['REQUEST_METHOD'];
$id     = (int)($_GET['id'] ?? 0);
$pdo    = get_db();

if (!$id) json_err('Product ID required.', 400);

// Load product
$stmt = $pdo->prepare('SELECT * FROM products WHERE id = ? LIMIT 1');
$stmt->execute([$id]);
$product = $stmt->fetch();
if (!$product) json_err('Product not found.', 404);

// Helper: check if product appears in any order or transaction
function product_in_history(PDO $pdo, string $name, int $id): bool {
    // Check orders
    $orders = $pdo->query("SELECT items_json FROM orders")->fetchAll();
    foreach ($orders as $o) {
        $items = json_decode($o['items_json'], true) ?? [];
        foreach ($items as $item) {
            if (isset($item['product_id']) && (int)$item['product_id'] === $id) return true;
            if (isset($item['name']) && stripos($item['name'], $name) !== false) return true;
        }
    }
    // Check transactions
    $txns = $pdo->query("SELECT items_json FROM transactions")->fetchAll();
    foreach ($txns as $t) {
        $items = json_decode($t['items_json'], true) ?? [];
        foreach ($items as $item) {
            if (isset($item['name']) && stripos($item['name'], $name) !== false) return true;
        }
    }
    return false;
}

// Helper: check if product has pending orders
function product_has_pending_orders(PDO $pdo, string $name, int $id): bool {
    $orders = $pdo->query("SELECT items_json FROM orders WHERE status = 'pending'")->fetchAll();
    foreach ($orders as $o) {
        $items = json_decode($o['items_json'], true) ?? [];
        foreach ($items as $item) {
            if (isset($item['product_id']) && (int)$item['product_id'] === $id) return true;
            if (isset($item['name']) && stripos($item['name'], $name) !== false) return true;
        }
    }
    return false;
}

if ($method === 'PUT') {
    $body      = get_json_body();
    $actorName = trim($body['actorName'] ?? 'System');
    $actorRole = trim($body['actorRole'] ?? 'admin');

    $fields = [];
    $params = [];

    $hasHistory = product_in_history($pdo, $product['name'], $id);

    // Name / category restricted if in history
    if (array_key_exists('name', $body)) {
        $newName = trim($body['name']);
        if ($hasHistory && $newName !== $product['name']) {
            json_err('Cannot change product name: it has transaction history.', 409);
        }
        // Check for duplicate name (excluding current product)
        $dup = $pdo->prepare('SELECT id FROM products WHERE LOWER(name) = LOWER(?) AND id != ? LIMIT 1');
        $dup->execute([$newName, $id]);
        if ($dup->fetch()) json_err("A product named \"$newName\" already exists.");
        $fields[] = 'name = ?'; $params[] = $newName;
    }
    if (array_key_exists('category', $body)) {
        $newCat = trim($body['category']);
        if ($hasHistory && $newCat !== $product['category']) {
            json_err('Cannot change category: product has transaction history.', 409);
        }
        $fields[] = 'category = ?'; $params[] = $newCat;
    }

    // Price blocked if pending orders
    if (array_key_exists('price', $body)) {
        $newPrice = (float)$body['price'];
        if ($newPrice !== (float)$product['price'] && product_has_pending_orders($pdo, $product['name'], $id)) {
            json_err('Cannot change price: product has pending orders.', 409);
        }
        $fields[] = 'price = ?'; $params[] = $newPrice;
    }

    // Unrestricted fields
    foreach (['stock', 'image', 'unit', 'discount'] as $f) {
        if (array_key_exists($f, $body)) { $fields[] = "$f = ?"; $params[] = $body[$f]; }
    }
    if (array_key_exists('minQuantity', $body))      { $fields[] = 'min_quantity = ?';      $params[] = (int)$body['minQuantity']; }
    if (array_key_exists('criticalQuantity', $body)) { $fields[] = 'critical_quantity = ?'; $params[] = (int)$body['criticalQuantity']; }
    if (array_key_exists('specifications', $body))   { $fields[] = 'specifications = ?';    $params[] = json_encode($body['specifications']); }

    if (empty($fields)) json_err('No fields to update.');

    $params[] = $id;
    $pdo->prepare('UPDATE products SET ' . implode(', ', $fields) . ' WHERE id = ?')->execute($params);

    write_log($actorName, $actorRole, 'update_product', 'product', (string)$id,
        "Updated product \"{$product['name']}\"");

    $stmt->execute([$id]);
    json_ok(product_to_dict($stmt->fetch()), 'data');

} elseif ($method === 'DELETE') {
    $body      = get_json_body();
    $actorName = trim($body['actorName'] ?? 'System');
    $actorRole = trim($body['actorRole'] ?? 'admin');

    if (product_in_history($pdo, $product['name'], $id)) {
        json_err('Cannot delete product: it appears in orders or transaction history.', 409);
    }

    $pdo->prepare('DELETE FROM products WHERE id = ?')->execute([$id]);

    write_log($actorName, $actorRole, 'delete_product', 'product', (string)$id,
        "Deleted product \"{$product['name']}\"");

    json_response(['success' => true, 'message' => 'Product deleted.']);

} else {
    json_err('Method not allowed.', 405);
}
