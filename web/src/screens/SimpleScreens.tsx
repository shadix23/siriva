"use client";
// P2 «На сегодня всё», S1 настройки, S2 удаление, S3 данные удалены.
import { use, useEffect, useRef, useState } from "react";
import { browser } from "react-dom";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AppHeader } from "@/components/AppHeader";
import { Icon } from "@/components/Icon";
import { LanguageChoice } from "@/components/exercise/parts";
import { Notice, StepHeading } from "@/components/ui";
import { api } from "@/lib/api/client";
import type { Lang, Patient } from "@/lib/api/types";
import { usePatient } from "@/lib/hooks";
import { t } from "@/lib/i18n";
import { store, today } from "@/lib/storage";
import { clearQueue, listQueue } from "@/lib/upload-queue";
import { completeSessionOnce } from "@/lib/session";
import { CONSENT_VERSION } from "./ConsentScreen";

export function DoneScreen() {
  use(browser("Сессия занятия хранится на этом устройстве."));
  const router = useRouter();
  const { id, patient } = usePatient();
  const [pending, setPending] = useState(0);
  useEffect(() => {
    if (!id) return;
    const st = today.read(id);
    // Сегодня ничего не сделано: этот экран говорил бы неправду, возвращаемся на «Сегодня».
    if (!Object.keys(st.done).length && !Object.keys(st.skipped ?? {}).length) {
      router.replace("/app");
      return;
    }
    listQueue(id).then((q) => setPending(q.length));
    // Один вызов /complete на сессию, даже при повторном монтировании экрана (VERIFY-2 N-3).
    completeSessionOnce(id);
  }, [id, router]);
  const p = patient?.state === "ready" ? patient.data : null;
  return (
    <>
      <AppHeader patient={p} />
      <main id="main" className="page">
        <div className="stack-lg es-done">
          <p className="ok-label">
            <Icon name="check-circle" />
            {t("rec.saved_label")}
          </p>
          <StepHeading level={1}>{t("done.title")}</StepHeading>
          <p className="lead">{t("done.body")}</p>
          {pending ? (
            <Notice kind="attention" icon="cloud" role="status">
              <p>{t("done.pending")}</p>
            </Notice>
          ) : null}
          <div className="actions">
            <Link className="btn btn-primary btn-block" href="/app">
              {t("done.home")}
            </Link>
          </div>
        </div>
      </main>
    </>
  );
}

export function SettingsScreen() {
  use(browser("Настройки хранятся на этом устройстве."));
  const { id, patient } = usePatient();
  const [lang, setLangState] = useState<Lang>(() => store.lang());
  const [saved, setSaved] = useState<Patient | null>(null);
  const p = saved ?? (patient?.state === "ready" ? patient.data : null);
  const [busy, setBusy] = useState<null | "voice" | "share">(null);
  const [status, setStatus] = useState("");
  const [error, setError] = useState(false);

  // Язык хранится на устройстве и применяется сразу.
  const setLang = (l: Lang) => {
    setLangState(l);
    store.setLang(l);
    setStatus(t("settings.saved"));
  };

  // Согласия сохраняются сразу при изменении флажка; подпись строится по сохранённому значению (A11Y-1, п. 6).
  async function saveConsent(field: "voice" | "share", value: boolean) {
    if (!id) return;
    setBusy(field);
    setError(false);
    setStatus(t("settings.saving"));
    try {
      const np = await api.patchPatient(id, {
        ...(field === "voice" ? { consent_voice: value } : { consent_share: value }),
        consent_version: CONSENT_VERSION,
      });
      setSaved(np);
      setStatus(t("settings.saved"));
    } catch {
      setError(true);
      setStatus("");
    } finally {
      setBusy(null);
    }
  }

  const voice = Boolean(p?.consent_voice);
  const share = Boolean(p?.consent_share);

  return (
    <>
      <AppHeader patient={p} showSettings={false} />
      <main id="main" className="page">
        <div className="stack-lg">
          <StepHeading level={1}>{t("settings.title")}</StepHeading>
          <p className="muted">{t("settings.instant")}</p>
          <section className="settings-section" aria-labelledby="s-lang">
            <h2 id="s-lang">{t("settings.lang")}</h2>
            <LanguageChoice value={lang} onChange={setLang} labelledBy="s-lang" />
          </section>
          {p ? (
            <>
              <section className="settings-section" aria-labelledby="s-voice">
                <h2 id="s-voice">{t("settings.voice")}</h2>
                <label className="check">
                  <input
                    type="checkbox"
                    checked={voice}
                    disabled={busy !== null}
                    aria-describedby="voice-note"
                    onChange={(e) => void saveConsent("voice", e.target.checked)}
                  />
                  <span>{t("consent.c5.voice")}</span>
                </label>
                <p className="muted" id="voice-note">
                  {voice ? t("settings.voice_on") : t("settings.voice_off")}
                </p>
              </section>
              <section className="settings-section" aria-labelledby="s-share">
                <h2 id="s-share">{t("settings.share")}</h2>
                <label className="check">
                  <input
                    type="checkbox"
                    checked={share}
                    disabled={busy !== null}
                    aria-describedby="share-note-s"
                    onChange={(e) => void saveConsent("share", e.target.checked)}
                  />
                  <span>{t("consent.c5.share")}</span>
                </label>
                <p className="muted" id="share-note-s">
                  {share ? t("settings.share_on") : t("settings.share_off")}
                </p>
                {share ? (
                  <p>
                    <Link href="/family">{t("settings.family_link")}</Link>
                  </p>
                ) : null}
              </section>
            </>
          ) : (
            <p className="muted">{t("settings.no_patient")}</p>
          )}
          {/* Живая область существует всегда, меняется только текст (A11Y-1, п. 19). */}
          <p className="ok-label" role="status" aria-live="polite" style={{ minHeight: "1.5em" }}>
            {status ? <Icon name="check-circle" /> : null}
            {status}
          </p>
          {error ? (
            <p className="field-error" role="alert">
              <Icon name="alert" />
              {t("settings.save_error")}
            </p>
          ) : null}
          <section className="settings-section settings-links">
            <Link href="/">{t("settings.about")}</Link>
            {p ? (
              <Link href="/settings/delete" className="btn btn-tertiary" style={{ color: "var(--danger)", justifySelf: "start" }}>
                <Icon name="trash" />
                {t("settings.delete_link")}
              </Link>
            ) : null}
          </section>
        </div>
      </main>
    </>
  );
}

export function DeleteScreen() {
  use(browser("Пациент для удаления хранится на этом устройстве."));
  const router = useRouter();
  const { id, patient } = usePatient();
  const [ok, setOk] = useState(false);
  const [invalid, setInvalid] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);
  const box = useRef<HTMLInputElement>(null);
  const p = patient?.state === "ready" ? patient.data : null;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!ok) {
      setInvalid(true);
      box.current?.focus();
      return;
    }
    if (!id) return;
    setBusy(true);
    setError(false);
    try {
      await api.deletePatient(id);
      await clearQueue(id);
      today.clearAll();
      const wasDemo = Boolean(p?.is_demo);
      if (wasDemo) await api.demoReset().catch(() => undefined);
      store.setPatientId(wasDemo ? id : null);
      router.push(wasDemo ? "/deleted?demo=1" : "/deleted");
    } catch {
      setError(true);
      setBusy(false);
    }
  }

  return (
    <>
      <AppHeader patient={p} showSettings={false} />
      <main id="main" className="page">
        <form className="stack-lg" onSubmit={submit} noValidate>
          <StepHeading level={1}>{t("delete.title")}</StepHeading>
          <p className="lead">{t("delete.body")}</p>
          <div className="stack">
            {invalid && !ok ? (
              <p className="field-error" id="del-error" role="alert">
                <Icon name="alert" />
                {t("delete.confirm_error")}
              </p>
            ) : null}
            <label className={`check${invalid && !ok ? " invalid" : ""}`}>
              <input
                ref={box}
                type="checkbox"
                checked={ok}
                onChange={(e) => setOk(e.target.checked)}
                aria-invalid={invalid && !ok}
                aria-describedby={invalid && !ok ? "del-error" : undefined}
              />
              <span>{t("delete.confirm")}</span>
            </label>
          </div>
          {error ? (
            <p className="field-error" role="alert">
              <Icon name="alert" />
              {t("delete.error")}
            </p>
          ) : null}
          <div className="actions">
            <button className="btn btn-danger btn-block" type="submit" disabled={busy || !id} aria-busy={busy}>
              <Icon name="trash" />
              {busy ? t("delete.deleting") : t("delete.submit")}
            </button>
            <Link className="btn btn-secondary btn-block" href="/settings">
              {t("delete.cancel")}
            </Link>
          </div>
        </form>
      </main>
    </>
  );
}

export function DeletedScreen() {
  use(browser("Результат удаления читается из адреса."));
  const [demo] = useState(() => new URLSearchParams(window.location.search).get("demo") === "1");
  return (
    <>
      <AppHeader showSettings={false} />
      <main id="main" className="page">
        <div className="stack-lg">
          <StepHeading level={1}>{t("deleted.title")}</StepHeading>
          {demo ? <p className="lead">{t("deleted.demo")}</p> : null}
          <div className="actions">
            <Link className="btn btn-primary btn-block" href={demo ? "/app" : "/consent"}>
              {demo ? t("nav.home") : t("deleted.again")}
            </Link>
          </div>
        </div>
      </main>
    </>
  );
}
