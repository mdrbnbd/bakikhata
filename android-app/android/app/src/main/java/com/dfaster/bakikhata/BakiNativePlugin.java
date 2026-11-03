package com.dfaster.bakikhata;

import android.Manifest;
import android.app.Activity;
import android.app.PendingIntent;
import android.content.ActivityNotFoundException;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.net.Uri;
import android.os.Build;
import android.os.Handler;
import android.os.Looper;
import android.provider.Settings;
import android.telephony.SmsManager;
import android.telephony.SubscriptionInfo;
import android.telephony.SubscriptionManager;
import android.util.Base64;
import androidx.core.app.NotificationManagerCompat;
import androidx.core.content.ContextCompat;
import androidx.core.content.FileProvider;
import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.PermissionState;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;
import java.io.File;
import java.io.FileOutputStream;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.concurrent.atomic.AtomicInteger;

/** Phone features for dFaster Note: SMS (compose or silent auto-send with delivery-to-network status, SIM choice),
 *  external links (WhatsApp, tel:), sharing files, notification / app settings shortcuts. */
@CapacitorPlugin(name = "BakiNative", permissions = {
    @Permission(alias = "sms", strings = { Manifest.permission.SEND_SMS }),
    @Permission(alias = "phone", strings = { Manifest.permission.READ_PHONE_STATE })
})
public class BakiNativePlugin extends Plugin {
    private static final AtomicInteger REQ = new AtomicInteger(1000);
    private static final long SEND_TIMEOUT_MS = 90_000;

    /** Opens the default SMS app with the number and text filled in. Needs no permission. */
    @PluginMethod
    public void composeSms(PluginCall call) {
        String phone = call.getString("phone", "");
        String body = call.getString("body", "");
        Intent i = new Intent(Intent.ACTION_SENDTO, Uri.parse("smsto:" + Uri.encode(phone)));
        i.putExtra("sms_body", body);
        i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        try { getContext().startActivity(i); call.resolve(); }
        catch (ActivityNotFoundException e) { call.reject("কোনো SMS অ্যাপ পাওয়া যায়নি"); }
    }

    /**
     * Sends the SMS silently through SmsManager (multipart for long Bangla text) and waits for the radio's
     * "sent" result of every part. Resolves {status: "sent"|"failed"|"pending", parts, code}.
     * Optional subId picks the SIM (dual-SIM); -1 = phone's default SMS SIM.
     * Rejects with code NO_PERMISSION when SEND_SMS is not granted (the web layer explains and asks first).
     */
    @PluginMethod
    public void sendSms(PluginCall call) {
        if (getPermissionState("sms") != PermissionState.GRANTED) { call.reject("SMS পাঠানোর অনুমতি দেওয়া হয়নি", "NO_PERMISSION"); return; }
        String phone = call.getString("phone", "");
        String body = call.getString("body", "");
        int subId = call.getInt("subId", -1);
        if (phone.isEmpty() || body.isEmpty()) { call.reject("নম্বর বা লেখা নেই", "BAD_INPUT"); return; }
        final Context ctx = getContext();
        try {
            SmsManager sm = smsManager(ctx, subId);
            ArrayList<String> parts = sm.divideMessage(body);
            final int n = parts.size();
            final String action = ctx.getPackageName() + ".SMS_SENT." + UUID.randomUUID();
            final AtomicInteger left = new AtomicInteger(n);
            final AtomicInteger firstErr = new AtomicInteger(0);
            final AtomicBoolean done = new AtomicBoolean(false);
            final Handler h = new Handler(Looper.getMainLooper());
            final BroadcastReceiver[] holder = new BroadcastReceiver[1];
            final Runnable finish = () -> {
                if (!done.compareAndSet(false, true)) return;
                try { ctx.unregisterReceiver(holder[0]); } catch (Exception ignored) {}
                JSObject r = new JSObject();
                r.put("parts", n);
                if (left.get() > 0 && firstErr.get() == 0) r.put("status", "pending");
                else r.put("status", firstErr.get() == 0 ? "sent" : "failed");
                r.put("code", firstErr.get());
                call.resolve(r);
            };
            holder[0] = new BroadcastReceiver() {
                @Override public void onReceive(Context c, Intent i) {
                    int rc = getResultCode();
                    if (rc != Activity.RESULT_OK) firstErr.compareAndSet(0, rc);
                    if (left.decrementAndGet() <= 0) h.post(finish);
                }
            };
            ContextCompat.registerReceiver(ctx, holder[0], new IntentFilter(action), ContextCompat.RECEIVER_NOT_EXPORTED);
            ArrayList<PendingIntent> sent = new ArrayList<>();
            for (int k = 0; k < n; k++) {
                Intent it = new Intent(action).setPackage(ctx.getPackageName());
                sent.add(PendingIntent.getBroadcast(ctx, REQ.incrementAndGet(), it, PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_ONE_SHOT));
            }
            h.postDelayed(finish, SEND_TIMEOUT_MS);
            if (n > 1) sm.sendMultipartTextMessage(phone, null, parts, sent, null);
            else sm.sendTextMessage(phone, null, body, sent.get(0), null);
        } catch (Exception e) {
            call.reject("SMS পাঠানো যায়নি: " + e.getMessage(), "SEND_ERROR");
        }
    }

    @SuppressWarnings("deprecation")
    private static SmsManager smsManager(Context ctx, int subId) {
        if (Build.VERSION.SDK_INT >= 31) {
            SmsManager base = ctx.getSystemService(SmsManager.class);
            return subId >= 0 ? base.createForSubscriptionId(subId) : base;
        }
        return subId >= 0 ? SmsManager.getSmsManagerForSubscriptionId(subId) : SmsManager.getDefault();
    }

    /** Lists active SIMs for the SIM picker. Needs READ_PHONE_STATE (asked only when the user opens the picker). */
    @PluginMethod
    public void listSims(PluginCall call) {
        if (getPermissionState("phone") != PermissionState.GRANTED) { requestPermissionForAlias("phone", call, "simsPermCallback"); return; }
        doListSims(call);
    }

    @PermissionCallback
    private void simsPermCallback(PluginCall call) {
        if (getPermissionState("phone") == PermissionState.GRANTED) doListSims(call);
        else call.reject("সিমের তালিকা দেখার অনুমতি দেওয়া হয়নি", "NO_PERMISSION");
    }

    @SuppressWarnings("MissingPermission")
    private void doListSims(PluginCall call) {
        try {
            SubscriptionManager sm = getContext().getSystemService(SubscriptionManager.class);
            List<SubscriptionInfo> list = sm == null ? null : sm.getActiveSubscriptionInfoList();
            JSArray arr = new JSArray();
            if (list != null) for (SubscriptionInfo s : list) {
                JSObject o = new JSObject();
                o.put("subId", s.getSubscriptionId());
                o.put("slot", s.getSimSlotIndex());
                o.put("name", String.valueOf(s.getDisplayName()));
                o.put("carrier", String.valueOf(s.getCarrierName()));
                arr.put(o);
            }
            JSObject r = new JSObject();
            r.put("sims", arr);
            r.put("defaultSubId", SubscriptionManager.getDefaultSmsSubscriptionId());
            call.resolve(r);
        } catch (Exception e) { call.reject("সিমের তালিকা পাওয়া যায়নি: " + e.getMessage()); }
    }

    /** Whether the app may show notifications at all (also catches MIUI/HyperOS switching them off). */
    @PluginMethod
    public void notificationsEnabled(PluginCall call) {
        JSObject r = new JSObject();
        r.put("enabled", NotificationManagerCompat.from(getContext()).areNotificationsEnabled());
        call.resolve(r);
    }

    /** Opens this app's notification settings page (or the app info page on old phones). */
    @PluginMethod
    public void openNotificationSettings(PluginCall call) {
        Context ctx = getContext();
        Intent i = new Intent(Settings.ACTION_APP_NOTIFICATION_SETTINGS).putExtra(Settings.EXTRA_APP_PACKAGE, ctx.getPackageName());
        i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        try { ctx.startActivity(i); call.resolve(); }
        catch (Exception e) { openAppSettings(call); }
    }

    /** Opens the app info page (permissions), e.g. after SMS permission was denied permanently. */
    @PluginMethod
    public void openAppSettings(PluginCall call) {
        Context ctx = getContext();
        Intent i = new Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, Uri.fromParts("package", ctx.getPackageName(), null));
        i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        try { ctx.startActivity(i); call.resolve(); }
        catch (Exception e) { call.reject("সেটিংস খোলা যায়নি"); }
    }

    /** Opens a URL in the matching app (wa.me → WhatsApp, tel: → dialer, https → browser). */
    @PluginMethod
    public void openUrl(PluginCall call) {
        String url = call.getString("url", "");
        Intent i = new Intent(url.startsWith("tel:") ? Intent.ACTION_DIAL : Intent.ACTION_VIEW, Uri.parse(url));
        i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        try { getContext().startActivity(i); call.resolve(); }
        catch (ActivityNotFoundException e) { call.reject("এই লিংক খোলার মতো অ্যাপ নেই"); }
    }

    /** Writes base64 data to the cache dir and opens the Android share sheet (WhatsApp, Drive, email…).
     *  Optional "pkg" (e.g. com.whatsapp) targets one app; optional "text" goes along as the message. */
    @PluginMethod
    public void shareFile(PluginCall call) {
        String name = call.getString("filename", "file");
        String mime = call.getString("mime", "application/octet-stream");
        String data = call.getString("base64", "");
        String title = call.getString("title", name);
        String text = call.getString("text", null);
        try {
            File dir = new File(getContext().getCacheDir(), "share");
            if (!dir.exists()) dir.mkdirs();
            File[] old = dir.listFiles();
            if (old != null) for (File f : old) f.delete();
            File f = new File(dir, name.replaceAll("[^\\w.\\-]", "_"));
            try (FileOutputStream out = new FileOutputStream(f)) { out.write(Base64.decode(data, Base64.DEFAULT)); }
            Uri uri = FileProvider.getUriForFile(getContext(), getContext().getPackageName() + ".fileprovider", f);
            Intent send = new Intent(Intent.ACTION_SEND);
            send.setType(mime);
            send.putExtra(Intent.EXTRA_STREAM, uri);
            send.putExtra(Intent.EXTRA_SUBJECT, title);
            if (text != null) send.putExtra(Intent.EXTRA_TEXT, text);
            send.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
            Intent chooser = Intent.createChooser(send, title);
            chooser.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_GRANT_READ_URI_PERMISSION);
            getContext().startActivity(chooser);
            call.resolve();
        } catch (Exception e) {
            call.reject("ফাইল শেয়ার করা যায়নি: " + e.getMessage());
        }
    }
}
