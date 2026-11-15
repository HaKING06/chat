let ctx = null;
let muted = false;

try {
  muted = localStorage.getItem("haking.sfx.muted") === "1";
} catch {}

function audioCtx() {
  if (muted || typeof window === "undefined") return null;
  const Ctor = window.AudioContext || window.webkitAudioContext;
  if (!Ctor) return null;
  if (!ctx) ctx = new Ctor();
  if (ctx.state === "suspended") ctx.resume().catch(() => {});
  return ctx;
}

function tone({
  freq = 440,
  endFreq = null,
  duration = 0.09,
  gain = 0.05,
  type = "sine",
  delay = 0,
}) {
  const c = audioCtx();
  if (!c) return;
  const start = c.currentTime + delay;
  const osc = c.createOscillator();
  const vol = c.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, start);
  if (endFreq !== null) {
    osc.frequency.exponentialRampToValueAtTime(
      Math.max(30, endFreq),
      start + duration,
    );
  }
  vol.gain.setValueAtTime(0.0001, start);
  vol.gain.exponentialRampToValueAtTime(gain, start + 0.012);
  vol.gain.exponentialRampToValueAtTime(0.0001, start + duration);
  osc.connect(vol);
  vol.connect(c.destination);
  osc.start(start);
  osc.stop(start + duration + 0.02);
}

export function isSfxMuted() {
  return muted;
}

export function toggleSfxMute() {
  muted = !muted;
  try {
    localStorage.setItem("haking.sfx.muted", muted ? "1" : "0");
  } catch {}
  if (!muted) tone({ freq: 587, endFreq: 784, duration: 0.08, gain: 0.04 });
  return muted;
}

export function playMove(symbol = "X") {
  tone({
    freq: symbol === "O" ? 415 : 520,
    endFreq: symbol === "O" ? 520 : 660,
    duration: 0.08,
    gain: 0.045,
    type: "triangle",
  });
}

export function playCard() {
  tone({
    freq: 310,
    endFreq: 190,
    duration: 0.06,
    gain: 0.035,
    type: "triangle",
  });
}

export function playChip() {
  tone({ freq: 1480, endFreq: 1860, duration: 0.045, gain: 0.03, type: "sine" });
  tone({
    freq: 1960,
    endFreq: 2220,
    duration: 0.04,
    gain: 0.022,
    type: "sine",
    delay: 0.03,
  });
}

export function playTick() {
  tone({ freq: 720, duration: 0.035, gain: 0.02, type: "sine" });
}

export function playWin() {
  tone({ freq: 523.25, duration: 0.11, gain: 0.045, type: "triangle", delay: 0 });
  tone({
    freq: 659.25,
    duration: 0.11,
    gain: 0.045,
    type: "triangle",
    delay: 0.08,
  });
  tone({
    freq: 783.99,
    duration: 0.18,
    gain: 0.055,
    type: "triangle",
    delay: 0.16,
  });
}

export function playBlackjack() {
  tone({ freq: 587.33, duration: 0.1, gain: 0.045, type: "triangle", delay: 0 });
  tone({
    freq: 739.99,
    duration: 0.1,
    gain: 0.045,
    type: "triangle",
    delay: 0.07,
  });
  tone({
    freq: 880,
    duration: 0.12,
    gain: 0.05,
    type: "triangle",
    delay: 0.14,
  });
  tone({
    freq: 1174.66,
    duration: 0.24,
    gain: 0.055,
    type: "triangle",
    delay: 0.22,
  });
}

export function playDraw() {
  tone({ freq: 440, duration: 0.1, gain: 0.035, type: "sine", delay: 0 });
  tone({ freq: 392, duration: 0.14, gain: 0.03, type: "sine", delay: 0.09 });
}

export function playDiceRoll() {
  for (let i = 0; i < 4; i++) {
    tone({
      freq: 220 + i * 75,
      endFreq: 140 + i * 40,
      duration: 0.045,
      gain: 0.03,
      type: "triangle",
      delay: i * 0.055,
    });
  }
}

export function playDiceLock() {
  tone({ freq: 680, endFreq: 960, duration: 0.055, gain: 0.03, type: "sine" });
}

export function playFarkle() {
  tone({ freq: 310, endFreq: 185, duration: 0.16, gain: 0.045, type: "sawtooth", delay: 0 });
  tone({ freq: 210, endFreq: 110, duration: 0.24, gain: 0.04, type: "triangle", delay: 0.12 });
}

export function playChessMove() {
  tone({ freq: 185, endFreq: 120, duration: 0.055, gain: 0.045, type: "triangle" });
}

export function playChessCapture() {
  tone({ freq: 260, endFreq: 110, duration: 0.08, gain: 0.055, type: "triangle", delay: 0 });
  tone({ freq: 145, endFreq: 85, duration: 0.09, gain: 0.045, type: "sine", delay: 0.04 });
}

export function playChessCheck() {
  tone({ freq: 620, endFreq: 780, duration: 0.09, gain: 0.045, type: "triangle", delay: 0 });
  tone({ freq: 780, endFreq: 940, duration: 0.12, gain: 0.045, type: "triangle", delay: 0.07 });
}

export function playMention() {
  tone({ freq: 880, duration: 0.08, gain: 0.04, type: "sine", delay: 0 });
  tone({ freq: 1174.66, duration: 0.14, gain: 0.045, type: "sine", delay: 0.075 });
}

export function playTileDraw() {
  tone({ freq: 420, endFreq: 560, duration: 0.045, gain: 0.036, type: "triangle" });
}

export function playTilePlace() {
  tone({ freq: 290, endFreq: 160, duration: 0.05, gain: 0.045, type: "triangle" });
  tone({ freq: 620, endFreq: 420, duration: 0.035, gain: 0.02, type: "sine", delay: 0.015 });
}

export function playTileOpen() {
  for (let i = 0; i < 3; i++) {
    tone({
      freq: 360 + i * 110,
      endFreq: 260 + i * 80,
      duration: 0.06,
      gain: 0.035,
      type: "triangle",
      delay: i * 0.045,
    });
  }
}

export function playTilePenalty() {
  tone({ freq: 240, endFreq: 140, duration: 0.16, gain: 0.045, type: "sawtooth", delay: 0 });
  tone({ freq: 180, endFreq: 110, duration: 0.2, gain: 0.04, type: "triangle", delay: 0.09 });
}
