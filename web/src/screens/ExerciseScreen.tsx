"use client";
// E0-E6: маршрут /exercise/[itemId]. Готовит сессию, рассказ, картинку и следующий пункт.
import { use, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { browser } from "react-dom";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { Icon } from "@/components/Icon";
import { Notice, SyntheticBadge, StepHeading } from "@/components/ui";
import { SpeechFlow } from "@/components/exercise/SpeechFlow";
import { GameFlow } from "@/components/exercise/GameFlow";
import { ServerBanner } from "@/components/AppHeader";
import { api } from "@/lib/api/client";
import type { Story } from "@/lib/api/types";
import { DELAYED_ID, EXERCISES, nextRowAfter, pictureForToday, type ProgramRow } from "@/lib/exercises";
import { usePatient } from "@/lib/hooks";
import { t } from "@/lib/i18n";
import { hhmm } from "@/lib/format";
import { store, today } from "@/lib/storage";
import { useToday } from "@/lib/useToday";

export function ExerciseScreen() {
  use(browser("Упражнение использует микрофон и хранилище этого устройства."));
  const params = useParams<{ itemId: string }>();
  const itemId = decodeURIComponent(params.itemId ?? "");
  const def = EXERCISES[itemId];
  const router = useRouter();
  const { id: pid, patient } = usePatient();
  const { data, recompute } = useToday(pid);
  const [stories, setStories] = useState<Story[]>([]);
  const backGuard = useRef<(() => boolean) | null>(null);
  const picture = useMemo(() => pictureForToday(), []);

  useEffect(() => {
    if (!pid && !store.patientId()) router.replace("/consent");
  }, [pid, router]);
  useEffect(() => {
    // Пациента больше нет на сервере (данные удалены или пересозданы): на согласие, это не ошибка.
    if (patient?.state === "error" && patient.error.code === "patient_not_found") {
      store.setPatientId(null);
      router.replace("/consent");
    }
  }, [patient, router]);

  useEffect(() => {
    api.stories().then((r) => setStories(r.stories), () => undefined);
  }, []);

  const p = patient?.state === "ready" ? patient.data : null;
  const rows = data?.model.rows ?? [];
  const idx = rows.findIndex((r) => r.itemId === itemId);
  const row = idx >= 0 ? rows[idx] : null;
  const nextRow = data ? nextRowAfter(data.model, itemId) : null;
  const state = pid ? today.read(pid) : null;

  const allDone = Boolean(data?.model.allDone);
  const exit = useCallback(() => router.push(allDone ? "/done" : "/app"), [router, allDone]);
  const goNext = useCallback((r: ProgramRow) => router.push(`/exercise/${r.itemId}`), [router]);
  const onSaved = useCallback(() => void recompute(), [recompute]);

  // Всё сделано: на «На сегодня всё».
  const goNextOrDone = useCallback(
    (r: ProgramRow) => {
      goNext(r);
    },
    [goNext],
  );

  let content: React.ReactNode;
  if (!def) {
    content = (
      <main id="main" className="page">
        <StepHeading level={1}>{t("notfound.title")}</StepHeading>
        <p style={{ marginTop: "1rem" }}>{t("notfound.body")}</p>
        <p style={{ marginTop: "1.5rem" }}>
          <Link className="btn btn-primary" href="/app">
            {t("nav.home")}
          </Link>
        </p>
      </main>
    );
  } else if (!pid) {
    content = (
      <main id="main" className="page" aria-busy="true">
        <p className="lead">Готовим упражнение</p>
      </main>
    );
  } else if (itemId === DELAYED_ID && row && row.disabled) {
    content = (
      <main id="main" className="page">
        <Notice kind="info" icon="clock" actions={<Link className="btn btn-primary" href="/app">{t("ex.back_program")}</Link>}>
          <p>
            {row.availableAt
              ? t("retell.delayed_closed", { time: hhmm(row.availableAt) })
              : "Вторая часть откроется через 20 минут после первой части пересказа."}
          </p>
        </Notice>
      </main>
    );
  } else if (def.kind === "speech") {
    const locked = def.stimulus === "story-delayed" && state?.story_id ? { lang: state.story_lang ?? store.lang(), storyId: state.story_id } : undefined;
    content = (
      <main id="main">
        <SpeechFlow
          key={itemId}
          def={def}
          patientId={pid}
          stories={stories}
          picture={picture}
          initialLang={store.lang()}
          locked={locked}
          nextRow={nextRow}
          onSaved={onSaved}
          onExit={exit}
          onNext={goNextOrDone}
          registerBackGuard={(fn) => (backGuard.current = fn)}
        />
      </main>
    );
  } else {
    content = (
      <main id="main">
        <GameFlow
          key={itemId}
          def={def}
          patientId={pid}
          difficulty={data?.program?.items.find((i) => i.exercise_id === def.exerciseId)?.difficulty}
          nextRow={nextRow}
          onSaved={onSaved}
          onExit={exit}
          onNext={goNextOrDone}
          registerBackGuard={(fn) => (backGuard.current = fn)}
        />
      </main>
    );
  }

  return (
    <>
      <a className="skip-link" href="#main">
        Перейти к содержанию
      </a>
      <div className="ex-top">
        <Link
          className="back"
          href="/app"
          onClick={(e) => {
            if (backGuard.current && !backGuard.current()) e.preventDefault();
          }}
        >
          <Icon name="back" />
          {t("nav.back_program")}
        </Link>
        {p?.is_demo ? <SyntheticBadge /> : null}
        {row && data ? (
          <span className="ex-step">
            {t("ex.counter", {
              i: (itemId === DELAYED_ID ? rows.findIndex((r) => r.itemId === "story_retell") : rows.filter((r) => r.itemId !== DELAYED_ID).findIndex((r) => r.itemId === itemId)) + 1,
              n: data.model.itemCount,
            })}
            {itemId === DELAYED_ID ? ", вторая часть" : ""}
          </span>
        ) : null}
      </div>
      <ServerBanner />
      {content}
    </>
  );
}
