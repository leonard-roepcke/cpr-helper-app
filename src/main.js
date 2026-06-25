const BPM = 110;
const BEAT_MS = Math.round(60000 / BPM);
const BREATH_PAUSE_MS = 5000;

const RATIOS = {
  "30:2": { compressions: 30, breaths: 2, pauseMetronome: true },
  "15:2": { compressions: 15, breaths: 2, pauseMetronome: true },
  "10:1": { compressions: 10, breaths: 1, pauseMetronome: false },
};

const RATIO_HINTS = {
  "30:2": "Nach 30 Kompressionen: 5 s Pause für 2 Beatmungen",
  "15:2": "Nach 15 Kompressionen: 5 s Pause für 2 Beatmungen",
  "10:1": "Nach 10 Kompressionen: Beatmung bei laufendem Metronom",
};

const $ = (id) => document.getElementById(id);

const phaseLabel = $("phase-label");
const counter = $("counter");
const ratioInfo = $("ratio-info");
const ratioHint = $("ratio-hint");
const status = $("status");
const startBtn = $("start-btn");
const stopBtn = $("stop-btn");
const ratioButtons = document.querySelectorAll("[data-ratio]");

let audioCtx = null;
let selectedRatio = "30:2";
let running = false;
let phase = "idle";
let compressionCount = 0;
let beatTimer = null;
let breathTimer = null;
let breathCountdownTimer = null;
let nextBeatAt = 0;

function getRatio() {
  return RATIOS[selectedRatio];
}

function initAudio() {
  if (!audioCtx) {
    audioCtx = new AudioContext();
  }
  if (audioCtx.state === "suspended") {
    audioCtx.resume();
  }
}

function playTick({ breath = false } = {}) {
  if (!audioCtx) return;

  const now = audioCtx.currentTime;
  const osc = audioCtx.createOscillator();
  const gain = audioCtx.createGain();

  osc.type = "sine";
  osc.frequency.value = breath ? 880 : 660;
  gain.gain.setValueAtTime(0.0001, now);
  gain.gain.exponentialRampToValueAtTime(breath ? 0.35 : 0.28, now + 0.005);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.06);

  osc.connect(gain);
  gain.connect(audioCtx.destination);
  osc.start(now);
  osc.stop(now + 0.07);
}

function setRatio(ratioKey) {
  if (running) return;
  selectedRatio = ratioKey;
  const { compressions, breaths } = getRatio();

  ratioButtons.forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.ratio === ratioKey);
  });

  ratioInfo.textContent = `${compressions} Kompressionen · ${breaths} Beatmung${breaths > 1 ? "en" : ""}`;
  ratioHint.textContent = RATIO_HINTS[ratioKey];
}

function updateDisplay() {
  const { compressions, breaths, pauseMetronome } = getRatio();

  phaseLabel.className = "phase";
  counter.className = "counter";

  if (!running) {
    phaseLabel.textContent = "Bereit";
    counter.textContent = "—";
    status.textContent = "Gestoppt";
    return;
  }

  if (phase === "compressing") {
    phaseLabel.textContent = "Kompressionen";
    phaseLabel.classList.add("compressing");
    counter.textContent = String(compressionCount);
    status.textContent = "Läuft";
    return;
  }

  if (phase === "breathing") {
    phaseLabel.textContent = pauseMetronome
      ? `${breaths}× Beatmen`
      : "Beatmung";
    phaseLabel.classList.add("breathing");
    counter.textContent = "♡";
    status.textContent = pauseMetronome ? "Pause" : "Läuft";
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

  let secondsLeft = BREATH_PAUSE_MS / 1000;
  counter.textContent = String(secondsLeft);

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
    updateDisplay();
    scheduleNextBeat();
  }, BREATH_PAUSE_MS);
}

function onBeat() {
  const { compressions, pauseMetronome } = getRatio();
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
  ratioButtons.forEach((btn) => {
    btn.disabled = true;
  });

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
  ratioButtons.forEach((btn) => {
    btn.disabled = false;
  });

  updateDisplay();
}

startBtn.addEventListener("click", start);
stopBtn.addEventListener("click", stop);

ratioButtons.forEach((btn) => {
  btn.addEventListener("click", () => setRatio(btn.dataset.ratio));
});

setRatio("30:2");
updateDisplay();
