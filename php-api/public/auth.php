<?php
require_once __DIR__ . '/../config/http.php';
require_once __DIR__ . '/../config/db.php';

$action = $_GET['action'] ?? '';

if ($_SERVER['REQUEST_METHOD'] === 'GET' && $action === 'me') {
    $user = current_user();
    $stmt = db()->prepare('SELECT id, full_name, email, role, created_at FROM users WHERE id = ?');
    $stmt->execute([$user['id']]);
    $freshUser = $stmt->fetch();
    if (!$freshUser) {
        respond(['error' => 'User not found'], 404);
    }
    respond([
        'user' => $freshUser,
        'token' => make_token($freshUser)
    ]);
}

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    respond(['error' => 'Use POST for auth requests'], 405);
}

$data = json_input();

if ($action === 'register') {
    $name = trim($data['full_name'] ?? '');
    $email = strtolower(trim($data['email'] ?? ''));
    $password = $data['password'] ?? '';

    if ($name === '' || !filter_var($email, FILTER_VALIDATE_EMAIL) || strlen($password) < 6) {
        respond(['error' => 'Enter a name, valid email, and password (minimum 6 characters).'], 422);
    }

    try {
        $stmt = db()->prepare('INSERT INTO users(full_name, email, password_hash) VALUES(?, ?, ?) RETURNING id, full_name, email, role, created_at');
        $stmt->execute([$name, $email, password_hash($password, PASSWORD_DEFAULT)]);
        $user = $stmt->fetch();
        respond([
            'message' => 'Account created successfully',
            'user' => $user,
            'token' => make_token($user)
        ], 201);
    } catch (PDOException $e) {
        if ($e->getCode() === '23505') {
            respond(['error' => 'An account with this email already exists'], 409);
        }
        respond(['error' => 'Database error: ' . $e->getMessage()], 500);
    }
}

if ($action === 'login') {
    $email = strtolower(trim($data['email'] ?? ''));
    $password = $data['password'] ?? '';

    if ($email === '' || $password === '') {
        respond(['error' => 'Email and password are required'], 422);
    }

    $stmt = db()->prepare('SELECT id, full_name, email, role, password_hash FROM users WHERE email = ?');
    $stmt->execute([$email]);
    $user = $stmt->fetch();

    if (!$user || !password_verify($password, $user['password_hash'])) {
        respond(['error' => 'Invalid email or password'], 401);
    }

    unset($user['password_hash']);
    respond([
        'message' => 'Login successful',
        'user' => $user,
        'token' => make_token($user)
    ]);
}

respond(['error' => 'Unknown action. Expected ?action=register, ?action=login, or ?action=me'], 404);
