"use client";
import { useCallback, useEffect, useState } from "react";
import { api, ApiError } from "./api/client";
import type { Program } from "./api/types";
import { buildProgram, DELAYED_ID, PLAYABLE_IDS, type ProgramModel } from "./exercises";
import { today, type TodayState } from "./storage";
import { listQueue, onQueueChange, type QueuedUpload } from "./upload-queue";
import { forgetSession, isStaleSession } from "./session";

export interface TodayData {
  program: Program | null;
  state: TodayState;
  queue: QueuedUpload[];
  model: ProgramModel;
}

async function fetchProgram(pid: string, sessionId?: string): Promise<Program | null> {
  // Первый день: данных для профиля ещё нет, программа по умолчанию (три речевых упражнения).
  // Сначала спрашиваем профиль, чтобы ожидаемый 409 не засорял консоль браузера.
  const prof = await api.profile(pid).catch(() => null);
  if (prof && !prof.has_data) return null;
  try {
    // 409 no_profile_yet тоже означает первый день.
    return await api.programToday(pid, { only: [...PLAYABLE_IDS], sessionId });
  } catch (e) {
    // Сохранённая сессия устарела (демо-данные пересоздаются при запуске сервера): забываем и повторяем без неё.
    if (sessionId && isStaleSession(e)) {
      forgetSession(pid, sessionId);
      return fetchProgram(pid);
    }
    if (e instanceof ApiError && e.code === "no_profile_yet") return null;
    // Старый сервер без ?only= или ?session_id=: пробуем без параметров.
    if (e instanceof ApiError && (e.code === "invalid_only" || e.code === "validation_error")) {
      try {
        return await api.programToday(pid);
      } catch (e2) {
        if (e2 instanceof ApiError && e2.code === "no_profile_yet") return null;
        throw e2;
      }
    }
    throw e;
  }
}

/** Программа на сегодня + локальное состояние + очередь отправки. */
export function useToday(pid: string | null) {
  const [data, setData] = useState<TodayData | null>(null);
  const [error, setError] = useState<ApiError | null>(null);
  const [loading, setLoading] = useState(true);
  const [now, setNow] = useState(() => Date.now());

  const load = useCallback(async () => {
    if (!pid) return;
    setLoading(true);
    setError(null);
    try {
      const [program, queue] = await Promise.all([fetchProgram(pid, today.read(pid).session_id), listQueue(pid)]);
      let state = today.read(pid);
      let model = buildProgram(program, state, queue);
      if (!state.program_ids?.length && model.rows.length) {
        // Состав программы на день фиксируется при первом показе.
        state = today.update(pid, (s) => ({ ...s, program_ids: model.rows.filter((r) => r.itemId !== DELAYED_ID).map((r) => r.exerciseId) }));
        model = buildProgram(program, state, queue);
      }
      setData({ program, state, queue, model });
    } catch (e) {
      setError(e instanceof ApiError ? e : new ApiError(0, "unknown", String(e)));
    } finally {
      setLoading(false);
    }
  }, [pid]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- загрузка программы при монтировании
    load();
  }, [load]);

  // Пересчёт статусов: очередь изменилась или подошло время второй части пересказа.
  const recompute = useCallback(async () => {
    if (!pid) return;
    const queue = await listQueue(pid);
    setData((d) => {
      if (!d) return d;
      const state = today.read(pid);
      return { ...d, state, queue, model: buildProgram(d.program, state, queue) };
    });
  }, [pid]);

  useEffect(() => onQueueChange(() => void recompute()), [recompute]);
  useEffect(() => {
    const id = setInterval(() => {
      setNow(Date.now());
      void recompute();
    }, 15_000);
    return () => clearInterval(id);
  }, [recompute]);

  return { data, error, loading, reload: load, recompute, now };
}
