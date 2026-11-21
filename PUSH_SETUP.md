# HabitArc — Background Web Push (Android PWA beta)

**Status: integration code included; production delivery remains DISABLED until the project owner configures Firebase Admin credentials.**

## What is implemented
- Explicit Settings opt-in for a single **daily** background digest (around 08:30–09:30 India time).
- Browser PushManager subscriptions, VAPID keys and a service-worker push handler; notifications can arrive when the PWA is closed if the device and service provider permit.
- One subscription per device, stored under the authenticated account's existing Firestore \`users/{uid}.pushDevices\` map; Firebase Firestore SDK honors existing owner-only user document rules.
- Disable and sign-out unsubscribe the local browser; expired remote endpoints are removed by the cron.
- Vercel cron at 03:00 UTC. Hobby may invoke it at any point within that hour; it is **best effort, not an exact-time alert**.
- Secured API \`/api/push-cron\` requires \`Authorization: Bearer $CRON_SECRET\`; an unset secret makes the route fail closed.
- Firebase Admin reads authorized account device subscriptions and **synced** task counts to build a single short push. No task titles/Note content in push payload. Transaction lease prevents duplicate sends by overlapping cron calls.
- VAPID endpoint hostname allowlist prevents untrusted Firestore device records from sending Web Push to arbitrary servers.

## Production variables
These have been configured on Vercel production during implementation:
- \`HABITARC_VAPID_PUBLIC_KEY\` (public)
- \`HABITARC_VAPID_PRIVATE_KEY\` (encrypted/server only)
- \`CRON_SECRET\` (encrypted/server only)

**Still required:**
- \`FIREBASE_SERVICE_ACCOUNT_JSON\` (encrypted; the full service account JSON object) **or** \`FIREBASE_SERVICE_ACCOUNT_BASE64\`. Must belong to the Firebase project \`habitarc-dfa40\`.
- Project owner must set it themselves in Vercel → HabitArc → Settings → Environment Variables → Production; never paste credentials into chat or commit them. Get credentials from Firebase Console → Project settings → Service accounts.
- Redeploy after adding the variable, then open Settings → Background Notifications → Enable and grant Android/Chrome permission.

The public \`/api/push-config\` endpoint reports \`available: false\` until all required config exists. The Enable button is deliberately disabled until this happens. This protects the user from false success claims.

## Validation / safety
- Confirm the Vercel production deployment SHA matches GitHub main.
- Verify cron appears under Vercel project Cron Jobs; it runs once per day on Hobby.
- Enable one test phone, then close the PWA completely. Browser Push subscription must persist. Next eligible daily run sends a digest.
- Disable and ensure no further push is received on that phone. Repeat after signing out and switching accounts.
- Cross-device, Android notification settings, battery saver, network loss and browser service worker failures can delay/block delivery.
- Vercel Cron does not guarantee retries. For **precise per-deadline alarms or robust global/time-zone scheduling**, migrate to a higher-frequency scheduler with retry queue, Firebase Cloud Scheduler/Functions (billing/configuration), or native Android AlarmManager where supported.
- Cloud backup and Notes security rules were not changed here; verify those independently.

## Safe revert
This feature is isolated in PR #18 (or the final assigned PR) and can be reverted without erasing habits, tasks or Notes. VAPID and CRON secrets should be removed from the Vercel project if abandoning Web Push, and registered browser subscriptions should be disabled from Settings. A code revert alone does not delete user-saved push subscription records.
