package com.leonardroepcke.cprhelper;

import android.content.Context;
import android.media.AudioManager;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

@CapacitorPlugin(name = "Volume")
public class VolumePlugin extends Plugin {

    @PluginMethod
    public void setMax(PluginCall call) {
        AudioManager audio =
                (AudioManager) getContext().getSystemService(Context.AUDIO_SERVICE);
        int max = audio.getStreamMaxVolume(AudioManager.STREAM_MUSIC);
        audio.setStreamVolume(
                AudioManager.STREAM_MUSIC, max, AudioManager.FLAG_SHOW_UI);
        call.resolve();
    }
}
