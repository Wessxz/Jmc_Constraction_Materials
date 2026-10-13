<?php
/**
 * Truck Batch / Load Planner API
 *
 * GET  /api/deliveries/batch          — list all batches
 * POST /api/deliveries/batch          — create a new batch
 * GET  /api/deliveries/batch/{id}     — get single batch with its deliveries
 * PUT  /api/deliveries/batch/{id}     — update batch (add/remove deliveries, change driver/plate)
 * POST /api/deliveries/batch/{id}/dispatch — dispatch batch: assign all queued deliveries → out_for_delivery
 */
require_once __DIR__ . '/../db.php';
set_cors();

$method = $_SERVER['REQUEST_METHOD'];
$pdo    = get_db();

$batchId = isset($_GET['id']) ? (int)$_GET['id'] : 0;
$action  = $_GET['action'] ?? '';   // 'dispatch'

// ─── Ensure truck_batches table exists ───────────────────────────────────────
$pdo->exec("
    CREATE TABLE IF NOT EXISTS truck_batches (
        id            INT AUTO_INCREMENT PRIMARY KEY,
        batch_ref     VARCHAR(20)  NOT NULL UNIQUE,
        plate_number  VARCHAR(30)  DEFAULT NULL,
        driver_name   VARCHAR(100) DEFAULT NULL,
        notes         TEXT         DEFAULT NULL,
        status        ENUM('open','dispatched','completed') NOT NULL DEFAULT 'open',
        created_at    DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
        dispatched_at DATETIME     DEFAULT NULL,
        total_items   INT          NOT NULL DEFAULT 0
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
");

// Add truck_batch_id column to deliveries if missing
try {
    $pdo->exec("ALTER TABLE deliveries ADD COLUMN truck_batch_id INT DEFAULT NULL");
} catch (\Exception $e) { /* column already exists — ignore */ }

// ─── Helper ──────────────────────────────────────────────────────────────────
function batch_to_dict(array $b, PDO $pdo): array {
    $stmt = $pdo->prepare(
        "SELECT d.*, d.items_json FROM deliveries d WHERE d.truck_batch_id = ? ORDER BY d.created_at"
    );
    $stmt->execute([$b['id']]);
    $deliveries = array_map('delivery_to_dict', $stmt->fetchAll());

    // Count total items across all deliveries in this batch
    $totalItems = 0;
    foreach ($deliveries as $del) {
        foreach ($del['items'] as $item) {
            $totalItems += (int)($item['qty'] ?? 1);
        }
    }

    return [
        'id'            => (int)$b['id'],
        'batch_ref'     => $b['batch_ref'],
        'plate_number'  => $b['plate_number'],
        'driver_name'   => $b['driver_name'],
        'notes'         => $b['notes'],
        'status'        => $b['status'],
        'created_at'    => $b['created_at'],
        'dispatched_at' => $b['dispatched_at'],
        'total_items'   => $totalItems,
        'delivery_count'=> count($deliveries),
        'deliveries'    => $deliveries,
    ];
}

// ─── Route: GET /api/deliveries/batch (list all) ─────────────────────────────
if ($method === 'GET' && !$batchId) {
    $rows = $pdo->query("SELECT * FROM truck_batches ORDER BY created_at DESC")->fetchAll();
    $result = [];
    foreach ($rows as $row) {
        $result[] = batch_to_dict($row, $pdo);
    }
    json_ok($result);
}

// ─── Route: GET /api/deliveries/batch/{id} ───────────────────────────────────
if ($method === 'GET' && $batchId && !$action) {
    $stmt = $pdo->prepare("SELECT * FROM truck_batches WHERE id = ? LIMIT 1");
    $stmt->execute([$batchId]);
    $batch = $stmt->fetch();
    if (!$batch) json_err('Batch not found.', 404);
    json_ok(batch_to_dict($batch, $pdo), 'data');
}

// ─── Route: POST /api/deliveries/batch (create) ──────────────────────────────
if ($method === 'POST' && !$batchId) {
    $body        = get_json_body();
    $plateNumber = trim($body['plateNumber'] ?? '');
    $driverName  = trim($body['driverName']  ?? '');
    $notes       = trim($body['notes']       ?? '');

    // Generate unique BATCH-XXX ref
    do {
        $ref    = 'BATCH-' . strtoupper(substr(bin2hex(random_bytes(3)), 0, 5));
        $exists = $pdo->prepare("SELECT id FROM truck_batches WHERE batch_ref = ? LIMIT 1");
        $exists->execute([$ref]);
    } while ($exists->fetch());

    $pdo->prepare(
        "INSERT INTO truck_batches (batch_ref, plate_number, driver_name, notes) VALUES (?, ?, ?, ?)"
    )->execute([$ref, $plateNumber ?: null, $driverName ?: null, $notes ?: null]);

    $newId = (int)$pdo->lastInsertId();
    $stmt  = $pdo->prepare("SELECT * FROM truck_batches WHERE id = ? LIMIT 1");
    $stmt->execute([$newId]);
    json_ok(batch_to_dict($stmt->fetch(), $pdo), 'data');
}

// ─── Route: PUT /api/deliveries/batch/{id} (update: add/remove deliveries, edit info) ─
if ($method === 'PUT' && $batchId && !$action) {
    $stmt = $pdo->prepare("SELECT * FROM truck_batches WHERE id = ? LIMIT 1");
    $stmt->execute([$batchId]);
    $batch = $stmt->fetch();
    if (!$batch) json_err('Batch not found.', 404);
    if ($batch['status'] === 'dispatched') json_err('Cannot modify a dispatched batch.', 400);

    $body        = get_json_body();
    $plateNumber = isset($body['plateNumber']) ? trim($body['plateNumber']) : $batch['plate_number'];
    $driverName  = isset($body['driverName'])  ? trim($body['driverName'])  : $batch['driver_name'];
    $notes       = isset($body['notes'])       ? trim($body['notes'])       : $batch['notes'];

    // Update batch meta
    $pdo->prepare(
        "UPDATE truck_batches SET plate_number = ?, driver_name = ?, notes = ? WHERE id = ?"
    )->execute([$plateNumber ?: null, $driverName ?: null, $notes ?: null, $batchId]);

    // Handle adding/removing deliveries from the batch
    if (isset($body['addDeliveryRef'])) {
        $ref   = trim($body['addDeliveryRef']);
        $splitMode = isset($body['splitMode']) ? (bool)$body['splitMode'] : false;

        $dStmt = $pdo->prepare("SELECT * FROM deliveries WHERE delivery_ref = ? LIMIT 1");
        $dStmt->execute([$ref]);
        $del = $dStmt->fetch();
        if (!$del) json_err('Delivery not found.', 404);
        if (!in_array($del['status'], ['pending'], true)) {
            json_err('Only pending deliveries can be added to a batch.');
        }

        // ── Capacity check: max 50 items per batch ────────────────────────────
        if (!defined('BATCH_MAX_ITEMS')) define('BATCH_MAX_ITEMS', 50);

        // Count current items already in this batch
        $capStmt = $pdo->prepare("SELECT items_json FROM deliveries WHERE truck_batch_id = ?");
        $capStmt->execute([$batchId]);
        $currentItems = 0;
        foreach ($capStmt->fetchAll() as $row) {
            $its = json_decode($row['items_json'] ?? '[]', true) ?? [];
            foreach ($its as $it) { $currentItems += (int)($it['qty'] ?? 1); }
        }

        $slotsLeft        = BATCH_MAX_ITEMS - $currentItems;
        $newDeliveryItems = json_decode($del['items_json'] ?? '[]', true) ?? [];
        $newItems = 0;
        foreach ($newDeliveryItems as $it) { $newItems += (int)($it['qty'] ?? 1); }

        // ── Fits entirely — just assign ───────────────────────────────────────
        if (($currentItems + $newItems) <= BATCH_MAX_ITEMS) {
            $pdo->prepare("UPDATE deliveries SET truck_batch_id = ? WHERE delivery_ref = ?")
                ->execute([$batchId, $ref]);

        // ── Truck full, no room at all ────────────────────────────────────────
        } elseif ($slotsLeft <= 0) {
            json_err("Truck is full! No slots remaining (max " . BATCH_MAX_ITEMS . " items per truck). Please create a new batch.", 400);

        // ── Partial fit — split the delivery ─────────────────────────────────
        } elseif ($splitMode) {
            // Build two item lists: first batch (fills to limit), second (remainder)
            $firstItems  = [];
            $secondItems = [];
            $filled = 0;

            foreach ($newDeliveryItems as $item) {
                $qty = (int)($item['qty'] ?? 1);
                if ($filled < $slotsLeft) {
                    $canTake = min($qty, $slotsLeft - $filled);
                    if ($canTake > 0) {
                        $firstItems[] = array_merge($item, ['qty' => $canTake]);
                        $filled += $canTake;
                    }
                    $leftover = $qty - $canTake;
                    if ($leftover > 0) {
                        $secondItems[] = array_merge($item, ['qty' => $leftover]);
                    }
                } else {
                    $secondItems[] = $item;
                }
            }

            // Update existing delivery to only contain the first batch items
            $firstTotal = 0;
            foreach ($firstItems as $it) { $firstTotal += (float)($it['price'] ?? 0) * (int)($it['qty'] ?? 1); }

            $pdo->prepare(
                "UPDATE deliveries SET items_json = ?, total_amount = ?, truck_batch_id = ? WHERE delivery_ref = ?"
            )->execute([json_encode($firstItems), $firstTotal ?: (float)$del['total_amount'], $batchId, $ref]);

            // Create a new pending delivery for the remainder
            do {
                $newRef    = 'DEL-' . str_pad((string)random_int(100, 99999), 5, '0', STR_PAD_LEFT);
                $refExists = $pdo->prepare('SELECT id FROM deliveries WHERE delivery_ref = ? LIMIT 1');
                $refExists->execute([$newRef]);
            } while ($refExists->fetch());

            $secondTotal = 0;
            foreach ($secondItems as $it) { $secondTotal += (float)($it['price'] ?? 0) * (int)($it['qty'] ?? 1); }

            $pdo->prepare(
                "INSERT INTO deliveries
                 (delivery_ref, order_id, customer_name, contact_number, address, items_json, total_amount, notes)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?)"
            )->execute([
                $newRef,
                $del['order_id'],
                $del['customer_name'],
                $del['contact_number'],
                $del['address'],
                json_encode($secondItems),
                $secondTotal ?: (float)$del['total_amount'],
                trim(($del['notes'] ?? '') . ' [Split remainder from ' . $ref . ']'),
            ]);

            try {
                write_log('Admin', 'admin', 'split_delivery', 'delivery', $ref,
                    "Delivery {$ref} split: {$filled} items → batch #{$batchId}, remainder ({$newRef}) stays pending.");
            } catch (\Exception $e) {}

            // Return split info in the response
            $stmt->execute([$batchId]);
            json_ok([
                'batch'           => batch_to_dict($stmt->fetch(), $pdo),
                'split'           => true,
                'original_ref'    => $ref,
                'remainder_ref'   => $newRef,
                'items_in_batch'  => $filled,
                'items_remainder' => $newItems - $filled,
                'message'         => "Delivery split: {$filled} item(s) added to this truck. " . ($newItems - $filled) . " item(s) created as new delivery {$newRef}.",
            ]);

        // ── Partial fit — ask frontend to confirm split ───────────────────────
        } else {
            $remaining_slots = $slotsLeft;
            $remainder       = $newItems - $slotsLeft;
            json_response([
                'success'         => false,
                'needsSplit'      => true,
                'delivery_ref'    => $ref,
                'items_total'     => $newItems,
                'slots_available' => $slotsLeft,
                'items_remainder' => $remainder,
                'error'           => "This delivery has {$newItems} items but only {$slotsLeft} slot(s) are available. Split it? ({$slotsLeft} items go now, {$remainder} items stay for the next truck.)",
            ], 409);
        }
    }

    if (isset($body['removeDeliveryRef'])) {
        $ref = trim($body['removeDeliveryRef']);
        $pdo->prepare("UPDATE deliveries SET truck_batch_id = NULL WHERE delivery_ref = ? AND truck_batch_id = ?")
            ->execute([$ref, $batchId]);
    }

    $stmt->execute([$batchId]);
    json_ok(batch_to_dict($stmt->fetch(), $pdo), 'data');
}

// ─── Route: POST /api/deliveries/batch/{id}/dispatch ─────────────────────────
if ($method === 'POST' && $batchId && $action === 'dispatch') {
    $stmt = $pdo->prepare("SELECT * FROM truck_batches WHERE id = ? LIMIT 1");
    $stmt->execute([$batchId]);
    $batch = $stmt->fetch();
    if (!$batch) json_err('Batch not found.', 404);
    if ($batch['status'] === 'dispatched') json_err('Batch already dispatched.', 400);

    $driverName  = trim($batch['driver_name']  ?? '');
    $plateNumber = trim($batch['plate_number'] ?? '');

    if (!$driverName)  json_err('Assign a driver to the batch before dispatching.');
    if (!$plateNumber) json_err('Assign a plate number before dispatching.');

    // Fetch all pending deliveries in this batch
    $delStmt = $pdo->prepare(
        "SELECT * FROM deliveries WHERE truck_batch_id = ? AND status = 'pending'"
    );
    $delStmt->execute([$batchId]);
    $deliveries = $delStmt->fetchAll();

    if (empty($deliveries)) json_err('No pending deliveries in this batch to dispatch.');

    $dateAssigned = date('c');
    $pdo->beginTransaction();
    try {
        foreach ($deliveries as $del) {
            $pdo->prepare(
                "UPDATE deliveries
                 SET delivery_person = ?, plate_number = ?, status = 'out_for_delivery',
                     date_assigned = ?, notes = COALESCE(NULLIF(notes,''), ?)
                 WHERE delivery_ref = ?"
            )->execute([
                $driverName,
                $plateNumber,
                $dateAssigned,
                trim($batch['notes'] ?? ''),
                $del['delivery_ref'],
            ]);

            // ── Deduct stock + sync order status on dispatch ─────────────────
            if (!empty($del['order_id'])) {
                $orderRef = $del['order_id'];
                
                // Check if this is a regular order in sales table
                $salesCheck = $pdo->prepare("SELECT status FROM sales WHERE order_ref = ? LIMIT 1");
                $salesCheck->execute([$orderRef]);
                $salesOrder = $salesCheck->fetch();
                
                if ($salesOrder) {
                    // Regular order from sales table
                    $currentOrderStatus = $salesOrder['status'];
                    
                    // Deduct stock only if not already done
                    if (!in_array($currentOrderStatus, ['delivered', 'completed'], true)) {
                        deduct_order_stock($pdo, $orderRef);
                    }
                    
                    // Advance order to 'out_for_delivery'
                    if (in_array($currentOrderStatus, ['pending', 'confirmed', 'processing'], true)) {
                        $pdo->prepare("UPDATE sales SET status = 'out_for_delivery' WHERE order_ref = ?")
                            ->execute([$orderRef]);
                    }
                } else {
                    // Check if this is a bulk order
                    $bulkCheck = $pdo->prepare("SELECT status, items_json FROM bulk_orders WHERE bulk_ref = ? LIMIT 1");
                    $bulkCheck->execute([$orderRef]);
                    $bulkOrder = $bulkCheck->fetch();
                    
                    if ($bulkOrder) {
                        $currentOrderStatus = $bulkOrder['status'];
                        
                        // Deduct stock for bulk order items (if not already done)
                        if (!in_array($currentOrderStatus, ['delivered', 'completed'], true)) {
                            $bulkItems = json_decode($bulkOrder['items_json'] ?? '[]', true) ?? [];
                            foreach ($bulkItems as $item) {
                                $productId   = isset($item['product_id']) ? (int)$item['product_id'] : 0;
                                $variantId   = isset($item['variant_id']) ? (int)$item['variant_id'] : 0;
                                $qty         = max(1, (int)($item['qty'] ?? 1));
                                $name        = trim($item['name'] ?? '');
                                
                                // Deduct from variant if specified
                                if ($variantId > 0) {
                                    $pdo->prepare('UPDATE product_variants SET stock = GREATEST(0, stock - ?), reserved_stock = GREATEST(0, reserved_stock - ?) WHERE id = ?')
                                        ->execute([$qty, $qty, $variantId]);
                                    // Sync parent stock
                                    $vp = $pdo->prepare('SELECT product_id FROM product_variants WHERE id = ? LIMIT 1');
                                    $vp->execute([$variantId]);
                                    $vpRow = $vp->fetch();
                                    if ($vpRow) {
                                        $pdo->prepare('UPDATE products SET stock = (SELECT COALESCE(SUM(stock),0) FROM product_variants WHERE product_id = ?), reserved_stock = (SELECT COALESCE(SUM(reserved_stock),0) FROM product_variants WHERE product_id = ?) WHERE id = ?')
                                            ->execute([$vpRow['product_id'], $vpRow['product_id'], $vpRow['product_id']]);
                                    }
                                } elseif ($productId > 0) {
                                    // Deduct from product directly
                                    $pdo->prepare('UPDATE products SET stock = GREATEST(0, stock - ?), reserved_stock = GREATEST(0, reserved_stock - ?) WHERE id = ?')
                                        ->execute([$qty, $qty, $productId]);
                                } elseif ($name) {
                                    // Fallback: match by name
                                    $p = $pdo->prepare('SELECT id FROM products WHERE name = ? LIMIT 1');
                                    $p->execute([$name]);
                                    $prod = $p->fetch();
                                    if ($prod) {
                                        $pdo->prepare('UPDATE products SET stock = GREATEST(0, stock - ?), reserved_stock = GREATEST(0, reserved_stock - ?) WHERE id = ?')
                                            ->execute([$qty, $qty, $prod['id']]);
                                    }
                                }
                            }
                        }
                        
                        // Advance bulk order to 'out_for_delivery'
                        if (in_array($currentOrderStatus, ['pending', 'confirmed', 'processing'], true)) {
                            $pdo->prepare("UPDATE bulk_orders SET status = 'out_for_delivery', updated_at = NOW() WHERE bulk_ref = ?")
                                ->execute([$orderRef]);
                        }
                    }
                }
                
                try {
                    write_log('Admin', 'admin', 'update_order_status', 'order', $orderRef,
                        "Order {$orderRef} auto-set to 'out_for_delivery' — dispatched via batch {$batch['batch_ref']} (driver: {$driverName}, plate: {$plateNumber}). Stock deducted.");
                } catch (\Exception $e) { /* non-fatal */ }
            } else {
                // No linked order (walk-in / manual delivery) — deduct from items_json directly
                $delItems = json_decode($del['items_json'] ?? '[]', true) ?? [];
                foreach ($delItems as $item) {
                    $pid = isset($item['product_id']) ? (int)$item['product_id'] : 0;
                    $qty = max(1, (int)($item['qty'] ?? 1));
                    if ($pid > 0) {
                        $pdo->prepare(
                            "UPDATE products
                             SET stock          = GREATEST(0, stock          - ?),
                                 reserved_stock = GREATEST(0, reserved_stock - ?)
                             WHERE id = ?"
                        )->execute([$qty, $qty, $pid]);
                    }
                }
            }

            // Log the dispatch
            try {
                write_log('Admin', 'admin', 'dispatch_truck', 'delivery', $del['delivery_ref'],
                    "Dispatched via batch {$batch['batch_ref']} (Truck: {$plateNumber}, Driver: {$driverName}). Stock deducted.");
            } catch (\Exception $e) { /* non-fatal */ }
        }

        $pdo->prepare(
            "UPDATE truck_batches SET status = 'dispatched', dispatched_at = NOW() WHERE id = ?"
        )->execute([$batchId]);

        $pdo->commit();
    } catch (\Exception $e) {
        $pdo->rollBack();
        json_err('Dispatch failed: ' . $e->getMessage(), 500);
    }

    $stmt->execute([$batchId]);
    json_ok(batch_to_dict($stmt->fetch(), $pdo), 'data');
}

json_err('Method or route not allowed.', 405);
