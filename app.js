const PHP = 'http://localhost:8000';
const JAVA = 'http://localhost:8080/hostel-java/api/maintenance';

let token = localStorage.getItem('hc_token') || '';
let user = JSON.parse(localStorage.getItem('hc_user') || 'null');
let registerMode = false;
let chart = null;
let allIssues = [];

const $ = id => document.getElementById(id);

// Modals
let detailsModal = null;
let updateStatusModal = null;

document.addEventListener('DOMContentLoaded', () => {
  if (typeof bootstrap !== 'undefined') {
    detailsModal = new bootstrap.Modal($('detailsModal'));
    updateStatusModal = new bootstrap.Modal($('updateStatusModal'));
  }

  checkBackendHealth();
  if (token && user) {
    openApp();
    syncUserProfile(false);
  } else {
    $('authPanel').classList.remove('d-none');
    $('appPanel').classList.add('d-none');
  }
});

// -------------------------------------------------------------
// Helper: Show status messages in UI
// -------------------------------------------------------------
function showMessage(id, msg, ok = false) {
  const el = $(id);
  if (!el) return;
  el.textContent = msg;
  el.className = 'small mt-2 ' + (ok ? 'text-success fw-semibold' : 'text-danger fw-semibold');
}

// -------------------------------------------------------------
// Network Request Helper
// -------------------------------------------------------------
async function request(url, options = {}) {
  const headers = { ...(options.headers || {}) };
  if (token) {
    headers['Authorization'] = 'Bearer ' + token;
  }

  // If not FormData, default to application/json if body is string
  if (options.body && !(options.body instanceof FormData) && !headers['Content-Type']) {
    headers['Content-Type'] = 'application/json';
  }

  const res = await fetch(url, { ...options, headers });
  let data = null;
  try {
    data = await res.json();
  } catch (e) {
    data = { error: 'Invalid response from server' };
  }

  if (!res.ok) {
    throw new Error(data.error || `HTTP error ${res.status}`);
  }
  return data;
}

// -------------------------------------------------------------
// Backend Health Indicators
// -------------------------------------------------------------
async function checkBackendHealth() {
  // Check PHP
  try {
    await fetch(`${PHP}/auth.php?action=login`, { method: 'OPTIONS' });
    $('phpStatusBadge').className = 'backend-badge backend-online';
    $('phpStatusBadge').innerHTML = '<i class="bi bi-circle-fill text-success" style="font-size: 0.6rem;"></i> PHP: Online';
  } catch (e) {
    $('phpStatusBadge').className = 'backend-badge backend-offline';
    $('phpStatusBadge').innerHTML = '<i class="bi bi-circle-fill text-danger" style="font-size: 0.6rem;"></i> PHP: Offline';
  }

  // Check Java
  try {
    await fetch(`${JAVA}/status`, { method: 'OPTIONS' });
    $('javaStatusBadge').className = 'backend-badge backend-online';
    $('javaStatusBadge').innerHTML = '<i class="bi bi-circle-fill text-success" style="font-size: 0.6rem;"></i> Java: Online';
  } catch (e) {
    $('javaStatusBadge').className = 'backend-badge backend-offline';
    $('javaStatusBadge').innerHTML = '<i class="bi bi-circle-fill text-danger" style="font-size: 0.6rem;"></i> Java: Offline (Fallback)';
  }
}

// -------------------------------------------------------------
// Auth Form Mode Toggle (Login vs Register)
// -------------------------------------------------------------
function setMode(isRegister) {
  registerMode = isRegister;
  $('nameWrap').classList.toggle('d-none', !isRegister);
  $('pwdHelp').style.display = isRegister ? 'block' : 'none';
  $('authSubmit').querySelector('span:last-child').textContent = isRegister ? 'Create Student Account' : 'Sign In';
  $('showLogin').classList.toggle('active', !isRegister);
  $('showRegister').classList.toggle('active', isRegister);
  $('authMessage').textContent = '';
}

$('showLogin').onclick = () => setMode(false);
$('showRegister').onclick = () => setMode(true);

// -------------------------------------------------------------
// Auth Submission
// -------------------------------------------------------------
$('authForm').onsubmit = async e => {
  e.preventDefault();
  $('authSpinner').classList.remove('d-none');
  $('authSubmit').disabled = true;
  showMessage('authMessage', '');

  try {
    const payload = {
      email: $('email').value.trim(),
      password: $('password').value
    };
    if (registerMode) {
      payload.full_name = $('fullName').value.trim();
    }

    const d = await request(`${PHP}/auth.php?action=${registerMode ? 'register' : 'login'}`, {
      method: 'POST',
      body: JSON.stringify(payload)
    });

    token = d.token;
    user = d.user;
    localStorage.setItem('hc_token', token);
    localStorage.setItem('hc_user', JSON.stringify(user));

    openApp();
  } catch (err) {
    showMessage('authMessage', err.message);
  } finally {
    $('authSpinner').classList.add('d-none');
    $('authSubmit').disabled = false;
  }
};

// -------------------------------------------------------------
// Open App View
// -------------------------------------------------------------
function openApp() {
  $('authPanel').classList.add('d-none');
  $('appPanel').classList.remove('d-none');

  $('welcomeGreeting').textContent = `Welcome, ${user.full_name || 'User'}`;
  $('userEmailText').textContent = user.email || '';
  $('userRoleBadge').textContent = user.role || 'STUDENT';
  $('userRoleBadge').className = user.role === 'ADMIN' ? 'badge bg-danger' : 'badge bg-primary';

  loadIssues();
}

// -------------------------------------------------------------
// Sync User Profile (Useful when student is promoted to ADMIN)
// -------------------------------------------------------------
async function syncUserProfile(showAlert = true) {
  if (!token) return;
  try {
    const d = await request(`${PHP}/auth.php?action=me`);
    if (d.user) {
      const oldRole = user ? user.role : '';
      user = d.user;
      if (d.token) token = d.token;
      localStorage.setItem('hc_token', token);
      localStorage.setItem('hc_user', JSON.stringify(user));

      $('userRoleBadge').textContent = user.role;
      $('userRoleBadge').className = user.role === 'ADMIN' ? 'badge bg-danger' : 'badge bg-primary';

      if (showAlert) {
        if (oldRole !== user.role) {
          alert(`Role synchronized: You are now an ${user.role}!`);
        } else {
          alert(`Profile verified. Current role: ${user.role}`);
        }
        loadIssues();
      }
    }
  } catch (e) {
    console.warn('Could not sync user profile:', e);
  }
}
$('syncRoleBtn').onclick = () => syncUserProfile(true);

// -------------------------------------------------------------
// Logout
// -------------------------------------------------------------
$('logoutBtn').onclick = () => {
  localStorage.removeItem('hc_token');
  localStorage.removeItem('hc_user');
  token = '';
  user = null;
  $('appPanel').classList.add('d-none');
  $('authPanel').classList.remove('d-none');
  setMode(false);
};

// -------------------------------------------------------------
// Submit Maintenance Request (with optional Attachment)
// -------------------------------------------------------------
$('issueForm').onsubmit = async e => {
  e.preventDefault();
  $('issueSpinner').classList.remove('d-none');
  $('submitIssueBtn').disabled = true;
  showMessage('issueMessage', '');

  try {
    const fileInput = $('attachment');
    let body;

    if (fileInput.files.length > 0) {
      body = new FormData();
      body.append('title', $('title').value.trim());
      body.append('category', $('category').value);
      body.append('priority', $('priority').value);
      body.append('location', $('location').value.trim());
      body.append('description', $('description').value.trim());
      body.append('attachment', fileInput.files[0]);
    } else {
      body = JSON.stringify({
        title: $('title').value.trim(),
        category: $('category').value,
        priority: $('priority').value,
        location: $('location').value.trim(),
        description: $('description').value.trim()
      });
    }

    await request(`${PHP}/issues.php`, {
      method: 'POST',
      body: body
    });

    $('issueForm').reset();
    showMessage('issueMessage', 'Maintenance request submitted successfully!', true);
    loadIssues();
  } catch (err) {
    showMessage('issueMessage', err.message);
  } finally {
    $('issueSpinner').classList.add('d-none');
    $('submitIssueBtn').disabled = false;
  }
};

$('refreshBtn').onclick = loadIssues;

// -------------------------------------------------------------
// Load Issues & Render UI
// -------------------------------------------------------------
async function loadIssues() {
  try {
    const d = await request(`${PHP}/issues.php`);
    allIssues = d.issues || [];
    applyFilters();
  } catch (err) {
    $('issueRows').innerHTML = `<tr><td colspan="6" class="text-danger text-center py-4">Error loading requests: ${escapeHtml(err.message)}</td></tr>`;
  }
}

// -------------------------------------------------------------
// Filters & Search
// -------------------------------------------------------------
$('searchInput').oninput = applyFilters;
$('statusFilter').onchange = applyFilters;
$('categoryFilter').onchange = applyFilters;

function applyFilters() {
  const search = $('searchInput').value.toLowerCase().trim();
  const statusFilter = $('statusFilter').value;
  const categoryFilter = $('categoryFilter').value;

  const filtered = allIssues.filter(item => {
    if (statusFilter && item.status !== statusFilter) return false;
    if (categoryFilter && item.category !== categoryFilter) return false;
    if (search) {
      const matchTitle = (item.title || '').toLowerCase().includes(search);
      const matchLocation = (item.location || '').toLowerCase().includes(search);
      const matchStudent = (item.student_name || '').toLowerCase().includes(search);
      const matchDesc = (item.description || '').toLowerCase().includes(search);
      if (!matchTitle && !matchLocation && !matchStudent && !matchDesc) return false;
    }
    return true;
  });

  renderStats(allIssues);
  renderChart(allIssues);
  renderTable(filtered);
}

// -------------------------------------------------------------
// Render Stat Counters
// -------------------------------------------------------------
function renderStats(rows) {
  $('totalCount').textContent = rows.length;
  $('submittedCount').textContent = rows.filter(x => x.status === 'SUBMITTED').length;
  $('progressCount').textContent = rows.filter(x => x.status === 'IN_PROGRESS').length;
  $('resolvedCount').textContent = rows.filter(x => x.status === 'RESOLVED').length;
  $('chartTotalLabel').textContent = `${rows.length} requests total`;
}

// -------------------------------------------------------------
// Render Doughnut Chart
// -------------------------------------------------------------
function renderChart(rows) {
  const statuses = ['SUBMITTED', 'IN_PROGRESS', 'RESOLVED', 'REJECTED'];
  const labels = ['Submitted', 'In Progress', 'Resolved', 'Rejected'];
  const counts = statuses.map(s => rows.filter(x => x.status === s).length);

  if (chart) chart.destroy();

  const ctx = $('statusChart').getContext('2d');
  chart = new Chart(ctx, {
    type: 'doughnut',
    data: {
      labels: labels,
      datasets: [{
        data: counts,
        backgroundColor: ['#f59e0b', '#2563eb', '#10b981', '#ef4444'],
        borderWidth: 2,
        borderColor: '#ffffff'
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          position: 'right',
          labels: { boxWidth: 12, font: { size: 11 } }
        }
      },
      cutout: '65%'
    }
  });
}

// -------------------------------------------------------------
// Render Table Rows
// -------------------------------------------------------------
function renderTable(rows) {
  if (!rows.length) {
    $('issueRows').innerHTML = `
      <tr>
        <td colspan="6" class="text-center text-secondary py-4">
          <i class="bi bi-inbox fs-3 d-block mb-1 text-muted"></i>
          No maintenance requests match your filters.
        </td>
      </tr>
    `;
    return;
  }

  $('issueRows').innerHTML = rows.map(x => {
    const isOwner = user && user.id === parseInt(x.user_id, 10);
    const isAdmin = user && user.role === 'ADMIN';

    return `
      <tr>
        <td>
          <div class="fw-bold text-dark">${escapeHtml(x.title)}</div>
          <div class="text-secondary small mt-0.5">
            <span class="badge bg-light text-dark border me-1">${getCategoryIcon(x.category)} ${escapeHtml(x.category)}</span>
            ${isAdmin && x.student_name ? `<span class="text-muted">• Reported by: <strong>${escapeHtml(x.student_name)}</strong></span>` : ''}
            ${x.attachment_path ? `<span class="badge bg-info-subtle text-info-emphasis ms-1"><i class="bi bi-paperclip"></i> Attachment</span>` : ''}
          </div>
        </td>
        <td class="small">
          <i class="bi bi-geo-alt text-secondary"></i> ${escapeHtml(x.location)}
        </td>
        <td>
          <span class="badge-priority priority-${x.priority}">${x.priority}</span>
        </td>
        <td>
          <span class="badge-status status-${x.status}">${formatStatus(x.status)}</span>
        </td>
        <td class="small text-secondary">
          ${new Date(x.created_at).toLocaleDateString()}
        </td>
        <td class="text-end">
          <div class="btn-group btn-group-sm">
            <button class="btn btn-outline-primary" title="View details and audit timeline" onclick="openDetailsModal(${x.id})">
              <i class="bi bi-eye"></i> Details
            </button>
            ${isAdmin ? `
              <button class="btn btn-primary" title="Update issue status" onclick="openAdminUpdateModal(${x.id}, '${x.status}', '${escapeHtml(x.title)}')">
                <i class="bi bi-pencil"></i> Update
              </button>
            ` : ''}
            ${!isAdmin && isOwner && x.status === 'SUBMITTED' ? `
              <button class="btn btn-outline-danger" title="Cancel this request" onclick="cancelIssue(${x.id})">
                <i class="bi bi-trash"></i>
              </button>
            ` : ''}
          </div>
        </td>
      </tr>
    `;
  }).join('');
}

function getCategoryIcon(cat) {
  const map = {
    'Electrical': '⚡',
    'Plumbing': '🚰',
    'Cleaning': '🧹',
    'Furniture': '🪑',
    'Internet': '📶',
    'Other': '📦'
  };
  return map[cat] || '🔧';
}

function formatStatus(status) {
  const map = {
    'SUBMITTED': 'Submitted',
    'IN_PROGRESS': 'In Progress',
    'RESOLVED': 'Resolved',
    'REJECTED': 'Rejected'
  };
  return map[status] || status;
}

function escapeHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, c => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  }[c]));
}

// -------------------------------------------------------------
// Issue Details & Audit Trail Modal
// -------------------------------------------------------------
window.openDetailsModal = async function(id) {
  if (!detailsModal) return;

  $('modalIssueTitle').textContent = 'Loading issue...';
  $('modalIssueMeta').textContent = '';
  $('modalDescription').textContent = '';
  $('modalStatusBadge').innerHTML = '';
  $('modalPriorityBadge').innerHTML = '';
  $('modalLocation').textContent = '';
  $('modalStudent').textContent = '';
  $('modalAttachmentWrap').classList.add('d-none');
  $('modalAuditTimeline').innerHTML = '<div class="text-secondary small">Loading history...</div>';

  detailsModal.show();

  try {
    // Fetch single issue details from PHP
    const d = await request(`${PHP}/issues.php?id=${id}`);
    const issue = d.issue;
    if (!issue) throw new Error('Issue details not found');

    $('modalIssueTitle').textContent = issue.title;
    $('modalIssueMeta').textContent = `Issue #${issue.id} • ${issue.category} • Created ${new Date(issue.created_at).toLocaleString()}`;
    $('modalDescription').textContent = issue.description;

    $('modalStatusBadge').innerHTML = `<span class="badge-status status-${issue.status}">${formatStatus(issue.status)}</span>`;
    $('modalPriorityBadge').innerHTML = `<span class="badge-priority priority-${issue.priority}">${issue.priority}</span>`;
    $('modalLocation').textContent = issue.location;
    $('modalStudent').textContent = issue.student_name ? `${issue.student_name} (${issue.student_email || ''})` : 'Student';

    // Handle Attachment
    if (issue.attachment_path) {
      $('modalAttachmentWrap').classList.remove('d-none');
      const filename = issue.attachment_path.split('/').pop();
      const fileUrl = `${PHP}/uploads.php?file=${encodeURIComponent(filename)}`;
      const isImg = /\.(jpg|jpeg|png|gif|webp)$/i.test(issue.attachment_path);

      if (isImg) {
        $('modalAttachmentContent').innerHTML = `
          <div class="mt-1">
            <a href="${fileUrl}" target="_blank">
              <img src="${fileUrl}" class="img-thumbnail" style="max-height: 200px;" alt="Attachment">
            </a>
            <div class="small mt-1"><a href="${fileUrl}" target="_blank">Open full image <i class="bi bi-box-arrow-up-right"></i></a></div>
          </div>
        `;
      } else {
        $('modalAttachmentContent').innerHTML = `
          <div class="mt-1">
            <a href="${fileUrl}" target="_blank" class="btn btn-sm btn-outline-secondary">
              <i class="bi bi-file-earmark-pdf me-1"></i> View Document (${filename})
            </a>
          </div>
        `;
      }
    } else {
      $('modalAttachmentWrap').classList.add('d-none');
    }

    // Load Audit Logs (Try Java Service AuditServlet first, fallback to PHP logs)
    let logs = [];
    try {
      const javaRes = await request(`${JAVA}/audit?issue_id=${id}`);
      if (javaRes && javaRes.audit_logs) {
        logs = javaRes.audit_logs;
      }
    } catch (javaErr) {
      // Fallback to logs returned by PHP
      logs = issue.audit_logs || [];
    }

    $('auditCountBadge').textContent = `${logs.length} entries`;
    renderAuditTimeline(logs);

  } catch (err) {
    $('modalIssueTitle').textContent = 'Error loading details';
    $('modalDescription').textContent = err.message;
  }
};

function renderAuditTimeline(logs) {
  if (!logs || !logs.length) {
    $('modalAuditTimeline').innerHTML = '<div class="text-muted small">No audit history recorded yet.</div>';
    return;
  }

  $('modalAuditTimeline').innerHTML = logs.map(l => {
    const isInitial = !l.old_status;
    const dateStr = l.created_at ? new Date(l.created_at).toLocaleString() : 'Recent';

    return `
      <div class="timeline-item">
        <div class="timeline-dot status-${l.new_status}"></div>
        <div class="timeline-content">
          <div class="d-flex justify-content-between align-items-center mb-1">
            <div>
              <strong>${isInitial ? 'Submission' : `${formatStatus(l.old_status)} ➔ ${formatStatus(l.new_status)}`}</strong>
              <span class="badge-status status-${l.new_status} ms-2 py-0 px-2" style="font-size: 0.7rem;">${formatStatus(l.new_status)}</span>
            </div>
            <span class="text-secondary small">${dateStr}</span>
          </div>
          <div class="small text-muted mb-1">
            <i class="bi bi-person"></i> Actor: <strong>${escapeHtml(l.actor_name || l.actor || 'System')}</strong>
            ${l.actor_role ? `(${l.actor_role})` : ''}
          </div>
          ${l.remarks ? `
            <div class="small p-2 bg-white rounded border mt-2">
              <i class="bi bi-chat-left-quote text-secondary me-1"></i>
              <em>${escapeHtml(l.remarks)}</em>
            </div>
          ` : ''}
        </div>
      </div>
    `;
  }).join('');
}

// -------------------------------------------------------------
// Admin Update Status Modal
// -------------------------------------------------------------
window.openAdminUpdateModal = function(id, currentStatus, title) {
  if (!updateStatusModal) return;

  $('adminIssueId').value = id;
  $('adminModalSub').textContent = `Issue #${id}: "${title}"`;
  $('adminNewStatus').value = currentStatus === 'SUBMITTED' ? 'IN_PROGRESS' : currentStatus;
  $('adminRemarks').value = '';
  $('adminUpdateMessage').textContent = '';

  updateStatusModal.show();
};

$('adminUpdateForm').onsubmit = async e => {
  e.preventDefault();
  $('saveStatusSpinner').classList.remove('d-none');
  $('saveStatusBtn').disabled = true;
  showMessage('adminUpdateMessage', '');

  const issueId = parseInt($('adminIssueId').value, 10);
  const status = $('adminNewStatus').value;
  const remarks = $('adminRemarks').value.trim();

  let usedBackend = 'Java Servlet';
  let success = false;

  try {
    // 1. Try Java Servlet First (Full JDBC Transaction + Audit Log)
    try {
      await request(`${JAVA}/status`, {
        method: 'POST',
        body: JSON.stringify({
          issue_id: issueId,
          status: status,
          remarks: remarks
        })
      });
      usedBackend = 'Java Servlet (Tomcat JDBC Transaction)';
      success = true;
    } catch (javaError) {
      console.warn('Java service unreachable, falling back to PHP:', javaError);

      // 2. Fallback to PHP API
      await request(`${PHP}/admin.php`, {
        method: 'POST',
        body: JSON.stringify({
          issue_id: issueId,
          status: status,
          remarks: remarks
        })
      });
      usedBackend = 'PHP API Fallback Transaction';
      success = true;
    }

    if (success) {
      showMessage('adminUpdateMessage', `Status updated successfully via ${usedBackend}!`, true);
      setTimeout(() => {
        updateStatusModal.hide();
        loadIssues();
      }, 700);
    }
  } catch (err) {
    showMessage('adminUpdateMessage', 'Failed to update status: ' + err.message);
  } finally {
    $('saveStatusSpinner').classList.add('d-none');
    $('saveStatusBtn').disabled = false;
  }
};

// -------------------------------------------------------------
// Cancel Request (Student)
// -------------------------------------------------------------
window.cancelIssue = async function(id) {
  if (!confirm('Are you sure you want to cancel this maintenance request?')) {
    return;
  }

  try {
    await request(`${PHP}/issues.php?id=${id}`, {
      method: 'DELETE'
    });
    alert('Request canceled successfully.');
    loadIssues();
  } catch (err) {
    alert('Error canceling request: ' + err.message);
  }
};
