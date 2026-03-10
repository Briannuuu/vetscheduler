// ── AUDIT LOGGER ──
// Shared utility. Include AFTER firebase-config.js in admin.html and doctor.html.
// Usage: logAudit('ACTION_TYPE', { ...details })

async function logAudit(action, details = {}) {
  try {
    const user = auth.currentUser;
    if (!user) return;

    // Get actor name from Firestore users collection (cached to avoid repeated reads)
    let actorName = window._auditActorName || null;
    if (!actorName) {
      try {
        const snap = await db.collection('users').doc(user.uid).get();
        actorName = snap.exists ? (snap.data().name || user.email) : user.email;
        window._auditActorName = actorName;
      } catch { actorName = user.email; }
    }

    await db.collection('auditLogs').add({
      action,
      actorUid:   user.uid,
      actorEmail: user.email,
      actorName,
      timestamp:  firebase.firestore.FieldValue.serverTimestamp(),
      details,
      portal: details._portal || 'unknown'
    });
  } catch (e) {
    // Never crash the UI for a failed audit log
    console.warn('Audit log failed:', e.message);
  }
}