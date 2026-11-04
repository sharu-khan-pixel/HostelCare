<?php
require_once __DIR__ . '/../config/http.php';
require_once __DIR__ . '/../config/db.php';

$user = current_user();

// ---------------------------------------------------------
// GET /admin.php
// 1) ?action=audit&issue_id=... (Fetch audit trail for an issue)
// 2) List all issues (Admin only)
// ---------------------------------------------------------
if ($_SERVER['REQUEST_METHOD'] === 'GET') {
    $action = $_GET['action'] ?? '';

    // Audit logs endpoint (available as PHP fallback for Java AuditServlet)
    if ($action === 'audit') {
        $issueId = (int)($_GET['issue_id'] ?? 0);
        if ($issueId <= 0) {
            respond(['error' => 'issue_id is required'], 400);
        }

        // If not admin, check if the current user owns this issue
        if ($user['role'] !== 'ADMIN') {
            $check = db()->prepare('SELECT user_id FROM maintenance_issues WHERE id = ?');
            $check->execute([$issueId]);
            $owner = $check->fetch();
            if (!$owner) {
                respond(['error' => 'Issue not found'], 404);
            }
            if ((int)$owner['user_id'] !== $user['id']) {
                respond(['error' => 'Access denied for this issue'], 403);
            }
        }

        $stmt = db()->prepare('
            SELECT a.id, a.issue_id, a.old_status, a.new_status, a.remarks, a.created_at,
                   u.full_name AS actor_name, u.role AS actor_role
            FROM audit_logs a
            JOIN users u ON u.id = a.actor_user_id
            WHERE a.issue_id = ?
            ORDER BY a.created_at ASC, a.id ASC
        ');
        $stmt->execute([$issueId]);
        respond([
            'issue_id' => $issueId,
            'audit_logs' => $stmt->fetchAll()
        ]);
    }

    // Default GET: Admin list of all issues
    if ($user['role'] !== 'ADMIN') {
        respond(['error' => 'Admin access required'], 403);
    }

    $stmt = db()->query('
        SELECT i.*, u.full_name AS student_name, u.email AS student_email
        FROM maintenance_issues i
        JOIN users u ON u.id = i.user_id
        ORDER BY i.created_at DESC
    ');
    respond(['issues' => $stmt->fetchAll()]);
}

// ---------------------------------------------------------
// POST /admin.php
// Status update transaction (PHP fallback for Java StatusServlet)
// ---------------------------------------------------------
if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    if ($user['role'] !== 'ADMIN') {
        respond(['error' => 'Admin access only'], 403);
    }

    $data = json_input();
    $id = (int)($data['issue_id'] ?? 0);
    $status = trim($data['status'] ?? '');
    $remarks = trim($data['remarks'] ?? '');

    $allowed = ['SUBMITTED', 'IN_PROGRESS', 'RESOLVED', 'REJECTED'];

    if ($id <= 0 || !in_array($status, $allowed, true)) {
        respond(['error' => 'Invalid issue ID or status. Allowed: ' . implode(', ', $allowed)], 422);
    }

    $pdo = db();
    $pdo->beginTransaction();

    try {
        $stmt = $pdo->prepare('SELECT status FROM maintenance_issues WHERE id = ? FOR UPDATE');
        $stmt->execute([$id]);
        $issue = $stmt->fetch();

        if (!$issue) {
            $pdo->rollBack();
            respond(['error' => 'Issue not found'], 404);
        }

        $oldStatus = $issue['status'];

        $updateStmt = $pdo->prepare('UPDATE maintenance_issues SET status = ?, updated_at = NOW() WHERE id = ?');
        $updateStmt->execute([$status, $id]);

        $auditStmt = $pdo->prepare('
            INSERT INTO audit_logs(issue_id, actor_user_id, old_status, new_status, remarks, created_at)
            VALUES (?, ?, ?, ?, ?, NOW())
        ');
        $auditStmt->execute([$id, $user['id'], $oldStatus, $status, $remarks !== '' ? $remarks : null]);

        $pdo->commit();
        respond([
            'message' => 'Status updated successfully via PHP transaction',
            'issue_id' => $id,
            'old_status' => $oldStatus,
            'new_status' => $status,
            'remarks' => $remarks
        ]);
    } catch (Throwable $e) {
        $pdo->rollBack();
        respond(['error' => 'Unable to update status: ' . $e->getMessage()], 500);
    }
}

respond(['error' => 'Method not allowed'], 405);
