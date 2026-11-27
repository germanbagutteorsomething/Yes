import type { HeistWeaponId } from '../types/heist';

class HeistAudioEngine {
  private ctx: AudioContext | null = null;
  private noiseBuffer: AudioBuffer | null = null;
  private lastShotAt = 0;

  private ensureContext(): AudioContext | null {
    if (typeof window === 'undefined') return null;
    if (!this.ctx) {
      const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Ctx) return null;
      this.ctx = new Ctx();
    }
    if (this.ctx.state === 'suspended') {
      void this.ctx.resume();
    }
    if (!this.noiseBuffer && this.ctx) {
      const length = Math.floor(this.ctx.sampleRate * 0.35);
      const buffer = this.ctx.createBuffer(1, length, this.ctx.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < length; i++) {
        data[i] = Math.random() * 2 - 1;
      }
      this.noiseBuffer = buffer;
    }
    return this.ctx;
  }

  public playGunshot(enabled: boolean, weaponId: HeistWeaponId) {
    if (!enabled) return;
    const ctx = this.ensureContext();
    if (!ctx || !this.noiseBuffer) return;

    const now = ctx.currentTime;
    if (now - this.lastShotAt < 0.03) return;
    this.lastShotAt = now;

    // Noise burst
    const noise = ctx.createBufferSource();
    noise.buffer = this.noiseBuffer;

    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    const gain = ctx.createGain();

    // Low punch oscillator
    const osc = ctx.createOscillator();
    const oscGain = ctx.createGain();
    osc.type = 'triangle';

    let dur = 0.09;
    let vol = 0.16;
    if (weaponId === 'pistol') {
      filter.frequency.setValueAtTime(1400, now);
      osc.frequency.setValueAtTime(190, now);
      osc.frequency.exponentialRampToValueAtTime(55, now + 0.07);
      dur = 0.09;
      vol = 0.15;
    } else if (weaponId === 'smg') {
      filter.frequency.setValueAtTime(2100, now);
      osc.frequency.setValueAtTime(240, now);
      osc.frequency.exponentialRampToValueAtTime(75, now + 0.05);
      dur = 0.065;
      vol = 0.12;
    } else if (weaponId === 'shotgun') {
      filter.frequency.setValueAtTime(850, now);
      osc.frequency.setValueAtTime(130, now);
      osc.frequency.exponentialRampToValueAtTime(38, now + 0.16);
      dur = 0.19;
      vol = 0.24;
    } else {
      filter.frequency.setValueAtTime(1700, now);
      osc.frequency.setValueAtTime(170, now);
      osc.frequency.exponentialRampToValueAtTime(52, now + 0.08);
      dur = 0.1;
      vol = 0.17;
    }

    gain.gain.setValueAtTime(vol, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + dur);

    oscGain.gain.setValueAtTime(vol * 0.75, now);
    oscGain.gain.exponentialRampToValueAtTime(0.001, now + dur);

    noise.connect(filter);
    filter.connect(gain);
    gain.connect(ctx.destination);

    osc.connect(oscGain);
    oscGain.connect(ctx.destination);

    noise.start(now);
    noise.stop(now + dur);
    osc.start(now);
    osc.stop(now + dur);
  }

  public playReload(enabled: boolean) {
    if (!enabled) return;
    const ctx = this.ensureContext();
    if (!ctx) return;
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'square';
    osc.frequency.setValueAtTime(520, now);
    osc.frequency.setValueAtTime(760, now + 0.06);
    gain.gain.setValueAtTime(0.06, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.13);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.13);
  }

  public playHeistComplete(enabled: boolean) {
    if (!enabled) return;
    const ctx = this.ensureContext();
    if (!ctx) return;
    const now = ctx.currentTime;
    const notes = [523.25, 659.25, 783.99, 1046.5];
    notes.forEach((freq, idx) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'triangle';
      const t = now + idx * 0.065;
      osc.frequency.setValueAtTime(freq, t);
      gain.gain.setValueAtTime(0.11, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.22);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(t);
      osc.stop(t + 0.22);
    });
  }

  public playPickup(enabled: boolean) {
    if (!enabled) return;
    const ctx = this.ensureContext();
    if (!ctx) return;
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(580, now);
    osc.frequency.exponentialRampToValueAtTime(980, now + 0.11);
    gain.gain.setValueAtTime(0.09, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.12);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.12);
  }

  public playCarDoor(enabled: boolean) {
    if (!enabled) return;
    const ctx = this.ensureContext();
    if (!ctx) return;
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(160, now);
    osc.frequency.exponentialRampToValueAtTime(65, now + 0.08);
    gain.gain.setValueAtTime(0.12, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.09);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.09);
  }

  public playHit(enabled: boolean, heavy = false) {
    if (!enabled) return;
    const ctx = this.ensureContext();
    if (!ctx) return;
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(heavy ? 120 : 185, now);
    osc.frequency.exponentialRampToValueAtTime(42, now + (heavy ? 0.14 : 0.08));
    gain.gain.setValueAtTime(heavy ? 0.13 : 0.07, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + (heavy ? 0.14 : 0.08));
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + (heavy ? 0.14 : 0.08));
  }

  public playStarUp(enabled: boolean) {
    if (!enabled) return;
    const ctx = this.ensureContext();
    if (!ctx) return;
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(620, now);
    osc.frequency.linearRampToValueAtTime(920, now + 0.15);
    osc.frequency.linearRampToValueAtTime(620, now + 0.3);
    gain.gain.setValueAtTime(0.08, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.32);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.32);
  }

  public playBusted(enabled: boolean) {
    if (!enabled) return;
    const ctx = this.ensureContext();
    if (!ctx) return;
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(240, now);
    osc.frequency.exponentialRampToValueAtTime(55, now + 0.55);
    gain.gain.setValueAtTime(0.14, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.58);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.58);
  }

  public playPitImpact(enabled: boolean) {
    if (!enabled) return;
    const ctx = this.ensureContext();
    if (!ctx || !this.noiseBuffer) return;
    const now = ctx.currentTime;

    // Metallic crunch + tire skid screech
    const osc = ctx.createOscillator();
    const oscGain = ctx.createGain();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(145, now);
    osc.frequency.exponentialRampToValueAtTime(38, now + 0.22);
    oscGain.gain.setValueAtTime(0.16, now);
    oscGain.gain.exponentialRampToValueAtTime(0.001, now + 0.24);
    osc.connect(oscGain);
    oscGain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.24);

    const noise = ctx.createBufferSource();
    noise.buffer = this.noiseBuffer;
    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(1950, now);
    filter.Q.setValueAtTime(3.2, now);
    const nGain = ctx.createGain();
    nGain.gain.setValueAtTime(0.11, now);
    nGain.gain.exponentialRampToValueAtTime(0.001, now + 0.28);
    noise.connect(filter);
    filter.connect(nGain);
    nGain.connect(ctx.destination);
    noise.start(now);
    noise.stop(now + 0.28);
  }

  public playNitro(enabled: boolean) {
    if (!enabled) return;
    const ctx = this.ensureContext();
    if (!ctx || !this.noiseBuffer) return;
    const now = ctx.currentTime;
    const noise = ctx.createBufferSource();
    noise.buffer = this.noiseBuffer;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(320, now);
    filter.frequency.exponentialRampToValueAtTime(1600, now + 0.18);
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.08, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.24);
    noise.connect(filter);
    filter.connect(gain);
    gain.connect(ctx.destination);
    noise.start(now);
    noise.stop(now + 0.24);
  }
}

export const heistAudio = new HeistAudioEngine();
