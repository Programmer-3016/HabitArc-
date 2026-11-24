/* Authenticated HabitArc Self-Service Account & Cloud Data Deletion API.
 * Verifies the caller's Firebase ID token and permanently deletes all cloud records
 * owned by that UID (Firestore user profile + subcollections, League/Squad membership,
 * Storage note attachments, and Firebase Authentication account when Admin credentials exist).
 */
import { createRestFirebaseBackend } from './coach.js';

const DEFAULT_FIREBASE_PROJECT_ID = 'habitarc-dfa40';
const DEFAULT_FIREBASE_WEB_API_KEY = 'AIzaSyCjsz72IRvCX0sb8IxfSILCkAI0915iBi8';
const USER_SUBCOLLECTIONS = [
  'habits',
  'habitCompletions',
  'tasks',
  'notes',
  'focusSessions',
  'pushDevices',
  'coachUsage',
];

async function openAdminDeleteClients(env = process.env) {
  const raw = String(env.FIREBASE_SERVICE_ACCOUNT_JSON || env.FIREBASE_SERVICE_ACCOUNT_BASE64 || '').trim();
  if (!raw) return null;
  const json = JSON.parse(raw.startsWith('{') ? raw : Buffer.from(raw, 'base64').toString('utf8'));
  if (!json.project_id || !json.client_email || !json.private_key) return null;
  const [
    { getApps, initializeApp, cert },
    { getAuth },
    { getFirestore },
    storageMod,
  ] = await Promise.all([
    import('firebase-admin/app'),
    import('firebase-admin/auth'),
    import('firebase-admin/firestore'),
    import('firebase-admin/storage').catch(() => null),
  ]);
  const storageBucket = env.FIREBASE_STORAGE_BUCKET || `${json.project_id}.firebasestorage.app`;
  const app = getApps().find((a) => a.name === 'habitarc-account-delete')
    || initializeApp({ credential: cert(json), storageBucket }, 'habitarc-account-delete');
  return {
    auth: getAuth(app),
    db: getFirestore(app),
    storage: storageMod?.getStorage ? storageMod.getStorage(app) : null,
    storageBucket,
  };
}

async function deleteCollectionBatch(db, colRef) {
  let deleted = 0;
  while (true) {
    const snap = await colRef.limit(200).get();
    if (snap.empty) break;
    const batch = db.batch();
    snap.docs.forEach((docSnap) => batch.delete(docSnap.ref));
    await batch.commit();
    deleted += snap.size;
    if (snap.size < 200) break;
  }
  return deleted;
}

export async function executeAdminAccountDeletion({ auth, db, storage, storageBucket, uid }) {
  // 1. Clean up opt-in League & Squad membership
  const memberRef = db.collection('leagueMembers').doc(uid);
  const memberSnap = await memberRef.get();
  if (memberSnap.exists) {
    const memberData = memberSnap.data() || {};
    const squadCode = String(memberData.squadCode || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6);
    if (/^[A-Z0-9]{6}$/.test(squadCode)) {
      const roomRef = db.collection('leagueRooms').doc(squadCode);
      const roomSnap = await roomRef.get();
      if (roomSnap.exists) {
        const roomData = roomSnap.data() || {};
        const nextUids = (Array.isArray(roomData.memberUids) ? roomData.memberUids : []).filter((id) => id !== uid);
        await roomRef.set({ ...roomData, memberUids: nextUids, updatedAt: new Date().toISOString() }, { merge: true });
      }
    }
    await memberRef.delete();
  }

  // 2. Delete Storage note attachments best-effort
  if (storage && storageBucket) {
    try {
      await storage.bucket(storageBucket).deleteFiles({ prefix: `users/${uid}/` });
    } catch { /* Bucket or prefix optional */ }
  }

  // 3. Delete all user subcollections + root user document
  const userRef = db.collection('users').doc(uid);
  for (const subName of USER_SUBCOLLECTIONS) {
    await deleteCollectionBatch(db, userRef.collection(subName));
  }
  await userRef.delete();

  // 4. Delete Firebase Authentication account
  try {
    await auth.deleteUser(uid);
  } catch (err) {
    if (err?.code !== 'auth/user-not-found') throw err;
  }

  return { deleted: true, mode: 'admin', uid };
}

async function deleteRestPath(baseDocsUrl, relPath, idToken, fetchImpl) {
  const res = await fetchImpl(`${baseDocsUrl}/${relPath}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${idToken}` },
  });
  return res.ok || res.status === 404;
}

async function deleteRestSubcollection(baseDocsUrl, uid, subName, idToken, fetchImpl) {
  const listRes = await fetchImpl(`${baseDocsUrl}/users/${encodeURIComponent(uid)}/${subName}?pageSize=200`, {
    headers: { Authorization: `Bearer ${idToken}` },
  });
  if (!listRes.ok) return;
  const payload = await listRes.json().catch(() => ({}));
  const docs = Array.isArray(payload?.documents) ? payload.documents : [];
  await Promise.all(
    docs.map((d) => {
      const fullName = String(d?.name || '');
      const marker = '/documents/';
      const idx = fullName.indexOf(marker);
      if (idx === -1) return Promise.resolve();
      return deleteRestPath(baseDocsUrl, fullName.slice(idx + marker.length), idToken, fetchImpl);
    }),
  );
}

export async function executeRestAccountDeletion({ idToken, uid, deleteAuthOnServer = false, env = process.env, fetchImpl = fetch }) {
  const projectId = env.FIREBASE_PROJECT_ID || DEFAULT_FIREBASE_PROJECT_ID;
  const apiKey = env.FIREBASE_WEB_API_KEY || DEFAULT_FIREBASE_WEB_API_KEY;
  const baseDocsUrl = `https://firestore.googleapis.com/v1/projects/${encodeURIComponent(projectId)}/databases/(default)/documents`;

  await deleteRestPath(baseDocsUrl, `leagueMembers/${encodeURIComponent(uid)}`, idToken, fetchImpl).catch(() => {});
  for (const subName of ['habits', 'habitCompletions', 'tasks', 'notes', 'focusSessions', 'pushDevices']) {
    await deleteRestSubcollection(baseDocsUrl, uid, subName, idToken, fetchImpl).catch(() => {});
  }
  await deleteRestPath(baseDocsUrl, `users/${encodeURIComponent(uid)}`, idToken, fetchImpl).catch(() => {});

  if (deleteAuthOnServer) {
    const authRes = await fetchImpl(
      `https://identitytoolkit.googleapis.com/v1/accounts:delete?key=${encodeURIComponent(apiKey)}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ idToken }),
      },
    );
    if (!authRes.ok) {
      const errBody = await authRes.json().catch(() => ({}));
      const rawMsg = String(errBody?.error?.message || '');
      if (/CREDENTIAL_TOO_OLD_LOGIN_AGAIN/i.test(rawMsg)) {
        const err = new Error('For security, please sign out and sign in once again before deleting your account.');
        err.status = 409;
        err.code = 'auth/requires-recent-login';
        throw err;
      }
      if (!/USER_NOT_FOUND/i.test(rawMsg)) {
        const err = new Error('Could not complete Firebase Authentication account removal.');
        err.status = 502;
        err.code = 'auth-delete-failed';
        throw err;
      }
    }
    return { deleted: true, mode: 'rest-full', uid };
  }

  return { deleted: true, mode: 'rest', uid };
}

function readJsonBody(req) {
  if (req.body && typeof req.body === 'object') return Promise.resolve(req.body);
  if (typeof req.body === 'string' && req.body.trim()) {
    return Promise.resolve(JSON.parse(req.body));
  }
  return new Promise((resolve, reject) => {
    let raw = '';
    req.on?.('data', (chunk) => {
      raw += chunk;
      if (raw.length > 8192) reject(new Error('Payload too large'));
    });
    req.on?.('end', () => {
      try { resolve(raw ? JSON.parse(raw) : {}); } catch (e) { reject(e); }
    });
    req.on?.('error', reject);
  });
}

export default async function handler(req, res) {
  res.setHeader?.('Cache-Control', 'no-store');
  if (req.method !== 'POST') {
    return res.status(405).json({ ok: false, error: { code: 'method-not-allowed', message: 'Use POST.' } });
  }

  const authHeader = String(req.headers?.authorization || '');
  const idToken = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : '';
  if (!idToken) {
    return res.status(401).json({ ok: false, error: { code: 'unauthenticated', message: 'Sign in to delete your account.' } });
  }

  let body = {};
  try {
    body = await readJsonBody(req);
  } catch {
    return res.status(400).json({ ok: false, error: { code: 'invalid-json', message: 'Invalid JSON request body.' } });
  }

  if (String(body.confirm || '').trim() !== 'DELETE') {
    return res.status(400).json({
      ok: false,
      error: { code: 'confirmation-required', message: 'Type DELETE to confirm permanent account deletion.' },
    });
  }

  try {
    const adminClients = await openAdminDeleteClients();
    if (adminClients) {
      const decoded = await adminClients.auth.verifyIdToken(idToken, true);
      const result = await executeAdminAccountDeletion({ ...adminClients, uid: decoded.uid });
      return res.status(200).json({ ok: true, ...result });
    }

    const restBackend = createRestFirebaseBackend();
    const decoded = await restBackend.auth.verifyIdToken(idToken);
    const result = await executeRestAccountDeletion({
      idToken,
      uid: decoded.uid,
      deleteAuthOnServer: Boolean(body.deleteAuthOnServer),
    });
    return res.status(200).json({ ok: true, ...result });
  } catch (error) {
    const code = String(error?.code || '');
    if (code.startsWith('auth/') && code !== 'auth/requires-recent-login') {
      return res.status(401).json({ ok: false, error: { code: 'unauthenticated', message: 'Session expired. Sign in again to continue.' } });
    }
    const status = Number.isInteger(error?.status) ? error.status : 500;
    return res.status(status).json({
      ok: false,
      error: {
        code: error?.code || 'delete-failed',
        message: error?.message || 'Account deletion could not be completed right now.',
      },
    });
  }
}
