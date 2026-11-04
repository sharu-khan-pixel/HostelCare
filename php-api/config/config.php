<?php
// Update these values to match your PostgreSQL installation.
define('DB_HOST', getenv('DB_HOST') ?: '127.0.0.1');
define('DB_PORT', getenv('DB_PORT') ?: '5432');
define('DB_NAME', getenv('DB_NAME') ?: 'hostel_portal');
define('DB_USER', getenv('DB_USER') ?: 'postgres');
define('DB_PASS', getenv('DB_PASS') ?: 'postgres123');
define('JWT_SECRET', getenv('JWT_SECRET') ?: 'change-this-demo-secret-before-deployment');
define('UPLOAD_DIR', dirname(__DIR__, 2) . '/uploads');

if (!is_dir(UPLOAD_DIR)) {
    @mkdir(UPLOAD_DIR, 0777, true);
}
