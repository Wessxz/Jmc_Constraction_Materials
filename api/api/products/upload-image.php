<?php
// POST /api/products/upload-image  (multipart/form-data, field: image)
require_once __DIR__ . '/../db.php';
require_method('POST');

if (empty($_FILES['image'])) {
    json_err('No image file uploaded. Use field name "image".');
}

$file     = $_FILES['image'];
$tmpPath  = $file['tmp_name'];
$origName = basename($file['name']);
$mimeType = mime_content_type($tmpPath);

$allowed = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
if (!in_array($mimeType, $allowed, true)) {
    json_err('Invalid file type. Allowed: jpg, png, gif, webp.');
}
if ($file['size'] > 16 * 1024 * 1024) {
    json_err('File size exceeds 16 MB limit.');
}

// Make sure upload directory exists
if (!is_dir(UPLOAD_DIR)) {
    mkdir(UPLOAD_DIR, 0755, true);
}

// Build safe unique filename
$ext      = strtolower(pathinfo($origName, PATHINFO_EXTENSION));
$safeName = preg_replace('/[^a-z0-9_\-]/i', '_', pathinfo($origName, PATHINFO_FILENAME));
$filename = $safeName . '_' . uniqid() . '.' . $ext;
$dest     = UPLOAD_DIR . $filename;

if (!move_uploaded_file($tmpPath, $dest)) {
    json_err('Failed to save uploaded file.', 500);
}

json_response([
    'success' => true,
    'path'    => UPLOAD_URL . $filename,
]);
