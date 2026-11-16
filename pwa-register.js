/**
 * Registers HabitArc's app-shell service worker and broadcasts availability of updates.
 * Kept separate from application logic so authentication and data flows remain untouched.
 */
(() => {
  if (!('serviceWorker' in navigator) || !window.isSecureContext) {
    return;
  }

  function notifyUpdateReady(worker) {
    if (!worker || typeof window.dispatchEvent !== 'function') return;
    window.dispatchEvent(new CustomEvent('habitarc:sw-update-ready', { detail: { worker } }));
  }

  function registerWorker() {
    navigator.serviceWorker.register('/sw.js', { scope: '/', updateViaCache: 'none' })
      .then((registration) => {
        if (!registration || typeof registration.addEventListener !== 'function') return;
        if (registration.waiting && navigator.serviceWorker.controller) {
          notifyUpdateReady(registration.waiting);
        }
        registration.addEventListener('updatefound', () => {
          const installing = registration.installing;
          if (!installing || typeof installing.addEventListener !== 'function') return;
          installing.addEventListener('statechange', () => {
            if (installing.state === 'installed' && navigator.serviceWorker.controller) {
              notifyUpdateReady(installing);
            }
          });
        });
      })
      .catch((error) => console.warn('HabitArc: offline fallback could not be enabled.', error));
  }

  if (document.readyState === 'complete') registerWorker();
  else window.addEventListener('load', registerWorker, { once: true });
})();
