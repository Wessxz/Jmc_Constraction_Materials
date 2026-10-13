<?php
// GET  /api/returns  — list all return requests
// POST /api/returns  — create a return request
require_once __DIR__ . '/../db.php';

$method = $_SERVER['REQUEST_METHOD'];
$pdo    = get_db();

if ($method === 'GET') {
    $rows = $pdo->query('SELECT * FROM returns ORDER BY created_at DESC')->fetchAll();
    json_ok(array_map('return_to_dict', $rows));

} elseif ($method === 'POST') {
    $body           = get_json_body();
    $originalTxnRef = trim($body['originalTxnRef'] ?? '');
    $customerName   = trim($body['customerName']   ?? 'Walk-in Customer');
    $reason         = trim($body['reason']         ?? '');
    $items          = $body['items']               ?? [];
    $handledBy      = trim($body['handledBy']      ?? '');
    $handlerRole    = trim($body['handlerRole']    ?? '');

    if (empty($items)) json_err('Return must contain at least one item.');

    // Calculate refund total from items
    $refundAmount = 0.0;
    foreach ($items as $item) {
        $refundAmount += (float)($item['price'] ?? 0) * (int)($item['qty'] ?? 1);
    }

    // Generate unique RET-XXXX ref
    do {
        $ref    = 'RET-' . str_pad((string)random_int(1000, 9999), 4, '0', STR_PAD_LEFT);
        $exists = $pdo->prepare('SELECT id FROM returns WHERE return_ref = ? LIMIT 1');
        $exists->execute([$ref]);
    } while ($exists->fetch());

    $pdo->prepare(
        'INSERT INTO returns
         (return_ref, original_txn_ref, customer_name, reason, items_json, refund_amount, handled_by)
         VALUES (?, ?, ?, ?, ?, ?, ?)'
    )->execute([
        $ref,
        $originalTxnRef ?: null,
        $customerName,
        $reason,
        json_encode($items),
        $refundAmount,
        $handledBy,
    ]);

    write_log($handledBy ?: 'System', $handlerRole ?: 'staff', 'create_return', 'return', $ref,
        "Return $ref created for customer \"$customerName\". Refund: ₱" . number_format($refundAmount, 2));

    $row = $pdo->prepare('SELECT * FROM returns WHERE return_ref = ? LIMIT 1');
    $row->execute([$ref]);
    json_ok(return_to_dict($row->fetch()), 'data');

} else {
    json_err('Method not allowed.', 405);
}
