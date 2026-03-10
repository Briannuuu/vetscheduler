let allAppts = [];
let currentFilter = 'upcoming';
let currentDoctorUid = null;
const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

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
        .sort((a, b) => getDate(a) - getDate(b)); // sort by date ascending, client-side
      updateStats();
      renderCards(filterAppts());
      if (typeof calYear === 'undefined') { initCalendar(); } else { renderCalendar(); }
    }, err => {
      document.getElementById('cardsList').innerHTML =
        `<div class="empty"><div class="icon">⚠️</div><h3>Error loading data</h3><p>${err.message}</p></div>`;
    });
}

function updateStats() {
  const now   = new Date();
  const todayStr = toKey(now);
  const weekEnd  = new Date(now); weekEnd.setDate(now.getDate() + 7);

  const todayCount = allAppts.filter(a => {
    const d = getDate(a); return toKey(d) === todayStr;
  }).length;
  const weekCount  = allAppts.filter(a => {
    const d = getDate(a); return d >= startOfDay(now) && d <= weekEnd;
  }).length;
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
  const now     = new Date();
  const todayStr = toKey(now);
  if (currentFilter === 'today') {
    return allAppts.filter(a => toKey(getDate(a)) === todayStr);
  }
  if (currentFilter === 'upcoming') {
    return allAppts.filter(a => getDate(a) >= startOfDay(now));
  }
  return allAppts; // 'all'
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
    const msgs = {
      today:    'No appointments today.',
      upcoming: 'No upcoming appointments.',
      all:      'No appointments assigned yet.'
    };
    el.innerHTML = `<div class="empty"><div class="icon">📋</div><h3>${msgs[currentFilter]}</h3><p>Your assigned appointments will appear here.</p></div>`;
    return;
  }

  el.innerHTML = appts.map((a, i) => {
    const d       = getDate(a);
    const dateStr = `${MONTHS[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}`;
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
  const MONTH_NAMES = ['January','February','March','April','May','June',
                       'July','August','September','October','November','December'];
  document.getElementById('calMonthLabel').textContent = `${MONTH_NAMES[calMonth]} ${calYear}`;

  const firstDay   = new Date(calYear, calMonth, 1).getDay();
  const daysInMonth = new Date(calYear, calMonth + 1, 0).getDate();
  const today = new Date();

  const apptMap = {};
  allAppts.forEach(a => {
    const d = getDate(a);
    const key = toKey(d);
    if (!apptMap[key]) apptMap[key] = [];
    apptMap[key].push(a);
  });

  const grid = document.getElementById('calGrid');
  grid.innerHTML = '';

  for (let i = 0; i < firstDay; i++) {
    grid.innerHTML += `<div class="cal-cell cal-empty"></div>`;
  }

  for (let d = 1; d <= daysInMonth; d++) {
    const key   = `${calYear}-${String(calMonth+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
    const appts = apptMap[key] || [];
    const isToday = today.getFullYear() === calYear &&
                    today.getMonth()    === calMonth &&
                    today.getDate()     === d;

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

  const totalCells = firstDay + daysInMonth;
  const remainder  = totalCells % 7;
  if (remainder !== 0) {
    for (let i = 0; i < 7 - remainder; i++) {
      grid.innerHTML += `<div class="cal-cell cal-empty"></div>`;
    }
  }
}

function openDayModal(key, day) {
  const MONTH_NAMES = ['January','February','March','April','May','June',
                       'July','August','September','October','November','December'];
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

document.addEventListener('keydown', e => { if (e.key === 'Escape') closeModal(); });