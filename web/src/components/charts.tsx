"use client";
// Лепестковая диаграмма профиля, малые графики по неделям, полоски нагрузки.
import type { CSSProperties } from "react";
import { DOMAINS, type Domain, type DomainScores } from "@/lib/api/types";
import { L, domainLabel, num, t } from "./demo-i18n";

function polar(cx: number, cy: number, r: number, i: number, n: number) {
  const a = -Math.PI / 2 + (i * 2 * Math.PI) / n;
  return [cx + r * Math.cos(a), cy + r * Math.sin(a)] as const;
}

function shapePath(scores: DomainScores, cx: number, cy: number, R: number) {
  const pts = DOMAINS.map((d, i) => {
    const v = scores[d];
    if (v === null || v === undefined) return null;
    return polar(cx, cy, (Math.max(0, Math.min(100, v)) / 100) * R, i, DOMAINS.length);
  }).filter(Boolean) as (readonly [number, number])[];
  if (pts.length < 2) return "";
  return `M${pts.map((p) => `${p[0].toFixed(1)},${p[1].toFixed(1)}`).join("L")}Z`;
}

/** Короткие подписи осей для маленькой диаграммы (D4). */
const SHORT: Record<Domain, string> = {
  episodic_memory: "Память",
  word_access: "Слова",
  phrase_building: "Фразы",
  attention: "Внимание",
  processing_speed: "Скорость",
};
const SHORT_EN: Record<Domain, string> = {
  episodic_memory: "Memory",
  word_access: "Words",
  phrase_building: "Phrases",
  attention: "Attention",
  processing_speed: "Speed",
};

type Tone = "same" | "low" | "ok";
const TONE_FILL: Record<Tone, string> = { same: "var(--ink)", low: "var(--attention)", ok: "var(--ok)" };

/** Маленькая диаграмма для сравнения двух людей: короткие подписи, выделенные оси. */
function RadarThumb({ now, tones, ariaLabel }: { now: DomainScores; tones?: Partial<Record<Domain, Tone>>; ariaLabel?: string }) {
  const W = 320;
  const H = 226;
  const cx = W / 2;
  const cy = 118;
  const R = 64;
  const path = shapePath(now, cx, cy, R);
  const fs = 22;
  return (
    <svg className="radar radar-thumb" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={ariaLabel ?? t("profile.chart_aria")}>
      {[0.5, 1].map((k) => (
        <polygon
          key={k}
          points={DOMAINS.map((_, i) => polar(cx, cy, R * k, i, DOMAINS.length).join(",")).join(" ")}
          fill={k === 1 ? "var(--surface)" : "none"}
          stroke="var(--line)"
          strokeWidth="1.5"
        />
      ))}
      {DOMAINS.map((d, i) => {
        const [x, y] = polar(cx, cy, R, i, DOMAINS.length);
        const tone = tones?.[d];
        return (
          <line
            key={d}
            x1={cx}
            y1={cy}
            x2={x}
            y2={y}
            stroke={tone === "low" ? "var(--attention-line)" : "var(--line)"}
            strokeWidth={tone === "low" ? 2 : 1.5}
            strokeDasharray={tone === "low" ? "4 4" : undefined}
          />
        );
      })}
      {path ? (
        <path className="shape-now" d={path} fill="rgba(28, 90, 81, 0.22)" stroke="var(--accent)" strokeWidth="3" strokeLinejoin="round" />
      ) : null}
      {DOMAINS.map((d, i) => {
        const v = now[d];
        if (v === null || v === undefined) return null;
        const [x, y] = polar(cx, cy, (Math.max(0, Math.min(100, v)) / 100) * R, i, DOMAINS.length);
        const tone = tones?.[d];
        return <circle key={d} cx={x} cy={y} r={tone ? 5 : 3.5} fill={tone === "low" ? "var(--attention-line)" : "var(--info, var(--accent))"} />;
      })}
      {DOMAINS.map((d, i) => {
        const [x, y] = polar(cx, cy, R + 14, i, DOMAINS.length);
        const anchor = Math.abs(x - cx) < 4 ? "middle" : x > cx ? "start" : "end";
        const tone = tones?.[d];
        const dy = y < cy - R * 0.5 ? -4 : y > cy + R * 0.3 ? fs : fs * 0.35;
        return (
          <text
            key={d}
            x={x}
            y={y + dy}
            textAnchor={anchor}
            fontSize={tone ? fs : fs - 2}
            fontWeight={tone ? 700 : 500}
            fill={tone ? TONE_FILL[tone] : "var(--ink-2)"}
            fontFamily="var(--font-ui)"
          >
            {L(SHORT[d], SHORT_EN[d])}
          </text>
        );
      })}
    </svg>
  );
}

export function RadarChart({
  now,
  first,
  size = "full",
  notes,
  tones,
  ariaLabel,
}: {
  now: DomainScores;
  first?: DomainScores | null;
  size?: "full" | "mini" | "thumb";
  /** подписи под осями (обходной путь: «одинаково снижена») */
  notes?: Partial<Record<Domain, string>>;
  /** выделение осей на маленькой диаграмме */
  tones?: Partial<Record<Domain, Tone>>;
  ariaLabel?: string;
}) {
  if (size === "thumb") return <RadarThumb now={now} tones={tones} ariaLabel={ariaLabel} />;
  const mini = size === "mini";
  const W = mini ? 440 : 600;
  const H = mini ? 300 : 440;
  const cx = W / 2;
  const cy = mini ? 152 : 222;
  const R = mini ? 92 : 138;
  const nowPath = shapePath(now, cx, cy, R);
  const firstPath = first ? shapePath(first, cx, cy, R) : "";
  const fs = mini ? 14 : 20;
  return (
    <svg className="radar" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={ariaLabel ?? t("profile.chart_aria")}>
      {[0.25, 0.5, 0.75, 1].map((k) => (
        <polygon
          key={k}
          points={DOMAINS.map((_, i) => polar(cx, cy, R * k, i, DOMAINS.length).join(",")).join(" ")}
          fill="none"
          stroke="var(--line)"
          strokeWidth="1"
        />
      ))}
      {DOMAINS.map((d, i) => {
        const [x, y] = polar(cx, cy, R, i, DOMAINS.length);
        return <line key={d} x1={cx} y1={cy} x2={x} y2={y} stroke="var(--line)" strokeWidth="1" />;
      })}
      {firstPath ? (
        <path d={firstPath} fill="none" stroke="var(--ink-3)" strokeWidth="1.5" strokeDasharray="4 3" />
      ) : null}
      {nowPath ? (
        <path
          className="shape-now"
          d={nowPath}
          style={{ d: `path("${nowPath}")` } as CSSProperties}
          fill="rgba(28, 90, 81, 0.2)"
          stroke="var(--accent)"
          strokeWidth="2"
          strokeLinejoin="round"
        />
      ) : null}
      {DOMAINS.map((d, i) => {
        const [x, y] = polar(cx, cy, R + (mini ? 16 : 22), i, DOMAINS.length);
        const anchor = Math.abs(x - cx) < 4 ? "middle" : x > cx ? "start" : "end";
        const missing = now[d] === null || now[d] === undefined;
        const lines = [domainLabel(d)];
        if (missing) lines.push(t("profile.no_data_axis"));
        if (notes?.[d]) lines.push(notes[d]!);
        const dy = y < cy - R * 0.5 ? -(lines.length - 1) * (fs + 2) : y > cy + R * 0.3 ? 6 : -((lines.length - 1) * (fs + 2)) / 2;
        return (
          <text key={d} x={x} y={y + dy} textAnchor={anchor} fontSize={fs} fill="var(--ink-2)" fontFamily="var(--font-ui)">
            {lines.map((l, k) => (
              <tspan key={k} x={x} dy={k === 0 ? 0 : fs + 2} fontWeight={k === 0 ? 600 : 400} fill={k === 0 ? "var(--ink)" : notes?.[d] && k === lines.length - 1 ? "var(--attention)" : "var(--ink-2)"}>
                {l}
              </tspan>
            ))}
          </text>
        );
      })}
    </svg>
  );
}

/** Пять линий по неделям, пунктир-ориентир от первой недели, флагнутый домен охристый. */
export function TrendSmallMultiples({
  series,
  flagged,
  referenceSlope,
  weeks,
}: {
  series: Partial<Record<Domain, (number | null)[]>>;
  flagged: Domain[];
  referenceSlope: number;
  weeks: number;
}) {
  const W = 300;
  const H = 56;
  const pad = 4;
  // Общая для всех доменов шкала по данным, чтобы изменение было видно и графики сравнимы.
  const all = DOMAINS.flatMap((d) => (series[d] ?? []).filter((v): v is number => typeof v === "number"));
  const lo = all.length ? Math.max(0, Math.floor(Math.min(...all) / 10) * 10 - 10) : 0;
  const hi = all.length ? Math.min(100, Math.ceil(Math.max(...all) / 10) * 10 + 5) : 100;
  const x = (i: number) => pad + (i * (W - 2 * pad)) / Math.max(1, weeks - 1);
  const y = (v: number) => H - pad - ((Math.max(lo, Math.min(hi, v)) - lo) / Math.max(1, hi - lo)) * (H - 2 * pad);
  return (
    <div className="multiples">
      {DOMAINS.map((d) => {
        const s = series[d] ?? [];
        const isFlag = flagged.includes(d);
        const segs: string[] = [];
        let cur = "";
        s.forEach((v, i) => {
          if (v === null || v === undefined) {
            if (cur) segs.push(cur);
            cur = "";
          } else cur += `${cur ? "L" : "M"}${x(i).toFixed(1)},${y(v).toFixed(1)}`;
        });
        if (cur) segs.push(cur);
        const firstIdx = s.findIndex((v) => v !== null && v !== undefined);
        const first = firstIdx >= 0 ? (s[firstIdx] as number) : null;
        const ref =
          first !== null
            ? `M${x(firstIdx).toFixed(1)},${y(first).toFixed(1)}L${x(weeks - 1).toFixed(1)},${y(first + referenceSlope * (weeks - 1 - firstIdx)).toFixed(1)}`
            : "";
        return (
          <div className="multiple" key={d}>
            <span className={`multiple-label${isFlag ? " flagged" : ""}`}>
              {domainLabel(d)}
              {isFlag ? <span className="flag-note">{L("стоит обсудить", "worth discussing")}</span> : null}
            </span>
            <span className="multiple-plot" style={{ "--i": DOMAINS.indexOf(d) } as CSSProperties}>
            <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" aria-hidden="true">
              <rect x="0" y="0" width={W} height={H} fill="var(--surface)" stroke="var(--line)" vectorEffect="non-scaling-stroke" rx="6" />
              {ref ? <path d={ref} fill="none" stroke="var(--ink-3)" strokeWidth="1" strokeDasharray="4 3" vectorEffect="non-scaling-stroke" /> : null}
              {segs.map((p, i) => (
                <path
                  key={i}
                  d={p}
                  fill="none"
                  stroke={isFlag ? "var(--attention-line)" : "var(--info, var(--accent))"}
                  strokeWidth={isFlag ? 2.5 : 1.5}
                  strokeLinejoin="round"
                  strokeLinecap="round"
                  vectorEffect="non-scaling-stroke"
                />
              ))}
            </svg>
            <span className="draw-mask" aria-hidden="true" />
            </span>
          </div>
        );
      })}
      <div className="multiple multiple-axis" aria-hidden="true">
        <span />
        <span className="axis-row">
          <span>{L("неделя 1", "week 1")}</span>
          <span>{L("неделя", "week")} {weeks}</span>
        </span>
      </div>
    </div>
  );
}

/** Пять тонких полосок предсказанной нагрузки: цель акцентом, избегаемые охрой. */
export function LoadBars({ load, target, avoid }: { load: Partial<Record<Domain, number>>; target: Domain; avoid: Domain[] }) {
  return (
    <div className="load-bars">
      {DOMAINS.map((d) => {
        const v = load[d] ?? 0;
        const cls = d === target ? " target" : avoid.includes(d) ? " avoid" : "";
        return (
          <div className={`load-bar${cls}`} key={d}>
            <span>{domainLabel(d)}</span>
            <span className="track" aria-hidden="true">
              <span className="fill" style={{ display: "block", width: `${Math.round(v * 100)}%` }} />
            </span>
            <span style={{ textAlign: "right" }}>{num(v, 2)}</span>
          </div>
        );
      })}
    </div>
  );
}
