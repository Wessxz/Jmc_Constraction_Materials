<?php
// GET    /api/cart           — get cart items for logged-in user
// POST   /api/cart           — add item (or increment if same name exists)
// DELETE /api/cart           — clear entire cart
// DELETE /api/cart/{item_id} — remove single item
require_once __DIR__ . '/../db.php';

$method = $_SERVER['REQUEST_METHOD'];
$itemId = isset($_GET['item_id']) ? (int)$_GET['item_id'] : null;
$sess   = require_auth();
$uid    = $sess['id'];
$pdo    = get_db();

if ($method === 'GET') {
    $stmt = $pdo->prepare(
        'SELECT * FROM cart_items WHERE user_id = ? ORDER BY created_at ASC'
    );
    $stmt->execute([$uid]);
    $rows = $stmt->fetchAll();
    json_ok(array_map(fn($c) => [
        'id'         => (int)$c['id'],
        'product_id' => $c['product_id'] ? (int)$c['product_id'] : null,
        'name'       => $c['name'],
        'price'      => (float)$c['price'],
        'image'      => $c['image'],
        'quantity'   => (int)$c['quantity'],
    ], $rows));

} elseif ($method === 'POST') {
    $body      = get_json_body();
    $productId = isset($body['product_id']) ? (int)$body['product_id'] : null;
    $name      = trim($body['name']  ?? '');
    $price     = (float)($body['price']    ?? 0);
    $image     = trim($body['image']  ?? '');
    $quantity  = max(1, (int)($body['quantity'] ?? 1));

    if (!$name)      json_err('Item name is required.');
    if ($price <= 0) json_err('Price must be greater than 0.');

    // If same-named item already exists for this user, increment quantity
    $exist = $pdo->prepare(
        'SELECT id, quantity FROM cart_items WHERE user_id = ? AND name = ? LIMIT 1'
    );
    $exist->execute([$uid, $name]);
    $existing = $exist->fetch();

    if ($existing) {
        $newQty = (int)$existing['quantity'] + $quantity;
        $pdo->prepare('UPDATE cart_items SET quantity = ? WHERE id = ?')
            ->execute([$newQty, $existing['id']]);
        $fetch = $pdo->prepare('SELECT * FROM cart_items WHERE id = ?');
        $fetch->execute([$existing['id']]);
        $item = $fetch->fetch();
    } else {
        $pdo->prepare(
            'INSERT INTO cart_items (user_id, product_id, name, price, image, quantity)
             VALUES (?, ?, ?, ?, ?, ?)'
        )->execute([$uid, $productId, $name, $price, $image, $quantity]);
        $fetch = $pdo->prepare('SELECT * FROM cart_items WHERE id = ?');
        $fetch->execute([(int)$pdo->lastInsertId()]);
        $item = $fetch->fetch();
    }

    json_ok([
        'id'         => (int)$item['id'],
        'product_id' => $item['product_id'] ? (int)$item['product_id'] : null,
        'name'       => $item['name'],
        'price'      => (float)$item['price'],
        'image'      => $item['image'],
        'quantity'   => (int)$item['quantity'],
    ], 'data');

} elseif ($method === 'DELETE') {
    if ($itemId !== null) {
        // Remove single item — must belong to this user
        $del = $pdo->prepare('DELETE FROM cart_items WHERE id = ? AND user_id = ?');
        $del->execute([$itemId, $uid]);
        if ($del->rowCount() === 0) json_err('Cart item not found.', 404);
        json_response(['success' => true]);
    } else {
        // Clear entire cart for user
        $pdo->prepare('DELETE FROM cart_items WHERE user_id = ?')->execute([$uid]);
        json_response(['success' => true, 'message' => 'Cart cleared.']);
    }

} elseif ($method === 'PUT') {
    // PUT /api/cart/{item_id} — update quantity
    if ($itemId === null) json_err('Item ID required.', 400);
    $body     = get_json_body();
    $quantity = (int)($body['quantity'] ?? 0);
    if ($quantity <= 0) json_err('Quantity must be at least 1.');

    $upd = $pdo->prepare('UPDATE cart_items SET quantity = ? WHERE id = ? AND user_id = ?');
    $upd->execute([$quantity, $itemId, $uid]);
    if ($upd->rowCount() === 0) json_err('Cart item not found.', 404);

    $fetch = $pdo->prepare('SELECT * FROM cart_items WHERE id = ?');
    $fetch->execute([$itemId]);
    $item = $fetch->fetch();
    json_ok([
        'id'         => (int)$item['id'],
        'product_id' => $item['product_id'] ? (int)$item['product_id'] : null,
        'name'       => $item['name'],
        'price'      => (float)$item['price'],
        'image'      => $item['image'],
        'quantity'   => (int)$item['quantity'],
    ], 'data');

} else {
    json_err('Method not allowed.', 405);
}
