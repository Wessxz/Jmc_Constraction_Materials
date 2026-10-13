<?php
// GET /api/transactions  — list all transactions (cashier receipts)
require_once __DIR__ . '/../db.php';

$pdo = get_db();

if ($_SERVER['REQUEST_METHOD'] === 'GET') {
    $rows = $pdo->query('SELECT * FROM transactions ORDER BY timestamp DESC')->fetchAll();
    
    $transactions = array_map(function($txn) {
        return [
            'id'        => (int)$txn['id'],
            'txn_ref'   => $txn['txn_ref'],
            'total'     => (float)$txn['total'],
            'tendered'  => (float)$txn['tendered'],
            'change'    => (float)$txn['change'],
            'status'    => $txn['status'],
            'timestamp' => $txn['timestamp'],
            'items'     => json_decode($txn['items_json'] ?? '[]', true) ?? [],
        ];
    }, $rows);
    
    json_ok($transactions);
} else {
    json_err('Method not allowed.', 405);
}
?>
