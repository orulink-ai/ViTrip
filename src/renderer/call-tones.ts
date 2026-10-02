/** Local call feedback, independent of the microphone and remote speech stream. */
export interface CallFeedback {
  connecting(): void;
  connected(): void;
  closed(): void;
}
export class CallTones implements CallFeedback {
  private context?: AudioContext;
  private state: 'idle' | 'connecting' | 'connected' | 'closed' = 'idle';
  private repeat?: ReturnType<typeof setInterval>;
  private nodes = new Map<OscillatorNode, GainNode>();

  connecting() {
    if (this.state !== 'idle') return;
    this.state = 'connecting';
    try {
      // Called directly from the call button's user gesture for autoplay permission.
      this.context = new AudioContext();
      void this.context.resume().catch(() => {});
      this.ring();
      this.repeat = setInterval(() => this.ring(), 2400);
    } catch {
      // Feedback must never prevent voice transport from starting.
    }
  }
  connected() {
    if (this.state !== 'connecting') return;
    this.state = 'connected';
    this.silence();
    this.note([660], 0, 0.09);
    this.note([880], 0.11, 0.12);
  }
  closed() {
    if (this.state === 'closed') return;
    const wasConnected = this.state === 'connected';
    this.state = 'closed';
    this.silence();
    if (!wasConnected) return this.dispose();
    this.note([440], 0, 0.09);
    this.note([330], 0.12, 0.12);
    setTimeout(() => this.dispose(), 350);
  }
  private ring() {
    if (this.state !== 'connecting') return;
    this.note([440, 480], 0, 0.18);
    this.note([440, 480], 0.4, 0.18);
  }
  private note(frequencies: number[], delay: number, duration: number) {
    const context = this.context;
    if (!context || context.state === 'closed') return;
    try {
      const start = context.currentTime + delay;
      for (const frequency of frequencies) {
        const oscillator = context.createOscillator();
        const gain = context.createGain();
        oscillator.frequency.value = frequency;
        // Gentle envelope avoids clicks and leaves room for the remote voice.
        gain.gain.setValueAtTime(0, start);
        gain.gain.linearRampToValueAtTime(0.055 / frequencies.length, start + 0.012);
        gain.gain.setValueAtTime(0.055 / frequencies.length, start + duration - 0.02);
        gain.gain.linearRampToValueAtTime(0, start + duration);
        oscillator.connect(gain);
        gain.connect(context.destination);
        this.nodes.set(oscillator, gain);
        oscillator.onended = () => {
          oscillator.disconnect();
          gain.disconnect();
          this.nodes.delete(oscillator);
        };
        oscillator.start(start);
        oscillator.stop(start + duration);
      }
    } catch {
      // Missing or disconnected audio output does not interrupt the call.
    }
  }
  private silence() {
    clearInterval(this.repeat);
    for (const [oscillator, gain] of this.nodes) {
      try {
        oscillator.stop();
      } catch {
        /* Already ended. */
      }
      oscillator.disconnect();
      gain.disconnect();
    }
    this.nodes.clear();
  }
  private dispose() {
    this.silence();
    void this.context?.close().catch(() => {});
    this.context = undefined;
  }
}
