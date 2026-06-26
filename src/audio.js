const HIGH_PITCH_TAIL = 3;
const BREATH_INSPIRATORY_MS = 1000;

const TICK_FREQ = 660;
const HIGH_TICK_FREQS = [880, 990, 1100];

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

export function isHighPitchCount(count, totalCompressions) {
  const highFrom = totalCompressions - HIGH_PITCH_TAIL + 1;
  return count >= highFrom && count <= totalCompressions;
}

export function getHighPitchFrequency(count, totalCompressions) {
  const highFrom = totalCompressions - HIGH_PITCH_TAIL + 1;
  const index = count - highFrom;
  return HIGH_TICK_FREQS[index] ?? HIGH_TICK_FREQS[HIGH_TICK_FREQS.length - 1];
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

export { AGE_PROFILES, TICK_FREQ, HIGH_PITCH_TAIL, BREATH_INSPIRATORY_MS };
