let allAppts = [];
let currentFilter = 'all';
let currentPage = 1;
const PAGE_SIZE = 5;
const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

// ── AUTH ──
document.addEventListener('keydown', e => { if (e.key === 'Enter') doLogin(); });

auth.onAuthStateChanged(async user => {
if (!user) return showLoginOverlay();
// Check admin role
try {
    const doc = await db.collection('users').doc(user.uid).get();
    if (!doc.exists || doc.data().role !== 'admin') {
    await auth.signOut(); return showLoginOverlay();
    }
} catch(e) {
    // If no users collection yet, allow first admin in (remove this in production)
}
document.getElementById('loginOverlay').style.display = 'none';
startListening();
});

function showLoginOverlay() {
document.getElementById('loginOverlay').style.display = 'flex';
}

async function doLogin() {
const email = document.getElementById('loginEmail').value.trim();
const pass  = document.getElementById('loginPass').value;
const errEl = document.getElementById('loginErr');
errEl.style.display = 'none';
if (!email || !pass) { errEl.textContent = 'Please enter email and password.'; return errEl.style.display = 'block'; }
try {
    await auth.signInWithEmailAndPassword(email, pass);
} catch(err) {
    const msgs = { 'auth/user-not-found':'No account found.', 'auth/wrong-password':'Incorrect password.', 'auth/invalid-email':'Invalid email.' };
    errEl.textContent = msgs[err.code] || err.message;
    errEl.style.display = 'block';
}
}

function doLogout() { auth.signOut(); }

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
    ? `<button class="btn-accept" onclick="updateStatus('${a.id}', 'accepted')">✅ Accept</button>
        <button class="btn-reject" onclick="updateStatus('${a.id}', 'rejected')">✕ Reject</button>
        <button class="btn-delete" onclick="deleteAppt('${a.id}')">🗑 Delete</button>`
    : `<div class="status-done ${a.status}">${a.status === 'accepted' ? '✅ Accepted' : '❌ Rejected'}</div>
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
  if (e.key === 'Escape') closeModal();
});