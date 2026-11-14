/**
 * Registers HabitArc's offline-fallback worker.
 * Kept separate from application logic so authentication and data flows remain untouched.
 */
(() => {
  if (!('serviceWorker' in navigator) || !window.isSecureContext) {
    return;
  }

  function registerWorker() {
    // Bypass the HTTP cache when checking worker updates. The worker itself
    // does not cache application JS, so a fresh page never runs a stale bundle.
    navigator.serviceWorker.register('/sw.js', { scope: '/', updateViaCache: 'none' })
      .catch((error) => console.warn('HabitArc: offline fallback could not be enabled.', error));
  }

  if (document.readyState === 'complete') registerWorker();
  else window.addEventListener('load', registerWorker, { once: true });
})();
