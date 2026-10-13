<?php
// ============================================
// CRON JOB: Auto-expire pickup orders
// ============================================
// Run this every 30 minutes via cron job:
// */30 * * * * php /path/to/api/cron/expire-pickups.php
// 
// Or call via HTTP (protected):
// GET /api/cron/expire-pickups.php?key=YOUR_SECRET_KEY

require_once __DIR__ . '/../db.php';
require_once __DIR__ . '/../email.php';
require_once __DIR__ . '/../notifications/create.php';

// Simple protection: require secret key for HTTP access
if (php_sapi_name() !== 'cli') {
    $key = $_GET['key'] ?? '';
    $expectedKey = $_ENV['CRON_SECRET_KEY'] ?? 'change-this-secret-key';
    if ($key !== $expectedKey) {
        http_response_code(403);
        die('Forbidden');
    }
}

date_default_timezone_set('Asia/Manila');

$pdo = get_db();

try {
    $pdo->beginTransaction();
    
    // Find all orders that are "ready for pickup" and expired (6 hours grace period)
    $stmt = $pdo->prepare(
        "SELECT id, order_ref, customer_name, items_json, pickup_ready_at, pickup_expires_at
         FROM sales 
         WHERE status = 'ready for pickup' 
           AND pickup_expires_at IS NOT NULL 
           AND pickup_expires_at <= NOW()
         FOR UPDATE"
    );
    $stmt->execute();
    $expiredOrders = $stmt->fetchAll();
    
    $expiredCount = 0;
    
    foreach ($expiredOrders as $order) {
        $orderRef = $order['order_ref'];
        $items = json_decode($order['items_json'] ?? '[]', true) ?? [];
        
        // Get customer email before cancellation
        $customerEmail = null;
        $customerName = $order['customer_name'];
        $userId = null;
        
        $orderDetails = $pdo->prepare('SELECT user_id FROM sales WHERE id = ? LIMIT 1');
        $orderDetails->execute([$order['id']]);
        $orderData = $orderDetails->fetch();
        
        if ($orderData && !empty($orderData['user_id'])) {
            $userId = $orderData['user_id'];
            $userStmt = $pdo->prepare('SELECT email, full_name FROM users WHERE id = ? LIMIT 1');
            $userStmt->execute([$userId]);
            $user = $userStmt->fetch();
            if ($user) {
                $customerEmail = $user['email'];
                $customerName = $user['full_name'];
            }
        }
        
        // Restore stock for each item
        foreach ($items as $item) {
            $name = $item['name'] ?? '';
            $productId = isset($item['product_id']) ? (int)$item['product_id'] : 0;
            $qty = max(1, (int)($item['qty'] ?? 1));
            
            // Try variant match first (e.g. "Angle Bar (5 inch)")
            if (preg_match('/^(.+)\s+\((.+)\)$/', $name, $m)) {
                $baseName = trim($m[1]);
                $variantSize = trim($m[2]);
                
                $pp = $pdo->prepare('SELECT id FROM products WHERE name = ? LIMIT 1');
                $pp->execute([$baseName]);
                $parentProd = $pp->fetch();
                
                if ($parentProd) {
                    $vv = $pdo->prepare(
                        'SELECT id FROM product_variants WHERE product_id = ? AND size = ? LIMIT 1'
                    );
                    $vv->execute([$parentProd['id'], $variantSize]);
                    $variant = $vv->fetch();
                    
                    if ($variant) {
                        // Release reserved stock back to available stock
                        $pdo->prepare(
                            'UPDATE product_variants
                             SET reserved_stock = GREATEST(0, reserved_stock - ?)
                             WHERE id = ?'
                        )->execute([$qty, $variant['id']]);
                        
                        // Sync parent totals
                        $pdo->prepare(
                            'UPDATE products
                             SET reserved_stock = (SELECT COALESCE(SUM(reserved_stock), 0) FROM product_variants WHERE product_id = ?)
                             WHERE id = ?'
                        )->execute([$parentProd['id'], $parentProd['id']]);
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
                    $pdo->prepare(
                        'UPDATE products
                         SET reserved_stock = GREATEST(0, reserved_stock - ?)
                         WHERE id = ?'
                    )->execute([$qty, $prod['id']]);
                    continue;
                }
            }
            
            // Fallback: match by name
            if ($name) {
                $p = $pdo->prepare('SELECT id FROM products WHERE name = ? LIMIT 1');
                $p->execute([$name]);
                $prod = $p->fetch();
                
                if ($prod) {
                    $pdo->prepare(
                        'UPDATE products
                         SET reserved_stock = GREATEST(0, reserved_stock - ?)
                         WHERE id = ?'
                    )->execute([$qty, $prod['id']]);
                }
            }
        }
        
        // Mark order as cancelled
        $pdo->prepare(
            "UPDATE sales 
             SET status = 'cancelled',
                 cancel_reason = 'pickup_expired',
                 cancel_notes = 'Order not picked up within 6-hour grace period',
                 updated_at = NOW()
             WHERE id = ?"
        )->execute([$order['id']]);
        
        // Get total amount for notification
        $totalAmount = 0;
        $orderAmountStmt = $pdo->prepare('SELECT total FROM sales WHERE id = ? LIMIT 1');
        $orderAmountStmt->execute([$order['id']]);
        $amountData = $orderAmountStmt->fetch();
        if ($amountData) {
            $totalAmount = (float)$amountData['total'];
        }
        
        // Send cancellation notification to customer
        if ($customerEmail) {
            try {
                // Send EMAIL
                $emailSent = send_pickup_expired_notification(
                    $customerEmail,
                    $customerName,
                    $orderRef,
                    $totalAmount
                );
                
                if ($emailSent) {
                    write_log(
                        'System', 
                        'system', 
                        'send_pickup_expired_notification', 
                        'sale', 
                        $orderRef,
                        "Pickup expired notification sent to {$customerEmail}"
                    );
                }
            } catch (\Exception $e) {
                error_log("[JMC] Failed to send pickup expired notification for {$orderRef}: " . $e->getMessage());
            }
        }
        
        // Create IN-APP notification if user has account
        if ($userId) {
            try {
                create_pickup_expired_notification(
                    $userId,
                    $orderRef,
                    $totalAmount
                );
            } catch (\Exception $e) {
                error_log("[JMC] Failed to create in-app notification for {$orderRef}: " . $e->getMessage());
            }
        }
        
        // Log the cancellation
        write_log(
            'System', 
            'system', 
            'auto_cancel_expired_pickup', 
            'sale', 
            $orderRef,
            "Order {$orderRef} auto-cancelled: Not picked up within 6 hours. Stock restored."
        );
        
        $expiredCount++;
        
        // Log to console if running via CLI
        if (php_sapi_name() === 'cli') {
            echo "[" . date('Y-m-d H:i:s') . "] Expired: {$orderRef} ({$order['customer_name']})\n";
        }
    }
    
    $pdo->commit();
    
    if (php_sapi_name() === 'cli') {
        echo "[" . date('Y-m-d H:i:s') . "] Processed {$expiredCount} expired pickup order(s)\n";
    } else {
        json_response([
            'success' => true,
            'expired_count' => $expiredCount,
            'message' => "{$expiredCount} order(s) auto-cancelled due to pickup expiration",
            'timestamp' => date('Y-m-d H:i:s')
        ]);
    }
    
} catch (\Exception $e) {
    if ($pdo->inTransaction()) {
        $pdo->rollBack();
    }
    
    $errorMsg = 'Failed to process pickup expiration: ' . $e->getMessage();
    
    if (php_sapi_name() === 'cli') {
        echo "[" . date('Y-m-d H:i:s') . "] ERROR: {$errorMsg}\n";
        exit(1);
    } else {
        json_err($errorMsg, 500);
    }
}
