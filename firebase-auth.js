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
            setPersistence,
            signInAnonymously,
            signInWithEmailAndPassword,
            signInWithRedirect,
            updateProfile
        } = await import('https://www.gstatic.com/firebasejs/12.16.0/firebase-auth.js');

        const app = initializeApp(firebaseConfig);
        const auth = getAuth(app);
        const googleProvider = new GoogleAuthProvider();

        googleProvider.setCustomParameters({ prompt: 'select_account' });
        await setPersistence(auth, browserLocalPersistence);

        // Keep one shared result promise so the onboarding UI can safely
        // resume a completed mobile redirect after this page reloads.
        const googleRedirectResult = getRedirectResult(auth)
            .then((result) => ({ user: result?.user || null, error: null }))
            .catch((error) => ({ user: null, error }));

        const authClient = Object.freeze({
            getAuthErrorMessage,
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
            }
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
