<?php
// GET /api/products/best-selling — return top 10 most-ordered products
require_once __DIR__ . '/../db.php';

$pdo = get_db();

// Get all products
$products = $pdo->query('SELECT * FROM products')->fetchAll(PDO::FETCH_ASSOC);

// Count orders for each product
$orderCounts = [];
foreach ($products as $p) {
    $orderCounts[$p['id']] = 0;
}

// Parse all completed/delivered orders
$orders = $pdo->query(
    "SELECT items_json FROM sales WHERE status IN ('completed', 'delivered')"
)->fetchAll(PDO::FETCH_ASSOC);

foreach ($orders as $order) {
    $items = json_decode($order['items_json'], true) ?? [];
    foreach ($items as $item) {
        if (isset($item['product_id']) && $item['product_id'] > 0) {
            $pid = (int)$item['product_id'];
            $qty = (int)($item['qty'] ?? 1);
            if (isset($orderCounts[$pid])) {
                $orderCounts[$pid] += $qty;
            }
        }
    }
}

// Sort products by order count
arsort($orderCounts);

// Get top 10 product IDs
$topIds = array_slice(array_keys($orderCounts), 0, 10);

// If no orders, just return first 10 products
if (empty($topIds)) {
    $topIds = array_slice(array_keys($orderCounts), 0, 10);
}

// Fetch products and return with sold_quantity
$result = [];
foreach ($topIds as $id) {
    foreach ($products as $p) {
        if ($p['id'] == $id) {
            $productDict = product_to_dict($p);
            $productDict['sold_quantity'] = $orderCounts[$id]; // Add sold quantity
            $result[] = $productDict;
            break;
        }
    }
}

json_response(['success' => true, 'data' => $result]);
