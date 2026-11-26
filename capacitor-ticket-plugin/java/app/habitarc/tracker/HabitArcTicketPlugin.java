package app.habitarc.tracker;

import android.app.AlarmManager;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.os.Build;
import android.widget.RemoteViews;
import androidx.core.app.NotificationCompat;
import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.util.Calendar;
import java.util.HashSet;
import java.util.Set;
import org.json.JSONObject;

/**
 * Renders Demo 3 (Custom AI Name Lavender Pill + Pixel Buddy + Clean Message)
 * directly on the Android Phone Lockscreen & Notification Drawer via RemoteViews.
 */
@CapacitorPlugin(name = "HabitArcTicketNotifications")
public class HabitArcTicketPlugin extends Plugin {
    public static final String CHANNEL_ID = "habitarc_exact_reminders";
    private static final String PREFS_NAME = "habitarc_ticket_ids";
    private static final String KEY_IDS = "scheduled_ids";

    public static void ensureChannel(Context context) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            NotificationManager nm = context.getSystemService(NotificationManager.class);
            if (nm == null) return;
            NotificationChannel channel = new NotificationChannel(
                CHANNEL_ID,
                "Habit Reminders",
                NotificationManager.IMPORTANCE_HIGH
            );
            channel.setDescription("Custom AI Buddy exact-time habit reminders");
            channel.enableVibration(true);
            nm.createNotificationChannel(channel);
        }
    }

    public static void showBuddyNotification(
        Context context,
        int id,
        String aiName,
        String timeLabel,
        String messageText
    ) {
        ensureChannel(context);
        String pkg = context.getPackageName();
        int layoutId = context.getResources().getIdentifier("notification_time_ticket", "layout", pkg);
        int smallIconId = context.getResources().getIdentifier("ic_stat_habitarc", "drawable", pkg);
        if (smallIconId == 0) smallIconId = context.getApplicationInfo().icon;

        Intent openIntent = context.getPackageManager().getLaunchIntentForPackage(pkg);
        if (openIntent != null) {
            openIntent.setFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        }
        PendingIntent contentPending = PendingIntent.getActivity(
            context,
            id,
            openIntent != null ? openIntent : new Intent(),
            PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
        );

        String cleanAi = (aiName == null || aiName.isEmpty()) ? "ARC" : aiName;
        NotificationCompat.Builder builder = new NotificationCompat.Builder(context, CHANNEL_ID)
            .setSmallIcon(smallIconId)
            .setContentTitle(cleanAi + " · " + timeLabel)
            .setContentText(messageText)
            .setContentIntent(contentPending)
            .setAutoCancel(true)
            .setPriority(NotificationCompat.PRIORITY_HIGH)
            .setVisibility(NotificationCompat.VISIBILITY_PUBLIC);

        if (layoutId != 0) {
            RemoteViews views = new RemoteViews(pkg, layoutId);
            views.setTextViewText(context.getResources().getIdentifier("buddy_ai_name", "id", pkg), cleanAi);
            views.setTextViewText(context.getResources().getIdentifier("buddy_time", "id", pkg), timeLabel);
            views.setTextViewText(context.getResources().getIdentifier("buddy_message", "id", pkg), messageText);
            builder.setCustomContentView(views);
            builder.setCustomBigContentView(views);
        }

        NotificationManager nm = (NotificationManager) context.getSystemService(Context.NOTIFICATION_SERVICE);
        if (nm != null) nm.notify(id, builder.build());
    }

    @PluginMethod
    public void syncTickets(PluginCall call) {
        Context context = getContext();
        AlarmManager am = (AlarmManager) context.getSystemService(Context.ALARM_SERVICE);
        SharedPreferences prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE);
        Set<String> prevIds = prefs.getStringSet(KEY_IDS, new HashSet<>());

        if (am != null && prevIds != null) {
            for (String rawId : prevIds) {
                try {
                    int oldId = Integer.parseInt(rawId);
                    Intent cancelIntent = new Intent(context, TicketAlarmReceiver.class);
                    PendingIntent pi = PendingIntent.getBroadcast(
                        context, oldId, cancelIntent, PendingIntent.FLAG_NO_CREATE | PendingIntent.FLAG_IMMUTABLE
                    );
                    if (pi != null) am.cancel(pi);
                } catch (Exception ignored) {}
            }
        }

        JSArray tickets = call.getArray("tickets", new JSArray());
        Set<String> nextIds = new HashSet<>();
        int scheduledCount = 0;

        try {
            for (int i = 0; i < tickets.length(); i++) {
                JSONObject item = tickets.getJSONObject(i);
                int id = item.optInt("id", 0);
                long triggerAtMs = item.optLong("triggerAtMs", 0L);
                if (id <= 0 || triggerAtMs <= 0L || am == null) continue;

                Intent intent = new Intent(context, TicketAlarmReceiver.class);
                intent.putExtra("id", id);
                intent.putExtra("aiName", item.optString("aiName", "ARC"));
                intent.putExtra("timeLabel", item.optString("timeLabel", "8:00 AM"));
                intent.putExtra("messageText", item.optString("messageText", "Hey, time for your habit"));
                intent.putExtra("repeatWeekly", item.optBoolean("repeatWeekly", true));

                PendingIntent pi = PendingIntent.getBroadcast(
                    context, id, intent, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
                );
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
                    am.setExactAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, triggerAtMs, pi);
                } else {
                    am.setExact(AlarmManager.RTC_WAKEUP, triggerAtMs, pi);
                }
                nextIds.add(String.valueOf(id));
                scheduledCount++;
            }
        } catch (Exception e) {
            call.reject("Could not schedule AI Buddy alarms", e);
            return;
        }

        prefs.edit().putStringSet(KEY_IDS, nextIds).apply();
        JSObject ret = new JSObject();
        ret.put("synced", true);
        ret.put("count", scheduledCount);
        call.resolve(ret);
    }

    @PluginMethod
    public void sendTestTicket(PluginCall call) {
        Calendar now = Calendar.getInstance();
        int h24 = now.get(Calendar.HOUR_OF_DAY);
        int min = now.get(Calendar.MINUTE);
        String period = h24 >= 12 ? "PM" : "AM";
        int h12 = h24 % 12 == 0 ? 12 : h24 % 12;
        String timeLabel = h12 + ":" + String.format("%02d", min) + " " + period;
        String aiName = call.getString("aiName", "ARC");

        showBuddyNotification(
            getContext(),
            991001,
            aiName,
            timeLabel,
            call.getString("messageText", "Hey, your " + aiName + " reminders are active")
        );
        JSObject ret = new JSObject();
        ret.put("sent", true);
        call.resolve(ret);
    }

    public static class TicketAlarmReceiver extends BroadcastReceiver {
        @Override
        public void onReceive(Context context, Intent intent) {
            if (intent == null) return;
            int id = intent.getIntExtra("id", 1001);
            showBuddyNotification(
                context,
                id,
                intent.getStringExtra("aiName"),
                intent.getStringExtra("timeLabel"),
                intent.getStringExtra("messageText")
            );

            if (intent.getBooleanExtra("repeatWeekly", true)) {
                AlarmManager am = (AlarmManager) context.getSystemService(Context.ALARM_SERVICE);
                if (am != null) {
                    long nextWeek = System.currentTimeMillis() + (7L * 24L * 60L * 60L * 1000L);
                    PendingIntent pi = PendingIntent.getBroadcast(
                        context, id, intent, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
                    );
                    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
                        am.setExactAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, nextWeek, pi);
                    }
                }
            }
        }
    }
}
