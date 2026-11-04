package com.hostel.servlet;

import com.hostel.config.Db;
import com.hostel.security.JwtAuth;
import jakarta.servlet.annotation.WebServlet;
import jakarta.servlet.http.*;
import java.io.*;
import java.sql.*;
import java.util.*;
import com.fasterxml.jackson.databind.ObjectMapper;
import io.jsonwebtoken.Claims;

@WebServlet("/api/maintenance/status")
public class StatusServlet extends HttpServlet {

    private final ObjectMapper mapper = new ObjectMapper();

    private void setCorsHeaders(HttpServletResponse res) {
        res.setHeader("Access-Control-Allow-Origin", "*");
        res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
        res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
        res.setContentType("application/json;charset=UTF-8");
    }

    @Override
    protected void doOptions(HttpServletRequest req, HttpServletResponse res) throws IOException {
        setCorsHeaders(res);
        res.setStatus(204);
    }

    @Override
    @SuppressWarnings("unchecked")
    protected void doPost(HttpServletRequest req, HttpServletResponse res) throws IOException {
        setCorsHeaders(res);

        Claims claims = JwtAuth.verify(req);
        if (claims == null) {
            res.setStatus(401);
            mapper.writeValue(res.getWriter(), Map.of("error", "Invalid or expired token"));
            return;
        }

        String role = claims.get("role", String.class);
        if (!"ADMIN".equals(role)) {
            res.setStatus(403);
            mapper.writeValue(res.getWriter(), Map.of("error", "Admin access required"));
            return;
        }

        long actorId;
        try {
            actorId = Long.parseLong(claims.getSubject());
        } catch (Exception e) {
            res.setStatus(401);
            mapper.writeValue(res.getWriter(), Map.of("error", "Invalid user subject in token"));
            return;
        }

        Map<String, Object> body;
        try {
            body = mapper.readValue(req.getInputStream(), Map.class);
        } catch (Exception e) {
            res.setStatus(400);
            mapper.writeValue(res.getWriter(), Map.of("error", "Invalid JSON payload"));
            return;
        }

        long issueId = 0;
        Object rawId = body.get("issue_id");
        if (rawId instanceof Number) {
            issueId = ((Number) rawId).longValue();
        } else if (rawId != null) {
            try {
                issueId = Long.parseLong(rawId.toString().trim());
            } catch (NumberFormatException ignored) {}
        }

        String newStatus = body.getOrDefault("status", "").toString().trim();
        String remarks = body.getOrDefault("remarks", "").toString().trim();

        List<String> allowedStatuses = List.of("SUBMITTED", "IN_PROGRESS", "RESOLVED", "REJECTED");
        if (issueId <= 0 || !allowedStatuses.contains(newStatus)) {
            res.setStatus(422);
            mapper.writeValue(res.getWriter(), Map.of("error", "Invalid issue ID or status. Allowed: " + allowedStatuses));
            return;
        }

        try (Connection conn = Db.getConnection()) {
            conn.setAutoCommit(false);
            try {
                String oldStatus;
                try (PreparedStatement checkStmt = conn.prepareStatement(
                        "SELECT status FROM maintenance_issues WHERE id = ? FOR UPDATE")) {
                    checkStmt.setLong(1, issueId);
                    try (ResultSet rs = checkStmt.executeQuery()) {
                        if (!rs.next()) {
                            conn.rollback();
                            res.setStatus(404);
                            mapper.writeValue(res.getWriter(), Map.of("error", "Issue not found"));
                            return;
                        }
                        oldStatus = rs.getString("status");
                    }
                }

                try (PreparedStatement updateStmt = conn.prepareStatement(
                        "UPDATE maintenance_issues SET status = ?, updated_at = NOW() WHERE id = ?")) {
                    updateStmt.setString(1, newStatus);
                    updateStmt.setLong(2, issueId);
                    updateStmt.executeUpdate();
                }

                try (PreparedStatement auditStmt = conn.prepareStatement(
                        "INSERT INTO audit_logs(issue_id, actor_user_id, old_status, new_status, remarks, created_at) " +
                        "VALUES (?, ?, ?, ?, ?, NOW())")) {
                    auditStmt.setLong(1, issueId);
                    auditStmt.setLong(2, actorId);
                    auditStmt.setString(3, oldStatus);
                    auditStmt.setString(4, newStatus);
                    auditStmt.setString(5, remarks.isEmpty() ? null : remarks);
                    auditStmt.executeUpdate();
                }

                conn.commit();

                mapper.writeValue(res.getWriter(), Map.of(
                    "message", "Status updated successfully via Java transaction",
                    "issue_id", issueId,
                    "old_status", oldStatus,
                    "new_status", newStatus,
                    "remarks", remarks
                ));

            } catch (Exception ex) {
                conn.rollback();
                throw ex;
            } finally {
                conn.setAutoCommit(true);
            }

        } catch (Exception e) {
            e.printStackTrace();
            res.setStatus(500);
            mapper.writeValue(res.getWriter(), Map.of("error", "Could not update status: " + e.getMessage()));
        }
    }
}
