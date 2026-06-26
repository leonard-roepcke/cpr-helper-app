import { Capacitor, registerPlugin } from "@capacitor/core";

const Volume = registerPlugin("Volume");

const BPM = 110;
const BEAT_MS = Math.round(60000 / BPM);
const BREATH_PAUSE_MS = 5000;
const BREATH_CUE_INTERVAL_MS = 2000;

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
  "30:2": "Nach 30 Kompressionen: 5 s Pause für 2 Beatmungen",
  "15:2": "Nach 15 Kompressionen: 5 s Pause für 2 Beatmungen",
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

let audioCtx = null;
let masterGain = null;
let selectedRatio = "standard";
let running = false;
let phase = "idle";
let compressionCount = 0;
let beatTimer = null;
let breathTimer = null;
let breathCountdownTimer = null;
let breathCueTimers = [];
let nextBeatAt = 0;

function getRatio() {
  return RATIOS[selectedRatio];
}

function isMetronomeOnly() {
  return Boolean(getRatio().metronomeOnly);
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

function scheduleBreathCues(breaths) {
  clearBreathCueTimers();
  playTick({ breath: true });

  for (let i = 1; i < breaths; i += 1) {
    const timer = setTimeout(() => {
      playTick({ breath: true });
    }, BREATH_CUE_INTERVAL_MS * i);
    breathCueTimers.push(timer);
  }
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

function setRatio(ratioKey) {
  if (ratioKey === selectedRatio) return;

  const wasRunning = running;

  selectedRatio = ratioKey;

  ratioButtons.forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.ratio === ratioKey);
  });

  ratioInfo.textContent = RATIO_INFO[ratioKey];
  ratioHint.textContent = RATIO_HINTS[ratioKey];

  if (!wasRunning) return;

  clearTimers();
  clearBreathCueTimers();

  if (isMetronomeOnly()) {
    phase = "compressing";
    compressionCount = 0;
    nextBeatAt = performance.now();
    scheduleNextBeat();
    updateDisplay();
    return;
  }

  phase = "compressing";
  compressionCount = 0;
  nextBeatAt = performance.now();
  scheduleNextBeat();
  updateDisplay();
}

function getCounterText() {
  if (isMetronomeOnly()) {
    return running ? "♩" : "—";
  }

  if (phase === "breathing") {
    return "♡";
  }

  if (compressionCount === 0) {
    return "—";
  }

  return String(compressionCount);
}

function updateDisplay() {
  const { breaths, pauseMetronome } = getRatio();

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
    phaseLabel.textContent = pauseMetronome
      ? `${breaths}× Beatmen`
      : "Beatmung";
    phaseLabel.classList.add("breathing");
    counter.textContent = getCounterText();
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
  if (breathCountdownTimer) {
    clearInterval(breathCountdownTimer);
    breathCountdownTimer = null;
  }
  clearBreathCueTimers();
}

function scheduleBreathPhase() {
  const { breaths, pauseMetronome } = getRatio();
  phase = "breathing";
  updateDisplay();

  if (!pauseMetronome) {
    compressionCount = 0;
    phase = "compressing";
    updateDisplay();
    return;
  }

  scheduleBreathCues(breaths);

  let secondsLeft = BREATH_PAUSE_MS / 1000;
  counter.textContent = String(secondsLeft);
  counter.classList.add("breath-beat");

  breathCountdownTimer = setInterval(() => {
    secondsLeft -= 1;
    if (secondsLeft > 0) {
      counter.textContent = String(secondsLeft);
    }
  }, 1000);

  breathTimer = setTimeout(() => {
    clearInterval(breathCountdownTimer);
    breathCountdownTimer = null;
    compressionCount = 0;
    phase = "compressing";
    counter.className = "counter";
    updateDisplay();
    scheduleNextBeat();
  }, BREATH_PAUSE_MS);
}

function onBeat() {
  const { compressions, pauseMetronome } = getRatio();

  if (isMetronomeOnly()) {
    playTick();
    scheduleNextBeat();
    return;
  }

  const isBreathBeat =
    !pauseMetronome && compressionCount + 1 >= compressions;

  playTick({ breath: isBreathBeat });
  compressionCount += 1;

  if (isBreathBeat) {
    phaseLabel.textContent = "Beatmung";
    phaseLabel.className = "phase breathing";
    counter.textContent = "♡";
    counter.className = "counter breath-beat";
    compressionCount = 0;
    scheduleNextBeat();
    return;
  }

  if (compressionCount >= compressions) {
    scheduleBreathPhase();
    if (pauseMetronome) return;
  }

  updateDisplay();
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
  nextBeatAt = 0;
  clearTimers();

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

setRatio("standard");
updateDisplay();
