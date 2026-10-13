<?php
// GET /api/orders/stats
require_once __DIR__ . '/../db.php';
require_method('GET');
$pdo = get_db();

$totalProducts     = (int)$pdo->query('SELECT COUNT(*) FROM products')->fetchColumn();
$totalOrders       = (int)$pdo->query('SELECT COUNT(*) FROM sales')->fetchColumn();
$totalSales        = (float)$pdo->query("SELECT COALESCE(SUM(total),0) FROM sales WHERE status NOT IN ('cancelled')")->fetchColumn();
$lowStockCount     = (int)$pdo->query('SELECT COUNT(*) FROM products WHERE stock <= min_quantity AND stock > critical_quantity')->fetchColumn();
$criticalStockCount= (int)$pdo->query('SELECT COUNT(*) FROM products WHERE stock <= critical_quantity')->fetchColumn();

$recentRows = $pdo->query('SELECT * FROM sales ORDER BY created_at DESC LIMIT 10')->fetchAll();

json_ok([
    'totalProducts'      => $totalProducts,
    'totalOrders'        => $totalOrders,
    'totalSales'         => $totalSales,
    'lowStockCount'      => $lowStockCount,
    'criticalStockCount' => $criticalStockCount,
    'recentOrders'       => array_map('order_to_dict', $recentRows),
], 'data');
