package com.leonardroepcke.cprhelper;

import android.content.Context;
import android.os.PowerManager;
import android.view.WindowManager;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

@CapacitorPlugin(name = "Session")
public class SessionPlugin extends Plugin {

    private static final float TICK_FREQ = 660f;
    private static final float ACCENT_FREQ = 880f;
    private static final float TICK_VOLUME = 0.35f;
    private static final float ACCENT_VOLUME = 0.42f;

    private PowerManager.WakeLock wakeLock;
    private final MetronomeScheduler metronome = new MetronomeScheduler();

    @PluginMethod
    public void start(PluginCall call) {
        int bpm = call.getInt("bpm", 110);
        int accentEvery = call.getInt("accentEvery", 5);

        getActivity()
                .runOnUiThread(
                        () ->
                                getActivity()
                                        .getWindow()
                                        .addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON));

        acquireWakeLock();

        metronome.start(
                bpm,
                accentEvery,
                (beatCount, accent) -> {
                    float frequency = accent ? ACCENT_FREQ : TICK_FREQ;
                    float volume = accent ? ACCENT_VOLUME : TICK_VOLUME;
                    AudioTick.play(frequency, volume);

                    JSObject event = new JSObject();
                    event.put("beatCount", beatCount);
                    event.put("accent", accent);
                    notifyListeners("beat", event);
                });

        call.resolve();
    }

    @PluginMethod
    public void stop(PluginCall call) {
        metronome.stop();

        getActivity()
                .runOnUiThread(
                        () ->
                                getActivity()
                                        .getWindow()
                                        .clearFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON));

        releaseWakeLock();
        call.resolve();
    }

    @PluginMethod
    public void playTick(PluginCall call) {
        boolean accent = call.getBoolean("accent", false);
        float frequency = accent ? ACCENT_FREQ : TICK_FREQ;
        float volume = accent ? ACCENT_VOLUME : TICK_VOLUME;
        AudioTick.play(frequency, volume);
        call.resolve();
    }

    @Override
    protected void handleOnDestroy() {
        metronome.stop();
        releaseWakeLock();
        super.handleOnDestroy();
    }

    private void acquireWakeLock() {
        PowerManager powerManager =
                (PowerManager) getContext().getSystemService(Context.POWER_SERVICE);
        if (wakeLock == null) {
            wakeLock =
                    powerManager.newWakeLock(
                            PowerManager.PARTIAL_WAKE_LOCK, "cprhelper:metronome");
            wakeLock.setReferenceCounted(false);
        }
        if (!wakeLock.isHeld()) {
            wakeLock.acquire();
        }
    }

    private void releaseWakeLock() {
        if (wakeLock != null && wakeLock.isHeld()) {
            wakeLock.release();
        }
    }
}
