let allAppts = [];
let currentFilter = 'upcoming';
let currentDoctorUid = null;
const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
const MONTH_NAMES = ['January','February','March','April','May','June',
                     'July','August','September','October','November','December'];

// ── AUTH ──
document.addEventListener('keydown', e => { if (e.key === 'Enter') doLogin(); });

auth.onAuthStateChanged(async user => {
  if (!user) return showLoginOverlay();
  try {
    const doc = await db.collection('users').doc(user.uid).get();
    if (!doc.exists) { await auth.signOut(); return showLoginOverlay('Account not found.'); }
    const role = doc.data().role;
    if (role === 'admin' || role === 'superadmin') {
      window.location.href = 'admin.html';
      return;
    }
    if (role !== 'doctor') {
      await auth.signOut();
      return showLoginOverlay('Access denied. Doctor role required.');
    }
    currentDoctorUid = user.uid;
    document.getElementById('loginOverlay').style.display = 'none';
    document.getElementById('loggedName').textContent  = doc.data().name  || '';
    document.getElementById('loggedEmail').textContent = user.email || '';
    startListening();
    initAvailability();
  } catch(e) {
    showLoginOverlay('Error checking credentials.');
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
      'auth/invalid-email':  'Invalid email.'
    };
    errEl.textContent = msgs[err.code] || err.message;
    errEl.style.display = 'block';
  }
}

function doLogout() { auth.signOut(); }

// ── DATA ──
function startListening() {
  db.collection('appointments')
    .where('assignedDoctorId', '==', currentDoctorUid)
    .where('status', '==', 'accepted')
    .onSnapshot(snap => {
      allAppts = snap.docs
        .map(d => ({ id: d.id, ...d.data() }))
        .sort((a, b) => getDate(a) - getDate(b));
      updateStats();
      renderCards(filterAppts());
      if (typeof calYear === 'undefined') { initCalendar(); } else { renderCalendar(); }
    }, err => {
      document.getElementById('cardsList').innerHTML =
        `<div class="empty"><div class="icon">⚠️</div><h3>Error loading data</h3><p>${err.message}</p></div>`;
    });
}

function updateStats() {
  const now      = new Date();
  const todayStr = toKey(now);
  const weekEnd  = new Date(now); weekEnd.setDate(now.getDate() + 7);

  const todayCount = allAppts.filter(a => { const d = getDate(a); return toKey(d) === todayStr; }).length;
  const weekCount  = allAppts.filter(a => { const d = getDate(a); return d >= startOfDay(now) && d <= weekEnd; }).length;
  const monthCount = allAppts.filter(a => {
    const d = getDate(a);
    return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth();
  }).length;

  document.getElementById('statToday').textContent = todayCount;
  document.getElementById('statWeek').textContent  = weekCount;
  document.getElementById('statMonth').textContent = monthCount;
  document.getElementById('statTotal').textContent = allAppts.length;
}

function startOfDay(d) {
  const x = new Date(d); x.setHours(0,0,0,0); return x;
}
function getDate(a) {
  return a.date?.toDate ? a.date.toDate() : new Date(a.date);
}
function toKey(d) {
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}

function filterAppts() {
  const now      = new Date();
  const todayStr = toKey(now);
  if (currentFilter === 'today')    return allAppts.filter(a => toKey(getDate(a)) === todayStr);
  if (currentFilter === 'upcoming') return allAppts.filter(a => getDate(a) >= startOfDay(now));
  return allAppts;
}

function filterTab(filter, btn) {
  currentFilter = filter;
  document.querySelectorAll('.tab').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  renderCards(filterAppts());
}

function renderCards(appts) {
  const el = document.getElementById('cardsList');
  if (!appts.length) {
    const msgs = { today: 'No appointments today.', upcoming: 'No upcoming appointments.', all: 'No appointments assigned yet.' };
    el.innerHTML = `<div class="empty"><div class="icon">📋</div><h3>${msgs[currentFilter]}</h3><p>Your assigned appointments will appear here.</p></div>`;
    return;
  }
  el.innerHTML = appts.map((a, i) => {
    const d       = getDate(a);
    const now     = new Date();
    const isToday = toKey(d) === toKey(now);
    const isPast  = d < startOfDay(now);
    return `
    <div class="appt-card ${isPast ? 'past' : isToday ? 'today' : ''}" style="animation-delay:${i * 0.05}s">
      <div class="card-date-badge">
        <div class="badge-month">${MONTHS[d.getMonth()]}</div>
        <div class="badge-day">${d.getDate()}</div>
        ${isToday ? '<div class="badge-today">Today</div>' : ''}
      </div>
      <div class="card-content">
        <div class="card-top">
          <h3>${a.ownerName || '—'}</h3>
          ${isToday ? '<span class="status-pill pill-today">Today</span>' : ''}
          ${isPast  ? '<span class="status-pill pill-past">Past</span>'   : ''}
        </div>
        <div class="card-info">
          <span>🐾 <strong>${a.petName || '—'}${a.petBreed ? ' (' + a.petBreed + ')' : ''}</strong></span>
          <span>🕐 <strong>${a.time || '—'}</strong></span>
          <span>📞 <strong>${a.contactNo || '—'}</strong></span>
          <span>✉️ <strong>${a.email || '—'}</strong></span>
          ${a.address ? `<span style="flex-basis:100%">📍 <strong>${a.address}</strong></span>` : ''}
        </div>
        ${a.notes ? `<div class="card-notes">📝 ${a.notes}</div>` : ''}
      </div>
      <div class="card-time-col">
        <div class="time-bubble">${a.time || '—'}</div>
        <div class="card-year">${d.getFullYear()}</div>
      </div>
    </div>`;
  }).join('');
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
  document.getElementById('calMonthLabel').textContent = `${MONTH_NAMES[calMonth]} ${calYear}`;
  const firstDay    = new Date(calYear, calMonth, 1).getDay();
  const daysInMonth = new Date(calYear, calMonth + 1, 0).getDate();
  const today       = new Date();

  const apptMap = {};
  allAppts.forEach(a => {
    const key = toKey(getDate(a));
    if (!apptMap[key]) apptMap[key] = [];
    apptMap[key].push(a);
  });

  const grid = document.getElementById('calGrid');
  grid.innerHTML = '';

  for (let i = 0; i < firstDay; i++) grid.innerHTML += `<div class="cal-cell cal-empty"></div>`;

  for (let d = 1; d <= daysInMonth; d++) {
    const key   = `${calYear}-${String(calMonth+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
    const appts = apptMap[key] || [];
    const isToday = today.getFullYear() === calYear && today.getMonth() === calMonth && today.getDate() === d;
    const previews = appts.slice(0, 2).map(a =>
      `<div class="cal-preview">${a.time || ''} ${a.petName || a.ownerName}</div>`).join('');
    const extra = appts.length > 2 ? `<span class="cal-more">+${appts.length-2}</span>` : '';

    grid.innerHTML += `
      <div class="cal-cell ${isToday ? 'cal-today' : ''} ${appts.length ? 'cal-has-appts' : ''}"
           onclick="${appts.length ? `openDayModal('${key}', ${d})` : ''}">
        <div class="cal-day-num">${d}</div>
        ${previews}
        ${appts.length ? `<div class="cal-dots">${appts.slice(0,3).map(()=>'<span class="cal-dot"></span>').join('')}${extra}</div>` : ''}
      </div>`;
  }

  const remainder = (firstDay + daysInMonth) % 7;
  if (remainder !== 0) for (let i = 0; i < 7 - remainder; i++) grid.innerHTML += `<div class="cal-cell cal-empty"></div>`;
}

function openDayModal(key, day) {
  const appts = allAppts.filter(a => toKey(getDate(a)) === key);
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
  if (e.key === 'Escape') { closeModal(); closeAvailModal(); }
});

// ════════════════════════════════════════════════
// ── AVAILABILITY SCHEDULER ──
// ════════════════════════════════════════════════

let availYear, availMonth;
// availData stores ALL months in memory: { "YYYY-MM-DD": Set([...times]) }
// Each month is loaded fresh from Firestore when navigated to, and
// saved independently so switching months never loses data.
let availData   = {};
let availDirty  = false;
let availSaving = false;

const TIME_SLOTS = [
  '07:00','07:30','08:00','08:30','09:00','09:30',
  '10:00','10:30','11:00','11:30','12:00','12:30',
  '13:00','13:30','14:00','14:30','15:00','15:30',
  '16:00','16:30','17:00','17:30','18:00'
];

function initAvailability() {
  const now  = new Date();
  availYear  = now.getFullYear();
  availMonth = now.getMonth();
  loadAvailability();
}

function availMonthKey() {
  return `${availYear}-${String(availMonth+1).padStart(2,'0')}`;
}

async function loadAvailability() {
  // FIX: Save any unsaved changes for the current month BEFORE switching months,
  // so navigating away never discards edited slots.
  if (availDirty) await saveAvailability();

  // Clear only this month's keys from availData (keep other months if cached)
  const prefix = availMonthKey();
  Object.keys(availData).forEach(k => { if (k.startsWith(prefix)) delete availData[k]; });

  renderAvailabilityCalendar();

  if (!currentDoctorUid) return; // Not logged in yet

  try {
    const snap = await db.collection('doctorAvailability')
      .doc(currentDoctorUid)
      .collection('months')
      .doc(availMonthKey())
      .get();
    if (snap.exists) {
      const raw = snap.data().slots || {};
      Object.entries(raw).forEach(([date, times]) => {
        availData[date] = new Set(Array.isArray(times) ? times : Object.values(times));
      });
    }
  } catch(e) {
    console.error('Failed to load availability:', e.code, e.message);
    showAvailToast('⚠️ Could not load availability. Check your connection.', true);
  }
  renderAvailabilityCalendar();
}

function changeAvailMonth(dir) {
  availMonth += dir;
  if (availMonth > 11) { availMonth = 0; availYear++; }
  if (availMonth < 0)  { availMonth = 11; availYear--; }
  loadAvailability();
}

function renderAvailabilityCalendar() {
  document.getElementById('availMonthLabel').textContent = `${MONTH_NAMES[availMonth]} ${availYear}`;

  const firstDay    = new Date(availYear, availMonth, 1).getDay();
  const daysInMonth = new Date(availYear, availMonth + 1, 0).getDate();
  const today       = new Date();

  const grid = document.getElementById('availGrid');
  grid.innerHTML = '';

  for (let i = 0; i < firstDay; i++) grid.innerHTML += `<div class="avail-cell avail-empty"></div>`;

  for (let d = 1; d <= daysInMonth; d++) {
    const key     = `${availYear}-${String(availMonth+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
    const times   = availData[key] || new Set();
    const count   = times.size;
    const isToday = today.getFullYear() === availYear && today.getMonth() === availMonth && today.getDate() === d;
    const isPast  = new Date(availYear, availMonth, d) < startOfDay(today);

    const classes = [
      'avail-cell',
      count > 0 ? 'avail-set' : '',
      isToday   ? 'avail-today' : '',
      isPast    ? 'avail-past'  : 'avail-clickable'
    ].filter(Boolean).join(' ');

    const preview = count > 0
      ? `<div class="avail-count">${count} slot${count !== 1 ? 's' : ''}</div>`
      : (!isPast ? `<div class="avail-add-hint">+ set</div>` : '');

    grid.innerHTML += `
      <div class="${classes}" onclick="${isPast ? '' : `openAvailModal('${key}', ${d})`}">
        <div class="avail-day-num">${d}</div>
        ${preview}
      </div>`;
  }

  const remainder = (firstDay + daysInMonth) % 7;
  if (remainder !== 0) for (let i = 0; i < 7 - remainder; i++) grid.innerHTML += `<div class="avail-cell avail-empty"></div>`;

  updateAvailSummary();
}

function updateAvailSummary() {
  const prefix     = availMonthKey();
  const totalDays  = Object.keys(availData).filter(k => k.startsWith(prefix) && availData[k].size > 0).length;
  const totalSlots = Object.entries(availData)
    .filter(([k]) => k.startsWith(prefix))
    .reduce((sum, [, s]) => sum + s.size, 0);
  document.getElementById('availSummary').textContent = totalDays > 0
    ? `${totalDays} day${totalDays !== 1 ? 's' : ''} · ${totalSlots} time slot${totalSlots !== 1 ? 's' : ''} set for ${MONTH_NAMES[availMonth]}`
    : `No availability set for ${MONTH_NAMES[availMonth]} yet.`;
}

// ── AVAILABILITY DAY MODAL ──
let currentAvailKey = '';

function openAvailModal(key, day) {
  currentAvailKey = key;
  document.getElementById('availModalTitle').textContent = `${MONTH_NAMES[availMonth]} ${day}, ${availYear}`;
  renderTimeSlots();
  document.getElementById('availModalOverlay').classList.add('show');
}

function closeAvailModal() {
  document.getElementById('availModalOverlay').classList.remove('show');
  // FIX: Only trigger save if there are actual unsaved changes
  if (availDirty && !availSaving) saveAvailability();
}

function renderTimeSlots() {
  const selected = availData[currentAvailKey] || new Set();
  document.getElementById('timeSlotsGrid').innerHTML = TIME_SLOTS.map(t => `
    <button class="time-slot-btn ${selected.has(t) ? 'time-slot-on' : ''}"
            onclick="toggleSlot('${t}')">
      ${t}
    </button>
  `).join('');
}

function toggleSlot(time) {
  if (!availData[currentAvailKey]) availData[currentAvailKey] = new Set();
  const s = availData[currentAvailKey];
  s.has(time) ? s.delete(time) : s.add(time);
  if (s.size === 0) delete availData[currentAvailKey];
  availDirty = true;
  renderTimeSlots();
  renderAvailabilityCalendar();
}

function clearDaySlots() {
  delete availData[currentAvailKey];
  availDirty = true;
  renderTimeSlots();
  renderAvailabilityCalendar();
}

function selectAllSlots() {
  availData[currentAvailKey] = new Set(TIME_SLOTS);
  availDirty = true;
  renderTimeSlots();
  renderAvailabilityCalendar();
}

async function saveAvailability() {
  if (availSaving) return;
  if (!currentDoctorUid) {
    showAvailToast('❌ Not logged in — cannot save.', true);
    return;
  }

  availSaving = true;
  const saveBtn = document.getElementById('availSaveBtn');
  if (saveBtn) { saveBtn.textContent = 'Saving…'; saveBtn.disabled = true; }

  // FIX: Only write keys that belong to the current month
  const prefix = availMonthKey();
  const slots = {};
  Object.entries(availData).forEach(([date, times]) => {
    if (date.startsWith(prefix) && times.size > 0) {
      slots[date] = [...times].sort();
    }
  });

  try {
    // FIX: Use the correct Firestore path — doctorAvailability/{uid}/months/{YYYY-MM}
    await db.collection('doctorAvailability')
      .doc(currentDoctorUid)
      .collection('months')
      .doc(availMonthKey())
      .set({ slots, updatedAt: firebase.firestore.FieldValue.serverTimestamp() });

    // FIX: Only clear dirty flag AFTER a confirmed successful write
    availDirty = false;
    showAvailToast('✅ Availability saved!');
  } catch(e) {
    // Log the real error so you can see it in the console
    console.error('saveAvailability failed:', e.code, e.message);
    const hint = e.code === 'permission-denied'
      ? '❌ Permission denied — add Firestore rules for doctorAvailability.'
      : `❌ Save failed: ${e.message}`;
    showAvailToast(hint, true);
    // Keep dirty = true so data isn't silently lost
  } finally {
    availSaving = false;
    if (saveBtn) { saveBtn.textContent = 'Save Availability'; saveBtn.disabled = false; }
  }
}

function showAvailToast(msg, isErr) {
  let toast = document.getElementById('availToast');
  if (!toast) {
    toast = document.createElement('div');
    toast.id = 'availToast';
    document.body.appendChild(toast);
  }
  toast.textContent = msg;
  toast.className   = 'avail-toast' + (isErr ? ' avail-toast-err' : '');
  toast.classList.add('show');
  setTimeout(() => toast.classList.remove('show'), 4000);
}