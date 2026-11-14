"use client";
// Общие виды для экрана близкого (F1), профиля (F2) и демо (D3, D5).
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Icon } from "./Icon";
import { RadarChart, TrendSmallMultiples } from "./charts";
import { DOMAINS, type Domain, type DomainScores, type Profile, type Trajectory } from "@/lib/api/types";
import { daysCount, weeksCount } from "@/lib/i18n";
import { L, daysText, domainLabel, isEn, metricValue, num, t, type MsgKey } from "./demo-i18n";

/** Какая недельная микрометрика к какой функции относится (по весам профиля в backend). */
const METRIC_ROWS: { metric: string; domain: Domain }[] = [
  { metric: "retell_retention", domain: "episodic_memory" },
  { metric: "pause_before_content_mean", domain: "word_access" },
  { metric: "fluency_count", domain: "word_access" },
  { metric: "speech_rate_wpm", domain: "processing_speed" },
  { metric: "time_to_first_action_s", domain: "processing_speed" },
];

const FEATURE_LABELS: Record<string, string> = {
  retell_retention: "сохранилось из рассказа через 20 минут",
  retell_delayed_frac: "пересказ через 20 минут",
  retell_immediate_frac: "пересказ сразу",
  fluency_count: "слов за минуту в «Назовите животных»",
  pause_before_content_mean: "пауза перед содержательным словом",
  pronoun_share: "доля местоимений",
  mattr: "разнообразие слов",
  fluency_repeats: "повторы при назывании",
  mean_utterance_len: "длина фразы, слов",
  subordination_per100: "сложные предложения на 100 слов",
  disfluency_per100: "сбои речи на 100 слов",
  rt_cv: "разброс времени ответа",
  hints_per_session: "подсказок за занятие",
  interruptions_per_session: "прерываний за занятие",
  fluency_late_early_ratio: "темп называния к концу минуты",
  pause_ratio: "доля пауз",
  time_to_first_action_s: "время до начала ответа",
  speech_rate_wpm: "слов в минуту",
  first_word_latency: "время до первого слова",
};

export function ProfileView({
  profile,
  trajectory,
  forDoctor = true,
  initialWeek,
  layout = "stack",
  playable = false,
}: {
  profile: Profile | null;
  trajectory: Trajectory | null;
  forDoctor?: boolean;
  initialWeek?: number;
  /** split: диаграмма слева, таблица справа (демо на проекторе) */
  layout?: "stack" | "split";
  /** кнопка «Проиграть с недели 1» */
  playable?: boolean;
}) {
  const weeks = trajectory?.weeks ?? [];
  const n = weeks.length;
  const [sel, setSel] = useState(initialWeek ?? n);
  const [playing, setPlaying] = useState(false);
  const selected = Math.min(Math.max(1, sel || n), Math.max(1, n));
  const now: DomainScores = n
    ? weeks[selected - 1].scores
    : Object.fromEntries(DOMAINS.map((d) => [d, profile?.domains[d]?.score ?? null]));
  const first = n ? weeks[0].scores : null;
  const showFirst = n > 1 && selected !== 1;

  const isPlaying = playing && selected < n;
  useEffect(() => {
    if (!isPlaying) return;
    const id = window.setTimeout(() => setSel(selected + 1), 560);
    return () => window.clearTimeout(id);
  }, [isPlaying, selected]);

  const play = () => {
    setSel(1);
    setPlaying(true);
  };

  const contributions = forDoctor && profile?.has_data ? DOMAINS.filter((d) => (profile.domains[d]?.contributions ?? []).length > 0) : [];

  const chart = (
    <div className="pv-chart">
      {n ? (
        <p className="step-count pv-week">
          <strong>{selected === n ? t("profile.legend_now") : t("profile.legend_week", { i: selected })}</strong>
          <span>{t("profile.week_of", { i: selected, n })}</span>
        </p>
      ) : null}
      <div className="legend" aria-hidden="true">
        <span>
          <i className="sw sw-now" />
          {selected === n ? t("profile.legend_now") : t("profile.legend_week", { i: selected })}
        </span>
        {showFirst ? (
          <span>
            <i className="sw sw-first" />
            {t("profile.legend_first")}
          </span>
        ) : null}
      </div>
      <div className="radar-wrap">
        <RadarChart now={now} first={showFirst ? first : null} />
        {n > 1 ? (
          <div className="week-control">
            <label htmlFor="week-range" className="row" style={{ justifyContent: "space-between" }}>
              <span>{t("profile.slider")}</span>
              <strong className="num">{t("profile.legend_week", { i: selected })}</strong>
            </label>
            <input
              id="week-range"
              type="range"
              min={1}
              max={n}
              step={1}
              value={selected}
              onChange={(e) => {
                setPlaying(false);
                setSel(Number(e.target.value));
              }}
              aria-valuetext={t("profile.legend_week", { i: selected })}
            />
            <div className="actions-inline">
              <button className="btn btn-secondary" type="button" onClick={() => { setPlaying(false); setSel(1); }} aria-pressed={selected === 1}>
                {t("profile.first")}
              </button>
              <button className="btn btn-secondary" type="button" onClick={() => { setPlaying(false); setSel(n); }} aria-pressed={selected === n}>
                {t("profile.now")}
              </button>
              {playable ? (
                <button className="btn btn-tertiary" type="button" onClick={play} disabled={isPlaying}>
                  <Icon name="play" />
                  {isPlaying ? L("Идёт по неделям", "Playing weeks") : L("Проиграть с недели 1", "Play from week 1")}
                </button>
              ) : null}
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );

  const table = n ? (
    <div className="table-scroll" tabIndex={0} role="region" aria-label={t("profile.table_title")}>
      <table className="data-table">
        <caption className="sr-only">{t("profile.table_title")}</caption>
        <thead>
          <tr>
            <th scope="col">{t("profile.col_domain")}</th>
            <th scope="col">{t("profile.col_measure")}</th>
            <th scope="col" className="n">
              {t("profile.legend_first")}
            </th>
            <th scope="col" className="n">
              {selected === n ? t("profile.col_now") : t("profile.legend_week", { i: selected })}
            </th>
          </tr>
        </thead>
        <tbody>
          {DOMAINS.map((d) => {
            const rows = METRIC_ROWS.filter((r) => r.domain === d);
            const sci = profile?.domains[d]?.label_ru;
            const showSci = forDoctor && sci && !isEn() && sci.toLowerCase() !== domainLabel(d).toLowerCase();
            const label = (
              <>
                {domainLabel(d)}
                {showSci ? (
                  <span className="small muted" style={{ display: "block" }}>
                    ({sci!.toLowerCase()})
                  </span>
                ) : null}
              </>
            );
            if (!rows.length) {
              return (
                <tr key={d}>
                  <th scope="row">{label}</th>
                  <td colSpan={3} className="muted">
                    {L("нет недельного показателя", "no weekly measure")}
                  </td>
                </tr>
              );
            }
            return rows.map((r, k) => {
              const a = weeks[0].metrics[r.metric] as number | null;
              const b = weeks[selected - 1].metrics[r.metric] as number | null;
              return (
                <tr key={r.metric} className={r.metric === "pause_before_content_mean" ? "is-key" : undefined}>
                  {k === 0 ? (
                    <th scope="row" rowSpan={rows.length}>
                      {label}
                    </th>
                  ) : null}
                  <td>{t(`metric.${r.metric}` as MsgKey)}</td>
                  <td className="n">{metricValue(r.metric, a)}</td>
                  <td className="n">
                    <strong>{metricValue(r.metric, b)}</strong>
                  </td>
                </tr>
              );
            });
          })}
        </tbody>
      </table>
    </div>
  ) : null;

  const notes = (
    <>
      {contributions.length ? (
        <details className="why">
          <summary>{t("profile.window", { d: profile!.window_days })}</summary>
          <div className="stack">
            {contributions.map((d) => (
              <p key={d}>
                <strong>{domainLabel(d)}:</strong>{" "}
                {profile!.domains[d].contributions
                  .map((x) => `${L(FEATURE_LABELS[x.feature] ?? x.feature, x.feature.replace(/_/g, " "))} ${num(x.value, 2)} (${L("вес", "weight")} ${num(x.weight, 2)})`)
                  .join("; ")}
              </p>
            ))}
          </div>
        </details>
      ) : null}
      <p className="note">{t("profile.preliminary")}</p>
    </>
  );

  if (layout === "split") {
    const key = (metric: string, label: string) => {
      const a = n ? (weeks[0].metrics[metric] as number | null) : null;
      const b = n ? (weeks[selected - 1].metrics[metric] as number | null) : null;
      const fmt = (v: number | null) => (metric === "pause_before_content_mean" && v !== null ? `${num(v, 2)} ${L("с", "s")}` : metricValue(metric, v));
      return (
        <div className="pv-key">
          <p className="pv-key-label">{label}</p>
          <p className="pv-key-nums">
            <span className="pv-key-was">{fmt(a)}</span>
            <span className="pv-key-arrow" aria-label={L("стало", "now")}>
              <Icon name="arrow" />
            </span>
            <span className="pv-key-now">{fmt(b)}</span>
          </p>
          <p className="pv-key-sub">{L("неделя 1 и ", "week 1 and ")}{selected === n ? L("сейчас", "now") : `${L("неделя", "week")} ${selected}`}</p>
        </div>
      );
    };
    return (
      <div className="pv-split">
        <div className="pv-card pv-card-chart">{chart}</div>
        <div className="pv-side">
          <h2 className="pv-side-title">{L("Не балл, а показатели речи", "Not a score, but speech measures")}</h2>
          <div className="pv-keys">
            {key("pause_before_content_mean", L("Пауза перед содержательным словом", "Pause before a content word"))}
            {key("fluency_count", L("Слов за минуту в «Назовите животных»", "Words per minute in “Name animals”"))}
          </div>
          <div className="pv-card pv-card-table">{table}</div>
          <p className="note">{L("Предварительно: правила по показателям речи, без проверки на людях.", "Preliminary: rules on speech measures, not tested on people.")}</p>
        </div>
      </div>
    );
  }
  return (
    <div className="stack-lg">
      {chart}
      {table}
      {notes}
    </div>
  );
}

function evidence(traj: Trajectory, d: Domain): string | null {
  const w = traj.weeks;
  if (w.length < 2) return null;
  const pick = (m: string) => {
    const a = w[0].metrics[m];
    const b = w[w.length - 1].metrics[m];
    return a !== null && a !== undefined && b !== null && b !== undefined ? { a, b } : null;
  };
  const order: Record<Domain, string[]> = {
    word_access: ["fluency_count", "pause_before_content_mean"],
    episodic_memory: ["retell_retention"],
    phrase_building: ["speech_rate_wpm"],
    attention: [],
    processing_speed: ["speech_rate_wpm"],
  };
  for (const m of order[d]) {
    const v = pick(m);
    if (v) return t(`evidence.${m}` as MsgKey, { first: metricValue(m, v.a), last: metricValue(m, v.b) });
  }
  return null;
}

/** Неделя, с которой линия домена заметно ниже ориентира от первой недели. */
function sinceWeek(traj: Trajectory, d: Domain): number | null {
  const s = traj.series[d] ?? [];
  const i0 = s.findIndex((v) => v !== null && v !== undefined);
  if (i0 < 0) return null;
  const v0 = s[i0] as number;
  for (let i = i0 + 1; i < s.length; i++) {
    const v = s[i];
    if (v === null || v === undefined) continue;
    const ref = v0 + traj.trend_flag.reference_slope_per_week * (i - i0);
    if (ref - v >= 5) return traj.weeks[i]?.week ?? i + 1;
  }
  return null;
}

export function FlagCallout({ traj }: { traj: Trajectory }) {
  const f = traj.trend_flag;
  if (!f.active || !f.domains.length) {
    return (
      <div className="calm-box">
        <Icon name="check-circle" />
        <p>{t("flag.none")}</p>
      </div>
    );
  }
  const names = f.domains.map(domainLabel);
  const domainText = names.length > 1 ? `${names.slice(0, -1).join(", ")} ${L("и", "and")} ${names[names.length - 1].toLowerCase()}` : names[0];
  const text = t("flag.faster_than_usual", { domain: domainText }).replace("снижается", names.length > 1 ? "снижаются" : "снижается");
  const w = f.per_domain?.[f.domains[0]]?.weeks ?? traj.weeks.length;
  const ev = evidence(traj, f.domains[0]);
  return (
    <div className="flag" role="region" aria-label={t("family.discuss")}>
      <div className="flag-head">
        <Icon name="info" />
        <p className="flag-title">{text}</p>
      </div>
      {ev ? <p className="flag-ev">{ev}</p> : null}
      <p className="flag-meaning">{L(`Это описание динамики за ${weeksCount(w)}, а не вывод о здоровье. Причины бывают разными: сон, усталость, лекарства.`, `This describes a ${w}-week trend, not a health conclusion. Causes vary: sleep, tiredness, medication.`)}</p>
    </div>
  );
}

/** Как подготовиться к разговору со специалистом: что заметили, с какой недели, что взять с собой. */
function PrepareTalk({ traj }: { traj: Trajectory }) {
  const f = traj.trend_flag;
  if (!f.active || !f.domains.length) return null;
  const d = f.domains[0];
  const since = sinceWeek(traj, d);
  const whatEn: Record<Domain, string> = {
    word_access: "whether you notice that words are harder to find, and since when",
    episodic_memory: "whether you notice that recent events are harder to remember, and since when",
    phrase_building: "whether you notice that sentences are harder to build, and since when",
    attention: "whether you notice that focusing became harder, and since when",
    processing_speed: "whether you notice that answers come more slowly, and since when",
  };
  const what: Record<Domain, string> = {
    word_access: "замечаете ли вы сами, что слова подбираются труднее, и с каких пор",
    episodic_memory: "замечаете ли вы сами, что недавние события запоминаются труднее, и с каких пор",
    phrase_building: "замечаете ли вы сами, что фразы строятся труднее, и с каких пор",
    attention: "замечаете ли вы сами, что сосредоточиться стало труднее, и с каких пор",
    processing_speed: "замечаете ли вы сами, что ответ даётся медленнее, и с каких пор",
  };
  return (
    <div className="prep">
      <h3>{L("Как подготовиться к разговору", "How to prepare for the conversation")}</h3>
      <ol>
        <li>
          <strong>{L("Что рассказать:", "What to tell:")}</strong> {L(what[d].replace(/^замечаете ли вы сами, что /, "").replace(/, и с каких пор$/, ""), whatEn[d].replace(/^whether you notice that /, "").replace(/, and since when$/, ""))}.
        </li>
        <li>
          <strong>{L("С какой недели:", "Since week:")}</strong>{" "}
          {since ? L(`с недели ${since} из ${traj.weeks.length}.`, `since week ${since} of ${traj.weeks.length}.`) : L(`за последние ${weeksCount(traj.weeks.length)}.`, `over the last ${traj.weeks.length} weeks.`)}
        </li>
        <li>
          <strong>{L("Что взять:", "What to bring:")}</strong> {L("этот экран и список лекарств.", "this screen and a list of medications.")}
        </li>
      </ol>
    </div>
  );
}

export function FamilyView({
  traj,
  profileHref,
  layout = "stack",
}: {
  traj: Trajectory;
  profileHref: string;
  layout?: "stack" | "split";
  name?: string;
}) {
  const [table, setTable] = useState(false);
  const weeks = traj.weeks;
  const last = weeks[weeks.length - 1];
  const prev = weeks[weeks.length - 2];
  const totalDays = useMemo(() => weeks.reduce((s, w) => s + w.sessions, 0), [weeks]);

  if (!traj.has_data || weeks.length < 2) {
    return (
      <div className="calm-box">
        <Icon name="info" />
        <p>{t("family.empty", { n: daysText(totalDays, daysCount(totalDays)) })}</p>
      </div>
    );
  }
  const regular = last && prev && last.sessions >= 5 && prev.sessions >= 5;

  const discuss = (
    <section className="block fv-discuss" aria-labelledby="b-discuss">
      <h2 id="b-discuss">{t("family.discuss")}</h2>
      <div className="fv-discuss-grid">
        <FlagCallout traj={traj} />
        <PrepareTalk traj={traj} />
      </div>
    </section>
  );
  const trajectory = (
    <section className="block fv-traj" aria-labelledby="b-traj">
      <h2 id="b-traj">{t("family.trajectory")}</h2>
      <p className="muted small">{t("family.trajectory_note")}</p>
      <TrendSmallMultiples
        series={traj.series}
        flagged={traj.trend_flag.active ? traj.trend_flag.domains : []}
        referenceSlope={traj.trend_flag.reference_slope_per_week}
        weeks={weeks.length}
      />
      <div className="actions-inline">
        <Link className="btn btn-secondary" href={profileHref}>
          <Icon name="chart" />
          {t("family.more_profile")}
        </Link>
        <button className="btn btn-tertiary" type="button" aria-expanded={table} onClick={() => setTable((x) => !x)}>
          {table ? t("family.hide_table") : t("family.show_table")}
        </button>
      </div>
      {table ? (
        <div className="table-scroll" tabIndex={0} role="region" aria-label={L("Значения по неделям", "Values by week")}>
          <table className="data-table">
            <caption className="small muted" style={{ padding: "var(--s-3)" }}>
              {L("Значения профиля по неделям, от 0 до 100. Предварительно, без проверки на реальных людях.", "Profile values by week, 0 to 100. Preliminary, not tested on real people.")}
            </caption>
            <thead>
              <tr>
                <th scope="col">{t("family.week_col")}</th>
                {DOMAINS.map((d) => (
                  <th scope="col" className="n" key={d}>
                    {domainLabel(d)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {weeks.map((w) => (
                <tr key={w.week}>
                  <th scope="row">{w.week}</th>
                  {DOMAINS.map((d) => (
                    <td className="n" key={d}>
                      {w.scores[d] === null || w.scores[d] === undefined ? "-" : Math.round(w.scores[d]!)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </section>
  );
  const week = (
    <section className="block fv-week" aria-labelledby="b-week">
      <h2 id="b-week">{t("family.week_title")}</h2>
      <div className="fv-s-grid">
        <div className="fv-s">
          <p className="fv-s-num">
            {Math.min(7, last.sessions)}
            <span> {L("из 7", "of 7")}</span>
          </p>
          <p className="fv-s-label">{L("дней с занятиями на этой неделе", "days with exercises this week")}</p>
        </div>
        {prev ? (
          <div className="fv-s">
            <p className="fv-s-num">
              {Math.min(7, prev.sessions)}
              <span> {L("из 7", "of 7")}</span>
            </p>
            <p className="fv-s-label">{L("неделей раньше", "a week earlier")}</p>
          </div>
        ) : null}
      </div>
      {regular ? <p className="fv-regular">{L("Занятия регулярные: дело не в пропусках.", "Regular sessions: not due to missed days.")}</p> : null}
    </section>
  );

  if (layout === "split") {
    return (
      <div className="fv-split">
        {discuss}
        <div>
          {trajectory}
          {week}
        </div>
      </div>
    );
  }
  return (
    <div className="fv">
      {discuss}
      {trajectory}
      {week}
    </div>
  );
}
