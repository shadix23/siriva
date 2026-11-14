"use client";
// P1 «Сегодня»: одна главная кнопка и список программы. Без баллов и оценок.
import { use, useEffect, useState } from "react";
import { browser } from "react-dom";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AppHeader } from "@/components/AppHeader";
import { Icon } from "@/components/Icon";
import { Notice, SkeletonRows, StepHeading } from "@/components/ui";
import { usePatient } from "@/lib/hooks";
import { useToday } from "@/lib/useToday";
import { t, daysCount, exercisesCount, minutesAbout } from "@/lib/i18n";
import { DELAYED_ID, greeting, greetingName, type ProgramRow } from "@/lib/exercises";
import { hhmm } from "@/lib/format";
import { flushQueue } from "@/lib/upload-queue";
import { today as todayStore, store } from "@/lib/storage";
import { isDemoMode } from "@/lib/demo-mode";
import { completeSessionOnce } from "@/lib/session";

export function TodayScreen() {
  use(browser("Программа и состояние занятия хранятся на этом устройстве."));
  const router = useRouter();
  const { id, patient } = usePatient();
  const { data, error, loading, reload, recompute } = useToday(id);
  const [sending, setSending] = useState(false);
  const [demo] = useState(() => isDemoMode());

  useEffect(() => {
    // Проверяем живое значение хранилища, а не только состояние экрана (VERIFY-1 V-01).
    if (!id && !store.patientId()) router.replace("/consent");
  }, [id, router]);
  useEffect(() => {
    if (patient?.state === "error" && patient.error.code === "patient_not_found") {
      store.setPatientId(null);
      router.replace("/consent");
    }
  }, [patient, router]);

  const p = patient?.state === "ready" ? patient.data : null;
  const name = greetingName(p?.label);
  const model = data?.model;

  // Всё сделано, а человек пришёл на «Сегодня» не через «На сегодня всё» (перезагрузка, ссылка):
  // сессия тоже закрывается, один раз (REHEARSAL-1 R-2). Пока записи ждут отправки, не закрываем.
  const allDoneAndSent = Boolean(model?.allDone && model.pendingCount === 0);
  useEffect(() => {
    if (id && allDoneAndSent) completeSessionOnce(id);
  }, [id, allDoneAndSent]);

  async function sendNow() {
    if (!id) return;
    setSending(true);
    await flushQueue(id);
    setSending(false);
    await recompute();
  }

  function skipWait() {
    if (!id) return;
    todayStore.update(id, (s) => ({ ...s, demo_skip_wait: true }));
    void recompute();
  }

  let body: React.ReactNode;
  if (p && !p.consent_voice) {
    body = (
      <Notice kind="attention" title={t("today.no_consent_title")} actions={<Link className="btn btn-primary" href="/consent">{t("today.to_consent")}</Link>}>
        <p>{t("today.no_consent_body")}</p>
      </Notice>
    );
  } else if (error && !data) {
    body = (
      <Notice
        kind="error"
        role="alert"
        title={t("today.error_title")}
        actions={
          <button className="btn btn-secondary" type="button" onClick={reload}>
            {t("today.retry")}
          </button>
        }
      >
        <p>{t("today.error_body")}</p>
      </Notice>
    );
  } else if (!model || (loading && !data)) {
    body = <SkeletonRows n={3} />;
  } else if (model.allDone) {
    body = (
      <div className="es-done">
        <Notice kind="success" role="status" icon="check-circle" title={t("today.all_done_title")}>
          <p className="muted">{t("today.all_done_body")}</p>
        </Notice>
      </div>
    );
  } else {
    body = (
      <>
        {model.pendingCount > 0 ? (
          <Notice
            kind="attention"
            icon="cloud"
            role="status"
            actions={
              <button className="btn btn-secondary" type="button" onClick={sendNow} disabled={sending} aria-busy={sending}>
                {sending ? t("today.sending") : t("today.send_now")}
              </button>
            }
          >
            <p>{model.pendingCount === 1 ? t("today.pending_one") : t("today.pending_many", { n: model.pendingCount })}</p>
          </Notice>
        ) : null}
        {model.delayedReady ? (
          <Notice kind="info" icon="clock" role="status">
            <p>{t("today.delayed_ready")}</p>
          </Notice>
        ) : null}
        {model.primary ? (
          <Link className="btn btn-primary btn-block" href={`/exercise/${model.primary.itemId}`}>
            {Object.keys(data?.state.done ?? {}).length ? t("today.continue") : t("today.start")}
            <Icon name="arrow" />
          </Link>
        ) : model.waitingOnly?.availableAt ? (
          <Notice kind="info" icon="clock">
            <p>{t("retell.delayed_closed", { time: hhmm(model.waitingOnly.availableAt) })}</p>
          </Notice>
        ) : null}

        <h2 className="sr-only">{t("today.program")}</h2>
        <ol className="program">
          {model.rows.map((r) => (
            <li key={r.itemId} className={rowClass(r)}>
              <ProgramItem row={r} index={r.itemId === DELAYED_ID ? null : model.rows.filter((x) => x.itemId !== DELAYED_ID).indexOf(r) + 1} />
              {demo && r.status === "waiting_delay" ? (
                <div className="stack" style={{ padding: "0 var(--s-2) var(--s-4) 3rem" }}>
                  <button className="btn btn-secondary" type="button" onClick={skipWait}>
                    {t("retell.demo_skip")}
                  </button>
                  <p className="small muted">{t("retell.demo_skip_note")}</p>
                </div>
              ) : null}
            </li>
          ))}
        </ol>
      </>
    );
  }

  return (
    <>
      <AppHeader patient={p} />
      <main id="main" className="page">
        <div className="page-head">
          <StepHeading level={1}>
            {greeting()}
            {name ? `, ${name}` : ""}
          </StepHeading>
          {model && !model.allDone && !(p && !p.consent_voice) ? (
            <>
              <p className="lead">{t("today.summary", { n: exercisesCount(model.itemCount), m: minutesAbout(model.minutes) })}</p>
              {model.rows.some((r) => r.itemId === DELAYED_ID) ? <p className="muted">{t("today.two_parts")}</p> : null}
            </>
          ) : !model && !error ? (
            <p className="lead">{t("today.loading")}</p>
          ) : null}
        </div>
        {body}
        {model && !(p && !p.consent_voice) ? (
          <div className="week">
            {typeof model.activeDays === "number" ? <p>{t("today.week", { d: daysCount(model.activeDays) })}</p> : null}
            <details className="why">
              <summary>{t("today.why")}</summary>
              <p>{t("today.why_body")}</p>
            </details>
          </div>
        ) : null}
      </main>
    </>
  );
}

function rowClass(r: ProgramRow) {
  switch (r.status) {
    case "done":
      return "st-done";
    case "next":
      return "st-next";
    case "ready_delayed":
      return "st-ready";
    case "upload_pending":
      return "st-pending";
    case "waiting_delay":
      return "st-wait";
    case "skipped":
      return "st-later";
    default:
      return "st-later";
  }
}

function statusView(r: ProgramRow): { icon?: string; text: string } {
  switch (r.status) {
    case "done":
      return { icon: "check", text: t("status.done") };
    case "next":
      return { icon: "arrow", text: t("status.next") };
    case "ready_delayed":
      return { icon: "arrow", text: t("status.ready_delayed") };
    case "upload_pending":
      return { icon: "cloud", text: t("status.upload_pending") };
    case "waiting_delay":
      return { icon: "clock", text: t("status.waiting_delay", { time: r.availableAt ? hhmm(r.availableAt) : "" }) };
    case "skipped":
      return { text: t("status.skipped") };
    default:
      return { text: t("status.later") };
  }
}

function ProgramItem({ row, index }: { row: ProgramRow; index: number | null }) {
  const st = statusView(row);
  const inner = (
    <>
      <span className="item-num">
        {row.status === "done" ? <Icon name="check" /> : index === null ? <Icon name="clock" /> : index}
      </span>
      <span className="item-main">
        <span className="item-name">{row.title}</span>
        <span className="item-what">{row.what}</span>
      </span>
      <span className="item-status">
        {st.icon ? <Icon name={st.icon} /> : null}
        {st.text}
      </span>
    </>
  );
  if (row.disabled) {
    return (
      <div className="item" aria-disabled="true">
        {inner}
      </div>
    );
  }
  return (
    <Link className="item" href={`/exercise/${row.itemId}`}>
      {inner}
    </Link>
  );
}
