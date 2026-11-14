"use client";
// Компоненты демо для жюри: панель «Что слышит система», обходной путь, цифры, статус сервера.
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { Icon } from "./Icon";
import { LoadBars, RadarChart } from "./charts";
import { SyntheticBadge } from "./ui";
import type { ApiError } from "@/lib/api/client";
import type {
  BypassPatient,
  BypassScenario,
  DemoNumbers,
  Domain,
  Exercise,
  Health,
  Lang,
  NumbersBlock,
  Picture,
  ProgramItem,
  SpeechResult,
  Word,
} from "@/lib/api/types";
import { DOMAINS } from "@/lib/api/types";
import type { VadState } from "@/lib/audio";
import { L, clock, domainLabel, exTitle, isEn, num, percent, secs, t, type MsgKey } from "./demo-i18n";

/** Число, которое при появлении считается вверх (D6, карточка модели). Без движения при prefers-reduced-motion. */
export function CountUp({ value, digits = 2, duration = 1400 }: { value: number; digits?: number; duration?: number }) {
  const ref = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const final = num(value, digits);
    if (typeof window === "undefined" || window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      el.textContent = final;
      return;
    }
    let raf = 0;
    const t0 = performance.now();
    const tick = (now: number) => {
      const k = Math.min(1, (now - t0) / duration);
      const eased = 1 - Math.pow(1 - k, 4); // сильный ease-out: быстро растёт и мягко садится
      el.textContent = k >= 1 ? final : num(value * eased, digits);
      if (k < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [value, digits, duration]);
  return (
    <span ref={ref} aria-label={num(value, digits)}>
      {num(value, digits)}
    </span>
  );
}

export function ServerStatus({
  health,
  down,
  onBackup,
  compact = false,
}: {
  health: Health | null;
  down: boolean;
  onBackup?: () => void;
  compact?: boolean;
}) {
  if (down) {
    return (
      <span className="row">
        <span className="server down" role="status">
          <i />
          {compact ? L("Сервер: нет связи", "Server: offline") : t("server.down")}
        </span>
        {onBackup ? (
          <button className="btn btn-secondary" type="button" onClick={onBackup}>
            {L("Резервный режим", "Backup mode")}
          </button>
        ) : null}
      </span>
    );
  }
  if (health && health.transcriber_ready === false) {
    return (
      <span className="server wait" role="status">
        <i />
        {compact ? L("Сервер: загружается распознавание", "Server: loading recognition") : t("server.loading_model")}
      </span>
    );
  }
  return (
    <span className="server" role="status">
      <i />
      {health ? (compact ? L("Сервер ок", "Server OK") : t("server.ok")) : L("Сервер…", "Server…")}
    </span>
  );
}

/** Ширина элемента в пикселях и размер шрифта (для раскладки подписей пауз). */
function useBox<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [box, setBox] = useState({ w: 0, fs: 16 });
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(([e]) => {
      setBox({ w: e.contentRect.width, fs: parseFloat(getComputedStyle(el).fontSize) || 16 });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, box] as const;
}

interface PlacedLabel {
  key: string;
  center: number;
  tier: 0 | 1;
  text: string;
}

/** Подписи длинных пауз в две строки над лентой; если места нет, подпись пропускается, пауза остаётся видна на ленте. */
function placeLabels(pauses: { start: number; end: number }[], maxMs: number, width: number, fs: number): PlacedLabel[] {
  if (!width) return [];
  const labelW = fs * 3.6;
  const placed: { center: number; tier: 0 | 1; p: { start: number; end: number } }[] = [];
  // Сначала самые длинные паузы: они важнее для рассказа.
  const order = [...pauses].sort((a, b) => b.end - b.start - (a.end - a.start));
  const occupied: { a: number; b: number; tier: 0 | 1 }[] = [];
  for (const p of order) {
    const c = Math.max(labelW / 2, Math.min(width - labelW / 2, (((p.start + p.end) / 2) / maxMs) * width));
    const a = c - labelW / 2 - 4;
    const b = c + labelW / 2 + 4;
    for (const tier of [0, 1] as const) {
      if (!occupied.some((o) => o.tier === tier && a < o.b && b > o.a)) {
        occupied.push({ a, b, tier });
        placed.push({ center: c, tier, p });
        break;
      }
    }
  }
  return placed
    .sort((x, y) => x.center - y.center)
    .map((x) => ({ key: `${Math.round(x.p.start)}`, center: x.center, tier: x.tier, text: secs((x.p.end - x.p.start) / 1000) }));
}

/** Лента речи и пауз (D2): речь блоками, паузы длиннее 2 секунд выделены и подписаны над лентой. */
export function PauseTimeline({ vad, maxMs }: { vad: VadState | null; maxMs: number }) {
  const [ref, box] = useBox<HTMLDivElement>();
  const pct = (ms: number) => `${Math.max(0, Math.min(100, (ms / maxMs) * 100))}%`;
  const labels = placeLabels(vad?.longPauses ?? [], maxMs, box.w, box.fs);
  return (
    <div className="tl2">
      <div className="tl2-labels" ref={ref} aria-hidden="true">
        {labels.map((l) => (
          <span key={l.key} className={`tl2-label tier-${l.tier}`} style={{ left: `${l.center}px` }}>
            {l.text}
          </span>
        ))}
      </div>
      <div className="tl2-bar" aria-hidden="true">
        {vad?.longPauses.map((p) => (
          <span key={`p${Math.round(p.start)}`} className="tl2-pause" style={{ left: pct(p.start), width: pct(p.end - p.start) }} />
        ))}
        {vad?.segments.map(([a, b], i) => (
          <span key={i} className="tl2-seg" style={{ left: pct(a), width: `max(2px, ${pct(b - a)})` }} />
        ))}
        {vad ? <span className="tl2-cursor" style={{ left: pct(vad.elapsedMs) }} /> : null}
      </div>
      <div className="tl2-legend">
        <span className="l-speech">{L("речь", "speech")}</span>
        <span className="l-pause">{L("пауза", "pause")}</span>
        <span className="l-long">{L("пауза длиннее 2 с", "pause over 2 s")}</span>
      </div>
    </div>
  );
}

const PRONOUNS: Record<Lang, Set<string>> = {
  ru: new Set(
    "я ты он она оно мы вы они его её ее их него неё нее них ему ей им нему ней ним меня мне тебя тебе нас вам это этот эта эти этого тот та те то там тут здесь туда сюда такой такая такие так".split(" "),
  ),
  en: new Set("i you he she it we they him her them his its their this that these those there here".split(" ")),
};

/** Расшифровка с паузами в тексте и подчёркнутыми местоимениями. */
export function TranscriptView({ words, lang }: { words: Word[]; lang: Lang }) {
  const out: React.ReactNode[] = [];
  words.forEach((w, i) => {
    if (i > 0) {
      const gap = w.start - words[i - 1].end;
      if (gap >= 1) {
        out.push(
          <span key={`g${i}`} className="p">
            {secs(gap)}
          </span>,
        );
        out.push(" ");
      }
    }
    const clean = w.text.toLowerCase().replace(/[.,!?;:«»"()]/g, "");
    out.push(
      PRONOUNS[lang].has(clean) ? (
        <span key={i} className="pr">
          {w.text}
        </span>
      ) : (
        <span key={i}>{w.text}</span>
      ),
    );
    out.push(" ");
  });
  return (
    <p className="transcript" lang={lang}>
      {out}
    </p>
  );
}

const fv = (f: SpeechResult["features"], k: string) => {
  const v = f[k];
  return typeof v === "number" ? v : null;
};

export interface JuryProps {
  mode: "live" | "backup";
  vad: VadState | null;
  maxMs: number;
  recording: boolean;
  recog: "none" | "waiting" | "done" | "error";
  result: SpeechResult | null;
  error: ApiError | null;
  onRetry?: () => void;
  onBackup: () => void;
  backupBusy: boolean;
  lang: Lang;
  picture: Picture | null;
  numbers: DemoNumbers | null;
  serverStatus?: React.ReactNode;
  /** живая запись пришла без голоса (пустая расшифровка или 422 empty_audio) */
  silent?: boolean;
}

function Stat({ label, value, tone }: { label: string; value: React.ReactNode; tone?: "attention" | "muted" }) {
  return (
    <div className={`lv-stat${tone ? ` is-${tone}` : ""}`}>
      <dt>{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}

interface ResearchClassifier {
  model_display?: string;
  score: number;
  class_ru?: string;
  label_ru?: string;
  reported?: string;
}

export function LiveSpeechPanel(p: JuryProps) {
  const v = p.vad;
  const f = p.result?.features ?? {};
  const extra = (p.result ?? {}) as { research_classifier?: ResearchClassifier | null; research_classifier_reason_ru?: string | null };
  const rc = extra.research_classifier && typeof extra.research_classifier.score === "number" ? extra.research_classifier : null;
  const rcReason = extra.research_classifier_reason_ru ?? null;
  const found = (f.picture_units_found as string[] | undefined) ?? null;
  const total = fv(f, "picture_units_total");
  const elapsed = v?.elapsedMs ?? 0;
  const progress = Math.max(0, Math.min(1, elapsed / p.maxMs));
  const pauseNow = v && p.recording && v.firstMs !== null && v.currentPauseMs >= 1000 ? v.currentPauseMs : null;
  return (
    <aside className={`jury lv${p.recog !== "none" ? " is-after" : ""}`} aria-label={L("Панель жюри", "Jury panel")}>
      <div className="lv-head">
        <h2>{L("Что слышит система", "What the system hears")}</h2>
        <button className="btn btn-secondary lv-backup" type="button" onClick={p.onBackup} disabled={p.backupBusy || p.recording}>
          <Icon name="replay" />
          {L("Включить пример", "Play example")}
        </button>
      </div>
      <div className="lv-source">
        {p.mode === "backup" ? (
          <span className="backup-label">{t("badge.backup")}</span>
        ) : (
          <span className={`lv-live${p.recording ? " on" : ""}`}>
            <i aria-hidden="true" />
            {p.recording ? L("Идёт живая запись с микрофона", "Recording live from the microphone") : L("Живая запись с микрофона", "Live recording from the microphone")}
          </span>
        )}
        {p.serverStatus}
      </div>

      <section className="lv-block" aria-labelledby="lv-rt">
        <div className="lv-block-head">
          <h3 id="lv-rt">{L("В реальном времени", "Real time")}</h3>
          <span className="lv-clock">
            <strong>{clock(elapsed)}</strong> {L("из", "of")} {clock(p.maxMs)}
          </span>
        </div>
        <div className="lv-progress" aria-hidden="true">
          <span style={{ transform: `scaleX(${progress})` }} />
        </div>
        <PauseTimeline vad={v} maxMs={p.maxMs} />
        <dl className="lv-stats">
          <Stat label={L("Время до первого слова", "Time to first word")} value={v?.firstMs !== null && v?.firstMs !== undefined ? secs(v.firstMs / 1000) : "-"} />
          <Stat label={L("Паузы длиннее 1 с", "Pauses over 1 s")} value={v ? v.pausesOver1s : 0} />
          <Stat label={L("Доля пауз", "Pause ratio")} value={v?.pauseRatio !== null && v?.pauseRatio !== undefined ? percent(v.pauseRatio) : "-"} />
          <Stat label={L("Текущая пауза", "Current pause")} value={pauseNow !== null ? secs(pauseNow / 1000) : "-"} tone={pauseNow !== null ? "attention" : "muted"} />
        </dl>
      </section>

      <section className="lv-block after" aria-labelledby="lv-after" aria-live="polite">
        <div className="lv-block-head">
          <h3 id="lv-after">{L("После распознавания", "After recognition")}</h3>
          {p.recog === "done" && p.result ? <span className="lv-hint">{L("Не сохраняется.", "Not stored.")}</span> : null}
        </div>
        {p.silent ? (
          <div className="notice notice-attention lv-silent" role="status">
            <Icon name="mic-off" />
            <div className="notice-body">
              <p>
                <strong>{L("Запись без голоса: проверьте микрофон.", "No voice in the recording: check the microphone.")}</strong>{" "}
                {L("Показатели речи не посчитаны. Можно записать ещё раз или включить заранее записанный пример.", "Speech measures were not computed. Record again or play the pre-recorded example.")}
              </p>
              <div className="notice-actions">
                <button className="btn btn-secondary" type="button" onClick={p.onBackup} disabled={p.backupBusy || p.recording}>
                  <Icon name="replay" />
                  {L("Включить пример", "Play example")}
                </button>
              </div>
            </div>
          </div>
        ) : p.recog === "none" ? (
          <p className="lv-hint">{L("Через 5-15 секунд после остановки.", "5-15 seconds after stopping.")}</p>
        ) : null}
        {p.recog === "waiting" ? (
          <div className="stack">
            <p className="lv-wait">
              <span className="lv-spinner" aria-hidden="true" />
              {L("Распознаём речь", "Recognising speech")}
            </p>
            <div className="skeleton-block" style={{ height: "4rem" }} aria-hidden="true" />
          </div>
        ) : null}
        {p.recog === "error" ? (
          <div className="notice notice-attention" role="status">
            <Icon name="info" />
            <div className="notice-body">
              <p>{L("Распознавание не удалось. Показаны только данные браузера.", "Recognition failed. Only browser data is shown.")}</p>
              {p.error ? <p className="small">{L("Для ведущего", "For the presenter")}: {p.error.code}.</p> : null}
              {p.onRetry ? (
                <div className="notice-actions">
                  <button className="btn btn-secondary" type="button" onClick={p.onRetry}>
                    {L("Повторить", "Retry")}
                  </button>
                </div>
              ) : null}
            </div>
          </div>
        ) : null}
        {p.recog === "done" && p.result ? (
          <div className="stack">
            <TranscriptView words={p.result.transcript.words} lang={p.result.language} />
            <dl className="lv-stats lv-stats-6">
              <Stat label={L("Время до первого слова", "Time to first word")} value={secs(fv(f, "first_word_latency"))} />
              <Stat label={L("Доля пауз", "Pause ratio")} value={percent(fv(f, "pause_ratio"))} />
              <Stat label={L("Пауза перед содержательным словом", "Pause before a content word")} value={secs(fv(f, "pause_before_content_mean"))} />
              <Stat label={L("Слов в минуту", "Words per minute")} value={fv(f, "speech_rate_wpm") === null ? "-" : Math.round(fv(f, "speech_rate_wpm")!)} />
              <Stat label={L("Разнообразие слов", "Lexical diversity")} value={num(fv(f, "mattr"), 2)} />
              <Stat label={L("Доля местоимений", "Pronoun share")} value={percent(fv(f, "pronoun_share"))} />
              <Stat label={L("Сбои на 100 слов", "Disfluencies per 100 words")} value={num(fv(f, "disfluency_per100"))} />
              <Stat label={L("Самоисправления", "Self-corrections")} value={fv(f, "self_correction_count") ?? "-"} />
            </dl>
            {found && total ? (
              <div className="stack">
                <p className="lv-units-title">
                  {L("Смысловые единицы картинки", "Picture content units")}: <strong>{found.length}</strong> {L("из", "of")} {total}
                </p>
                {p.picture ? (
                  <ul className="units" aria-label={L("Смысловые единицы картинки", "Picture content units")}>
                    {p.picture.units.map((u) => (
                      <li key={u.id} className={found.includes(u.id) ? "found" : "missed"}>
                        {p.result!.language === "en" || L("ru", "en") === "en" ? <span lang="en">{u.label_en}</span> : u.label}
                        <span className="sr-only">{found.includes(u.id) ? L(", названо", ", named") : L(", не названо", ", not named")}</span>
                      </li>
                    ))}
                  </ul>
                ) : null}
              </div>
            ) : null}
          </div>
        ) : null}
        {p.recog === "done" && p.result && rc ? (
          <div className="rc-card">
            <div className="rc-head">
              <p className="rc-title">{L("Исследовательская модель (xlm-roberta, vjsyong)", "Research model (xlm-roberta, vjsyong)")}</p>
              <p className="rc-label">{L(rc.label_ru ?? "Исследовательская модель, точность не подтверждена. Не медицинское заключение", "Research model, accuracy not confirmed. Not a medical conclusion")}</p>
            </div>
            <p className="rc-score">
              <CountUp value={rc.score} digits={2} />
              <span>{L(rc.class_ru ? `вероятность класса «${rc.class_ru}»` : "оценка модели", "model score for the positive class")}</span>
            </p>
            {rc.reported ? <p className="rc-note">{L(rc.reported, "only training accuracy 0.896 is reported, no validation estimate")}</p> : null}
          </div>
        ) : (
          <p className="lang-line">
            {p.recog === "done" && rcReason
              ? L(
                  `Речь: ${p.result?.language === "en" ? "английский" : "русский"}. Исследовательская модель (xlm-roberta, vjsyong): ${rcReason.charAt(0).toLowerCase()}${rcReason.slice(1)}. Показаны показатели речи.`,
                  "Research model (xlm-roberta, vjsyong): English speech only. Speech measures are shown.",
                )
              : p.lang === "ru"
                ? L("Речь: русский. Классификатор ADReSS только для английской речи, для русской показаны показатели речи.", "Speech: Russian. The ADReSS classifier is English only; speech measures are shown for Russian.")
                : L(`Речь: английский. Классификатор: ${p.numbers?.adress.status === "ready" ? "доступен" : "ждёт данных"}.`, `Speech: English. Classifier: ${p.numbers?.adress.status === "ready" ? "available" : "awaiting data"}.`)}
          </p>
        )}
      </section>
    </aside>
  );
}

/* ---------- D4: обходной путь ---------- */

const HEAVY = 0.3;
const SPEECH: Domain[] = ["word_access", "phrase_building"];

type Row = Pick<ProgramItem, "exercise_id" | "title" | "channel" | "predicted_load">;
type Load = Partial<Record<Domain, number>>;

function maxOf(load: Load, ds: Domain[]) {
  let best: { d: Domain; v: number } | null = null;
  for (const d of ds) {
    const v = load[d] ?? 0;
    if (!best || v > best.v) best = { d, v };
  }
  return best;
}

const mean = (xs: number[]) => (xs.length ? xs.reduce((s, x) => s + x, 0) / xs.length : 0);

function Meter({ v, kind, label }: { v: number; kind: "target" | "avoid" | "neutral"; label: string }) {
  return (
    <span className={`bp-meter is-${kind}`} role="img" aria-label={`${label}: ${num(v, 2)}`}>
      <span className="bp-track" aria-hidden="true">
        <span className="bp-fill" style={{ "--v": Math.max(0, Math.min(1, v)) } as React.CSSProperties} />
      </span>
      <span className="bp-val" aria-hidden="true">
        {num(v, 2)}
      </span>
    </span>
  );
}

/** Подпись наблюдаемых функций: речь или перечень функций. */
function watchName(ds: Domain[]) {
  const speech = ds.every((d) => SPEECH.includes(d));
  return speech ? L("речь", "speech") : ds.map((d) => domainLabel(d).toLowerCase()).join(", ");
}

export function BypassCompare({
  scenario,
  exercises,
  withBypass: withBypassProp,
  onChange,
  heading,
}: {
  scenario: BypassScenario;
  exercises: Exercise[];
  /** управляемый режим; без него переключатель хранит состояние сам */
  withBypass?: boolean;
  onChange?: (v: boolean) => void;
  heading?: React.ReactNode;
}) {
  const [own, setOwn] = useState(true);
  const withBypass = typeof withBypassProp === "boolean" ? withBypassProp : own;
  const setMode = (v: boolean) => {
    setOwn(v);
    if (typeof onChange === "function") onChange(v);
  };
  const byId = Object.fromEntries(exercises.map((e) => [e.id, e]));
  const toRow = (id: string): Row | null => {
    const e = byId[id];
    return e ? { exercise_id: e.id, title: e.title, channel: e.channel, predicted_load: e.predicted_load } : null;
  };
  const avoidAll = [...new Set(scenario.patients.flatMap((p) => p.program.avoid_domains))];
  const watch = avoidAll.length ? avoidAll : SPEECH;
  const wName = watchName(watch);
  return (
    <div className={`bp${withBypass ? " is-on" : " is-off"}`}>
      <div className="bp-top">
        {heading}
        <div className="bp-controls">
          <div className="seg-toggle bp-toggle" role="group" aria-label={L("Режим подбора программы", "Program selection mode")}>
            <button type="button" aria-pressed={withBypass} onClick={() => setMode(true)}>
              {L("С обходным путём", "With bypass")}
            </button>
            <button type="button" aria-pressed={!withBypass} onClick={() => setMode(false)}>
              {L("Без обходного пути", "Without bypass")}
            </button>
          </div>
          <LoadSourceNote loadSource={scenario.load_source} loadLabel={(scenario as BypassScenario & { load_label?: string | null }).load_label} />
        </div>
      </div>
      <div className="bp-cols">
        {scenario.patients.map((pt, i) => (
          <BypassColumn
            key={pt.patient_id}
            pt={pt}
            letter={i === 0 ? L("А", "A") : L("Б", "B")}
            withBypass={withBypass}
            toRow={toRow}
            target={scenario.target_domain}
            watch={watch}
            wName={wName}
          />
        ))}
      </div>
    </div>
  );
}

/** Источник нагрузки упражнений одной плашкой по-русски. */
export function LoadSourceNote({ loadSource, loadLabel }: { loadSource?: string | null; loadLabel?: string | null }) {
  const placeholder = !loadSource || loadSource.includes("placeholder");
  let text: string;
  if (placeholder) text = t("badge.stub_matrix");
  else if (loadLabel) text = L(`${loadLabel.replace(/\.$/, "")}. TRIBE v2: Meta, CC BY-NC 4.0, только некоммерческое использование.`, "Load on speech and attention: TRIBE v2; on memory and speed: task-type estimate. TRIBE v2: Meta, CC BY-NC 4.0, non-commercial use only.");
  else text = t("badge.tribe");
  return (
    <p className={`src-note${placeholder ? "" : " is-tribe"}`}>
      <Icon name="info" />
      <span>{text}</span>
    </p>
  );
}

function BypassColumn({
  pt,
  letter,
  withBypass,
  toRow,
  target,
  watch,
  wName,
}: {
  pt: BypassPatient;
  letter: string;
  withBypass: boolean;
  toRow: (id: string) => Row | null;
  target: Domain;
  watch: Domain[];
  wName: string;
}) {
  const avoid = pt.program.avoid_domains;
  const lowWatch = avoid.length > 0;
  const other = letter === "А" ? "Б" : letter === "Б" ? "А" : letter === "A" ? "B" : "A";
  const naive = pt.program.naive_item_ids.map(toRow).filter(Boolean) as Row[];
  const items: Row[] = withBypass ? pt.program.items : naive;
  const programIds = new Set(pt.program.items.map((i) => i.exercise_id));
  const skipped = naive.filter((r) => !programIds.has(r.exercise_id));
  const heavyOf = (r: Row) => (lowWatch ? maxOf(r.predicted_load, avoid) : null);
  const heavyCount = items.filter((r) => (heavyOf(r)?.v ?? 0) >= HEAVY).length;
  const avgTarget = mean(items.map((r) => r.predicted_load[target] ?? 0));
  const avgWatch = mean(items.map((r) => maxOf(r.predicted_load, watch)?.v ?? 0));
  const id = `pt-${letter}`;
  const listRef = useRef<HTMLUListElement>(null);
  const prevTops = useRef<Map<string, number> | null>(null);
  const itemsKey = items.map((r) => r.exercise_id).join("|");

  // Перестройка программы: оставшиеся строки плавно переезжают (FLIP), новые проявляются. Первый показ без анимации строк.
  useLayoutEffect(() => {
    const ul = listRef.current;
    if (!ul) return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const before = prevTops.current;
    const next = new Map<string, number>();
    ul.querySelectorAll<HTMLElement>("[data-id]").forEach((el, i) => {
      const key = el.dataset.id!;
      const top = el.offsetTop;
      next.set(key, top);
      if (!before || reduce || typeof el.animate !== "function") return;
      const was = before.get(key);
      if (was === undefined) {
        el.animate([{ opacity: 0, transform: "translateY(12px)" }, { opacity: 1, transform: "translateY(0)" }], {
          duration: 520,
          delay: 120 + i * 90,
          easing: "cubic-bezier(0.16, 1, 0.3, 1)",
          fill: "backwards",
        });
      } else if (was !== top) {
        el.animate([{ transform: `translateY(${was - top}px)` }, { transform: "translateY(0)" }], {
          duration: 560,
          easing: "cubic-bezier(0.16, 1, 0.3, 1)",
        });
      }
    });
    prevTops.current = next;
  }, [itemsKey]);

  let why: React.ReactNode;
  if (withBypass) {
    why = lowWatch ? (
      <>
        {L("Речь снижена, поэтому память тренируем ", "Speech is reduced, so memory is trained ")}
        <em>{L("через картинки и пространство", "through pictures and space")}</em>
        {L(", а речь обходим.", ", bypassing speech.")}
      </>
    ) : (
      <>
        {L("Речь сохранна, поэтому память тренируем ", "Speech is intact, so memory is trained ")}
        <em>{L("и через пересказ", "through retelling as well")}</em>.
      </>
    );
  } else {
    why = lowWatch ? (
      <>
        {L("Подбор только по цели: ", "Selected by goal only: ")}
        <em className="warn">
          {heavyCount} {L("из", "of")} {items.length}
        </em>
        {L(" упражнений нагружают речь, а она снижена.", " exercises load speech, which is reduced.")}
      </>
    ) : (
      <>{L(`Подбор только по цели. Для ${letter} это подходит: речь сохранна.`, `Selected by goal only. This suits ${letter}: speech is intact.`)}</>
    );
  }

  return (
    <section className={`bp-col${lowWatch ? " is-low" : ""}`} aria-labelledby={id}>
      <header className="bp-head">
        <div className="bp-who">
          <div className="bp-name">
            <h2 id={id}>{L("Пациент", "Patient")} {letter}</h2>
            <SyntheticBadge text={t("badge.synthetic_short")} />
          </div>
          <ul className="bp-facts" aria-label={L("Профиль", "Profile")}>
            <li className="chip chip-same">{L(`память снижена, как у ${other}`, `memory reduced, same as ${other}`)}</li>
            <li className={`chip ${lowWatch ? "chip-low" : "chip-ok"}`}>{lowWatch ? L("речь снижена", "speech reduced") : L("речь сохранна", "speech intact")}</li>
          </ul>
          <p className={`bp-why${!withBypass && lowWatch ? " is-warn" : ""}`} aria-live="polite">
            {why}
          </p>
        </div>
        <RadarChart
          size="thumb"
          now={pt.profile_scores}
          tones={{ episodic_memory: "same", ...(lowWatch ? { word_access: "low", phrase_building: "low" } : {}) }}
          ariaLabel={L(`Профиль пациента ${letter}: память на события снижена, речь ${lowWatch ? "снижена" : "сохранна"}`, `Profile of patient ${letter}: episodic memory reduced, speech ${lowWatch ? "reduced" : "intact"}`)}
        />
      </header>

      <div className="bp-prog">
        <div className="bp-prog-head">
          <h3>{L("Программа на сегодня", "Today’s program")}</h3>
          <span aria-hidden="true">
            <i className="sw-target" />
            {L("цель", "goal")}
          </span>
          <span aria-hidden="true">
            <i className="sw-avoid" />
            {wName}
          </span>
          <span aria-hidden="true" />
        </div>
        <ul className="bp-rows" ref={listRef}>
          {items.map((it) => {
            const h = heavyOf(it);
            const heavy = Boolean(h && h.v >= HEAVY);
            const w = maxOf(it.predicted_load, watch)?.v ?? 0;
            return (
              <li key={it.exercise_id} data-id={it.exercise_id} className={`bp-item${heavy ? " is-heavy" : ""}`}>
                <details>
                  <summary className="bp-row" title={L("Нагрузка по всем пяти функциям, от 0 до 1", "Load on all five functions, 0 to 1")}>
                    <span className="bp-title">
                      {exTitle(it.exercise_id, it.title)} <span className="channel-tag">{t(`channel.${it.channel}` as MsgKey)}</span>
                    </span>
                    <Meter v={it.predicted_load[target] ?? 0} kind="target" label={L("Нагрузка на цель", "Load on goal")} />
                    <Meter v={w} kind={lowWatch ? "avoid" : "neutral"} label={`${L("Нагрузка на", "Load on")} ${wName}`} />
                    <span className="bp-chev" aria-hidden="true" />
                  </summary>
                  <div className="bp-more">
                    <LoadBars load={it.predicted_load} target={target} avoid={avoid} />
                  </div>
                </details>
              </li>
            );
          })}
        </ul>
        <div className="bp-total">
          <span className="bp-total-label">{L("В среднем", "Average")}</span>
          <Meter v={avgTarget} kind="target" label={L("Средняя нагрузка на цель", "Average load on goal")} />
          <Meter v={avgWatch} kind={lowWatch ? "avoid" : "neutral"} label={`${L("Средняя нагрузка на", "Average load on")} ${wName}`} />
          <span aria-hidden="true" />
        </div>
        {withBypass ? (
          <p className="bp-skipped">
            <strong>{L("Не выбрано:", "Not selected:")}</strong>{" "}
            {skipped.length
              ? skipped
                  .slice(0, 2)
                  .map((r) => {
                    const hh = maxOf(r.predicted_load, avoid);
                    return hh ? `«${exTitle(r.exercise_id, r.title)}» (${domainLabel(hh.d).toLowerCase()} ${num(hh.v, 2)})` : `«${exTitle(r.exercise_id, r.title)}»`;
                  })
                  .join(", ")
              : L("ничего, программа совпадает с обычной", "nothing, the program matches the standard one")}
          </p>
        ) : (
          <p className="bp-skipped">
            <strong>{L("Без обходного пути", "Without bypass")}</strong> {L("у обоих одна и та же программа.", "both get the same program.")}
          </p>
        )}
      </div>
    </section>
  );
}

/* ---------- D6: цифры ---------- */

type AgreementBlock = NumbersBlock & {
  per_domain?: Partial<Record<Domain, number>>;
  exercises_compared?: number;
  source?: string;
  domains_in_mean?: Domain[];
  domain_sources?: Partial<Record<Domain, string>>;
};

const COUNT_DAT: Record<number, string> = { 1: "одной функции", 2: "двум функциям", 3: "трём функциям", 4: "четырём функциям", 5: "пяти функциям" };
const COUNT_EN: Record<number, string> = { 1: "one function", 2: "two functions", 3: "three functions", 4: "four functions", 5: "five functions" };
const SHORT_EN: Record<Domain, string> = { episodic_memory: "memory", word_access: "word finding", phrase_building: "phrase building", attention: "attention", processing_speed: "speed" };
const SHORT_NAME: Record<Domain, string> = {
  episodic_memory: "память",
  word_access: "подбор слов",
  phrase_building: "построение фраз",
  attention: "внимание",
  processing_speed: "скорость",
};

function exercisesWord(n: number) {
  const a = n % 10;
  const b = n % 100;
  if (a === 1 && b !== 11) return "упражнение";
  if (a >= 2 && a <= 4 && (b < 12 || b > 14)) return "упражнения";
  return "упражнений";
}

/** Какие функции входят в среднее согласованности и какие взяты из оценки по типу задания. */
function agreementSplit(g: AgreementBlock) {
  const per = g.per_domain ?? {};
  const sources = g.domain_sources ?? {};
  let inMean: Domain[] = (g.domains_in_mean ?? []).filter((d) => DOMAINS.includes(d));
  if (!inMean.length) {
    const tribe = DOMAINS.filter((d) => sources[d] === "tribe_v2");
    inMean = tribe.length ? tribe : DOMAINS.filter((d) => d !== "processing_speed" && typeof per[d] === "number");
  }
  const rest = DOMAINS.filter((d) => !inMean.includes(d) && (sources[d] ? sources[d] !== "tribe_v2" : typeof per[d] === "number"));
  return { inMean, rest };
}

/** Опубликованные ориентиры ADReSS 2020 (английская речь, описание картинки). */
const ADRESS_REFS = [
  { v: 0.75, label: "базовый уровень организаторов", en: "organisers’ baseline" },
  { v: 0.896, label: "лучший результат конкурса", en: "best challenge result" },
];

export function NumbersCards({ numbers }: { numbers: (DemoNumbers & { fromFixture?: boolean }) | null }) {
  const a = numbers?.adress;
  const g = numbers?.agreement as AgreementBlock | undefined;
  const aReady = a?.status === "ready" && typeof a.accuracy === "number";
  const gReady = g?.status === "ready" && typeof g.value === "number";
  return (
    <div className="nums-wrap">
      <div className="nums">
        <section className={`num-card${aReady ? " is-ready" : ""}`} aria-labelledby="n-adress">
          <p className="num-kicker">{L("Английская речь", "English speech")}</p>
          <h2 id="n-adress">{L("Классификатор речи", "Speech classifier")}</h2>
          <div className="num-figure">
            {aReady ? (
              <>
                <p className="num-big">
                  <CountUp value={a!.accuracy!} digits={2} />
                </p>
                <p className="num-unit">{L("точность на ADReSS", "accuracy on ADReSS")}</p>
              </>
            ) : (
              <>
                <p className="num-status is-on">
                  <Icon name="check" />
                  {L("Подключён: xlm-roberta (готовая модель, английская речь)", "Connected: xlm-roberta (ready-made model, English speech)")}
                </p>
                <p className="num-unit">{L("Точность на ADReSS не подтверждена: нет доступа к данным.", "Accuracy on ADReSS not confirmed: no data access.")}</p>
              </>
            )}
          </div>
          <div className="num-refs num-refs-small">
            <p className="num-refs-title">{L("опубликованные ориентиры ADReSS", "published ADReSS references")}</p>
            <dl>
              {ADRESS_REFS.map((r, i) => (
                <div key={r.v}>
                  <dt>{i === 0 && typeof a?.baseline === "number" ? L("базовый уровень", "baseline") : L(r.label, r.en)}</dt>
                  <dd>{num(i === 0 && typeof a?.baseline === "number" ? a.baseline : r.v, i === 0 ? 2 : 3)}</dd>
                </div>
              ))}
            </dl>
          </div>
        </section>

        <section className={`num-card${gReady ? " is-ready" : ""}`} aria-labelledby="n-agree">
          <p className="num-kicker">{L("Нагрузка упражнений", "Exercise load")}</p>
          <h2 id="n-agree">{L("Согласованность с TRIBE v2", "Agreement with TRIBE v2")}</h2>
          {gReady
            ? (() => {
                const { inMean, rest } = agreementSplit(g!);
                const n = g!.exercises_compared;
                const memSpeed = rest.length === 2 && rest.includes("episodic_memory") && rest.includes("processing_speed");
                const restNames = rest.map((d) => (isEn() ? SHORT_EN[d] : SHORT_NAME[d]));
                const restText = restNames.length
                  ? `${restNames.length > 1 ? `${restNames.slice(0, -1).join(", ")} ${L("и", "and")} ${restNames[restNames.length - 1]}` : restNames[0]}`
                  : "";
                return (
                  <>
                    <div className="num-figure">
                      <p className="num-big">
                        <CountUp value={g!.value!} digits={2} />
                      </p>
                      <p className="num-unit">
                        {L(
                          `Корреляция Спирмена с оценкой по типу задания: среднее по ${COUNT_DAT[inMean.length] ?? `${inMean.length} функциям`} из TRIBE v2${typeof n === "number" ? `, ${n} ${exercisesWord(n)}` : ""}.`,
                          `Spearman correlation with the task-type estimate: mean over ${COUNT_EN[inMean.length] ?? `${inMean.length} functions`} from TRIBE v2${typeof n === "number" ? `, ${n} exercises` : ""}.`,
                        )}
                      </p>
                    </div>
                    {g!.per_domain && inMean.length ? (
                      <dl className="num-domains">
                        {inMean
                          .filter((d) => typeof g!.per_domain![d] === "number")
                          .map((d) => (
                            <div key={d}>
                              <dt>{domainLabel(d)}</dt>
                              <dd>
                                <CountUp value={g!.per_domain![d]!} digits={2} />
                              </dd>
                            </div>
                          ))}
                      </dl>
                    ) : null}
                    {restText ? (
                      <p className="num-rest">
                        {restText.charAt(0).toUpperCase() + restText.slice(1)}
                        {L(
                          `: оценка по типу задания, TRIBE v2 для ${rest.length > 1 ? "них" : "неё"} не используется${memSpeed ? " (в публичной модели нет гиппокампа, скорость не локализуется)" : ""}.`,
                          `: task-type estimate; TRIBE v2 is not used for ${rest.length > 1 ? "them" : "it"}${memSpeed ? " (the public model has no hippocampus, and speed is not localised)" : ""}.`,
                        )}
                      </p>
                    ) : null}
                  </>
                );
              })()
            : (
            <>
              <div className="num-figure">
                <p className="num-status">
                  <Icon name="clock" />
                  {t("numbers.pending")}
                </p>
                <p className="num-unit">{L("Число появится здесь само после прогона модели.", "The number will appear here after the model run.")}</p>
              </div>
              <ol className="num-how">
                <li>{L("TRIBE v2 предсказывает, какие функции нагружает каждое упражнение.", "TRIBE v2 predicts which functions each exercise loads.")}</li>
                <li>{L("Сравниваем с нынешней оценкой по типу задания: корреляция по упражнениям для каждой функции.", "We compare it with the current task-type estimate: correlation across exercises per function.")}</li>
                <li>{L("Подбор программы сразу переходит на новую нагрузку, структура остаётся той же.", "Program selection switches to the new load; the structure stays the same.")}</li>
              </ol>
            </>
          )}
        </section>
      </div>

      <section className="num-final" aria-labelledby="n-final">
        <h2 id="n-final">{L("Что уже работает", "What already works")}</h2>
        <ul>
          <li>
            <strong>{L("Запись и показатели речи", "Recording and speech measures")}</strong> {L("на этом компьютере, без интернета", "on this computer, offline")}
          </li>
          <li>
            <strong>{L("Профиль по пяти функциям", "Five-function profile")}</strong> {L("и спокойный флаг для близкого", "and a calm flag for family")}
          </li>
          <li>
            <strong>{L("Подбор с обходным путём:", "Bypass selection:")}</strong> {L("память тренируется через то, что сохранно", "memory is trained through what remains intact")}
          </li>
        </ul>
      </section>
      {numbers?.fromFixture ? <p className="small muted">{L("Данные из локальной заглушки: сервер не отдаёт /demo/numbers.", "Local fixture data: the server does not serve /demo/numbers.")}</p> : null}
    </div>
  );
}
