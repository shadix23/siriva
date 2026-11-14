// Линейные значки 24x24, обводка 2 px. Всегда рядом с текстом (кроме картинок упражнений).
import type { ReactNode } from "react";

const P: Record<string, ReactNode> = {
  gear: (
    <>
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 0 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 0 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 0 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 0 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" />
    </>
  ),
  check: <path d="M20 6 9 17l-5-5" />,
  "check-circle": (
    <>
      <circle cx="12" cy="12" r="9.5" />
      <path d="m8 12.5 2.7 2.7L16.5 9.5" />
    </>
  ),
  arrow: <path d="M5 12h14M13 6l6 6-6 6" />,
  back: <path d="M19 12H5M11 6l-6 6 6 6" />,
  clock: (
    <>
      <circle cx="12" cy="12" r="9.5" />
      <path d="M12 7v5l3 2" />
    </>
  ),
  cloud: (
    <>
      <path d="M7 18a4.5 4.5 0 0 1-.6-9A6 6 0 0 1 18 9.5a4 4 0 0 1-.5 8.5" />
      <path d="M12 12v8M9 15l3-3 3 3" />
    </>
  ),
  mic: (
    <>
      <rect x="9" y="3" width="6" height="11" rx="3" />
      <path d="M5 11a7 7 0 0 0 14 0M12 18v3" />
    </>
  ),
  "mic-off": (
    <>
      <path d="M3 3l18 18M9 9v2a3 3 0 0 0 5.1 2.1M15 9.3V6a3 3 0 0 0-5.7-1.3" />
      <path d="M5 11a7 7 0 0 0 11.6 5.3M19 11a7 7 0 0 1-.6 2.8M12 18v3" />
    </>
  ),
  help: (
    <>
      <circle cx="12" cy="12" r="9.5" />
      <path d="M9.3 9a2.8 2.8 0 0 1 5.4 1c0 1.9-2.7 2.6-2.7 4" />
      <path d="M12 17.5h.01" />
    </>
  ),
  info: (
    <>
      <circle cx="12" cy="12" r="9.5" />
      <path d="M12 11v6M12 7.5h.01" />
    </>
  ),
  alert: (
    <>
      <path d="M12 3 2 20h20L12 3z" />
      <path d="M12 10v4.5M12 17.5h.01" />
    </>
  ),
  expand: <path d="M14 4h6v6M10 20H4v-6M20 4l-7 7M4 20l7-7" />,
  close: <path d="M6 6l12 12M18 6 6 18" />,
  flask: (
    <>
      <path d="M9 3h6M10 3v6l-5 9a2 2 0 0 0 1.8 3h10.4A2 2 0 0 0 19 18l-5-9V3" />
      <path d="M7.5 15h9" />
    </>
  ),
  play: <path d="M7 4.5v15l12-7.5z" />,
  pause: <path d="M8 5v14M16 5v14" />,
  replay: (
    <>
      <path d="M3 12a9 9 0 1 0 3-6.7" />
      <path d="M3 4v5h5" />
    </>
  ),
  text: <path d="M4 6h16M4 10h16M4 14h11M4 18h8" />,
  paw: (
    <>
      <circle cx="7" cy="9" r="2" />
      <circle cx="12" cy="6" r="2" />
      <circle cx="17" cy="9" r="2" />
      <path d="M12 12c-3 0-5.5 3.2-5.5 5.4 0 1.6 1.4 2.6 3 2.1 1-.3 1.7-.5 2.5-.5s1.5.2 2.5.5c1.6.5 3-.5 3-2.1C17.5 15.2 15 12 12 12z" />
    </>
  ),
  chart: <path d="M4 20V4M4 20h16M7 15l4-4 3 3 5-6" />,
  user: (
    <>
      <circle cx="12" cy="8" r="4" />
      <path d="M4 21c1.5-4 4.5-6 8-6s6.5 2 8 6" />
    </>
  ),
  trash: <path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3" />,
  // Предметы для «Узнать картинки, показанные раньше»: простые, без текста, не связаны по смыслу.
  cup: (
    <>
      <path d="M4 8h12v6a5 5 0 0 1-5 5H9a5 5 0 0 1-5-5V8z" />
      <path d="M16 10h1.5a2.5 2.5 0 0 1 0 5H16M8 3c0 1.5 1 1.5 1 3M12 3c0 1.5 1 1.5 1 3" />
    </>
  ),
  key: (
    <>
      <circle cx="7.5" cy="12" r="4" />
      <path d="M11.5 12H21M18 12v3M15 12v2" />
    </>
  ),
  apple: (
    <>
      <path d="M12 7.5c-2-1.5-6.5-1.2-6.5 4 0 4 2.8 8.5 4.8 8.5 1 0 1.2-.5 1.7-.5s.7.5 1.7.5c2 0 4.8-4.5 4.8-8.5 0-5.2-4.5-5.5-6.5-4z" />
      <path d="M12 7.5c0-2 .8-3.5 2.5-4.5M12.5 5.5c1.5-.3 2.7.2 3.3 1.3" />
    </>
  ),
  chair: <path d="M7 3v10h10V3M7 13l-1 8M17 13l1 8M7 9h10M6 13h12" />,
  boot: <path d="M7 3h6v9l6 3c1.2.6 2 1.5 2 3v2H4V3h3zM4 17h17M8 7h5" />,
  umbrella: (
    <>
      <path d="M3 12a9 9 0 0 1 18 0H3z" />
      <path d="M12 12v6.5a2 2 0 0 1-4 0M12 3v0" />
    </>
  ),
  lamp: <path d="M8 3h8l3 8H5l3-8zM12 11v8M8 21h8M14 15h3" />,
  watch: (
    <>
      <circle cx="12" cy="12" r="5.5" />
      <path d="M12 9.5V12l1.5 1.5M9 7 9.5 3h5l.5 4M9 17l.5 4h5l.5-4" />
    </>
  ),
  book: <path d="M4 5c3-1 5.5-1 8 1v14c-2.5-2-5-2-8-1V5zM20 5c-3-1-5.5-1-8 1v14c2.5-2 5-2 8-1V5z" />,
  comb: <path d="M3 9h18v3H3zM5 12v6M8 12v6M11 12v6M14 12v6M17 12v6M20 12v4" />,
  spoon: (
    <>
      <ellipse cx="12" cy="7" rx="3.5" ry="4.5" />
      <path d="M12 11.5V21" />
    </>
  ),
  ball: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M3.5 9.5c5 1.5 12 1.5 17 0M3.5 14.5c5-1.5 12-1.5 17 0M12 3c-2.5 3-2.5 15 0 18" />
    </>
  ),
  scissors: (
    <>
      <circle cx="6.5" cy="17.5" r="2.5" />
      <circle cx="17.5" cy="17.5" r="2.5" />
      <path d="M8.3 15.7 17 4M15.7 15.7 7 4" />
    </>
  ),
  bucket: <path d="M5 8h14l-1.5 12h-11L5 8zM5 8a7 5 0 0 1 14 0M8 12h8" />,
  candle: <path d="M9 10h6v11H9zM12 10V7M12 7c-1.2-1-1.2-2.5 0-4 1.2 1.5 1.2 3 0 4zM7 21h10" />,
  bicycle: (
    <>
      <circle cx="6" cy="16" r="3.5" />
      <circle cx="18" cy="16" r="3.5" />
      <path d="M6 16l4-7h5l3 7M10 9l3 7h-1M15 9l-1-3h2M9 6h3" />
    </>
  ),
};

export type IconName = keyof typeof P;

export function Icon({ name, className = "icon", label }: { name: string; className?: string; label?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      aria-hidden={label ? undefined : true}
      role={label ? "img" : undefined}
      aria-label={label}
      focusable="false"
    >
      {P[name] ?? null}
    </svg>
  );
}

export const RECOG_OBJECTS: { id: string; name: string }[] = [
  { id: "cup", name: "чашка" },
  { id: "key", name: "ключ" },
  { id: "apple", name: "яблоко" },
  { id: "chair", name: "стул" },
  { id: "boot", name: "ботинок" },
  { id: "umbrella", name: "зонт" },
  { id: "lamp", name: "лампа" },
  { id: "watch", name: "часы" },
  { id: "book", name: "книга" },
  { id: "comb", name: "расчёска" },
  { id: "spoon", name: "ложка" },
  { id: "ball", name: "мяч" },
  { id: "scissors", name: "ножницы" },
  { id: "bucket", name: "ведро" },
  { id: "candle", name: "свеча" },
  { id: "bicycle", name: "велосипед" },
];
