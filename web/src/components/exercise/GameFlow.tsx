"use client";
// Неречевые упражнения (контракт v0.2, раздел «Неречевые упражнения MVP»): общий каркас E0, игра, E6.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Icon, RECOG_OBJECTS } from "../Icon";
import { Notice, StepHeading, useAnnounce } from "../ui";
import { t } from "@/lib/i18n";
import { api } from "@/lib/api/client";
import type { TelemetryEvent } from "@/lib/api/types";
import type { GameDef, ProgramRow } from "@/lib/exercises";
import { today } from "@/lib/storage";
import { withSession } from "@/lib/session";

interface GameProps {
  def: GameDef;
  patientId: string;
  sessionId?: string;
  difficulty?: number;
  nextRow?: ProgramRow | null;
  onSaved?: () => void;
  onExit: () => void;
  onNext?: (row: ProgramRow) => void;
  registerBackGuard?: (fn: (() => boolean) | null) => void;
}

type Emit = (e: Omit<TelemetryEvent, "exercise_id">) => void;
const sec = (ms: number) => Math.round(ms / 100) / 10;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export function GameFlow(props: GameProps) {
  const { def, sessionId, patientId } = props;
  const announce = useAnnounce();
  const [stage, setStage] = useState<"intro" | "play" | "saved">("intro");
  const [sendFailed, setSendFailed] = useState(false);
  const events = useRef<TelemetryEvent[]>([]);
  const t0 = useRef(0);
  const finished = useRef(false);

  const emit: Emit = useCallback((e) => events.current.push({ ...e, exercise_id: def.exerciseId }), [def.exerciseId]);
  const flush = useCallback(() => {
    const batch = events.current.splice(0);
    if (!batch.length) return;
    (sessionId ? api.telemetry(sessionId, batch) : withSession(patientId, (sid) => api.telemetry(sid, batch))).catch(
      () => undefined,
    );
  }, [sessionId, patientId]);

  useEffect(
    () => () => {
      if (!finished.current && t0.current) {
        events.current.push({ type: "interrupt", t: sec(performance.now() - t0.current), exercise_id: def.exerciseId });
        events.current.push({ type: "stop_reason", t: sec(performance.now() - t0.current), exercise_id: def.exerciseId, meta: { reason: "interrupted" } });
      }
      flush();
    },
    [def.exerciseId, flush],
  );

  useEffect(() => {
    props.registerBackGuard?.(() => true);
    return () => props.registerBackGuard?.(null);
  });

  async function done(accuracy: number) {
    // Ровно один /result за упражнение, даже если игра сообщила о конце дважды (VERIFY-1 V-07).
    if (finished.current) return;
    finished.current = true;
    const duration_s = Math.round((performance.now() - t0.current) / 1000);
    emit({ type: "stop_reason", t: duration_s, meta: { reason: "user" } });
    flush();
    today.update(patientId, (s) => {
      s.done[def.itemId] = new Date().toISOString();
      return s;
    });
    setStage("saved");
    announce(t("rec.saved"));
    props.onSaved?.();
    const body = { accuracy: Math.max(0, Math.min(1, Math.round(accuracy * 100) / 100)), duration_s };
    const send = () =>
      sessionId ? api.postResult(sessionId, def.exerciseId, body) : withSession(patientId, (sid) => api.postResult(sid, def.exerciseId, body));
    try {
      await send();
    } catch {
      await sleep(5000);
      try {
        await send();
      } catch {
        setSendFailed(true);
      }
    }
    props.onSaved?.();
  }

  const difficulty = Math.max(1, Math.min(5, props.difficulty ?? 1));

  if (stage === "intro") {
    return (
      <div className="ex-wrap single has-sticky" key="intro">
        <section className="panel">
          <div className="stage">
            <StepHeading>{t(def.title)}</StepHeading>
            <div className="stage-body">
              <p className="lead">{t(def.intro)}</p>
              <p className="muted">{t(def.duration)}</p>
            </div>
            <div className="actions sticky">
              <button
                className="btn btn-primary btn-block"
                type="button"
                onClick={() => {
                  t0.current = performance.now();
                  setStage("play");
                }}
              >
                {t("nonspeech.start")}
              </button>
            </div>
          </div>
        </section>
      </div>
    );
  }

  if (stage === "saved") {
    const next = props.nextRow;
    return (
      <div className="ex-wrap single has-sticky" key="saved">
        <section className="panel">
          <div className="stage">
            <p className="ok-label">
              <Icon name="check-circle" />
              {t("rec.saved_label")}
            </p>
            <StepHeading>{t("rec.saved")}</StepHeading>
            {sendFailed ? (
              <Notice kind="attention" icon="cloud" role="status">
                <p>Ответы сохранены на этом устройстве, но пока не отправились. Проверьте, что программа Siriva запущена.</p>
              </Notice>
            ) : null}
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
          </div>
        </section>
      </div>
    );
  }

  return (
    <div className="ex-wrap single">
      <section className="panel">
        {def.game === "sequence" ? (
          <SequenceGame difficulty={difficulty} emit={emit} onDone={done} />
        ) : (
          <RecognitionGame difficulty={difficulty} emit={emit} onDone={done} />
        )}
      </section>
    </div>
  );
}

/* ---------- Повторить последовательность на поле ---------- */

const ATTEMPTS = 5;
const LIT_MS = 800;
const GAP_MS = 400;
const IDLE_MS = 15_000;

function makeSequence(len: number): number[] {
  const out: number[] = [];
  while (out.length < len) {
    const n = Math.floor(Math.random() * 9);
    if (out[out.length - 1] !== n) out.push(n);
  }
  return out;
}

function SequenceGame({ difficulty, emit, onDone }: { difficulty: number; emit: Emit; onDone: (acc: number) => void }) {
  const announce = useAnnounce();
  const len = 2 + difficulty;
  const [attempt, setAttempt] = useState(0);
  const [seq, setSeq] = useState<number[]>(() => makeSequence(len));
  const [phase, setPhase] = useState<"show" | "input" | "between">("show");
  const [lit, setLit] = useState<number | null>(null);
  const [taps, setTaps] = useState<number[]>([]);
  const [flash, setFlash] = useState<number | null>(null);
  const [replayUsed, setReplayUsed] = useState(false);
  const [activity, setActivity] = useState(0);
  const tapsRef = useRef<number[]>([]);
  const attemptClosed = useRef(false);
  const endedAttempt = useRef(-1);
  const nextBtn = useRef<HTMLButtonElement>(null);
  const correct = useRef(0);
  const showEnd = useRef(0);
  const lastTap = useRef(0);
  const firstDone = useRef(false);
  const idle = useRef<ReturnType<typeof setTimeout> | null>(null);
  const headRef = useRef<HTMLParagraphElement>(null);
  const start = useRef(0);
  const rel = (ms: number) => sec(ms - start.current);

  const play = useCallback(
    async (s: number[]) => {
      setPhase("show");
      setTaps([]);
      tapsRef.current = [];
      attemptClosed.current = false;
      announce(t("seq.watch"));
      await sleep(600);
      for (const n of s) {
        setLit(n);
        await sleep(LIT_MS);
        setLit(null);
        await sleep(GAP_MS);
      }
      showEnd.current = performance.now();
      lastTap.current = showEnd.current;
      setPhase("input");
      announce(`${t("seq.your_turn")}. ${t("seq.your_turn_hint")}`);
      headRef.current?.focus();
    },
    [announce],
  );

  const endAttempt = useCallback(
    async (ok: boolean, latency: number) => {
      if (idle.current) clearTimeout(idle.current);
      if (endedAttempt.current === attempt) return;
      endedAttempt.current = attempt;
      attemptClosed.current = true;
      if (ok) correct.current += 1;
      emit({ type: "answer", t: rel(performance.now()), value: Math.round(latency * 10) / 10 });
      if (attempt + 1 >= ATTEMPTS) {
        setPhase("between");
        await sleep(800);
        onDone(correct.current / ATTEMPTS);
        return;
      }
      // Следующая попытка начинается по кнопке, а не сама (A11Y-1, п. 8).
      setPhase("between");
      announce(t("seq.attempt_saved"));
      requestAnimationFrame(() => nextBtn.current?.focus());
    },
    [announce, attempt, emit, onDone],
  );

  function nextAttempt() {
    const s = makeSequence(len);
    setAttempt((a) => a + 1);
    setSeq(s);
    setReplayUsed(false);
    void play(s);
  }

  useEffect(() => {
    start.current = performance.now();
    // первая попытка запускается один раз при монтировании
    // eslint-disable-next-line react-hooks/set-state-in-effect -- показ последовательности стартует при монтировании
    void play(seq);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 15 секунд без нажатия: попытка не засчитывается, идёт следующая.
  useEffect(() => {
    if (phase !== "input") return;
    if (idle.current) clearTimeout(idle.current);
    idle.current = setTimeout(() => void endAttempt(false, IDLE_MS / 1000), IDLE_MS);
    return () => {
      if (idle.current) clearTimeout(idle.current);
    };
  }, [phase, taps.length, activity, endAttempt]);

  function tap(n: number, now: number) {
    if (phase !== "input" || attemptClosed.current || tapsRef.current.length >= seq.length) return;
    if (!firstDone.current) {
      firstDone.current = true;
      emit({ type: "first_action", t: sec(now - showEnd.current) });
    }
    const gap = now - lastTap.current;
    if (taps.length > 0 && gap > 3000) emit({ type: "pause", t: rel(now), value: sec(gap) });
    lastTap.current = now;
    setFlash(n);
    setTimeout(() => setFlash((f) => (f === n ? null : f)), 220);
    const next = [...tapsRef.current, n];
    tapsRef.current = next;
    setTaps(next);
    if (next.length >= seq.length) {
      attemptClosed.current = true;
      const ok = next.every((v, i) => v === seq[i]);
      void endAttempt(ok, (now - showEnd.current) / 1000);
    }
  }

  return (
    <div className="stage">
      <p className="step-count">{t("seq.attempt", { i: attempt + 1, n: ATTEMPTS })}</p>
      <p ref={headRef} tabIndex={-1} className="lead" style={{ fontWeight: 600, color: "var(--ink)" }}>
        {phase === "show" ? t("seq.watch") : phase === "input" ? t("seq.your_turn") : t("seq.attempt_saved")}
      </p>
      {phase === "input" ? <p className="muted">{t("seq.your_turn_hint")}</p> : null}
      <div className="seq-grid" role="group" aria-label={t("seq.grid")} onFocus={() => phase === "input" && setActivity((a) => a + 1)}>
        {Array.from({ length: 9 }, (_, i) => (
          <button
            key={i}
            type="button"
            className={`seq-cell${lit === i ? " lit" : ""}${flash === i ? " tapped" : ""}`}
            aria-label={t("seq.tile", { n: i + 1 })}
            aria-disabled={phase !== "input"}
            onClick={(e) => tap(i, e.timeStamp)}
          />
        ))}
      </div>
      {phase === "between" && attempt + 1 < ATTEMPTS ? (
        <div className="actions">
          <button ref={nextBtn} className="btn btn-primary btn-block" type="button" onClick={nextAttempt}>
            {t("seq.next_attempt")}
            <Icon name="arrow" />
          </button>
        </div>
      ) : null}
      {phase === "input" && !replayUsed ? (
        <div>
          <button
            className="btn btn-secondary"
            type="button"
            onClick={() => {
              setReplayUsed(true);
              emit({ type: "hint", t: rel(performance.now()) });
              void play(seq);
            }}
          >
            <Icon name="replay" />
            {t("seq.show_again")}
          </button>
        </div>
      ) : null}
    </div>
  );
}

/* ---------- Узнать картинки, показанные раньше ---------- */

const STUDY_MS = 4000;
const BREAK_MS = 30_000;
const ANSWER_IDLE_MS = 20_000;

function shuffle<T>(a: T[]): T[] {
  const r = [...a];
  for (let i = r.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [r[i], r[j]] = [r[j], r[i]];
  }
  return r;
}

/** Порядок проверки: не больше трёх одинаковых ответов подряд. */
function buildTest(shown: string[], fresh: string[]): { id: string; was: boolean }[] {
  for (let tries = 0; tries < 200; tries++) {
    const items = shuffle([...shown.map((id) => ({ id, was: true })), ...fresh.map((id) => ({ id, was: false }))]);
    let run = 1;
    let ok = true;
    for (let i = 1; i < items.length; i++) {
      run = items[i].was === items[i - 1].was ? run + 1 : 1;
      if (run > 3) {
        ok = false;
        break;
      }
    }
    if (ok) return items;
  }
  return shuffle([...shown.map((id) => ({ id, was: true })), ...fresh.map((id) => ({ id, was: false }))]);
}

function RecognitionGame({ difficulty, emit, onDone }: { difficulty: number; emit: Emit; onDone: (acc: number) => void }) {
  const announce = useAnnounce();
  const n = 3 + difficulty;
  const { shown, test } = useMemo(() => {
    const pool = shuffle(RECOG_OBJECTS.map((o) => o.id));
    const s = pool.slice(0, n);
    const f = pool.slice(n, 2 * n);
    return { shown: s, test: buildTest(s, f) };
  }, [n]);
  const [phase, setPhase] = useState<"study" | "break" | "test" | "answered">("study");
  const [idx, setIdx] = useState(0);
  const correct = useRef(0);
  const shownAt = useRef(0);
  const firstDone = useRef(false);
  const testStart = useRef(0);
  const headRef = useRef<HTMLHeadingElement>(null);
  const idle = useRef<ReturnType<typeof setTimeout> | null>(null);
  const answering = useRef(false);

  const nameOf = (id: string) => RECOG_OBJECTS.find((o) => o.id === id)?.name ?? id;

  // Показ для запоминания, затем перерыв 30 секунд без кнопки и без отсчёта.
  useEffect(() => {
    let alive = true;
    (async () => {
      for (let i = 0; i < shown.length; i++) {
        if (!alive) return;
        setIdx(i);
        announce(`${t("recog.remember")}: ${nameOf(shown[i])}`);
        await sleep(STUDY_MS);
      }
      if (!alive) return;
      setPhase("break");
      announce(t("recog.break_title"));
      await sleep(BREAK_MS);
      if (!alive) return;
      setIdx(0);
      setPhase("test");
      testStart.current = performance.now();
      shownAt.current = testStart.current;
      announce(t("recog.question"));
    })();
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const answer = useCallback(
    async (said: boolean | null) => {
      if (answering.current) return;
      answering.current = true;
      if (idle.current) clearTimeout(idle.current);
      const now = performance.now();
      const latency = (now - shownAt.current) / 1000;
      if (!firstDone.current && said !== null) {
        firstDone.current = true;
        emit({ type: "first_action", t: sec(now - testStart.current) });
      }
      if (latency > 5) emit({ type: "pause", t: sec(now - testStart.current), value: Math.round(latency * 10) / 10 });
      emit({ type: "answer", t: sec(now - testStart.current), value: Math.round(latency * 10) / 10 });
      if (said !== null && said === test[idx].was) correct.current += 1;
      setPhase("answered");
      headRef.current?.focus();
      await sleep(1000);
      if (idx + 1 >= test.length) {
        onDone(correct.current / test.length);
        return;
      }
      setIdx((i) => i + 1);
      setPhase("test");
      shownAt.current = performance.now();
      answering.current = false;
    },
    [emit, idx, onDone, test],
  );

  // Вопрос получает фокус при каждом новом показе, в том числе первом (A11Y-1, п. 1).
  useEffect(() => {
    if (phase === "test") headRef.current?.focus();
  }, [phase, idx]);

  // 20 секунд без ответа: картинка засчитывается как неверный ответ.
  useEffect(() => {
    if (phase !== "test") return;
    idle.current = setTimeout(() => void answer(null), ANSWER_IDLE_MS);
    return () => {
      if (idle.current) clearTimeout(idle.current);
    };
  }, [phase, idx, answer]);

  if (phase === "study") {
    const id = shown[idx];
    return (
      <div className="stage">
        <p className="step-count">{t("recog.of", { i: idx + 1, n: shown.length })}</p>
        <h2>{t("recog.remember")}</h2>
        <ObjectCard id={id} name={nameOf(id)} />
      </div>
    );
  }
  if (phase === "break") {
    return (
      <div className="stage">
        <StepHeading>{t("recog.break_title")}</StepHeading>
        <p className="lead">{t("recog.break_body")}</p>
      </div>
    );
  }
  const item = test[idx];
  return (
    <div className="stage">
      <p className="step-count">{t("recog.of", { i: idx + 1, n: test.length })}</p>
      <h2 ref={headRef} tabIndex={-1}>
        {t("recog.question")}
      </h2>
      <ObjectCard id={item.id} name={nameOf(item.id)} dim={phase === "answered"} />
      {phase === "answered" ? (
        <p className="muted" role="status">
          {t("recog.saved")}
        </p>
      ) : (
        <div className="actions-inline">
          <button className="btn btn-secondary btn-choice" type="button" onClick={() => void answer(true)}>
            {t("recog.yes")}
          </button>
          <button className="btn btn-secondary btn-choice" type="button" onClick={() => void answer(false)}>
            {t("recog.no")}
          </button>
        </div>
      )}
    </div>
  );
}

function ObjectCard({ id, name, dim }: { id: string; name: string; dim?: boolean }) {
  return (
    <div className="category-card" style={{ minHeight: "12rem", opacity: dim ? 0.55 : 1 }}>
      <Icon name={id} label={name} className="icon object-icon" />
    </div>
  );
}
