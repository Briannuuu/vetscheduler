// ── STATE ──
let allUsers = [];
let editingUserId = null;

// ── AUDIT STATE ──
let allAuditLogs = [];
let filteredAuditLogs = [];
let auditPage = 1;
const AUDIT_PAGE_SIZE = 5;
let auditUnsubscribe = null;

// ── AUTH GUARD ──
document.addEventListener('keydown', e => { if (e.key === 'Enter') doLogin(); });

auth.onAuthStateChanged(async user => {
  if (!user) return showOverlay();
  try {
    const doc = await db.collection('users').doc(user.uid).get();
    if (!doc.exists || doc.data().role !== 'superadmin') {
      await auth.signOut();
      return showOverlay('Access denied. Superadmin role required.');
    }
  } catch(e) { /* first time setup – allow through */ }

  document.getElementById('loginOverlay').style.display = 'none';
  document.getElementById('loggedEmail').textContent = user.email;
  loadUsers();
  loadAuditLogs();
  // Log SA login (slight delay so logAuditSA function is available)
  setTimeout(() => logAuditSA('LOGIN', { _portal: 'superadmin', role: 'superadmin' }), 500);
});

function showOverlay(errMsg) {
  document.getElementById('loginOverlay').style.display = 'flex';
  if (errMsg) {
    const el = document.getElementById('loginErr');
    el.textContent = errMsg;
    el.style.display = 'block';
  }
}

async function doLogin() {
  const email = document.getElementById('loginEmail').value.trim();
  const pass  = document.getElementById('loginPass').value;
  const errEl = document.getElementById('loginErr');
  errEl.style.display = 'none';

  if (!email || !pass) {
    errEl.textContent = 'Please enter email and password.';
    return errEl.style.display = 'block';
  }
  try {
    await auth.signInWithEmailAndPassword(email, pass);
  } catch(err) {
    const msgs = {
      'auth/user-not-found': 'No account found.',
      'auth/wrong-password': 'Incorrect password.',
      'auth/invalid-email': 'Invalid email address.'
    };
    errEl.textContent = msgs[err.code] || err.message;
    errEl.style.display = 'block';
  }
}

function doLogout() {
  logAuditSA('LOGOUT', { _portal: 'superadmin' }).finally ? 
    logAuditSA('LOGOUT', { _portal: 'superadmin' }).finally(() => auth.signOut()) :
    auth.signOut();
}

// ── TOAST ──
function showToast(msg, type = 'success') {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.className = `toast ${type} show`;
  setTimeout(() => t.classList.remove('show'), 4000);
}

// ── PASSWORD TOGGLE & STRENGTH ──
function togglePw() {
  const inp = document.getElementById('newPassword');
  inp.type = inp.type === 'password' ? 'text' : 'password';
}

document.addEventListener('DOMContentLoaded', () => {
  const pwInput = document.getElementById('newPassword');
  if (pwInput) {
    pwInput.addEventListener('input', () => {
      const val = pwInput.value;
      const bar = document.getElementById('pwStrength');
      if (!val) { bar.innerHTML = ''; return; }
      let strength = 0;
      if (val.length >= 6)  strength++;
      if (val.length >= 10) strength++;
      if (/[A-Z]/.test(val)) strength++;
      if (/[0-9]/.test(val)) strength++;
      if (/[^A-Za-z0-9]/.test(val)) strength++;
      const labels = ['', 'Weak', 'Fair', 'Good', 'Strong', 'Very Strong'];
      const colors = ['', '#e74c3c', '#e67e22', '#f1c40f', '#2ecc71', '#1a7a4a'];
      bar.innerHTML = `
        <div class="strength-bars">
          ${[1,2,3,4,5].map(i =>
            `<div class="strength-bar ${i <= strength ? 'filled' : ''}" style="${i <= strength ? `background:${colors[strength]}` : ''}"></div>`
          ).join('')}
        </div>
        <span style="font-size:11px;color:${colors[strength]};font-weight:600">${labels[strength]}</span>`;
    });
  }
});

// ── CREATE USER ──
// Uses a secondary Firebase app instance so superadmin stays logged in
async function createUser() {
  const name     = document.getElementById('newName').value.trim();
  const email    = document.getElementById('newEmail').value.trim();
  const password = document.getElementById('newPassword').value;
  const role     = document.getElementById('newRole').value;

  if (!name)     return showToast('Please enter the full name.', 'error');
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
                 return showToast('Please enter a valid email.', 'error');
  if (!password || password.length < 6)
                 return showToast('Password must be at least 6 characters.', 'error');
  if (!role)     return showToast('Please select a role.', 'error');

  const btn = document.getElementById('createBtn');
  btn.disabled = true;
  document.getElementById('createBtnText').textContent = 'Creating…';

  try {
    // ── Secondary app trick ──
    // We initialize a SECOND firebase app instance just for creating the user.
    // This avoids signing out the current superadmin session.
    const secondaryApp = firebase.initializeApp(firebase.app().options, 'secondary_' + Date.now());
    const secondaryAuth = secondaryApp.auth();

    const cred = await secondaryAuth.createUserWithEmailAndPassword(email, password);
    const uid  = cred.user.uid;

    // !! Do NOT call secondaryAuth.signOut() here.
    // It triggers onAuthStateChanged on the main app and signs out the superadmin.
    // Just delete the secondary app instance directly — this is safe.
    await secondaryApp.delete();

    // Save user profile to Firestore
    await db.collection('users').doc(uid).set({
      name,
      email,
      role,
      createdAt: firebase.firestore.FieldValue.serverTimestamp(),
      createdBy: auth.currentUser?.email || 'superadmin'
    });

    showToast(`✅ Account created for ${name} (${email})`);

    // Log to audit trail
    logAuditSA('USER_CREATED', {
      _portal: 'superadmin',
      newUserEmail: email,
      newUserName: name,
      newUserRole: role
    });

    // Clear form
    ['newName', 'newEmail', 'newPassword'].forEach(id => document.getElementById(id).value = '');
    document.getElementById('newRole').value = '';
    document.getElementById('pwStrength').innerHTML = '';

  } catch(err) {
    const msgs = {
      'auth/email-already-in-use': 'This email is already registered.',
      'auth/invalid-email':        'Invalid email address.',
      'auth/weak-password':        'Password is too weak (min 6 characters).'
    };
    if (typeof ErrorLogger !== 'undefined') ErrorLogger.log(err, 'createUser');
    showToast(msgs[err.code] || err.message, 'error');
  }

  btn.disabled = false;
  document.getElementById('createBtnText').textContent = 'Create Account →';
}

// ── LOAD USERS ──
function loadUsers() {
  db.collection('users')
    .orderBy('createdAt', 'desc')
    .onSnapshot(snap => {
      allUsers = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      document.getElementById('userCountText').textContent =
        `${allUsers.length} user${allUsers.length !== 1 ? 's' : ''} registered`;
      renderTable(allUsers);
    }, err => {
      if (typeof ErrorLogger !== 'undefined') ErrorLogger.log(err, 'loadUsers');
      document.getElementById('usersTableBody').innerHTML =
        `<tr><td colspan="5" style="text-align:center;color:#c0392b;padding:24px">${err.message}</td></tr>`;
    });
}

function filterUsers() {
  const q = document.getElementById('searchInput').value.toLowerCase();
  const filtered = allUsers.filter(u =>
    (u.name  || '').toLowerCase().includes(q) ||
    (u.email || '').toLowerCase().includes(q)
  );
  renderTable(filtered);
}

function renderTable(users) {
  const tbody = document.getElementById('usersTableBody');
  if (!users.length) {
    tbody.innerHTML = `<tr><td colspan="5" class="table-empty">No users found.</td></tr>`;
    return;
  }

  const currentUid = auth.currentUser?.uid;

  tbody.innerHTML = users.map((u, i) => {
    const created = u.createdAt?.toDate
      ? u.createdAt.toDate().toLocaleDateString('en-PH', { year:'numeric', month:'short', day:'numeric' })
      : '—';
    const isMe = u.id === currentUid;
    const rolePill = u.role === 'superadmin'
      ? `<span class="role-pill superadmin">👑 Super Admin</span>`
      : u.role === 'doctor'
      ? `<span class="role-pill doctor">🩺 Doctor</span>`
      : `<span class="role-pill admin">🔧 Admin</span>`;

    return `
      <tr style="animation-delay:${i * 0.04}s">
        <td>
          <div class="user-name">${u.name || '—'}</div>
          ${isMe ? '<div class="you-badge">You</div>' : ''}
        </td>
        <td class="user-email">${u.email || '—'}</td>
        <td>${rolePill}</td>
        <td class="user-date">${created}</td>
        <td>
          <div class="action-btns">
            ${!isMe ? `
              <button class="tbl-btn edit" onclick="openEditModal('${u.id}', '${u.name}', '${u.email}', '${u.role}')">✏️ Edit</button>
              <button class="tbl-btn del"  onclick="deleteUser('${u.id}', '${u.name}')">🗑</button>
            ` : '<span style="font-size:12px;color:#bbb">—</span>'}
          </div>
        </td>
      </tr>`;
  }).join('');
}

// ── EDIT ROLE MODAL ──
function openEditModal(uid, name, email, role) {
  editingUserId = uid;
  document.getElementById('editUserInfo').textContent = `${name} — ${email}`;
  document.getElementById('editRoleSelect').value = role;
  document.getElementById('editModalOverlay').classList.add('show');
}

function closeEditModal() {
  document.getElementById('editModalOverlay').classList.remove('show');
  editingUserId = null;
}

async function saveRoleEdit() {
  if (!editingUserId) return;
  const newRole = document.getElementById('editRoleSelect').value;
  try {
    const prevUser = allUsers.find(u => u.id === editingUserId);
    await db.collection('users').doc(editingUserId).update({ role: newRole });
    logAuditSA('ROLE_UPDATED', {
      _portal: 'superadmin',
      targetUserId: editingUserId,
      targetUserEmail: prevUser?.email || '—',
      targetUserName: prevUser?.name || '—',
      previousRole: prevUser?.role || '—',
      newRole
    });
    showToast('✅ Role updated successfully.');
    closeEditModal();
  } catch(err) {
    if (typeof ErrorLogger !== 'undefined') ErrorLogger.log(err, 'saveRoleEdit');
    showToast('Failed to update role: ' + err.message, 'error');
  }
}

// ── DELETE USER (Firestore only) ──
// Note: Deleting from Firebase Auth requires Admin SDK.
// This removes the user's role/access from Firestore so they can't log into admin.
async function deleteUser(uid, name) {
  if (!confirm(`Remove "${name}" from admin access?\n\nNote: Their Firebase Auth account will remain but they will lose admin privileges.`)) return;
  try {
    const prevUser = allUsers.find(u => u.id === uid);
    await db.collection('users').doc(uid).delete();
    logAuditSA('USER_DELETED', {
      _portal: 'superadmin',
      deletedUserId: uid,
      deletedUserName: name,
      deletedUserEmail: prevUser?.email || '—',
      deletedUserRole: prevUser?.role || '—'
    });
    showToast(`✅ "${name}" removed from admin users.`);
  } catch(err) {
    if (typeof ErrorLogger !== 'undefined') ErrorLogger.log(err, 'deleteUser');
    showToast('Failed to remove user: ' + err.message, 'error');
  }
}
// ── TAB SWITCHING ──
function switchTab(tab, btn) {
  document.querySelectorAll('.sa-tab').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  document.getElementById('tabUsers').style.display = tab === 'users' ? '' : 'none';
  document.getElementById('tabAudit').style.display = tab === 'audit' ? '' : 'none';
  if (tab === 'audit') {
    document.getElementById('auditLiveDot').style.display = 'none';
  }
}

// ── SUPERADMIN SELF-AUDIT LOGGER ──
async function logAuditSA(action, details = {}) {
  try {
    const user = auth.currentUser;
    if (!user) return;
    let actorName = window._saActorName || null;
    if (!actorName) {
      try {
        const snap = await db.collection('users').doc(user.uid).get();
        actorName = snap.exists ? (snap.data().name || user.email) : user.email;
        window._saActorName = actorName;
      } catch { actorName = user.email; }
    }
    await db.collection('auditLogs').add({
      action,
      actorUid:   user.uid,
      actorEmail: user.email,
      actorName,
      timestamp:  firebase.firestore.FieldValue.serverTimestamp(),
      details,
      portal: details._portal || 'superadmin'
    });
  } catch (e) {
    console.warn('SA audit log failed:', e.message);
  }
}

// ── LOAD AUDIT LOGS (real-time) ──
function loadAuditLogs() {
  if (auditUnsubscribe) auditUnsubscribe();
  auditUnsubscribe = db.collection('auditLogs')
    .orderBy('timestamp', 'desc')
    .limit(500)
    .onSnapshot(snap => {
      allAuditLogs = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      updateAuditStats();
      applyAuditFilters();

      // Flash live dot if audit tab not active
      const auditTabActive = document.getElementById('tabAudit').style.display !== 'none';
      if (!auditTabActive && allAuditLogs.length > 0) {
        const dot = document.getElementById('auditLiveDot');
        dot.style.display = 'inline-block';
      }
    }, err => {
      if (typeof ErrorLogger !== 'undefined') ErrorLogger.log(err, 'loadAuditLogs');
      document.getElementById('auditTableBody').innerHTML =
        `<tr><td colspan="5" style="text-align:center;color:#c0392b;padding:24px">${err.message}</td></tr>`;
    });
}

function updateAuditStats() {
  const todayStr = new Date().toLocaleDateString('en-CA'); // YYYY-MM-DD
  document.getElementById('aStatTotal').textContent    = allAuditLogs.length;
  document.getElementById('aStatLogins').textContent   = allAuditLogs.filter(l => {
    if (l.action !== 'LOGIN') return false;
    const ts = l.timestamp?.toDate ? l.timestamp.toDate() : new Date(l.timestamp);
    return ts.toLocaleDateString('en-CA') === todayStr;
  }).length;
  document.getElementById('aStatAccepted').textContent = allAuditLogs.filter(l => l.action === 'APPOINTMENT_ACCEPTED').length;
  document.getElementById('aStatRejected').textContent = allAuditLogs.filter(l => l.action === 'APPOINTMENT_REJECTED').length;
  document.getElementById('aStatAvail').textContent    = allAuditLogs.filter(l => l.action === 'AVAILABILITY_SAVED').length;
}

function applyAuditFilters() {
  const portal  = document.getElementById('auditPortalFilter').value;
  const action  = document.getElementById('auditActionFilter').value;
  const search  = (document.getElementById('auditSearchInput').value || '').toLowerCase();

  filteredAuditLogs = allAuditLogs.filter(l => {
    if (portal && l.portal !== portal) return false;
    if (action && l.action !== action) return false;
    if (search) {
      const hay = `${l.actorName||''} ${l.actorEmail||''} ${l.action||''} ${JSON.stringify(l.details||{})}`.toLowerCase();
      if (!hay.includes(search)) return false;
    }
    return true;
  });

  auditPage = 1;
  document.getElementById('auditCountText').textContent =
    `${filteredAuditLogs.length} event${filteredAuditLogs.length !== 1 ? 's' : ''} (${allAuditLogs.length} total)`;
  renderAuditTable();
}

function renderAuditTable() {
  const tbody = document.getElementById('auditTableBody');
  if (!filteredAuditLogs.length) {
    tbody.innerHTML = `<tr><td colspan="5" class="table-empty">No audit events found.</td></tr>`;
    document.getElementById('auditPagination').innerHTML = '';
    return;
  }

  const totalPages = Math.ceil(filteredAuditLogs.length / AUDIT_PAGE_SIZE);
  if (auditPage > totalPages) auditPage = totalPages;
  const start = (auditPage - 1) * AUDIT_PAGE_SIZE;
  const slice = filteredAuditLogs.slice(start, start + AUDIT_PAGE_SIZE);

  tbody.innerHTML = slice.map((l, i) => {
    const ts = l.timestamp?.toDate
      ? l.timestamp.toDate().toLocaleString('en-PH', { year:'numeric', month:'short', day:'numeric', hour:'2-digit', minute:'2-digit', second:'2-digit' })
      : '—';

    const portalPill = l.portal === 'superadmin'
      ? `<span class="audit-pill audit-pill-sa">&#128081; Super Admin</span>`
      : l.portal === 'doctor'
      ? `<span class="audit-pill audit-pill-doctor">&#128138; Doctor</span>`
      : `<span class="audit-pill audit-pill-admin">&#128295; Admin</span>`;

    const actionConfig = {
      'LOGIN':                  { icon: '&#128275;', cls: 'audit-action-login',    label: 'Login' },
      'LOGOUT':                 { icon: '&#128274;', cls: 'audit-action-logout',   label: 'Logout' },
      'APPOINTMENT_ACCEPTED':   { icon: '&#9989;',  cls: 'audit-action-accepted', label: 'Accepted Appointment' },
      'APPOINTMENT_REJECTED':   { icon: '&#10060;', cls: 'audit-action-rejected', label: 'Rejected Appointment' },
      'APPOINTMENT_DELETED':    { icon: '&#128465;', cls: 'audit-action-deleted', label: 'Deleted Appointment' },
      'AVAILABILITY_SAVED':     { icon: '&#128197;', cls: 'audit-action-avail',   label: 'Availability Saved' },
      'USER_CREATED':           { icon: '&#43;&#128100;', cls: 'audit-action-created', label: 'User Created' },
      'USER_DELETED':           { icon: '&#128465;&#128100;', cls: 'audit-action-deleted', label: 'User Deleted' },
      'ROLE_UPDATED':           { icon: '&#9999;',  cls: 'audit-action-role',     label: 'Role Updated' },
    };
    const ac = actionConfig[l.action] || { icon: '&#8226;', cls: '', label: l.action };

    const details = buildDetailsHtml(l.action, l.details || {});

    return `
      <tr style="animation-delay:${i * 0.03}s">
        <td class="audit-ts">${ts}</td>
        <td>
          <div class="audit-actor-name">${l.actorName || '—'}</div>
          <div class="audit-actor-email">${l.actorEmail || '—'}</div>
        </td>
        <td>${portalPill}</td>
        <td><span class="audit-action-tag ${ac.cls}">${ac.icon} ${ac.label}</span></td>
        <td class="audit-details-cell">${details}</td>
      </tr>`;
  }).join('');

  // Pagination
  const pg = document.getElementById('auditPagination');
  if (totalPages <= 1) { pg.innerHTML = ''; return; }

  const info = `Showing ${start + 1}–${Math.min(start + AUDIT_PAGE_SIZE, filteredAuditLogs.length)} of ${filteredAuditLogs.length}`;

  // Build windowed page buttons: always show first, last, current ±1, with ellipsis gaps
  const pageNums = [];
  for (let p = 1; p <= totalPages; p++) {
    if (p === 1 || p === totalPages || (p >= auditPage - 1 && p <= auditPage + 1)) {
      pageNums.push(p);
    }
  }
  // Insert ellipsis markers
  const pageItems = [];
  let prev = 0;
  for (const p of pageNums) {
    if (p - prev > 1) pageItems.push('...');
    pageItems.push(p);
    prev = p;
  }

  pg.innerHTML = `
    <span class="page-info">${info}</span>
    <div class="page-btns">
      <button class="page-btn${auditPage === 1 ? ' disabled' : ''}"
              onclick="auditGoPage(${auditPage - 1})"
              ${auditPage === 1 ? 'disabled' : ''}>&#8249;</button>
      ${pageItems.map(p =>
        p === '...'
          ? `<span class="page-ellipsis">&#8230;</span>`
          : `<button class="page-btn${auditPage === p ? ' active' : ''}" onclick="auditGoPage(${p})">${p}</button>`
      ).join('')}
      <button class="page-btn${auditPage === totalPages ? ' disabled' : ''}"
              onclick="auditGoPage(${auditPage + 1})"
              ${auditPage === totalPages ? 'disabled' : ''}>&#8250;</button>
    </div>`;
}

function auditGoPage(p) {
  auditPage = p;
  renderAuditTable();
  document.getElementById('tabAudit').scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function buildDetailsHtml(action, d) {
  const parts = [];
  if (action === 'LOGIN' || action === 'LOGOUT') {
    if (d.role) parts.push(`Role: <strong>${d.role}</strong>`);
    if (d.doctorName) parts.push(`Name: <strong>${d.doctorName}</strong>`);
  }
  if (action === 'APPOINTMENT_ACCEPTED') {
    if (d.ownerName) parts.push(`Owner: <strong>${d.ownerName}</strong>`);
    if (d.petName)   parts.push(`Pet: <strong>${d.petName}</strong>`);
    if (d.assignedDoctorName) parts.push(`Doctor: <strong>${d.assignedDoctorName}</strong>`);
  }
  if (action === 'APPOINTMENT_REJECTED') {
    if (d.ownerName)   parts.push(`Owner: <strong>${d.ownerName}</strong>`);
    if (d.petName)     parts.push(`Pet: <strong>${d.petName}</strong>`);
    if (d.rejectReason) parts.push(`Reason: <strong>${d.rejectReason}</strong>`);
  }
  if (action === 'APPOINTMENT_DELETED') {
    if (d.ownerName)      parts.push(`Owner: <strong>${d.ownerName}</strong>`);
    if (d.petName)        parts.push(`Pet: <strong>${d.petName}</strong>`);
    if (d.previousStatus) parts.push(`Was: <strong>${d.previousStatus}</strong>`);
  }
  if (action === 'AVAILABILITY_SAVED') {
    if (d.month)      parts.push(`Month: <strong>${d.month}</strong>`);
    if (d.daysSet !== undefined)   parts.push(`Days: <strong>${d.daysSet}</strong>`);
    if (d.totalSlots !== undefined) parts.push(`Slots: <strong>${d.totalSlots}</strong>`);
  }
  if (action === 'USER_CREATED') {
    if (d.newUserName)  parts.push(`Name: <strong>${d.newUserName}</strong>`);
    if (d.newUserEmail) parts.push(`Email: <strong>${d.newUserEmail}</strong>`);
    if (d.newUserRole)  parts.push(`Role: <strong>${d.newUserRole}</strong>`);
  }
  if (action === 'USER_DELETED') {
    if (d.deletedUserName)  parts.push(`Name: <strong>${d.deletedUserName}</strong>`);
    if (d.deletedUserEmail) parts.push(`Email: <strong>${d.deletedUserEmail}</strong>`);
    if (d.deletedUserRole)  parts.push(`Role: <strong>${d.deletedUserRole}</strong>`);
  }
  if (action === 'ROLE_UPDATED') {
    if (d.targetUserName)  parts.push(`User: <strong>${d.targetUserName}</strong>`);
    if (d.previousRole)    parts.push(`From: <strong>${d.previousRole}</strong>`);
    if (d.newRole)         parts.push(`To: <strong>${d.newRole}</strong>`);
  }
  return parts.length
    ? `<div class="audit-detail-pills">${parts.map(p=>`<span class="audit-detail-pill">${p}</span>`).join('')}</div>`
    : '<span style="color:#bbb;font-size:12px">—</span>';
}

// ── EXPORT CSV ──
function exportAuditCSV() {
  const rows = [['Timestamp','Actor Name','Actor Email','Portal','Action','Details']];
  filteredAuditLogs.forEach(l => {
    const ts = l.timestamp?.toDate
      ? l.timestamp.toDate().toLocaleString('en-PH')
      : '—';
    const details = JSON.stringify(l.details || {}).replace(/"/g, '""');
    rows.push([ts, l.actorName||'', l.actorEmail||'', l.portal||'', l.action||'', `"${details}"`]);
  });
  const csv = rows.map(r => r.join(',')).join('\n');
  const blob = new Blob([csv], { type: 'text/csv' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href = url;
  a.download = `vetcare-audit-${new Date().toLocaleDateString('en-CA')}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}