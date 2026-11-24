/* Authenticated HabitArc Live League & 6-character Friends Squad API.
 * Strictly verifies Firebase Auth ID tokens. Never reads or exposes private habit names,
 * tasks, notes, or email addresses — only opt-in display handle, avatar tone, and aggregate points.
 */
import { createRestFirebaseBackend } from './coach.js';

const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

function cleanHandle(value) {
  const s = String(value || '')
    .replace(/[\u0000-\u001F\u007F]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  const safe = s.includes('@') ? s.split('@')[0].trim() : s;
  return (safe.slice(0, 20) || 'Arc Runner').slice(0, 20);
}

function cleanSquadName(value) {
  const s = String(value || '')
    .replace(/[\u0000-\u001F\u007F]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  return (s.slice(0, 28) || 'Habit Squad').slice(0, 28);
}

function cleanCode(value) {
  return String(value || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6);
}

function clampInt(val, min, max) {
  const n = Math.floor(Number(val) || 0);
  return Math.max(min, Math.min(max, n));
}

function randomCode() {
  let out = '';
  for (let i = 0; i < 6; i += 1) {
    out += CODE_ALPHABET[Math.floor(Math.random() * CODE_ALPHABET.length)];
  }
  return out;
}

function sanitizeMemberRecord(uid, raw = {}, squadCodeOverride) {
  const code = cleanCode(squadCodeOverride !== undefined ? squadCodeOverride : raw.squadCode);
  return {
    uid: String(uid),
    name: cleanHandle(raw.name),
    tone: clampInt(raw.tone, 0, 7),
    weekly: clampInt(raw.weekly, 0, 50000),
    allTime: clampInt(raw.allTime, 0, 500000),
    streak: clampInt(raw.streak, 0, 3650),
    clearDays: clampInt(raw.clearDays, 0, 3650),
    squadCode: /^[A-Z0-9]{6}$/.test(code) ? code : '',
    updatedAt: new Date().toISOString(),
  };
}

function publicMemberView(docData, fallbackUid = '') {
  if (!docData || typeof docData !== 'object') return null;
  const uid = String(docData.uid || fallbackUid || '');
  if (!uid) return null;
  return {
    uid,
    name: cleanHandle(docData.name),
    tone: clampInt(docData.tone, 0, 7),
    weekly: clampInt(docData.weekly, 0, 50000),
    allTime: clampInt(docData.allTime, 0, 500000),
    streak: clampInt(docData.streak, 0, 3650),
    clearDays: clampInt(docData.clearDays, 0, 3650),
    squadCode: /^[A-Z0-9]{6}$/.test(String(docData.squadCode || '')) ? docData.squadCode : '',
    updatedAt: typeof docData.updatedAt === 'string' ? docData.updatedAt : '',
  };
}

async function openAdminLeagueDb(env = process.env) {
  const raw = String(env.FIREBASE_SERVICE_ACCOUNT_JSON || env.FIREBASE_SERVICE_ACCOUNT_BASE64 || '').trim();
  if (!raw) return null;
  const json = JSON.parse(raw.startsWith('{') ? raw : Buffer.from(raw, 'base64').toString('utf8'));
  if (!json.project_id || !json.client_email || !json.private_key) return null;
  const [{ getApps, initializeApp, cert }, { getAuth }, { getFirestore, FieldValue }] = await Promise.all([
    import('firebase-admin/app'),
    import('firebase-admin/auth'),
    import('firebase-admin/firestore'),
  ]);
  const app = getApps().find((a) => a.name === 'habitarc-league')
    || initializeApp({ credential: cert(json) }, 'habitarc-league');
  return {
    auth: getAuth(app),
    db: getFirestore(app),
    FieldValue,
  };
}

export async function executeAdminLeagueAction({ db, FieldValue, uid, action, body }) {
  const membersCol = db.collection('leagueMembers');
  const roomsCol = db.collection('leagueRooms');
  const memberRef = membersCol.doc(uid);

  if (action === 'leave-league') {
    const snap = await memberRef.get();
    const prevCode = snap.exists ? cleanCode(snap.data()?.squadCode) : '';
    if (/^[A-Z0-9]{6}$/.test(prevCode)) {
      await roomsCol.doc(prevCode).set(
        { memberUids: FieldValue.arrayRemove(uid), updatedAt: new Date().toISOString(), _updatedAt: FieldValue.serverTimestamp() },
        { merge: true },
      ).catch(() => {});
    }
    await memberRef.delete();
    return { globalMembers: [], squadMembers: [], squad: null };
  }

  let squadCode = cleanCode(body?.squadCode ?? body?.member?.squadCode);
  let squadInfo = null;

  if (action === 'create-squad') {
    const squadName = cleanSquadName(body?.squadName);
    let generated = '';
    for (let attempt = 0; attempt < 6; attempt += 1) {
      const candidate = randomCode();
      const existing = await roomsCol.doc(candidate).get();
      if (!existing.exists) {
        generated = candidate;
        break;
      }
    }
    if (!generated) throw Object.assign(new Error('Could not generate a unique squad code. Try again.'), { status: 503, code: 'squad-code-busy' });
    squadCode = generated;
    const nowIso = new Date().toISOString();
    await roomsCol.doc(squadCode).set({
      code: squadCode,
      name: squadName,
      createdBy: uid,
      memberUids: [uid],
      updatedAt: nowIso,
      _updatedAt: FieldValue.serverTimestamp(),
    });
    squadInfo = { code: squadCode, name: squadName, memberCount: 1 };
  } else if (action === 'join-squad') {
    const code = cleanCode(body?.code || body?.squadCode);
    if (!/^[A-Z0-9]{6}$/.test(code)) {
      throw Object.assign(new Error('Enter a valid 6-character squad invite code.'), { status: 400, code: 'invalid-squad-code' });
    }
    const roomRef = roomsCol.doc(code);
    const roomSnap = await roomRef.get();
    if (!roomSnap.exists) {
      throw Object.assign(new Error(`No squad found with code ${code}. Double-check the code with your friend.`), { status: 404, code: 'squad-not-found' });
    }
    const roomData = roomSnap.data() || {};
    const currentUids = Array.isArray(roomData.memberUids) ? roomData.memberUids : [];
    if (!currentUids.includes(uid) && currentUids.length >= 30) {
      throw Object.assign(new Error('This squad is full (30 members max).'), { status: 400, code: 'squad-full' });
    }
    await roomRef.set(
      { memberUids: FieldValue.arrayUnion(uid), updatedAt: new Date().toISOString(), _updatedAt: FieldValue.serverTimestamp() },
      { merge: true },
    );
    squadCode = code;
    squadInfo = { code, name: cleanSquadName(roomData.name), memberCount: new Set([...currentUids, uid]).size };
  } else if (action === 'leave-squad') {
    const prevCode = cleanCode(body?.code || body?.squadCode || body?.member?.squadCode);
    if (/^[A-Z0-9]{6}$/.test(prevCode)) {
      await roomsCol.doc(prevCode).set(
        { memberUids: FieldValue.arrayRemove(uid), updatedAt: new Date().toISOString(), _updatedAt: FieldValue.serverTimestamp() },
        { merge: true },
      ).catch(() => {});
    }
    squadCode = '';
  }

  const record = sanitizeMemberRecord(uid, body?.member || {}, squadCode);
  await memberRef.set({ ...record, _updatedAt: FieldValue.serverTimestamp() }, { merge: true });

  const [weeklySnap, allTimeSnap] = await Promise.all([
    membersCol.orderBy('weekly', 'desc').limit(50).get(),
    membersCol.orderBy('allTime', 'desc').limit(50).get(),
  ]);
  const mergedGlobal = new Map();
  for (const snap of [weeklySnap, allTimeSnap]) {
    for (const docSnap of snap.docs) {
      const m = publicMemberView(docSnap.data(), docSnap.id);
      if (m) mergedGlobal.set(m.uid, m);
    }
  }
  mergedGlobal.set(uid, publicMemberView(record, uid));

  let squadMembers = [];
  if (/^[A-Z0-9]{6}$/.test(record.squadCode)) {
    const roomSnap = await roomsCol.doc(record.squadCode).get();
    if (roomSnap.exists) {
      const roomData = roomSnap.data() || {};
      const uids = Array.from(new Set([...(Array.isArray(roomData.memberUids) ? roomData.memberUids : []), uid])).slice(0, 30);
      const memberDocs = await Promise.all(uids.map((memberUid) => membersCol.doc(String(memberUid)).get()));
      squadMembers = memberDocs
        .filter((d) => d.exists)
        .map((d) => publicMemberView(d.data(), d.id))
        .filter(Boolean);
      if (!squadMembers.some((m) => m.uid === uid)) squadMembers.push(publicMemberView(record, uid));
      squadInfo = {
        code: record.squadCode,
        name: cleanSquadName(roomData.name),
        memberCount: squadMembers.length,
      };
    }
  }

  return {
    globalMembers: Array.from(mergedGlobal.values()),
    squadMembers,
    squad: squadInfo,
  };
}

let sharedRestAuth = null;
function getRestVerifier() {
  sharedRestAuth ||= createRestFirebaseBackend();
  return sharedRestAuth;
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'method-not-allowed', message: 'Use POST.' });
  }

  const authHeader = String(req.headers?.authorization || '');
  const match = /^Bearer\s+(.+)$/i.exec(authHeader);
  if (!match) {
    return res.status(401).json({ error: 'missing-auth', message: 'Sign in to access HabitArc League.' });
  }
  const idToken = match[1].trim();

  let body = req.body;
  if (typeof body === 'string') {
    try { body = JSON.parse(body); } catch { return res.status(400).json({ error: 'invalid-json', message: 'Invalid JSON request.' }); }
  }
  body = body && typeof body === 'object' ? body : {};
  const action = String(body.action || 'sync');
  if (!['sync', 'create-squad', 'join-squad', 'leave-squad', 'leave-league'].includes(action)) {
    return res.status(400).json({ error: 'invalid-action', message: 'Unsupported league action.' });
  }

  try {
    const adminBackend = await openAdminLeagueDb();
    if (!adminBackend) {
      // Verify token so unauthorized callers still receive 401; tell client to use direct Firestore SDK.
      await getRestVerifier().auth.verifyIdToken(idToken);
      return res.status(503).json({
        error: 'admin-not-configured',
        message: 'Using direct Firestore league sync.',
      });
    }

    const decoded = await adminBackend.auth.verifyIdToken(idToken);
    const result = await executeAdminLeagueAction({
      db: adminBackend.db,
      FieldValue: adminBackend.FieldValue,
      uid: decoded.uid,
      action,
      body,
    });
    return res.status(200).json({ ok: true, ...result });
  } catch (error) {
    const code = String(error?.code || '');
    if (code.startsWith('auth/')) {
      return res.status(401).json({ error: code, message: 'Your session expired. Sign in again to sync League.' });
    }
    const status = Number(error?.status) || 500;
    return res.status(status).json({
      error: code || 'league-error',
      message: status < 500 ? error.message : 'League sync is temporarily unavailable.',
    });
  }
}
