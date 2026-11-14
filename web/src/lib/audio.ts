// Микрофон, запись (MediaRecorder) и энергетический VAD в браузере.
// Живые метрики считаются здесь, без сервера (раздел 11.7 спецификации).

export type MicErrorKind = "denied" | "not_found" | "busy" | "unsupported";

export class MicError extends Error {
  constructor(public kind: MicErrorKind, message: string) {
    super(message);
  }
}

export class MicSession {
  private buf: Float32Array<ArrayBuffer>;
  private constructor(
    public stream: MediaStream,
    public ctx: AudioContext,
    public analyser: AnalyserNode,
  ) {
    this.buf = new Float32Array(new ArrayBuffer(analyser.fftSize * 4));
  }

  static async open(): Promise<MicSession> {
    if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) {
      throw new MicError("unsupported", "getUserMedia недоступен");
    }
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      });
    } catch (e) {
      const name = (e as DOMException)?.name;
      if (name === "NotAllowedError" || name === "SecurityError") throw new MicError("denied", name);
      if (name === "NotFoundError" || name === "OverconstrainedError") throw new MicError("not_found", name);
      if (name === "NotReadableError" || name === "AbortError") throw new MicError("busy", name);
      throw new MicError("not_found", String(e));
    }
    if (!stream.getAudioTracks().some((t) => t.readyState === "live")) {
      stream.getTracks().forEach((t) => t.stop());
      throw new MicError("not_found", "нет живой звуковой дорожки");
    }
    const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    const ctx = new Ctx();
    if (ctx.state === "suspended") await ctx.resume().catch(() => undefined);
    const src = ctx.createMediaStreamSource(stream);
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 1024;
    src.connect(analyser);
    return new MicSession(stream, ctx, analyser);
  }

  /** Среднеквадратичная амплитуда текущего кадра, 0..1. */
  rms(): number {
    this.analyser.getFloatTimeDomainData(this.buf);
    let sum = 0;
    for (let i = 0; i < this.buf.length; i++) sum += this.buf[i] * this.buf[i];
    return Math.sqrt(sum / this.buf.length);
  }

  get alive(): boolean {
    return this.stream.getAudioTracks().some((t) => t.readyState === "live");
  }

  close() {
    this.stream.getTracks().forEach((t) => t.stop());
    this.ctx.close().catch(() => undefined);
  }
}

/** 0..5 делений уровня по громкости (логарифмическая шкала). */
export function levelBars(rms: number): number {
  if (rms <= 0) return 0;
  const db = 20 * Math.log10(rms);
  return Math.max(0, Math.min(5, Math.round((db + 52) / 7)));
}

export interface VadState {
  elapsedMs: number;
  speaking: boolean;
  level: number;
  firstMs: number | null;
  speechMs: number;
  pausesOver1s: number;
  pauseRatio: number | null;
  currentPauseMs: number;
  segments: [number, number][];
  longPauses: { start: number; end: number }[];
}

export interface PauseEvent {
  t: number;
  value: number;
}

/** Энергетический детектор речи с адаптивным порогом шума. */
export class Vad {
  private floor = 0.004;
  private above = 0;
  private lastVoiceMs = -1;
  speaking = false;
  firstMs: number | null = null;
  speechMs = 0;
  segments: [number, number][] = [];
  pauses: PauseEvent[] = [];
  private pauseStart: number | null = null;

  constructor(private hangoverMs = 300) {}

  push(rms: number, nowMs: number, dtMs: number) {
    const thr = Math.max(0.012, this.floor * 3.2);
    const voiced = rms > thr;
    if (!voiced) this.floor = this.floor * 0.98 + rms * 0.02;
    this.above = voiced ? this.above + 1 : 0;
    if (voiced && this.above >= 2) this.lastVoiceMs = nowMs;
    const wasSpeaking = this.speaking;
    this.speaking = this.lastVoiceMs >= 0 && nowMs - this.lastVoiceMs <= this.hangoverMs;
    if (this.speaking) {
      this.speechMs += dtMs;
      if (!wasSpeaking) {
        const start = Math.max(0, nowMs - dtMs * 2);
        if (this.firstMs === null) this.firstMs = start;
        if (this.pauseStart !== null) {
          const len = start - this.pauseStart;
          if (len >= 1000) this.pauses.push({ t: this.pauseStart / 1000, value: len / 1000 });
          this.pauseStart = null;
        }
        this.segments.push([start, nowMs]);
      } else if (this.segments.length) {
        this.segments[this.segments.length - 1][1] = nowMs;
      }
    } else if (wasSpeaking) {
      this.pauseStart = nowMs;
    }
  }

  snapshot(nowMs: number, rms: number): VadState {
    const current = !this.speaking && this.pauseStart !== null ? nowMs - this.pauseStart : 0;
    const spoken = this.firstMs === null ? 0 : nowMs - this.firstMs;
    const longPauses = this.pauses.filter((p) => p.value >= 2).map((p) => ({ start: p.t * 1000, end: (p.t + p.value) * 1000 }));
    return {
      elapsedMs: nowMs,
      speaking: this.speaking,
      level: levelBars(rms),
      firstMs: this.firstMs,
      speechMs: this.speechMs,
      pausesOver1s: this.pauses.length + (current >= 1000 ? 1 : 0),
      pauseRatio: spoken > 500 ? Math.max(0, Math.min(1, 1 - this.speechMs / spoken)) : null,
      currentPauseMs: this.firstMs === null ? nowMs : current,
      segments: this.segments.map((s) => [s[0], s[1]] as [number, number]),
      longPauses,
    };
  }
}

export function pickMime(): string {
  if (typeof MediaRecorder === "undefined") return "";
  for (const m of ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/ogg;codecs=opus"]) {
    if (MediaRecorder.isTypeSupported?.(m)) return m;
  }
  return "";
}

export interface RecordingResult {
  blob: Blob;
  mime: string;
  durationMs: number;
  speechMs: number;
  vad: VadState;
  pauses: PauseEvent[];
}

/** Запись одного упражнения: MediaRecorder + VAD, тик 4 раза в секунду. */
export class SpeechRecorder {
  private rec: MediaRecorder | null = null;
  private chunks: Blob[] = [];
  private vad = new Vad();
  private timer: ReturnType<typeof setInterval> | null = null;
  private t0 = 0;
  private lastFrame = 0;
  private lastTick = 0;
  private lastRms = 0;
  mime = "";

  constructor(
    private mic: MicSession,
    private opts: { maxMs: number; onTick: (s: VadState) => void; onAutoStop: () => void; onTrackEnded?: () => void },
  ) {}

  start() {
    this.mime = pickMime();
    if (typeof MediaRecorder !== "undefined") {
      this.rec = this.mime ? new MediaRecorder(this.mic.stream, { mimeType: this.mime }) : new MediaRecorder(this.mic.stream);
      this.mime = this.rec.mimeType || this.mime || "audio/webm";
      this.rec.ondataavailable = (e) => {
        if (e.data && e.data.size) this.chunks.push(e.data);
      };
      this.rec.start(1000);
    }
    this.mic.stream.getAudioTracks().forEach((tr) => (tr.onended = () => this.opts.onTrackEnded?.()));
    this.t0 = performance.now();
    this.lastFrame = this.t0;
    this.timer = setInterval(() => this.frame(), 50);
    this.opts.onTick(this.vad.snapshot(0, 0));
  }

  private frame() {
    const now = performance.now();
    const elapsed = now - this.t0;
    const dt = now - this.lastFrame;
    this.lastFrame = now;
    this.lastRms = this.mic.rms();
    this.vad.push(this.lastRms, elapsed, dt);
    if (now - this.lastTick >= 250) {
      this.lastTick = now;
      this.opts.onTick(this.vad.snapshot(elapsed, this.lastRms));
    }
    if (elapsed >= this.opts.maxMs) {
      this.clearTimer();
      this.opts.onAutoStop();
    }
  }

  private clearTimer() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  elapsed(): number {
    return performance.now() - this.t0;
  }

  async stop(): Promise<RecordingResult> {
    this.clearTimer();
    const durationMs = Math.min(this.opts.maxMs, performance.now() - this.t0);
    const snap = this.vad.snapshot(durationMs, this.lastRms);
    if (this.rec && this.rec.state !== "inactive") {
      await new Promise<void>((resolve) => {
        this.rec!.onstop = () => resolve();
        try {
          this.rec!.stop();
        } catch {
          resolve();
        }
      });
    }
    const blob = new Blob(this.chunks, { type: this.mime || "audio/webm" });
    return { blob, mime: this.mime || "audio/webm", durationMs, speechMs: snap.speechMs, vad: snap, pauses: [...this.vad.pauses] };
  }

  cancel() {
    this.clearTimer();
    try {
      if (this.rec && this.rec.state !== "inactive") this.rec.stop();
    } catch {
      /* ничего */
    }
    this.chunks = [];
  }
}
