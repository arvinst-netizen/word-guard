import type {
  MusicAdapter,
  MusicMood,
  Platform,
  SfxAdapter,
  SfxName,
  SpeechAdapter,
  StorageAdapter,
} from './types';

const STORAGE_PREFIX = 'word-guard:';

class LocalStorageAdapter implements StorageAdapter {
  private memory = new Map<string, string>();

  async get(key: string): Promise<string | null> {
    try {
      const v = window.localStorage.getItem(STORAGE_PREFIX + key);
      if (v !== null) return v;
    } catch {
      // ignore
    }
    return this.memory.get(key) ?? null;
  }

  async set(key: string, value: string): Promise<void> {
    this.memory.set(key, value);
    try {
      window.localStorage.setItem(STORAGE_PREFIX + key, value);
    } catch {
      // ignore
    }
  }

  async remove(key: string): Promise<void> {
    this.memory.delete(key);
    try {
      window.localStorage.removeItem(STORAGE_PREFIX + key);
    } catch {
      // ignore
    }
  }
}

const IS_IOS =
  typeof navigator !== 'undefined' &&
  (/iP(hone|ad|od)/.test(navigator.userAgent) ||
    (/Macintosh/.test(navigator.userAgent) && navigator.maxTouchPoints > 1));

const DUCK_LEVEL = 0.15;
const DUCK_FADE_SEC = 0.2;

class AudioBus {
  ctx: AudioContext | null = null;
  sfx!: GainNode;
  music!: GainNode;
  duck!: GainNode;
  private listeners: (() => void)[] = [];
  private rebuildListeners: (() => void)[] = [];
  private musicLevel = 0;
  ducked = false;
  private staleAfterSpeech = false;
  private rebuilds = 0;

  private create(): boolean {
    const Ctor =
      window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return false;
    const ac = new Ctor();
    this.ctx = ac;
    this.sfx = ac.createGain();
    this.sfx.connect(ac.destination);
    this.duck = ac.createGain();
    this.duck.gain.value = this.ducked ? DUCK_LEVEL : 1;
    this.duck.connect(ac.destination);
    this.music = ac.createGain();
    this.music.gain.value = this.musicLevel;
    this.music.connect(this.duck);

    ac.addEventListener('statechange', () => {
      if (this.ctx === ac && ac.state !== 'running') {
        window.setTimeout(() => this.ensureRunning(), 300);
      }
    });

    const buf = ac.createBuffer(1, 1, 22050);
    const src = ac.createBufferSource();
    src.buffer = buf;
    src.connect(ac.destination);
    src.start(0);
    return true;
  }

  unlock(): void {
    try {
      if (!this.ctx) {
        if (!this.create()) return;
        this.listeners.forEach((fn) => fn());
        return;
      }
      if (this.staleAfterSpeech && IS_IOS && !this.ducked) {
        this.rebuild();
        return;
      }
      if (this.ctx.state !== 'running') this.ctx.resume();
    } catch {
      // ignore
    }
  }

  private rebuild(): void {
    const old = this.ctx;
    this.staleAfterSpeech = false;
    if (this.create()) {
      this.rebuilds += 1;
      this.rebuildListeners.forEach((fn) => fn());
      old?.close().catch(() => undefined);
    }
  }

  onReady(fn: () => void): void {
    if (this.ctx) fn();
    else this.listeners.push(fn);
  }

  onRebuild(fn: () => void): void {
    this.rebuildListeners.push(fn);
  }

  ensureRunning(): void {
    const ac = this.ctx;
    if (ac && !document.hidden && ac.state !== 'running' && ac.state !== 'closed') {
      ac.resume().catch(() => undefined);
    }
  }

  setMusicLevel(level: number, fadeSec = 0.6): void {
    this.musicLevel = level;
    if (!this.ctx) return;
    const g = this.music.gain;
    const t = this.ctx.currentTime;
    g.cancelScheduledValues(t);
    g.setValueAtTime(g.value, t);
    g.linearRampToValueAtTime(level, t + fadeSec);
  }

  setDucked(on: boolean, markStale = true): void {
    this.ducked = on;
    if (!on && IS_IOS && markStale) this.staleAfterSpeech = true;
    if (!this.ctx) return;
    if (!on) this.ensureRunning();
    const g = this.duck.gain;
    const t = this.ctx.currentTime;
    g.cancelScheduledValues(t);
    g.setValueAtTime(g.value, t);
    g.linearRampToValueAtTime(on ? DUCK_LEVEL : 1, t + DUCK_FADE_SEC);
  }

  describe(): string {
    return `声音通道：${this.ctx ? this.ctx.state : '未启动'}${this.rebuilds ? `，已刷新 ${this.rebuilds} 次` : ''}`;
  }
}

class SystemSpeechAdapter implements SpeechAdapter {
  private static readonly FADE_MS = DUCK_FADE_SEC * 1000;
  private bus: AudioBus;
  private voice: SpeechSynthesisVoice | null = null;
  private supported: boolean;
  private voiceCount = 0;
  private englishCount = 0;
  private noEnglish = false;
  private silentFails = 0;
  private primed = false;
  private lastPrimeAt = 0;
  private lastError = '';
  private current: SpeechSynthesisUtterance | null = null;
  private starts = 0;
  private pendingTimer = 0;
  private holdTimer = 0;
  private queued: string | null = null;
  private queueTimer = 0;
  private busy = false;

  constructor(bus: AudioBus) {
    this.bus = bus;
    this.supported = typeof window !== 'undefined' && 'speechSynthesis' in window;
    if (!this.supported) return;

    const loadVoices = () => {
      const voices = window.speechSynthesis.getVoices();
      const en = voices.filter((v) => v.lang?.toLowerCase().replace('_', '-').startsWith('en'));
      this.voiceCount = voices.length;
      this.englishCount = en.length;
      this.noEnglish = voices.length > 0 && en.length === 0;
      const preferred = ['Google US English', 'Microsoft Aria', 'Microsoft Jenny', 'Samantha'];
      this.voice =
        preferred.map((name) => en.find((v) => v.name.includes(name))).find(Boolean) ??
        en.find((v) => v.lang === 'en-US' && v.localService) ??
        en.find((v) => v.lang === 'en-US') ??
        en[0] ??
        null;
    };
    loadVoices();
    window.speechSynthesis.addEventListener?.('voiceschanged', loadVoices);
  }

  get available(): boolean {
    return this.supported && !this.noEnglish && this.silentFails < 2;
  }

  primeInGesture(): void {
    if (!this.supported || this.primed) return;
    const now = Date.now();
    if (now - this.lastPrimeAt < 1000) return;
    this.lastPrimeAt = now;
    try {
      const synth = window.speechSynthesis;
      if (synth.speaking || synth.pending) return;
      const u = new SpeechSynthesisUtterance('ok');
      u.lang = 'en-US';
      u.volume = 0.01;
      u.rate = 1.4;
      u.onstart = () => {
        this.primed = true;
        this.starts += 1;
      };
      u.onerror = (ev) => {
        this.lastError = ev.error;
      };
      this.current = u;
      synth.speak(u);
    } catch (err) {
      this.lastError = String(err);
    }
  }

  test(text: string, cb: (ok: boolean, detail: string) => void): void {
    if (!this.supported) {
      cb(false, '这个浏览器不支持朗读');
      return;
    }
    const prevErr = this.lastError;
    const prevStarts = this.starts;
    this.say(text);
    window.setTimeout(() => {
      const ok = this.starts > prevStarts;
      const err = this.lastError === prevErr ? '' : this.lastError;
      cb(ok, `语音 ${this.voiceCount} 个，英文 ${this.englishCount} 个${err ? `，错误：${err}` : ''}；${this.bus.describe()}`);
    }, 3800);
  }

  say(text: string, opts: { interrupt?: boolean } = {}): void {
    if (!this.supported) return;
    const synth = window.speechSynthesis;
    const interrupt = opts.interrupt ?? true;
    try {
      if (this.busy && !interrupt) {
        this.queued = text;
        window.clearTimeout(this.queueTimer);
        this.queueTimer = window.setTimeout(() => this.flushQueue(true), 3000);
        return;
      }
      this.queued = null;
      window.clearTimeout(this.queueTimer);
      window.clearTimeout(this.pendingTimer);
      window.clearTimeout(this.holdTimer);
      const wasSpeaking = synth.speaking || synth.pending;
      if (wasSpeaking) {
        this.current = null;
        synth.cancel();
      }
      if (synth.paused) synth.resume();
      this.busy = true;
      const alreadyDucked = this.bus.ducked;
      this.bus.setDucked(true);
      const delay = Math.max(wasSpeaking ? 120 : 0, alreadyDucked ? 0 : SystemSpeechAdapter.FADE_MS);
      if (delay > 0) this.pendingTimer = window.setTimeout(() => this.speakNow(text), delay);
      else this.speakNow(text);
    } catch (err) {
      this.lastError = String(err);
    }
  }

  private flushQueue(immediate: boolean): void {
    window.clearTimeout(this.queueTimer);
    const next = this.queued;
    this.queued = null;
    if (!next) return;
    if (immediate) this.say(next, { interrupt: true });
    else window.setTimeout(() => this.say(next, { interrupt: true }), 150);
  }

  private speakNow(text: string): void {
    const synth = window.speechSynthesis;
    const u = new SpeechSynthesisUtterance(text);
    u.lang = 'en-US';
    if (this.voice && !IS_IOS) {
      u.voice = this.voice;
      u.lang = this.voice.lang;
    }
    u.rate = IS_IOS ? 0.85 : 0.8;
    u.pitch = 1.05;
    u.volume = 1;

    let started = false;
    const releaseDuck = () => {
      window.clearTimeout(this.holdTimer);
      this.holdTimer = window.setTimeout(() => {
        if (!this.busy) this.bus.setDucked(false);
      }, 150);
    };

    u.onstart = () => {
      started = true;
      this.primed = true;
      this.starts += 1;
      this.silentFails = 0;
    };

    const done = () => {
      if (this.current !== u) return;
      this.busy = false;
      if (this.queued) this.flushQueue(false);
      else releaseDuck();
    };

    u.onend = done;
    u.onerror = (ev) => {
      if (ev.error !== 'interrupted' && ev.error !== 'canceled') this.lastError = ev.error;
      done();
    };

    window.setTimeout(() => {
      if (!started && this.current === u) {
        this.silentFails += 1;
        done();
      }
    }, 2500);
    window.setTimeout(() => {
      if (this.current === u && this.busy) done();
    }, 4000);

    this.current = u;
    this.busy = true;
    synth.speak(u);
  }
}

class RecordedSpeechAdapter implements SpeechAdapter {
  private bus: AudioBus;
  private fallback: SystemSpeechAdapter;
  private files: Record<string, string> | null = null;
  private voice = '';
  private base = 'audio/';
  private raw = new Map<string, Promise<ArrayBuffer>>();
  private decoded = new Map<string, Promise<AudioBuffer>>();
  private current: AudioBufferSourceNode | null = null;
  private queued: string | null = null;
  private playing = false;
  private holdTimer = 0;
  private starts = 0;

  constructor(bus: AudioBus, fallback: SystemSpeechAdapter) {
    this.bus = bus;
    this.fallback = fallback;
    if (typeof fetch !== 'undefined' && location.protocol !== 'file:') {
      fetch(this.base + 'index.json', { cache: 'no-cache' })
        .then((r) => (r.ok ? r.json() : null))
        .then((data: { files?: Record<string, string>; voice?: string } | null) => {
          if (data?.files) {
            this.files = data.files;
            this.voice = data.voice ?? '';
          }
        })
        .catch(() => undefined);
    }
  }

  get available(): boolean {
    return !!this.files || this.fallback.available;
  }

  has(text: string): boolean {
    return !!this.files?.[text];
  }

  primeInGesture(): void {
    this.fallback.primeInGesture();
  }

  private load(text: string): Promise<ArrayBuffer> {
    let p = this.raw.get(text);
    if (!p) {
      p = fetch(this.base + this.files![text]).then((r) => {
        if (!r.ok) throw new Error(String(r.status));
        return r.arrayBuffer();
      });
      p.catch(() => this.raw.delete(text));
      this.raw.set(text, p);
    }
    return p;
  }

  private decode(text: string): Promise<AudioBuffer> {
    let p = this.decoded.get(text);
    if (!p) {
      const ac = this.bus.ctx!;
      p = this.load(text).then((buf) => ac.decodeAudioData(buf.slice(0)));
      p.catch(() => this.decoded.delete(text));
      this.decoded.set(text, p);
    }
    return p;
  }

  prefetch(texts: string[]): void {
    if (!this.files) return;
    for (const t of texts) {
      if (this.files[t]) this.load(t).catch(() => undefined);
    }
  }

  say(text: string, opts: { interrupt?: boolean } = {}): void {
    const ac = this.bus.ctx;
    if (!this.files?.[text] || !ac) {
      this.fallback.say(text, opts);
      return;
    }
    const interrupt = opts.interrupt ?? true;
    if (this.playing && !interrupt) {
      this.queued = text;
      return;
    }
    this.queued = null;
    if (this.current) {
      this.current.onended = null;
      try {
        this.current.stop();
      } catch {
        // ignore
      }
      this.current = null;
    }
    this.play(text);
  }

  private play(text: string): void {
    const ac = this.bus.ctx!;
    this.playing = true;
    window.clearTimeout(this.holdTimer);
    const alreadyDucked = this.bus.ducked;
    this.bus.setDucked(true, false);
    this.bus.ensureRunning();
    this.decode(text)
      .then((buf) => {
        if (!this.playing) return;
        const src = ac.createBufferSource();
        src.buffer = buf;
        src.connect(this.bus.sfx);
        src.start(ac.currentTime + (alreadyDucked ? 0.02 : DUCK_FADE_SEC));
        this.current = src;
        this.starts += 1;
        src.onended = () => {
          if (this.current === src) {
            this.current = null;
            this.finish();
          }
        };
      })
      .catch(() => {
        this.playing = false;
        this.bus.setDucked(false, false);
        this.fallback.say(text);
      });
  }

  private finish(): void {
    const next = this.queued;
    this.queued = null;
    if (next) {
      window.setTimeout(() => this.play(next), 150);
    } else {
      this.playing = false;
      this.holdTimer = window.setTimeout(() => {
        if (!this.playing) this.bus.setDucked(false, false);
      }, 150);
    }
  }

  test(text: string, cb: (ok: boolean, detail: string) => void): void {
    if (!this.files?.[text] || !this.bus.ctx) {
      this.fallback.test(text, (ok, msg) => cb(ok, `系统朗读：${msg}`));
      return;
    }
    const prevStarts = this.starts;
    this.say(text);
    window.setTimeout(
      () => cb(this.starts > prevStarts, `录音发音（${this.voice.split('-').pop()}）；${this.bus.describe()}`),
      2500,
    );
  }
}

class WebSfxAdapter implements SfxAdapter {
  private bus: AudioBus;
  muted = false;

  constructor(bus: AudioBus) {
    this.bus = bus;
  }

  private playFairyIntro(ac: AudioContext): void {
    this.bus.ensureRunning();
    const now = ac.currentTime + 0.02;
    const tone = (freq: number, start: number, dur: number, vol: number, type: OscillatorType = 'sine') => {
      const osc = ac.createOscillator();
      const gain = ac.createGain();
      osc.type = type;
      osc.frequency.setValueAtTime(freq, start);
      gain.gain.setValueAtTime(0.0001, start);
      gain.gain.linearRampToValueAtTime(vol, start + Math.min(0.04, dur * 0.25));
      gain.gain.exponentialRampToValueAtTime(0.0001, start + dur);
      osc.connect(gain);
      gain.connect(this.bus.sfx);
      osc.start(start);
      osc.stop(start + dur + 0.03);
    };

    // Warm dawn pad chord (C4 + G4 + E5)
    for (const f of [261.63, 392.0, 659.25]) {
      tone(f, now, 2.35, 0.045, 'sine');
    }
    // Ascending music-box / harp pentatonic shimmer
    const arp = [523.25, 587.33, 659.25, 783.99, 880.0, 1046.5, 1318.5, 1567.98];
    arp.forEach((f, i) => {
      tone(f, now + 0.08 + i * 0.11, 0.42, 0.09, 'triangle');
    });
    // Radiant golden chime chord when comet lights up "单词守卫 2.0" (t ≈ 1.02s)
    for (const f of [1046.5, 1318.5, 1567.98, 2349.32]) {
      tone(f, now + 1.02, 1.15, 0.075, 'sine');
    }
  }

  play(name: SfxName, pitch = 1): void {
    const ac = this.bus.ctx;
    if (this.muted || !ac) return;
    if (name === 'intro') {
      this.playFairyIntro(ac);
      return;
    }
    const patterns: Record<SfxName, [number, number, OscillatorType][]> = {
      tap: [[660, 0.05, 'triangle']],
      letter: [[880, 0.07, 'triangle']],
      pop: [
        [520, 0.06, 'square'],
        [780, 0.08, 'square'],
      ],
      correct: [
        [660, 0.08, 'triangle'],
        [880, 0.08, 'triangle'],
        [1320, 0.14, 'triangle'],
      ],
      wrong: [
        [220, 0.12, 'sawtooth'],
        [180, 0.16, 'sawtooth'],
      ],
      leak: [
        [300, 0.1, 'square'],
        [200, 0.1, 'square'],
        [140, 0.2, 'square'],
      ],
      win: [
        [523, 0.12, 'triangle'],
        [659, 0.12, 'triangle'],
        [784, 0.12, 'triangle'],
        [1047, 0.3, 'triangle'],
      ],
      lose: [
        [392, 0.18, 'triangle'],
        [330, 0.18, 'triangle'],
        [262, 0.35, 'triangle'],
      ],
      streak: [
        [784, 0.07, 'square'],
        [988, 0.07, 'square'],
        [1175, 0.07, 'square'],
        [1568, 0.22, 'square'],
      ],
      fast: [
        [1568, 0.05, 'triangle'],
        [2093, 0.09, 'triangle'],
      ],
      coin: [
        [1319, 0.05, 'square'],
        [1760, 0.1, 'square'],
      ],
      heart: [
        [330, 0.09, 'sawtooth'],
        [247, 0.09, 'sawtooth'],
        [165, 0.22, 'sawtooth'],
      ],
      escape: [
        [700, 0.06, 'triangle'],
        [560, 0.06, 'triangle'],
        [440, 0.06, 'triangle'],
        [330, 0.1, 'triangle'],
      ],
      card: [
        [523, 0.06, 'triangle'],
        [784, 0.12, 'triangle'],
      ],
      tick: [[1047, 0.03, 'square']],
      intro: [],
      record: [
        [659, 0.1, 'triangle'],
        [784, 0.1, 'triangle'],
        [988, 0.1, 'triangle'],
        [1319, 0.1, 'triangle'],
        [1568, 0.34, 'triangle'],
      ],
    };

    let t = ac.currentTime;
    for (const [freq, dur, type] of patterns[name]) {
      const osc = ac.createOscillator();
      const gain = ac.createGain();
      osc.type = type;
      osc.frequency.value = freq * pitch;
      gain.gain.setValueAtTime(1e-4, t);
      gain.gain.exponentialRampToValueAtTime(0.18, t + 0.01);
      gain.gain.exponentialRampToValueAtTime(1e-4, t + dur);
      osc.connect(gain).connect(this.bus.sfx);
      osc.start(t);
      osc.stop(t + dur + 0.02);
      t += dur * 0.9;
    }
  }
}

const midiToFreq = (m: number): number => 440 * 2 ** ((m - 69) / 12);
const CHORDS = [
  [60, 64, 67],
  [57, 60, 64],
  [53, 57, 60],
  [55, 59, 62],
];
const ARP = [0, 1, 2, 3, 2, 1, 3, 1];
const STEP_SEC = 60 / 100 / 2;
const MUSIC_GAIN = 0.55;

class WebMusicAdapter implements MusicAdapter {
  private bus: AudioBus;
  private _muted = false;
  private mood: MusicMood = 'off';
  private step = 0;
  private nextTime = 0;
  private timer = 0;
  private noise: AudioBuffer | null = null;
  private lastWake = 0;

  constructor(bus: AudioBus) {
    this.bus = bus;
    bus.onReady(() => {
      this.applyLevel();
      this.start();
    });
    bus.onRebuild(() => this.start());
    document.addEventListener('visibilitychange', () => {
      const ac = this.bus.ctx;
      if (ac) {
        if (document.hidden) ac.suspend();
        else ac.resume();
      }
    });
  }

  get muted(): boolean {
    return this._muted;
  }

  set muted(v: boolean) {
    this._muted = v;
    this.applyLevel();
  }

  setMood(mood: MusicMood): void {
    if (mood !== this.mood) {
      this.mood = mood;
      this.applyLevel();
    }
  }

  private applyLevel(): void {
    const level = this._muted || this.mood === 'off' ? 0 : MUSIC_GAIN;
    this.bus.setMusicLevel(level);
  }

  private start(): void {
    const ac = this.bus.ctx!;
    this.nextTime = ac.currentTime + 0.1;
    const len = Math.floor(ac.sampleRate * 0.05);
    this.noise = ac.createBuffer(1, len, ac.sampleRate);
    const data = this.noise.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    window.clearInterval(this.timer);
    this.timer = window.setInterval(() => this.schedule(), 25);
  }

  private schedule(): void {
    const ac = this.bus.ctx;
    if (!ac) return;
    if (ac.state !== 'running') {
      if (performance.now() - this.lastWake > 1000) {
        this.lastWake = performance.now();
        this.bus.ensureRunning();
      }
      return;
    }
    if (this.nextTime < ac.currentTime - 0.2) this.nextTime = ac.currentTime + 0.05;
    while (this.nextTime < ac.currentTime + 0.15) {
      if (this.mood !== 'off' && !this._muted) this.playStep(this.step, this.nextTime);
      this.step = (this.step + 1) % (CHORDS.length * 8);
      this.nextTime += STEP_SEC;
    }
  }

  private playStep(step: number, t: number): void {
    const bar = Math.floor(step / 8);
    const beat = step % 8;
    const chord = CHORDS[bar];
    const arpNote = (i: number) => (i === 3 ? chord[0] + 12 : chord[i]);
    const mood = this.mood;

    if (beat === 0) {
      for (const n of chord) this.note(midiToFreq(n), t, STEP_SEC * 8, 'sine', 0.035, 0.25);
    }
    if (mood !== 'calm' || beat % 2 === 0) {
      const oct = mood === 'danger' ? 12 : 0;
      this.note(midiToFreq(arpNote(ARP[beat]) + 12 + oct), t, STEP_SEC * 0.9, 'triangle', mood === 'calm' ? 0.05 : 0.06, 0.005);
    }
    if (mood !== 'calm' && (beat % 4 === 0 || (mood === 'danger' && beat % 2 === 0))) {
      this.note(midiToFreq(chord[0] - 24), t, STEP_SEC * 1.6, 'sine', 0.12, 0.01);
    }
    if (mood === 'danger') {
      if (beat % 4 === 0) this.kick(t);
      this.hat(t, beat % 2 === 1 ? 0.05 : 0.025);
    }
  }

  private note(freq: number, t: number, dur: number, type: OscillatorType, vol: number, attack: number): void {
    const ac = this.bus.ctx!;
    const osc = ac.createOscillator();
    const gain = ac.createGain();
    osc.type = type;
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(1e-4, t);
    gain.gain.linearRampToValueAtTime(vol, t + attack);
    gain.gain.exponentialRampToValueAtTime(1e-4, t + dur);
    osc.connect(gain).connect(this.bus.music);
    osc.start(t);
    osc.stop(t + dur + 0.05);
  }

  private kick(t: number): void {
    const ac = this.bus.ctx!;
    const osc = ac.createOscillator();
    const gain = ac.createGain();
    osc.frequency.setValueAtTime(140, t);
    osc.frequency.exponentialRampToValueAtTime(45, t + 0.12);
    gain.gain.setValueAtTime(0.25, t);
    gain.gain.exponentialRampToValueAtTime(1e-4, t + 0.18);
    osc.connect(gain).connect(this.bus.music);
    osc.start(t);
    osc.stop(t + 0.2);
  }

  private hat(t: number, vol: number): void {
    if (!this.noise) return;
    const ac = this.bus.ctx!;
    const src = ac.createBufferSource();
    src.buffer = this.noise;
    const filter = ac.createBiquadFilter();
    filter.type = 'highpass';
    filter.frequency.value = 7000;
    const gain = ac.createGain();
    gain.gain.setValueAtTime(vol, t);
    gain.gain.exponentialRampToValueAtTime(1e-4, t + 0.04);
    src.connect(filter).connect(gain).connect(this.bus.music);
    src.start(t);
  }
}

export function createWebPlatform(): Platform {
  const bus = new AudioBus();
  (window as unknown as Record<string, unknown>).__wordGuardAudio = bus;
  const speech = new RecordedSpeechAdapter(bus, new SystemSpeechAdapter(bus));
  (window as unknown as Record<string, unknown>).__wordGuardSpeech = speech;

  const unlock = () => {
    bus.unlock();
    speech.primeInGesture();
  };
  for (const ev of ['touchend', 'pointerup', 'click', 'keydown']) {
    window.addEventListener(ev, unlock, { capture: true, passive: true });
  }

  return {
    name: 'web',
    storage: new LocalStorageAdapter(),
    speech,
    sfx: new WebSfxAdapter(bus),
    music: new WebMusicAdapter(bus),
    now: () => Date.now(),
    haptic: (pattern) => {
      try {
        navigator.vibrate?.(pattern);
      } catch {
        // ignore
      }
    },
  };
}
