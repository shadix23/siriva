// Очередь отправки записей (раздел 11.5): запись лежит в IndexedDB до ответа 200.
// Повторная отправка безопасна: сервер заменяет результат того же упражнения и фазы.
import { api, ApiError } from "./api/client";
import { ensureSession, forgetSession, isStaleSession } from "./session";
import type { Lang, SpeechResult } from "./api/types";

export interface QueuedUpload {
  id: string;
  patient_id: string;
  session_id: string;
  exercise_id: string;
  item_key: string;
  phase?: "immediate" | "delayed";
  story_id?: string;
  picture_id?: string;
  category?: string;
  language: Lang;
  blob: Blob;
  mime: string;
  created_at: string;
  attempts: number;
  last_error?: string;
  /** запись не принята сервером (413, 422): повтор не поможет */
  rejected?: boolean;
}

const DB = "es-uploads";
const STORE = "uploads";
let memoryFallback: QueuedUpload[] | null = null;

function openDb(): Promise<IDBDatabase | null> {
  return new Promise((resolve) => {
    try {
      if (!("indexedDB" in window)) return resolve(null);
      const req = indexedDB.open(DB, 1);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE, { keyPath: "id" });
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

async function tx<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T | null> {
  const db = await openDb();
  if (!db) return null;
  return new Promise((resolve, reject) => {
    const t = db.transaction(STORE, mode);
    const req = fn(t.objectStore(STORE));
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

const listeners = new Set<() => void>();
export function onQueueChange(fn: () => void) {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}
const emit = () => listeners.forEach((fn) => fn());

export async function enqueue(u: QueuedUpload): Promise<void> {
  const ok = await tx("readwrite", (s) => s.put(u)).catch(() => null);
  if (ok === null) {
    memoryFallback = (memoryFallback ?? []).filter((x) => x.id !== u.id).concat(u);
  }
  emit();
}

export async function listQueue(patientId?: string): Promise<QueuedUpload[]> {
  const all = ((await tx("readonly", (s) => s.getAll()).catch(() => null)) as QueuedUpload[] | null) ?? [];
  const merged = [...all, ...(memoryFallback ?? [])].sort((a, b) => a.created_at.localeCompare(b.created_at));
  return patientId ? merged.filter((u) => u.patient_id === patientId) : merged;
}

export async function removeFromQueue(id: string): Promise<void> {
  await tx("readwrite", (s) => s.delete(id)).catch(() => null);
  if (memoryFallback) memoryFallback = memoryFallback.filter((x) => x.id !== id);
  emit();
}

export async function clearQueue(patientId?: string): Promise<void> {
  const items = await listQueue(patientId);
  for (const it of items) await removeFromQueue(it.id);
}

async function update(u: QueuedUpload) {
  await enqueue(u);
}

const inflight = new Map<string, Promise<SendOutcome>>();

export type SendOutcome =
  | { ok: true; result: SpeechResult }
  | { ok: false; error: ApiError };

/** Одна попытка отправки. Запись удаляется из очереди только после ответа 200. */
export function sendOnce(item: QueuedUpload): Promise<SendOutcome> {
  let u = item;
  const existing = inflight.get(u.id);
  if (existing) return existing;
  const p = (async (): Promise<SendOutcome> => {
    try {
      const ext = u.mime.includes("mp4") ? "m4a" : u.mime.includes("ogg") ? "ogg" : "webm";
      // Запись сохранили без сессии (сервер был недоступен): сессия создаётся при отправке.
      if (!u.session_id) {
        u = { ...u, session_id: await ensureSession(u.patient_id) };
        await update(u);
      }
      const upload = (sid: string) => api.uploadAudio(sid, u.exercise_id, {
        file: u.blob,
        filename: `${u.item_key.replace(":", "-")}.${ext}`,
        language: u.language,
        phase: u.phase,
        story_id: u.story_id,
        picture_id: u.picture_id,
        category: u.category,
      });
      let result;
      try {
        result = await upload(u.session_id);
      } catch (e) {
        if (!isStaleSession(e)) throw e;
        // Сервер не знает эту сессию (демо-данные пересозданы): новая сессия и одна повторная отправка.
        forgetSession(u.patient_id, u.session_id);
        u = { ...u, session_id: await ensureSession(u.patient_id) };
        await update(u);
        result = await upload(u.session_id);
      }
      await removeFromQueue(u.id);
      return { ok: true, result };
    } catch (e) {
      const error = e instanceof ApiError ? e : new ApiError(0, "network", String(e));
      const rejected = !error.retryable && error.code !== "immediate_missing";
      await update({ ...u, attempts: u.attempts + 1, last_error: error.code, rejected });
      return { ok: false, error };
    } finally {
      inflight.delete(u.id);
    }
  })();
  inflight.set(u.id, p);
  return p;
}

/** Отправка в фоне: попытка, при сбое сети или 5xx один повтор через 5 секунд. */
export async function sendWithRetry(u: QueuedUpload, delayMs = 5000): Promise<SendOutcome> {
  const first = await sendOnce(u);
  if (first.ok || !first.error.retryable) return first;
  await new Promise((r) => setTimeout(r, delayMs));
  const fresh = (await listQueue()).find((x) => x.id === u.id);
  if (!fresh) return first;
  return sendOnce(fresh);
}

/** Отправить всё, что ждёт, по порядку (пересказ сразу раньше отложенного). */
export async function flushQueue(patientId?: string): Promise<{ sent: number; failed: number }> {
  let sent = 0;
  let failed = 0;
  for (const u of await listQueue(patientId)) {
    if (u.rejected) {
      failed++;
      continue;
    }
    const r = await sendOnce(u);
    if (r.ok) sent++;
    else failed++;
  }
  return { sent, failed };
}
