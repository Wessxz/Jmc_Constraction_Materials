<?php
// GET  /api/bulk-orders          — list all bulk orders (admin)
// POST /api/bulk-orders          — submit a new bulk order (online/walk-in)
require_once __DIR__ . '/../db.php';

$method = $_SERVER['REQUEST_METHOD'];
$pdo    = get_db();

if ($method === 'GET') {
    $myOrders = isset($_GET['my']) && $_GET['my'] === '1';

    if ($myOrders) {
        // Customer viewing their own bulk orders — by user_id or email
        start_session();
        $userId     = $_SESSION['user_id'] ?? null;
        $userEmail  = $_SESSION['user_email'] ?? null;

        if (!$userId && !$userEmail) {
            json_err('Unauthorized', 401);
        }

        $where  = [];
        $params = [];
        if ($userId) {
            $where[]  = 'user_id = ?';
            $params[] = $userId;
        } elseif ($userEmail) {
            $where[]  = 'email = ?';
            $params[] = $userEmail;
        }

        $sql  = 'SELECT * FROM bulk_orders WHERE ' . implode(' AND ', $where) . ' ORDER BY created_at DESC';
        $stmt = $pdo->prepare($sql);
        $stmt->execute($params);
        json_ok(array_map('bulk_to_dict', $stmt->fetchAll()));

    } else {
        require_role('admin', 'staff', 'cashier');

        $source = $_GET['source'] ?? '';
        $status = $_GET['status'] ?? '';

        $where  = [];
        $params = [];

        if ($source && in_array($source, ['online', 'walk-in'])) {
            $where[]  = 'order_source = ?';
            $params[] = $source;
        }
        if ($status) {
            $where[]  = 'status = ?';
            $params[] = $status;
        }

        $sql = 'SELECT * FROM bulk_orders';
        if ($where) $sql .= ' WHERE ' . implode(' AND ', $where);
        $sql .= ' ORDER BY created_at DESC';

        $stmt = $pdo->prepare($sql);
        $stmt->execute($params);
        json_ok(array_map('bulk_to_dict', $stmt->fetchAll()));
    }

} elseif ($method === 'POST') {
    $body = get_json_body();

    $source        = trim($body['order_source']  ?? 'online');
    $customerName  = trim($body['customer_name'] ?? '');
    $contactNumber = trim($body['contact_number']?? '');
    $email         = trim($body['email']         ?? '');
    $address       = trim($body['address']       ?? '');
    $projectType   = trim($body['project_type']  ?? '');
    $preferredDate = trim($body['preferred_date']?? '');
    $items         = $body['items']              ?? [];
    $notes         = trim($body['notes']         ?? '');
    $quotedAmount  = (float)($body['quoted_amount']  ?? 0);
    $discountType  = trim($body['discount_type']     ?? '');
    $discountAmt   = (float)($body['discount_amount'] ?? 0);

    // Walk-in: require admin/staff session
    // Online:  no auth required
    $userId     = null;
    $handledBy  = null;
    $initStatus = 'pending';

    if ($source === 'walk-in') {
        $sess      = require_role('admin', 'staff', 'cashier');
        $handledBy = $sess['full_name'];
        $initStatus = 'confirmed'; // walk-in is already confirmed on the spot
    } else {
        // Try to get logged-in user if available
        start_session();
        if (!empty($_SESSION['user_id'])) {
            $userId = $_SESSION['user_id'] ?? null;
        }
    }

    if (!$customerName)  json_err('Customer name is required.', 400);
    if (!$contactNumber) json_err('Contact number is required.', 400);
    if (!$address)       json_err('Delivery address is required.', 400);
    if (empty($items) && $source === 'walk-in') json_err('At least one item is required.', 400);

    // Generate unique BLK-XXXX ref
    do {
        $ref    = 'BLK-' . str_pad((string)random_int(10000, 99999), 5, '0', STR_PAD_LEFT);
        $exists = $pdo->prepare('SELECT id FROM bulk_orders WHERE bulk_ref = ? LIMIT 1');
        $exists->execute([$ref]);
    } while ($exists->fetch());

    $pdo->prepare(
        'INSERT INTO bulk_orders
         (bulk_ref, order_source, customer_name, contact_number, email, address,
          project_type, preferred_date, items_json, notes, status, handled_by, user_id,
          quoted_amount, discount_type, discount_amount)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
    )->execute([
        $ref,
        in_array($source, ['online','walk-in']) ? $source : 'online',
        $customerName,
        $contactNumber,
        $email ?: null,
        $address,
        $projectType ?: null,
        $preferredDate ?: null,
        json_encode($items),
        $notes ?: null,
        $initStatus,
        $handledBy,
        $userId,
        $quotedAmount > 0 ? $quotedAmount : 0,
        $discountType ?: null,
        $discountAmt > 0 ? $discountAmt : 0,
    ]);

    $actor = $handledBy ?? $customerName;
    $role  = $source === 'walk-in' ? 'staff' : 'customer';
    write_log($actor, $role, 'create_bulk_order', 'bulk_order', $ref,
        "Bulk order $ref submitted by $customerName via $source.");

    $row = $pdo->prepare('SELECT * FROM bulk_orders WHERE bulk_ref = ? LIMIT 1');
    $row->execute([$ref]);
    json_ok(bulk_to_dict($row->fetch()), 'data');

} else {
    json_err('Method not allowed.', 405);
}
