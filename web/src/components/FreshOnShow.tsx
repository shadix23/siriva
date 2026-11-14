"use client";
// С cacheComponents Next прячет ушедшие страницы в <Activity> и сохраняет их состояние.
// Экранам пациента нужно свежее состояние при каждом показе: иначе «Сегодня» с первого
// визита (пациента ещё нет) снова уводит на согласие и путь зацикливается (VERIFY-1 V-01),
// а этап упражнения и программа показываются устаревшими. Когда страница прячется,
// очистка layout-эффекта меняет ключ, и при следующем показе поддерево монтируется заново.
import { Fragment, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { useAnnounceClear } from "./ui";

export function FreshOnShow({ children }: { children: ReactNode }) {
  const [generation, setGeneration] = useState(0);
  const wasHidden = useRef(false);
  const clearAnnouncer = useAnnounceClear();
  // Ключ меняется при ПОКАЗЕ скрытой страницы, а не при скрытии: иначе новое поддерево
  // монтируется ещё в скрытом состоянии и читает устаревшее хранилище (например, «пациента нет»
  // до согласия), а при показе так и остаётся на «Готовим программу».
  // При показе и при уходе общая живая область очищается: старая фраза не звучит на новом экране.
  useLayoutEffect(() => {
    clearAnnouncer();
    if (wasHidden.current) {
      wasHidden.current = false;
      setGeneration((g) => g + 1);
    }
    return () => {
      clearAnnouncer();
      wasHidden.current = true;
    };
  }, [clearAnnouncer]);
  return <Fragment key={generation}>{children}</Fragment>;
}
