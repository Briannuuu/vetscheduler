let allAppts = [];
let currentFilter = 'all';
let currentPage = 1;
const PAGE_SIZE = 5;
const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

// ── AUTH ──
document.addEventListener('keydown', e => { if (e.key === 'Enter') doLogin(); });

auth.onAuthStateChanged(async user => {
  if (!user) return showLoginOverlay();
  try {
    const doc = await db.collection('users').doc(user.uid).get();
    if (!doc.exists) {
      await auth.signOut();
      return showLoginOverlay('⚠️ Account not found. Contact your administrator.');
    }
    const role = doc.data().role;
    // Only admin and superadmin are allowed here — everyone else is denied
    if (role === 'doctor') {
      await auth.signOut();
      return showLoginOverlay('🩺 Doctor accounts must use the Doctor Portal.');
    }
    if (role !== 'admin' && role !== 'superadmin') {
      await auth.signOut();
      return showLoginOverlay('🚫 Access denied. Admin accounts only.');
    }
    // Authorised — hide login and load dashboard
    document.getElementById('loginOverlay').style.display = 'none';
    document.getElementById('loggedEmail').textContent = user.email;
    startListening();
  } catch(e) {
    await auth.signOut();
    showLoginOverlay('⚠️ Error verifying account. Please try again.');
  }
});

function showLoginOverlay(errMsg) {
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
      'auth/invalid-email':  'Invalid email format.',
      'auth/invalid-credential': 'Incorrect email or password.',
      'auth/too-many-requests': 'Too many attempts. Please wait and try again.'
    };
    errEl.textContent = msgs[err.code] || err.message;
    errEl.style.display = 'block';
  }
}

function doLogout() { auth.signOut(); }

async function goToSuperAdmin() {
  await auth.signOut();
  window.location.href = 'superadmin.html';
}

// ── DATA ──
function startListening() {
db.collection('appointments')
    .orderBy('createdAt', 'desc')
    .onSnapshot(snap => {
    allAppts = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    updateStats();
    renderCards(filterAppts());
    if (typeof calYear === 'undefined') { initCalendar(); } else { renderCalendar(); }
    }, err => {
    document.getElementById('cardsList').innerHTML = `<div class="empty"><div class="icon">⚠️</div><h3>Error loading data</h3><p>${err.message}</p></div>`;
    });
}

function updateStats() {
document.getElementById('statTotal').textContent    = allAppts.length;
document.getElementById('statPending').textContent  = allAppts.filter(a => a.status === 'pending').length;
document.getElementById('statAccepted').textContent = allAppts.filter(a => a.status === 'accepted').length;
document.getElementById('statRejected').textContent = allAppts.filter(a => a.status === 'rejected').length;
}

function filterAppts() {
if (currentFilter === 'all') return allAppts;
return allAppts.filter(a => a.status === currentFilter);
}

function filterTab(status, btn) {
currentFilter = status;
currentPage = 1;
document.querySelectorAll('.tab').forEach(b => b.classList.remove('active'));
btn.classList.add('active');
renderCards(filterAppts());
}

function renderCards(appts) {
const el = document.getElementById('cardsList');
if (!appts.length) {
    const msgs = { all: 'No appointments yet.', pending: 'No pending requests.', accepted: 'No accepted appointments.', rejected: 'No rejected appointments.' };
    el.innerHTML = `<div class="empty"><div class="icon">📋</div><h3>${msgs[currentFilter]}</h3><p>New requests will appear here in real time.</p></div>`;
    renderPagination(0, 0);
    return;
}

const totalPages = Math.ceil(appts.length / PAGE_SIZE);
if (currentPage > totalPages) currentPage = totalPages;

const start = (currentPage - 1) * PAGE_SIZE;
const pageAppts = appts.slice(start, start + PAGE_SIZE);

el.innerHTML = pageAppts.map((a, i) => {
    const d = a.date?.toDate ? a.date.toDate() : new Date(a.date);
    const dateStr = `${MONTHS[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}`;
    const created = a.createdAt?.toDate ? a.createdAt.toDate().toLocaleString('en-PH') : '';

    const actionBtns = a.status === 'pending'
    ? `<button class="btn-accept" onclick="openAssignModal('${a.id}', \`${(a.ownerName||'').replace(/`/g,"'")}\`, \`${(a.petName||'').replace(/`/g,"'")}\`)">✅ Accept</button>
        <button class="btn-reject" onclick="openRejectModal('${a.id}', \`${(a.ownerName||'').replace(/`/g,"'")}\`, \`${(a.petName||'').replace(/`/g,"'")}\`)">✕ Reject</button>
        <button class="btn-delete" onclick="deleteAppt('${a.id}')">🗑 Delete</button>`
    : `<div class="status-done ${a.status}">${a.status === 'accepted' ? '✅ Accepted' : '❌ Rejected'}</div>
        ${a.assignedDoctorName ? `<div class="assigned-doctor">🩺 ${a.assignedDoctorName}</div>` : ''}
        ${a.rejectReason ? `<div class="reject-reason-tag">💬 ${a.rejectReason}</div>` : ''}
        <button class="btn-delete" onclick="deleteAppt('${a.id}')">🗑 Delete</button>`;

    return `
    <div class="appt-card border-${a.status || 'pending'}" style="animation-delay:${i * 0.05}s">
        <div>
        <div class="card-top">
            <h3>${a.ownerName || '—'}</h3>
            <span class="status-pill pill-${a.status || 'pending'}">${a.status || 'pending'}</span>
        </div>
        <div class="card-info">
            <span>🐾 Pet: <strong>${a.petName || '—'}${a.petBreed ? ' (' + a.petBreed + ')' : ''}</strong></span>
            <span>📅 <strong>${dateStr}</strong></span>
            <span>🕐 <strong>${a.time || '—'}</strong></span>
            <span>📞 <strong>${a.contactNo || '—'}</strong></span>
            <span>✉️ <strong>${a.email || '—'}</strong></span>
            ${a.preferredDoctor ? `<span style="grid-column:1/-1">🩺 Preferred Doctor: <strong>${a.preferredDoctor}</strong></span>` : ''}
            ${a.address ? `<span style="grid-column:1/-1">📍 <strong>${a.address}</strong></span>` : ''}
        </div>
        ${a.notes ? `<div class="card-notes">📝 ${a.notes}</div>` : ''}
        ${created ? `<div class="card-time">Submitted: ${created}</div>` : ''}
        </div>
        <div class="card-actions">${actionBtns}</div>
    </div>`;
}).join('');

renderPagination(appts.length, totalPages);
}

function renderPagination(total, totalPages) {
// Remove old pagination if exists
const old = document.getElementById('paginationBar');
if (old) old.remove();

if (totalPages <= 1) return;

const bar = document.createElement('div');
bar.id = 'paginationBar';
bar.className = 'pagination-bar';

// Info text
const info = document.createElement('span');
info.className = 'page-info';
const start = (currentPage - 1) * PAGE_SIZE + 1;
const end   = Math.min(currentPage * PAGE_SIZE, total);
info.textContent = `Showing ${start}–${end} of ${total}`;
bar.appendChild(info);

// Buttons wrap
const btns = document.createElement('div');
btns.className = 'page-btns';

// Prev
const prev = document.createElement('button');
prev.className = 'page-btn' + (currentPage === 1 ? ' disabled' : '');
prev.innerHTML = '&#8249;';
prev.disabled = currentPage === 1;
prev.onclick = () => goToPage(currentPage - 1);
btns.appendChild(prev);

// Page number buttons
for (let p = 1; p <= totalPages; p++) {
    const btn = document.createElement('button');
    btn.className = 'page-btn' + (p === currentPage ? ' active' : '');
    btn.textContent = p;
    btn.onclick = () => goToPage(p);
    btns.appendChild(btn);
}

// Next
const next = document.createElement('button');
next.className = 'page-btn' + (currentPage === totalPages ? ' disabled' : '');
next.innerHTML = '&#8250;';
next.disabled = currentPage === totalPages;
next.onclick = () => goToPage(currentPage + 1);
btns.appendChild(next);

bar.appendChild(btns);
document.getElementById('cardsList').after(bar);
}

function goToPage(page) {
currentPage = page;
renderCards(filterAppts());
document.getElementById('cardsList').scrollIntoView({ behavior: 'smooth', block: 'start' });
}

async function updateStatus(id, status) {
await db.collection('appointments').doc(id).update({ status });
}

async function deleteAppt(id) {
if (confirm('Delete this appointment request permanently?')) {
    await db.collection('appointments').doc(id).delete();
}
}
// ── CALENDAR ──
let calYear, calMonth;

function initCalendar() {
  const now = new Date();
  calYear  = now.getFullYear();
  calMonth = now.getMonth();
  renderCalendar();
}

function changeMonth(dir) {
  calMonth += dir;
  if (calMonth > 11) { calMonth = 0; calYear++; }
  if (calMonth < 0)  { calMonth = 11; calYear--; }
  renderCalendar();
}

function renderCalendar() {
  const MONTH_NAMES = ['January','February','March','April','May','June',
                       'July','August','September','October','November','December'];

  document.getElementById('calMonthLabel').textContent =
    `${MONTH_NAMES[calMonth]} ${calYear}`;

  const firstDay  = new Date(calYear, calMonth, 1).getDay(); // 0=Sun
  const daysInMonth = new Date(calYear, calMonth + 1, 0).getDate();
  const today = new Date();

  // Build a map: "YYYY-MM-DD" -> [appointments]
  const apptMap = {};
  allAppts.filter(a => a.status === 'accepted').forEach(a => {
    const d = a.date?.toDate ? a.date.toDate() : new Date(a.date);
    const key = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
    if (!apptMap[key]) apptMap[key] = [];
    apptMap[key].push(a);
  });

  const grid = document.getElementById('calGrid');
  grid.innerHTML = '';

  // Leading empty cells
  for (let i = 0; i < firstDay; i++) {
    grid.innerHTML += `<div class="cal-cell cal-empty"></div>`;
  }

  // Day cells
  for (let d = 1; d <= daysInMonth; d++) {
    const key = `${calYear}-${String(calMonth+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
    const appts = apptMap[key] || [];
    const isToday = today.getFullYear() === calYear &&
                    today.getMonth() === calMonth &&
                    today.getDate() === d;

    const dots = appts.slice(0, 3).map(() =>
      `<span class="cal-dot"></span>`).join('');
    const extra = appts.length > 3
      ? `<span class="cal-more">+${appts.length - 3}</span>` : '';

    // Show up to 2 pet names on the cell
    const previews = appts.slice(0, 2).map(a =>
      `<div class="cal-preview">${a.petName || a.ownerName}</div>`).join('');

    grid.innerHTML += `
      <div class="cal-cell ${isToday ? 'cal-today' : ''} ${appts.length ? 'cal-has-appts' : ''}"
           onclick="${appts.length ? `openDayModal('${key}', ${d})` : ''}">
        <div class="cal-day-num">${d}</div>
        ${previews}
        <div class="cal-dots">${dots}${extra}</div>
      </div>`;
  }

  // Trailing empty cells to complete last row
  const totalCells = firstDay + daysInMonth;
  const remainder = totalCells % 7;
  if (remainder !== 0) {
    for (let i = 0; i < 7 - remainder; i++) {
      grid.innerHTML += `<div class="cal-cell cal-empty"></div>`;
    }
  }
}

function openDayModal(key, day) {
  const MONTH_NAMES = ['January','February','March','April','May','June',
                       'July','August','September','October','November','December'];
  const appts = allAppts.filter(a => {
    if (a.status !== 'accepted') return false;
    const d = a.date?.toDate ? a.date.toDate() : new Date(a.date);
    const k = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
    return k === key;
  });

  document.getElementById('calModalTitle').textContent =
    `${MONTH_NAMES[calMonth]} ${day}, ${calYear} — ${appts.length} appointment${appts.length !== 1 ? 's' : ''}`;

  document.getElementById('calModalBody').innerHTML = appts.map(a => `
    <div class="modal-appt-card">
      <div class="modal-appt-top">
        <span class="modal-pet">🐾 ${a.petName || '—'}${a.petBreed ? ' ('+a.petBreed+')' : ''}</span>
        <span class="modal-time">🕐 ${a.time || '—'}</span>
      </div>
      <div class="modal-appt-info">
        <span>👤 ${a.ownerName || '—'}</span>
        <span>📞 ${a.contactNo || '—'}</span>
        ${a.address ? `<span>📍 ${a.address}</span>` : ''}
      </div>
      ${a.notes ? `<div class="modal-notes">📝 ${a.notes}</div>` : ''}
    </div>
  `).join('');

  document.getElementById('calModalOverlay').classList.add('show');
}

function closeModal() {
  document.getElementById('calModalOverlay').classList.remove('show');
}

document.addEventListener('keydown', e => {
  if (e.key === 'Escape') { closeModal(); closeRejectModal(); }
});

// ── TIME FORMAT HELPER ──
// Converts any time string to 24h "HH:MM" to match stored availability slots.
// Handles: "10:51 AM", "10:51AM", "22:30", "9:00 pm", etc.
function normalizeTo24h(timeStr) {
  if (!timeStr) return null;
  // Already 24h format: "HH:MM" with no am/pm
  const plain = timeStr.match(/^(\d{1,2}):(\d{2})$/);
  if (plain) return `${plain[1].padStart(2,'0')}:${plain[2]}`;
  // 12h format with AM/PM
  const ampm = timeStr.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
  if (ampm) {
    let h = parseInt(ampm[1], 10);
    const m = ampm[2];
    const period = ampm[3].toUpperCase();
    if (period === 'AM' && h === 12) h = 0;
    if (period === 'PM' && h !== 12) h += 12;
    return `${String(h).padStart(2,'0')}:${m}`;
  }
  return null; // unrecognised format — fall back to "any slot" check
}

// Given a 24h "HH:MM" time and an array of slot strings (also 24h "HH:MM"),
// returns true if any slot falls within ±30 minutes of the appointment time.
function doctorAvailableForTime(apptTime24, slots) {
  if (!apptTime24 || !slots || slots.length === 0) return slots && slots.length > 0;
  const [ah, am] = apptTime24.split(':').map(Number);
  const apptMins = ah * 60 + am;
  return slots.some(slot => {
    const [sh, sm] = slot.split(':').map(Number);
    const slotMins = sh * 60 + sm;
    return Math.abs(apptMins - slotMins) <= 30;
  });
}

// ── ASSIGN DOCTOR MODAL ──
let assigningApptId   = null;
let assigningApptDate = null;
let assigningApptTime = null;

async function openAssignModal(apptId, ownerName, petName) {
  assigningApptId = apptId;

  // Grab the appointment's date & time for availability checking
  const appt = allAppts.find(a => a.id === apptId);
  if (appt) {
    const d = appt.date?.toDate ? appt.date.toDate() : new Date(appt.date);
    assigningApptDate = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
    assigningApptTime = normalizeTo24h((appt.time || '').trim());
  } else {
    assigningApptDate = null;
    assigningApptTime = null;
  }

  document.getElementById('assignApptLabel').textContent = `${ownerName} — ${petName}`;
  document.getElementById('assignDoctorList').innerHTML =
    `<div class="assign-loading"><div class="spinner" style="width:28px;height:28px;margin:20px auto;"></div></div>`;
  document.getElementById('assignModalOverlay').classList.add('show');

  try {
    const snap = await db.collection('users').where('role', '==', 'doctor').get();
    const doctors = snap.docs
      .map(d => ({ id: d.id, ...d.data() }))
      .sort((a, b) => (a.name || '').localeCompare(b.name || ''));

    if (!doctors.length) {
      document.getElementById('assignDoctorList').innerHTML =
        `<div class="assign-empty">No doctors found. Add doctors via Super Admin.</div>`;
      return;
    }

    // Fetch availability for each doctor on the appointment date
    const availResults = await Promise.all(doctors.map(async doc => {
      if (!assigningApptDate) return { available: false, slots: [] };
      const monthKey = assigningApptDate.slice(0, 7); // "YYYY-MM"
      try {
        const availSnap = await db.collection('doctorAvailability')
          .doc(doc.id)
          .collection('months')
          .doc(monthKey)
          .get();
        if (!availSnap.exists) return { available: false, slots: [] };
        const slots = (availSnap.data().slots || {})[assigningApptDate] || [];
        // If appointment has a specific time, check that exact slot; otherwise any slot counts
        const available = assigningApptTime
          ? doctorAvailableForTime(assigningApptTime, slots)
          : slots.length > 0;
        return { available, slots };
      } catch(e) {
        return { available: false, slots: [] };
      }
    }));

    // Merge availability into doctor objects, then sort available first
    const indexed = doctors.map((d, i) => ({ ...d, ...availResults[i] }));
    indexed.sort((a, b) => {
      if (a.available && !b.available) return -1;
      if (!a.available && b.available) return 1;
      return (a.name || '').localeCompare(b.name || '');
    });

    const hasDate = !!assigningApptDate;
    document.getElementById('assignDoctorList').innerHTML =
      (hasDate
        ? `<div class="avail-filter-note">
             🗓 Availability for <strong>${assigningApptDate}</strong>
             ${assigningApptTime ? `at <strong>${assigningApptTime}</strong>` : ''}
           </div>`
        : '') +
      indexed.map(d => {
        const unavailable = hasDate && !d.available;
        const badge = !hasDate ? '' : d.available
          ? `<span class="avail-badge avail-badge-yes">✓ Available</span>`
          : `<span class="avail-badge avail-badge-no">✗ Unavailable</span>`;
        const slotsPreview = hasDate && d.slots && d.slots.length > 0
          ? `<div class="doctor-opt-slots">🕐 ${d.slots.slice(0, 5).join(', ')}${d.slots.length > 5 ? ` +${d.slots.length - 5} more` : ''}</div>`
          : '';
        return `
          <div class="doctor-option ${unavailable ? 'doctor-unavailable' : ''}"
               onclick="${unavailable ? 'void(0)' : `selectDoctor('${d.id}', '${(d.name||'').replace(/'/g,"\\'")}', this)`}"
               title="${unavailable ? 'This doctor has not set availability for this date/time' : ''}">
            <div class="doctor-avatar">${(d.name || 'D')[0].toUpperCase()}</div>
            <div class="doctor-opt-details">
              <div class="doctor-opt-name">${d.name || '—'}</div>
              <div class="doctor-opt-email">${d.email || '—'}</div>
              ${slotsPreview}
            </div>
            <div style="display:flex;flex-direction:column;align-items:flex-end;gap:6px;">
              ${badge}
              <div class="doctor-check">✓</div>
            </div>
          </div>`;
      }).join('');
  } catch(err) {
    document.getElementById('assignDoctorList').innerHTML =
      `<div class="assign-empty" style="color:var(--red)">${err.message}</div>`;
  }
}

let selectedDoctorId = null;
let selectedDoctorName = null;

function selectDoctor(uid, name, el) {
  selectedDoctorId   = uid;
  selectedDoctorName = name;
  document.querySelectorAll('.doctor-option').forEach(o => o.classList.remove('selected'));
  el.classList.add('selected');
  document.getElementById('assignConfirmBtn').disabled = false;
}

function closeAssignModal() {
  document.getElementById('assignModalOverlay').classList.remove('show');
  assigningApptId    = null;
  assigningApptDate  = null;
  assigningApptTime  = null;
  selectedDoctorId   = null;
  selectedDoctorName = null;
  document.getElementById('assignConfirmBtn').disabled = true;
}


// ── REJECT REASON MODAL ──
let rejectingApptId = null;

function openRejectModal(apptId, ownerName, petName) {
  rejectingApptId = apptId;
  document.getElementById('rejectApptLabel').textContent = `${ownerName} — ${petName}`;
  document.getElementById('rejectReasonInput').value = '';
  document.getElementById('rejectReasonErr').style.display = 'none';
  document.getElementById('rejectModalOverlay').classList.add('show');
  setTimeout(() => document.getElementById('rejectReasonInput').focus(), 100);
}

function closeRejectModal() {
  document.getElementById('rejectModalOverlay').classList.remove('show');
  rejectingApptId = null;
}

async function confirmReject() {
  const reason = document.getElementById('rejectReasonInput').value.trim();
  const errEl  = document.getElementById('rejectReasonErr');
  if (!reason) {
    errEl.textContent = 'Please enter a reason for rejection.';
    errEl.style.display = 'block';
    return;
  }
  errEl.style.display = 'none';
  const btn = document.getElementById('rejectConfirmBtn');
  btn.disabled = true;
  btn.textContent = 'Rejecting…';
  try {
    await db.collection('appointments').doc(rejectingApptId).update({
      status: 'rejected',
      rejectReason: reason
    });
    closeRejectModal();
  } catch(err) {
    errEl.textContent = 'Failed to reject: ' + err.message;
    errEl.style.display = 'block';
    btn.disabled = false;
    btn.textContent = '❌ Confirm Rejection';
  }
}

async function confirmAssign() {
  if (!assigningApptId || !selectedDoctorId) return;
  const btn = document.getElementById('assignConfirmBtn');
  btn.disabled = true;
  btn.textContent = 'Saving…';
  try {
    await db.collection('appointments').doc(assigningApptId).update({
      status: 'accepted',
      assignedDoctorId:   selectedDoctorId,
      assignedDoctorName: selectedDoctorName
    });
    closeAssignModal();
  } catch(err) {
    alert('Failed to assign: ' + err.message);
    btn.disabled = false;
    btn.textContent = 'Confirm & Accept';
  }
}