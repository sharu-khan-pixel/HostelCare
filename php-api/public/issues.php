<?php
require_once __DIR__ . '/../config/http.php';
require_once __DIR__ . '/../config/db.php';

$user = current_user();

// ---------------------------------------------------------
// GET: List issues or get a single issue with audit history
// ---------------------------------------------------------
if ($_SERVER['REQUEST_METHOD'] === 'GET') {
    $id = isset($_GET['id']) ? (int)$_GET['id'] : 0;

    // Single issue details + audit log
    if ($id > 0) {
        $stmt = db()->prepare('
            SELECT i.*, u.full_name AS student_name, u.email AS student_email
            FROM maintenance_issues i
            JOIN users u ON u.id = i.user_id
            WHERE i.id = ?
        ');
        $stmt->execute([$id]);
        $issue = $stmt->fetch();

        if (!$issue) {
            respond(['error' => 'Issue not found'], 404);
        }

        if ($user['role'] !== 'ADMIN' && (int)$issue['user_id'] !== $user['id']) {
            respond(['error' => 'Access denied'], 403);
        }

        // Fetch audit logs
        $auditStmt = db()->prepare('
            SELECT a.*, u.full_name AS actor_name, u.role AS actor_role
            FROM audit_logs a
            JOIN users u ON u.id = a.actor_user_id
            WHERE a.issue_id = ?
            ORDER BY a.created_at ASC, a.id ASC
        ');
        $auditStmt->execute([$id]);
        $issue['audit_logs'] = $auditStmt->fetchAll();

        respond(['issue' => $issue]);
    }

    // List issues with optional filtering
    $statusFilter = trim($_GET['status'] ?? '');
    $categoryFilter = trim($_GET['category'] ?? '');
    $priorityFilter = trim($_GET['priority'] ?? '');

    $where = [];
    $params = [];

    if ($user['role'] !== 'ADMIN') {
        $where[] = 'i.user_id = ?';
        $params[] = $user['id'];
    }

    if ($statusFilter !== '') {
        $where[] = 'i.status = ?';
        $params[] = $statusFilter;
    }

    if ($categoryFilter !== '') {
        $where[] = 'i.category = ?';
        $params[] = $categoryFilter;
    }

    if ($priorityFilter !== '') {
        $where[] = 'i.priority = ?';
        $params[] = $priorityFilter;
    }

    $sql = '
        SELECT i.*, u.full_name AS student_name, u.email AS student_email
        FROM maintenance_issues i
        JOIN users u ON u.id = i.user_id
    ';
    if (!empty($where)) {
        $sql .= ' WHERE ' . implode(' AND ', $where);
    }
    $sql .= ' ORDER BY i.created_at DESC';

    $stmt = db()->prepare($sql);
    $stmt->execute($params);
    $issues = $stmt->fetchAll();

    respond(['issues' => $issues]);
}

// ---------------------------------------------------------
// POST: Submit a new maintenance issue (with optional file)
// ---------------------------------------------------------
if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    $data = json_input();

    // Check if form-data was used (e.g. for file upload)
    if (empty($data) && !empty($_POST)) {
        $data = $_POST;
    }

    $title = trim($data['title'] ?? '');
    $category = trim($data['category'] ?? '');
    $description = trim($data['description'] ?? '');
    $location = trim($data['location'] ?? '');
    $priority = strtoupper(trim($data['priority'] ?? 'MEDIUM'));

    if ($title === '' || $category === '' || $description === '' || $location === '') {
        respond(['error' => 'Title, category, description, and location are required.'], 422);
    }

    $allowedPriorities = ['LOW', 'MEDIUM', 'HIGH'];
    if (!in_array($priority, $allowedPriorities, true)) {
        $priority = 'MEDIUM';
    }

    // Handle optional attachment
    $attachmentPath = null;
    if (isset($_FILES['attachment']) && $_FILES['attachment']['error'] === UPLOAD_ERR_OK) {
        $file = $_FILES['attachment'];
        $ext = strtolower(pathinfo($file['name'], PATHINFO_EXTENSION));
        $allowedExts = ['jpg', 'jpeg', 'png', 'gif', 'webp', 'pdf'];

        if (in_array($ext, $allowedExts, true)) {
            $filename = uniqid('issue_', true) . '.' . $ext;
            $dest = UPLOAD_DIR . '/' . $filename;
            if (move_uploaded_file($file['tmp_name'], $dest)) {
                $attachmentPath = 'uploads/' . $filename;
            }
        }
    }

    $pdo = db();
    $pdo->beginTransaction();

    try {
        $stmt = $pdo->prepare('
            INSERT INTO maintenance_issues(user_id, title, category, description, location, priority, status, attachment_path, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, \'SUBMITTED\', ?, NOW(), NOW())
            RETURNING *
        ');
        $stmt->execute([
            $user['id'],
            $title,
            $category,
            $description,
            $location,
            $priority,
            $attachmentPath
        ]);
        $issue = $stmt->fetch();

        // Create initial audit log entry
        $auditStmt = $pdo->prepare('
            INSERT INTO audit_logs(issue_id, actor_user_id, old_status, new_status, remarks, created_at)
            VALUES (?, ?, NULL, \'SUBMITTED\', \'Issue submitted by student\', NOW())
        ');
        $auditStmt->execute([$issue['id'], $user['id']]);

        $pdo->commit();
        respond([
            'message' => 'Request submitted successfully',
            'issue' => $issue
        ], 201);
    } catch (Throwable $e) {
        $pdo->rollBack();
        respond(['error' => 'Unable to submit issue: ' . $e->getMessage()], 500);
    }
}

// ---------------------------------------------------------
// DELETE: Cancel/delete an issue
// ---------------------------------------------------------
if ($_SERVER['REQUEST_METHOD'] === 'DELETE') {
    $id = isset($_GET['id']) ? (int)$_GET['id'] : 0;
    if ($id <= 0) {
        respond(['error' => 'Issue ID is required'], 422);
    }

    $pdo = db();
    $stmt = $pdo->prepare('SELECT * FROM maintenance_issues WHERE id = ?');
    $stmt->execute([$id]);
    $issue = $stmt->fetch();

    if (!$issue) {
        respond(['error' => 'Issue not found'], 404);
    }

    // Students can only delete their own issues if still in SUBMITTED status
    if ($user['role'] !== 'ADMIN') {
        if ((int)$issue['user_id'] !== $user['id']) {
            respond(['error' => 'You can only cancel your own requests'], 403);
        }
        if ($issue['status'] !== 'SUBMITTED') {
            respond(['error' => 'Cannot cancel a request that is already ' . $issue['status']], 422);
        }
    }

    $pdo->beginTransaction();
    try {
        // Delete audit logs first
        $delAudit = $pdo->prepare('DELETE FROM audit_logs WHERE issue_id = ?');
        $delAudit->execute([$id]);

        $delIssue = $pdo->prepare('DELETE FROM maintenance_issues WHERE id = ?');
        $delIssue->execute([$id]);

        $pdo->commit();
        respond(['message' => 'Request canceled successfully', 'deleted_id' => $id]);
    } catch (Throwable $e) {
        $pdo->rollBack();
        respond(['error' => 'Failed to delete issue: ' . $e->getMessage()], 500);
    }
}

respond(['error' => 'Method not allowed'], 405);
