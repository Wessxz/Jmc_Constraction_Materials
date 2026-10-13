<?php
// Test endpoint to verify returns API is working
error_reporting(E_ALL);
ini_set('display_errors', 1);

require_once __DIR__ . '/../db.php';

header('Content-Type: application/json');

try {
    $pdo = get_db();
    
    // Test 1: Check if table exists
    $stmt = $pdo->query("SHOW TABLES LIKE 'returns'");
    $tableExists = $stmt->rowCount() > 0;
    
    // Test 2: Check table structure
    $columns = [];
    if ($tableExists) {
        $stmt = $pdo->query("DESCRIBE returns");
        $columns = $stmt->fetchAll(PDO::FETCH_COLUMN);
    }
    
    // Test 3: Try a simple insert
    $testInsert = false;
    if ($tableExists) {
        try {
            $pdo->prepare(
                'INSERT INTO returns
                 (return_ref, customer_name, reason, items_json, refund_amount, handled_by)
                 VALUES (?, ?, ?, ?, ?, ?)'
            )->execute([
                'TEST-' . time(),
                'Test Customer',
                'Test reason',
                json_encode([['name' => 'Test Item', 'qty' => 1, 'price' => 100]]),
                100.00,
                'Test Handler'
            ]);
            $testInsert = true;
        } catch (Exception $e) {
            $testInsert = $e->getMessage();
        }
    }
    
    echo json_encode([
        'success' => true,
        'table_exists' => $tableExists,
        'columns' => $columns,
        'test_insert' => $testInsert,
        'php_version' => PHP_VERSION,
        'db_connected' => true
    ], JSON_PRETTY_PRINT);
    
} catch (Exception $e) {
    echo json_encode([
        'success' => false,
        'error' => $e->getMessage(),
        'trace' => $e->getTraceAsString()
    ], JSON_PRETTY_PRINT);
}
