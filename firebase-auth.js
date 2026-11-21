const productionAuthDomain = 'habit-arc.vercel.app';
const firebaseConfig = {
    apiKey: 'AIzaSyCjsz72IRvCX0sb8IxfSILCkAI0915iBi8',
    // Vercel proxies Firebase's redirect helper under this same production
    // domain. Local and preview environments keep Firebase's default domain.
    authDomain: window.location.hostname === productionAuthDomain
        ? productionAuthDomain
        : 'habitarc-dfa40.firebaseapp.com',
    projectId: 'habitarc-dfa40',
    storageBucket: 'habitarc-dfa40.firebasestorage.app',
    messagingSenderId: '580827993891',
    appId: '1:580827993891:web:7523d9ec6f3535d3cede96',
    measurementId: 'G-BB8DRFSJEL'
};

function getAuthErrorMessage(error) {
    const messages = {
        'auth/email-already-in-use': 'An account already exists with this email. Try logging in instead.',
        'auth/invalid-credential': 'Email or password is incorrect. Please try again.',
        'auth/invalid-email': 'Enter a valid email address.',
        'auth/missing-password': 'Enter your password to continue.',
        'auth/weak-password': 'Use a password with at least 6 characters.',
        'auth/popup-blocked': 'Allow pop-ups for HabitArc, then try Google sign-in again.',
        'auth/popup-closed-by-user': 'Google sign-in was cancelled. Please try again.',
        'auth/redirect-cancelled-by-user': 'Google sign-in was cancelled. Please try again.',
        'auth/redirect-operation-pending': 'Google sign-in is already in progress. Please finish or cancel it first.',
        'auth/unauthorized-domain': 'This domain is not authorized for Google sign-in yet.',
        'auth/operation-not-allowed': 'This sign-in method is not enabled yet. Please contact HabitArc support.',
        'auth/network-request-failed': 'Check your internet connection and try again.',
        'auth/too-many-requests': 'Too many attempts. Please wait a moment and try again.'
    };

    return messages[error?.code] || 'We could not sign you in. Please try again.';
}

window.HabitArcAuthReady = (async () => {
    try {
        const { initializeApp } = await import('https://www.gstatic.com/firebasejs/12.16.0/firebase-app.js');
        const {
            GoogleAuthProvider,
            browserLocalPersistence,
            createUserWithEmailAndPassword,
            getAuth,
            getRedirectResult,
            onAuthStateChanged,
            setPersistence,
            signOut,
            signInAnonymously,
            signInWithEmailAndPassword,
            signInWithRedirect,
            updateProfile
        } = await import('https://www.gstatic.com/firebasejs/12.16.0/firebase-auth.js');
        const {
            collection,
            doc,
            getDoc,
            getDocs,
            getFirestore,
            onSnapshot,
            serverTimestamp,
            writeBatch
        } = await import('https://www.gstatic.com/firebasejs/12.16.0/firebase-firestore.js');

        const app = initializeApp(firebaseConfig);
        const auth = getAuth(app);
        const firestore = getFirestore(app);
        // Do not load Storage on app startup: it is optional and can require billing.
        let storagePromise = null;
        function storageClient() {
            if (!storagePromise) storagePromise = import('https://www.gstatic.com/firebasejs/12.16.0/firebase-storage.js')
                .then(api => ({ api, storage: api.getStorage(app) }))
                .catch(error => { storagePromise = null; throw error; });
            return storagePromise;
        }
        const googleProvider = new GoogleAuthProvider();

        googleProvider.setCustomParameters({ prompt: 'select_account' });
        await setPersistence(auth, browserLocalPersistence);

        // Keep one shared result promise so the onboarding UI can safely
        // resume a completed mobile redirect after this page reloads.
        const googleRedirectResult = getRedirectResult(auth)
            .then((result) => ({ user: result?.user || null, error: null }))
            .catch((error) => ({ user: null, error }));

        let currentUser = null;
        let initialAuthStateResolved = false;
        let resolveInitialAuthState;
        const authStateListeners = new Set();
        const initialAuthState = new Promise((resolve) => {
            resolveInitialAuthState = resolve;
        });

        function toPublicUser(user) {
            if (!user) return null;
            return {
                uid: user.uid,
                displayName: user.displayName || '',
                email: user.email || '',
                photoURL: user.photoURL || '',
                isAnonymous: Boolean(user.isAnonymous)
            };
        }

        function cloneData(data) {
            return JSON.parse(JSON.stringify(data || {}));
        }

        function userDocument(user) {
            return doc(firestore, 'users', user.uid);
        }

        function habitsCollection(user) {
            return collection(userDocument(user), 'habits');
        }

        function completionHistoryCollection(user) {
            return collection(userDocument(user), 'habitCompletions');
        }

        function tasksCollection(user) {
            return collection(userDocument(user), 'tasks');
        }
        function notesCollection(user) {
            return collection(userDocument(user), 'notes');
        }
        function focusCollection(user) {
            return collection(userDocument(user), 'focusSessions');
        }
        async function noteMediaRef(user, noteId, kind) {
            if (!noteId || typeof noteId !== 'string' || noteId.includes('/')) {
                throw new Error('Invalid note ID.');
            }
            if (kind !== 'photo' && kind !== 'audio') throw new Error('Invalid note media type.');
            const { api, storage } = await storageClient();
            return { api, target: api.ref(storage, `users/${user.uid}/notes/${noteId}/${kind}`) };
        }
        function plainNote(docData, fallbackId) {
            const { _updatedAt, ...note } = docData || {};
            return {
                id: note.id || fallbackId,
                title: typeof note.title === 'string' ? note.title : '',
                body: typeof note.body === 'string' ? note.body : '',
                date: typeof note.date === 'string' ? note.date : '',
                pinned: Boolean(note.pinned),
                color: typeof note.color === 'string' ? note.color : 'lavender',
                createdAt: note.createdAt || '',
                updatedAt: note.updatedAt || '',
                deleted: Boolean(note.deleted),
                hasPhoto: Boolean(note.hasPhoto),
                hasAudio: Boolean(note.hasAudio)
            };
        }
        async function saveNoteCloud(note, user = currentUser) {
            if (!user) throw new Error('Sign in to sync notes.');
            if (!note?.id || typeof note.title !== 'string') throw new Error('Invalid note.');
            let mediaError = null;
            let hasPhoto = Boolean(note.cloudHasPhoto);
            let hasAudio = Boolean(note.cloudHasAudio);
            if (note.photo) {
                if (note.photo.size > 5 * 1024 * 1024 || !note.photo.type.startsWith('image/')) throw new Error('Photo must be an image under 5 MB.');
                try {
                    const { api, target } = await noteMediaRef(user, note.id, 'photo');
                    await api.uploadBytes(target, note.photo, { contentType: note.photo.type });
                    hasPhoto = true;
                } catch (error) { mediaError = error; }
            }
            if (note.audio) {
                if (note.audio.size > 8 * 1024 * 1024 || !note.audio.type.startsWith('audio/')) throw new Error('Audio must be under 8 MB.');
                try {
                    const { api, target } = await noteMediaRef(user, note.id, 'audio');
                    await api.uploadBytes(target, note.audio, { contentType: note.audio.type });
                    hasAudio = true;
                } catch (error) { mediaError = error; }
            }
            const data = plainNote({
                ...note, deleted: false, hasPhoto, hasAudio
            }, note.id);
            const batch = writeBatch(firestore);
            batch.set(doc(notesCollection(user), note.id), {
                ...data, _updatedAt: serverTimestamp()
            });
            await batch.commit();
            if (mediaError) {
                // The text metadata has synced; keep the local media retry pending.
                throw Object.assign(new Error('Media upload unavailable; text backed up.'), {
                    code: mediaError.code || 'storage/unavailable',
                });
            }
        }
        async function deleteNoteCloud(noteId, updatedAt, user = currentUser) {
            if (!user) throw new Error('Sign in to sync notes.');
            const batch = writeBatch(firestore);
            batch.set(doc(notesCollection(user), noteId), {
                id: noteId, title: '', body: '', date: '', pinned: false, color: 'lavender',
                createdAt: updatedAt, updatedAt, deleted: true, hasPhoto: false, hasAudio: false,
                _updatedAt: serverTimestamp()
            });
            await batch.commit();
            // Metadata tombstone is authoritative even when media cleanup is blocked.
            await Promise.allSettled(['photo', 'audio'].map(async kind => {
                const { api, target } = await noteMediaRef(user, noteId, kind);
                return api.deleteObject(target);
            }));
        }
        async function getNoteMedia(noteId, kind, user = currentUser) {
            if (!user) throw new Error('Sign in to download media.');
            const { api, target } = await noteMediaRef(user, noteId, kind);
            return api.getBlob(target, kind === 'photo' ? 5 * 1024 * 1024 : 8 * 1024 * 1024);
        }
        function subscribeNotes(onChange, onError, user = currentUser) {
            if (!user) return () => {};
            return onSnapshot(notesCollection(user), snapshot => {
                onChange(snapshot.docs.map(entry => plainNote(entry.data(), entry.id)), {
                    fromCache: snapshot.metadata.fromCache
                });
            }, onError);
        }
        async function saveFocusSession(record, user = currentUser) {
            if (!user) throw new Error('Sign in to sync focus history.');
            if (!record?.id || !record?.date || !Number.isFinite(record.minutes)) throw new Error('Invalid focus session.');
            const batch = writeBatch(firestore);
            batch.set(doc(focusCollection(user), record.id), {
                id: String(record.id), date: record.date, minutes: record.minutes,
                taskId: record.taskId || '', completedAt: record.completedAt,
                _updatedAt: serverTimestamp()
            });
            await batch.commit();
        }
        function subscribeFocusSessions(onChange, onError, user = currentUser) {
            if (!user) return () => {};
            return onSnapshot(focusCollection(user), snapshot => {
                onChange(snapshot.docs.map(entry => {
                    const { _updatedAt, ...value } = entry.data();
                    return { ...value, id: entry.id };
                }), { fromCache: snapshot.metadata.fromCache });
            }, onError);
        }

        function stripCloudTask(task, fallbackId) {
            const { _updatedAt, ...plain } = task || {};
            return { ...cloneData(plain), id: plain.id || fallbackId };
        }

        async function saveTask(task, user = currentUser) {
            if (!user) throw new Error('Sign in to sync tasks.');
            if (!task || typeof task.id !== 'string' || !task.id) {
                throw new Error('A task ID is required.');
            }
            const batch = writeBatch(firestore);
            batch.set(doc(tasksCollection(user), task.id), {
                ...stripCloudTask(task, task.id),
                _updatedAt: serverTimestamp()
            });
            await batch.commit();
        }

        async function deleteTask(taskId, user = currentUser) {
            if (!user) throw new Error('Sign in to sync tasks.');
            if (!taskId || typeof taskId !== 'string') throw new Error('A task ID is required.');
            const batch = writeBatch(firestore);
            batch.delete(doc(tasksCollection(user), taskId));
            await batch.commit();
        }

        function subscribeTasks(onChange, onError, user = currentUser) {
            if (!user) return () => {};
            return onSnapshot(tasksCollection(user), (snapshot) => {
                const tasks = snapshot.docs.map((entry) => stripCloudTask(entry.data(), entry.id));
                onChange(tasks, { fromCache: snapshot.metadata.fromCache });
            }, onError);
        }

        function stripCloudMetadata(habit, fallbackId) {
            const { _updatedAt, ...plainHabit } = habit || {};
            return {
                ...cloneData(plainHabit),
                id: plainHabit?.id || fallbackId
            };
        }

        function stripCloudCompletionHistory(record) {
            const { _updatedAt, ...plainRecord } = record || {};
            const habitId = typeof plainRecord?.habitId === 'string' ? plainRecord.habitId : '';
            const date = typeof plainRecord?.date === 'string' ? plainRecord.date : '';
            if (!habitId || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;

            const status = plainRecord.status === 'completed' ? 'completed' : 'not_completed';
            const completedAt = status === 'completed' && typeof plainRecord.completedAt === 'string'
                ? plainRecord.completedAt
                : null;
            const updatedAt = typeof plainRecord.updatedAt === 'string' && plainRecord.updatedAt
                ? plainRecord.updatedAt
                : completedAt || `${date}T12:00:00.000Z`;

            return {
                id: `${habitId}_${date}`,
                habitId,
                date,
                status,
                completedAt,
                updatedAt
            };
        }

        function completionHistoryFromSnapshot(snapshot) {
            return snapshot.docs.reduce((history, completionSnapshot) => {
                const record = stripCloudCompletionHistory(completionSnapshot.data());
                if (record) history[record.id] = record;
                return history;
            }, {});
        }

        function notifyAuthState(user) {
            authStateListeners.forEach((listener) => {
                try {
                    listener(user);
                } catch (error) {
                    console.error('HabitArc: auth state listener failed.', error);
                }
            });
        }

        onAuthStateChanged(auth, (user) => {
            currentUser = user;

            try {
                if (user) {
                    localStorage.setItem('habitarc_active_uid', user.uid);
                } else {
                    localStorage.removeItem('habitarc_active_uid');
                }
            } catch {
                // The app still works when browser storage is unavailable.
            }

            if (!initialAuthStateResolved) {
                initialAuthStateResolved = true;
                resolveInitialAuthState(user);
            }

            notifyAuthState(user);
            window.dispatchEvent(new CustomEvent('habitarc-auth-state-changed', {
                detail: { user: toPublicUser(user) }
            }));
        });

        async function loadUserData(user = currentUser) {
            if (!user) {
                throw Object.assign(new Error('No signed-in user.'), { code: 'auth/no-current-user' });
            }

            const [profileSnapshot, habitsSnapshot, completionHistorySnapshot] = await Promise.all([
                getDoc(userDocument(user)),
                getDocs(habitsCollection(user)),
                getDocs(completionHistoryCollection(user))
            ]);
            const profileData = profileSnapshot.exists() ? profileSnapshot.data() : {};
            const habits = habitsSnapshot.docs.map((habitSnapshot) =>
                stripCloudMetadata(habitSnapshot.data(), habitSnapshot.id)
            );
            const completionHistory = completionHistoryFromSnapshot(completionHistorySnapshot);

            return {
                exists: profileSnapshot.exists() || habits.length > 0 || Object.keys(completionHistory).length > 0,
                profile: cloneData(profileData.profile || {}),
                data: {
                    habits,
                    completionHistory,
                    settings: cloneData(profileData.settings || {}),
                    onboardingComplete: Boolean(profileData.onboardingComplete)
                }
            };
        }

        async function saveUserData(data, user = currentUser) {
            if (!user) {
                throw Object.assign(new Error('No signed-in user.'), { code: 'auth/no-current-user' });
            }

            const safeData = cloneData(data);
            const safeHabits = Array.isArray(safeData.habits) ? safeData.habits : [];
            const userRef = userDocument(user);
            const existingHabits = await getDocs(habitsCollection(user));
            const incomingHabitIds = new Set();
            const batch = writeBatch(firestore);

            batch.set(userRef, {
                schemaVersion: 2,
                profile: toPublicUser(user),
                settings: safeData.settings || {},
                onboardingComplete: Boolean(safeData.onboardingComplete),
                updatedAt: serverTimestamp()
            }, { merge: true });

            safeHabits.forEach((habit) => {
                if (!habit?.id) return;
                incomingHabitIds.add(habit.id);
                batch.set(doc(userRef, 'habits', habit.id), {
                    ...stripCloudMetadata(habit, habit.id),
                    _updatedAt: serverTimestamp()
                });
            });

            existingHabits.docs.forEach((habitSnapshot) => {
                if (!incomingHabitIds.has(habitSnapshot.id)) {
                    batch.delete(habitSnapshot.ref);
                }
            });

            await batch.commit();
        }

        async function saveCompletionHistory({ upserts = [], deletions = [] } = {}, user = currentUser) {
            if (!user) {
                throw Object.assign(new Error('No signed-in user.'), { code: 'auth/no-current-user' });
            }

            const upsertsById = new Map();
            (Array.isArray(upserts) ? upserts : []).forEach((rawRecord) => {
                const record = stripCloudCompletionHistory(rawRecord);
                if (record) upsertsById.set(record.id, record);
            });
            const deletionIds = [...new Set(Array.isArray(deletions) ? deletions : [])]
                .filter((recordId) => typeof recordId === 'string' && !upsertsById.has(recordId));
            const operations = [
                ...[...upsertsById.values()].map((record) => ({ type: 'upsert', record })),
                ...deletionIds.map((recordId) => ({ type: 'delete', recordId }))
            ];

            // Firestore permits at most 500 writes per batch. A user can own
            // years of daily history, so migrations are committed in chunks.
            const batchSize = 450;
            for (let index = 0; index < operations.length; index += batchSize) {
                const batch = writeBatch(firestore);
                operations.slice(index, index + batchSize).forEach((operation) => {
                    if (operation.type === 'delete') {
                        batch.delete(doc(userDocument(user), 'habitCompletions', operation.recordId));
                        return;
                    }

                    batch.set(
                        doc(userDocument(user), 'habitCompletions', operation.record.id),
                        {
                            ...operation.record,
                            _updatedAt: serverTimestamp()
                        },
                        { merge: true }
                    );
                });
                await batch.commit();
            }
        }

        function subscribeToUserData(onChange, onError, user = currentUser) {
            if (!user) return () => {};

            let profileSnapshotData = null;
            let habitsSnapshotData = null;
            let completionHistorySnapshotData = null;

            function emitIfReady() {
                if (
                    profileSnapshotData === null ||
                    habitsSnapshotData === null ||
                    completionHistorySnapshotData === null
                ) return;

                const profileData = profileSnapshotData.exists()
                    ? profileSnapshotData.data()
                    : {};
                const habits = habitsSnapshotData.docs.map((habitSnapshot) =>
                    stripCloudMetadata(habitSnapshot.data(), habitSnapshot.id)
                );
                const completionHistory = completionHistoryFromSnapshot(completionHistorySnapshotData);

                onChange({
                    exists: profileSnapshotData.exists() || habits.length > 0 || Object.keys(completionHistory).length > 0,
                    profile: cloneData(profileData.profile || {}),
                    data: {
                        habits,
                        completionHistory,
                        settings: cloneData(profileData.settings || {}),
                        onboardingComplete: Boolean(profileData.onboardingComplete)
                    }
                });
            }

            const unsubscribeProfile = onSnapshot(
                userDocument(user),
                (snapshot) => {
                    profileSnapshotData = snapshot;
                    emitIfReady();
                },
                onError
            );
            const unsubscribeHabits = onSnapshot(
                habitsCollection(user),
                (snapshot) => {
                    habitsSnapshotData = snapshot;
                    emitIfReady();
                },
                onError
            );
            const unsubscribeCompletionHistory = onSnapshot(
                completionHistoryCollection(user),
                (snapshot) => {
                    completionHistorySnapshotData = snapshot;
                    emitIfReady();
                },
                onError
            );

            return () => {
                unsubscribeProfile();
                unsubscribeHabits();
                unsubscribeCompletionHistory();
            };
        }

        const authClient = Object.freeze({
            getAuthErrorMessage,
            getCurrentUser() {
                return currentUser;
            },
            getPublicUser() {
                return toPublicUser(currentUser);
            },
            async getIdToken(forceRefresh = false) {
                if (!currentUser) {
                    throw Object.assign(new Error('No signed-in user.'), { code: 'auth/no-current-user' });
                }
                return currentUser.getIdToken(forceRefresh);
            },
            async waitForInitialAuthState() {
                await initialAuthState;
                return currentUser;
            },
            subscribe(listener) {
                authStateListeners.add(listener);
                if (initialAuthStateResolved) {
                    queueMicrotask(() => listener(currentUser));
                }
                return () => authStateListeners.delete(listener);
            },
            async registerWithEmail({ email, password, displayName }) {
                const result = await createUserWithEmailAndPassword(auth, email, password);

                if (displayName) {
                    await updateProfile(result.user, { displayName });
                }

                return result.user;
            },
            async signInAsGuest() {
                const result = await signInAnonymously(auth);
                return result.user;
            },
            async signInWithEmail({ email, password }) {
                const result = await signInWithEmailAndPassword(auth, email, password);
                return result.user;
            },
            async getGoogleRedirectResult() {
                return googleRedirectResult;
            },
            async startGoogleRedirect() {
                await signInWithRedirect(auth, googleProvider);
            },
            async signOut() {
                await signOut(auth);
            },
            loadUserData,
            saveUserData,
            saveCompletionHistory,
            subscribeToUserData,
            saveTask,
            deleteTask,
            subscribeTasks,
            saveNoteCloud,
            deleteNoteCloud,
            getNoteMedia,
            subscribeNotes,
            saveFocusSession,
            subscribeFocusSessions
        });

        window.HabitArcAuth = authClient;
        window.dispatchEvent(new Event('habitarc-auth-ready'));
        return authClient;
    } catch (error) {
        window.HabitArcAuthInitError = error;
        console.error('Firebase Authentication could not be initialized.', error);
        throw error;
    }
})();
