document.getElementById('apptDate').min = new Date().toISOString().split('T')[0];

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
['ownerName','contactNo','email','address','petName','petBreed','apptDate','apptTime','notes'].forEach(id => document.getElementById(id).value = '');
document.getElementById('submitBtn').disabled = false;
document.getElementById('btnText').textContent = 'Request Appointment →';
document.getElementById('formView').style.display = 'block';
document.getElementById('successView').classList.remove('show');
}