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

### 4. ➕ Habit Creation Flow
- **Fields**: Name, Icon, Category (Health, Mindfulness, Learning, Focus), Repeat schedule (Daily, Weekdays, Weekends), Reminder time, and optional Motivation notes.
- **Safety Limit**: Enforces a maximum of 20 active habits to prevent user overwhelm.

### 5. ⚙️ Profile & System Settings
- **Theme Switcher**: Instant Light / Dark mode toggle.
- **Data Privacy & Export**: Export habit data directly to CSV format.
- **Reset Options**: Option to reset or seed demo data.

---

## 🛠️ Technology Stack
- **Frontend**: HTML5, Tailwind CSS (CDN with container queries & custom color system), Vanilla JavaScript (ES6 Module pattern)
- **State & Storage**: `localStorage` (full CRUD, streaks, calendar generation, offline-first)
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
├── app.js             # Central data engine & localStorage logic
└── vercel.json        # Vercel deployment configuration
```

---

## 👨‍💻 Local Development Setup
1. Clone the repository:
   ```bash
   git clone https://github.com/Programmer-3016/HabitArc-.git
   ```
2. Open `index.html` or `Dashboard.html` directly in any web browser, or serve with a local server (e.g., Live Server extension).
3. No build steps or `npm install` required!

---

## Firebase Authentication

HabitArc uses Firebase Authentication for the Step 8 account flow. In Firebase Console, enable these providers under **Authentication → Sign-in method**:

- Google
- Email/Password
- Anonymous

Add `habit-arc.vercel.app` to **Authentication → Settings → Authorized domains** before testing the production deployment. The web configuration is kept in `firebase-auth.js`; it intentionally uses only the Firebase App and Authentication SDKs.

---

## 📜 License
This project is open source under the [MIT License](LICENSE).
