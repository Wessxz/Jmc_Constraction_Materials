<?php
// GET  /api/orders/cancellations        — list all cancellation records
// PUT  /api/orders/cancellations/{ref}  — approve or reject a cancellation
require_once __DIR__ . '/../db.php';

$method = $_SERVER['REQUEST_METHOD'];
$pdo    = get_db();

if ($method === 'GET') {
    require_role('admin', 'staff');
    $rows = $pdo->query('SELECT * FROM order_cancellations ORDER BY created_at DESC')->fetchAll();
    json_ok(array_map('cancellation_to_dict', $rows));

} elseif ($method === 'PUT') {
    $sess    = require_role('admin', 'staff');
    $ref     = $_GET['ref'] ?? '';
    if (!$ref) json_err('Cancellation reference required.', 400);

    $stmt = $pdo->prepare('SELECT * FROM order_cancellations WHERE cancel_ref = ? LIMIT 1');
    $stmt->execute([$ref]);
    $cancel = $stmt->fetch();
    if (!$cancel) json_err('Cancellation record not found.', 404);

    if ($cancel['status'] !== 'pending') {
        json_err('This cancellation has already been reviewed.');
    }

    $body        = get_json_body();
    $action      = trim($body['action']      ?? '');
    $reviewNotes = trim($body['review_notes'] ?? '');
    $actorName   = trim($body['actorName']   ?? ($sess['full_name'] ?? 'Staff'));
    $actorRole   = trim($body['actorRole']   ?? $sess['role']);

    if (!in_array($action, ['approve', 'reject'], true)) {
        json_err('Invalid action. Use "approve" or "reject".');
    }

    $newStatus = $action === 'approve' ? 'approved' : 'rejected';

    // Update the cancellation record
    $pdo->prepare(
        'UPDATE order_cancellations SET status = ?, reviewed_by = ?, review_notes = ? WHERE cancel_ref = ?'
    )->execute([$newStatus, $actorName, $reviewNotes ?: null, $ref]);

    if ($action === 'approve') {
        // Ensure the linked order is marked cancelled
        $pdo->prepare('UPDATE orders SET status = ? WHERE order_ref = ?')
            ->execute(['cancelled', $cancel['order_ref']]);

        write_log($actorName, $actorRole, 'cancel_approved', 'cancellation', $ref,
            "Cancellation $ref (order {$cancel['order_ref']}) approved by $actorName.");
    } else {
        // Restore order back to pending
        $pdo->prepare('UPDATE orders SET status = ?, cancel_reason = NULL, cancel_notes = NULL WHERE order_ref = ?')
            ->execute(['pending', $cancel['order_ref']]);

        write_log($actorName, $actorRole, 'cancel_rejected', 'cancellation', $ref,
            "Cancellation $ref (order {$cancel['order_ref']}) rejected by $actorName.");
    }

    $stmt->execute([$ref]);
    json_ok(cancellation_to_dict($stmt->fetch()), 'data');

} else {
    json_err('Method not allowed.', 405);
}
