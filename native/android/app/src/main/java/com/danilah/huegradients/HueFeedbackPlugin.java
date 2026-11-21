package com.danilah.huegradients;

import android.os.Build;
import android.view.HapticFeedbackConstants;
import com.getcapacitor.*;
import com.getcapacitor.annotation.CapacitorPlugin;

/** System touch feedback respects the user's OS setting and needs no vibration permission. */
@CapacitorPlugin(name = "HueFeedback")
public class HueFeedbackPlugin extends Plugin {
    @PluginMethod public void pulse(PluginCall call) {
        getActivity().runOnUiThread(() -> {
            boolean win = Boolean.TRUE.equals(call.getBoolean("win", false));
            int effect = Build.VERSION.SDK_INT >= 30 && win ? HapticFeedbackConstants.CONFIRM : HapticFeedbackConstants.KEYBOARD_TAP;
            getActivity().getWindow().getDecorView().performHapticFeedback(effect);
            call.resolve();
        });
    }
}
