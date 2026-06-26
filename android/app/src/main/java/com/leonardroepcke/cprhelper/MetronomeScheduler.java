package com.leonardroepcke.cprhelper;

import android.os.Handler;
import android.os.HandlerThread;
import android.os.SystemClock;

final class MetronomeScheduler {

    interface Listener {
        void onBeat(int beatCount, boolean accent);
    }

    private HandlerThread thread;
    private Handler handler;
    private Runnable tickRunnable;
    private boolean running;
    private int bpm;
    private int accentEvery;
    private int beatCount;
    private long nextBeatAtMs;
    private Listener listener;

    void start(int bpm, int accentEvery, Listener listener) {
        stop();

        this.bpm = bpm;
        this.accentEvery = accentEvery;
        this.listener = listener;
        this.beatCount = 0;
        this.running = true;
        this.nextBeatAtMs = SystemClock.elapsedRealtime();

        thread = new HandlerThread("cprhelper-metronome");
        thread.start();
        handler = new Handler(thread.getLooper());

        tickRunnable =
                new Runnable() {
                    @Override
                    public void run() {
                        if (!running || listener == null) {
                            return;
                        }

                        beatCount++;
                        boolean accent = beatCount % accentEvery == 0;
                        listener.onBeat(beatCount, accent);

                        long beatMs = 60000L / bpm;
                        nextBeatAtMs += beatMs;
                        long delay = Math.max(0, nextBeatAtMs - SystemClock.elapsedRealtime());
                        handler.postDelayed(this, delay);
                    }
                };

        long beatMs = 60000L / bpm;
        nextBeatAtMs += beatMs;
        long delay = Math.max(0, nextBeatAtMs - SystemClock.elapsedRealtime());
        handler.postDelayed(tickRunnable, delay);
    }

    void stop() {
        running = false;
        listener = null;
        beatCount = 0;

        if (handler != null) {
            handler.removeCallbacksAndMessages(null);
            handler = null;
        }

        if (thread != null) {
            thread.quitSafely();
            thread = null;
        }

        tickRunnable = null;
    }

    boolean isRunning() {
        return running;
    }
}
