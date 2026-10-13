<?php
// ============================================
// AUTO-CANCEL EXPIRED PICKUP ORDERS
// ============================================
// Run this every hour via cron or Task Scheduler
// Checks for pickup orders that exceeded 5-hour limit

require_once __DIR__ . '/../db.php';

date_default_timezone_set('Asia/Manila');

$pdo = get_db();
$now = date('Y-m-d H:i:s');

// Find orders that are expired (status = processing, pickup_expires_at < now)
$stmt = $pdo->prepare("
    SELECT * FROM sales 
    WHERE status = 'processing' 
      AND pickup_expires_at IS NOT NULL 
      AND pickup_expires_at < ?
");
$stmt->execute([$now]);
$expiredOrders = $stmt->fetchAll();

$cancelledCount = 0;

foreach ($expiredOrders as $order) {
    $ref = $order['order_ref'];
    $items = json_decode($order['items_json'], true) ?? [];
    
    // Update order status to cancelled
    $pdo->prepare("
        UPDATE sales 
        SET status = 'cancelled',
            cancel_reason = 'auto',
            cancel_notes = 'Order auto-cancelled: Not picked up within 5 hours'
        WHERE order_ref = ?
    ")->execute([$ref]);
    
    // Restore stock for each item
    foreach ($items as $item) {
        $name = $item['name'] ?? '';
        $productId = isset($item['product_id']) ? (int)$item['product_id'] : 0;
        $qty = max(1, (int)($item['qty'] ?? 1));
        
        // Try variant match first
        if (preg_match('/^(.+)\s+\((.+)\)$/', $name, $m)) {
            $baseName = trim($m[1]);
            $variantSize = trim($m[2]);
            
            $pp = $pdo->prepare('SELECT id FROM products WHERE name = ? LIMIT 1');
            $pp->execute([$baseName]);
            $parentProd = $pp->fetch();
            
            if ($parentProd) {
                $vv = $pdo->prepare('SELECT id FROM product_variants WHERE product_id = ? AND size = ? LIMIT 1');
                $vv->execute([$parentProd['id'], $variantSize]);
                $variant = $vv->fetch();
                
                if ($variant) {
                    $pdo->prepare('UPDATE product_variants SET reserved_stock = GREATEST(0, reserved_stock - ?) WHERE id = ?')
                        ->execute([$qty, $variant['id']]);
                    
                    // Sync parent totals
                    $pdo->prepare('UPDATE products SET reserved_stock = (SELECT COALESCE(SUM(reserved_stock),0) FROM product_variants WHERE product_id = ?) WHERE id = ?')
                        ->execute([$parentProd['id'], $parentProd['id']]);
                    continue;
                }
            }
        }
        
        // Match by product_id
        if ($productId > 0) {
            $p = $pdo->prepare('SELECT id FROM products WHERE id = ? LIMIT 1');
            $p->execute([$productId]);
            $prod = $p->fetch();
            
            if ($prod) {
                $pdo->prepare('UPDATE products SET reserved_stock = GREATEST(0, reserved_stock - ?) WHERE id = ?')
                    ->execute([$qty, $prod['id']]);
                continue;
            }
        }
        
        // Fallback: match by name
        if ($name) {
            $p = $pdo->prepare('SELECT id FROM products WHERE name = ? LIMIT 1');
            $p->execute([$name]);
            $prod = $p->fetch();
            
            if ($prod) {
                $pdo->prepare('UPDATE products SET reserved_stock = GREATEST(0, reserved_stock - ?) WHERE id = ?')
                    ->execute([$qty, $prod['id']]);
            }
        }
    }
    
    // Log the cancellation
    write_log('System', 'system', 'auto_cancel_expired_pickup', 'order', $ref,
        "Order $ref auto-cancelled: Not picked up within 5 hours (expired at {$order['pickup_expires_at']})");
    
    $cancelledCount++;
}

// Return result (for manual testing)
if (php_sapi_name() === 'cli') {
    echo "Auto-cancel completed at $now\n";
    echo "Cancelled orders: $cancelledCount\n";
} else {
    json_response([
        'success' => true,
        'timestamp' => $now,
        'cancelled_count' => $cancelledCount,
        'message' => "Auto-cancelled $cancelledCount expired pickup orders"
    ]);
}
