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
