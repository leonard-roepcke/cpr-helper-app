package com.leonardroepcke.cprhelper;

import android.media.AudioAttributes;
import android.media.AudioFormat;
import android.media.AudioTrack;

final class AudioTick {

    private static final int SAMPLE_RATE = 44100;
    private static final float DURATION_SEC = 0.09f;

    private AudioTick() {}

    static void play(float frequencyHz, float peakVolume) {
        int sampleCount = Math.max(1, Math.round(SAMPLE_RATE * DURATION_SEC));
        short[] samples = new short[sampleCount];

        for (int i = 0; i < sampleCount; i++) {
            float t = (float) i / SAMPLE_RATE;
            float envelope = envelopeAt(t, peakVolume);
            float sample = (float) Math.sin(2.0 * Math.PI * frequencyHz * t) * envelope;
            samples[i] = (short) Math.max(Short.MIN_VALUE, Math.min(Short.MAX_VALUE, sample * Short.MAX_VALUE));
        }

        int channelConfig = AudioFormat.CHANNEL_OUT_MONO;
        int audioFormat = AudioFormat.ENCODING_PCM_16BIT;
        int bufferSize = AudioTrack.getMinBufferSize(SAMPLE_RATE, channelConfig, audioFormat);
        bufferSize = Math.max(bufferSize, sampleCount * 2);

        AudioAttributes attributes =
                new AudioAttributes.Builder()
                        .setUsage(AudioAttributes.USAGE_MEDIA)
                        .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
                        .build();

        AudioFormat format =
                new AudioFormat.Builder()
                        .setSampleRate(SAMPLE_RATE)
                        .setEncoding(audioFormat)
                        .setChannelMask(channelConfig)
                        .build();

        AudioTrack track =
                new AudioTrack.Builder()
                        .setAudioAttributes(attributes)
                        .setAudioFormat(format)
                        .setTransferMode(AudioTrack.MODE_STATIC)
                        .setBufferSizeInBytes(bufferSize)
                        .build();

        track.write(samples, 0, sampleCount);
        track.play();

        track.setNotificationMarkerPosition(sampleCount);
        track.setPlaybackPositionUpdateListener(
                new AudioTrack.OnPlaybackPositionUpdateListener() {
                    @Override
                    public void onMarkerReached(AudioTrack audioTrack) {
                        audioTrack.release();
                    }

                    @Override
                    public void onPeriodicNotification(AudioTrack audioTrack) {}
                });
    }

    private static float envelopeAt(float timeSec, float peakVolume) {
        if (timeSec < 0.005f) {
            float attack = timeSec / 0.005f;
            return Math.max(0.0001f, peakVolume * attack);
        }
        if (timeSec < 0.08f) {
            float decay = (0.08f - timeSec) / 0.075f;
            return Math.max(0.0001f, peakVolume * decay);
        }
        return 0.0001f;
    }
}
