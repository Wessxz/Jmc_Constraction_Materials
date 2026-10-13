<?php
// GET  /api/returns  — list all return requests
// POST /api/returns  — create a return request
error_reporting(E_ALL);
ini_set('display_errors', 1);
ini_set('log_errors', 1);

require_once __DIR__ . '/../db.php';

$method = $_SERVER['REQUEST_METHOD'];
$pdo    = get_db();

if ($method === 'GET') {
    $rows = $pdo->query('SELECT * FROM returns ORDER BY created_at DESC')->fetchAll();
    json_ok(array_map('return_to_dict', $rows));

} elseif ($method === 'POST') {
    error_log('[returns/index.php] POST request received');
    
    $body = get_json_body();
    error_log('[returns/index.php] Body: ' . json_encode($body));
    
    $originalTxnRef = trim($body['originalTxnRef'] ?? '');
    $customerName   = trim($body['customerName']   ?? 'Walk-in Customer');
    $reason         = trim($body['reason']         ?? '');
    $items          = $body['items']               ?? [];
    $handledBy      = trim($body['handledBy']      ?? '');
    $handlerRole    = trim($body['handlerRole']    ?? '');
    $datePurchased  = trim($body['datePurchased']  ?? '');
    $dateReturned   = trim($body['dateReturned']   ?? date('Y-m-d'));

    if (empty($items)) {
        error_log('[returns/index.php] ERROR: No items');
        json_err('Return must contain at least one item.');
    }

    $refundAmount = 0.0;
    foreach ($items as $item) {
        $refundAmount += (float)($item['price'] ?? 0) * (int)($item['qty'] ?? 1);
    }

    do {
        $ref = 'RET-' . str_pad((string)random_int(1000, 9999), 4, '0', STR_PAD_LEFT);
        $exists = $pdo->prepare('SELECT id FROM returns WHERE return_ref = ? LIMIT 1');
        $exists->execute([$ref]);
    } while ($exists->fetch());

    try {
        $stmt = $pdo->prepare(
            'INSERT INTO returns
             (return_ref, original_txn_ref, customer_name, reason, items_json, refund_amount, handled_by, date_purchased, date_returned)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)'
        );
        
        $stmt->execute([
            $ref,
            $originalTxnRef ?: null,
            $customerName,
            $reason,
            json_encode($items),
            $refundAmount,
            $handledBy,
            $datePurchased ?: null,
            $dateReturned ?: null,
        ]);

        write_log($handledBy ?: 'System', $handlerRole ?: 'staff', 'create_return', 'return', $ref,
            "Return $ref created. Refund: ₱" . number_format($refundAmount, 2));

        $row = $pdo->prepare('SELECT * FROM returns WHERE return_ref = ? LIMIT 1');
        $row->execute([$ref]);
        $result = $row->fetch();
        
        if ($result) {
            json_response(['success' => true, 'data' => return_to_dict($result)]);
        } else {
            json_err('Failed to retrieve created return.');
        }
        
    } catch (Exception $e) {
        error_log('[returns/index.php] ERROR: ' . $e->getMessage());
        json_err('Database error: ' . $e->getMessage());
    }

} else {
    json_err('Method not allowed.', 405);
}
