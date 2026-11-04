<?php
require_once __DIR__ . '/../config/config.php';

$file = basename($_GET['file'] ?? '');
if ($file === '') {
    http_response_code(400);
    exit('Missing file parameter');
}

$path = UPLOAD_DIR . '/' . $file;
if (!file_exists($path)) {
    http_response_code(404);
    exit('File not found');
}

$finfo = finfo_open(FILEINFO_MIME_TYPE);
$mime = finfo_file($finfo, $path);
finfo_close($finfo);

header('Content-Type: ' . ($mime ?: 'application/octet-stream'));
header('Content-Length: ' . filesize($path));
header('Access-Control-Allow-Origin: *');
readfile($path);
exit;
