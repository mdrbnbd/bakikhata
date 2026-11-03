package com.dfaster.bakikhata;

import android.os.Bundle;
import android.webkit.WebView;
import androidx.activity.OnBackPressedCallback;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(BakiNativePlugin.class);
        super.onCreate(savedInstanceState);
        // Hardware / gesture back: let the web app close an open sheet or step back first
        // (window.bkBack returns true = handled, "exit" = leave app, false = default history handling).
        getOnBackPressedDispatcher().addCallback(this, new OnBackPressedCallback(true) {
            @Override public void handleOnBackPressed() {
                WebView w = bridge != null ? bridge.getWebView() : null;
                if (w == null) { leave(); return; }
                w.evaluateJavascript("(function(){try{var r=window.bkBack&&window.bkBack();return r===true?'true':(r||'')+''+'|'+location.hash}catch(e){return '|'}})()", value -> {
                    String v = value == null ? "" : value.replace("\"", "");
                    if (v.equals("true")) return;
                    String[] parts = v.split("\\|", -1);
                    String verdict = parts.length > 0 ? parts[0] : "";
                    String hash = parts.length > 1 ? parts[1] : "";
                    boolean atHome = hash.isEmpty() || hash.equals("#/") || hash.startsWith("#/home");
                    if (!verdict.equals("exit") && !atHome && w.canGoBack()) { w.goBack(); return; }
                    leave();
                });
            }
        });
    }

    private void leave() { moveTaskToBack(true); }
}
