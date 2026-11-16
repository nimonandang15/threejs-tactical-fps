// Synthesised sound: every effect is an oscillator or filtered noise burst, so the game
// ships no audio files and makes no network request.
export function createAudio() {
  let context = null;
  let master = null;

  function ensure() {
    if (context) {
      if (context.state === 'suspended') void context.resume();
      return context;
    }
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    if (!AudioContext) return null;
    context = new AudioContext();
    master = context.createGain();
    master.gain.value = 0.32;
    master.connect(context.destination);
    return context;
  }

  function tone({ frequency = 440, end = 0, duration = 0.1, type = 'sine', gain = 0.5, delay = 0 }) {
    const ctx = ensure();
    if (!ctx) return;
    const start = ctx.currentTime + delay;
    const osc = ctx.createOscillator();
    const amp = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(frequency, start);
    if (end) osc.frequency.exponentialRampToValueAtTime(Math.max(1, end), start + duration);
    amp.gain.setValueAtTime(gain, start);
    amp.gain.exponentialRampToValueAtTime(0.001, start + duration);
    osc.connect(amp);
    amp.connect(master);
    osc.start(start);
    osc.stop(start + duration + 0.02);
  }

  function noise({ duration = 0.15, gain = 0.5, frequency = 1200, type = 'lowpass', delay = 0 }) {
    const ctx = ensure();
    if (!ctx) return;
    const start = ctx.currentTime + delay;
    const length = Math.max(1, Math.floor(ctx.sampleRate * duration));
    const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < length; i += 1) data[i] = (Math.random() * 2 - 1) * (1 - i / length);
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    const filter = ctx.createBiquadFilter();
    filter.type = type;
    filter.frequency.value = frequency;
    const amp = ctx.createGain();
    amp.gain.setValueAtTime(gain, start);
    amp.gain.exponentialRampToValueAtTime(0.001, start + duration);
    source.connect(filter);
    filter.connect(amp);
    amp.connect(master);
    source.start(start);
  }

  return {
    unlock() { ensure(); },
    shot(kind) {
      if (kind === 'marksman') { noise({ duration: 0.28, gain: 0.9, frequency: 900 }); tone({ frequency: 140, end: 40, duration: 0.22, type: 'square', gain: 0.35 }); }
      else if (kind === 'smg') { noise({ duration: 0.07, gain: 0.42, frequency: 1800 }); tone({ frequency: 320, end: 120, duration: 0.06, type: 'square', gain: 0.16 }); }
      else if (kind === 'pistol') { noise({ duration: 0.09, gain: 0.5, frequency: 1500 }); tone({ frequency: 260, end: 90, duration: 0.08, type: 'square', gain: 0.2 }); }
      else { noise({ duration: 0.12, gain: 0.6, frequency: 1400 }); tone({ frequency: 190, end: 60, duration: 0.11, type: 'square', gain: 0.28 }); }
    },
    dryFire() { tone({ frequency: 1400, duration: 0.03, type: 'square', gain: 0.12 }); },
    reload() {
      tone({ frequency: 900, duration: 0.04, type: 'square', gain: 0.14 });
      tone({ frequency: 600, duration: 0.04, type: 'square', gain: 0.14, delay: 0.35 });
      tone({ frequency: 1100, duration: 0.05, type: 'square', gain: 0.18, delay: 0.7 });
    },
    hit() { tone({ frequency: 2100, duration: 0.05, type: 'sine', gain: 0.3 }); },
    kill() { tone({ frequency: 880, duration: 0.09, type: 'sine', gain: 0.35 }); tone({ frequency: 1320, duration: 0.12, type: 'sine', gain: 0.3, delay: 0.07 }); },
    hurt() { noise({ duration: 0.12, gain: 0.4, frequency: 500 }); tone({ frequency: 110, end: 55, duration: 0.14, type: 'sawtooth', gain: 0.22 }); },
    plantBeep() { tone({ frequency: 1560, duration: 0.07, type: 'sine', gain: 0.3 }); },
    defuseBeep() { tone({ frequency: 1180, duration: 0.07, type: 'sine', gain: 0.28 }); },
    explosion() {
      noise({ duration: 0.9, gain: 1.0, frequency: 320 });
      tone({ frequency: 90, end: 28, duration: 0.8, type: 'sine', gain: 0.8 });
      noise({ duration: 0.3, gain: 0.5, frequency: 3000, type: 'highpass' });
    },
    flashbang() { noise({ duration: 0.5, gain: 0.7, frequency: 5000, type: 'highpass' }); tone({ frequency: 2400, duration: 0.4, type: 'sine', gain: 0.12 }); },
    buy() { tone({ frequency: 660, duration: 0.07, type: 'sine', gain: 0.25 }); tone({ frequency: 990, duration: 0.1, type: 'sine', gain: 0.25, delay: 0.07 }); },
    denied() { tone({ frequency: 220, duration: 0.12, type: 'square', gain: 0.2 }); },
    roundWin() { [523, 659, 784].forEach((f, i) => tone({ frequency: f, duration: 0.16, type: 'triangle', gain: 0.3, delay: i * 0.11 })); },
    roundLose() { [392, 330, 262].forEach((f, i) => tone({ frequency: f, duration: 0.18, type: 'triangle', gain: 0.28, delay: i * 0.12 })); },
    roundStart() { tone({ frequency: 440, duration: 0.1, type: 'triangle', gain: 0.25 }); tone({ frequency: 587, duration: 0.14, type: 'triangle', gain: 0.25, delay: 0.1 }); },
  };
}
