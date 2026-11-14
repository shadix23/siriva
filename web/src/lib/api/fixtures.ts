// Временные данные за тем же интерфейсом, пока эндпоинта нет в контракте.
import type { DemoNumbers } from "./types";

/** Р12: GET /demo/numbers. Чисел нет, пока нет доступа к ADReSS: только статус. */
export const FIXTURE_NUMBERS: DemoNumbers = {
  adress: { status: "pending", accuracy: null, test_n: 48, baseline: 0.75 },
  agreement: { status: "pending", value: null, method: null },
};
