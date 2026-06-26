export const BPM = 110;
export const BEAT_MS = 60000 / BPM;

export const HIGH_PITCH_TAIL = 3;

export const TICK_FREQ = 660;
export const BREATH_FREQ = 880;
export const HIGH_TICK_FREQS = [880, 990, 1100];

export const RATIOS = {
  standard: {
    id: "standard",
    metronomeOnly: true,
    compressions: 0,
    breaths: 0,
    continuous: false,
  },
  "30:2": {
    id: "30:2",
    compressions: 30,
    breaths: 2,
    continuous: false,
  },
  "15:2": {
    id: "15:2",
    compressions: 15,
    breaths: 2,
    continuous: false,
  },
  "10:1": {
    id: "10:1",
    compressions: 10,
    breaths: 1,
    continuous: true,
  },
};

export const AGE_PROFILES = {
  adult: {
    id: "adult",
    label: "Erwachsene",
    range: "ab 12 Jahre",
    targetAf: 10,
  },
  child: {
    id: "child",
    label: "Kind",
    range: "1–12 Jahre",
    targetAf: 12,
  },
  infant: {
    id: "infant",
    label: "Kleinkind",
    range: "0–1 Jahr",
    targetAf: 20,
  },
};

export function formatAf(value) {
  return value.toFixed(1).replace(".", ",");
}

function evenBeatCount(beats) {
  const even = beats % 2 === 0 ? beats : beats + 1;
  return Math.max(2, even);
}

export function buildCyclePlan(ratioId, ageId) {
  const ratio = RATIOS[ratioId];
  const age = AGE_PROFILES[ageId];

  if (ratio.metronomeOnly) {
    return {
      type: "metronome",
      ratioId,
      ageId,
      compressions: 0,
      breaths: 0,
      breathPhaseBeats: 0,
      cycleBeats: 0,
      targetAf: age.targetAf,
      actualAf: null,
    };
  }

  if (ratio.continuous) {
    const cycleBeats = ratio.compressions;
    const actualAf = (ratio.breaths * 60000) / (cycleBeats * BEAT_MS);
    return {
      type: "continuous",
      ratioId,
      ageId,
      compressions: ratio.compressions,
      breaths: ratio.breaths,
      breathPhaseBeats: 0,
      cycleBeats,
      targetAf: age.targetAf,
      actualAf,
    };
  }

  const { compressions, breaths } = ratio;
  const targetAf = age.targetAf;

  let breathPhaseBeats = Math.round((breaths * 60000) / (targetAf * BEAT_MS));
  breathPhaseBeats = evenBeatCount(Math.max(breaths * 2, breathPhaseBeats));

  const cycleBeats = compressions + breathPhaseBeats;
  const actualAf = (breaths * 60000) / (breathPhaseBeats * BEAT_MS);

  return {
    type: "interleaved",
    ratioId,
    ageId,
    compressions,
    breaths,
    breathPhaseBeats,
    cycleBeats,
    targetAf,
    actualAf,
  };
}

export function isHighPitchCount(count, totalCompressions) {
  if (totalCompressions <= 0) return false;
  const highFrom = totalCompressions - HIGH_PITCH_TAIL + 1;
  return count >= highFrom && count <= totalCompressions;
}

export function getHighPitchFrequency(count, totalCompressions) {
  const highFrom = totalCompressions - HIGH_PITCH_TAIL + 1;
  const index = Math.max(0, count - highFrom);
  return HIGH_TICK_FREQS[index] ?? HIGH_TICK_FREQS[HIGH_TICK_FREQS.length - 1];
}

/**
 * Single metronome tick – always advances the global beat counter.
 * Returns what to play and show; sound "silent" means no audio.
 */
export function advanceBeat(state, plan) {
  if (state.beatInCycle >= plan.cycleBeats) {
    state.beatInCycle = 0;
  }
  state.beatInCycle += 1;

  if (plan.type === "metronome") {
    return {
      sound: "tick",
      compressionCount: 0,
      breathStep: 0,
      phase: "metronome",
      absoluteBeat: state.beatInCycle,
    };
  }

  if (plan.type === "continuous") {
    const compressionCount = state.beatInCycle;
    const isBreathBeat = compressionCount >= plan.compressions;

    if (isBreathBeat) {
      return {
        sound: "breath",
        compressionCount: plan.compressions,
        breathStep: 1,
        phase: "breathing",
        absoluteBeat: state.beatInCycle,
      };
    }

    return {
      sound: isHighPitchCount(compressionCount, plan.compressions)
        ? "high"
        : "tick",
      compressionCount,
      breathStep: 0,
      phase: "compressing",
      absoluteBeat: state.beatInCycle,
    };
  }

  if (state.beatInCycle <= plan.compressions) {
    const compressionCount = state.beatInCycle;
    return {
      sound: isHighPitchCount(compressionCount, plan.compressions)
        ? "high"
        : "tick",
      compressionCount,
      breathStep: 0,
      phase: "compressing",
      absoluteBeat: state.beatInCycle,
    };
  }

  const breathOffset = state.beatInCycle - plan.compressions;
  const breathStep = Math.ceil(breathOffset / 2);
  const isBreathTone =
    breathOffset % 2 === 1 && breathStep <= plan.breaths;

  return {
    sound: isBreathTone ? "breath" : "silent",
    compressionCount: plan.compressions,
    breathStep: Math.min(breathStep, plan.breaths),
    phase: "breathing",
    absoluteBeat: state.beatInCycle,
  };
}

export function getDisplayCounter(result, running) {
  if (!running) return "—";

  if (result.phase === "metronome") {
    return "♩";
  }

  if (result.phase === "compressing") {
    return String(result.compressionCount);
  }

  if (result.phase === "breathing") {
    return String(result.compressionCount);
  }

  return "—";
}

export function getPhaseLabel(result, plan) {
  if (result.phase === "metronome") return "Metronom";
  if (result.phase === "compressing") return "Kompressionen";
  if (result.phase === "breathing") {
    return `Beatmen ${result.breathStep}/${plan.breaths}`;
  }
  return "Bereit";
}

export function getAgeButtonMeta(ageId, ratioId) {
  const plan = buildCyclePlan(ratioId, ageId);
  const age = AGE_PROFILES[ageId];
  const afText =
    plan.actualAf === null
      ? `Ziel ${formatAf(age.targetAf)}`
      : `AF ${formatAf(plan.actualAf)}`;

  return {
    title: age.label,
    meta: `${age.range} · ${afText}/min`,
    hint: `${age.range} · ${afText}/min · Zyklus ${plan.cycleBeats || "∞"} Schläge`,
  };
}
