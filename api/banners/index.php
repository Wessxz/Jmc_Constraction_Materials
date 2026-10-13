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
    // FORCE ABSOLUTE PATH (Hostinger fix)
    $absolutePath = $_SERVER['DOCUMENT_ROOT'] . '/data/banners.json';
    error_log("BANNER LOAD: Using absolute path: $absolutePath");
    
    if (!file_exists($absolutePath)) {
        error_log("BANNER LOAD: File does not exist");
        return [];
    }
    
    clearstatcache(); // Clear file stat cache to get fresh data
    $raw = file_get_contents($absolutePath);
    error_log("BANNER LOAD: File content length: " . strlen($raw));
    error_log("BANNER LOAD: File content: $raw");
    
    $decoded = json_decode($raw, true);
    if ($decoded === null && json_last_error() !== JSON_ERROR_NONE) {
        error_log("BANNER LOAD: JSON decode error: " . json_last_error_msg());
        return [];
    }
    
    error_log("BANNER LOAD: Loaded " . count($decoded ?? []) . " banners");
    return $decoded ?? [];
}

function save_banners(string $file, array $banners): void {
    $jsonContent = json_encode(array_values($banners), JSON_PRETTY_PRINT);
    
    // FORCE DIRECTORY PATH (Hostinger issue fix)
    $absolutePath = $_SERVER['DOCUMENT_ROOT'] . '/data/banners.json';
    error_log("BANNER SAVE: Using absolute path: $absolutePath");
    error_log("BANNER SAVE: Content to write: $jsonContent");
    
    // Method 1: Direct write with absolute path
    $result = @file_put_contents($absolutePath, $jsonContent, LOCK_EX);
    
    if ($result === false) {
        error_log('BANNER SAVE: Method 1 (direct) failed');
        
        // Method 2: Write to temp file then atomic rename
        $tempFile = $absolutePath . '.tmp.' . uniqid();
        $result = @file_put_contents($tempFile, $jsonContent, LOCK_EX);
        
        if ($result === false) {
            error_log('BANNER SAVE: Method 2 (temp file) failed');
            
            // Method 3: Open file handle manually
            $handle = @fopen($absolutePath, 'w');
            if ($handle) {
                if (flock($handle, LOCK_EX)) {
                    fwrite($handle, $jsonContent);
                    fflush($handle);
                    flock($handle, LOCK_UN);
                    fclose($handle);
                    error_log('BANNER SAVE: Method 3 (fopen) succeeded');
                    
                    // Verify
                    clearstatcache();
                    $verify = file_get_contents($absolutePath);
                    if ($verify !== $jsonContent) {
                        error_log('BANNER SAVE: Verification FAILED - content mismatch!');
                        json_err('File write verification failed. Content not saved.', 500);
                    }
                    return;
                } else {
                    fclose($handle);
                    error_log('BANNER SAVE: Method 3 failed to acquire lock');
                }
            } else {
                error_log('BANNER SAVE: Method 3 failed to open file');
            }
            
            // All methods failed
            $dir = dirname($absolutePath);
            $errorDetail = "Cannot save banners. " .
                "Path: $absolutePath, " .
                "Dir exists: " . (is_dir($dir) ? 'yes' : 'no') . ", " .
                "Dir writable: " . (is_writable($dir) ? 'yes' : 'no') . ", " .
                "File exists: " . (file_exists($absolutePath) ? 'yes' : 'no') . ", " .
                "File writable: " . (file_exists($absolutePath) && is_writable($absolutePath) ? 'yes' : 'no');
            
            error_log('BANNER SAVE FAILED: ' . $errorDetail);
            json_err($errorDetail, 500);
            
        } else {
            // Temp file written, now rename
            if (@rename($tempFile, $absolutePath)) {
                error_log('BANNER SAVE: Method 2 (atomic rename) succeeded');
                
                // Verify
                clearstatcache();
                $verify = file_get_contents($absolutePath);
                if ($verify !== $jsonContent) {
                    error_log('BANNER SAVE: Verification FAILED - content mismatch!');
                    json_err('File write verification failed. Content not saved.', 500);
                }
                return;
            } else {
                @unlink($tempFile);
                error_log('BANNER SAVE: Method 2 rename failed');
                json_err("Could not rename temp file to $absolutePath", 500);
            }
        }
    } else {
        error_log("BANNER SAVE: Method 1 succeeded - wrote $result bytes");
        
        // CRITICAL: Verify the write actually worked (Hostinger cache issue)
        clearstatcache();
        $verify = file_get_contents($absolutePath);
        if ($verify !== $jsonContent) {
            error_log('BANNER SAVE: Verification FAILED - content mismatch!');
            error_log('BANNER SAVE: Expected: ' . $jsonContent);
            error_log('BANNER SAVE: Got: ' . $verify);
            json_err('File write verification failed. Content not saved.', 500);
        }
        error_log('BANNER SAVE: Verification PASSED');
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
