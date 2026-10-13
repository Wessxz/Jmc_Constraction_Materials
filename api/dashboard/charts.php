<?php
// GET /api/dashboard/charts
// Returns: salesLabels/Data (daily totals last 30 days),
//          statusLabels/Data (order status counts),
//          inventoryLabels/Data (stock per category)
require_once __DIR__ . '/../db.php';
require_method('GET');

$pdo = get_db();

// Get date range from query parameters
$startDate = $_GET['start_date'] ?? null;
$endDate = $_GET['end_date'] ?? null;

// Build date filter for charts
$dateFilter = '';
$dateParams = [];

if ($startDate && $endDate) {
    $dateFilter = ' AND DATE(created_at) BETWEEN ? AND ?';
    $dateParams = [$startDate, $endDate];
    // Calculate days between for chart
    $start = new DateTime($startDate);
    $end = new DateTime($endDate);
    $daysBack = $start->diff($end)->days;
    $intervalDays = max(1, $daysBack); // At least 1 day
} elseif ($startDate) {
    $dateFilter = ' AND DATE(created_at) >= ?';
    $dateParams = [$startDate];
    $intervalDays = 30; // Default
} elseif ($endDate) {
    $dateFilter = ' AND DATE(created_at) <= ?';
    $dateParams = [$endDate];
    $intervalDays = 30; // Default
} else {
    $intervalDays = 29; // Default 30 days (0-29)
}

// ── Daily sales - ONLY count completed/delivered ──────────────────────────────
if (!empty($dateFilter)) {
    $stmt = $pdo->prepare(
        "SELECT DATE(created_at) AS day, SUM(total) AS total
         FROM sales
         WHERE status IN ('completed', 'delivered')" . $dateFilter . "
         GROUP BY DATE(created_at)
         ORDER BY day ASC"
    );
    $stmt->execute($dateParams);
    $salesRows = $stmt->fetchAll();
} else {
    $salesRows = $pdo->query(
        "SELECT DATE(created_at) AS day, SUM(total) AS total
         FROM sales
         WHERE status IN ('completed', 'delivered')
           AND created_at >= DATE_SUB(CURDATE(), INTERVAL 29 DAY)
         GROUP BY DATE(created_at)
         ORDER BY day ASC"
    )->fetchAll();
}

// Fill in every day (including zeros) for a smooth chart
$salesMap = [];
foreach ($salesRows as $r) {
    $salesMap[$r['day']] = (float)$r['total'];
}

$salesLabels = [];
$salesData   = [];

if ($startDate && $endDate) {
    // Custom range: iterate from start to end
    $current = new DateTime($startDate);
    $end = new DateTime($endDate);
    while ($current <= $end) {
        $day = $current->format('Y-m-d');
        $salesLabels[] = $current->format('M d');
        $salesData[] = $salesMap[$day] ?? 0;
        $current->modify('+1 day');
    }
} else {
    // Default: last 30 days
    for ($i = 29; $i >= 0; $i--) {
        $day = date('Y-m-d', strtotime("-$i days"));
        $salesLabels[] = date('M d', strtotime($day));
        $salesData[] = $salesMap[$day] ?? 0;
    }
}

// ── Order status counts - ONLY completed/delivered orders, affected by date filter ─────────────────────────────
if (!empty($dateFilter)) {
    $stmt = $pdo->prepare(
        "SELECT status, COUNT(*) AS cnt FROM sales WHERE status IN ('completed', 'delivered')" . $dateFilter . " GROUP BY status ORDER BY cnt DESC"
    );
    $stmt->execute($dateParams);
    $statusRows = $stmt->fetchAll();
} else {
    $statusRows = $pdo->query(
        "SELECT status, COUNT(*) AS cnt FROM sales WHERE status IN ('completed', 'delivered') GROUP BY status ORDER BY cnt DESC"
    )->fetchAll();
}

$statusLabels = array_column($statusRows, 'status');
$statusData   = array_map(fn($r) => (int)$r['cnt'], $statusRows);

// ── Stock per category - not affected by date filter ──────────────────────────
$inventoryRows = $pdo->query(
    "SELECT category, SUM(stock) AS total_stock
     FROM products
     GROUP BY category
     ORDER BY total_stock DESC"
)->fetchAll();
$inventoryLabels = array_column($inventoryRows, 'category');
$inventoryData   = array_map(fn($r) => (int)$r['total_stock'], $inventoryRows);

json_response([
    'success'         => true,
    'salesLabels'     => $salesLabels,
    'salesData'       => $salesData,
    'statusLabels'    => $statusLabels,
    'statusData'      => $statusData,
    'inventoryLabels' => $inventoryLabels,
    'inventoryData'   => $inventoryData,
]);
