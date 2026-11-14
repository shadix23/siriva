"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { api, ApiError } from "./api/client";
import type { Health, Patient } from "./api/types";
import { store } from "./storage";

export type Load<T> =
  | { state: "loading" }
  | { state: "ready"; data: T }
  | { state: "error"; error: ApiError };

/** Простой загрузчик: перезапуск по reload(). */
export function useLoad<T>(fn: () => Promise<T>, deps: unknown[]): [Load<T>, () => void] {
  const [st, setSt] = useState<Load<T>>({ state: "loading" });
  const [n, setN] = useState(0);
  const fnRef = useRef(fn);
  useEffect(() => {
    fnRef.current = fn;
  });
  useEffect(() => {
    let alive = true;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- сброс в «загрузку» при смене ключа запроса
    setSt({ state: "loading" });
    fnRef.current().then(
      (data) => alive && setSt({ state: "ready", data }),
      (e) => alive && setSt({ state: "error", error: e instanceof ApiError ? e : new ApiError(0, "unknown", String(e)) }),
    );
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, n]);
  return [st, useCallback(() => setN((x) => x + 1), [])];
}

/**
 * Текущий пациент: из адреса (?patient=demo-trend, удобно для демо и проверки) или из localStorage.
 * Адресный параметр запоминается как текущий пациент.
 */
export function resolvePatientId(): string | null {
  try {
    const q = new URLSearchParams(window.location.search).get("patient");
    if (q) {
      store.setPatientId(q);
      return q;
    }
  } catch {
    /* ничего */
  }
  return store.patientId();
}

export function usePatient(): { id: string | null; patient: Load<Patient> | null; reload: () => void } {
  const [id] = useState(() => resolvePatientId());
  const [load, reload] = useLoad(() => (id ? api.patient(id) : Promise.reject(new ApiError(404, "no_patient", ""))), [id]);
  return { id, patient: id ? load : null, reload };
}

/** Опрос /health раз в 10 секунд (баннер X1 и индикатор демо). */
export function useHealth(intervalMs = 10_000) {
  const [health, setHealth] = useState<Health | null>(null);
  const [down, setDown] = useState(false);
  const [checking, setChecking] = useState(false);
  const check = useCallback(async () => {
    setChecking(true);
    try {
      const h = await api.health();
      setHealth(h);
      setDown(false);
    } catch {
      setDown(true);
    } finally {
      setChecking(false);
    }
  }, []);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- первая проверка сервера при монтировании
    check();
    const id = setInterval(check, intervalMs);
    return () => clearInterval(id);
  }, [check, intervalMs]);
  return { health, down, checking, check };
}

export function usePrefersReducedMotion(): boolean {
  const [r, setR] = useState(() => typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches);
  useEffect(() => {
    const m = window.matchMedia("(prefers-reduced-motion: reduce)");
    const on = () => setR(m.matches);
    m.addEventListener("change", on);
    return () => m.removeEventListener("change", on);
  }, []);
  return r;
}
