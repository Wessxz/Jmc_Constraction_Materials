<?php
// GET /api/dashboard/stats
require_once __DIR__ . '/../db.php';
require_method('GET');

$pdo = get_db();

// Get date range from query parameters
$startDate = $_GET['start_date'] ?? null;
$endDate = $_GET['end_date'] ?? null;

// Build date filter conditions
$dateFilter = '';
$dateParams = [];

if ($startDate && $endDate) {
    $dateFilter = ' AND DATE(created_at) BETWEEN ? AND ?';
    $dateParams = [$startDate, $endDate];
} elseif ($startDate) {
    $dateFilter = ' AND DATE(created_at) >= ?';
    $dateParams = [$startDate];
} elseif ($endDate) {
    $dateFilter = ' AND DATE(created_at) <= ?';
    $dateParams = [$endDate];
}

// Today's stats - ONLY count completed/delivered orders as sales
if (!empty($dateFilter)) {
    // Use filtered date range
    $stmt = $pdo->prepare(
        "SELECT COALESCE(SUM(total),0) FROM sales 
         WHERE status IN ('completed', 'delivered')" . $dateFilter
    );
    $stmt->execute($dateParams);
    $todaySales = (float)$stmt->fetchColumn();
    
    $stmt = $pdo->prepare("SELECT COUNT(*) FROM sales WHERE status IN ('completed', 'delivered')" . $dateFilter);
    $stmt->execute($dateParams);
    $todayOrders = (int)$stmt->fetchColumn();
} else {
    // Default to today
    $todaySales = (float)$pdo->query(
        "SELECT COALESCE(SUM(total),0) FROM sales 
         WHERE DATE(created_at) = CURDATE() AND status IN ('completed', 'delivered')"
    )->fetchColumn();
    
    $todayOrders = (int)$pdo->query(
        "SELECT COUNT(*) FROM sales WHERE DATE(created_at) = CURDATE() AND status IN ('completed', 'delivered')"
    )->fetchColumn();
}

// Yesterday's stats for comparison - ONLY count completed/delivered
$yesterdaySales = (float)$pdo->query(
    "SELECT COALESCE(SUM(total),0) FROM sales 
     WHERE DATE(created_at) = DATE_SUB(CURDATE(), INTERVAL 1 DAY) AND status IN ('completed', 'delivered')"
)->fetchColumn();

// Pending items (not affected by date filter - always current)
$pendingOrders = (int)$pdo->query(
    "SELECT COUNT(*) FROM sales WHERE status = 'pending'"
)->fetchColumn();

$pendingDeliveries = (int)$pdo->query(
    "SELECT COUNT(*) FROM deliveries WHERE status IN ('pending', 'scheduled')"
)->fetchColumn();

$pendingBulk = (int)$pdo->query(
    "SELECT COUNT(*) FROM bulk_orders WHERE status IN ('pending', 'quoted')"
)->fetchColumn();

$cancellationRequests = (int)$pdo->query(
    "SELECT COUNT(*) FROM sales WHERE status = 'cancellation_requested'"
)->fetchColumn();

// Overall stats - affected by date filter
if (!empty($dateFilter)) {
    $stmt = $pdo->prepare(
        "SELECT COALESCE(SUM(total),0) FROM sales WHERE status IN ('completed', 'delivered')" . $dateFilter
    );
    $stmt->execute($dateParams);
    $totalSales = (float)$stmt->fetchColumn();
    
    $stmt = $pdo->prepare("SELECT COUNT(*) FROM sales WHERE status IN ('completed', 'delivered')" . $dateFilter);
    $stmt->execute($dateParams);
    $totalOrders = (int)$stmt->fetchColumn();
} else {
    $totalSales = (float)$pdo->query(
        "SELECT COALESCE(SUM(total),0) FROM sales WHERE status IN ('completed', 'delivered')"
    )->fetchColumn();
    
    $totalOrders = (int)$pdo->query("SELECT COUNT(*) FROM sales WHERE status IN ('completed', 'delivered')")->fetchColumn();
}

$totalProducts      = (int)$pdo->query('SELECT COUNT(*) FROM products')->fetchColumn();
$lowStockCount      = (int)$pdo->query(
    'SELECT COUNT(*) FROM products WHERE stock <= min_quantity AND stock > critical_quantity'
)->fetchColumn();
$criticalStockCount = (int)$pdo->query(
    'SELECT COUNT(*) FROM products WHERE stock <= critical_quantity'
)->fetchColumn();
$pendingReturns     = (int)$pdo->query(
    "SELECT COUNT(*) FROM returns WHERE status = 'pending'"
)->fetchColumn();

// Calculate percentage change
$salesChange = $yesterdaySales > 0 
    ? round((($todaySales - $yesterdaySales) / $yesterdaySales) * 100, 1)
    : 0;

// Recent orders - affected by date filter
if (!empty($dateFilter)) {
    $stmt = $pdo->prepare('SELECT * FROM sales WHERE 1=1' . $dateFilter . ' ORDER BY created_at DESC LIMIT 10');
    $stmt->execute($dateParams);
    $recentRows = $stmt->fetchAll(PDO::FETCH_ASSOC);
} else {
    $recentRows = $pdo->query(
        'SELECT * FROM sales ORDER BY created_at DESC LIMIT 10'
    )->fetchAll(PDO::FETCH_ASSOC);
}

// Count completed and delivered orders separately
if (!empty($dateFilter)) {
    $stmt = $pdo->prepare("SELECT COUNT(*) FROM sales WHERE status = 'completed'" . $dateFilter);
    $stmt->execute($dateParams);
    $completedOrders = (int)$stmt->fetchColumn();
    
    $stmt = $pdo->prepare("SELECT COUNT(*) FROM sales WHERE status = 'delivered'" . $dateFilter);
    $stmt->execute($dateParams);
    $deliveredOrders = (int)$stmt->fetchColumn();
    
    $stmt = $pdo->prepare("SELECT COUNT(*) FROM sales WHERE status IN ('pending', 'processing')" . $dateFilter);
    $stmt->execute($dateParams);
    $pendingOrdersCount = (int)$stmt->fetchColumn();
    
    $stmt = $pdo->prepare("SELECT COUNT(*) FROM sales WHERE status IN ('cancelled', 'cancellation_requested')" . $dateFilter);
    $stmt->execute($dateParams);
    $cancelledOrders = (int)$stmt->fetchColumn();
} else {
    $completedOrders = (int)$pdo->query("SELECT COUNT(*) FROM sales WHERE status = 'completed'")->fetchColumn();
    $deliveredOrders = (int)$pdo->query("SELECT COUNT(*) FROM sales WHERE status = 'delivered'")->fetchColumn();
    $pendingOrdersCount = (int)$pdo->query("SELECT COUNT(*) FROM sales WHERE status IN ('pending', 'processing')")->fetchColumn();
    $cancelledOrders = (int)$pdo->query("SELECT COUNT(*) FROM sales WHERE status IN ('cancelled', 'cancellation_requested')")->fetchColumn();
}

// Count return orders (from returns table)
if (!empty($dateFilter)) {
    $stmt = $pdo->prepare("SELECT COUNT(*) FROM returns WHERE 1=1" . $dateFilter);
    $stmt->execute($dateParams);
    $returnOrders = (int)$stmt->fetchColumn();
} else {
    $returnOrders = (int)$pdo->query("SELECT COUNT(*) FROM returns")->fetchColumn();
}

json_response([
    'success'                => true,
    'todaySales'             => $todaySales,
    'todayOrders'            => $todayOrders,
    'yesterdaySales'         => $yesterdaySales,
    'salesChange'            => $salesChange,
    'pendingOrders'          => $pendingOrders,
    'pendingDeliveries'      => $pendingDeliveries,
    'pendingBulk'            => $pendingBulk,
    'cancellationRequests'   => $cancellationRequests,
    'totalProducts'          => $totalProducts,
    'totalOrders'            => $totalOrders,
    'totalSales'             => $totalSales,
    'completedOrders'        => $completedOrders,
    'deliveredOrders'        => $deliveredOrders,
    'pendingOrdersCount'     => $pendingOrdersCount,
    'cancelledOrders'        => $cancelledOrders,
    'returnOrders'           => $returnOrders,
    'lowStockCount'          => $lowStockCount,
    'criticalStockCount'     => $criticalStockCount,
    'pendingReturns'         => $pendingReturns,
    'recentOrders'           => array_map('sale_to_dict', $recentRows),
]);

