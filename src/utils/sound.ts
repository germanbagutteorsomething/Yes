// Synthesized acoustic wooden-board chess sounds via Web Audio API (100% offline)

export type ChessSoundKind =
  | 'move'
  | 'capture'
  | 'castle'
  | 'check'
  | 'promote'
  | 'select'
  | 'gameover'
  | 'draw'
  | 'illegal';

let audioCtx: AudioContext | null = null;
let noiseBuffer: AudioBuffer | null = null;

function getAudioContext(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  if (!audioCtx) {
    const AudioContextClass =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (AudioContextClass) {
      audioCtx = new AudioContextClass();
    }
  }
  if (audioCtx && audioCtx.state === 'suspended') {
    audioCtx.resume().catch(() => {});
  }
  return audioCtx;
}

function getNoiseBuffer(ctx: AudioContext): AudioBuffer {
  if (noiseBuffer && noiseBuffer.sampleRate === ctx.sampleRate) {
    return noiseBuffer;
  }
  const length = Math.floor(ctx.sampleRate * 0.08);
  const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < length; i++) {
    data[i] = Math.random() * 2 - 1;
  }
  noiseBuffer = buffer;
  return buffer;
}

function playWoodImpact(
  ctx: AudioContext,
  options: {
    delay?: number;
    baseFreq: number;
    endFreq: number;
    duration: number;
    bodyGain: number;
    noiseFreq: number;
    noiseQ?: number;
    noiseGain: number;
    noiseDuration?: number;
  }
) {
  const {
    delay = 0,
    baseFreq,
    endFreq,
    duration,
    bodyGain,
    noiseFreq,
    noiseQ = 1.6,
    noiseGain,
    noiseDuration = 0.025,
  } = options;

  const now = ctx.currentTime + delay;

  // 1. Resonant wooden body thud
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = 'triangle';
  osc.frequency.setValueAtTime(baseFreq, now);
  osc.frequency.exponentialRampToValueAtTime(Math.max(endFreq, 28), now + duration);

  gain.gain.setValueAtTime(0.001, now);
  gain.gain.linearRampToValueAtTime(bodyGain, now + 0.004);
  gain.gain.exponentialRampToValueAtTime(0.0008, now + duration);

  osc.connect(gain);
  gain.connect(ctx.destination);
  osc.start(now);
  osc.stop(now + duration + 0.01);

  // 2. Crisp contact transient (filtered noise)
  const noise = ctx.createBufferSource();
  noise.buffer = getNoiseBuffer(ctx);

  const filter = ctx.createBiquadFilter();
  filter.type = 'bandpass';
  filter.frequency.setValueAtTime(noiseFreq, now);
  filter.Q.setValueAtTime(noiseQ, now);

  const nGain = ctx.createGain();
  nGain.gain.setValueAtTime(0.001, now);
  nGain.gain.linearRampToValueAtTime(noiseGain, now + 0.002);
  nGain.gain.exponentialRampToValueAtTime(0.0008, now + noiseDuration);

  noise.connect(filter);
  filter.connect(nGain);
  nGain.connect(ctx.destination);
  noise.start(now);
  noise.stop(now + noiseDuration + 0.01);
}

function playTone(
  ctx: AudioContext,
  freq: number,
  endFreq: number,
  duration: number,
  type: OscillatorType,
  gainPeak: number,
  delay = 0
) {
  const now = ctx.currentTime + delay;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();

  osc.type = type;
  osc.frequency.setValueAtTime(freq, now);
  osc.frequency.exponentialRampToValueAtTime(Math.max(endFreq, 20), now + duration);

  gain.gain.setValueAtTime(0.001, now);
  gain.gain.linearRampToValueAtTime(gainPeak, now + 0.008);
  gain.gain.exponentialRampToValueAtTime(0.0008, now + duration);

  osc.connect(gain);
  gain.connect(ctx.destination);

  osc.start(now);
  osc.stop(now + duration + 0.01);
}

export function playChessSound(kind: ChessSoundKind, enabled: boolean) {
  if (!enabled) return;
  try {
    const ctx = getAudioContext();
    if (!ctx) return;

    switch (kind) {
      case 'select':
        playTone(ctx, 320, 220, 0.025, 'sine', 0.032);
        break;

      case 'move':
        playWoodImpact(ctx, {
          baseFreq: 195,
          endFreq: 82,
          duration: 0.068,
          bodyGain: 0.17,
          noiseFreq: 950,
          noiseQ: 1.4,
          noiseGain: 0.11,
          noiseDuration: 0.022,
        });
        break;

      case 'capture':
        playWoodImpact(ctx, {
          baseFreq: 270,
          endFreq: 68,
          duration: 0.088,
          bodyGain: 0.22,
          noiseFreq: 1650,
          noiseQ: 1.2,
          noiseGain: 0.22,
          noiseDuration: 0.034,
        });
        playTone(ctx, 540, 210, 0.038, 'triangle', 0.09, 0.003);
        break;

      case 'castle':
        playWoodImpact(ctx, {
          delay: 0,
          baseFreq: 190,
          endFreq: 84,
          duration: 0.06,
          bodyGain: 0.15,
          noiseFreq: 900,
          noiseGain: 0.1,
          noiseDuration: 0.02,
        });
        playWoodImpact(ctx, {
          delay: 0.085,
          baseFreq: 225,
          endFreq: 95,
          duration: 0.068,
          bodyGain: 0.16,
          noiseFreq: 1100,
          noiseGain: 0.11,
          noiseDuration: 0.022,
        });
        break;

      case 'check':
        playWoodImpact(ctx, {
          baseFreq: 215,
          endFreq: 85,
          duration: 0.072,
          bodyGain: 0.16,
          noiseFreq: 1200,
          noiseGain: 0.12,
          noiseDuration: 0.024,
        });
        playTone(ctx, 587.33, 587.33, 0.14, 'sine', 0.09, 0.01);
        playTone(ctx, 880, 880, 0.16, 'sine', 0.055, 0.02);
        break;

      case 'promote':
        playWoodImpact(ctx, {
          baseFreq: 210,
          endFreq: 92,
          duration: 0.065,
          bodyGain: 0.15,
          noiseFreq: 1100,
          noiseGain: 0.1,
          noiseDuration: 0.022,
        });
        playTone(ctx, 523.25, 523.25, 0.1, 'sine', 0.08, 0.01);
        playTone(ctx, 659.25, 659.25, 0.11, 'sine', 0.085, 0.065);
        playTone(ctx, 783.99, 783.99, 0.16, 'sine', 0.09, 0.125);
        break;

      case 'gameover':
        playTone(ctx, 392.0, 392.0, 0.16, 'sine', 0.09, 0);
        playTone(ctx, 493.88, 493.88, 0.18, 'sine', 0.085, 0.085);
        playTone(ctx, 587.33, 587.33, 0.22, 'sine', 0.09, 0.17);
        playTone(ctx, 783.99, 783.99, 0.34, 'sine', 0.095, 0.25);
        break;

      case 'draw':
        playTone(ctx, 440.0, 440.0, 0.16, 'sine', 0.085, 0);
        playTone(ctx, 523.25, 523.25, 0.24, 'sine', 0.075, 0.11);
        break;

      case 'illegal':
        playTone(ctx, 145, 95, 0.07, 'triangle', 0.08, 0);
        playTone(ctx, 120, 82, 0.08, 'triangle', 0.065, 0.065);
        break;
    }
  } catch {
    // Ignore audio errors when browser blocks autoplay before gesture
  }
}
