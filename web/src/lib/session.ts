// Одна сессия на занятие: создаётся лениво, при первой отправке записи, ответа или телеметрии,
// а не при открытии упражнения (без пустых сессий, VERIFY-1 V-11). Параллельные вызовы ждут один запрос.
import { api, ApiError } from "./api/client";
import { today } from "./storage";

const inflight = new Map<string, Promise<string>>();

export function ensureSession(patientId: string): Promise<string> {
  const existing = today.read(patientId).session_id;
  if (existing) return Promise.resolve(existing);
  let p = inflight.get(patientId);
  if (p) return p;
  p = api
    .startSession(patientId)
    .then((s) => {
      today.update(patientId, (x) => ({ ...x, session_id: s.session_id }));
      return s.session_id;
    })
    .finally(() => inflight.delete(patientId));
  inflight.set(patientId, p);
  return p;
}

const completing = new Set<string>();

/** Закрыть сессию дня один раз (с «На сегодня всё» или с «Сегодня», когда всё сделано). */
export function completeSessionOnce(patientId: string): void {
  const st = today.read(patientId);
  const sid = st.session_id;
  if (!sid || st.completed || completing.has(sid)) return;
  completing.add(sid);
  api.completeSession(sid).then(
    () => today.update(patientId, (s) => ({ ...s, completed: true })),
    (e) => {
      completing.delete(sid);
      // Сессии уже нет на сервере: закрывать нечего, просто забываем её.
      if (isStaleSession(e)) forgetSession(patientId, sid);
    },
  );
}

/** Сессия из localStorage больше не существует на сервере (демо-данные пересозданы). */
export function forgetSession(patientId: string, sid?: string) {
  today.update(patientId, (s) => {
    if (!sid || s.session_id === sid) {
      delete s.session_id;
      s.completed = false;
    }
    return s;
  });
}

export const isStaleSession = (e: unknown) => e instanceof ApiError && e.code === "session_not_found";

/**
 * Выполнить запрос с сессией дня. Если сервер не знает сохранённую сессию (404 session_not_found),
 * сохранённая сессия забывается, создаётся новая, запрос повторяется один раз.
 */
export async function withSession<T>(patientId: string, fn: (sid: string) => Promise<T>): Promise<T> {
  const sid = await ensureSession(patientId);
  try {
    return await fn(sid);
  } catch (e) {
    if (!isStaleSession(e)) throw e;
    forgetSession(patientId, sid);
    return fn(await ensureSession(patientId));
  }
}
