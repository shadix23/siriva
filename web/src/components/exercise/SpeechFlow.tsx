"use client";
// Речевое упражнение E0-E6 со всеми состояниями записи (UX-SPEC 5.3-5.7).
import { useCallback, useEffect, useRef, useState } from "react";
import { Icon } from "../Icon";
import { Notice, StepHeading, useAnnounce, useAnnounceClear } from "../ui";
import {
  AddressBarHint,
  CalmTimer,
  CategoryCard,
  LanguageChoice,
  MicLevel,
  StimulusPicture,
  StopDialog,
  StoryPlayer,
} from "./parts";
import { TranslateContext, useT } from "@/lib/i18n/context";
import { t as demoT } from "@/components/demo-i18n";
import type { ApiError } from "@/lib/api/client";
import { api } from "@/lib/api/client";
import type { Lang, SpeechResult, Story, TelemetryEvent } from "@/lib/api/types";
import { MicError, MicSession, SpeechRecorder, type RecordingResult, type VadState } from "@/lib/audio";
import { DELAYED_ID, STORY_BY_LANG, type ProgramRow, type SpeechDef } from "@/lib/exercises";
import { hhmm } from "@/lib/format";
import { usePrefersReducedMotion } from "@/lib/hooks";
import { store, today } from "@/lib/storage";
import { enqueue, removeFromQueue, sendWithRetry, type QueuedUpload } from "@/lib/upload-queue";
import { ensureSession, withSession } from "@/lib/session";

export const SHORT_SPEECH_MS = 20_000;
export const SILENT_SPEECH_MS = 3_000;
export const SILENCE_WARN_MS = 10_000;
export const HINT_OFFER_MS = 7_000;

type Stage =
  | "intro"
  | "mic"
  | "ready"
  | "recording"
  | "saving"
  | "saved"
  | "short"
  | "silent"
  | "interrupted"
  | "denied"
  | "notfound"
  | "rejected"
  | "consent";

export interface DemoHooks {
  onVad?: (s: VadState | null) => void;
  onRecording?: (on: boolean) => void;
  onUploadStart?: () => void;
  onResult?: (r: SpeechResult) => void;
  onUploadError?: (e: ApiError, retry: () => void) => void;
}

export interface SpeechFlowProps {
  def: SpeechDef;
  patientId: string;
  /** если не задан, сессия создаётся лениво при первой отправке */
  sessionId?: string;
  stories: Story[];
  picture: { id: string; src: string; scene: string };
  initialLang: Lang;
  /** для второй части пересказа: язык и рассказ как в первой */
  locked?: { lang: Lang; storyId: string };
  nextRow?: ProgramRow | null;
  demo?: DemoHooks & { startAt?: "ready"; showSeconds?: boolean };
  onSaved?: () => void;
  onExit: () => void;
  onNext?: (row: ProgramRow) => void;
  registerToggle?: (fn: (() => void) | null) => void;
  /** «К программе» в шапке: родитель спрашивает, можно ли уйти без диалога */
  registerBackGuard?: (fn: (() => boolean) | null) => void;
}

const REC_FLAG = "es.recording";

export function SpeechFlow(props: SpeechFlowProps) {
  const { def, patientId, sessionId, demo } = props;
  const ctxT = useT();
  // В демо тексты на языке интерфейса демо (RU / EN), в пути пациента всегда русский.
  const t = demo ? demoT : ctxT;
  const announce = useAnnounce();
  const clearAnnouncer = useAnnounceClear();
  const reduced = usePrefersReducedMotion();
  const [stage, setStage] = useState<Stage>(() => {
    if (demo?.startAt) return "ready";
    try {
      if (window.sessionStorage.getItem(REC_FLAG) === def.itemId) {
        window.sessionStorage.removeItem(REC_FLAG);
        return "interrupted";
      }
    } catch {
      /* ничего */
    }
    return "intro";
  });
  const [lang, setLang] = useState<Lang>(props.locked?.lang ?? props.initialLang);
  const [vad, setVad] = useState<VadState | null>(null);
  const [hintIdx, setHintIdx] = useState(-1);
  const [stopOpen, setStopOpen] = useState(false);
  const [heard, setHeard] = useState(false);
  const [micPhase, setMicPhase] = useState<"explain" | "asking" | "listening">("explain");
  const [micLevel, setMicLevel] = useState({ level: 0, heard: false });
  const [uploadIssue, setUploadIssue] = useState<"failed" | null>(null);
  const [uploadState, setUploadState] = useState<"idle" | "sending" | "sent">("idle");
  const mounted = useRef(true);
  const [stopReason, setStopReason] = useState<"user" | "timeout" | "interrupted">("user");
  const [delayedAt, setDelayedAt] = useState<string | null>(null);
  const [retrying, setRetrying] = useState(false);
  const [retryFailed, setRetryFailed] = useState(0);

  const mic = useRef<MicSession | null>(null);
  const rec = useRef<SpeechRecorder | null>(null);
  const result = useRef<RecordingResult | null>(null);
  const events = useRef<TelemetryEvent[]>([]);
  const t0 = useRef(performance.now());
  const offered = useRef(false);
  const announced = useRef({ s30: false, s10: false });
  const hiddenAt = useRef<number | null>(null);
  const pendingUpload = useRef<QueuedUpload | null>(null);

  const storyId = props.locked?.storyId ?? STORY_BY_LANG[lang];
  const story = props.stories.find((s) => s.id === storyId);
  const exT = () => Math.round((performance.now() - t0.current) / 100) / 10;

  const ev = useCallback(
    (e: Omit<TelemetryEvent, "exercise_id">) => events.current.push({ ...e, exercise_id: def.exerciseId }),
    [def.exerciseId],
  );
  const flushTelemetry = useCallback(() => {
    const batch = events.current.splice(0);
    if (!batch.length) return;
    (sessionId ? api.telemetry(sessionId, batch) : withSession(patientId, (sid) => api.telemetry(sid, batch))).catch(
      () => undefined,
    );
  }, [sessionId, patientId]);

  const closeMic = useCallback(() => {
    mic.current?.close();
    mic.current = null;
  }, []);

  // Уход со страницы: остановить микрофон, отправить накопленные события.
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  useEffect(
    () => () => {
      rec.current?.cancel();
      closeMic();
      flushTelemetry();
      try {
        window.sessionStorage.removeItem(REC_FLAG);
      } catch {
        /* ничего */
      }
    },
    [closeMic, flushTelemetry],
  );

  async function ensureMic(retry = false): Promise<MicSession | null> {
    if (mic.current?.alive) return mic.current;
    closeMic();
    try {
      mic.current = await MicSession.open();
      return mic.current;
    } catch (e) {
      const kind = e instanceof MicError ? e.kind : "not_found";
      const reason = kind === "denied" ? "denied" : kind === "busy" ? "busy" : "not_found";
      ev({ type: "mic_error", t: exT(), meta: { reason } });
      store.setMicChecked(false);
      setStage(kind === "denied" ? "denied" : "notfound");
      if (!retry) announce(kind === "denied" ? t("mic.denied.title") : t("mic.notfound.title"));
      return null;
    }
  }

  /* E2: проверка микрофона */
  useEffect(() => {
    if (stage !== "mic" || micPhase !== "listening") return;
    let heardAny = false;
    const id = setInterval(() => {
      const m = mic.current;
      if (!m) return;
      const r = m.rms();
      const level = Math.max(0, Math.min(5, Math.round((20 * Math.log10(Math.max(r, 1e-6)) + 52) / 7)));
      if (level >= 3) heardAny = true;
      setMicLevel({ level, heard: heardAny });
    }, 120);
    return () => clearInterval(id);
  }, [stage, micPhase]);

  /* E4: запись */
  async function startRecording() {
    const m = await ensureMic();
    if (!m) return;
    offered.current = false;
    announced.current = { s30: false, s10: false };
    setHintIdx(-1);
    setVad(null);
    result.current = null;
    const r = new SpeechRecorder(m, {
      maxMs: def.maxMs,
      onTick: (s) => {
        setVad(s);
        demo?.onVad?.(s);
        const left = def.maxMs - s.elapsedMs;
        if (!announced.current.s30 && left <= 30_000) {
          announced.current.s30 = true;
          announce(t("timer.sr_30"));
        }
        if (!announced.current.s10 && left <= 10_000) {
          announced.current.s10 = true;
          announce(t("timer.sr_10"));
        }
        if (s.currentPauseMs >= HINT_OFFER_MS) {
          if (!offered.current) {
            offered.current = true;
            ev({ type: "hint_offered", t: Math.round(s.elapsedMs / 100) / 10 });
          }
        } else offered.current = false;
      },
      onAutoStop: () => void finish("timeout"),
      onTrackEnded: () => void finish("interrupted"),
    });
    rec.current = r;
    try {
      r.start();
    } catch {
      // MediaRecorder не запустился (микрофон занят или отключился): спокойное состояние «Микрофон не найден».
      rec.current = null;
      closeMic();
      ev({ type: "mic_error", t: exT(), meta: { reason: "busy" } });
      setStage("notfound");
      announce(t("mic.notfound.title"));
      return;
    }
    try {
      window.sessionStorage.setItem(REC_FLAG, def.itemId);
    } catch {
      /* ничего */
    }
    setStage("recording");
    demo?.onRecording?.(true);
    announce(t("rec.live"));
  }

  const finish = useCallback(
    async (reason: "user" | "timeout" | "interrupted") => {
      const r = rec.current;
      if (!r) return;
      rec.current = null;
      try {
        window.sessionStorage.removeItem(REC_FLAG);
      } catch {
        /* ничего */
      }
      const res = await r.stop();
      result.current = res;
      demo?.onRecording?.(false);
      setStopReason(reason);
      const secs = (ms: number) => Math.round(ms / 100) / 10;
      if (res.vad.firstMs !== null) ev({ type: "first_action", t: secs(res.vad.firstMs) });
      res.pauses.forEach((p) => ev({ type: "pause", t: Math.round(p.t * 10) / 10, value: Math.round(p.value * 10) / 10 }));
      ev({ type: "stop_reason", t: secs(res.durationMs), meta: { reason } });
      if (reason === "interrupted") {
        ev({ type: "interrupt", t: secs(res.durationMs) });
        setStage("interrupted");
        announce(t("rec.interrupted_title"));
        return;
      }
      if (res.speechMs < SILENT_SPEECH_MS && !demo) {
        setStage("silent");
        announce(t("rec.silent_title"));
        return;
      }
      if (res.speechMs < SHORT_SPEECH_MS && reason === "user" && !demo) {
        setStage("short");
        return;
      }
      void save();
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [demo, ev],
  );

  props.registerToggle?.(
    stage === "ready" ? () => void startRecording() : stage === "recording" ? () => void finish("user") : null,
  );

  // Прерывание: вкладка скрыта дольше 5 секунд во время записи.
  useEffect(() => {
    if (stage !== "recording") return;
    const on = () => {
      if (document.hidden) {
        hiddenAt.current = Date.now();
      } else if (hiddenAt.current && Date.now() - hiddenAt.current > 5000) {
        hiddenAt.current = null;
        void finish("interrupted");
      } else hiddenAt.current = null;
    };
    document.addEventListener("visibilitychange", on);
    return () => document.removeEventListener("visibilitychange", on);
  }, [stage, finish]);

  // «К программе» во время записи открывает защитный диалог.
  useEffect(() => {
    props.registerBackGuard?.(() => {
      if (stage === "recording") {
        setStopOpen(true);
        return false;
      }
      return true;
    });
    return () => props.registerBackGuard?.(null);
  });

  /* E5-E6: сохранить на устройство, отправить в фоне */
  async function save() {
    const res = result.current;
    if (!res) return;
    setStage("saving");
    announce(t("ex.saving"));
    const started = performance.now();
    // Сессия создаётся здесь, при первой сохранённой записи; без сервера запись ждёт в очереди без сессии.
    const sid = sessionId ?? (await ensureSession(patientId).catch(() => ""));
    const u: QueuedUpload = {
      id: `${sid || "nosession"}:${def.itemId}:${Date.now()}`,
      patient_id: patientId,
      session_id: sid,
      exercise_id: def.exerciseId,
      item_key: def.itemId,
      phase: def.phase,
      story_id: def.stimulus === "story" || def.stimulus === "story-delayed" ? storyId : undefined,
      picture_id: def.stimulus === "picture" ? props.picture.id : undefined,
      category: def.stimulus === "category" ? "animals" : undefined,
      language: lang,
      blob: res.blob,
      mime: res.mime,
      created_at: new Date().toISOString(),
      attempts: 0,
    };
    pendingUpload.current = u;
    await enqueue(u);
    const nowIso = new Date().toISOString();
    today.update(patientId, (s) => {
      s.done[def.itemId] = nowIso;
      if (sid) s.session_id = sid;
      if (def.itemId === "story_retell") {
        s.story_id = storyId;
        s.story_lang = lang;
        s.delayed_available_at = new Date(Date.now() + 20 * 60_000).toISOString();
        s.demo_skip_wait = false;
      }
      return s;
    });
    if (def.itemId === "story_retell") setDelayedAt(new Date(Date.now() + 20 * 60_000).toISOString());
    flushTelemetry();
    closeMic();
    props.onSaved?.();
    const wait = Math.max(0, 450 - (performance.now() - started));
    setTimeout(() => {
      setStage("saved");
      // Сервер ещё не подтвердил запись: пациенту говорим только то, что уже правда.
      // В демо «сохранено» звучит после ответа сервера (ниже, в upload).
      if (!demo) announce(t("rec.saved_local"));
    }, wait);
    void upload(u);
  }

  async function upload(u: QueuedUpload) {
    setUploadIssue(null);
    setUploadState("sending");
    demo?.onUploadStart?.();
    const out = await sendWithRetry(u, demo ? 0 : 5000);
    setUploadState(out.ok ? "sent" : "idle");
    // Фраза «сохранена на устройстве и отправляется» больше не правда: убираем её из общей области,
    // а «Запись отправлена» объявляет строка статуса на экране (REHEARSAL-1 R-1).
    if (out.ok && !demo && mounted.current) clearAnnouncer();
    if (out.ok) {
      const at = out.result.delayed_available_at;
      if (at && def.itemId === "story_retell") {
        today.update(patientId, (s) => ({ ...s, delayed_available_at: at }));
        setDelayedAt(at);
      }
      if (demo) announce(t("rec.saved"));
      demo?.onResult?.(out.result);
      props.onSaved?.();
      return;
    }
    const e = out.error;
    demo?.onUploadError?.(e, () => void upload(u));
    if (e.code === "empty_audio") {
      await dropLocal(u);
      setStage("silent");
    } else if (e.code === "consent_required") {
      setStage("consent");
    } else if (e.status === 413 || e.status === 422) {
      await dropLocal(u);
      setStage("rejected");
    } else {
      setUploadIssue("failed");
    }
    props.onSaved?.();
  }

  async function dropLocal(u: QueuedUpload) {
    await removeFromQueue(u.id);
    today.update(patientId, (s) => {
      delete s.done[def.itemId];
      return s;
    });
  }

  /** Повторный запрос микрофона с видимым откликом (A11). */
  async function retryMic() {
    setRetrying(true);
    const m = await ensureMic(true);
    setRetrying(false);
    if (m) {
      setRetryFailed(0);
      setMicPhase("listening");
      setStage("mic");
    } else setRetryFailed((n) => n + 1);
  }

  /** Пропустить упражнение сегодня: занятие проходится и без микрофона. */
  function skipToday() {
    ev({ type: "stop_reason", t: exT(), meta: { reason: "user", skipped: true } });
    flushTelemetry();
    closeMic();
    const now = new Date().toISOString();
    today.update(patientId, (s) => {
      s.skipped = { ...(s.skipped ?? {}), [def.itemId]: now };
      if (def.itemId === "story_retell") s.skipped[DELAYED_ID] = now;
      return s;
    });
    props.onSaved?.();
    if (props.nextRow) props.onNext?.(props.nextRow);
    else props.onExit();
  }

  function restart() {
    result.current = null;
    setUploadIssue(null);
    setStage("ready");
  }

  /* ---------- отрисовка ---------- */
  const showStimulus = ["ready", "recording"].includes(stage) || (demo && ["saving", "saved"].includes(stage));
  const stimulus =
    def.stimulus === "picture" ? (
      <StimulusPicture src={props.picture.src} alt={t("picture.alt", { scene: props.picture.scene })} />
    ) : def.stimulus === "category" ? (
      <CategoryCard />
    ) : null;

  const hints = def.hints.map((k) =>
    t(k, { start: story ? story.text.split(/\s+/).slice(0, 3).join(" ") : "" }),
  );

  let panel: React.ReactNode = null;
  switch (stage) {
    case "intro":
      panel = (
        <div className="stage">
          <StepHeading>{t(def.title)}</StepHeading>
          <div className="stage-body">
            <p className="lead">{t(def.intro)}</p>
            {def.stimulus !== "story-delayed" ? <p className="muted">{t(def.duration)}</p> : null}
          </div>
          {!props.locked ? (
            <div className="stack">
              <p id="lang-q" style={{ fontWeight: 600 }}>
                {t("ex.lang_title")}
              </p>
              <LanguageChoice value={lang} onChange={setLang} labelledBy="lang-q" />
            </div>
          ) : null}
          <div className="actions sticky">
            <button
              className="btn btn-primary btn-block"
              type="button"
              onClick={() => {
                if (!props.locked) store.setLang(lang);
                setStage(store.micCheckedToday() ? "ready" : "mic");
              }}
            >
              {t("ex.understood")}
            </button>
          </div>
        </div>
      );
      break;
    case "mic":
      panel = (
        <div className="stage">
          <StepHeading>{t("mic.check_title")}</StepHeading>
          {micPhase === "explain" || micPhase === "asking" ? (
            <>
              <p className="lead">{t("mic.check_intro")}</p>
              {micPhase === "asking" ? (
                <p className="muted" role="status">
                  {t("mic.asking")}
                </p>
              ) : null}
              <div className="actions sticky">
                <button
                  className="btn btn-primary btn-block"
                  type="button"
                  disabled={micPhase === "asking"}
                  aria-busy={micPhase === "asking"}
                  onClick={async () => {
                    setMicPhase("asking");
                    const m = await ensureMic();
                    setMicPhase(m ? "listening" : "explain");
                  }}
                >
                  <Icon name="mic" />
                  {micPhase === "asking" ? t("mic.asking_button") : t("mic.check_allow")}
                </button>
              </div>
            </>
          ) : (
            <>
              <p className="lead">{t("mic.check_say")}</p>
              <MicLevel level={micLevel.level} speaking={micLevel.level >= 3} reduced={reduced} />
              <p className={micLevel.heard ? "ok-label" : "muted"} role="status">
                {micLevel.heard ? <Icon name="check-circle" /> : null}
                {micLevel.heard ? t("mic.hear_ok") : t("mic.hear_none")}
              </p>
              <div className="actions sticky">
                <button
                  className="btn btn-primary btn-block"
                  type="button"
                  onClick={() => {
                    store.setMicChecked(true);
                    setStage("ready");
                  }}
                >
                  {t("mic.check_done")}
                </button>
              </div>
            </>
          )}
        </div>
      );
      break;
    case "ready": {
      const needsListen = def.stimulus === "story" && !heard;
      panel = (
        <div className="stage">
          <StepHeading focus={!demo}>{def.stimulus === "story" && !heard ? t(def.intro) : t("ex.ready_title")}</StepHeading>
          <div className="stage-body">
            {def.stimulus === "story" ? (
              <StoryPlayer
                storyId={storyId}
                text={story?.text ?? ""}
                lang={lang}
                primary={needsListen}
                events={{
                  onHeard: () => setHeard(true),
                  onReplay: () => ev({ type: "story_replayed", t: exT() }),
                  onTextShown: () => {
                    ev({ type: "story_text_shown", t: exT() });
                    store.logStoryText({ patient_id: patientId, session_id: sessionId ?? today.read(patientId).session_id, story_id: storyId, at: new Date().toISOString() });
                    setHeard(true);
                  },
                }}
              />
            ) : null}
            {!needsListen ? <p>{t(def.ready)}</p> : null}
            {!needsListen && store.micCheckedToday() && !demo ? (
              <p className="ok-label" style={{ fontWeight: 500 }}>
                <Icon name="mic" />
                {t("ex.mic_checked")}
              </p>
            ) : null}
          </div>
          {!needsListen ? (
            <div className="actions sticky">
              <button className="btn btn-primary btn-block" type="button" onClick={() => void startRecording()}>
                <Icon name="mic" />
                {t("ex.start_rec")}
              </button>
            </div>
          ) : null}
        </div>
      );
      break;
    }
    case "recording": {
      const silence = vad && vad.firstMs === null && vad.elapsedMs >= SILENCE_WARN_MS;
      const offer = vad && vad.currentPauseMs >= HINT_OFFER_MS;
      panel = (
        <div className="stage">
          <p className="rec-label">
            <span className="rec-dot" aria-hidden="true" />
            {t("rec.live")}
          </p>
          <StepHeading focus={false}>{t(def.recTitle)}</StepHeading>
          {silence ? (
            <Notice kind="attention" role="status">
              <p>{t("rec.silence")}</p>
              <p className="small">{t("rec.silence_hint")}</p>
            </Notice>
          ) : null}
          <CalmTimer elapsedMs={vad?.elapsedMs ?? 0} maxMs={def.maxMs} showSeconds={demo?.showSeconds} />
          <MicLevel level={vad?.level ?? 0} speaking={Boolean(vad?.speaking)} reduced={reduced} />
          <div className="hint-row">
            <button
              className="btn btn-secondary"
              type="button"
              onClick={() => {
                setHintIdx((i) => (i + 1) % hints.length);
                ev({ type: "hint", t: Math.round((vad?.elapsedMs ?? 0) / 100) / 10 });
              }}
            >
              <Icon name="help" />
              {t("ex.hint")}
            </button>
            {offer && hintIdx < 0 ? <span className="hint-offer">{t("ex.hint_offer")}</span> : null}
          </div>
          {hintIdx >= 0 ? (
            <HintBox text={hints[hintIdx]} />
          ) : null}
          <div className="actions sticky">
            <p className="rec-mini" aria-hidden="true">
              <span className="rec-dot" />
              {t("rec.live")}
            </p>
            <FinishButton onClick={() => void finish("user")} />
          </div>
        </div>
      );
      break;
    }
    case "saving":
      panel = (
        <div className="stage">
          <StepHeading>{t("ex.saving")}</StepHeading>
          <div className="progress" aria-hidden="true">
            <span style={{ transform: "scaleX(1)" }} />
          </div>
          <p className="muted">{t("ex.saving_body")}</p>
        </div>
      );
      break;
    case "saved": {
      const isWait = def.itemId === "story_retell";
      const at = delayedAt ?? today.read(patientId).delayed_available_at;
      const next = props.nextRow;
      panel = (
        <div className="stage">
          <p className="ok-label">
            <Icon name="check-circle" />
            {t("rec.saved_label")}
          </p>
          <StepHeading>{isWait && at ? t("retell.wait_title", { time: hhmm(at) }) : t("rec.saved")}</StepHeading>
          {isWait && at ? <p>{t("retell.wait_body", { time: hhmm(at) })}</p> : null}
          {stopReason === "timeout" ? <p className="muted">{t(def.timeoutText)}</p> : null}
          {/* Живая только эта строка: состояние отправки записи */}
          {!demo ? (
            <p className="muted" role="status">
              {uploadState === "sent" ? t("rec.sent") : uploadState === "sending" ? t("rec.sending") : ""}
            </p>
          ) : null}
          {uploadIssue === "failed" && !demo ? (
            <Notice
              kind="attention"
              icon="cloud"
              role="alert"
              title={t("upload.failed")}
              actions={
                <>
                  <button className="btn btn-secondary" type="button" onClick={() => pendingUpload.current && void upload(pendingUpload.current)}>
                    {t("upload.retry")}
                  </button>
                  <button className="btn btn-secondary" type="button" onClick={props.onExit}>
                    {t("upload.later")}
                  </button>
                </>
              }
            >
              <p>{t("upload.failed_hint")}</p>
            </Notice>
          ) : null}
          {!demo ? (
            <div className="actions sticky">
              {next ? (
                <button className="btn btn-primary btn-block" type="button" onClick={() => props.onNext?.(next)}>
                  {t("ex.next_ex", { title: `«${next.title}»` })}
                  <Icon name="arrow" />
                </button>
              ) : null}
              <button className={next ? "btn btn-secondary btn-block" : "btn btn-primary btn-block"} type="button" onClick={props.onExit}>
                {t("ex.back_program")}
              </button>
            </div>
          ) : (
            <div className="actions">
              <button className="btn btn-secondary" type="button" onClick={restart}>
                {t("rec.again")}
              </button>
            </div>
          )}
        </div>
      );
      break;
    }
    case "short":
      panel = (
        <div className="stage">
          <StepHeading>{t("rec.short_title")}</StepHeading>
          <p>{t("rec.short")}</p>
          <div className="actions sticky">
            <button className="btn btn-primary btn-block" type="button" onClick={() => void save()}>
              {t("rec.keep")}
            </button>
            <button className="btn btn-secondary btn-block" type="button" onClick={restart}>
              {t("rec.again")}
            </button>
          </div>
        </div>
      );
      break;
    case "silent":
      panel = (
        <div className="stage">
          <StepHeading>{t("rec.silent_title")}</StepHeading>
          <p>{t("rec.silent")}</p>
          <div className="actions sticky">
            <button
              className="btn btn-primary btn-block"
              type="button"
              onClick={() => {
                store.setMicChecked(false);
                closeMic();
                setMicPhase("explain");
                setStage("mic");
              }}
            >
              {t("rec.check_mic")}
            </button>
            <button className="btn btn-secondary btn-block" type="button" onClick={restart}>
              {t("rec.try_again")}
            </button>
            <button className="btn btn-tertiary" type="button" onClick={skipToday}>
              {t("rec.skip_today")}
            </button>
          </div>
        </div>
      );
      break;
    case "interrupted": {
      const kept = result.current && result.current.speechMs >= SHORT_SPEECH_MS;
      panel = (
        <div className="stage">
          <StepHeading>{t("rec.interrupted_title")}</StepHeading>
          <div className="stage-body">
            <p>{t("rec.interrupted")}</p>
            {kept ? <p className="muted">{t("rec.interrupted_kept", { s: Math.round(result.current!.speechMs / 1000) })}</p> : null}
          </div>
          <div className="actions sticky">
            <button className="btn btn-primary btn-block" type="button" onClick={restart}>
              {t("rec.restart")}
            </button>
            {kept ? (
              <button className="btn btn-secondary btn-block" type="button" onClick={() => void save()}>
                {t("rec.save_partial")}
              </button>
            ) : null}
            <button className="btn btn-tertiary" type="button" onClick={props.onExit}>
              {t("ex.back_program")}
            </button>
          </div>
        </div>
      );
      break;
    }
    case "denied":
      panel = (
        <div className="stage">
          <p className="ok-label" style={{ color: "var(--ink-2)" }}>
            <Icon name="mic-off" />
            {t("mic.denied.label")}
          </p>
          <StepHeading>{t("mic.denied.title")}</StepHeading>
          {retryFailed ? (
            <p className="field-error" role="alert">
              <Icon name="info" />
              {t("mic.retry_failed")}
            </p>
          ) : null}
          <div className="stage-body">
            <p>{t("mic.denied.body")}</p>
            <AddressBarHint />
            <p className="muted">{t("mic.denied.settings")}</p>
            <p className="muted">{t("mic.denied.help")}</p>
          </div>
          <div className="actions sticky">
            <button
              className="btn btn-primary btn-block"
              type="button"
              disabled={retrying}
              aria-busy={retrying}
              onClick={() => void retryMic()}
            >
              {retrying ? t("mic.retrying") : t("mic.retry")}
            </button>
            <button className="btn btn-secondary btn-block" type="button" onClick={skipToday}>
              {t("mic.skip_exercise")}
            </button>
            <button className="btn btn-tertiary" type="button" onClick={props.onExit}>
              {t("ex.back_program")}
            </button>
          </div>
        </div>
      );
      break;
    case "notfound":
      panel = (
        <div className="stage">
          <p className="ok-label" style={{ color: "var(--ink-2)" }}>
            <Icon name="mic-off" />
            {t("mic.denied.label")}
          </p>
          <StepHeading>{t("mic.notfound.title")}</StepHeading>
          {retryFailed ? (
            <p className="field-error" role="alert">
              <Icon name="info" />
              {t("mic.retry_failed")}
            </p>
          ) : null}
          <p>{t("mic.notfound.body")}</p>
          <div className="actions sticky">
            <button
              className="btn btn-primary btn-block"
              type="button"
              disabled={retrying}
              aria-busy={retrying}
              onClick={() => void retryMic()}
            >
              {retrying ? t("mic.retrying") : t("mic.retry")}
            </button>
            <button className="btn btn-secondary btn-block" type="button" onClick={skipToday}>
              {t("mic.skip_exercise")}
            </button>
            <button className="btn btn-tertiary" type="button" onClick={props.onExit}>
              {t("ex.back_program")}
            </button>
          </div>
        </div>
      );
      break;
    case "rejected":
      panel = (
        <div className="stage" role="alert">
          <StepHeading>{t("upload.rejected_title")}</StepHeading>
          <p>{t("upload.rejected")}</p>
          <div className="actions sticky">
            <button className="btn btn-primary btn-block" type="button" onClick={restart}>
              {t("rec.again")}
            </button>
            <button className="btn btn-secondary btn-block" type="button" onClick={props.onExit}>
              {t("ex.back_program")}
            </button>
          </div>
        </div>
      );
      break;
    case "consent":
      panel = (
        <div className="stage" role="alert">
          <StepHeading>{t("upload.consent_title")}</StepHeading>
          <p>{t("upload.consent")}</p>
          <div className="actions sticky">
            <a className="btn btn-primary btn-block" href="/settings">
              {t("upload.open_settings")}
            </a>
          </div>
        </div>
      );
      break;
  }

  return (
    <TranslateContext.Provider value={t}>
      <div className={`ex-wrap has-sticky ${showStimulus && stimulus ? "with-stimulus" : "single"}`} data-stage={stage}>
        {showStimulus && stimulus ? stimulus : null}
        {/* key: каждый этап монтируется заново, заголовок этапа получает фокус (A9) */}
        <section className="panel" key={stage === "mic" ? `mic-${micPhase === "listening" ? "on" : "off"}` : stage}>
          {panel}
        </section>
      </div>
      <StopDialog
        open={stopOpen}
        onContinue={() => {
          setStopOpen(false);
          // фокус возвращается на «Закончить запись», а не на ссылку выхода
          requestAnimationFrame(() => document.querySelector<HTMLButtonElement>("[data-finish]")?.focus());
        }}
        onLeave={() => {
          setStopOpen(false);
          ev({ type: "interrupt", t: exT(), meta: { reason: "user_exit" } });
          ev({ type: "stop_reason", t: exT(), meta: { reason: "interrupted" } });
          rec.current?.cancel();
          rec.current = null;
          try {
            window.sessionStorage.removeItem(REC_FLAG);
          } catch {
            /* ничего */
          }
          demo?.onRecording?.(false);
          props.onExit();
        }}
      />
    </TranslateContext.Provider>
  );
}

/** Подсказка: на телефоне прокручивается в видимую область над нижней панелью. */
function HintBox({ text }: { text: string }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    ref.current?.scrollIntoView({ block: "nearest" });
  }, [text]);
  return (
    <div ref={ref} className="hint-box" role="status">
      {text}
    </div>
  );
}

/** «Закончить запись»: фокус сразу после старта записи (A9). */
function FinishButton({ onClick }: { onClick: () => void }) {
  const t = useT();
  const ref = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    ref.current?.focus();
  }, []);
  return (
    <button ref={ref} className="btn btn-primary btn-block" type="button" onClick={onClick} data-finish="">
      {t("ex.finish_rec")}
    </button>
  );
}
