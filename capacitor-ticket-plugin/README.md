# Demo 3 Android Custom AI Buddy Notification Plugin

Renders **Demo 3 (Custom AI Name Lavender Pill `[🤖 KAI]` + Time + Clean `"Hey, time for ..."` Message)** directly on the Android Phone Lockscreen & Notification Drawer via `RemoteViews` — matching HabitArc's in-app `.ha-reminder-buddy-toast` 1:1 with zero extra buttons and ₹0 server cost.

## Wiring When Creating Your Play Store Build (`npx cap add android`)
1. Copy `res/drawable/*`, `res/drawable-night/*`, and `res/layout/notification_time_ticket.xml` into `android/app/src/main/res/`.
2. Copy `java/app/habitarc/tracker/HabitArcTicketPlugin.java` into `android/app/src/main/java/app/habitarc/tracker/`.
3. Register `registerPlugin(HabitArcTicketPlugin.class);` in `MainActivity.onCreate()` and add `<receiver android:name=".HabitArcTicketPlugin$TicketAlarmReceiver" android:exported="false" />` + `POST_NOTIFICATIONS` / `USE_EXACT_ALARM` permissions in `AndroidManifest.xml`.
4. `native-reminders.js` automatically syncs the user's saved `Settings -> AI Assistant Name` (`ARC`, `KAI`, etc.) to Android exact alarms whenever habits or AI name change.
