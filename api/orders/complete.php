<?php
/**
 * PUT /api/orders/{ref}/complete
 * Cashier completes an existing reservation payment
 * Updates order to 'completed' and deducts stock
 */
require_once __DIR__ . '/../db.php';

date_default_timezone_set('Asia/Manila');

// DEBUG: Log incoming request
error_log("COMPLETE_DEBUG: Method=" . $_SERVER['REQUEST_METHOD'] . ", ref=" . ($_GET['ref'] ?? 'NONE'));

require_method('PUT');

$ref = $_GET['ref'] ?? '';
if (!$ref) json_err('Order reference required.', 400);

$body = get_json_body();
$tendered = (float)($body['tendered'] ?? 0);
$change = (float)($body['change'] ?? 0);
$cashierName = trim($body['cashier_name'] ?? 'Cashier');
$cashierRole = trim($body['cashier_role'] ?? 'cashier');

if ($tendered <= 0) {
    json_err('Tendered amount must be greater than 0.', 400);
}

$pdo = get_db();

// Get the order
$stmt = $pdo->prepare('SELECT * FROM sales WHERE order_ref = ? LIMIT 1');
$stmt->execute([$ref]);
$order = $stmt->fetch();

if (!$order) {
    json_err('Order not found.', 404);
}

// Check if already completed
if ($order['status'] === 'completed' && $order['tendered'] !== null) {
    json_err('Order already completed. Cannot process payment twice.', 409);
}

$items = json_decode($order['items_json'] ?? '[]', true) ?? [];

$pdo->beginTransaction();
try {
    // Deduct stock for each item
    foreach ($items as $item) {
        $productId = isset($item['product_id']) ? (int)$item['product_id'] : 0;
        $qty = max(1, (int)($item['qty'] ?? 1));

        if ($productId > 0) {
            // Check stock availability
            $checkStmt = $pdo->prepare('SELECT stock FROM products WHERE id = ?');
            $checkStmt->execute([$productId]);
            $prod = $checkStmt->fetch();
            
            if ($prod && (int)$prod['stock'] >= $qty) {
                $pdo->prepare('UPDATE products SET stock = GREATEST(0, stock - ?) WHERE id = ?')
                    ->execute([$qty, $productId]);
            } else {
                $pdo->rollBack();
                $itemName = $item['name'] ?? 'Unknown';
                json_err("Insufficient stock for: $itemName. Available: {$prod['stock']}, Required: $qty", 409);
            }
        }
    }

    // Update order to completed with payment info
    $pdo->prepare(
        'UPDATE sales SET status = ?, tendered = ?, `change` = ? WHERE order_ref = ?'
    )->execute(['completed', $tendered, $change, $ref]);

    write_log($cashierName, $cashierRole, 'complete_reservation', 'sale', $ref,
        "Reservation $ref completed at cashier. Tendered: ₱" . number_format($tendered, 2) . 
        ", Change: ₱" . number_format($change, 2) . ". Stock deducted.");

    $pdo->commit();

    // Get updated order
    $updatedStmt = $pdo->prepare('SELECT * FROM sales WHERE order_ref = ? LIMIT 1');
    $updatedStmt->execute([$ref]);
    $updatedOrder = $updatedStmt->fetch();

    json_response([
        'success' => true,
        'message' => 'Reservation completed - Payment received and stock deducted',
        'order' => [
            'order_ref' => $updatedOrder['order_ref'],
            'status' => $updatedOrder['status'],
            'total' => (float)$updatedOrder['total'],
            'tendered' => (float)$updatedOrder['tendered'],
            'change' => (float)$updatedOrder['change'],
        ]
    ], 200);

} catch (\Exception $e) {
    $pdo->rollBack();
    json_err('Failed to complete reservation: ' . $e->getMessage(), 500);
}
?>
