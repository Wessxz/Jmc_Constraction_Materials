<?php
// GET /api/dashboard/stats
require_once __DIR__ . '/../db.php';
require_method('GET');

$pdo = get_db();

$totalProducts      = (int)$pdo->query('SELECT COUNT(*) FROM products')->fetchColumn();
$totalOrders        = (int)$pdo->query('SELECT COUNT(*) FROM orders')->fetchColumn();
$totalSales         = (float)$pdo->query(
    "SELECT COALESCE(SUM(total),0) FROM orders WHERE status NOT IN ('cancelled')"
)->fetchColumn();
$lowStockCount      = (int)$pdo->query(
    'SELECT COUNT(*) FROM products WHERE stock <= min_quantity AND stock > critical_quantity'
)->fetchColumn();
$criticalStockCount = (int)$pdo->query(
    'SELECT COUNT(*) FROM products WHERE stock <= critical_quantity'
)->fetchColumn();
$pendingReturns     = (int)$pdo->query(
    "SELECT COUNT(*) FROM returns WHERE status = 'pending'"
)->fetchColumn();

$recentRows = $pdo->query(
    'SELECT * FROM orders ORDER BY created_at DESC LIMIT 10'
)->fetchAll();

json_response([
    'success'            => true,
    'totalProducts'      => $totalProducts,
    'totalOrders'        => $totalOrders,
    'totalSales'         => $totalSales,
    'lowStockCount'      => $lowStockCount,
    'criticalStockCount' => $criticalStockCount,
    'pendingReturns'     => $pendingReturns,
    'recentOrders'       => array_map('order_to_dict', $recentRows),
]);
