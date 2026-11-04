# HostelCare – Hostel Maintenance Portal

A complete Web Technology mini-project. Students submit hostel maintenance requests (electrical, plumbing, cleaning, furniture, etc.); hostel administrators review them, update request statuses, and record remarks. 

- **PHP Service (Port 8000)**: Handles user accounts, JWT authentication, issue reporting, filtering, and local file attachment handling.
- **Java Servlet Service (Port 8080)**: Handles admin status transitions within an atomic JDBC transaction and records audit logs into PostgreSQL.
- **Database (PostgreSQL 5432)**: Shared database (`hostel_portal`) storing users, issues, and audit logs.
- **Frontend (Port 5500)**: Modern responsive SPA using HTML5, Bootstrap 5, Bootstrap Icons, Vanilla JavaScript, and Chart.js.

---

## 1. System Architecture

```
[ Frontend: HTML5 / Bootstrap 5 / Chart.js (Port 5500) ]
        |                                   |
        v                                   v
[ PHP 8+ REST API (Port 8000) ]     [ Java 17+ Tomcat Servlet (Port 8080) ]
   - Auth (Login / Register / JWT)     - Admin Status Update (JDBC Tx)
   - Issue Submission & Attachments    - Audit Trail Retrieval
   - Issue Queries & Filtering         - Preflight CORS Support
        |                                   |
        +-----------------+-----------------+
                          |
                          v
               [ PostgreSQL 14+ (Port 5432) ]
                  Database: hostel_portal
                  Tables: users, maintenance_issues, audit_logs
```

---

## 2. Issues Fixed & Enhancements Completed

1. **PHP PostgreSQL Driver Configuration**:
   - Resolved `could not find driver` error by activating `php_pdo_pgsql.dll` and `php_pgsql.dll` in `php.ini`.
   - Configured absolute `extension_dir` path to avoid working-directory resolution issues.

2. **Java Servlet Preflight & CORS Support**:
   - Fixed missing `doOptions` and CORS headers (`Access-Control-Allow-Origin`, `Access-Control-Allow-Headers`, `Access-Control-Allow-Methods`) in `AuditServlet.java`.
   - Both Java endpoints (`/status` and `/audit`) now fully support browser cross-origin requests.

3. **Audit History & Remarks Tracking**:
   - Admin status updates now accept and store **remarks** (e.g. technician assigned, parts replaced).
   - Java and PHP both record who performed each status transition, the old status, the new status, and the exact timestamp.

4. **Frontend Details & Interactive Timeline**:
   - Added a **"Details & History"** modal displaying full descriptions and an interactive vertical audit timeline for each request.
   - Added admin status update dialog with custom remarks.
   - Built dual-engine routing: calls Java Servlet first for status updates, with seamless PHP fallback if Tomcat is offline.

5. **Search & Filters**:
   - Real-time text search by title, location, or student name.
   - Status filters (`SUBMITTED`, `IN_PROGRESS`, `RESOLVED`, `REJECTED`).
   - Category filters (Electrical, Plumbing, Cleaning, Furniture, Internet, Other).

6. **Role Synchronization**:
   - Added `Sync Role` feature (`GET /auth.php?action=me`) allowing users promoted to `ADMIN` in PostgreSQL to immediately update their token and dashboard without re-logging in.

7. **One-Click Launchers**:
   - Added `run_all.bat`, `start_php.bat`, `start_tomcat.bat`, `start_frontend.bat`, and `test_db.php`.

---

## 3. Quick Start (Windows)

### Option A: One-Click Start (Recommended)
Double-click `run_all.bat` in the project folder. It will:
1. Start the PHP API on `http://localhost:8000`
2. Start the Java Tomcat Service on `http://localhost:8080`
3. Start the Frontend server on `http://localhost:5500`
4. Automatically open your browser to `http://localhost:5500`

### Option B: Manual Start

1. **Verify Database**:
   ```bash
   php test_db.php
   ```

2. **Start PHP API**:
   ```bash
   start_php.bat
   ```
   *Runs at:* `http://localhost:8000`

3. **Start Java Tomcat Service**:
   ```bash
   start_tomcat.bat
   ```
   *Runs at:* `http://localhost:8080/hostel-java`

4. **Start Frontend**:
   ```bash
   start_frontend.bat
   ```
   *Runs at:* `http://localhost:5500`

---

## 4. Default Database & Demo Accounts

- **PostgreSQL Host:** `127.0.0.1:5432`
- **Database Name:** `hostel_portal`
- **Database User:** `postgres`
- **Database Password:** `postgres123`

### Demo Accounts:
| Role | Email | Password |
|---|---|---|
| **Admin** | `student_demo@gmail.com` | `student123` |
| **Student** | `sharukhan.f.k.2007@gmail.com` | *(Registered user)* |

To promote any registered student to Admin, run this in PostgreSQL:
```sql
UPDATE users SET role = 'ADMIN' WHERE email = 'your-email@example.com';
```
Then click **Sync Role** in the top navigation bar!

---

## 5. API Reference

| Service | Method | Endpoint | Description |
|---|---|---|---|
| PHP | POST | `/auth.php?action=register` | Register a new student account |
| PHP | POST | `/auth.php?action=login` | Sign in and receive JWT token |
| PHP | GET | `/auth.php?action=me` | Get profile & refresh role/token |
| PHP | POST | `/issues.php` | Submit a maintenance issue |
| PHP | GET | `/issues.php` | List issues (students see own; admins see all) |
| PHP | GET | `/issues.php?id=1` | Get single issue with full audit logs |
| PHP | DELETE | `/issues.php?id=1` | Cancel/delete an issue (if still submitted) |
| Java | POST | `/hostel-java/api/maintenance/status` | Update status + remarks in JDBC transaction |
| Java | GET | `/hostel-java/api/maintenance/audit?issue_id=1` | Retrieve complete audit trail for an issue |
| PHP | POST | `/admin.php` | Fallback status update transaction |
| PHP | GET | `/admin.php?action=audit&issue_id=1` | Fallback audit trail retrieval |
