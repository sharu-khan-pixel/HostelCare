<?php
require_once __DIR__ . '/config.php';

header('Content-Type: application/json; charset=utf-8');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Headers: Content-Type, Authorization, X-Requested-With');
header('Access-Control-Allow-Methods: GET, POST, PUT, DELETE, OPTIONS');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(204);
    exit;
}

function json_input(): array {
    $raw = file_get_contents('php://input');
    if ($raw) {
        $data = json_decode($raw, true);
        if (is_array($data)) return $data;
    }
    return $_POST ?: [];
}

function respond(array $data, int $status = 200): never {
    http_response_code($status);
    echo json_encode($data, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);
    exit;
}

function b64url_encode(string $data): string {
    return rtrim(strtr(base64_encode($data), '+/', '-_'), '=');
}

function b64url_decode(string $data): string|false {
    $remainder = strlen($data) % 4;
    if ($remainder) {
        $data .= str_repeat('=', 4 - $remainder);
    }
    return base64_decode(strtr($data, '-_', '+/'));
}

function make_token(array $user): string {
    $header = b64url_encode(json_encode(['alg' => 'HS256', 'typ' => 'JWT']));
    $payload = b64url_encode(json_encode([
        'sub' => (string)$user['id'],
        'name' => $user['full_name'],
        'email' => $user['email'],
        'role' => $user['role'],
        'iat' => time(),
        'exp' => time() + (86400 * 7)
    ]));
    $sig = b64url_encode(hash_hmac('sha256', "$header.$payload", JWT_SECRET, true));
    return "$header.$payload.$sig";
}

function get_auth_header(): string {
    if (!empty($_SERVER['HTTP_AUTHORIZATION'])) {
        return $_SERVER['HTTP_AUTHORIZATION'];
    }
    if (!empty($_SERVER['REDIRECT_HTTP_AUTHORIZATION'])) {
        return $_SERVER['REDIRECT_HTTP_AUTHORIZATION'];
    }
    if (function_exists('apache_request_headers')) {
        $h = apache_request_headers();
        if (!empty($h['Authorization'])) return $h['Authorization'];
        if (!empty($h['authorization'])) return $h['authorization'];
    }
    if (function_exists('getallheaders')) {
        $h = getallheaders();
        if (!empty($h['Authorization'])) return $h['Authorization'];
        if (!empty($h['authorization'])) return $h['authorization'];
    }
    return '';
}

function current_user(): array {
    $h = get_auth_header();
    if (!preg_match('/Bearer\s+(\S+)/i', $h, $m)) {
        respond(['error' => 'Missing bearer token in Authorization header'], 401);
    }
    $parts = explode('.', $m[1]);
    if (count($parts) !== 3) {
        respond(['error' => 'Invalid token structure'], 401);
    }
    [$head, $payload, $sig] = $parts;
    $expected = b64url_encode(hash_hmac('sha256', "$head.$payload", JWT_SECRET, true));
    if (!hash_equals($expected, $sig)) {
        respond(['error' => 'Invalid token signature'], 401);
    }
    $decodedPayload = b64url_decode($payload);
    $claims = json_decode($decodedPayload, true);
    if (!$claims || !isset($claims['exp']) || $claims['exp'] < time()) {
        respond(['error' => 'Token has expired or is invalid'], 401);
    }
    return [
        'id' => (int)$claims['sub'],
        'full_name' => $claims['name'] ?? '',
        'email' => $claims['email'] ?? '',
        'role' => $claims['role'] ?? 'STUDENT'
    ];
}
