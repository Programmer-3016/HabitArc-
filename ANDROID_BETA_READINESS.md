# HabitArc — Android / Play Store Release Gate

Status: **PWA beta, NOT a Play Store-ready Android package.**
Updated: 2026-11-21. Owner must review this checklist before publishing.

## Implemented in this update
- Existing five-tab PWA remains intact; new features live inside current pages.
- Full JSON archive export, validation preview, and same-account **merge-only** restore; existing IDs skip conflicts rather than overwrite. Backups are unencrypted.
- Universal Search (habits, tasks, local notes) + Ctrl/⌘+K shortcut and explicit Quick Capture.
- Collapsible monthly calendar in Plan → My Day.
- Deterministic ARC Consistency Shield in Insights, with approved two-minute reset tasks.
- Opt-in Task Deadline Digest and Morning Plan notifications **only while the app runs**. Tasks have a due *date* (not time); this is a digest, not a timed alarm.
- Device diagnostics in Settings (permissions, service worker, storage state).
- PWA manifest shortcuts for Dashboard, My Day, New Task and ARC AI; existing service-worker offline shell updated.

## Must complete before public Android release
1. **Firebase configuration**: Deploy and audit owner-scoped Firestore/Storage rules; enable Cloud Storage billing and media CORS only after cost and security review. Test two accounts and two Android devices. Confirm no cross-account data leakage.
2. **Data recovery**: Export, compare and restore photos/voice, focus, tasks, habits and completion history; exercise offline/signed-in transitions, account changes, quota exceeded and partially completed imports. Never clear real device data during a test.
3. **Native build**: There is no Capacitor or Trusted Web Activity Android project in this repo. Generate signed release AAB/APK in an authorized Android build environment; choose package ID and signing key, configure app links and offline launch.
4. **API policy**: New Play Store apps and updates must target Android 16 **API 36** or higher as of Nov 2026 (except stated platform-specific exemptions). Check current policy before release:
   https://support.google.com/googleplay/android-developer/answer/11926878
5. **Privacy & deletion**: Review and publish a legally complete privacy policy with named developer/contact. Implement **functional account deletion request and actual deletion** of Auth, Firestore, Storage and relevant retained data before publishing. Google Play requires in-app privacy and account deletion options and a Play Console data-safety form:
   https://support.google.com/googleplay/android-developer/answer/10144311
   https://support.google.com/googleplay/android-developer/answer/13327111
   The current \`privacy.html\` is explicitly an unfinished beta overview, not final policy.
6. **Reliable background reminders**: An opt-in daily Android Web Push digest is now wired through a browser subscription, VAPID, secure Vercel cron and Firebase Admin backend. **Actual delivery is not active until the Firebase service account is configured in Vercel**, and Hobby cron timing is approximate (08:30–09:30 IST). Precise per-deadline alarms and multi-time-zone retries still require a stronger scheduler/native Android setup. See `PUSH_SETUP.md`.
7. **Native widgets**: Not implemented. Real Android home-screen widgets require a native widget provider; shortcuts are **not widgets**.
8. **Test matrix**: Check 320/360/390/412px portrait, landscape, light/dark, low-memory Android WebView/Chrome, keyboard open, slow/offline links, permission denial, service-worker upgrade, and screen reader.
9. **Publication**: Product screenshots, app store text, age/content declarations, signing, crash monitoring, Android 16KB-page-size if native libraries are used, and Play Console review are pending.

## Safe revert
This feature bundle lives in **PR #16** (or the assigned feature PR), branched from commit \`cc4ad8c3a1d4a54a77ef14ce309aa47eff3974c3\`.
A reverse commit/PR can revert the source changes without deleting user-stored data. **Do not automatically delete imported local notes or tasks during a code revert.** After any revert, verify the Vercel deployment and wait for the PWA service worker to update before judging live UI.
