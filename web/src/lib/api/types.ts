// Типы по контракту es/docs/API-CONTRACT.md (v0.1, поля v0.2 помечены как необязательные).

export type Lang = "ru" | "en";

export const DOMAINS = [
  "episodic_memory",
  "word_access",
  "phrase_building",
  "attention",
  "processing_speed",
] as const;
export type Domain = (typeof DOMAINS)[number];

export type DomainScores = Partial<Record<Domain, number | null>>;

export interface ApiErrorBody {
  error: { code: string; message: string; details?: unknown };
}

export interface Health {
  status: "ok" | string;
  load_source: string;
  load_is_placeholder: boolean;
  languages: Lang[];
  transcriber: string;
  /** v0.2 (Р11): модель распознавания загружена */
  transcriber_ready?: boolean;
  transcriber_engine?: string;
}

export type Channel =
  | "speech"
  | "reading"
  | "visual"
  | "spatial"
  | "auditory"
  | "auditory_visual"
  | "auditory_motor"
  | "motor";

export interface Exercise {
  id: string;
  kind: string;
  channel: Channel;
  title: string;
  duration_min: number;
  measures: boolean;
  speech_output: boolean;
  dose?: number;
  predicted_load: Record<Domain, number>;
  /** v0.2 (Р15): у упражнения есть экран во frontend */
  playable?: boolean;
  [key: string]: unknown;
}

export interface ExercisesResponse {
  matrix: {
    source: string;
    is_placeholder: boolean;
    model_version: string | null;
    atlas: string | null;
    domains: Domain[];
    domain_notes?: Record<string, string>;
  };
  exercises: Exercise[];
}

export interface Story {
  id: string;
  language: Lang;
  title: string;
  text: string;
  units_total?: number;
}

export interface Patient {
  id: string;
  label: string | null;
  language: Lang;
  consent_voice: boolean;
  is_demo: boolean;
  created_at: string;
  /** v0.2 (Р7) */
  consent_share?: boolean;
  consent_version?: string | null;
  consent_at?: string | null;
}

export interface PatientIn {
  language: Lang;
  label?: string | null;
  consent_voice: boolean;
  consent_share?: boolean;
  consent_version?: string;
}

export interface PatientPatch {
  consent_voice?: boolean;
  consent_share?: boolean;
  consent_version?: string;
}

export interface DeleteResult {
  deleted: boolean;
  patient_id: string;
  removed: Record<string, number>;
}

export interface Session {
  session_id: string;
  patient_id: string;
  day: string;
  started_at: string;
}

export interface Word {
  text: string;
  start: number;
  end: number;
}

export interface Transcript {
  text: string;
  language: Lang;
  duration: number;
  engine: string;
  words: Word[];
}

export type Features = Record<string, number | number[] | string[] | string | null | undefined>;

export interface SpeechResult {
  session_id: string;
  exercise_id: string;
  phase: "single" | "immediate" | "delayed";
  language: Lang;
  engine: string;
  transcript: Transcript;
  features: Features;
  session_features?: Record<string, number>;
  transcript_stored: boolean;
  /** v0.2 (Р4): когда откроется пересказ через 20 минут (ISO, UTC) */
  delayed_available_at?: string | null;
}

export interface TranscriptIn {
  language: Lang;
  words: Word[];
  duration?: number;
  phase?: "immediate" | "delayed" | null;
  story_id?: string | null;
  picture_id?: string | null;
  category?: "animals";
}

export interface ResultIn {
  accuracy: number;
  duration_s?: number;
}

export interface ResultOut {
  exercise_id: string;
  difficulty_domain: Domain;
  difficulty_before: number;
  difficulty_after: number;
  target_accuracy: [number, number];
}

export type TelemetryType =
  | "first_action"
  | "pause"
  | "hint"
  | "interrupt"
  | "answer"
  // v0.2 (Р5)
  | "hint_offered"
  | "hint_used"
  | "story_replayed"
  | "story_text_shown"
  | "mic_error"
  | "stop_reason";

export interface TelemetryEvent {
  type: TelemetryType;
  t: number;
  value?: number;
  exercise_id?: string;
  meta?: Record<string, string | number | boolean>;
}

export interface TelemetryOut {
  accepted: number;
  session_features: Record<string, number>;
}

export interface Contribution {
  feature: string;
  value: number;
  normalised: number;
  weight: number;
}

export interface DomainProfile {
  label_ru: string;
  score: number | null;
  coverage: number;
  reduced: boolean;
  contributions: Contribution[];
}

export interface Profile {
  patient_id: string;
  domains: Record<Domain, DomainProfile>;
  reduced_threshold: number;
  calibration: string;
  note: string;
  has_data: boolean;
  sessions_used: number;
  window_days: number;
  as_of: string;
  features?: Record<string, number>;
}

export type ProgramItemStatus =
  | "done"
  | "next"
  | "later"
  | "waiting_delay"
  | "ready_delayed"
  | "upload_pending"
  | "in_progress";

export interface ProgramItem {
  exercise_id: string;
  kind: string;
  channel: Channel;
  title: string;
  duration_min: number;
  speech_output: boolean;
  difficulty?: number;
  difficulty_domain?: Domain;
  score?: number;
  dose?: number;
  predicted_load: Record<Domain, number>;
  rationale?: string;
  /** v0.2 (Р6): код вместо готового текста */
  rationale_code?: string;
  rationale_params?: Record<string, unknown>;
  /** v0.2 (Р3): статус при передаче session_id */
  status?: "done" | "available" | "waiting";
  done_at?: string | null;
  /** для story_retell: какая часть сейчас актуальна */
  part?: "immediate" | "delayed" | null;
  available_at?: string | null;
  playable?: boolean;
}

export interface Program {
  patient_id: string;
  profile_scores: DomainScores;
  target_domain: Domain;
  target_label: string;
  avoid_domains: Domain[];
  avoid_labels: string[];
  lambda?: number;
  dose_budget?: number;
  dose_total?: number;
  items: ProgramItem[];
  naive_item_ids: string[];
  differs_from_naive: boolean;
  load_source: string;
  summary: string;
  summary_code?: string;
  summary_params?: Record<string, unknown>;
  /** v0.2 (Р3), только при ?session_id= */
  next_exercise_id?: string | null;
  active_days_last_7?: number;
}

export interface TrajectoryWeek {
  week: number;
  start: string;
  end: string;
  sessions: number;
  scores: DomainScores;
  metrics: Record<string, number | null>;
}

export interface TrendFlag {
  active: boolean;
  level: "none" | "watch" | string;
  domains: Domain[];
  domain_labels?: string[];
  message?: string;
  code?: string;
  message_params?: Record<string, unknown>;
  reference_slope_per_week: number;
  per_domain?: Partial<
    Record<Domain, { weeks: number; slope_per_week: number; delta: number; flag: boolean }>
  >;
}

export interface Trajectory {
  patient_id: string;
  has_data: boolean;
  weeks: TrajectoryWeek[];
  series: Partial<Record<Domain, (number | null)[]>>;
  trend_flag: TrendFlag;
  labels_ru?: Partial<Record<Domain, string>>;
}

export interface DemoPatient extends Patient {
  sessions: number;
  profile_scores: DomainScores;
}

export interface BypassPatient {
  patient_id: string;
  label: string;
  profile_scores: DomainScores;
  program: Program;
}

export interface BypassScenario {
  target_domain: Domain;
  same_memory_score: boolean;
  programs_differ: boolean;
  patients: BypassPatient[];
  speech_exercises_a: string[];
  speech_exercises_b: string[];
  load_source: string;
  explanation: string;
  explanation_code?: string;
  explanation_params?: Record<string, unknown>;
}

export interface PictureUnit {
  id: string;
  kind: "person" | "action" | "object" | "setting" | "oddity" | string;
  label: string;
  label_en: string;
}

export interface Picture {
  id: string;
  title: string;
  title_en: string;
  image_file: string;
  units_total: number;
  units: PictureUnit[];
}

export interface SessionDetail {
  session_id: string;
  patient_id: string;
  day: string;
  started_at: string;
  completed_at: string | null;
  exercises: { exercise_id: string; phase: string; story_id: string | null; done_at: string }[];
  retell: {
    story_id: string;
    immediate_done_at: string;
    delayed_available_at: string | null;
    delayed_done_at: string | null;
  } | null;
  telemetry_events: number;
}

export interface NumbersBlock {
  status: "ready" | "pending" | string;
  accuracy?: number | null;
  test_n?: number | null;
  baseline?: number | null;
  value?: number | null;
  method?: string | null;
  note?: string | null;
}

export interface DemoNumbers {
  adress: NumbersBlock;
  agreement: NumbersBlock;
}
