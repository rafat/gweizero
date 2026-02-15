"use client";

let audioContext: AudioContext | null = null;

function getContext() {
  if (typeof window === "undefined") {
    return null;
  }
  if (!audioContext) {
    audioContext = new window.AudioContext();
  }
  return audioContext;
}

function playTone({
  frequency,
  durationMs,
  gainStart = 0.0001,
  gainPeak = 0.02,
  type = "sine"
}: {
  frequency: number;
  durationMs: number;
  gainStart?: number;
  gainPeak?: number;
  type?: OscillatorType;
}) {
  const ctx = getContext();
  if (!ctx) return;

  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = type;
  osc.frequency.value = frequency;
  osc.connect(gain);
  gain.connect(ctx.destination);

  const now = ctx.currentTime;
  const duration = durationMs / 1000;
  gain.gain.setValueAtTime(gainStart, now);
  gain.gain.exponentialRampToValueAtTime(gainPeak, now + duration * 0.25);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);

  osc.start(now);
  osc.stop(now + duration);
}

export function playHoverTick() {
  playTone({ frequency: 90, durationMs: 70, gainPeak: 0.012, type: "triangle" });
}

export function playClickSwitch() {
  playTone({ frequency: 180, durationMs: 90, gainPeak: 0.02, type: "square" });
}

export function playAnalysisCompleteCue() {
  playTone({ frequency: 220, durationMs: 120, gainPeak: 0.018, type: "sine" });
  setTimeout(() => playTone({ frequency: 330, durationMs: 120, gainPeak: 0.016, type: "sine" }), 80);
  setTimeout(() => playTone({ frequency: 440, durationMs: 150, gainPeak: 0.014, type: "sine" }), 160);
}
