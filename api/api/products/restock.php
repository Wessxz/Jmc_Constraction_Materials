<?php
// PUT /api/products/{id}/restock
// Optional: ?variant_id=X to restock a specific variant
require_once __DIR__ . '/../db.php';
require_method('PUT');

$id        = (int)($_GET['id']         ?? 0);
$variantId = (int)($_GET['variant_id'] ?? 0);
$pdo       = get_db();

if (!$id) json_err('Product ID required.', 400);

$stmt = $pdo->prepare('SELECT * FROM products WHERE id = ? LIMIT 1');
$stmt->execute([$id]);
$product = $stmt->fetch();
if (!$product) json_err('Product not found.', 404);

$body      = get_json_body();
$quantity  = (int)($body['quantity']  ?? 0);
$actorName = trim($body['actorName'] ?? 'System');
$actorRole = trim($body['actorRole'] ?? 'admin');

if ($quantity <= 0) json_err('Quantity must be a positive integer.');

if ($variantId > 0) {
    // ── Restock a specific variant ─────────────────────────────────────────────
    $vStmt = $pdo->prepare('SELECT * FROM product_variants WHERE id = ? AND product_id = ? LIMIT 1');
    $vStmt->execute([$variantId, $id]);
    $variant = $vStmt->fetch();
    if (!$variant) json_err('Variant not found.', 404);

    $newVariantStock = (int)$variant['stock'] + $quantity;
    $pdo->prepare('UPDATE product_variants SET stock = ? WHERE id = ?')
        ->execute([$newVariantStock, $variantId]);

    // Sync parent stock = sum of all variants (reserved_stock also synced)
    $pdo->prepare(
        'UPDATE products SET
            stock          = (SELECT COALESCE(SUM(stock),0)          FROM product_variants WHERE product_id = ?),
            reserved_stock = (SELECT COALESCE(SUM(reserved_stock),0) FROM product_variants WHERE product_id = ?)
         WHERE id = ?'
    )->execute([$id, $id, $id]);

    write_log($actorName, $actorRole, 'restock', 'product', (string)$id,
        "Restocked variant \"{$variant['size']}\" of \"{$product['name']}\" by $quantity (new total: $newVariantStock)");

} else {
    // ── Restock parent product (no variants) ───────────────────────────────────
    $newStock = (int)$product['stock'] + $quantity;
    $pdo->prepare('UPDATE products SET stock = ? WHERE id = ?')->execute([$newStock, $id]);

    write_log($actorName, $actorRole, 'restock', 'product', (string)$id,
        "Restocked \"{$product['name']}\" by $quantity (new total: $newStock)");
}

$stmt->execute([$id]);
json_ok(product_to_dict($stmt->fetch()), 'data');
