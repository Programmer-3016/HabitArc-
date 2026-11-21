# HabitArc Planner — Tasks & Timeline

This feature lives inside the existing Plan (formerly Habits) tab. Recurring habits, completion history, Notes and the five-tab bottom bar remain intact.

## Features
Use Plan → Tasks to switch between All Tasks and Timeline. Create, edit and delete tasks with title, description, deadline, priority and optional habit or note links. Enter one subtask per line. Completing all subtasks completes the parent; unchecking one reopens it.

## Local-first and cloud synchronization
Tasks are saved immediately in account-scoped localStorage with a persistent pending-write queue. Offline edits can be reviewed locally, and the app retries their upload on reconnect. Firestore stores tasks at /users/{uid}/tasks/{taskId}, separately from recurring habits.

Cloud writes require deploying updated Firestore security rules. A GitHub push or Vercel deployment DOES NOT deploy Firestore rules. From a trusted machine with Firebase project owner permissions:

    npm install -g firebase-tools
    firebase login
    firebase deploy --only firestore:rules --project habitarc-dfa40

firebase.json points to firestore.rules. Review production rules in the Firebase Console before deploying, because a rules deploy may overwrite changes made there.

Local-only tasks created while signed out are not automatically moved into another account. Linked notes are stored only on their original device/browser. Android native scheduled reminders and cross-device media notes are separate future features.

Check the project with npm test and npm run check.

## Daily workspace / Focus (November 2026)

The five-tab PWA bottom bar is unchanged. Go to **Plan → My Day** for a date-based overview of scheduled habits, due tasks and notes. Use the **Tasks → Timeline** date headings to open a day directly. The Dashboard contains a compact “Day at a glance” shortcut.

Notes have an optional **Note date** field; old undated notes remain visible under their original created date. Notes and media continue to live on this browser only; do not uninstall the PWA if you need them. Task cloud sync still depends on separately deploying firestore.rules.

The Pomodoro focus timer supports 15/25/45 minutes, pause, resume and reset. A running timer persists its absolute end time in account-scoped device storage and can recover after reopening the PWA. **Only completed sessions** are added to the local focus history. Weekly totals show scheduled habit completions, scheduled tasks completed, local notes, and focus minutes in the seven-day period ending on the selected date.

**Not yet implemented:** native scheduled push reminders, cross-device notes/media or focus sync, and automated ARC AI task rescheduling. These require additional backend/native work and user approvals. The existing ARC AI tab remains available separately.

## Data Safety and cross-device backup

Notes Studio now keeps every note in IndexedDB first and queues signed-in edits/deletions locally. Firestore stores private note text and metadata under `/users/{uid}/notes/{noteId}`, while Firebase Storage stores optional photos/voice at `users/{uid}/notes/{noteId}/{photo|audio}`. The active account owns both paths. Deletes use Firestore tombstones to prevent an offline old copy from reappearing. A note can still be edited offline if the backend is unavailable, and the UI displays the actual sync status. Text may back up even while the media upload is pending.

Focus Mode also queues **completed sessions** to `/users/{uid}/focusSessions/{sessionId}`. Active/paused countdowns remain device-local, by design, so there is no conflicting remote timer. Completed sessions from another signed-in device are merged by stable session ID.

**Firebase console setup is required before cloud sync can work:**
1. Review existing deployed Firestore and Cloud Storage rules. GitHub/Vercel deployment alone does not deploy Firebase rules.
2. Enable or provision Cloud Storage for Firebase. As of 2026 Firebase Cloud Storage requires a **Blaze billing plan**; confirm costs/limits before enabling. Existing project configuration includes the bucket name `habitarc-dfa40.firebasestorage.app`, which must actually exist.
3. With Firebase CLI and project-owner access, deploy both rules:
   `firebase deploy --only firestore:rules,storage --project habitarc-dfa40`
   `firebase.json` now references `firestore.rules` and `storage.rules`. **Deploying these files can overwrite changes made separately in the Firebase Console.**
4. For direct protected media downloads via Firebase `getBlob()`, configure the bucket's browser CORS policy using `storage-cors.json`. From a trusted Google Cloud CLI setup: `gcloud storage buckets update gs://habitarc-dfa40.firebasestorage.app --cors-file=storage-cors.json` (or equivalent `gsutil cors set`). This is not part of normal Vercel deploy.
5. Test real user account A on two devices: text note first, then a photo and voice note; test offline edit/delete and reconnect; test Focus history. Do not uninstall the original PWA until both cloud data and a downloaded local backup have been verified.

Under **Settings → Data**, *Download Full Backup* exports the currently active account's habit data, task records, Notes including audio/images, and Focus history as one **unencrypted JSON archive**. Store it in a private place. This export is **not currently an automatic one-click restore**; importing a full habit archive needs a separately validated workflow.

Account sign-out never exports Notes or Focus to another identity; locally stored entries remain in their own account-scoped keys. Signed-out local-only entries are not silently migrated to a subsequently signed-in account.

**Still pending:** background/scheduled native reminders, global search, self-service complete account deletion, automated ARC AI planning and native Play Store widgets. These were not part of the data-safety patch.

## ARC Daily Rescue Mode (November 2026)

Open **ARC AI → Daily Rescue Mode** or **Plan → Tasks → Build plan**. The planner reads incomplete tasks due today or earlier from the current account's local-first task store. It ranks them by existing priority and deadline, suggests up to 2–5 tasks to tackle today, and spreads excess work to later days with space in the schedule. Future-dated, completed and undated tasks remain untouched.

The recovery preview displays each proposed due-date change with a checkbox and editable date. **No change is saved unless the user explicitly chooses changes and confirms the dialog.** Before any write it checks the account and task revision again; stale edits are skipped. Approved changes go through the existing task-store offline/cloud sync queue; they do not create new tasks, invent completions, or change streaks. The first priority includes a link to **My Day / Focus Mode** with the relevant task selected; the timer does not auto-start.

"Ask ARC AI" opens the existing Gemini-backed ARC Coach with an **editable, prefilled prompt** containing a short summary of actual tasks. The handoff uses 10-minute, same-account `sessionStorage`; private task titles are **not embedded in the navigation URL**. This text is **not submitted** until the user presses Ask, which sends it to the existing secure AI service under the account's normal quotas. ARC AI advice is informational and cannot directly change task dates. The prioritization/dates in the Rescue preview are computed by deterministic rules, not presented as AI-generated.

The bottom navigation remains exactly five tabs. No additional Firebase rules are needed for the Rescue interface; task syncing across devices still requires the separate Tasks security-rule deployment and verification described above.
