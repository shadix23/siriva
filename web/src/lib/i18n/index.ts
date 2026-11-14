import ru from "./ru.json";
import type { Domain } from "../api/types";

export type MsgKey = keyof typeof ru;

/** Текст из словаря ru.json с подстановкой {параметров}. */
export function t(key: MsgKey, params?: Record<string, string | number>): string {
  let s: string = ru[key] ?? key;
  if (params) {
    for (const [k, v] of Object.entries(params)) s = s.split(`{${k}}`).join(String(v));
  }
  return s;
}

export const domainLabel = (d: Domain) => t(`domain.${d}` as MsgKey);

/** Русские формы множественного числа: 1 день, 2 дня, 5 дней. */
export function plural(n: number, one: string, few: string, many: string): string {
  const m10 = n % 10;
  const m100 = n % 100;
  if (m10 === 1 && m100 !== 11) return one;
  if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return few;
  return many;
}

const NUM_WORDS_F = ["ноль", "одно", "два", "три", "четыре", "пять", "шесть"];

/** «три упражнения», «одно упражнение», «5 упражнений» */
export function exercisesCount(n: number): string {
  const word = plural(n, "упражнение", "упражнения", "упражнений");
  return `${n < NUM_WORDS_F.length ? NUM_WORDS_F[n] : n} ${word}`;
}

/** «около 1 минуты», «около 2 минут», «около 21 минуты» (после «около» родительный падеж) */
export const minutesAbout = (n: number) => `${n}\u00a0${n % 10 === 1 && n % 100 !== 11 ? "минуты" : "минут"}`;

export const daysCount = (n: number) => `${n} ${plural(n, "день", "дня", "дней")}`;
export const weeksCount = (n: number) => `${n} ${plural(n, "неделю", "недели", "недель")}`;
