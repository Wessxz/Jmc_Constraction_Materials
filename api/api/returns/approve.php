<?php
// PUT /api/returns/{ref}/approve  — approve return, restore stock once
require_once __DIR__ . '/../db.php';
require_method('PUT');

$ref = $_GET['ref'] ?? '';
if (!$ref) json_err('Return reference required.', 400);

$pdo  = get_db();
$stmt = $pdo->prepare('SELECT * FROM returns WHERE return_ref = ? LIMIT 1');
$stmt->execute([$ref]);
$ret = $stmt->fetch();
if (!$ret) json_err('Return not found.', 404);

if ($ret['status'] !== 'pending') {
    json_err("Return is already \"{$ret['status']}\" and cannot be approved.");
}

$body         = get_json_body();
$approvedBy   = trim($body['approvedBy']   ?? '');
$approverRole = trim($body['approverRole'] ?? '');
$notes        = trim($body['notes']        ?? '');

// Restore stock for each returned item (only once)
if (!$ret['stock_restored']) {
    $items = json_decode($ret['items_json'], true) ?? [];
    foreach ($items as $item) {
        $itemName = $item['name'] ?? '';
        $qty      = max(1, (int)($item['qty'] ?? 1));

        // Match by name — check for variant suffix first
        if (preg_match('/^(.+)\s+\((.+)\)$/', $itemName, $m)) {
            $baseName    = trim($m[1]);
            $variantSize = trim($m[2]);
            $pRow = $pdo->prepare('SELECT id FROM products WHERE name = ? LIMIT 1');
            $pRow->execute([$baseName]);
            $prod = $pRow->fetch();
            if ($prod) {
                $vRow = $pdo->prepare(
                    'SELECT id FROM product_variants WHERE product_id = ? AND size = ? LIMIT 1'
                );
                $vRow->execute([$prod['id'], $variantSize]);
                $variant = $vRow->fetch();
                if ($variant) {
                    $pdo->prepare('UPDATE product_variants SET stock = stock + ? WHERE id = ?')
                        ->execute([$qty, $variant['id']]);
                    continue;
                }
            }
        }

        // Plain product name match
        $pRow = $pdo->prepare('SELECT id FROM products WHERE name = ? LIMIT 1');
        $pRow->execute([$itemName]);
        $prod = $pRow->fetch();
        if ($prod) {
            $pdo->prepare('UPDATE products SET stock = stock + ? WHERE id = ?')
                ->execute([$qty, $prod['id']]);
        }
    }
}

$combinedNotes = $notes ? $ret['notes'] . ($ret['notes'] ? "\n" : '') . "Approved by $approvedBy: $notes"
                        : $ret['notes'];

$pdo->prepare(
    'UPDATE returns SET status = ?, handled_by = ?, notes = ?, stock_restored = 1 WHERE return_ref = ?'
)->execute(['approved', $approvedBy ?: $ret['handled_by'], $combinedNotes, $ref]);

write_log($approvedBy ?: 'System', $approverRole ?: 'staff', 'approve_return', 'return', $ref,
    "Return $ref approved. Stock restored.");

$stmt->execute([$ref]);
json_ok(return_to_dict($stmt->fetch()), 'data');
