// Типизированный клиент Es API. Пути и формы ответов по es/docs/API-CONTRACT.md.
import type {
  BypassScenario,
  DeleteResult,
  DemoNumbers,
  DemoPatient,
  ExercisesResponse,
  Health,
  Lang,
  Patient,
  PatientIn,
  PatientPatch,
  Picture,
  Profile,
  Program,
  ResultIn,
  ResultOut,
  Session,
  SessionDetail,
  SpeechResult,
  Story,
  TelemetryEvent,
  TelemetryOut,
  Trajectory,
  TranscriptIn,
} from "./types";
import { FIXTURE_NUMBERS } from "./fixtures";

export const API_BASE = process.env.NEXT_PUBLIC_ES_API ?? "/api";

/** Ошибка API или сети. Текст пациенту выбирается по `code`, `message` только для ведущего демо. */
export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public details?: unknown,
  ) {
    super(message);
    this.name = "ApiError";
  }
  /** Сеть, таймаут или 5xx: имеет смысл повторить ту же отправку. */
  get retryable(): boolean {
    return this.status === 0 || this.status >= 500 || this.code === "timeout";
  }
}

interface RequestOpts {
  method?: string;
  body?: unknown;
  form?: FormData;
  timeoutMs?: number;
  signal?: AbortSignal;
}

async function request<T>(path: string, opts: RequestOpts = {}): Promise<T> {
  const ctrl = new AbortController();
  const timeout = setTimeout(() => ctrl.abort("timeout"), opts.timeoutMs ?? 15_000);
  const onAbort = () => ctrl.abort("aborted");
  opts.signal?.addEventListener("abort", onAbort);
  let res: Response;
  try {
    res = await fetch(`${API_BASE}${path}`, {
      method: opts.method ?? (opts.body || opts.form ? "POST" : "GET"),
      headers: opts.body !== undefined ? { "Content-Type": "application/json" } : undefined,
      body: opts.form ?? (opts.body !== undefined ? JSON.stringify(opts.body) : undefined),
      signal: ctrl.signal,
      cache: "no-store",
    });
  } catch (e) {
    const reason = ctrl.signal.reason;
    if (reason === "timeout") throw new ApiError(0, "timeout", "Сервер не ответил вовремя");
    if (reason === "aborted") throw new ApiError(0, "aborted", "Запрос отменён");
    throw new ApiError(0, "network", e instanceof Error ? e.message : "Нет связи с сервером");
  } finally {
    clearTimeout(timeout);
    opts.signal?.removeEventListener("abort", onAbort);
  }
  const text = await res.text();
  let data: unknown = null;
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = null;
    }
  }
  if (!res.ok) {
    const err = (data as { error?: { code?: string; message?: string; details?: unknown } } | null)?.error;
    // Прокси Next отвечает 500 без тела, если бэкенд не запущен.
    const code = err?.code ?? (res.status >= 500 ? "server_unavailable" : `http_${res.status}`);
    throw new ApiError(res.status, code, err?.message ?? res.statusText, err?.details);
  }
  return data as T;
}

const enc = encodeURIComponent;

export const api = {
  health: (signal?: AbortSignal) => request<Health>("/health", { timeoutMs: 4000, signal }),
  exercises: () => request<ExercisesResponse>("/exercises"),
  stories: (language?: Lang) =>
    request<{ stories: Story[] }>(`/stories${language ? `?language=${language}` : ""}`),

  createPatient: (body: PatientIn) => request<Patient>("/patients", { body }),
  patient: (id: string) => request<Patient>(`/patients/${enc(id)}`),
  patchPatient: (id: string, body: PatientPatch) =>
    request<Patient>(`/patients/${enc(id)}`, { method: "PATCH", body }),
  deletePatient: (id: string) => request<DeleteResult>(`/patients/${enc(id)}`, { method: "DELETE" }),

  startSession: (patientId: string, day?: string) =>
    request<Session>(`/patients/${enc(patientId)}/sessions`, { body: day ? { day } : {} }),
  session: (sid: string) => request<SessionDetail>(`/sessions/${enc(sid)}`),
  pictures: () => request<{ pictures: Picture[] }>("/pictures"),
  completeSession: (sid: string) =>
    request<{ session_id: string; completed: boolean }>(`/sessions/${enc(sid)}/complete`, { body: {} }),

  uploadAudio: (
    sid: string,
    exerciseId: string,
    fields: {
      file: Blob;
      filename: string;
      language: Lang;
      phase?: "immediate" | "delayed";
      story_id?: string;
      picture_id?: string;
      category?: string;
    },
    signal?: AbortSignal,
  ) => {
    const form = new FormData();
    form.append("file", fields.file, fields.filename);
    form.append("language", fields.language);
    if (fields.phase) form.append("phase", fields.phase);
    if (fields.story_id) form.append("story_id", fields.story_id);
    if (fields.picture_id) form.append("picture_id", fields.picture_id);
    if (fields.category) form.append("category", fields.category);
    return request<SpeechResult>(`/sessions/${enc(sid)}/exercises/${enc(exerciseId)}/audio`, {
      form,
      timeoutMs: 60_000,
      signal,
    });
  },
  uploadTranscript: (sid: string, exerciseId: string, body: TranscriptIn) =>
    request<SpeechResult>(`/sessions/${enc(sid)}/exercises/${enc(exerciseId)}/transcript`, {
      body,
      timeoutMs: 30_000,
    }),
  postResult: (sid: string, exerciseId: string, body: ResultIn) =>
    request<ResultOut>(`/sessions/${enc(sid)}/exercises/${enc(exerciseId)}/result`, { body }),
  telemetry: (sid: string, events: TelemetryEvent[]) =>
    request<TelemetryOut>(`/sessions/${enc(sid)}/telemetry`, { body: { events } }),

  profile: (id: string) => request<Profile>(`/patients/${enc(id)}/profile`),
  programToday: (id: string, opts: { only?: string[]; target?: string; sessionId?: string } = {}) => {
    const q = new URLSearchParams();
    if (opts.only?.length) q.set("only", opts.only.join(","));
    if (opts.target) q.set("target", opts.target);
    if (opts.sessionId) q.set("session_id", opts.sessionId);
    const qs = q.toString();
    return request<Program>(`/patients/${enc(id)}/program/today${qs ? `?${qs}` : ""}`);
  },
  trajectory: (id: string) => request<Trajectory>(`/patients/${enc(id)}/trajectory`),

  demoPatients: () => request<{ patients: DemoPatient[] }>("/demo/patients"),
  bypassScenario: () => request<BypassScenario>("/demo/bypass-scenario"),
  demoReset: () => request<{ reset: boolean; patients: string[] }>("/demo/reset", { body: {} }),
  /** Р12. Если эндпоинта нет (404), отдаём статичную заглушку со статусом pending. */
  demoNumbers: async (): Promise<DemoNumbers & { fromFixture?: boolean }> => {
    try {
      return await request<DemoNumbers>("/demo/numbers");
    } catch (e) {
      if (e instanceof ApiError && (e.status === 404 || e.status === 405)) {
        return { ...FIXTURE_NUMBERS, fromFixture: true };
      }
      throw e;
    }
  },
};
