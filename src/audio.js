const SPOKEN_TAIL = 3;
const BREATH_INSPIRATORY_MS = 1000;

const AGE_PROFILES = {
  adult: {
    id: "adult",
    label: "Erwachsene",
    range: "ab 12 Jahre",
    af: 10,
    ratioHint: "30:2 · 2 Beatmungen je Zyklus",
    breaths: 2,
    breathGapMs: 2000,
    postBreathPauseMs: 1500,
  },
  child: {
    id: "child",
    label: "Kind",
    range: "1–12 Jahre",
    af: 12,
    ratioHint: "15:2 · PBLS-geschult",
    breaths: 2,
    breathGapMs: 2500,
    postBreathPauseMs: 1000,
  },
  infant: {
    id: "infant",
    label: "Kleinkind",
    range: "0–1 Jahr",
    af: 20,
    ratioHint: "15:2 · sanfte Beatmung",
    breaths: 2,
    breathGapMs: 2000,
    postBreathPauseMs: 1000,
  },
};

let speechSupported = null;
const mp3Cache = new Map();
const remoteMp3Base =
  "https://translate.google.com/translate_tts?ie=UTF-8&client=tw-ob&tl=de&q=";

function canUseSpeechSynthesis() {
  if (speechSupported !== null) return speechSupported;
  speechSupported =
    "speechSynthesis" in window && "SpeechSynthesisUtterance" in window;
  return speechSupported;
}

function localMp3Url(number) {
  const base = import.meta.env.BASE_URL || "./";
  return `${base}audio/de/${number}.mp3`;
}

function remoteMp3Url(number) {
  return `${remoteMp3Base}${encodeURIComponent(String(number))}`;
}

async function fetchMp3(url) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`MP3 fetch failed: ${response.status}`);
  }
  return response.blob();
}

async function getNumberMp3Blob(number) {
  if (mp3Cache.has(number)) {
    return mp3Cache.get(number);
  }

  try {
    const blob = await fetchMp3(localMp3Url(number));
    mp3Cache.set(number, blob);
    return blob;
  } catch {
    const blob = await fetchMp3(remoteMp3Url(number));
    mp3Cache.set(number, blob);
    return blob;
  }
}

function speakWithTts(number) {
  return new Promise((resolve, reject) => {
    speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(String(number));
    utterance.lang = "de-DE";
    utterance.rate = 1.15;
    utterance.pitch = 1;
    utterance.onend = () => resolve();
    utterance.onerror = () => reject(new Error("tts failed"));
    speechSynthesis.speak(utterance);
  });
}

async function speakWithMp3(number, audioCtx, masterGain) {
  const blob = await getNumberMp3Blob(number);
  const arrayBuffer = await blob.arrayBuffer();
  const audioBuffer = await audioCtx.decodeAudioData(arrayBuffer);
  const source = audioCtx.createBufferSource();
  const gain = audioCtx.createGain();
  gain.gain.value = 0.9;
  source.buffer = audioBuffer;
  source.connect(gain);
  gain.connect(masterGain);
  source.start();
  return new Promise((resolve) => {
    source.onended = () => resolve();
  });
}

export async function speakNumber(number, audioCtx, masterGain) {
  if (canUseSpeechSynthesis()) {
    try {
      await speakWithTts(number);
      return;
    } catch {
      // MP3 fallback below
    }
  }

  if (audioCtx && masterGain) {
    await speakWithMp3(number, audioCtx, masterGain);
  }
}

export function announceNumber(number, audioCtx, masterGain) {
  speakNumber(number, audioCtx, masterGain).catch(() => {});
}

export function shouldSpeakCount(count, totalCompressions) {
  const spokenFrom = totalCompressions - SPOKEN_TAIL + 1;
  return count >= spokenFrom && count <= totalCompressions;
}

export function getBreathPauseMs(profile, breaths) {
  if (breaths <= 1) {
    return BREATH_INSPIRATORY_MS + profile.postBreathPauseMs;
  }
  return (
    BREATH_INSPIRATORY_MS * breaths +
    profile.breathGapMs * (breaths - 1) +
    profile.postBreathPauseMs
  );
}

export { AGE_PROFILES, SPOKEN_TAIL, BREATH_INSPIRATORY_MS };
