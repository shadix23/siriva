// Локальное состояние на устройстве. Любой доступ к localStorage может бросить
// (приватное окно, запрет сайта), поэтому все обращения в try/catch.
import type { Lang } from "./api/types";
import { localDay } from "./format";

function get(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}
function set(key: string, value: string | null) {
  try {
    if (value === null) window.localStorage.removeItem(key);
    else window.localStorage.setItem(key, value);
  } catch {
    /* хранилище недоступно: работаем без него */
  }
}
function getJSON<T>(key: string): T | null {
  const raw = get(key);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}


export const store = {
  patientId: () => get("es.patient"),
  setPatientId: (id: string | null) => set("es.patient", id),


  lang: (): Lang => (get("es.lang") === "en" ? "en" : "ru"),
  setLang: (l: Lang) => set("es.lang", l),

  micCheckedToday: () => get("es.mic_checked") === localDay(),
  setMicChecked: (ok: boolean) => set("es.mic_checked", ok ? localDay() : null),

  /** Журнал «показан текст рассказа» для разбора на демо (дублирует телеметрию). */
  logStoryText: (entry: Record<string, unknown>) => {
    const list = getJSON<unknown[]>("es.story_text_log") ?? [];
    list.push(entry);
    set("es.story_text_log", JSON.stringify(list.slice(-50)));
  },
};

/** Состояние сегодняшнего занятия (раздел 11.4 спецификации). */
export interface TodayState {
  session_id?: string;
  /** ключ пункта -> время, когда запись сохранена на устройстве */
  done: Record<string, string>;
  /** ключ пункта -> время, когда упражнение пропущено сегодня (например, нет микрофона) */
  skipped?: Record<string, string>;
  /** состав программы на сегодня фиксируется при первом показе, чтобы список не менялся посреди дня */
  program_ids?: string[];
  story_id?: string;
  story_lang?: Lang;
  /** когда откроется вторая часть пересказа (ISO, от сервера или своё) */
  delayed_available_at?: string;
  completed?: boolean;
  /** только демо: ожидание пропущено */
  demo_skip_wait?: boolean;
}

const todayKey = (pid: string, day = localDay()) => `es.today.${pid}.${day}`;

export const today = {
  read: (pid: string): TodayState => getJSON<TodayState>(todayKey(pid)) ?? { done: {} },
  write: (pid: string, s: TodayState) => set(todayKey(pid), JSON.stringify(s)),
  update: (pid: string, fn: (s: TodayState) => TodayState | void): TodayState => {
    const cur = today.read(pid);
    const next = fn(cur) ?? cur;
    today.write(pid, next);
    return next;
  },
  clearAll: () => {
    try {
      const keys: string[] = [];
      for (let i = 0; i < window.localStorage.length; i++) {
        const k = window.localStorage.key(i);
        if (k && (k.startsWith("es.today.") || k === "es.story_text_log")) keys.push(k);
      }
      keys.forEach((k) => window.localStorage.removeItem(k));
    } catch {
      /* ничего */
    }
  },
};
