document.getElementById('apptDate').min = new Date().toISOString().split('T')[0];
// Snap time input to nearest 30-min slot on every change
(function() {
  const timeInput = document.getElementById('apptTime');
  timeInput.addEventListener('change', function() {
    if (!this.value) return;
    const [h, m] = this.value.split(':').map(Number);
    // Round to nearest 30: 0-14 → :00, 15-44 → :30, 45-59 → next hour :00
    let snappedH = h, snappedM;
    if (m < 15) {
      snappedM = 0;
    } else if (m < 45) {
      snappedM = 30;
    } else {
      snappedM = 0;
      snappedH = h + 1;
    }
    // Enforce clinic hours 07:00 – 18:00
    if (snappedH < 7)  { snappedH = 7;  snappedM = 0; }
    if (snappedH > 18 || (snappedH === 18 && snappedM > 0)) { snappedH = 18; snappedM = 0; }
    this.value = `${String(snappedH).padStart(2,'0')}:${String(snappedM).padStart(2,'0')}`;
  });
})();


function showError(msg) {
const el = document.getElementById('errorBar');
el.textContent = msg; el.style.display = 'block';
el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}
function clearError() { document.getElementById('errorBar').style.display = 'none'; }

function formatDate(dateStr) {
const d = new Date(dateStr + 'T00:00:00');
return d.toLocaleDateString('en-PH', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
}
function formatTime(t) {
const [h, m] = t.split(':'); const hr = parseInt(h);
return `${hr > 12 ? hr - 12 : hr || 12}:${m} ${hr >= 12 ? 'PM' : 'AM'}`;
}

async function submitRequest() {
clearError();
const ownerName = document.getElementById('ownerName').value.trim();
const contactNo = document.getElementById('contactNo').value.trim();
const email     = document.getElementById('email').value.trim();
const petName   = document.getElementById('petName').value.trim();
const petBreed  = document.getElementById('petBreed').value.trim();
const apptDate  = document.getElementById('apptDate').value;
const apptTime  = document.getElementById('apptTime').value;
const address   = document.getElementById('address').value.trim();
const notes     = document.getElementById('notes').value.trim();
const preferredDoctor = document.getElementById('preferredDoctor').value.trim();

if (!ownerName) return showError('Please enter the owner name.');
if (!contactNo) return showError('Please enter a contact number.');
if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return showError('Please enter a valid email address.');
if (!address)   return showError('Please enter your address.');
if (!petName)   return showError("Please enter your pet's name.");
if (!apptDate)  return showError('Please select a preferred date.');
if (!apptTime)  return showError('Please select a preferred time.');

const btn = document.getElementById('submitBtn');
btn.disabled = true;
document.getElementById('btnText').textContent = 'Submitting…';

try {
    await db.collection('appointments').add({
    ownerName, contactNo, email, address, petName, petBreed,
    date: firebase.firestore.Timestamp.fromDate(new Date(apptDate + 'T' + apptTime)),
    dateStr: apptDate,
    time: formatTime(apptTime),
    notes,
    preferredDoctor,
    status: 'pending',
    createdAt: firebase.firestore.FieldValue.serverTimestamp()
    });

    document.getElementById('successDetails').innerHTML = `
    <div class="row"><span>Owner</span><span>${ownerName}</span></div>
    <div class="row"><span>Address</span><span>${address}</span></div>
    <div class="row"><span>Pet</span><span>${petName}${petBreed ? ' (' + petBreed + ')' : ''}</span></div>
    <div class="row"><span>Date</span><span>${formatDate(apptDate)}</span></div>
    <div class="row"><span>Time</span><span>${formatTime(apptTime)}</span></div>
    <div class="row"><span>Contact</span><span>${contactNo}</span></div>
    ${preferredDoctor ? `<div class="row"><span>Preferred Doctor</span><span>${preferredDoctor}</span></div>` : ''}
    <div class="row"><span>Status</span><span style="color:#0d7377;font-weight:700">⏳ Pending Review</span></div>
    `;
    document.getElementById('formView').style.display = 'none';
    document.getElementById('successView').classList.add('show');
} catch (err) {
    showError('Failed to submit: ' + err.message);
    btn.disabled = false;
    document.getElementById('btnText').textContent = 'Request Appointment →';
}
}

function resetForm() {
['ownerName','contactNo','email','address','petName','petBreed','apptDate','apptTime','notes','preferredDoctor'].forEach(id => document.getElementById(id).value = '');
document.getElementById('submitBtn').disabled = false;
document.getElementById('btnText').textContent = 'Request Appointment →';
document.getElementById('formView').style.display = 'block';
document.getElementById('successView').classList.remove('show');
}