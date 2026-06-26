import { Capacitor, registerPlugin } from "@capacitor/core";
import {
  AGE_PROFILES,
  announceNumber,
  getBreathPauseMs,
  shouldSpeakCount,
} from "./audio.js";

const Volume = registerPlugin("Volume");

const BPM = 110;
const BEAT_MS = Math.round(60000 / BPM);

const RATIOS = {
  standard: {
    compressions: Infinity,
    breaths: 0,
    pauseMetronome: false,
    metronomeOnly: true,
  },
  "30:2": { compressions: 30, breaths: 2, pauseMetronome: true },
  "15:2": { compressions: 15, breaths: 2, pauseMetronome: true },
  "10:1": { compressions: 10, breaths: 1, pauseMetronome: false },
};

const RATIO_HINTS = {
  standard: "Nur Metronom ohne Atmungspausen",
  "30:2": "Nach 30 Kompressionen: Pause für Beatmungen",
  "15:2": "Nach 15 Kompressionen: Pause für Beatmungen",
  "10:1": "Nach 10 Kompressionen: Beatmung bei laufendem Metronom",
};

const RATIO_INFO = {
  standard: "Nur Metronom · 110/min",
  "30:2": "30 Kompressionen · 2 Beatmungen",
  "15:2": "15 Kompressionen · 2 Beatmungen",
  "10:1": "10 Kompressionen · 1 Beatmung",
};

const $ = (id) => document.getElementById(id);

const phaseLabel = $("phase-label");
const counter = $("counter");
const ratioInfo = $("ratio-info");
const ratioHint = $("ratio-hint");
const status = $("status");
const startBtn = $("start-btn");
const stopBtn = $("stop-btn");
const volumeBtn = $("volume-btn");
const ratioButtons = document.querySelectorAll("[data-ratio]");
const ageButtons = document.querySelectorAll("[data-age]");

let audioCtx = null;
let masterGain = null;
let selectedRatio = "standard";
let selectedAge = "adult";
let running = false;
let phase = "idle";
let compressionCount = 0;
let breathStep = 0;
let beatTimer = null;
let breathTimer = null;
let breathCueTimers = [];
let nextBeatAt = 0;

function getRatio() {
  return RATIOS[selectedRatio];
}

function getAgeProfile() {
  return AGE_PROFILES[selectedAge];
}

function isMetronomeOnly() {
  return Boolean(getRatio().metronomeOnly);
}

function getBreathsForCycle() {
  return getRatio().breaths || getAgeProfile().breaths;
}

function initAudio() {
  if (!audioCtx) {
    audioCtx = new AudioContext();
    masterGain = audioCtx.createGain();
    masterGain.gain.value = 1;
    masterGain.connect(audioCtx.destination);
  }
  if (audioCtx.state === "suspended") {
    audioCtx.resume();
  }
  if ("speechSynthesis" in window) {
    speechSynthesis.getVoices();
  }
}

function playTick({ breath = false } = {}) {
  if (!audioCtx || !masterGain) return;

  const now = audioCtx.currentTime;
  const osc = audioCtx.createOscillator();
  const gain = audioCtx.createGain();

  osc.type = "sine";
  osc.frequency.value = breath ? 880 : 660;
  gain.gain.setValueAtTime(0.0001, now);
  gain.gain.exponentialRampToValueAtTime(breath ? 0.45 : 0.35, now + 0.005);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.08);

  osc.connect(gain);
  gain.connect(masterGain);
  osc.start(now);
  osc.stop(now + 0.09);
}

function clearBreathCueTimers() {
  breathCueTimers.forEach((timer) => clearTimeout(timer));
  breathCueTimers = [];
}

async function setMaxVolume() {
  initAudio();
  masterGain.gain.value = 1;

  if (Capacitor.isNativePlatform()) {
    try {
      await Volume.setMax();
      return;
    } catch {
      // Web Audio fallback below
    }
  }

  playTick();
}

function updateAgeHint() {
  const profile = getAgeProfile();
  const ageHint = $("age-hint");
  if (ageHint) {
    ageHint.textContent = `${profile.range} · AF ${profile.af}/min · ${profile.ratioHint}`;
  }
}

function finishBreathPhase() {
  compressionCount = 0;
  breathStep = 0;
  phase = "compressing";
  counter.className = "counter";
  updateDisplay();
  scheduleNextBeat();
}

function setAge(ageKey) {
  if (ageKey === selectedAge) return;
  selectedAge = ageKey;

  ageButtons.forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.age === ageKey);
  });

  updateAgeHint();

  if (!running || phase !== "breathing") return;

  clearBreathCueTimers();
  if (breathTimer) {
    clearTimeout(breathTimer);
    breathTimer = null;
  }
  scheduleBreathPhase();
}

function setRatio(ratioKey) {
  if (ratioKey === selectedRatio) return;

  const wasRunning = running;
  const wasBreathing = phase === "breathing";

  selectedRatio = ratioKey;

  ratioButtons.forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.ratio === ratioKey);
  });

  ratioInfo.textContent = RATIO_INFO[ratioKey];
  ratioHint.textContent = RATIO_HINTS[ratioKey];

  if (!wasRunning) return;

  clearTimers();

  if (wasBreathing && getRatio().pauseMetronome) {
    scheduleBreathPhase();
    return;
  }

  phase = "compressing";
  compressionCount = 0;
  breathStep = 0;
  nextBeatAt = performance.now();
  scheduleNextBeat();
  updateDisplay();
}

function getCounterText() {
  if (isMetronomeOnly()) {
    return running ? "♩" : "—";
  }

  if (phase === "breathing") {
    if (compressionCount > 0) {
      return String(compressionCount);
    }
    return "♡";
  }

  if (compressionCount === 0) {
    return "—";
  }

  return String(compressionCount);
}

function updateDisplay() {
  const breaths = getBreathsForCycle();
  const { pauseMetronome } = getRatio();

  phaseLabel.className = "phase";
  counter.className = "counter";

  if (!running) {
    phaseLabel.textContent = "Bereit";
    counter.textContent = "—";
    status.textContent = "Gestoppt";
    return;
  }

  if (isMetronomeOnly()) {
    phaseLabel.textContent = "Metronom";
    phaseLabel.classList.add("compressing");
    counter.textContent = "♩";
    status.textContent = "Läuft";
    return;
  }

  if (phase === "compressing") {
    phaseLabel.textContent = "Kompressionen";
    phaseLabel.classList.add("compressing");
    counter.textContent = getCounterText();
    status.textContent = "Läuft";
    return;
  }

  if (phase === "breathing") {
    phaseLabel.textContent =
      breathStep > 0 ? `Beatmen ${breathStep}/${breaths}` : `${breaths}× Beatmen`;
    phaseLabel.classList.add("breathing");
    counter.textContent = getCounterText();
    counter.classList.add("breath-beat");
    status.textContent = pauseMetronome ? "Beatmen" : "Läuft";
  }
}

function clearTimers() {
  if (beatTimer) {
    clearTimeout(beatTimer);
    beatTimer = null;
  }
  if (breathTimer) {
    clearTimeout(breathTimer);
    breathTimer = null;
  }
  clearBreathCueTimers();
}

function scheduleBreathPhase() {
  const { pauseMetronome } = getRatio();
  const profile = getAgeProfile();
  const breaths = getBreathsForCycle();

  if (!pauseMetronome) {
    return;
  }

  phase = "breathing";
  breathStep = 1;
  updateDisplay();

  playTick({ breath: true });

  if (breaths >= 2) {
    const timer = setTimeout(() => {
      playTick({ breath: true });
      breathStep = 2;
      updateDisplay();
    }, profile.breathGapMs);
    breathCueTimers.push(timer);
  }

  breathTimer = setTimeout(() => {
    breathTimer = null;
    clearBreathCueTimers();
    finishBreathPhase();
  }, getBreathPauseMs(profile, breaths));
}

function onBeat() {
  const { compressions, pauseMetronome } = getRatio();
  const profile = getAgeProfile();
  const nextCount = compressionCount + 1;
  const isBreathBeat = !pauseMetronome && nextCount >= compressions;

  if (isMetronomeOnly()) {
    playTick();
    scheduleNextBeat();
    return;
  }

  compressionCount = nextCount;

  if (shouldSpeakCount(nextCount, compressions)) {
    announceNumber(nextCount, audioCtx, masterGain);
  } else if (!isBreathBeat) {
    playTick();
  }

  updateDisplay();

  if (isBreathBeat) {
    playTick({ breath: true });
    phase = "breathing";
    breathStep = 1;
    phaseLabel.textContent = "Beatmung";
    phaseLabel.className = "phase breathing";
    counter.className = "counter breath-beat";
    updateDisplay();

    breathTimer = setTimeout(() => {
      if (!running) return;
      finishBreathPhase();
    }, getBreathPauseMs(profile, 1));
    return;
  }

  if (compressionCount >= compressions) {
    scheduleBreathPhase();
    return;
  }

  scheduleNextBeat();
}

function scheduleNextBeat() {
  if (!running || phase !== "compressing") return;

  const now = performance.now();
  if (!nextBeatAt) {
    nextBeatAt = now;
  }
  nextBeatAt += BEAT_MS;

  const delay = Math.max(0, nextBeatAt - performance.now());
  beatTimer = setTimeout(() => {
    if (!running || phase !== "compressing") return;
    onBeat();
  }, delay);
}

function start() {
  initAudio();
  clearTimers();

  running = true;
  phase = "compressing";
  compressionCount = 0;
  breathStep = 0;
  nextBeatAt = 0;

  startBtn.disabled = true;
  stopBtn.disabled = false;

  updateDisplay();
  scheduleNextBeat();
}

function stop() {
  running = false;
  phase = "idle";
  compressionCount = 0;
  breathStep = 0;
  nextBeatAt = 0;
  clearTimers();

  if ("speechSynthesis" in window) {
    speechSynthesis.cancel();
  }

  startBtn.disabled = false;
  stopBtn.disabled = true;

  updateDisplay();
}

startBtn.addEventListener("click", start);
stopBtn.addEventListener("click", stop);
volumeBtn.addEventListener("click", setMaxVolume);

ratioButtons.forEach((btn) => {
  btn.addEventListener("click", () => setRatio(btn.dataset.ratio));
});

ageButtons.forEach((btn) => {
  btn.addEventListener("click", () => setAge(btn.dataset.age));
});

setRatio("standard");
setAge("adult");
updateDisplay();
