"use client";
// Язык интерфейса экранов жюри и близкого (RU / EN). Свой словарь, выбор в localStorage.
// Общий ru.json не меняем: для английского подставляем свои строки по тем же ключам.
import { useEffect, useSyncExternalStore } from "react";
import { t as tRu, type MsgKey } from "@/lib/i18n";
import * as F from "@/lib/format";
import type { Domain } from "@/lib/api/types";

export type UiLang = "ru" | "en";
const KEY = "es.demo_ui_lang";
const listeners = new Set<() => void>();
let current: UiLang = "ru";

function read(): UiLang {
  try {
    current = window.localStorage.getItem(KEY) === "en" ? "en" : "ru";
  } catch {
    /* хранилище недоступно: остаётся русский */
  }
  return current;
}

const TITLE: Record<UiLang, string> = {
  ru: "Siriva: занятия для речи и памяти",
  en: "Siriva: speech and memory exercises",
};
/** Заголовок вкладки следует языку интерфейса только на экранах жюри и близкого. */
function syncTitle(l: UiLang) {
  try {
    const p = window.location.pathname;
    if (p.startsWith("/demo") || p.startsWith("/family")) document.title = TITLE[l];
  } catch {
    /* ничего */
  }
}

export function setUiLang(l: UiLang) {
  current = l;
  syncTitle(l);
  try {
    window.localStorage.setItem(KEY, l);
  } catch {
    /* ничего */
  }
  listeners.forEach((f) => f());
}

function subscribe(f: () => void) {
  listeners.add(f);
  const onStorage = (e: StorageEvent) => {
    if (e.key === KEY) f();
  };
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(f);
    window.removeEventListener("storage", onStorage);
  };
}

/** Подписка корневого экрана: при смене языка перерисовывается всё дерево. */
export function useUiLang(): UiLang {
  const lang = useSyncExternalStore(subscribe, read, () => "ru" as UiLang);
  useEffect(() => syncTitle(lang), [lang]);
  return lang;
}

export const isEn = () => current === "en";
/** Строка на текущем языке. */
export const L = (ru: string, en: string) => (current === "en" ? en : ru);

const EN: Partial<Record<MsgKey | string, string>> = {
  "badge.synthetic": "Synthetic patient. Data is not real",
  "badge.synthetic_live": "Demo: synthetic patient, live recording",
  "badge.synthetic_short": "synthetic",
  "badge.stub_matrix": "Exercise load is preliminary: estimated by task type, not TRIBE v2. The selection structure is real",
  "badge.tribe": "Exercise load: TRIBE v2 predictions (Meta, CC BY-NC 4.0), non-commercial use only",
  "badge.backup": "Pre-recorded example",
  "server.ok": "Local server: running",
  "server.down": "Local server: no connection",
  "server.loading_model": "Local server: loading speech recognition",
  "server.retry": "Check again",
  "error.retry": "Try again",
  "nav.settings": "Settings",
  "deleted.again": "Go through consent again",
  "settings.no_patient": "No data on this device yet.",
  "today.error_body": "Check that the program is running on this computer.",
  "numbers.pending": "Awaiting data",
  "domain.episodic_memory": "Episodic memory",
  "domain.word_access": "Word finding",
  "domain.phrase_building": "Phrase building",
  "domain.attention": "Attention",
  "domain.processing_speed": "Response speed",
  "metric.pause_before_content_mean": "pause before a content word",
  "metric.fluency_count": "words per minute in “Name animals”",
  "metric.retell_retention": "story retained after 20 minutes",
  "metric.speech_rate_wpm": "words per minute",
  "metric.time_to_first_action_s": "time to start answering",
  "metric.first_word_latency": "time to first word",
  "metric.pause_ratio": "pause ratio",
  "metric.mattr": "lexical diversity",
  "metric.pronoun_share": "pronoun share",
  "channel.speech": "speech",
  "channel.reading": "reading",
  "channel.visual": "vision",
  "channel.spatial": "spatial",
  "channel.auditory": "hearing",
  "channel.auditory_visual": "hearing and vision",
  "channel.auditory_motor": "hearing and movement",
  "channel.motor": "movement",
  "evidence.fluency_count": "In “Name animals” fewer words are named per minute: {first} in week 1, {last} now.",
  "evidence.pause_before_content_mean": "Pauses before content words got longer: {first} in week 1, {last} now.",
  "evidence.retell_retention": "Less of the story is retained after 20 minutes: {first} in week 1, {last} now.",
  "evidence.speech_rate_wpm": "Speech got slower: {first} words per minute in week 1, {last} now.",
  "family.title": "How {name} is doing",
  "family.title_plain": "Summary for family",
  "family.share_note": "Data is shown because {name} allowed it in the consent.",
  "family.share_off_title": "Progress is not shared yet",
  "family.share_off": "Progress is shown only with permission. It can be given in Settings.",
  "family.discuss": "What to discuss with a specialist",
  "flag.faster_than_usual": "{domain} is declining faster than usual for this period. It is worth discussing with a specialist.",
  "flag.meaning": "This is a change in the exercises over the last {w}. It describes a trend, not a health conclusion. Causes vary: tiredness, sleep, medication, mood. A specialist will help sort it out.",
  "flag.none": "There are no changes right now that need a separate discussion.",
  "family.trajectory": "Trajectory by week",
  "family.trajectory_note": "Dashed line: reference from week 1. Ochre line: the function worth discussing.",
  "family.more_profile": "More: function profile",
  "family.show_table": "Show as a table",
  "family.hide_table": "Hide table",
  "family.week_title": "How the week went",
  "family.empty": "The trajectory needs at least two weeks of exercises. So far: {n}.",
  "family.error": "Could not load the summary.",
  "family.week_col": "Week",
  "profile.title": "Function profile",
  "profile.week_of": "Week {i} of {n}",
  "profile.legend_now": "Now",
  "profile.legend_first": "Week 1",
  "profile.legend_week": "Week {i}",
  "profile.slider": "Week on the chart",
  "profile.first": "Week 1",
  "profile.now": "Now",
  "profile.table_title": "What was measured",
  "profile.col_domain": "Function",
  "profile.col_measure": "What was measured",
  "profile.col_was": "Before",
  "profile.col_now": "Now",
  "profile.no_data_axis": "little data",
  "profile.not_measured": "not measured yet",
  "profile.preliminary": "The profile is preliminary: before model calibration it is computed by transparent rules from speech measures. It has not been tested on real people.",
  "profile.window": "Contribution of measures over the last {d} days",
  "profile.empty": "The profile appears after three sessions. Done so far: {n}.",
  "profile.error": "Could not load the profile",
  "profile.chart_aria": "Radar chart of the profile across five functions. Values are in the table.",
  // Упражнение «Описание картинки» в D2 (SpeechFlow, parts) и шапка экрана близкого. Владелец строк: frontend-patient.
  "nav.skip": "Skip to content",
  "header.family_sub": "for family and doctors",
  "server.banner": "No connection to Siriva on this computer. Recordings are kept on the device.",
  "ex.ready_title": "Start recording when you are ready",
  "ex.start_rec": "Start recording",
  "ex.finish_rec": "Finish recording",
  "ex.hint": "Hint",
  "ex.hint_offer": "You can take a hint",
  "ex.saving": "Saving the recording",
  "ex.saving_body": "This takes less than a second.",
  "ex.back_program": "Back to the program",
  "ex.zoom_open": "Open large",
  "ex.zoom_close": "Close",
  "ex.understood": "Got it, next",
  "ex.lang_title": "Which language will you speak?",
  "ex.lang_legend": "Speech language",
  "ex.mic_checked": "Microphone checked",
  "ex.next_ex": "Next exercise: {title}",
  "picture.title": "Describe the picture",
  "picture.intro": "Tell in your own words everything you see: who is there and what is happening.",
  "picture.duration": "This takes about a minute and a half. A hint is always available.",
  "picture.ready": "Describe everything you see in the picture. Speak as usual, there is no rush.",
  "picture.rec_title": "Tell what you see in the picture",
  "picture.alt": "Illustration for the exercise: {scene}",
  "picture.hint.1": "What are the people in the picture doing?",
  "picture.hint.2": "What is happening on the left?",
  "picture.hint.3": "What might happen next?",
  "timer.calm.1": "Speak as usual",
  "timer.calm.2": "You can keep talking a little longer",
  "timer.calm.3": "Almost done",
  "timer.sr_30": "About 30 seconds left to speak",
  "timer.sr_10": "Almost done",
  "timer.of": "{a} of {b}",
  "rec.live": "Recording",
  "rec.silence": "We can't hear you yet. Speak as usual, no need to be louder.",
  "rec.silence_hint": "If you are speaking and the bar does not move, check the microphone.",
  "rec.saved_label": "Saved",
  "rec.saved": "Thank you. The exercise is saved.",
  "rec.saved_local": "The recording is saved on the device and is being sent.",
  "rec.sending": "Sending the recording.",
  "rec.sent": "Recording sent.",
  "rec.timeout_picture": "Thank you, that is enough.",
  "rec.short_title": "The recording is short",
  "rec.short": "You can keep it or record again. Both are fine.",
  "rec.keep": "Keep it",
  "rec.again": "Record again",
  "rec.silent_title": "The recording has no voice",
  "rec.silent": "The microphone may be off or too far away.",
  "rec.check_mic": "Check the microphone",
  "rec.try_again": "Try again",
  "rec.skip_today": "Skip for today",
  "rec.interrupted_title": "The exercise was interrupted",
  "rec.interrupted": "No problem, you can start it again.",
  "rec.interrupted_kept": "You spoke for about {s} seconds.",
  "rec.restart": "Start again",
  "rec.save_partial": "Save what was recorded",
  "rec.stop_title": "Stop the exercise?",
  "rec.stop_body": "This recording will not be saved.",
  "rec.stop_continue": "Continue the exercise",
  "rec.stop_leave": "Stop and leave",
  "mic.level_on": "The microphone hears you",
  "mic.level_idle": "Microphone on",
  "mic.level_quiet": "Quiet now",
  "mic.check_title": "Let's check the microphone",
  "mic.check_intro": "The browser will now ask for microphone access. Click “Allow”.",
  "mic.check_allow": "Turn on the microphone",
  "mic.check_say": "Say out loud: “Today is a good day”",
  "mic.hear_ok": "Heard clearly",
  "mic.hear_none": "Not heard yet",
  "mic.check_done": "The microphone works, start",
  "mic.asking": "Waiting for the browser. If a question appeared, click “Allow”.",
  "mic.asking_button": "Waiting for the browser…",
  "mic.denied.title": "Microphone access is needed",
  "mic.denied.body": "The browser did not allow the microphone. Click the lock icon left of the site address, choose “Microphone: allow” and click “Try again”.",
  "mic.denied.settings": "If there was no question about the microphone, open the browser settings, find “Microphone” and allow it for this site.",
  "mic.denied.help": "You can ask someone close to help with the setup.",
  "mic.denied.label": "Microphone unavailable",
  "mic.notfound.title": "Microphone not found",
  "mic.notfound.body": "Check that a microphone or headset is connected. If another program (for example, a video call) is using it, close that program.",
  "mic.retry": "Try again",
  "mic.retrying": "Checking…",
  "mic.retry_failed": "The browser denied microphone access again. Try the steps below or skip the exercise for today.",
  "mic.skip_exercise": "Skip this exercise today",
  "upload.failed_title": "The recording has not been sent yet",
  "upload.failed": "The recording is saved on this device but has not been sent yet.",
  "upload.failed_hint": "Check that Siriva is running. The recording will not be lost.",
  "upload.retry": "Send again",
  "upload.later": "Send later",
  "upload.rejected_title": "This recording could not be processed",
  "upload.rejected": "This recording could not be processed. Please record again.",
  "upload.consent_title": "Consent to voice recording is needed",
  "upload.consent": "Voice recording needs consent. It can be given in Settings.",
  "upload.open_settings": "Open settings",
};

/** Перевод общего ключа: на английском свой словарь, иначе общий ru.json. */
export function t(key: MsgKey, params?: Record<string, string | number>): string {
  const en = current === "en" ? EN[key] : undefined;
  if (!en) return tRu(key, params);
  let s = en;
  if (params) for (const [k, v] of Object.entries(params)) s = s.split(`{${k}}`).join(String(v));
  return s;
}

export const domainLabel = (d: Domain) => t(`domain.${d}` as MsgKey);

/** Числа: на английском десятичная точка и «s» вместо «с». */
const enNum = (s: string) =>
  current === "en" ? s.replace(/(\d),(\d)/g, "$1.$2").replace(/([\s\u00A0])с(?![А-Яа-яЁё])/g, "$1s") : s;
export const num = (v: number | null | undefined, digits = 1) => enNum(F.num(v, digits));
export const secs = (v: number | null | undefined, digits = 1) => enNum(F.secs(v, digits));
export const percent = (v: number | null | undefined) => F.percent(v);
export const clock = F.clock;
export const metricValue = (key: string, v: number | null | undefined) => enNum(F.metricValue(key, v));

/** «12 недель» / «12 weeks» и т.п. для текстов флага. */
export function weeksText(n: number, ruText: string) {
  return current === "en" ? `${n} ${n === 1 ? "week" : "weeks"}` : ruText;
}
export function daysText(n: number, ruText: string) {
  return current === "en" ? `${n} ${n === 1 ? "day" : "days"}` : ruText;
}
export type { MsgKey };

const EX_EN: Record<string, string> = {
  story_retell: "Story retelling",
  picture_description: "Picture description",
  naming_fluency: "Name animals in a minute",
  word_list_recall_spoken: "Recall a word list aloud",
  naming_from_definition: "Name an object from a definition",
  picture_naming: "Name the object in a picture",
  sentence_completion_spoken: "Complete a sentence aloud",
  describe_daily_routine: "Describe a usual day",
  read_aloud_short_text: "Read a short text aloud",
  sentence_building_cards: "Build a sentence from cards",
  word_picture_matching: "Hear a word, pick a picture",
  sound_to_picture: "Hear a sound, pick a picture",
  odd_one_out: "Find the odd one out",
  picture_pair_memory: "Find picture pairs",
  spatial_sequence_recall: "Repeat a sequence on a grid",
  delayed_picture_recognition: "Recognise pictures shown earlier",
  route_recall_map: "Recall a route on a map",
  face_name_choice: "Match a face and a name",
  shopping_list_recall_visual: "Recall a shopping list from pictures",
  digit_span_tap: "Repeat digits by tapping",
  spot_the_difference: "Spot the difference",
  sustained_tone_detection: "Notice a rare signal",
  card_sorting: "Sort cards by a rule",
  rhythm_copy: "Repeat a rhythm",
  reaction_tap: "Tap the target quickly",
};
/** Название упражнения: на английском свой перевод по id, иначе название из API. */
export const exTitle = (id: string, ru: string) => (current === "en" ? (EX_EN[id] ?? ru) : ru);

const TR: Record<string, string> = {
  а: "a", б: "b", в: "v", г: "g", д: "d", е: "e", ё: "yo", ж: "zh", з: "z", и: "i", й: "y", к: "k", л: "l", м: "m", н: "n",
  о: "o", п: "p", р: "r", с: "s", т: "t", у: "u", ф: "f", х: "kh", ц: "ts", ч: "ch", ш: "sh", щ: "shch", ъ: "", ы: "y", ь: "",
  э: "e", ю: "yu", я: "ya", ә: "a", ғ: "g", қ: "q", ң: "n", ө: "o", ұ: "u", ү: "u", һ: "h", і: "i",
};
/** Имя человека: на английском транслитерация кириллицы («Сауле» -> «Saule»). */
export function personName(name: string): string;
export function personName(name: string | null): string | null;
export function personName(name: string | null): string | null {
  if (!name || current !== "en") return name;
  return name
    .replace(/(\d+)\s*(лет|года|год)/g, "$1")
    .replace(/[А-Яа-яЁёӘәҒғҚқҢңӨөҰұҮүҺһІі]/g, (ch) => {
      const lo = ch.toLowerCase();
      const r = TR[lo] ?? ch;
      return ch === lo ? r : r.charAt(0).toUpperCase() + r.slice(1);
    });
}
