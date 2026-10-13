<?php
// GET    /api/banners         — list all
// POST   /api/banners         — add (multipart image upload)
// POST   /api/banners (with banner_id) — replace (multipart image upload)
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
    $jsonContent = json_encode(array_values($banners), JSON_PRETTY_PRINT);
    
    // Try direct write first (remove @ to see errors)
    $result = file_put_contents($file, $jsonContent);
    
    if ($result === false) {
        // Get last error
        $error = error_get_last();
        $errorMsg = $error ? $error['message'] : 'Unknown error';
        
        // Try backup method
        $backup = $file . '.new';
        $result = file_put_contents($backup, $jsonContent);
        
        if ($result === false) {
            // Both failed - detailed error
            $dir = dirname($file);
            $dirExists = is_dir($dir);
            $dirWritable = is_writable($dir);
            $fileExists = file_exists($file);
            $fileWritable = $fileExists ? is_writable($file) : 'N/A';
            
            $errorDetail = "Cannot save banners. " .
                "Dir exists: " . ($dirExists ? 'yes' : 'no') . ", " .
                "Dir writable: " . ($dirWritable ? 'yes' : 'no') . ", " .
                "File exists: " . ($fileExists ? 'yes' : 'no') . ", " .
                "File writable: " . $fileWritable . ". " .
                "Error: " . $errorMsg;
            
            error_log('BANNER SAVE FAILED: ' . $errorDetail);
            json_err($errorDetail, 500);
        } else {
            // Backup succeeded, try rename
            if (rename($backup, $file)) {
                error_log('BANNER SAVE SUCCESS: via backup/rename');
                return; // Success via backup
            } else {
                $msg = "Created $backup but cannot rename. Please manually rename it to banners.json";
                error_log('BANNER SAVE PARTIAL: ' . $msg);
                json_err($msg, 500);
            }
        }
    } else {
        error_log('BANNER SAVE SUCCESS: Direct write, ' . $result . ' bytes');
    }
}

function handle_banner_upload(): ?string {
    if (empty($_FILES['image'])) return null;
    
    $file     = $_FILES['image'];
    $tmpPath  = $file['tmp_name'];
    $mimeType = mime_content_type($tmpPath);
    $allowed  = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
    
    if (!in_array($mimeType, $allowed, true)) json_err('Invalid file type.');
    if ($file['size'] > 16 * 1024 * 1024) json_err('File exceeds 16 MB.');
    
    // Make sure upload directory exists (same as product upload)
    if (!is_dir(UPLOAD_DIR)) {
        mkdir(UPLOAD_DIR, 0755, true);
    }
    
    $ext      = strtolower(pathinfo($file['name'], PATHINFO_EXTENSION));
    $safeName = 'banner_' . uniqid() . '.' . $ext;
    $dest     = UPLOAD_DIR . $safeName;
    
    if (!move_uploaded_file($tmpPath, $dest)) {
        json_err('Failed to save banner image.', 500);
    }
    
    return UPLOAD_URL . $safeName;
}

// ─── GET ─────────────────────────────────────────────────────────────────────
if ($method === 'GET') {
    json_ok(load_banners($JSON_FILE));

// ─── POST ────────────────────────────────────────────────────────────────────
} elseif ($method === 'POST') {
    // Check if this is a replace operation
    if (isset($_POST['banner_id'])) {
        // This is a REPLACE operation
        $bannerId = (int)$_POST['banner_id'];
        
        $banners = load_banners($JSON_FILE);
        $idx     = null;
        foreach ($banners as $i => $b) {
            if ((int)$b['id'] === $bannerId) { $idx = $i; break; }
        }
        if ($idx === null) json_err('Banner not found. ID: ' . $bannerId, 404);

        $url = handle_banner_upload();
        if (!$url) json_err('No image provided for replacement.', 400);

        $banners[$idx]['url'] = $url;
        save_banners($JSON_FILE, $banners);
        json_ok($banners[$idx], 'data');
    } else {
        // This is an ADD operation
        error_log('Banner ADD: Starting upload...');
        error_log('FILES: ' . print_r($_FILES, true));
        
        $url = handle_banner_upload();
        error_log('Banner ADD: Upload result URL: ' . ($url ?: 'NULL'));
        
        if (!$url) {
            // Fallback: JSON body with url field
            $body = get_json_body();
            $url  = trim($body['url'] ?? '');
        }
        if (!$url) json_err('No image or URL provided.');

        $banners = load_banners($JSON_FILE);
        error_log('Banner ADD: Current banners count: ' . count($banners));
        error_log('Banner ADD: Current banners data: ' . print_r($banners, true));
        
        // Calculate new ID safely
        if (empty($banners)) {
            $newId = 1;
        } else {
            $ids = array_column($banners, 'id');
            $newId = empty($ids) ? 1 : max($ids) + 1;
        }
        
        error_log('Banner ADD: New ID will be: ' . $newId);
        
        $banner  = ['id' => $newId, 'url' => $url];
        $banners[] = $banner;
        
        error_log('Banner ADD: About to save ' . count($banners) . ' banners');
        error_log('Banner ADD: New banners array: ' . print_r($banners, true));
        
        save_banners($JSON_FILE, $banners);
        error_log('Banner ADD: save_banners() completed without error');
        
        // Double-check it was saved
        clearstatcache();
        $verify = load_banners($JSON_FILE);
        error_log('Banner ADD: Verification - loaded ' . count($verify) . ' banners after save');
        
        json_ok($banner, 'data');
    }

// ─── PUT ─────────────────────────────────────────────────────────────────────
} elseif ($method === 'PUT') {
    if ($bannerId === null) json_err('Banner ID required.', 400);
    $bannerId = (int)$bannerId;

    $banners = load_banners($JSON_FILE);
    $idx     = null;
    foreach ($banners as $i => $b) {
        if ((int)$b['id'] === $bannerId) { $idx = $i; break; }
    }
    if ($idx === null) json_err('Banner not found. ID: ' . $bannerId, 404);

    $url = handle_banner_upload();
    if (!$url) {
        $body = get_json_body();
        $url  = trim($body['url'] ?? '');
    }
    if (!$url) json_err('No image or URL provided. Check file upload.', 400);

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
