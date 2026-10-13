<?php
// GET    /api/categories         — list all
// POST   /api/categories         — create
// DELETE /api/categories/{id}    — delete
require_once __DIR__ . '/../db.php';

$method = $_SERVER['REQUEST_METHOD'];
$id     = isset($_GET['id']) ? (int)$_GET['id'] : null;
$pdo    = get_db();

if ($method === 'GET') {
    $rows = $pdo->query('SELECT * FROM categories ORDER BY name ASC')->fetchAll();
    json_ok(array_map(fn($c) => [
        'id'         => (int)$c['id'],
        'name'       => $c['name'],
        'created_at' => $c['created_at'],
    ], $rows));

} elseif ($method === 'POST') {
    $body = get_json_body();
    $name = trim($body['name'] ?? '');
    if (!$name) json_err('Category name is required.');

    // Duplicate check
    $dup = $pdo->prepare('SELECT id FROM categories WHERE name = ? LIMIT 1');
    $dup->execute([$name]);
    if ($dup->fetch()) json_err('A category with that name already exists.');

    $stmt = $pdo->prepare('INSERT INTO categories (name) VALUES (?)');
    $stmt->execute([$name]);
    $newId = (int)$pdo->lastInsertId();

    $row = $pdo->prepare('SELECT * FROM categories WHERE id = ?');
    $row->execute([$newId]);
    $cat = $row->fetch();

    json_ok([
        'id'         => (int)$cat['id'],
        'name'       => $cat['name'],
        'created_at' => $cat['created_at'],
    ], 'data');

} elseif ($method === 'DELETE') {
    if (!$id) json_err('Category ID required.', 400);

    $check = $pdo->prepare('SELECT id FROM categories WHERE id = ? LIMIT 1');
    $check->execute([$id]);
    if (!$check->fetch()) json_err('Category not found.', 404);

    $pdo->prepare('DELETE FROM categories WHERE id = ?')->execute([$id]);
    json_response(['success' => true, 'message' => 'Category deleted.']);

} else {
    json_err('Method not allowed.', 405);
}
