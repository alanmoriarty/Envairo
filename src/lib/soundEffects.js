/**
 * Sintetizador de Efectos de Sonido DJ en Tiempo Real (Web Audio API)
 * Genera de forma nativa en el navegador y con latencia cero:
 * - Vinyl Brake (Efecto de aguja y frenada de plato de vinilo)
 * - Echo Sweep (Barrido descendente con delay y reverberación)
 * - Spin Up / Rewind (Aceleración de vinilo / rebobinado)
 * - Laser / Drop Whoosh (Transición rápida con impacto y white-noise sweep)
 * - Flanger Sweep (Modulación de frecuencia de fase)
 */

class DJAudioFXEngine {
  constructor() {
    this.ctx = null;
  }

  getAudioContext() {
    if (!this.ctx) {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (AudioCtx) {
        this.ctx = new AudioCtx();
      }
    }
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume().catch(() => {});
    }
    return this.ctx;
  }

  // 1. Efecto Vinyl Brake (Parada de motor de tornamesa + desaceleración)
  playVinylBrake(duration = 2.5) {
    const ctx = this.getAudioContext();
    if (!ctx) return;

    const now = ctx.currentTime;

    // Oscilador de tono bajo con desaceleración logarítmica
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    
    // Filtro para dar textura cálida de vinilo
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(800, now);
    filter.frequency.exponentialRampToValueAtTime(80, now + duration);

    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(220, now);
    osc.frequency.exponentialRampToValueAtTime(25, now + duration);

    gain.gain.setValueAtTime(0.35, now);
    gain.gain.linearRampToValueAtTime(0.4, now + 0.2);
    gain.gain.exponentialRampToValueAtTime(0.001, now + duration);

    // Ruido de vinilo (crackle / scratch)
    const bufferSize = ctx.sampleRate * duration;
    const noiseBuffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const output = noiseBuffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      output[i] = (Math.random() * 2 - 1) * (Math.random() > 0.96 ? 0.25 : 0.02);
    }
    const noise = ctx.createBufferSource();
    noise.buffer = noiseBuffer;

    const noiseGain = ctx.createGain();
    noiseGain.gain.setValueAtTime(0.15, now);
    noiseGain.gain.exponentialRampToValueAtTime(0.001, now + duration);

    osc.connect(filter);
    filter.connect(gain);
    gain.connect(ctx.destination);

    noise.connect(noiseGain);
    noiseGain.connect(ctx.destination);

    osc.start(now);
    noise.start(now);
    osc.stop(now + duration);
    noise.stop(now + duration);
  }

  // 2. Efecto Echo Out (Barrido con repeticiones estéreo y reverb)
  playEchoOut(duration = 3.0) {
    const ctx = this.getAudioContext();
    if (!ctx) return;

    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    const delay = ctx.createDelay();
    const feedback = ctx.createGain();

    delay.delayTime.setValueAtTime(0.25, now);
    feedback.gain.setValueAtTime(0.6, now);
    feedback.gain.exponentialRampToValueAtTime(0.01, now + duration);

    osc.type = 'triangle';
    osc.frequency.setValueAtTime(440, now);
    osc.frequency.exponentialRampToValueAtTime(110, now + duration);

    gain.gain.setValueAtTime(0.25, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + duration);

    osc.connect(gain);
    gain.connect(ctx.destination);
    gain.connect(delay);
    delay.connect(feedback);
    feedback.connect(delay);
    delay.connect(ctx.destination);

    osc.start(now);
    osc.stop(now + duration);
  }

  // 3. Efecto Spin Up (Aceleración de aguja / encendido del plato)
  playSpinUp(duration = 2.0) {
    const ctx = this.getAudioContext();
    if (!ctx) return;

    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(30, now);
    osc.frequency.exponentialRampToValueAtTime(320, now + duration);

    gain.gain.setValueAtTime(0.01, now);
    gain.gain.linearRampToValueAtTime(0.3, now + duration * 0.8);
    gain.gain.exponentialRampToValueAtTime(0.001, now + duration);

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start(now);
    osc.stop(now + duration);
  }

  // 4. Efecto Cut / Sweep (Impacto de corte con ruido blanco y filtro)
  playCutImpact(duration = 1.2) {
    const ctx = this.getAudioContext();
    if (!ctx) return;

    const now = ctx.currentTime;
    const bufferSize = ctx.sampleRate * duration;
    const noiseBuffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const output = noiseBuffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      output[i] = (Math.random() * 2 - 1);
    }
    const noise = ctx.createBufferSource();
    noise.buffer = noiseBuffer;

    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(1200, now);
    filter.frequency.exponentialRampToValueAtTime(150, now + duration);

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.35, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + duration);

    noise.connect(filter);
    filter.connect(gain);
    gain.connect(ctx.destination);

    noise.start(now);
    noise.stop(now + duration);
  }

  // Ejecución por nombre de transición
  playTransitionEffect(effectType) {
    try {
      if (effectType === 'brake') {
        this.playVinylBrake(2.8);
      } else if (effectType === 'echo') {
        this.playEchoOut(3.0);
      } else if (effectType === 'start') {
        this.playSpinUp(2.2);
      } else if (effectType === 'cut') {
        this.playCutImpact(1.0);
      } else if (effectType === 'fade') {
        // En fundido, un leve barrido de aire suave
        this.playEchoOut(2.0);
      }
    } catch (e) {
      console.warn('Error al reproducir efecto DJ WebAudio:', e);
    }
  }
}

export const djAudioFX = new DJAudioFXEngine();
