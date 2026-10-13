<?php
// GET /api/orders  — list all sales (unified: online orders, walk-in, bulk)
// POST /api/orders  — create sale and deduct stock immediately
// VERSION: 2026-10-06-unified-sales (merged orders and transactions)
require_once __DIR__ . '/../db.php';

$method = $_SERVER['REQUEST_METHOD'];
$pdo    = get_db();

if ($method === 'GET') {
    $rows = $pdo->query('SELECT * FROM sales ORDER BY created_at DESC')->fetchAll();
    json_ok(array_map('sale_to_dict', $rows));

} elseif ($method === 'POST') {
    $body         = get_json_body();
    $items        = $body['items']         ?? [];
    $total        = (float)($body['total']        ?? 0);
    $subtotal     = (float)($body['subtotal']     ?? $total);
    $discountType = trim($body['discount_type']   ?? '');
    $discountAmt  = (float)($body['discount_amount'] ?? 0);
    $tendered     = (float)($body['tendered']     ?? 0);
    $change       = (float)($body['change']       ?? 0);
    $customerName = trim($body['customer_name']   ?? 'Walk-in Customer');
    $customerPhone = trim($body['customer_phone']  ?? '');
    $customerAddr = trim($body['customer_address'] ?? '');
    $actorName    = trim($body['actorName']        ?? 'System');
    $actorRole    = trim($body['actorRole']        ?? 'cashier');

    if (empty($items))  json_err('Order must contain at least one item.');
    if ($total <= 0)    json_err('Order total must be greater than 0.');

    start_session();
    $userId    = isset($_SESSION['user_id']) ? (int)$_SESSION['user_id'] : null;
    
    // Check if this is explicitly marked as walk-in (from cashier)
    $forceWalkIn = isset($body['force_walk_in']) && $body['force_walk_in'];
    
    // If force_walk_in flag is set, treat as walk-in regardless of session user_id
    if ($forceWalkIn) {
        $userId = null;
    }
    
    $orderType = $userId ? 'online' : 'walk-in';
    
    // DEBUG: Log what we received
    error_log("ORDER_DEBUG: userId=$userId, forceWalkIn=" . ($forceWalkIn ? 'true' : 'false') . ", orderType=$orderType, customerName=$customerName");

    if ($userId && $customerName === 'Walk-in Customer') {
        $uRow = $pdo->prepare('SELECT full_name FROM users WHERE id = ? LIMIT 1');
        $uRow->execute([$userId]);
        $uData = $uRow->fetch();
        if ($uData) $customerName = $uData['full_name'];
    }

    do {
        $orderRef = 'ORD-' . str_pad((string)random_int(10000, 99999), 5, '0', STR_PAD_LEFT);
        $exists   = $pdo->prepare('SELECT id FROM sales WHERE order_ref = ? LIMIT 1');
        $exists->execute([$orderRef]);
    } while ($exists->fetch());

    $today     = date('Y-m-d');
    $itemsJson = json_encode($items);
    
    // Determine status based on order type
    // - Walk-in (cashier): completed immediately (payment made on spot)
    // - Online: pending (awaits payment/confirmation)
    $orderStatus = $userId ? 'pending' : 'completed';

    $pdo->beginTransaction();
    try {
        // Check stock and deduct immediately
        foreach ($items as $item) {
            $name      = $item['name']       ?? '';
            $productId = isset($item['product_id']) ? (int)$item['product_id'] : 0;
            $qty       = max(1, (int)($item['qty'] ?? 1));

            // Check stock
            if ($productId > 0) {
                $p = $pdo->prepare('SELECT stock FROM products WHERE id = ? LIMIT 1');
                $p->execute([$productId]);
                $prod = $p->fetch();
                if (!$prod || (int)$prod['stock'] < $qty) {
                    $pdo->rollBack();
                    json_err('Insufficient stock for: ' . $name, 409);
                }
            }
        }

        // Deduct stock
        foreach ($items as $item) {
            $name      = $item['name']       ?? '';
            $productId = isset($item['product_id']) ? (int)$item['product_id'] : 0;
            $qty       = max(1, (int)($item['qty'] ?? 1));

            if ($productId > 0) {
                $pdo->prepare('UPDATE products SET stock = GREATEST(0, stock - ?) WHERE id = ?')
                    ->execute([$qty, $productId]);
            }
        }

        // Insert into unified sales table
        $pdo->prepare(
            'INSERT INTO sales (order_ref, user_id, customer_name, customer_phone, customer_address, date, total, subtotal, discount_type, discount_amount, tendered, `change`, status, order_type, items_json)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
        )->execute([
            $orderRef, $userId, $customerName, $customerPhone ?: null, $customerAddr ?: null, 
            $today, $total, $subtotal, $discountType ?: null, $discountAmt, 
            $orderType === 'walk-in' ? $tendered : null,
            $orderType === 'walk-in' ? $change : null,
            $orderStatus, $orderType, $itemsJson
        ]);

        write_log($actorName, $actorRole, 'create_order', 'sale', $orderRef,
            "Sale $orderRef created with status $orderStatus. Total: ₱" . number_format($total, 2));

        $pdo->commit();
    } catch (\Exception $e) {
        $pdo->rollBack();
        json_err('Failed to create order: ' . $e->getMessage(), 500);
    }

    $sRow = $pdo->prepare('SELECT * FROM sales WHERE order_ref = ? LIMIT 1');
    $sRow->execute([$orderRef]);
    $sale = $sRow->fetch();

    json_response([
        'success'     => true,
        'order'       => sale_to_dict($sale),
        '_version'    => '2026-10-06-unified-sales',
    ], 201);

} else {
    json_err('Method not allowed.', 405);
}

// Helper function to convert sale row to dict
function sale_to_dict(array $s): array {
    $pdo = get_db();
    $user = null;
    if (!empty($s['user_id'])) {
        $stmt = $pdo->prepare('SELECT full_name, email, phone, town, address FROM users WHERE id = ?');
        $stmt->execute([$s['user_id']]);
        $user = $stmt->fetch() ?: null;
    }
    
    $dict = [
        'id'              => (int)$s['id'],
        'order_ref'       => $s['order_ref'],
        'user_id'         => $s['user_id'] ? (int)$s['user_id'] : null,
        'customer_name'   => $s['customer_name'],
        'customer_phone'  => $s['customer_phone'],
        'customer_address' => $s['customer_address'],
        'date'            => $s['date'],
        'subtotal'        => (float)$s['subtotal'],
        'discount_type'   => $s['discount_type'] ?? null,
        'discount_amount' => (float)($s['discount_amount'] ?? 0),
        'total'           => (float)$s['total'],
        'tendered'        => $s['tendered'] ? (float)$s['tendered'] : null,
        'change'          => $s['change'] ? (float)$s['change'] : null,
        'status'          => $s['status'],
        'cancel_reason'   => $s['cancel_reason'] ?? null,
        'cancel_notes'    => $s['cancel_notes'] ?? null,
        'order_type'      => $s['order_type'],
        'items'           => json_decode($s['items_json'] ?? '[]', true) ?? [],
        'created_at'      => $s['created_at'],
        'updated_at'      => $s['updated_at'],
    ];
    
    if ($user) {
        $dict['customer_email']   = $user['email'];
        $dict['customer_phone']   = $user['phone'];
        $dict['customer_address'] = $user['address'];
        $dict['customer_town']    = $user['town'];
    }
    
    return $dict;
}
?>
