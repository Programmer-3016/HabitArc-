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

        function stripCloudMetadata(habit, fallbackId) {
            const { _updatedAt, ...plainHabit } = habit || {};
            return {
                ...cloneData(plainHabit),
                id: plainHabit?.id || fallbackId
            };
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

            const [profileSnapshot, habitsSnapshot] = await Promise.all([
                getDoc(userDocument(user)),
                getDocs(habitsCollection(user))
            ]);
            const profileData = profileSnapshot.exists() ? profileSnapshot.data() : {};
            const habits = habitsSnapshot.docs.map((habitSnapshot) =>
                stripCloudMetadata(habitSnapshot.data(), habitSnapshot.id)
            );

            return {
                exists: profileSnapshot.exists() || habits.length > 0,
                profile: cloneData(profileData.profile || {}),
                data: {
                    habits,
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
                schemaVersion: 1,
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

        function subscribeToUserData(onChange, onError, user = currentUser) {
            if (!user) return () => {};

            let profileSnapshotData = null;
            let habitsSnapshotData = null;

            function emitIfReady() {
                if (profileSnapshotData === null || habitsSnapshotData === null) return;

                const profileData = profileSnapshotData.exists()
                    ? profileSnapshotData.data()
                    : {};
                const habits = habitsSnapshotData.docs.map((habitSnapshot) =>
                    stripCloudMetadata(habitSnapshot.data(), habitSnapshot.id)
                );

                onChange({
                    exists: profileSnapshotData.exists() || habits.length > 0,
                    profile: cloneData(profileData.profile || {}),
                    data: {
                        habits,
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

            return () => {
                unsubscribeProfile();
                unsubscribeHabits();
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
            subscribeToUserData
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
