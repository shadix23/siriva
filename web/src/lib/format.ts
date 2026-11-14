// Числа для интерфейса: десятичная запятая, неразрывный пробел перед единицей.
const NBSP = " ";

export function num(v: number | null | undefined, digits = 1): string {
  if (v === null || v === undefined || Number.isNaN(v)) return "-";
  return v.toFixed(digits).replace(".", ",").replace("-", "−");
}

export const secs = (v: number | null | undefined, digits = 1) =>
  v === null || v === undefined ? "-" : `${num(v, digits)}${NBSP}с`;

export const percent = (frac: number | null | undefined) =>
  frac === null || frac === undefined ? "-" : `${Math.round(frac * 100)}${NBSP}%`;

/** 0:47 */
export function clock(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

/** Время дня 14:35 по локальному времени устройства. */
export function hhmm(iso: string | number | Date): string {
  const d = new Date(iso);
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

/** Локальная дата YYYY-MM-DD (не UTC). */
export function localDay(d = new Date()): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** Значение микрометрики с единицей по ключу. */
export function metricValue(key: string, v: number | null | undefined): string {
  if (v === null || v === undefined) return "-";
  switch (key) {
    case "pause_before_content_mean":
    case "first_word_latency":
    case "time_to_first_action_s":
      return secs(v);
    case "retell_retention":
    case "pause_ratio":
    case "pronoun_share":
      return percent(v);
    case "fluency_count":
    case "speech_rate_wpm":
      return String(Math.round(v));
    case "mattr":
      return num(v, 2);
    default:
      return num(v, 2);
  }
}
