<?php
// GET /api/dashboard/charts
// Returns: salesLabels/Data (daily totals last 30 days),
//          statusLabels/Data (order status counts),
//          inventoryLabels/Data (stock per category)
require_once __DIR__ . '/../db.php';
require_method('GET');

$pdo = get_db();

// ── Daily sales for the last 30 days ─────────────────────────────────────────
$salesRows = $pdo->query(
    "SELECT DATE(created_at) AS day, SUM(total) AS total
     FROM orders
     WHERE status NOT IN ('cancelled')
       AND created_at >= DATE_SUB(CURDATE(), INTERVAL 29 DAY)
     GROUP BY DATE(created_at)
     ORDER BY day ASC"
)->fetchAll();

// Fill in every day (including zeros) for a smooth chart
$salesMap = [];
foreach ($salesRows as $r) {
    $salesMap[$r['day']] = (float)$r['total'];
}
$salesLabels = [];
$salesData   = [];
for ($i = 29; $i >= 0; $i--) {
    $day           = date('Y-m-d', strtotime("-$i days"));
    $salesLabels[] = date('M d', strtotime($day));
    $salesData[]   = $salesMap[$day] ?? 0;
}

// ── Order status counts ───────────────────────────────────────────────────────
$statusRows = $pdo->query(
    "SELECT status, COUNT(*) AS cnt FROM orders GROUP BY status ORDER BY cnt DESC"
)->fetchAll();
$statusLabels = array_column($statusRows, 'status');
$statusData   = array_map(fn($r) => (int)$r['cnt'], $statusRows);

// ── Stock per category ────────────────────────────────────────────────────────
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
