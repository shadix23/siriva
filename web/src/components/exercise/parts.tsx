"use client";
// Части экрана упражнения: стимул, шкала времени, уровень микрофона, подсказка, рассказ, диалог выхода.
import { useEffect, useRef, useState } from "react";
import { Icon } from "../Icon";
import { type MsgKey } from "@/lib/i18n";
import { useT } from "@/lib/i18n/context";
import { clock } from "@/lib/format";
import type { Lang } from "@/lib/api/types";

/** Картинка упражнения. «Открыть крупно» открывает модальный диалог: фокус внутри, Esc закрывает. */
export function StimulusPicture({ src, alt }: { src: string; alt: string }) {
  const t = useT();
  const dlg = useRef<HTMLDialogElement>(null);
  return (
    <figure className="stimulus">
      <div className="frame">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={src} alt={alt} width={1536} height={1024} decoding="async" />
      </div>
      <div className="zoom">
        <button className="btn btn-secondary" type="button" onClick={() => dlg.current?.showModal()}>
          <Icon name="expand" />
          <span>{t("ex.zoom_open")}</span>
        </button>
      </div>
      <dialog ref={dlg} className="picture-dialog" aria-label={alt}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={src} alt={alt} width={1536} height={1024} />
        <form method="dialog" className="picture-dialog-bar">
          <button className="btn btn-primary" type="submit" autoFocus>
            <Icon name="close" />
            {t("ex.zoom_close")}
          </button>
        </form>
      </dialog>
    </figure>
  );
}

export function CategoryCard() {
  const t = useT();
  return (
    <div className="category-card">
      <Icon name="paw" />
      <p className="cat-name">{t("fluency.category")}</p>
    </div>
  );
}

/** Спокойная шкала времени: без секунд у пациента, секунды только в демо (D4). */
export function CalmTimer({ elapsedMs, maxMs, showSeconds }: { elapsedMs: number; maxMs: number; showSeconds?: boolean }) {
  const t = useT();
  const left = maxMs - elapsedMs;
  const phrase: MsgKey = left > 30_000 ? "timer.calm.1" : left > 10_000 ? "timer.calm.2" : "timer.calm.3";
  const frac = Math.max(0, Math.min(1, elapsedMs / maxMs));
  return (
    <div className="timer">
      <div className="timer-track" aria-hidden="true">
        <div className="timer-fill" style={{ transform: `scaleX(${frac})` }} />
      </div>
      <div className="timer-row">
        <span>{t(phrase)}</span>
        {showSeconds ? (
          <span className="timer-secs">
            {t("timer.of", { a: clock(elapsedMs), b: clock(maxMs) })}
          </span>
        ) : null}
      </div>
    </div>
  );
}

/** Уровень микрофона. Подпись меняется не чаще раза в 2 секунды, «слышит вас» держится не меньше 2 секунд (без мигания). */
export function MicLevel({ level, speaking, reduced }: { level: number; speaking: boolean; reduced: boolean }) {
  const t = useT();
  const [heard, setHeard] = useState(speaking);
  const changedAt = useRef(0);
  useEffect(() => {
    if (speaking === heard) return;
    const wait = Math.max(0, 2000 - (performance.now() - changedAt.current));
    const id = setTimeout(() => {
      changedAt.current = performance.now();
      setHeard(speaking);
    }, wait);
    return () => clearTimeout(id);
  }, [speaking, heard]);
  const text = heard ? t("mic.level_on") : reduced ? t("mic.level_quiet") : t("mic.level_idle");
  return (
    <p className="mic">
      <span className="mic-bars" aria-hidden="true">
        {[0, 1, 2, 3, 4].map((i) => (
          <i key={i} className={i < level ? "on" : undefined} />
        ))}
      </span>
      <span>{text}</span>
    </p>
  );
}

export function LanguageChoice({ value, onChange, labelledBy }: { value: Lang; onChange: (l: Lang) => void; labelledBy?: string }) {
  const t = useT();
  return (
    <fieldset className="choice" aria-labelledby={labelledBy}>
      {labelledBy ? null : <legend className="sr-only">{t("ex.lang_legend")}</legend>}
      <label>
        <input type="radio" name="speech-lang" value="ru" checked={value === "ru"} onChange={() => onChange("ru")} />
        Русский
      </label>
      <label lang="en">
        <input type="radio" name="speech-lang" value="en" checked={value === "en"} onChange={() => onChange("en")} />
        English
      </label>
    </fieldset>
  );
}

/** Рисунок адресной строки с подсвеченным замком (без брендов браузеров). */
export function AddressBarHint() {
  return (
    <svg className="addr" viewBox="0 0 360 64" role="img" aria-label="Адресная строка браузера, значок замка слева">
      <rect x="1.5" y="10" width="357" height="44" rx="22" fill="#FFFDF8" stroke="#857D6E" strokeWidth="2" />
      <circle cx="34" cy="32" r="17" fill="#F2C230" />
      <rect x="27" y="30" width="14" height="11" rx="2" fill="none" stroke="#1E2320" strokeWidth="2.2" />
      <path d="M30 30v-4a4 4 0 0 1 8 0v4" fill="none" stroke="#1E2320" strokeWidth="2.2" />
      <rect x="64" y="27" width="160" height="10" rx="5" fill="#D8D0C2" />
    </svg>
  );
}

/** Защитный диалог «Остановить упражнение?» (A9): фокус внутри, Esc продолжает запись. */
export function StopDialog({ open, onContinue, onLeave }: { open: boolean; onContinue: () => void; onLeave: () => void }) {
  const t = useT();
  const ref = useRef<HTMLDialogElement>(null);
  const cont = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) {
      d.showModal();
      cont.current?.focus();
    }
    if (!open && d.open) d.close();
  }, [open]);
  return (
    <dialog
      ref={ref}
      aria-labelledby="stop-h"
      onCancel={(e) => {
        e.preventDefault();
        onContinue();
      }}
    >
      <h2 id="stop-h">{t("rec.stop_title")}</h2>
      <p style={{ marginTop: ".6rem" }}>{t("rec.stop_body")}</p>
      <div className="actions">
        <button ref={cont} className="btn btn-primary" type="button" onClick={onContinue}>
          {t("rec.stop_continue")}
        </button>
        <button className="btn btn-secondary" type="button" onClick={onLeave}>
          {t("rec.stop_leave")}
        </button>
      </div>
    </dialog>
  );
}

export interface StoryEvents {
  onReplay: () => void;
  onTextShown: () => void;
  onHeard: () => void;
}

/** Рассказ звучит записью; текст по кнопке (меняет условия, пишется в телеметрию). */
export function StoryPlayer({
  storyId,
  text,
  lang,
  events,
  primary = true,
}: {
  storyId: string;
  text: string;
  lang: Lang;
  events: StoryEvents;
  /** «Послушать рассказ» главная кнопка, пока рассказ не прослушан */
  primary?: boolean;
}) {
  const t = useT();
  const audio = useRef<HTMLAudioElement>(null);
  const [state, setState] = useState<"idle" | "playing" | "paused" | "heard">("idle");
  const [plays, setPlays] = useState(0);
  const [pos, setPos] = useState(0);
  const [showText, setShowText] = useState(false);
  const [failed, setFailed] = useState(false);

  function play(again = false) {
    const a = audio.current;
    if (!a) return;
    if (again) {
      a.currentTime = 0;
      events.onReplay();
    }
    a.play().then(
      () => {
        setState("playing");
        if (again || plays === 0) setPlays((n) => n + 1);
      },
      () => setFailed(true),
    );
  }

  return (
    <div className="stack">
      <audio
        ref={audio}
        src={`/audio/${storyId}.m4a`}
        preload="auto"
        onTimeUpdate={(e) => {
          const a = e.currentTarget;
          if (a.duration) setPos(a.currentTime / a.duration);
        }}
        onEnded={() => {
          setState("heard");
          setPos(1);
          events.onHeard();
        }}
        onError={() => setFailed(true)}
      />
      {state === "idle" ? (
        <button className={`btn ${primary ? "btn-primary" : "btn-secondary"} btn-block`} type="button" onClick={() => play(false)}>
          <Icon name="play" />
          {t("retell.listen")}
        </button>
      ) : null}
      {state === "playing" || state === "paused" ? (
        <div className="stack" role="group" aria-label={t("retell.listening")}>
          <p className="ok-label" style={{ color: "var(--ink)" }}>
            <Icon name="play" />
            {t("retell.listening")}
          </p>
          <div className="progress" aria-hidden="true">
            <span style={{ transform: `scaleX(${pos})` }} />
          </div>
          <button
            className="btn btn-secondary"
            type="button"
            onClick={() => {
              const a = audio.current;
              if (!a) return;
              if (state === "playing") {
                a.pause();
                setState("paused");
              } else {
                a.play().then(() => setState("playing"), () => setFailed(true));
              }
            }}
          >
            <Icon name={state === "playing" ? "pause" : "play"} />
            {state === "playing" ? t("retell.pause") : t("retell.resume")}
          </button>
        </div>
      ) : null}
      {state === "heard" ? (
        <div className="stack">
          <p className="ok-label">
            <Icon name="check-circle" />
            {t("retell.heard")}
          </p>
          {plays < 2 ? (
            <button className="btn btn-secondary" type="button" onClick={() => play(true)}>
              <Icon name="replay" />
              {t("retell.replay")}
            </button>
          ) : null}
        </div>
      ) : null}
      {failed ? <p className="muted small">Запись рассказа не воспроизводится. Можно открыть текст рассказа.</p> : null}
      <button
        className="btn btn-tertiary"
        type="button"
        aria-expanded={showText}
        onClick={() => {
          if (!showText) events.onTextShown();
          setShowText((s) => !s);
        }}
      >
        <Icon name="text" />
        {showText ? t("retell.hide_text") : t("retell.show_text")}
      </button>
      {showText ? (
        <p className="story-text" lang={lang}>
          {text}
        </p>
      ) : null}
      <p className="small muted">{t("retell.temp_voice")}</p>
    </div>
  );
}
