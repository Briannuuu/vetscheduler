// ── STATE ──
let allUsers = [];
let editingUserId = null;

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

function doLogout() { auth.signOut(); }

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
    await db.collection('users').doc(editingUserId).update({ role: newRole });
    showToast('✅ Role updated successfully.');
    closeEditModal();
  } catch(err) {
    showToast('Failed to update role: ' + err.message, 'error');
  }
}

// ── DELETE USER (Firestore only) ──
// Note: Deleting from Firebase Auth requires Admin SDK.
// This removes the user's role/access from Firestore so they can't log into admin.
async function deleteUser(uid, name) {
  if (!confirm(`Remove "${name}" from admin access?\n\nNote: Their Firebase Auth account will remain but they will lose admin privileges.`)) return;
  try {
    await db.collection('users').doc(uid).delete();
    showToast(`✅ "${name}" removed from admin users.`);
  } catch(err) {
    showToast('Failed to remove user: ' + err.message, 'error');
  }
}