<?php
// ============================================
// AUTO-CANCEL EXPIRED RESERVATION ORDERS
// ============================================
// Run this every 30 minutes via cron or Task Scheduler
// Checks for online/reservation orders that exceeded 3-hour payment window

require_once __DIR__ . '/../db.php';

date_default_timezone_set('Asia/Manila');

$pdo = get_db();
$now = date('Y-m-d H:i:s');

echo "═══════════════════════════════════════════════════════════════════════════\n";
echo "AUTO-CANCEL EXPIRED RESERVATIONS - " . $now . "\n";
echo "═══════════════════════════════════════════════════════════════════════════\n\n";

try {
    // Find orders that are expired (status = pending, reservation_expires_at < now)
    $stmt = $pdo->prepare("
        SELECT * FROM sales 
        WHERE status = 'pending' 
          AND order_type = 'online'
          AND reservation_expires_at IS NOT NULL 
          AND reservation_expires_at < ?
    ");
    $stmt->execute([$now]);
    $expiredOrders = $stmt->fetchAll();
    
    echo "Found " . count($expiredOrders) . " expired reservation(s)\n\n";
    
    $cancelledCount = 0;
    
    foreach ($expiredOrders as $order) {
        $ref = $order['order_ref'];
        $items = json_decode($order['items_json'], true) ?? [];
        
        echo "Processing: {$ref} (Customer: {$order['customer_name']})\n";
        echo "  Expired at: {$order['reservation_expires_at']}\n";
        
        // Update order status to cancelled
        $pdo->prepare("
            UPDATE sales 
            SET status = 'cancelled',
                cancel_reason = 'auto',
                cancel_notes = 'Reservation expired: Payment not made within 3 hours'
            WHERE order_ref = ?
        ")->execute([$ref]);
        
        // Restore reserved stock for each item
        foreach ($items as $item) {
            $name = $item['name'] ?? '';
            $productId = isset($item['product_id']) ? (int)$item['product_id'] : 0;
            $qty = max(1, (int)($item['qty'] ?? 1));
            
            echo "  Restoring stock: {$name} (Qty: {$qty})\n";
            
            // Try variant match first (e.g. "Angle Bar (5 inch)")
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
                        // Release reserved stock
                        $pdo->prepare('UPDATE product_variants SET reserved_stock = GREATEST(0, reserved_stock - ?) WHERE id = ?')
                            ->execute([$qty, $variant['id']]);
                        
                        // Sync parent totals
                        $pdo->prepare('UPDATE products SET reserved_stock = (SELECT COALESCE(SUM(reserved_stock),0) FROM product_variants WHERE product_id = ?) WHERE id = ?')
                            ->execute([$parentProd['id'], $parentProd['id']]);
                        
                        echo "    ✓ Variant stock restored\n";
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
                    echo "    ✓ Product stock restored (by ID)\n";
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
                    echo "    ✓ Product stock restored (by name)\n";
                }
            }
        }
        
        // Log the cancellation
        write_log('System', 'system', 'auto_cancel_expired_reservation', 'order', $ref,
            "Reservation {$ref} auto-cancelled: Payment not made within 3 hours (expired at {$order['reservation_expires_at']})");
        
        echo "  ✓ Order cancelled and logged\n\n";
        $cancelledCount++;
    }
    
    echo "═══════════════════════════════════════════════════════════════════════════\n";
    echo "COMPLETED: Cancelled {$cancelledCount} expired reservation(s)\n";
    echo "═══════════════════════════════════════════════════════════════════════════\n";
    
    // Return result (for both CLI and HTTP)
    if (php_sapi_name() !== 'cli') {
        json_response([
            'success' => true,
            'timestamp' => $now,
            'cancelled_count' => $cancelledCount,
            'message' => "Auto-cancelled {$cancelledCount} expired reservations"
        ]);
    }
    
} catch (Exception $e) {
    $errorMsg = "ERROR: " . $e->getMessage();
    echo "\n{$errorMsg}\n";
    error_log("[JMC] Auto-cancel reservations failed: " . $e->getMessage());
    
    if (php_sapi_name() !== 'cli') {
        json_err($errorMsg, 500);
    } else {
        exit(1);
    }
}
