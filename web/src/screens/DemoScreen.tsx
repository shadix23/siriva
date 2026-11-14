"use client";
// D1-D6: демо для жюри. Данные для D3-D6 загружаются один раз при открытии.
import { use, useCallback, useEffect, useRef, useState } from "react";
import { browser } from "react-dom";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Icon } from "@/components/Icon";
import { useAnnounce } from "@/components/ui";
import { SpeechFlow } from "@/components/exercise/SpeechFlow";
import { StimulusPicture } from "@/components/exercise/parts";
import { BypassCompare, LiveSpeechPanel, NumbersCards, ServerStatus } from "@/components/demo";
import { FamilyView, ProfileView } from "@/components/views";
import { api, ApiError } from "@/lib/api/client";
import type {
  BypassScenario,
  DemoNumbers,
  Exercise,
  Lang,
  Patient,
  Picture,
  Profile,
  SpeechResult,
  Story,
  Trajectory,
  Word,
} from "@/lib/api/types";
import type { VadState } from "@/lib/audio";
import { EXERCISES, PICTURES, type SpeechDef } from "@/lib/exercises";
import { useHealth } from "@/lib/hooks";
import { setDemoMode } from "@/lib/demo-mode";
import { L, clock, personName, setUiLang, t, useUiLang } from "@/components/demo-i18n";
import "@/styles/site.css";
import "@/styles/demo.css";

const STEPS_RU = ["Проблема", "Живая запись", "Профиль", "Обходной путь", "Близкий", "Цифры"];
const STEPS_EN = ["Problem", "Live recording", "Profile", "Bypass", "Family", "Numbers"];
const PICTURE = PICTURES[0];
const PICTURE_DEF = EXERCISES.picture_description as SpeechDef;

interface Preloaded {
  trend: Patient | null;
  profile: Profile | null;
  trajectory: Trajectory | null;
  bypass: BypassScenario | null;
  exercises: Exercise[];
  numbers: (DemoNumbers & { fromFixture?: boolean }) | null;
  pictures: Picture[];
  stories: Story[];
  errors: string[];
}

async function settle<T>(p: Promise<T>, errors: string[], label: string): Promise<T | null> {
  try {
    return await p;
  } catch (e) {
    errors.push(`${label}: ${e instanceof ApiError ? e.code : String(e)}`);
    return null;
  }
}

async function preload(): Promise<Preloaded> {
  const errors: string[] = [];
  const [trend, profile, trajectory, bypass, ex, numbers, pics, stories] = await Promise.all([
    settle(api.patient("demo-trend"), errors, "demo-trend"),
    settle(api.profile("demo-trend"), errors, "profile"),
    settle(api.trajectory("demo-trend"), errors, "trajectory"),
    settle(api.bypassScenario(), errors, "bypass"),
    settle(api.exercises(), errors, "exercises"),
    settle(api.demoNumbers(), errors, "numbers"),
    settle(api.pictures(), errors, "pictures"),
    settle(api.stories(), errors, "stories"),
  ]);
  return {
    trend,
    profile,
    trajectory,
    bypass,
    exercises: ex?.exercises ?? [],
    numbers,
    pictures: pics?.pictures ?? [],
    stories: stories?.stories ?? [],
    errors,
  };
}

const SCENE_KEY = "es.demo_scene";
let scenePidPromise: Promise<string> | null = null;

function readScene(): string | null {
  try {
    return window.localStorage.getItem(SCENE_KEY) ?? window.sessionStorage.getItem(SCENE_KEY);
  } catch {
    return null;
  }
}

function saveScene(id: string) {
  try {
    window.localStorage.setItem(SCENE_KEY, id);
  } catch {
    /* хранилище недоступно: пациент сцены создастся заново при следующем открытии */
  }
}

/** Один пациент сцены «Живая запись» на этот браузер, чтобы каждое открытие /demo не добавляло запись в базу. */
function scenePatientId(lang: Lang): Promise<string> {
  if (!scenePidPromise) {
    scenePidPromise = (async () => {
      const saved = readScene();
      if (saved) {
        try {
          await api.patient(saved);
          saveScene(saved);
          return saved;
        } catch (e) {
          // создаём нового только если старого нет на сервере; при обрыве связи не плодим записи
          if (!(e instanceof ApiError && e.status === 404)) throw e;
        }
      }
      const p = await api.createPatient({ language: lang, label: "Живая запись", consent_voice: true, consent_share: false, consent_version: "demo" });
      saveScene(p.id);
      return p.id;
    })().catch((e) => {
      scenePidPromise = null;
      throw e;
    });
  }
  return scenePidPromise;
}

interface BackupData {
  duration: number;
  audio: string;
  words: Word[];
  picture_id: string;
  language: Lang;
}

/** VAD-подобное состояние из таймингов слов (резервная запись). */
function vadFromWords(words: Word[], tSec: number, maxMs: number): VadState {
  const segs: [number, number][] = [];
  for (const w of words) {
    if (w.start > tSec) break;
    const a = w.start * 1000;
    const b = Math.min(w.end, tSec) * 1000;
    const last = segs[segs.length - 1];
    if (last && a - last[1] < 350) last[1] = b;
    else segs.push([a, b]);
  }
  const nowMs = Math.min(tSec * 1000, maxMs);
  const firstMs = segs.length ? segs[0][0] : null;
  const speechMs = segs.reduce((s, [a, b]) => s + (b - a), 0);
  const gaps: { start: number; end: number }[] = [];
  for (let i = 1; i < segs.length; i++) gaps.push({ start: segs[i - 1][1], end: segs[i][0] });
  const lastEnd = segs.length ? segs[segs.length - 1][1] : 0;
  const speaking = segs.length > 0 && nowMs - lastEnd < 120;
  const current = speaking ? 0 : nowMs - lastEnd;
  return {
    elapsedMs: nowMs,
    speaking,
    level: speaking ? 4 : 0,
    firstMs,
    speechMs,
    pausesOver1s: gaps.filter((g) => g.end - g.start >= 1000).length + (current >= 1000 && firstMs !== null ? 1 : 0),
    pauseRatio: firstMs !== null && nowMs - firstMs > 500 ? Math.max(0, 1 - speechMs / (nowMs - firstMs)) : null,
    currentPauseMs: firstMs === null ? nowMs : current,
    segments: segs,
    longPauses: gaps.filter((g) => g.end - g.start >= 2000),
  };
}

export function DemoScreen() {
  use(browser("Демо использует микрофон и данные, загруженные при открытии."));
  const router = useRouter();
  const sp = useSearchParams();
  const step = Math.max(1, Math.min(6, Number(sp.get("step")) || 1));
  const uiLang = useUiLang();
  const STEPS = uiLang === "en" ? STEPS_EN : STEPS_RU;
  const { health, down, check } = useHealth();
  const [data, setData] = useState<Preloaded | null>(null);
  const [lang, setLang] = useState<Lang>("ru");

  // D2: пациент сцены и сессия
  const [scene, setScene] = useState<{ pid: string; sid: string } | null>(null);
  const [sceneError, setSceneError] = useState<string | null>(null);
  const [vad, setVad] = useState<VadState | null>(null);
  const [recording, setRecording] = useState(false);
  const [recog, setRecog] = useState<"none" | "waiting" | "done" | "error">("none");
  const [result, setResult] = useState<SpeechResult | null>(null);
  const [error, setError] = useState<ApiError | null>(null);
  const [retry, setRetry] = useState<(() => void) | null>(null);
  const [mode, setMode] = useState<"live" | "backup">("live");
  const [backupBusy, setBackupBusy] = useState(false);
  const [flowKey, setFlowKey] = useState(0);
  const [bypassOn, setBypassOn] = useState(true);
  const [silent, setSilent] = useState(false);
  // направление перехода между шагами: вперёд содержимое приходит справа, назад слева
  const [nav, setNav] = useState({ step, dir: "fwd" as "fwd" | "back" });
  if (nav.step !== step) setNav({ step, dir: step > nav.step ? "fwd" : "back" });
  const glass = sp.get("glass") === "1";
  const announce = useAnnounce();
  const [backupT, setBackupT] = useState(0);
  const toggle = useRef<(() => void) | null>(null);
  const liveRec = useRef(false);
  const backupStop = useRef<(() => void) | null>(null);
  const backupAudio = useRef<HTMLAudioElement | null>(null);
  const backupTimer = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    setDemoMode(true);
    preload().then(setData);
    const html = document.documentElement;
    html.classList.add("demo-mode");
    return () => html.classList.remove("demo-mode");
  }, []);

  const ensureScene = useCallback(async () => {
    try {
      const pid = await scenePatientId(lang);
      const sess = await api.startSession(pid);
      setSceneError(null);
      setScene({ pid, sid: sess.session_id });
    } catch (e) {
      setSceneError(e instanceof ApiError ? e.code : String(e));
    }
  }, [lang]);

  useEffect(() => {
    if (step !== 2 || scene) return;
    const id = window.setTimeout(() => void ensureScene(), 0);
    return () => window.clearTimeout(id);
  }, [step, scene, ensureScene]);

  const go = useCallback((n: number) => router.push(`/demo?step=${Math.max(1, Math.min(6, n))}`), [router]);

  const stopBackup = useCallback(() => {
    if (backupTimer.current) clearInterval(backupTimer.current);
    backupTimer.current = null;
    backupAudio.current?.pause();
  }, []);

  const runBackup = useCallback(async () => {
    if (recording || backupBusy) return;
    if (step !== 2) go(2);
    setMode("backup");
    setSilent(false);
    setBackupBusy(true);
    setResult(null);
    setError(null);
    setRecog("none");
    setVad(null);
    let b: BackupData;
    try {
      b = (await fetch("/audio/backup-bus-stop-rain-ru.json").then((r) => r.json())) as BackupData;
    } catch {
      setBackupBusy(false);
      return;
    }
    const maxMs = PICTURE_DEF.maxMs;
    const audio = new Audio(b.audio);
    backupAudio.current = audio;
    const t0 = performance.now();
    const now = () => (audio.duration && !audio.paused ? audio.currentTime : (performance.now() - t0) / 1000);
    const tick = () => {
      const tSec = now();
      setVad(vadFromWords(b.words, tSec, maxMs));
      setBackupT(tSec);
      if (tSec >= b.duration) finish();
    };
    const send = async (upTo: number) => {
      const words = upTo >= b.duration ? b.words : b.words.filter((w) => w.end <= upTo);
      setRecog("waiting");
      try {
        let sid = scene?.sid;
        if (!sid) sid = (await api.startSession(await scenePatientId("ru"))).session_id;
        const r = await api.uploadTranscript(sid, "picture_description", {
          language: b.language,
          words,
          duration: Math.min(b.duration, upTo),
          picture_id: b.picture_id,
        });
        setResult(r);
        setRecog("done");
      } catch (e) {
        setError(e instanceof ApiError ? e : new ApiError(0, "unknown", String(e)));
        setRecog("error");
        setRetry(() => () => void send(upTo));
      }
    };
    let done = false;
    const finish = (upTo = b.duration) => {
      if (done) return;
      done = true;
      stopBackup();
      backupStop.current = null;
      setVad(vadFromWords(b.words, upTo, maxMs));
      setBackupBusy(false);
      void send(upTo);
    };
    backupStop.current = () => finish(Math.min(b.duration, now()));
    audio.addEventListener("ended", () => finish());
    audio.play().catch(() => undefined); // без звука лента всё равно идёт по таймингам
    backupTimer.current = setInterval(tick, 250);
  }, [recording, backupBusy, step, go, scene, stopBackup]);

  useEffect(() => () => stopBackup(), [stopBackup]);

  /** Запись без голоса: не показываем пустые показатели как результат, возвращаем упражнение к началу. */
  const markSilent = useCallback(() => {
    setSilent(true);
    setRecog("none");
    setResult(null);
    setError(null);
    setFlowKey((k) => k + 1);
    // диктору то же, что на плашке: перекрывает раннее «Упражнение сохранено» из упражнения
    announce("Запись без голоса: проверьте микрофон. Показатели речи не посчитаны.");
  }, [announce]);

  const backToLive = useCallback(() => {
    setSilent(false);
    setMode("live");
    setFlowKey((k) => k + 1);
    setRecog("none");
    setResult(null);
    setError(null);
    setVad(null);
  }, []);

  // Горячие клавиши только в /demo (D17).
  useEffect(() => {
    const on = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const el = e.target as HTMLElement | null;
      const tag = el?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || el?.isContentEditable) return;
      if (document.querySelector("dialog[open]")) return;
      const onControl = tag === "BUTTON" || tag === "A";
      if (e.key === "ArrowRight" || e.key === "PageDown" || (e.key === " " && !onControl)) {
        e.preventDefault();
        go(step + 1);
      } else if (e.key === "ArrowLeft" || e.key === "PageUp") {
        e.preventDefault();
        go(step - 1);
      } else if ((e.key === "r" || e.key === "R" || e.key === "к" || e.key === "К") && step === 2) {
        e.preventDefault();
        if (backupStop.current) {
          backupStop.current();
          return;
        }
        if (mode === "backup") {
          backToLive();
          return;
        }
        toggle.current?.();
      } else if (e.key === "b" || e.key === "B" || e.key === "и" || e.key === "И") {
        e.preventDefault();
        void runBackup();
      }
    };
    window.addEventListener("keydown", on);
    return () => window.removeEventListener("keydown", on);
  }, [step, go, runBackup, mode, backToLive]);

  const warning =
    data?.bypass && (!data.bypass.same_memory_score || !data.bypass.programs_differ)
      ? "Проверка обходного пути не прошла: программы не различаются или память не совпадает. Проверьте данные перед показом."
      : data?.errors.length
        ? `Не все данные загрузились: ${data.errors.join(", ")}.`
        : null;

  const trendName = personName(data?.trend?.label ?? "Сауле, 68 лет");
  const pictureMeta = data?.pictures.find((p) => p.id === PICTURE.id) ?? null;
  const backupShown = mode === "backup";

  let content: React.ReactNode = null;
  if (step === 1) {
    content = (
      <section className="d1" aria-labelledby="d1">
        <div className="d1-grid">
          <h1 id="d1" className="d1-claim">
            {L(
              "В исследовании Framingham по письменному описанию картинки удалось предсказать, у кого позже разовьются когнитивные нарушения, в среднем за 7,6 года.",
              "In the Framingham study, a written picture description predicted who would later develop cognitive impairment, on average 7.6 years ahead.",
            )}
          </h1>
          <div className="d1-figure" aria-hidden="true">
            <span className="d1-num">{L("7,6", "7.6")}</span>
            <span className="d1-unit">{L("года", "years")}</span>
          </div>
        </div>
        <p className="d1-source">{L("Eyigoz и др., EClinicalMedicine, 2020", "Eyigoz et al., EClinicalMedicine, 2020")}</p>
        <p className="d1-lead">
          <strong>Siriva:</strong>{" "}
          {L("7 минут голосом в день. Видно, что меняется, и упражнения подстраиваются.", "7 voice minutes a day. It shows what changes, and exercises adapt.")}
        </p>
      </section>
    );
  } else if (step === 2) {
    content = (
      <section className="d2" aria-labelledby="d2">
        <div className="d-titlebar">
          <h1 id="d2">{L("Живая запись: описание картинки", "Live recording: picture description")}</h1>
          {backupShown ? (
            <span className="mode-badge is-backup">
              <Icon name="replay" />
              {t("badge.backup")}{L(", не живая запись", ", not a live recording")}
            </span>
          ) : (
            <span className="mode-badge is-live">
              <Icon name="mic" />
              {L("Запись живая, в профиль не сохраняется", "Live recording, not saved to the profile")}
            </span>
          )}
        </div>
        {sceneError ? (
          <div className="notice notice-attention" role="status">
            <Icon name="info" />
            <div className="notice-body">
              <p>{L("Не получилось подготовить живую запись", "Could not prepare live recording")} ({sceneError}). {L("Пример покажет ленту пауз и без сервера.", "The example shows the pause timeline even without the server.")}</p>
              <div className="notice-actions">
                <button className="btn btn-secondary" type="button" onClick={() => void ensureScene()}>
                  {t("error.retry")}
                </button>
              </div>
            </div>
          </div>
        ) : null}
        <div className={`demo-live${recog !== "none" ? " has-result" : ""}`}>
          <div className="demo-left">
            {backupShown ? (
              <div className="backup-card">
                <StimulusPicture src={PICTURE.src} alt={L(`Картинка для описания: ${PICTURE.scene}`, "Picture to describe")} />
                {backupBusy ? (
                  <>
                    <p className="backup-now">
                      <span className="lv-live on">
                        <i aria-hidden="true" />
                        {L("Звучит пример", "Example playing")}: {clock(backupT * 1000)}
                      </span>
                    </p>
                    <button className="btn btn-primary btn-wide" type="button" onClick={() => backupStop.current?.()}>
                      <Icon name="pause" />
                      {L("Остановить пример", "Stop example")}
                    </button>
                  </>
                ) : (
                  <>
                    <p className="backup-now">{L("Пример закончился. Показатели справа посчитаны по его словам.", "The example has ended. The measures on the right are computed from its words.")}</p>
                    <div className="actions-inline">
                      <button className="btn btn-primary" type="button" onClick={backToLive}>
                        <Icon name="mic" />
                        {L("Записать вживую", "Record live")}
                      </button>
                      <button className="btn btn-secondary" type="button" onClick={() => void runBackup()}>
                        <Icon name="replay" />
                        {L("Пример ещё раз", "Example again")}
                      </button>
                    </div>
                  </>
                )}
              </div>
            ) : null}
            <div hidden={backupShown}>
              {scene ? (
                <SpeechFlow
                  key={`${flowKey}-${lang}`}
                  def={PICTURE_DEF}
                  patientId={scene.pid}
                  sessionId={scene.sid}
                  stories={data?.stories ?? []}
                  picture={PICTURE}
                  initialLang={lang}
                  demo={{
                    startAt: "ready",
                    showSeconds: true,
                    onVad: (s) => {
                      if (liveRec.current) setVad(s);
                    },
                    onRecording: (on) => {
                      liveRec.current = on;
                      setRecording(on);
                      if (on) {
                        setSilent(false);
                        setMode("live");
                        setVad(null);
                        setRecog("none");
                        setResult(null);
                        setError(null);
                      }
                    },
                    onUploadStart: () => setRecog("waiting"),
                    onResult: (r) => {
                      if ((r.transcript?.words?.length ?? 0) === 0) {
                        markSilent();
                        return;
                      }
                      setResult(r);
                      setRecog("done");
                    },
                    onUploadError: (e, again) => {
                      if (e.code === "empty_audio") {
                        markSilent();
                        return;
                      }
                      setError(e);
                      setRecog("error");
                      setRetry(() => again);
                    },
                  }}
                  onExit={() => setFlowKey((k) => k + 1)}
                  registerToggle={(fn) => (toggle.current = fn)}
                />
              ) : (
                <p className="lead">{L("Готовим живую запись", "Preparing live recording")}</p>
              )}
            </div>
          </div>
          <LiveSpeechPanel
            mode={mode}
            vad={vad}
            maxMs={PICTURE_DEF.maxMs}
            recording={recording || backupBusy}
            recog={recog}
            result={result}
            error={error}
            onRetry={retry ?? undefined}
            onBackup={() => void runBackup()}
            backupBusy={backupBusy}
            lang={mode === "backup" ? "ru" : lang}
            picture={pictureMeta}
            numbers={data?.numbers ?? null}
            silent={silent && mode === "live"}
          />
        </div>
      </section>
    );
  } else if (step === 3) {
    content = (
      <section className="d3" aria-labelledby="d3">
        <div className="d-titlebar">
          <h1 id="d3">{L("Профиль функций за 12 недель", "Function profile over 12 weeks")}: {trendName}</h1>
        </div>
        {data ? (
          data.profile && data.trajectory ? (
            <ProfileView profile={data.profile} trajectory={data.trajectory} layout="split" playable />
          ) : (
            <p className="muted">{L("Данные профиля не загрузились. Проверьте сервер и обновите страницу.", "Profile data did not load. Check the server and reload the page.")}</p>
          )
        ) : (
          <p className="lead">{L("Загружаем данные", "Loading data")}</p>
        )}
      </section>
    );
  } else if (step === 4) {
    content = (
      <section className="d4" aria-labelledby="d4">
        {data?.bypass ? (
          <BypassCompare
            scenario={data.bypass}
            exercises={data.exercises}
            withBypass={bypassOn}
            onChange={setBypassOn}
            heading={
              <div className="bp-heading">
                <h1 id="d4">{L("Одна цель, разные дороги", "One goal, different roads")}</h1>
                <p>{L("Память тренируется через то, что у человека сохранно", "Memory is trained through what remains intact")}</p>
              </div>
            }
          />
        ) : (
          <>
            <h1 id="d4">{L("Одна цель, разные дороги", "One goal, different roads")}</h1>
            <p className="muted">{data ? L("Сценарий не загрузился. Проверьте сервер.", "The scenario did not load. Check the server.") : L("Загружаем данные", "Loading data")}</p>
          </>
        )}
      </section>
    );
  } else if (step === 5) {
    content = (
      <section className="d5" aria-labelledby="d5">
        <div className="d-titlebar">
          <div>
            <h1 id="d5">{L("Так это видит близкий", "What family sees")}</h1>
            <p className="d-sub">{L("Те же записи, что на шаге 2, за 12 недель.", "The same recordings as step 2, over 12 weeks.")}</p>
          </div>
        </div>
        {data?.trajectory ? (
          <FamilyView traj={data.trajectory} profileHref="/demo?step=3" layout="split" name={trendName.split(",")[0]} />
        ) : (
          <p className="muted">{data ? L("Траектория не загрузилась. Проверьте сервер.", "The trajectory did not load. Check the server.") : L("Загружаем данные", "Loading data")}</p>
        )}
      </section>
    );
  } else {
    content = (
      <section className="d6" aria-labelledby="d6">
        <div className="d-titlebar">
          <h1 id="d6">{L("Цифры: что посчитано и что посчитаем", "Numbers: what is measured and what will be")}</h1>
        </div>
        <NumbersCards numbers={data?.numbers ?? null} />
        <p className="d-links">
          {L("Попробовать самим:", "Try it yourself:")}{" "}
          <Link href="/app?patient=demo-trend">{L("путь пациента (Сауле)", "patient path (Saule)")}</Link>,{" "}
          <Link href="/family?patient=demo-trend">{L("экран близкого", "family screen")}</Link>
        </p>
      </section>
    );
  }

  return (
    <div className={`demo-root demo-step-${step}${glass ? " is-glass" : ""}`}>
      <header className="dh">
        <div className="dh-row">
          <Link className="dh-logo" href="/demo?step=1">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/site/logo-mark.png" width={28} height={28} alt="" />
            <span>Siriva</span>
            <small>{L("Демо", "Demo")}</small>
          </Link>
          <nav className="dh-steps" aria-label={L("Шаги демо", "Demo steps")}>
            <ol>
              {STEPS.map((s, i) => (
                <li key={s}>
                  <Link href={`/demo?step=${i + 1}`} aria-current={step === i + 1 ? "step" : undefined}>
                    <span className="dh-num">{i + 1}</span>
                    {s}
                  </Link>
                </li>
              ))}
            </ol>
          </nav>
          <div className="dh-tools">
            <div className="dh-lang">
              <span id="speech-lang">{L("Речь", "Speech")}</span>
              <div className="dh-seg" role="group" aria-labelledby="speech-lang">
                <button type="button" aria-pressed={lang === "ru"} onClick={() => setLang("ru")} disabled={recording}>
                  RU
                </button>
                <button type="button" aria-pressed={lang === "en"} onClick={() => setLang("en")} disabled={recording} lang="en">
                  EN
                </button>
              </div>
            </div>
            <div className="dh-lang">
              <span id="ui-lang">{L("Экран", "UI")}</span>
              <div className="dh-seg" role="group" aria-labelledby="ui-lang">
                <button type="button" aria-pressed={uiLang === "ru"} onClick={() => setUiLang("ru")}>
                  RU
                </button>
                <button type="button" aria-pressed={uiLang === "en"} onClick={() => setUiLang("en")} lang="en">
                  EN
                </button>
              </div>
            </div>
          </div>
        </div>
      </header>
      {warning ? (
        <p className="demo-warning" role="status">
          {warning}
        </p>
      ) : null}
      <main id="main" className="demo-main">
        <div key={step} className="d-step" data-dir={nav.dir}>
          {content}
        </div>
      </main>
      <footer className="df">
        <div className="df-row">
          <div className="df-meta">
            <span className="df-synth">
              <Icon name="flask" />
              {L("Синтетические данные", "Synthetic data")}
            </span>
            <ServerStatus health={health} down={down} onBackup={() => void runBackup()} compact />
            {down ? (
              <button className="btn btn-tertiary" type="button" onClick={check}>
                {t("server.retry")}
              </button>
            ) : null}
          </div>
          <p className="df-keys">
            <span>
              <kbd>←</kbd>
              <kbd>→</kbd> {L("шаги", "steps")}
            </span>
            {step === 2 ? (
              <>
                <span>
                  <kbd>R</kbd> {L("запись", "record")}
                </span>
                <span>
                  <kbd>B</kbd> {L("пример", "example")}
                </span>
              </>
            ) : null}
          </p>
          <nav className="df-nav" aria-label={L("Переход по шагам", "Step navigation")}>
            {step > 1 ? (
              <Link className="btn btn-secondary" href={`/demo?step=${step - 1}`}>
                <Icon name="back" />
                {L("Назад", "Back")}
              </Link>
            ) : null}
            {step < 6 ? (
              <Link className="btn btn-primary" href={`/demo?step=${step + 1}`}>
                {L("Дальше", "Next")}: {STEPS[step]}
                <Icon name="arrow" />
              </Link>
            ) : null}
          </nav>
        </div>
      </footer>
    </div>
  );
}
