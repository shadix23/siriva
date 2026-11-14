"use client";
// F1 сводка для близкого и врача, F2 профиль функций.
import { use } from "react";
import { browser } from "react-dom";
import Link from "next/link";
import { AppHeader } from "@/components/AppHeader";
import { Icon } from "@/components/Icon";
import { Notice, SkeletonRows, StepHeading } from "@/components/ui";
import { FamilyView, ProfileView } from "@/components/views";
import { api, ApiError } from "@/lib/api/client";
import { greetingName } from "@/lib/exercises";
import { useLoad, usePatient } from "@/lib/hooks";
import { L, personName, setUiLang, t, useUiLang } from "@/components/demo-i18n";
import "@/styles/demo.css";

function ShareOff() {
  return (
    <Notice kind="info" title={t("family.share_off_title")} actions={<Link className="btn btn-secondary" href="/settings">{t("nav.settings")}</Link>}>
      <p>{t("family.share_off")}</p>
    </Notice>
  );
}

/** Адрес без ?patient: прямо говорим, чей это профиль (данные берутся с этого устройства). */
function DeviceNote({ name }: { name: string | null }) {
  const fromUrl = new URLSearchParams(window.location.search).has("patient");
  if (fromUrl) return null;
  return (
    <p className="device-note">
      <Icon name="user" /> {L("Показаны данные человека, выбранного на этом устройстве", "Showing data of the person selected on this device")}{name ? `: ${name}` : ""}. {L("Сменить можно в «Настройках».", "You can change it in Settings.")}
    </p>
  );
}

/** Язык интерфейса экрана близкого (тот же выбор, что в демо). */
function UiLangToggle() {
  const lang = useUiLang();
  return (
    <div className="seg-toggle ui-lang-toggle" role="group" aria-label={L("Язык интерфейса", "Interface language")}>
      <button type="button" aria-pressed={lang === "ru"} onClick={() => setUiLang("ru")}>
        RU
      </button>
      <button type="button" aria-pressed={lang === "en"} onClick={() => setUiLang("en")} lang="en">
        EN
      </button>
    </div>
  );
}

function NoPatient() {
  return (
    <Notice kind="info" title={t("settings.no_patient")} actions={<Link className="btn btn-primary" href="/consent">{t("deleted.again")}</Link>} />
  );
}

export function FamilyScreen() {
  use(browser("Пациент выбирается на этом устройстве."));
  useUiLang();
  const { id, patient } = usePatient();
  const p = patient?.state === "ready" ? patient.data : null;
  const [traj, reload] = useLoad(() => (id ? api.trajectory(id) : Promise.reject(new ApiError(404, "no_patient", ""))), [id]);
  const name = personName(greetingName(p?.label)) ?? L("ваш близкий", "your relative");
  const nameGen = personName(greetingName(p?.label));

  let body: React.ReactNode;
  if (!id) body = <NoPatient />;
  else if (traj.state === "loading") body = <SkeletonRows n={4} />;
  else if (traj.state === "error" && traj.error.code === "share_not_allowed") body = <ShareOff />;
  else if (traj.state === "error")
    body = (
      <Notice kind="error" role="alert" title={t("family.error")} actions={<button className="btn btn-secondary" type="button" onClick={reload}>{t("error.retry")}</button>}>
        <p>{t("today.error_body")}</p>
      </Notice>
    );
  else body = <FamilyView traj={traj.data} profileHref={`/family/profile${id ? `?patient=${encodeURIComponent(id)}` : ""}`} />;

  return (
    <div className="clinical">
      <AppHeader patient={p} variant="family" />
      <main id="main" className="page family-page">
        <div className="page-head">
          <UiLangToggle />
          <StepHeading level={1} focus={false}>
            {nameGen ? t("family.title", { name: nameGen }) : t("family.title_plain")}
          </StepHeading>
          {traj.state === "ready" ? (
            <p className="muted">
              <Icon name="check-circle" /> {t("family.share_note", { name })}
            </p>
          ) : null}
          {id ? <DeviceNote name={nameGen} /> : null}
        </div>
        {body}
      </main>
    </div>
  );
}

export function ProfileScreen() {
  use(browser("Пациент выбирается на этом устройстве."));
  useUiLang();
  const { id, patient } = usePatient();
  const p = patient?.state === "ready" ? patient.data : null;
  const [data, reload] = useLoad(async () => {
    if (!id) throw new ApiError(404, "no_patient", "");
    const [profile, trajectory] = await Promise.all([api.profile(id), api.trajectory(id)]);
    return { profile, trajectory };
  }, [id]);

  let body: React.ReactNode;
  if (!id) body = <NoPatient />;
  else if (data.state === "loading")
    body = (
      <div className="stack" aria-hidden="true">
        <div className="skeleton-block" style={{ width: "100%", maxWidth: "30rem", aspectRatio: "1.2", margin: "0 auto" }} />
        <SkeletonRows n={4} />
      </div>
    );
  else if (data.state === "error" && data.error.code === "share_not_allowed") body = <ShareOff />;
  else if (data.state === "error")
    body = (
      <Notice kind="error" role="alert" title={t("profile.error")} actions={<button className="btn btn-secondary" type="button" onClick={reload}>{t("error.retry")}</button>}>
        <p>{t("today.error_body")}</p>
      </Notice>
    );
  else if (!data.data.profile.has_data || data.data.profile.sessions_used < 3)
    body = (
      <div className="calm-box">
        <Icon name="info" />
        <p>{t("profile.empty", { n: data.data.profile.sessions_used })}</p>
      </div>
    );
  else body = <ProfileView profile={data.data.profile} trajectory={data.data.trajectory} />;

  return (
    <div className="clinical">
      <AppHeader patient={p} variant="family" />
      <main id="main" className="page family-page">
        <div className="page-head">
          <UiLangToggle />
          <p>
            <Link className="back-link" href={`/family${id ? `?patient=${encodeURIComponent(id)}` : ""}`}>
              <Icon name="back" /> {L("Сводка для близкого", "Summary for family")}
            </Link>
          </p>
          <StepHeading level={1} focus={false}>
            {t("profile.title")}
            {greetingName(p?.label) ? `: ${personName(greetingName(p?.label))}` : ""}
          </StepHeading>
          {id ? <DeviceNote name={personName(greetingName(p?.label))} /> : null}
        </div>
        {body}
      </main>
    </div>
  );
}
