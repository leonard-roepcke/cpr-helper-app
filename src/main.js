import { Capacitor, registerPlugin } from "@capacitor/core";
import {
  advanceBeat,
  BEAT_MS,
  BREATH_FREQ,
  buildCyclePlan,
  formatAf,
  getAgeButtonMeta,
  getDisplayCounter,
  getHighPitchFrequency,
  getPhaseLabel,
  RATIOS,
  TICK_FREQ,
} from "./engine.js";

const Volume = registerPlugin("Volume");

const RATIO_HINTS = {
  standard: "Nur Metronom ohne Atmungspausen",
  "30:2": "30 Kompressionen, Metronom läuft durch (Atemtöne im Takt)",
  "15:2": "15 Kompressionen, Metronom läuft durch (Atemtöne im Takt)",
  "10:1": "10 Kompressionen durchgehend, Beatmung im Takt",
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
let beatTimer = null;
let nextBeatAt = 0;
let cycleState = { beatInCycle: 0 };
let lastResult = null;

function getPlan() {
  return buildCyclePlan(selectedRatio, selectedAge);
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

function playTone(frequency, volume = 0.35) {
  if (!audioCtx || !masterGain) return;

  const now = audioCtx.currentTime;
  const osc = audioCtx.createOscillator();
  const gain = audioCtx.createGain();

  osc.type = "sine";
  osc.frequency.value = frequency;
  gain.gain.setValueAtTime(0.0001, now);
  gain.gain.exponentialRampToValueAtTime(volume, now + 0.005);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.08);

  osc.connect(gain);
  gain.connect(masterGain);
  osc.start(now);
  osc.stop(now + 0.09);
}

function playBeatSound(result, plan) {
  if (result.sound === "silent") return;

  if (result.sound === "breath") {
    playTone(BREATH_FREQ, 0.45);
    return;
  }

  if (result.sound === "high") {
    playTone(getHighPitchFrequency(result.compressionCount, plan.compressions), 0.4);
    return;
  }

  playTone(TICK_FREQ, 0.35);
}

async function setMaxVolume() {
  initAudio();
  masterGain.gain.value = 1;

  if (Capacitor.isNativePlatform()) {
    try {
      await Volume.setMax();
      return;
    } catch {
      // fallback
    }
  }

  playTone(TICK_FREQ);
}

function updateAgeButtons() {
  ageButtons.forEach((btn) => {
    const meta = getAgeButtonMeta(btn.dataset.age, selectedRatio);
    const title = btn.querySelector(".age-title");
    const ageMeta = btn.querySelector(".age-meta");
    if (title) title.textContent = meta.title;
    if (ageMeta) ageMeta.textContent = meta.meta;
  });

  const ageHint = $("age-hint");
  if (ageHint) {
    ageHint.textContent = getAgeButtonMeta(selectedAge, selectedRatio).hint;
  }
}

function updateRatioInfo() {
  const plan = getPlan();
  ratioInfo.textContent = RATIO_INFO[selectedRatio];
  ratioHint.textContent = RATIO_HINTS[selectedRatio];

  if (plan.type === "interleaved") {
    ratioHint.textContent += ` · Zyklus ${plan.cycleBeats} Schläge (AF ${formatAf(plan.actualAf)}/min)`;
  } else if (plan.type === "continuous") {
    ratioHint.textContent += ` · AF ${formatAf(plan.actualAf)}/min`;
  }

  updateAgeButtons();
}

function updateDisplay() {
  phaseLabel.className = "phase";
  counter.className = "counter";

  if (!running || !lastResult) {
    phaseLabel.textContent = "Bereit";
    if (running) {
      const plan = getPlan();
      if (plan.type === "metronome") {
        phaseLabel.textContent = "Metronom";
        phaseLabel.classList.add("compressing");
        counter.textContent = "♩";
      } else {
        phaseLabel.textContent = "Kompressionen";
        phaseLabel.classList.add("compressing");
        counter.textContent = "1";
      }
      status.textContent = "Läuft";
    } else {
      counter.textContent = "—";
      status.textContent = "Gestoppt";
    }
    return;
  }

  const plan = getPlan();

  if (lastResult.phase === "metronome") {
    phaseLabel.textContent = "Metronom";
    phaseLabel.classList.add("compressing");
    counter.textContent = "♩";
    status.textContent = "Läuft";
    return;
  }

  if (lastResult.phase === "compressing") {
    phaseLabel.textContent = getPhaseLabel(lastResult, plan);
    phaseLabel.classList.add("compressing");
    counter.textContent = getDisplayCounter(lastResult, running);
    status.textContent = "Läuft";
    return;
  }

  if (lastResult.phase === "breathing") {
    phaseLabel.textContent = getPhaseLabel(lastResult, plan);
    phaseLabel.classList.add("breathing");
    counter.textContent = getDisplayCounter(lastResult, running);
    counter.classList.add("breath-beat");
    status.textContent = "Beatmen";
  }
}

function clearBeatTimer() {
  if (beatTimer) {
    clearTimeout(beatTimer);
    beatTimer = null;
  }
}

function onBeat() {
  if (!running) return;

  const plan = getPlan();
  lastResult = advanceBeat(cycleState, plan);
  playBeatSound(lastResult, plan);
  updateDisplay();
  scheduleNextBeat();
}

function scheduleNextBeat() {
  if (!running) return;

  const now = performance.now();
  if (!nextBeatAt) {
    nextBeatAt = now;
  }
  nextBeatAt += BEAT_MS;

  const delay = Math.max(0, nextBeatAt - performance.now());
  beatTimer = setTimeout(onBeat, delay);
}

function setAge(ageKey) {
  if (ageKey === selectedAge) return;
  selectedAge = ageKey;

  ageButtons.forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.age === ageKey);
  });

  updateRatioInfo();
  updateDisplay();
}

function setRatio(ratioKey) {
  if (ratioKey === selectedRatio) return;
  selectedRatio = ratioKey;

  ratioButtons.forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.ratio === ratioKey);
  });

  if (running) {
    cycleState.beatInCycle = 0;
    lastResult = null;
  }

  updateRatioInfo();
  updateDisplay();
}

function start() {
  initAudio();
  clearBeatTimer();

  running = true;
  cycleState = { beatInCycle: 0 };
  lastResult = null;
  nextBeatAt = 0;

  startBtn.disabled = true;
  stopBtn.disabled = false;

  updateDisplay();
  scheduleNextBeat();
}

function stop() {
  running = false;
  cycleState = { beatInCycle: 0 };
  lastResult = null;
  nextBeatAt = 0;
  clearBeatTimer();

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
updateRatioInfo();
updateDisplay();
