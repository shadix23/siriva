// Упражнения, у которых есть экран во frontend (playable в контракте v0.2),
// и сборка строк программы «Сегодня» из ответа API и локального состояния.
import type { Lang, Program, ProgramItem } from "./api/types";
import { t, type MsgKey } from "./i18n";
import type { TodayState } from "./storage";
import type { QueuedUpload } from "./upload-queue";
import { hhmm } from "./format";

export const PLAYABLE_IDS = [
  "story_retell",
  "picture_description",
  "naming_fluency",
  "spatial_sequence_recall",
  "delayed_picture_recognition",
] as const;

export const DELAYED_ID = "story_retell-delayed";
export const DELAY_MINUTES = 20;

interface BaseDef {
  itemId: string;
  exerciseId: string;
  title: MsgKey;
  what: MsgKey;
  intro: MsgKey;
  duration: MsgKey;
  durationLabel: string;
  durationMin: number;
}

export interface SpeechDef extends BaseDef {
  kind: "speech";
  stimulus: "picture" | "category" | "story" | "story-delayed";
  phase?: "immediate" | "delayed";
  ready: MsgKey;
  recTitle: MsgKey;
  hints: MsgKey[];
  maxMs: number;
  timeoutText: MsgKey;
}

export interface GameDef extends BaseDef {
  kind: "game";
  game: "sequence" | "recognition";
}

export type ExerciseDef = SpeechDef | GameDef;

export const EXERCISES: Record<string, ExerciseDef> = {
  story_retell: {
    kind: "speech",
    itemId: "story_retell",
    exerciseId: "story_retell",
    stimulus: "story",
    phase: "immediate",
    title: "retell.title",
    what: "retell.what",
    intro: "retell.intro",
    duration: "retell.duration",
    durationLabel: "2-3 минуты",
    durationMin: 3,
    ready: "retell.ready",
    recTitle: "retell.rec_title",
    hints: ["retell.hint.1"],
    maxMs: 90_000,
    timeoutText: "rec.timeout_picture",
  },
  [DELAYED_ID]: {
    kind: "speech",
    itemId: DELAYED_ID,
    exerciseId: "story_retell",
    stimulus: "story-delayed",
    phase: "delayed",
    title: "retell.delayed_title",
    what: "retell.delayed_what",
    intro: "retell.delayed_intro",
    duration: "retell.duration",
    durationLabel: "1-1,5 минуты",
    durationMin: 1,
    ready: "retell.delayed_ready",
    recTitle: "retell.rec_title",
    hints: ["retell.hint.1"],
    maxMs: 90_000,
    timeoutText: "rec.timeout_picture",
  },
  picture_description: {
    kind: "speech",
    itemId: "picture_description",
    exerciseId: "picture_description",
    stimulus: "picture",
    title: "picture.title",
    what: "picture.what",
    intro: "picture.intro",
    duration: "picture.duration",
    durationLabel: "1-1,5 минуты",
    durationMin: 2,
    ready: "picture.ready",
    recTitle: "picture.rec_title",
    hints: ["picture.hint.1", "picture.hint.2", "picture.hint.3"],
    maxMs: 90_000,
    timeoutText: "rec.timeout_picture",
  },
  naming_fluency: {
    kind: "speech",
    itemId: "naming_fluency",
    exerciseId: "naming_fluency",
    stimulus: "category",
    title: "fluency.title",
    what: "fluency.what",
    intro: "fluency.intro",
    duration: "fluency.duration",
    durationLabel: "1 минута",
    durationMin: 1,
    ready: "fluency.ready",
    recTitle: "fluency.rec_title",
    hints: ["fluency.hint.1", "fluency.hint.2", "fluency.hint.3"],
    maxMs: 60_000,
    timeoutText: "rec.timeout_fluency",
  },
  spatial_sequence_recall: {
    kind: "game",
    game: "sequence",
    itemId: "spatial_sequence_recall",
    exerciseId: "spatial_sequence_recall",
    title: "seq.title",
    what: "seq.what",
    intro: "seq.intro",
    duration: "seq.duration",
    durationLabel: "Около 3 минут",
    durationMin: 3,
  },
  delayed_picture_recognition: {
    kind: "game",
    game: "recognition",
    itemId: "delayed_picture_recognition",
    exerciseId: "delayed_picture_recognition",
    title: "recog.title",
    what: "recog.what",
    intro: "recog.intro",
    duration: "recog.duration",
    durationLabel: "Около 3 минут",
    durationMin: 3,
  },
};

/** Картинки для описания (es/docs/PICTURES.md). Чередуются по дням. */
export const PICTURES = [
  { id: "bus-stop-rain", src: "/pictures/bus-stop-rain.jpg", scene: "остановка в дождь" },
  { id: "backyard-wind", src: "/pictures/backyard-wind.jpg", scene: "двор в ветреный день" },
];
export function pictureForToday(d = new Date()) {
  const dayNum = Math.floor(d.getTime() / 86_400_000);
  return PICTURES[dayNum % PICTURES.length];
}

export const STORY_BY_LANG: Record<Lang, string> = { ru: "apple-tree-ru", en: "lantern-keeper-en" };

/** Программа по умолчанию до первого профиля (409 no_profile_yet): три речевых упражнения. */
export const DEFAULT_ITEM_IDS = ["story_retell", "picture_description", "naming_fluency"];

export type RowStatus = "done" | "next" | "later" | "waiting_delay" | "ready_delayed" | "upload_pending" | "skipped";

export interface ProgramRow {
  itemId: string;
  exerciseId: string;
  title: string;
  what: string;
  durationLabel: string;
  status: RowStatus;
  /** время, когда откроется вторая часть пересказа */
  availableAt?: string;
  disabled: boolean;
  difficulty?: number;
}

export interface ProgramModel {
  rows: ProgramRow[];
  itemCount: number;
  minutes: number;
  activeDays?: number;
  primary: ProgramRow | null;
  allDone: boolean;
  delayedReady: boolean;
  waitingOnly: ProgramRow | null;
  pendingCount: number;
}

export function buildProgram(
  program: Program | null,
  state: TodayState,
  queue: QueuedUpload[],
  now = Date.now(),
): ProgramModel {
  type Item = Pick<ProgramItem, "exercise_id" | "duration_min" | "status" | "part" | "available_at" | "difficulty">;
  const fromServer = (id: string): Item =>
    program?.items.find((i) => i.exercise_id === id) ?? { exercise_id: id, duration_min: EXERCISES[id].durationMin };
  let items: Item[] = program?.items.filter((i) => EXERCISES[i.exercise_id]) ?? [];
  if (state.program_ids?.length) {
    items = state.program_ids.filter((id) => EXERCISES[id]).map(fromServer);
  } else if (!program) {
    items = DEFAULT_ITEM_IDS.map(fromServer);
  }
  // Пересказ первым: ожидание 20 минут заполнят другие упражнения.
  items = [...items].sort((a, b) => Number(b.exercise_id === "story_retell") - Number(a.exercise_id === "story_retell"));

  const pendingKeys = new Set(
    queue.filter((u) => u.session_id === state.session_id || !state.session_id || !u.session_id).map((u) => u.item_key),
  );
  const rows: ProgramRow[] = [];
  let retell: (typeof items)[number] | undefined;

  for (const it of items) {
    const def = EXERCISES[it.exercise_id];
    let done = Boolean(state.done[def.itemId]);
    if (it.exercise_id === "story_retell") {
      retell = it;
      done = done || it.part === "delayed" || (it.status === "done" && !it.part);
    } else {
      done = done || it.status === "done";
    }
    rows.push({
      itemId: def.itemId,
      exerciseId: def.exerciseId,
      title: t(def.title),
      what: `${t(def.what)}. ${def.durationLabel}`,
      durationLabel: def.durationLabel,
      status: pendingKeys.has(def.itemId) ? "upload_pending" : done ? "done" : state.skipped?.[def.itemId] ? "skipped" : "later",
      disabled: false,
      difficulty: it.difficulty,
    });
  }

  if (retell) {
    const def = EXERCISES[DELAYED_ID];
    const immediateDone = rows[0]?.status === "done" || rows[0]?.status === "upload_pending";
    const delayedDone = Boolean(state.done[DELAYED_ID]) || (retell.status === "done" && !retell.part);
    const immAt = state.done.story_retell;
    const availableAt =
      retell.available_at ??
      state.delayed_available_at ??
      (immAt ? new Date(new Date(immAt).getTime() + DELAY_MINUTES * 60_000).toISOString() : undefined);
    let status: RowStatus = "later";
    let disabled = true;
    let what = `${t(def.what)}. ${def.durationLabel}`;
    if (pendingKeys.has(DELAYED_ID)) {
      status = "upload_pending";
      disabled = false;
    } else if (delayedDone) {
      status = "done";
      disabled = false;
    } else if (state.skipped?.[DELAYED_ID]) {
      status = "skipped";
      disabled = !immediateDone;
    } else if (immediateDone && availableAt) {
      const ready = state.demo_skip_wait || now >= new Date(availableAt).getTime();
      status = ready ? "ready_delayed" : "waiting_delay";
      disabled = !ready;
      if (!ready) what = t("status.waiting_delay_hint", { time: hhmm(availableAt) });
    }
    rows.push({
      itemId: DELAYED_ID,
      exerciseId: "story_retell",
      title: t(def.title),
      what,
      durationLabel: def.durationLabel,
      status,
      availableAt,
      disabled,
    });
  }

  // Первый несделанный и доступный пункт получает «Следующее».
  const firstOpen = rows.find((r) => r.status === "later" && !r.disabled);
  if (firstOpen) firstOpen.status = "next";
  const delayedRow = rows.find((r) => r.status === "ready_delayed");
  const primary = firstOpen ?? delayedRow ?? null;
  const allDone = rows.length > 0 && rows.every((r) => r.status === "done" || r.status === "upload_pending" || r.status === "skipped");
  const waitingOnly = !primary && !allDone ? rows.find((r) => r.status === "waiting_delay") ?? null : null;

  return {
    rows,
    itemCount: items.length,
    minutes: Math.max(1, Math.round(items.reduce((s, i) => s + (i.duration_min || 0), 0))),
    activeDays: program?.active_days_last_7,
    primary,
    allDone,
    delayedReady: Boolean(delayedRow),
    waitingOnly,
    pendingCount: queue.length,
  };
}

/** Следующий доступный пункт после текущего (для кнопки на E6). */
export function nextRowAfter(model: ProgramModel, itemId: string): ProgramRow | null {
  const open = model.rows.filter(
    (r) => (r.status === "next" || r.status === "later" || r.status === "ready_delayed") && !r.disabled && r.itemId !== itemId && !(itemId === "story_retell" && r.itemId === DELAYED_ID),
  );
  return open[0] ?? null;
}

/** Имя для приветствия: «Сауле, 68 лет» -> «Сауле». Служебные демо-подписи не используем. */
export function greetingName(label: string | null | undefined): string | null {
  if (!label) return null;
  if (label.includes(":")) return null;
  return label.split(",")[0].trim() || null;
}

export function greeting(d = new Date()): string {
  const h = d.getHours();
  if (h >= 5 && h < 12) return t("greeting.morning");
  if (h >= 12 && h < 18) return t("greeting.day");
  return t("greeting.evening");
}
