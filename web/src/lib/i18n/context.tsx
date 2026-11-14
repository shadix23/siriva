"use client";
// Переводчик для общих компонентов (упражнение, шапка). По умолчанию русский словарь ru.json.
// В демо (D2) и на экране близкого подставляется переводчик демо с английским, если выбран EN.
import { createContext, useContext } from "react";
import { t as tRu, type MsgKey } from "./index";

export type Translate = (key: MsgKey, params?: Record<string, string | number>) => string;
export const TranslateContext = createContext<Translate>(tRu);
export const useT = () => useContext(TranslateContext);
