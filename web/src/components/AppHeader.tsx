"use client";
import Link from "next/link";
import type { Patient } from "@/lib/api/types";
import { useHealth } from "@/lib/hooks";
import { TranslateContext, useT } from "@/lib/i18n/context";
import { t as demoT } from "@/components/demo-i18n";
import { Icon } from "./Icon";
import { SyntheticBadge } from "./ui";

export function AppHeader({
  patient,
  variant = "patient",
  showSettings = true,
}: {
  patient?: Patient | null;
  variant?: "patient" | "family";
  showSettings?: boolean;
}) {
  const ctxT = useT();
  // Экран близкого следует языку интерфейса демо (RU / EN); путь пациента всегда русский.
  const t = variant === "family" ? demoT : ctxT;
  return (
    <TranslateContext.Provider value={t}>
      <a className="skip-link" href="#main">
        {t("nav.skip")}
      </a>
      <header className="app-header">
        <Link className="wordmark" href={variant === "family" ? "/family" : "/app"} aria-label={t("app.home_aria")}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/site/logo-mark.png" width={28} height={28} alt="" />
          Siriva{variant === "family" ? <small>{t("header.family_sub")}</small> : null}
        </Link>
        {patient?.is_demo ? <SyntheticBadge /> : null}
        <div className="header-tools">
          {showSettings ? (
            <Link className="header-link" href="/settings">
              <Icon name="gear" />
              <span className="label">{t("nav.settings")}</span>
            </Link>
          ) : null}
        </div>
      </header>
      <ServerBanner />
    </TranslateContext.Provider>
  );
}

/** X1: нет связи с локальным сервером. */
export function ServerBanner() {
  const t = useT();
  const { down, checking, check } = useHealth();
  if (!down) return null;
  return (
    <div className="server-banner" role="status">
      <Icon name="alert" />
      <p>{t("server.banner")}</p>
      <button className="btn btn-secondary" type="button" onClick={check} disabled={checking}>
        {t("server.retry")}
      </button>
    </div>
  );
}
