import { Capacitor, registerPlugin } from "@capacitor/core";

const Volume = registerPlugin("Volume");
const Session = registerPlugin("Session");

const isNative = Capacitor.isNativePlatform();

const BPM = 110;
const BEAT_MS = 60000 / BPM;
const ACCENT_EVERY = 5;

const TICK_FREQ = 660;
const ACCENT_FREQ = 880;

const $ = (id) => document.getElementById(id);

const phaseLabel = $("phase-label");
const counter = $("counter");
const status = $("status");
const sessionTimer = $("session-timer");
const startBtn = $("start-btn");
const stopBtn = $("stop-btn");
const volumeBtn = $("volume-btn");

let audioCtx = null;
let masterGain = null;
let running = false;
let beatCount = 0;
let beatTimer = null;
let nextBeatAt = 0;
let timerInterval = null;
let timerStartedAt = 0;

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

function isAccent(count) {
  return count > 0 && count % ACCENT_EVERY === 0;
}

function formatTime(ms) {
  const totalSec = Math.floor(ms / 1000);
  const hours = Math.floor(totalSec / 3600);
  const minutes = Math.floor((totalSec % 3600) / 60);
  const seconds = totalSec % 60;

  if (hours > 0) {
    return `${hours}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
  }

  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

function updateTimerDisplay() {
  if (!timerStartedAt) {
    sessionTimer.textContent = "00:00";
    return;
  }

  sessionTimer.textContent = formatTime(Date.now() - timerStartedAt);
}

function startTimer() {
  stopTimer();
  timerStartedAt = Date.now();
  sessionTimer.classList.add("running");
  updateTimerDisplay();
  timerInterval = setInterval(updateTimerDisplay, 250);
}

function stopTimer() {
  if (timerInterval) {
    clearInterval(timerInterval);
    timerInterval = null;
  }
  sessionTimer.classList.remove("running");
}

function playTick(accent = false) {
  if (isNative) {
    Session.playTick({ accent }).catch(() => {});
    return;
  }

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
    counter.textContent = beatCount > 0 ? String(beatCount) : "—";
    counter.className = "counter";
    status.textContent = "Gestoppt";
    return;
  }

  phaseLabel.textContent = "Metronom";
  phaseLabel.className = "phase active";
  counter.textContent = beatCount > 0 ? String(beatCount) : "—";
  counter.className = isAccent(beatCount) ? "counter accent" : "counter";
  status.textContent = "Läuft";
}

function onBeat() {
  if (!running) return;

  beatCount += 1;
  playTick(isAccent(beatCount));
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

  startTimer();
  updateDisplay();

  if (isNative) {
    Session.start({ bpm: BPM, accentEvery: ACCENT_EVERY }).catch(() => {});
    return;
  }

  scheduleNextBeat();
}

function stop() {
  running = false;
  nextBeatAt = 0;
  clearBeatTimer();
  stopTimer();
  updateTimerDisplay();

  if (isNative) {
    Session.stop().catch(() => {});
  }

  startBtn.disabled = false;
  stopBtn.disabled = true;

  updateDisplay();
}

if (isNative) {
  Session.addListener("beat", ({ beatCount: count }) => {
    if (!running) return;
    beatCount = count;
    updateDisplay();
  });
}

startBtn.addEventListener("click", start);
stopBtn.addEventListener("click", stop);
volumeBtn.addEventListener("click", setMaxVolume);

updateDisplay();
