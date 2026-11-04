package com.hostel.servlet;

import com.hostel.config.Db;
import com.hostel.security.JwtAuth;
import jakarta.servlet.annotation.WebServlet;
import jakarta.servlet.http.*;
import java.io.*;
import java.sql.*;
import java.time.format.DateTimeFormatter;
import java.util.*;
import com.fasterxml.jackson.databind.ObjectMapper;
import io.jsonwebtoken.Claims;

@WebServlet("/api/maintenance/audit")
public class AuditServlet extends HttpServlet {

    private final ObjectMapper mapper = new ObjectMapper();

    private void setCorsHeaders(HttpServletResponse res) {
        res.setHeader("Access-Control-Allow-Origin", "*");
        res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
        res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
        res.setContentType("application/json;charset=UTF-8");
    }

    @Override
    protected void doOptions(HttpServletRequest req, HttpServletResponse res) throws IOException {
        setCorsHeaders(res);
        res.setStatus(204);
    }

    @Override
    protected void doGet(HttpServletRequest req, HttpServletResponse res) throws IOException {
        setCorsHeaders(res);

        Claims claims = JwtAuth.verify(req);
        if (claims == null) {
            res.setStatus(401);
            mapper.writeValue(res.getWriter(), Map.of("error", "Invalid or expired token"));
            return;
        }

        String role = claims.get("role", String.class);
        long currentUserId;
        try {
            currentUserId = Long.parseLong(claims.getSubject());
        } catch (Exception e) {
            res.setStatus(401);
            mapper.writeValue(res.getWriter(), Map.of("error", "Invalid user subject in token"));
            return;
        }

        String issueIdParam = req.getParameter("issue_id");
        if (issueIdParam == null || issueIdParam.trim().isEmpty()) {
            res.setStatus(400);
            mapper.writeValue(res.getWriter(), Map.of("error", "issue_id parameter is required"));
            return;
        }

        long issueId;
        try {
            issueId = Long.parseLong(issueIdParam.trim());
        } catch (NumberFormatException e) {
            res.setStatus(400);
            mapper.writeValue(res.getWriter(), Map.of("error", "Invalid issue_id parameter"));
            return;
        }

        List<Map<String, Object>> logs = new ArrayList<>();

        try (Connection conn = Db.getConnection()) {
            // Permission check: Students may only view audit logs for their own issues.
            if (!"ADMIN".equals(role)) {
                try (PreparedStatement checkStmt = conn.prepareStatement(
                        "SELECT user_id FROM maintenance_issues WHERE id = ?")) {
                    checkStmt.setLong(1, issueId);
                    try (ResultSet rsCheck = checkStmt.executeQuery()) {
                        if (!rsCheck.next()) {
                            res.setStatus(404);
                            mapper.writeValue(res.getWriter(), Map.of("error", "Issue not found"));
                            return;
                        }
                        long ownerId = rsCheck.getLong("user_id");
                        if (ownerId != currentUserId) {
                            res.setStatus(403);
                            mapper.writeValue(res.getWriter(), Map.of("error", "Access denied for this issue"));
                            return;
                        }
                    }
                }
            }

            try (PreparedStatement stmt = conn.prepareStatement(
                    "SELECT a.id, a.issue_id, a.old_status, a.new_status, a.remarks, a.created_at, " +
                    "       u.full_name AS actor_name, u.role AS actor_role " +
                    "FROM audit_logs a " +
                    "JOIN users u ON u.id = a.actor_user_id " +
                    "WHERE a.issue_id = ? " +
                    "ORDER BY a.created_at ASC, a.id ASC")) {

                stmt.setLong(1, issueId);

                try (ResultSet rs = stmt.executeQuery()) {
                    while (rs.next()) {
                        Map<String, Object> log = new LinkedHashMap<>();
                        log.put("id", rs.getLong("id"));
                        log.put("issue_id", rs.getLong("issue_id"));
                        log.put("old_status", rs.getString("old_status"));
                        log.put("new_status", rs.getString("new_status"));
                        log.put("remarks", rs.getString("remarks"));
                        log.put("actor_name", rs.getString("actor_name"));
                        log.put("actor_role", rs.getString("actor_role"));
                        Timestamp ts = rs.getTimestamp("created_at");
                        log.put("created_at", ts != null ? ts.toInstant().toString() : null);
                        logs.add(log);
                    }
                }
            }

            mapper.writeValue(res.getWriter(), Map.of(
                "issue_id", issueId,
                "audit_logs", logs
            ));

        } catch (Exception e) {
            e.printStackTrace();
            res.setStatus(500);
            mapper.writeValue(res.getWriter(), Map.of("error", "Database error: " + e.getMessage()));
        }
    }
}
