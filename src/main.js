import { Capacitor, registerPlugin } from "@capacitor/core";

const Volume = registerPlugin("Volume");

const BPM = 110;
const BEAT_MS = 60000 / BPM;
const ACCENT_EVERY = 5;

const TICK_FREQ = 660;
const ACCENT_FREQ = 880;

const $ = (id) => document.getElementById(id);

const phaseLabel = $("phase-label");
const counter = $("counter");
const status = $("status");
const startBtn = $("start-btn");
const stopBtn = $("stop-btn");
const volumeBtn = $("volume-btn");

let audioCtx = null;
let masterGain = null;
let running = false;
let beatCount = 0;
let beatTimer = null;
let nextBeatAt = 0;

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

function playTick(accent = false) {
  if (!audioCtx || !masterGain) return;

  const now = audioCtx.currentTime;
  const osc = audioCtx.createOscillator();
  const gain = audioCtx.createGain();

  osc.type = "sine";
  osc.frequency.value = accent ? ACCENT_FREQ : TICK_FREQ;
  gain.gain.setValueAtTime(0.0001, now);
  gain.gain.exponentialRampToValueAtTime(accent ? 0.42 : 0.35, now + 0.005);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.08);

  osc.connect(gain);
  gain.connect(masterGain);
  osc.start(now);
  osc.stop(now + 0.09);
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

  playTick();
}

function updateDisplay() {
  if (!running) {
    phaseLabel.textContent = "Bereit";
    phaseLabel.className = "phase";
    counter.textContent = "—";
    counter.className = "counter";
    status.textContent = "Gestoppt";
    return;
  }

  phaseLabel.textContent = "Metronom";
  phaseLabel.className = "phase active";
  counter.textContent = beatCount > 0 ? String(beatCount) : "1";
  counter.className = beatCount === ACCENT_EVERY ? "counter accent" : "counter";
  status.textContent = "Läuft";
}

function onBeat() {
  if (!running) return;

  beatCount = beatCount >= ACCENT_EVERY ? 1 : beatCount + 1;
  playTick(beatCount === ACCENT_EVERY);
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

function clearBeatTimer() {
  if (beatTimer) {
    clearTimeout(beatTimer);
    beatTimer = null;
  }
}

function start() {
  initAudio();
  clearBeatTimer();

  running = true;
  beatCount = 0;
  nextBeatAt = 0;

  startBtn.disabled = true;
  stopBtn.disabled = false;

  updateDisplay();
  scheduleNextBeat();
}

function stop() {
  running = false;
  beatCount = 0;
  nextBeatAt = 0;
  clearBeatTimer();

  startBtn.disabled = false;
  stopBtn.disabled = true;

  updateDisplay();
}

startBtn.addEventListener("click", start);
stopBtn.addEventListener("click", stop);
volumeBtn.addEventListener("click", setMaxVolume);

updateDisplay();
