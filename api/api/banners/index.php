<?php
// GET    /api/banners         — list all
// POST   /api/banners         — add (multipart image upload)
// PUT    /api/banners/{id}    — update (multipart or JSON url)
// DELETE /api/banners/{id}    — delete (min 1 must remain)
require_once __DIR__ . '/../db.php';

$method    = $_SERVER['REQUEST_METHOD'];
$bannerId  = $_GET['id'] ?? null;
$JSON_FILE = __DIR__ . '/../../data/banners.json';

// ─── helpers ─────────────────────────────────────────────────────────────────
function load_banners(string $file): array {
    if (!file_exists($file)) return [];
    $raw = file_get_contents($file);
    return json_decode($raw, true) ?? [];
}

function save_banners(string $file, array $banners): void {
    file_put_contents($file, json_encode(array_values($banners), JSON_PRETTY_PRINT));
}

function handle_banner_upload(): ?string {
    if (empty($_FILES['image'])) return null;
    $file     = $_FILES['image'];
    $tmpPath  = $file['tmp_name'];
    $mimeType = mime_content_type($tmpPath);
    $allowed  = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
    if (!in_array($mimeType, $allowed, true)) json_err('Invalid file type.');
    if ($file['size'] > 16 * 1024 * 1024) json_err('File exceeds 16 MB.');
    if (!is_dir(UPLOAD_DIR)) mkdir(UPLOAD_DIR, 0755, true);
    $ext      = strtolower(pathinfo($file['name'], PATHINFO_EXTENSION));
    $safeName = 'banner_' . uniqid() . '.' . $ext;
    $dest     = UPLOAD_DIR . $safeName;
    if (!move_uploaded_file($tmpPath, $dest)) json_err('Failed to save banner image.', 500);
    return UPLOAD_URL . $safeName;
}

// ─── GET ─────────────────────────────────────────────────────────────────────
if ($method === 'GET') {
    json_ok(load_banners($JSON_FILE));

// ─── POST ────────────────────────────────────────────────────────────────────
} elseif ($method === 'POST') {
    $url = handle_banner_upload();
    if (!$url) {
        // Fallback: JSON body with url field
        $body = get_json_body();
        $url  = trim($body['url'] ?? '');
    }
    if (!$url) json_err('No image or URL provided.');

    $banners = load_banners($JSON_FILE);
    $newId   = count($banners) ? max(array_column($banners, 'id')) + 1 : 1;
    $banner  = ['id' => $newId, 'url' => $url];
    $banners[] = $banner;
    save_banners($JSON_FILE, $banners);
    json_ok($banner, 'data');

// ─── PUT ─────────────────────────────────────────────────────────────────────
} elseif ($method === 'PUT') {
    if ($bannerId === null) json_err('Banner ID required.', 400);
    $bannerId = (int)$bannerId;

    $banners = load_banners($JSON_FILE);
    $idx     = null;
    foreach ($banners as $i => $b) {
        if ((int)$b['id'] === $bannerId) { $idx = $i; break; }
    }
    if ($idx === null) json_err('Banner not found.', 404);

    $url = handle_banner_upload();
    if (!$url) {
        $body = get_json_body();
        $url  = trim($body['url'] ?? '');
    }
    if (!$url) json_err('No image or URL provided.');

    $banners[$idx]['url'] = $url;
    save_banners($JSON_FILE, $banners);
    json_ok($banners[$idx], 'data');

// ─── DELETE ──────────────────────────────────────────────────────────────────
} elseif ($method === 'DELETE') {
    if ($bannerId === null) json_err('Banner ID required.', 400);
    $bannerId = (int)$bannerId;

    $banners = load_banners($JSON_FILE);
    if (count($banners) <= 1) json_err('At least one banner must remain.', 409);

    $filtered = array_filter($banners, fn($b) => (int)$b['id'] !== $bannerId);
    if (count($filtered) === count($banners)) json_err('Banner not found.', 404);

    save_banners($JSON_FILE, array_values($filtered));
    json_response(['success' => true, 'message' => 'Banner deleted.']);

} else {
    json_err('Method not allowed.', 405);
}
