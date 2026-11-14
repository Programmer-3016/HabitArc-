# HabitArc 🌿
> **AI-Powered Smart Habit Tracking & Behavioral Insights Platform**

[![Live Demo](https://img.shields.io/badge/Vercel-Live%20Demo-000000?style=for-the-badge&logo=vercel)](https://habit-arc.vercel.app/)
[![License](https://img.shields.io/badge/License-MIT-green.svg?style=for-the-badge)](LICENSE)
[![GitHub stars](https://img.shields.io/github/stars/Programmer-3016/HabitArc-?style=for-the-badge)](https://github.com/Programmer-3016/HabitArc-)

HabitArc rethinks how habit building actually works. It moves away from traditional, clutter-heavy checklist apps to create a **Personal Growth Platform** where users focus on self-improvement, consistency, and reflection rather than just checking boxes.

---

## 🚀 Live Demo
Access the deployed application on Vercel:
👉 **[https://habit-arc.vercel.app/](https://habit-arc.vercel.app/)**

---

## ✨ Core Philosophy
* **Less clutter, less complexity, more clarity.**
* **Minimal inputs, maximum insights.**
* **Startup-quality, modern, Apple-level UX.**

---

## 📱 Features & Architecture

### 1. 📊 Clean Dashboard
- **Greeting & Context**: Personalized time-of-day greeting and date indicator.
- **Circular Daily Progress Ring**: Real-time completion percentage.
- **Streak Tracking**: Displays current overall streak and longest streak achieved.
- **Today's Habit Stream**: Instant one-tap habit completion with 7-day visual history.

### 2. 🎯 Habit Detail & Activity Calendar
- **GitHub Contribution-Style Calendar**: Color-coded daily activity grid (Green = Completed, Red = Missed, Gray = Rest).
- **Streak & Performance Stats**: Current streak, longest streak, completion rate %, and total days completed.
- **Monthly Activity Breakdown**: Visual progress bars across past 6 months.
- **Personal Motivation ("Your Why")**: Reminds users why they started each habit.

### 3. 🧠 Smart Behavioral Insights
- **Consistency Score**: Automated grading (A+, A, B, C) based on 30-day activity.
- **Pattern Recognition**: Highlights peak productivity days (e.g., "You are most consistent on Tuesdays").
- **Focus Areas**: Identifies weakest habits and offers actionable guidance.

### 4. ➕ Habit Creation & Editing
- **Fields**: Name, Icon, Category (Health, Mindfulness, Learning, Focus), optional Accent Color, Repeat schedule (Daily, Weekdays, Weekends), Reminder time, and optional Motivation notes.
- **Edit flow**: Habit Detail opens the same form in edit mode, preserving the habit’s history while updating its routine.
- **Accent consistency**: Each habit gets a validated default accent or an optional selected color, reused on cards, completion indicators, seven-day activity, and the detail calendar.
- **Safety Limit**: Enforces a maximum of 20 active habits to prevent user overwhelm.

### 5. ⚙️ Profile & System Settings
- **Theme Switcher**: Instant Light / Dark mode toggle.
- **Data Privacy & Export**: Export habit data directly to CSV format.
- **Reset Options**: Option to reset or seed demo data.

### 6. 📲 PWA foundation & reminders
- **PWA foundation**: Manifest, install-prompt handling and a self-contained reconnect screen are included. Reliable installability still needs square 192×192 and 512×512 icons and a real-device check; the existing logo is not square.
- **Local Reminder Delivery**: Daily habit reminders and the weekly check-in can use browser notifications while HabitArc is open, after an explicit permission choice.
- **Honest delivery boundary**: Closed-browser background push needs Firebase Cloud Messaging and a trusted server-side sender; it is not claimed as complete until that infrastructure is configured.

### 7. ✨ Secure HabitArc Coach
- **Server-side only**: The Coach calls the Vercel AI Gateway from `/api/coach`; no AI key is ever shipped to the browser.
- **Private context**: Firebase ID tokens are verified on the server, which reads only the signed-in member's habits and recent completion history.
- **Guardrails**: Per-user daily quota, bounded data context, no-cache responses, input limits, and non-clinical habit-planning boundaries.
- **Data-grounded advice**: The Coach receives real completion rates, trends, schedules, and weak/strong habits—not mock analytics.

---

## 🛠️ Technology Stack
- **Frontend**: HTML5, Tailwind CSS (CDN with container queries & custom color system), Vanilla JavaScript (ES6 Module pattern)
- **State & Storage**: User-scoped `localStorage` cache plus Firebase Firestore sync (full CRUD, streaks, calendar generation, offline-first fallback)
- **AI backend**: Vercel Node Function, Vercel AI SDK / AI Gateway, Firebase Admin token verification and private data reads
- **PWA**: Web App Manifest, network-first page navigation with an offline reconnect screen. Application JavaScript, authenticated pages and API responses are not cached by the worker.
- **Typography & Icons**: Material Symbols Outlined, Google Fonts (Hanken Grotesk & Geist)
- **Deployment**: Vercel Static Hosting with rewrite routing (`vercel.json`)

---

## 📁 Repository Structure
```
HabitArc/
├── index.html         # Entry point & Vercel root redirect
├── Dashboard.html     # Main overview & today's habits stream
├── Habits.html        # All habits view with category filtering
├── Habit_Detail.html  # GitHub contribution calendar & habit stats
├── Add_Habit.html     # Creation form with icon & category selectors
├── Insights.html      # Behavioral analytics & consistency score
├── Profile.html       # Goals & CSV data export
├── Settings.html      # Theme toggle & system preferences
├── app.js             # Central data engine, auth-aware local cache & sync orchestration
├── firebase-auth.js   # Firebase Auth and Firestore client integration
├── firestore.rules    # Private per-user Firestore access rules
├── api/
│   ├── coach.js        # Authenticated server-side AI Coach endpoint
│   └── _coach-context.js # Bounded, data-grounded Coach context builder
├── manifest.webmanifest # PWA metadata (square release icons still required)
├── sw.js               # Safe offline fallback, no cached auth/app scripts
├── offline.html        # Offline fallback screen
├── pwa-register.js     # Service-worker registration
├── tests/              # Core data, Coach security, PWA and opt-in browser checks
├── .env.example        # Server-only environment variable names (no secrets)
└── vercel.json        # Vercel deployment configuration
```

---

## 👨‍💻 Local Development Setup
1. Clone the repository:
   ```bash
   git clone https://github.com/Programmer-3016/HabitArc-.git
   ```
2. Install server-side dependencies:
   ```bash
   npm install
   ```
3. Serve the project from a local web server (for example, VS Code Live Server). Opening files directly does not support Firebase redirect auth or service workers. A plain static server cannot run `/api/coach`; use the Vercel development runtime or a deployment for that function. Production targets Node 22.
4. Run local verification:
   ```bash
   npm run check
   npm test
   ```

The opt-in `tests/browser-smoke.mjs` uses Playwright (provided separately), an isolated browser profile and a local-only Firebase stub. Set `PLAYWRIGHT_MODULE` to its module path and optionally `BROWSER_CHANNEL=msedge` or `chrome`. It never signs in to a real account or writes to Firestore. Unit tests do not require Playwright. This static frontend has no TypeScript or bundler build; syntax, regression and browser checks are the applicable verification commands.

---

## Firebase Authentication & Cloud Sync

HabitArc uses Firebase Authentication for the Step 8 account flow. In Firebase Console, enable these providers under **Authentication → Sign-in method**:

- Google
- Email/Password
- Anonymous

Add `habit-arc.vercel.app` to **Authentication → Settings → Authorized domains** before testing the production deployment.

### Google sign-in on mobile

HabitArc uses Firebase's redirect flow for Google on mobile so that leaving or cancelling the account picker cannot leave the onboarding UI stuck. The production Vercel configuration proxies Firebase's required helper routes under the HabitArc domain.

After the next deployment, add this exact redirect URI to the Google OAuth web client that Firebase uses for this project:

`https://habit-arc.vercel.app/__/auth/handler`

### Enable Firestore before using cloud sync

HabitArc keeps each signed-in user's settings in `users/{uid}`, habits in
`users/{uid}/habits/{habitId}`, and durable daily completion state in
`users/{uid}/habitCompletions/{habitId}_{YYYY-MM-DD}`. Completion documents
are the cross-device activity history used by streaks, calendars, completion
rates, and future AI analysis. A habit's `completions` map remains as a
backwards-compatible UI projection while existing accounts migrate safely.

Each completion record stores:

- `habitId` and `date`
- `status`: `completed` or `not_completed`
- `completedAt` for completed events
- `updatedAt` for last-write-wins synchronisation

Missed days are derived from the habit schedule and the absence of a completed
record; HabitArc does not create wasteful records every midnight. The app
remains usable from its local cache if Firestore is temporarily unavailable,
but cloud backup and multi-device sync need one Firebase Console setup step:

1. Open **Firebase Console → Build → Firestore Database** and create the database.
2. Open the **Rules** tab.
3. Replace the default rules with the contents of [`firestore.rules`](firestore.rules), then click **Publish**.

The rules require a Firebase-authenticated user and restrict every document to
its matching `uid`; do not use test-mode rules in production.

The web configuration is kept in `firebase-auth.js`; it uses the Firebase App,
Authentication, and Firestore SDKs.

---

## Secure AI Coach setup

The UI and `/api/coach` function are included in this repository, but the Coach stays intentionally unavailable until its server-only credentials are configured. This prevents an API key from ever being exposed in source code or browser DevTools.

1. In Vercel AI Gateway, create a project API key and set a budget/usage alert.
2. In Firebase Console → **Project settings → Service accounts**, create a new private key for the server. Do **not** paste that JSON into Git, this README, or a chat.
3. Base64-encode the downloaded JSON locally, for example in PowerShell:
   ```powershell
   [Convert]::ToBase64String([IO.File]::ReadAllBytes('C:\safe\firebase-service-account.json'))
   ```
4. In the Vercel project’s **Environment Variables**, add the following for Production (and Preview if needed):

   | Variable | Value |
   | --- | --- |
   | `AI_GATEWAY_API_KEY` | The Vercel AI Gateway key (server-only) |
   | `AI_GATEWAY_MODEL` | `openai/gpt-5.4-mini` or another currently supported gateway model |
   | `FIREBASE_SERVICE_ACCOUNT_BASE64` | The base64 value from Step 3 |
   | `AI_COACH_DAILY_LIMIT` | Optional, defaults to `15` |

5. Redeploy, sign in with a non-guest account, and ask a Coach question from **Insights**.

`openai/gpt-5.4-mini` was selected from the live AI Gateway catalog as a cost-conscious default. You can change it without code changes through `AI_GATEWAY_MODEL`. The function enforces a 1–50 request daily limit per signed-in account, an in-flight request lock and a short cooldown. Attempts count even if a provider fails, and the daily quota resets at UTC midnight. This per-user cap is not a global spending cap: configure Gateway budget controls before enabling a public launch.

Historical Coach rates cover the last 28 finished local calendar days. Today is shown separately, not treated as a missed day. The current schedule is used because schedule revisions are not yet versioned. Unmarked days do not prove a real-world failure; actual time spent, energy and obstacles are not tracked. Advice is a suggestion, not an accuracy guarantee or proof of superiority over general-purpose AI.

### Remaining release checks

- Configure server-only AI credentials and budget controls, then test real signed-in questions. Local tests use SDK stubs and do not establish live model quality.
- Verify the published Firestore rules include `habitCompletions` before the cross-device demo.
- Add proper square app icons and test installation on Android/iOS. Full offline habit editing and closed-browser push are not included in the current PWA foundation.
- Some original Settings rows (week-start, default-time selector, privacy page) are still static. Do not present those as completed interactive features.

The Admin SDK bypasses client Firestore rules only inside the protected Vercel function, after Firebase token verification. The existing client rules continue to block other users from reading a member’s data.

---

## Shared UI styling

The existing application pages load `app-ui.css` and `app-ui.js`. The CSS owns
shared surfaces, page widths, responsive cards, navigation touch targets and
the four existing Settings palettes: Light, Dark, Forest and Midnight.
The script bridges existing Tailwind color tokens to CSS variables and adds
navigation labels, current-page semantics and a keyboard skip link. It does
not handle authentication, storage, habit calculations or cloud sync.

Onboarding remains separate. No framework, route or navigation order changed.
Habit lists use two columns from 768px and one column on smaller screens.
The app still depends on the existing Tailwind/font CDNs; this is not a bundled
offline redesign.

Run `npm run check` and `npm test` for syntax/unit checks. Optional isolated
browser checks (with Playwright available):

```text
node tests/browser-smoke.mjs
node tests/ui-layout.mjs
```

Set `PLAYWRIGHT_MODULE` to an installed Playwright entry point if needed and
`BROWSER_CHANNEL=msedge` to use Edge. `UI_SCREENSHOT_DIR` optionally saves UI
screenshots outside the repository. Tests use synthetic data in temporary
browser contexts, disable service workers, and block Firebase; they never
write to a real account. Layout coverage includes 320/390/768/1366px, all four
saved themes, empty states, long names, mobile touch targets and reduced motion.

## 📜 License
This project is open source under the [MIT License](LICENSE).
