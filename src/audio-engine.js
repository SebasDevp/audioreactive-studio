const clamp = (value, min = 0, max = 1) => Math.min(max, Math.max(min, value));

export class AudioEngine {
  constructor(onFrame, onState) {
    this.onFrame = onFrame;
    this.onState = onState;
    this.context = null;
    this.analyser = null;
    this.source = null;
    this.inputGainNode = null;
    this.silentGain = null;
    this.stream = null;
    this.freq = null;
    this.time = null;
    this.raf = 0;
    this.energyHistory = [];
    this.lastBeat = 0;
    this.inputGain = 2.0;
    this.mode = 'none';
    this.prevBands = { sub: 0, bass: 0, mid: 0, treble: 0, level: 0 };
    this.pulses = { sub: 0, bass: 0, mid: 0, treble: 0, level: 0 };
  }

  async ensureContext() {
    if (!this.context || this.context.state === 'closed') {
      this.context = new AudioContext({ latencyHint: 'interactive' });
    }
    if (this.context.state === 'suspended') await this.context.resume();
  }

  setInputGain(value) {
    this.inputGain = Math.max(0.1, Math.min(10, Number(value) || 1));
    if (this.inputGainNode) this.inputGainNode.gain.setTargetAtTime(this.inputGain, this.context.currentTime, 0.02);
  }

  async listInputs(requestPermission = false) {
    // Fast path for startup: enumerate first without opening the microphone.
    // Labels may be generic until the user explicitly grants permission.
    if (requestPermission) {
      try {
        const temp = await navigator.mediaDevices.getUserMedia({
          audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false }
        });
        temp.getTracks().forEach((track) => track.stop());
      } catch (_) {}
    }

    const devices = await navigator.mediaDevices.enumerateDevices();
    return devices.filter((device) => device.kind === 'audioinput');
  }

  async startDevice(deviceId) {
    let stream;
    const base = { echoCancellation: false, noiseSuppression: false, autoGainControl: false };

    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: { ...base, deviceId: deviceId ? { exact: deviceId } : undefined } });
    } catch (error) {
      if (!deviceId) throw error;
      stream = await navigator.mediaDevices.getUserMedia({ audio: base });
    }

    this.mode = 'device';
    await this.useStream(stream);
    const track = stream.getAudioTracks()[0];
    const label = track?.label || 'Entrada de audio';
    this.onState?.({ type: 'connected', mode: this.mode, label, muted: Boolean(track?.muted) });
    return { stream, label };
  }

  async startSelectedWindowCapture(sourceId) {
    if (window.studioAPI) await window.studioAPI.selectCaptureSource(sourceId);
    return this.startDisplayCapture(window.studioAPI ? 'window' : 'browser');
  }

  async startSystemCapture() {
    if (window.studioAPI) await window.studioAPI.selectPrimaryScreen();
    return this.startDisplayCapture(window.studioAPI ? 'system' : 'browser');
  }

  async startDisplayCapture(mode) {
    const stream = await navigator.mediaDevices.getDisplayMedia({
      video: { width: { ideal: 640 }, height: { ideal: 360 }, frameRate: { ideal: 5, max: 15 } },
      audio: true
    });

    const audioTracks = stream.getAudioTracks();
    if (!audioTracks.length) {
      stream.getTracks().forEach((track) => track.stop());
      const webHint = window.studioAPI
        ? 'Windows no entregó audio de loopback. Revisá que haya audio reproduciéndose y que el dispositivo de salida de Windows esté activo.'
        : 'El navegador no recibió audio de la fuente compartida. Para YouTube elegí una pestaña y activá “Compartir audio”. Para pantalla completa, activá el audio del sistema si aparece esa opción.';
      throw new Error(webHint);
    }

    stream.getVideoTracks().forEach((track) => track.stop());

    this.mode = mode;
    await this.useStream(stream);
    const label = mode === 'window'
      ? 'Ventana + audio del sistema'
      : mode === 'browser'
        ? 'Fuente compartida por el navegador'
        : 'Audio del sistema';
    this.onState?.({ type: 'connected', mode, label, muted: Boolean(audioTracks[0]?.muted) });
    return { stream, label };
  }

  async useStream(stream) {
    this.stop(false);
    await this.ensureContext();

    this.stream = stream;
    this.source = this.context.createMediaStreamSource(stream);
    this.inputGainNode = this.context.createGain();
    this.inputGainNode.gain.value = this.inputGain;

    this.analyser = this.context.createAnalyser();
    this.analyser.fftSize = 2048;
    this.analyser.smoothingTimeConstant = 0.58;
    this.analyser.minDecibels = -98;
    this.analyser.maxDecibels = -10;

    this.silentGain = this.context.createGain();
    this.silentGain.gain.value = 0;

    this.source.connect(this.inputGainNode);
    this.inputGainNode.connect(this.analyser);
    this.analyser.connect(this.silentGain);
    this.silentGain.connect(this.context.destination);

    this.freq = new Uint8Array(this.analyser.frequencyBinCount);
    this.time = new Uint8Array(this.analyser.fftSize);
    this.energyHistory = [];
    this.lastBeat = 0;
    this.prevBands = { sub: 0, bass: 0, mid: 0, treble: 0, level: 0 };
    this.pulses = { sub: 0, bass: 0, mid: 0, treble: 0, level: 0 };

    for (const track of stream.getAudioTracks()) {
      track.addEventListener('mute', () => this.onState?.({ type: 'muted', mode: this.mode, label: track.label || 'Audio' }));
      track.addEventListener('unmute', () => this.onState?.({ type: 'unmuted', mode: this.mode, label: track.label || 'Audio' }));
      track.addEventListener('ended', () => this.onState?.({ type: 'ended', mode: this.mode, label: track.label || 'Audio' }));
    }

    this.loop();
  }

  bandEnergy(lowHz, highHz) {
    if (!this.context || !this.freq) return 0;
    const nyquist = this.context.sampleRate / 2;
    const low = Math.max(0, Math.floor((lowHz / nyquist) * this.freq.length));
    const high = Math.min(this.freq.length - 1, Math.ceil((highHz / nyquist) * this.freq.length));
    if (high <= low) return 0;

    let sum = 0;
    let peak = 0;
    let count = 0;
    for (let i = low; i <= high; i++) {
      const x = this.freq[i] / 255;
      sum += x * x;
      peak = Math.max(peak, x);
      count++;
    }
    const rmsBand = Math.sqrt(sum / Math.max(1, count));
    return Math.min(1, rmsBand * 0.76 + peak * 0.24);
  }

  rms() {
    if (!this.time) return 0;
    let sum = 0;
    let peak = 0;
    for (let i = 0; i < this.time.length; i++) {
      const x = (this.time[i] - 128) / 128;
      sum += x * x;
      peak = Math.max(peak, Math.abs(x));
    }
    const rms = Math.sqrt(sum / this.time.length);
    return Math.min(1, rms * 3.4 + peak * 0.22);
  }

  detectBeat(bass, lowMid, level, now) {
    const energy = bass * 0.69 + lowMid * 0.19 + level * 0.12;
    this.energyHistory.push(energy);
    if (this.energyHistory.length > 64) this.energyHistory.shift();

    const avg = this.energyHistory.reduce((a, b) => a + b, 0) / Math.max(1, this.energyHistory.length);
    const variance = this.energyHistory.reduce((acc, value) => acc + (value - avg) ** 2, 0) / Math.max(1, this.energyHistory.length);
    const dynamic = Math.sqrt(variance);
    const threshold = avg + dynamic * 1.12 + 0.018;
    const cooldown = 108;
    const beat = this.energyHistory.length > 12 && energy > threshold && energy > 0.10 && now - this.lastBeat > cooldown;
    if (beat) this.lastBeat = now;
    return beat ? 1 : Math.max(0, 1 - (now - this.lastBeat) / 220);
  }

  updateBandPulse(name, value, options = {}) {
    const decay = options.decay ?? 0.86;
    const riseWeight = options.riseWeight ?? 4.6;
    const sustainWeight = options.sustainWeight ?? 0.32;
    const threshold = options.threshold ?? 0.035;
    const prev = this.prevBands[name] ?? 0;
    const rise = Math.max(0, value - prev * 0.9);
    const trigger = value > threshold ? clamp(rise * riseWeight + value * sustainWeight) : 0;
    this.pulses[name] = Math.max(trigger, (this.pulses[name] ?? 0) * decay);
    this.prevBands[name] = value;
    return this.pulses[name];
  }

  loop = () => {
    if (!this.analyser) return;
    this.analyser.getByteFrequencyData(this.freq);
    this.analyser.getByteTimeDomainData(this.time);

    const sub = this.bandEnergy(28, 75);
    const bass = Math.min(1, this.bandEnergy(45, 190) * 1.08);
    const lowMid = this.bandEnergy(190, 520);
    const mid = Math.min(1, this.bandEnergy(190, 2400) * 1.04);
    const treble = Math.min(1, this.bandEnergy(2400, 14000) * 1.15);
    const level = this.rms();
    const now = performance.now();
    const beat = this.detectBeat(Math.max(sub, bass), lowMid, level, now);

    const subPulse = this.updateBandPulse('sub', sub, { riseWeight: 4.8, sustainWeight: 0.26, threshold: 0.025, decay: 0.87 });
    const bassPulse = this.updateBandPulse('bass', bass, { riseWeight: 4.4, sustainWeight: 0.31, threshold: 0.03, decay: 0.88 });
    const midPulse = this.updateBandPulse('mid', mid, { riseWeight: 5.2, sustainWeight: 0.25, threshold: 0.04, decay: 0.84 });
    const treblePulse = this.updateBandPulse('treble', treble, { riseWeight: 5.8, sustainWeight: 0.23, threshold: 0.045, decay: 0.80 });
    const levelPulse = this.updateBandPulse('level', level, { riseWeight: 5.0, sustainWeight: 0.22, threshold: 0.03, decay: 0.86 });

    this.onFrame?.({ sub, bass, mid, treble, level, beat, subPulse, bassPulse, midPulse, treblePulse, levelPulse });
    this.raf = requestAnimationFrame(this.loop);
  };

  stop(resetMode = true) {
    cancelAnimationFrame(this.raf);
    try { this.source?.disconnect(); } catch (_) {}
    try { this.inputGainNode?.disconnect(); } catch (_) {}
    try { this.analyser?.disconnect(); } catch (_) {}
    try { this.silentGain?.disconnect(); } catch (_) {}
    this.stream?.getTracks().forEach((track) => track.stop());

    this.source = null;
    this.inputGainNode = null;
    this.silentGain = null;
    this.stream = null;
    this.analyser = null;
    this.freq = null;
    this.time = null;
    this.prevBands = { sub: 0, bass: 0, mid: 0, treble: 0, level: 0 };
    this.pulses = { sub: 0, bass: 0, mid: 0, treble: 0, level: 0 };
    if (resetMode) this.mode = 'none';
  }
}
