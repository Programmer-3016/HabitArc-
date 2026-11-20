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
