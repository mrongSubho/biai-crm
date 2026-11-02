// ============================================================================
// BIAI Omnichannel CRM - Pure Web Audio API Sound Effects Engine
// Zero external asset dependencies, zero latency, guaranteed browser playback
// ============================================================================

class SoundEffectsEngine {
  private ctx: AudioContext | null = null;
  public enabled: boolean = true;

  constructor() {
    if (typeof window !== 'undefined') {
      const savedAudio = localStorage.getItem('biai_audio_enabled');
      if (savedAudio !== null) {
        this.enabled = savedAudio === 'true';
      }
    }
  }

  public toggle(): boolean {
    this.enabled = !this.enabled;
    if (typeof window !== 'undefined') {
      localStorage.setItem('biai_audio_enabled', String(this.enabled));
    }
    if (this.enabled) {
      this.playActionSuccess();
    }
    return this.enabled;
  }

  private initCtx() {
    if (!this.ctx && typeof window !== 'undefined') {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      if (AudioCtx) {
        this.ctx = new AudioCtx();
      }
    }
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume();
    }
  }

  /**
   * 1. New Incoming Message / Enquiry
   * Gentle, professional dual-tone chime (C5 = 523.25Hz -> E5 = 659.25Hz)
   */
  public playNewMessage() {
    if (!this.enabled) return;
    this.initCtx();
    if (!this.ctx) return;

    try {
      const now = this.ctx.currentTime;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(523.25, now);
      osc.frequency.exponentialRampToValueAtTime(659.25, now + 0.08);

      gain.gain.setValueAtTime(0.08, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.28);

      osc.connect(gain);
      gain.connect(this.ctx.destination);

      osc.start(now);
      osc.stop(now + 0.28);
    } catch {
      // Audio autoplay policy fallback
    }
  }

  /**
   * 2. Emergency Alert / P0 Escalation / SLA Breach (>2h)
   * Resonant attention chord (F4 = 349.23Hz -> B4 = 493.88Hz)
   */
  public playEmergencyAlert() {
    if (!this.enabled) return;
    this.initCtx();
    if (!this.ctx) return;

    try {
      const now = this.ctx.currentTime;
      const osc1 = this.ctx.createOscillator();
      const osc2 = this.ctx.createOscillator();
      const gain = this.ctx.createGain();

      osc1.type = 'triangle';
      osc2.type = 'sine';

      osc1.frequency.setValueAtTime(349.23, now);
      osc1.frequency.exponentialRampToValueAtTime(392.00, now + 0.15);

      osc2.frequency.setValueAtTime(493.88, now + 0.05);
      osc2.frequency.exponentialRampToValueAtTime(523.25, now + 0.25);

      gain.gain.setValueAtTime(0.12, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.4);

      osc1.connect(gain);
      osc2.connect(gain);
      gain.connect(this.ctx.destination);

      osc1.start(now);
      osc2.start(now + 0.05);
      osc1.stop(now + 0.4);
      osc2.stop(now + 0.4);
    } catch {
      // Audio autoplay policy fallback
    }
  }

  /**
   * 3. Action Success / Reply Sent / Remediation Complete
   * Crisp, soft ascending affirmative chime (E5 = 659.25Hz -> A5 = 880Hz)
   */
  public playActionSuccess() {
    if (!this.enabled) return;
    this.initCtx();
    if (!this.ctx) return;

    try {
      const now = this.ctx.currentTime;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(659.25, now);
      osc.frequency.exponentialRampToValueAtTime(880.00, now + 0.06);

      gain.gain.setValueAtTime(0.07, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.22);

      osc.connect(gain);
      gain.connect(this.ctx.destination);

      osc.start(now);
      osc.stop(now + 0.22);
    } catch {
      // Audio autoplay policy fallback
    }
  }

  /**
   * 4. Warning / Impending SLA Breach (<1h) / Data Anomaly Detected
   * Soft warning double ping
   */
  public playWarningPing() {
    if (!this.enabled) return;
    this.initCtx();
    if (!this.ctx) return;

    try {
      const now = this.ctx.currentTime;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(440.00, now);
      osc.frequency.setValueAtTime(440.00, now + 0.09);

      gain.gain.setValueAtTime(0.08, now);
      gain.gain.exponentialRampToValueAtTime(0.01, now + 0.06);
      gain.gain.setValueAtTime(0.08, now + 0.08);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.18);

      osc.connect(gain);
      gain.connect(this.ctx.destination);

      osc.start(now);
      osc.stop(now + 0.18);
    } catch {
      // Audio autoplay policy fallback
    }
  }
}

export const soundFx = new SoundEffectsEngine();
