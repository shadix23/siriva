"use client";
// Общие мелкие компоненты: заголовок этапа, сообщения, объявления для диктора, размер текста.
import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { Icon } from "./Icon";
import { useT } from "@/lib/i18n/context";

/** Заголовок этапа: при появлении получает фокус (A9). */
export function StepHeading({
  children,
  level = 2,
  focus = true,
  id,
  className,
}: {
  children: ReactNode;
  level?: 1 | 2;
  focus?: boolean;
  id?: string;
  className?: string;
}) {
  const ref = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    if (focus) ref.current?.focus({ preventScroll: false });
  }, [focus]);
  const Tag = level === 1 ? "h1" : "h2";
  return (
    <Tag ref={ref} tabIndex={-1} id={id} className={className}>
      {children}
    </Tag>
  );
}

export function Notice({
  kind = "info",
  icon,
  title,
  children,
  actions,
  role,
}: {
  kind?: "info" | "attention" | "error" | "success";
  icon?: string;
  title?: ReactNode;
  children?: ReactNode;
  actions?: ReactNode;
  role?: "status" | "alert";
}) {
  const cls = kind === "info" ? "notice" : `notice notice-${kind}`;
  const ic = icon ?? (kind === "error" ? "alert" : kind === "success" ? "check-circle" : "info");
  return (
    <div className={cls} role={role}>
      <Icon name={ic} />
      <div className="notice-body">
        {title ? (
          <p>
            <strong>{title}</strong>
          </p>
        ) : null}
        {children}
        {actions ? <div className="notice-actions">{actions}</div> : null}
      </div>
    </div>
  );
}

/* Объявления для экранного диктора: одна живая область на страницу. */
const AnnounceCtx = createContext<(text: string) => void>(() => {});
export const useAnnounce = () => useContext(AnnounceCtx);
const ClearCtx = createContext<() => void>(() => {});
/** Очистить общую живую область (при смене экрана). */
export const useAnnounceClear = () => useContext(ClearCtx);

export function AnnouncerProvider({ children }: { children: ReactNode }) {
  const [msg, setMsg] = useState("");
  const clearTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Объявление короткоживущее: через 5 секунд область очищается, чтобы на другом экране
  // не оставалась устаревшая фраза (VERIFY-2).
  const announce = useCallback((text: string) => {
    setMsg("");
    if (clearTimer.current) clearTimeout(clearTimer.current);
    setTimeout(() => setMsg(text), 60);
    clearTimer.current = setTimeout(() => setMsg(""), 5000);
  }, []);
  const clear = useCallback(() => {
    if (clearTimer.current) clearTimeout(clearTimer.current);
    setMsg("");
  }, []);
  return (
    <AnnounceCtx.Provider value={announce}>
      <ClearCtx.Provider value={clear}>{children}</ClearCtx.Provider>
      <div className="sr-only" role="status" aria-live="polite">
        {msg}
      </div>
    </AnnounceCtx.Provider>
  );
}

export function SyntheticBadge({ text }: { text?: string }) {
  const t = useT();
  return (
    <span className="badge-synth">
      <Icon name="flask" />
      <span>{text ?? t("badge.synthetic")}</span>
    </span>
  );
}

export function StubBadge({ loadSource }: { loadSource?: string | null }) {
  const t = useT();
  const placeholder = !loadSource || loadSource.includes("placeholder");
  return (
    <p className="badge-stub">
      <Icon name="info" />
      <span>{placeholder ? t("badge.stub_matrix") : t("badge.tribe")}</span>
    </p>
  );
}

export function SkeletonRows({ n = 3 }: { n?: number }) {
  return (
    <div aria-hidden="true">
      {Array.from({ length: n }, (_, i) => (
        <div className="skeleton-row" key={i}>
          <span />
          <span />
        </div>
      ))}
    </div>
  );
}
