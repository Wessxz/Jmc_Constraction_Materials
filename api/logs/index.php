<?php
// GET  /api/logs  — list logs with optional filters: limit, actor, role, action
// POST /api/logs  — write a log entry
require_once __DIR__ . '/../db.php';

$method = $_SERVER['REQUEST_METHOD'];
$pdo    = get_db();

if ($method === 'GET') {
    $limit  = min(500, max(1, (int)($_GET['limit']  ?? 100)));
    $actor  = trim($_GET['actor']  ?? '');
    $role   = trim($_GET['role']   ?? '');
    $action = trim($_GET['action'] ?? '');

    $where  = [];
    $params = [];

    if ($actor)  { $where[] = 'actor_name LIKE ?';  $params[] = "%$actor%"; }
    if ($role)   { $where[] = 'actor_role = ?';      $params[] = $role; }
    if ($action) { $where[] = 'action = ?';          $params[] = $action; }

    $sql = 'SELECT * FROM activity_logs';
    if ($where) $sql .= ' WHERE ' . implode(' AND ', $where);
    $sql .= ' ORDER BY created_at DESC LIMIT ' . $limit;

    $stmt = $pdo->prepare($sql);
    $stmt->execute($params);
    $rows = $stmt->fetchAll();

    json_ok(array_map(fn($l) => [
        'id'          => (int)$l['id'],
        'actor_name'  => $l['actor_name'],
        'actor_role'  => $l['actor_role'],
        'action'      => $l['action'],
        'target_type' => $l['target_type'],
        'target_id'   => $l['target_id'],
        'details'     => $l['details'],
        'created_at'  => $l['created_at'],
    ], $rows));

} elseif ($method === 'POST') {
    $body       = get_json_body();
    $actorName  = trim($body['actorName']  ?? '');
    $actorRole  = trim($body['actorRole']  ?? '');
    $action     = trim($body['action']     ?? '');
    $targetType = trim($body['targetType'] ?? '');
    $targetId   = trim($body['targetId']   ?? '');
    $details    = trim($body['details']    ?? '');

    if (!$actorName || !$actorRole || !$action) {
        json_err('actorName, actorRole, and action are required.');
    }

    write_log($actorName, $actorRole, $action, $targetType, $targetId, $details);

    // Return the newly inserted log
    $newId = (int)$pdo->lastInsertId();
    $row   = $pdo->prepare('SELECT * FROM activity_logs WHERE id = ?');
    $row->execute([$newId]);
    $log   = $row->fetch();

    json_ok([
        'id'          => (int)$log['id'],
        'actor_name'  => $log['actor_name'],
        'actor_role'  => $log['actor_role'],
        'action'      => $log['action'],
        'target_type' => $log['target_type'],
        'target_id'   => $log['target_id'],
        'details'     => $log['details'],
        'created_at'  => $log['created_at'],
    ], 'data');

} else {
    json_err('Method not allowed.', 405);
}
