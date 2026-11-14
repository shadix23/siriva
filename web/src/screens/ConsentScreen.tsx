"use client";
// C1-C5: согласие по шагам, по одному смысловому блоку на экран.
import { use, useEffect, useRef, useState } from "react";
import { browser } from "react-dom";
import { useRouter, useSearchParams } from "next/navigation";
import { AppHeader } from "@/components/AppHeader";
import { Icon } from "@/components/Icon";
import { StepHeading } from "@/components/ui";
import { api, ApiError } from "@/lib/api/client";
import { t } from "@/lib/i18n";
import { store } from "@/lib/storage";

export const CONSENT_VERSION = "2026-11-v1";
const TOTAL = 5;

export function ConsentScreen() {
  use(browser("Согласие сохраняется для пациента на этом устройстве."));
  const router = useRouter();
  const sp = useSearchParams();
  const raw = sp.get("step");
  const later = raw === "later";
  const step = later ? 0 : Math.max(1, Math.min(TOTAL, Number(raw) || 1));
  const [checking, setChecking] = useState(() => Boolean(store.patientId()));

  // Согласие уже есть: сразу на «Сегодня».
  useEffect(() => {
    const id = store.patientId();
    if (!id) return;
    api.patient(id).then(
      (p) => {
        if (p.consent_voice) router.replace("/app");
        else setChecking(false);
      },
      (e) => {
        if (e instanceof ApiError && e.code === "patient_not_found") store.setPatientId(null);
        setChecking(false);
      },
    );
  }, [router]);

  const go = (n: number | "later") => router.push(`/consent?step=${n}`);

  if (checking) {
    return (
      <>
        <AppHeader showSettings={false} />
        <main id="main" className="page" aria-busy="true" />
      </>
    );
  }

  return (
    <>
      <AppHeader showSettings={false} />
      <main id="main" className="page">
        {later ? (
          <div className="stack-lg">
            <StepHeading level={1}>{t("today.no_consent_title")}</StepHeading>
            <p className="lead">{t("today.no_consent_body")}</p>
            <div className="actions">
              <button className="btn btn-primary btn-block" type="button" onClick={() => go(5)}>
                {t("today.to_consent")}
              </button>
            </div>
          </div>
        ) : (
          <div className="stack-lg es-enter" key={step}>
            <p className="step-count">{t("consent.step", { i: step, n: TOTAL })}</p>
            {step === 1 ? <Step title={t("consent.c1.title")} body={[t("consent.c1.body")]} /> : null}
            {step === 2 ? (
              <Step title={t("consent.c2.title")} body={[t("consent.c2.body")]}>
                <div className="emergency" role="note">
                  <strong>
                    <Icon name="info" /> {t("consent.c2.emergency_title")}
                  </strong>
                  <p>{t("consent.c2.emergency_body")}</p>
                </div>
              </Step>
            ) : null}
            {step === 3 ? <Step title={t("consent.c3.title")} body={[t("consent.c3.body1"), t("consent.c3.body2")]} /> : null}
            {step === 4 ? <Step title={t("consent.c4.title")} body={[t("consent.c4.body1"), t("consent.c4.body2")]} /> : null}
            {step === 5 ? (
              <FinalStep onBack={() => go(4)} onLater={() => go("later")} onDone={() => router.push("/app")} />
            ) : (
              <div className="actions">
                <button className="btn btn-primary btn-block" type="button" onClick={() => go(step + 1)}>
                  {t("consent.next")}
                  <Icon name="arrow" />
                </button>
                {step > 1 ? (
                  <button className="btn btn-secondary btn-block" type="button" onClick={() => go(step - 1)}>
                    {t("consent.back")}
                  </button>
                ) : null}
              </div>
            )}
          </div>
        )}
      </main>
    </>
  );
}

function Step({ title, body, children }: { title: string; body: string[]; children?: React.ReactNode }) {
  return (
    <div className="stack-lg">
      <StepHeading level={1}>{title}</StepHeading>
      <div className="prose">
        {body.map((b) => (
          <p key={b}>{b}</p>
        ))}
      </div>
      {children}
    </div>
  );
}

function FinalStep({ onBack, onLater, onDone }: { onBack: () => void; onLater: () => void; onDone: () => void }) {
  const [voice, setVoice] = useState(false);
  const [share, setShare] = useState(false);
  const [invalid, setInvalid] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState(false);
  const voiceRef = useRef<HTMLInputElement>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!voice) {
      setInvalid(true);
      voiceRef.current?.focus();
      return;
    }
    setSaving(true);
    setSaveError(false);
    try {
      const existing = store.patientId();
      let id = existing;
      if (existing) {
        try {
          await api.patchPatient(existing, { consent_voice: true, consent_share: share, consent_version: CONSENT_VERSION });
        } catch (err) {
          if (err instanceof ApiError && err.code === "patient_not_found") id = null;
          else throw err;
        }
      }
      if (!id) {
        const p = await api.createPatient({
          language: store.lang(),
          consent_voice: true,
          consent_share: share,
          consent_version: CONSENT_VERSION,
        });
        store.setPatientId(p.id);
      }
      onDone();
    } catch {
      setSaveError(true);
      setSaving(false);
    }
  }

  return (
    <form className="stack-lg" onSubmit={submit} noValidate>
      <StepHeading level={1}>{t("consent.c5.title")}</StepHeading>
      <div className="stack">
        {invalid && !voice ? (
          <p className="field-error" id="voice-error" role="alert">
            <Icon name="alert" />
            {t("consent.c5.required")}
          </p>
        ) : null}
        <label className={`check${invalid && !voice ? " invalid" : ""}`}>
          <input
            ref={voiceRef}
            type="checkbox"
            checked={voice}
            onChange={(e) => setVoice(e.target.checked)}
            aria-invalid={invalid && !voice}
            aria-describedby={invalid && !voice ? "voice-error" : undefined}
            required
          />
          <span>{t("consent.c5.voice")}</span>
        </label>
        <label className="check">
          <input type="checkbox" checked={share} onChange={(e) => setShare(e.target.checked)} aria-describedby="share-note" />
          <span>
            {t("consent.c5.share")}
            <br />
            <span className="small muted" id="share-note">
              {t("consent.c5.share_note")}
            </span>
          </span>
        </label>
      </div>
      {saveError ? (
        <p className="field-error" role="alert">
          <Icon name="alert" />
          {t("consent.save_error")}
        </p>
      ) : null}
      <div className="actions">
        <button className="btn btn-primary btn-block" type="submit" disabled={saving} aria-busy={saving}>
          {saving ? t("consent.c5.saving") : t("consent.c5.submit")}
        </button>
        <button className="btn btn-secondary btn-block" type="button" onClick={onBack}>
          {t("consent.back")}
        </button>
        <button className="btn btn-tertiary" type="button" onClick={onLater}>
          {t("consent.c5.not_now")}
        </button>
      </div>
    </form>
  );
}
