<?php
// PUT /api/returns/{ref}/reject  — reject return, no stock change
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
    json_err("Return is already \"{$ret['status']}\" and cannot be rejected.");
}

$body          = get_json_body();
$rejectedBy    = trim($body['rejectedBy']    ?? '');
$rejectorRole  = trim($body['rejectorRole']  ?? '');
$notes         = trim($body['notes']         ?? '');

$combinedNotes = $notes ? $ret['notes'] . ($ret['notes'] ? "\n" : '') . "Rejected by $rejectedBy: $notes"
                        : $ret['notes'];

$pdo->prepare(
    'UPDATE returns SET status = ?, handled_by = ?, notes = ? WHERE return_ref = ?'
)->execute(['rejected', $rejectedBy ?: $ret['handled_by'], $combinedNotes, $ref]);

write_log($rejectedBy ?: 'System', $rejectorRole ?: 'staff', 'reject_return', 'return', $ref,
    "Return $ref rejected.");

$stmt->execute([$ref]);
json_ok(return_to_dict($stmt->fetch()), 'data');
