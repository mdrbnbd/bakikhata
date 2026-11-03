package com.dfaster.bakikhata;

import android.Manifest;
import android.app.PendingIntent;
import android.content.ActivityNotFoundException;
import android.content.Intent;
import android.net.Uri;
import android.os.Build;
import android.telephony.SmsManager;
import android.util.Base64;
import androidx.core.content.FileProvider;
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

/** Phone features for বাকি খাতা: SMS (compose or auto-send), external links (WhatsApp, tel:), sharing files. */
@CapacitorPlugin(name = "BakiNative", permissions = { @Permission(alias = "sms", strings = { Manifest.permission.SEND_SMS }) })
public class BakiNativePlugin extends Plugin {

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

    /** Sends the SMS directly (multipart for long Bangla text). Requires SEND_SMS runtime permission. */
    @PluginMethod
    public void sendSms(PluginCall call) {
        if (getPermissionState("sms") != PermissionState.GRANTED) {
            requestPermissionForAlias("sms", call, "smsPermCallback");
            return;
        }
        doSend(call);
    }

    @PermissionCallback
    private void smsPermCallback(PluginCall call) {
        if (getPermissionState("sms") == PermissionState.GRANTED) doSend(call);
        else call.reject("SMS পাঠানোর অনুমতি দেওয়া হয়নি");
    }

    @SuppressWarnings("deprecation")
    private void doSend(PluginCall call) {
        String phone = call.getString("phone", "");
        String body = call.getString("body", "");
        if (phone.isEmpty() || body.isEmpty()) { call.reject("নম্বর বা লেখা নেই"); return; }
        try {
            SmsManager sm = Build.VERSION.SDK_INT >= 31
                ? getContext().getSystemService(SmsManager.class)
                : SmsManager.getDefault();
            ArrayList<String> parts = sm.divideMessage(body);
            if (parts.size() > 1) sm.sendMultipartTextMessage(phone, null, parts, null, null);
            else sm.sendTextMessage(phone, null, body, (PendingIntent) null, null);
            JSObject r = new JSObject();
            r.put("parts", parts.size());
            call.resolve(r);
        } catch (Exception e) {
            call.reject("SMS পাঠানো যায়নি: " + e.getMessage());
        }
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

    /** Writes base64 data to the cache dir and opens the Android share sheet (save to Drive, WhatsApp, email…). */
    @PluginMethod
    public void shareFile(PluginCall call) {
        String name = call.getString("filename", "file");
        String mime = call.getString("mime", "application/octet-stream");
        String data = call.getString("base64", "");
        String title = call.getString("title", name);
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
