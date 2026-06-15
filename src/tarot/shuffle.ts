/**
 * Ритуал тасования и определения положения карт.
 *
 * Тасование — это очищающий обряд: колода трижды проходит через
 * перестановку Фишера—Йетса. Турбулентность варпа в момент гадания
 * определяет, насколько охотно карты ложатся перевёрнуто.
 */

import type { Orientation, TarotCard } from "./types.js";
import type { Rng } from "../lib/rng.js";
import { cryptoRng } from "../lib/rng.js";

/** Число проходов очищающего тасования. */
const SHUFFLE_PASSES = 3;

/**
 * Возвращает новую перетасованную колоду (исходный массив не меняется).
 * Перестановка Фишера—Йетса, повторённая SHUFFLE_PASSES раз.
 */
export function shuffleDeck(
  deck: readonly TarotCard[],
  rng: Rng = cryptoRng(),
): TarotCard[] {
  const arr = [...deck];
  for (let pass = 0; pass < SHUFFLE_PASSES; pass++) {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = rng.int(i + 1);
      const tmp = arr[i]!;
      arr[i] = arr[j]!;
      arr[j] = tmp;
    }
  }
  return arr;
}

/**
 * Считывает турбулентность варпа: число в [0, 1].
 * 0 — штиль имматериума, 1 — варп-шторм. Влияет на знамение и на
 * вероятность перевёрнутых карт.
 */
export function readWarpTurbulence(rng: Rng = cryptoRng()): number {
  // Смещаем распределение к середине: экстремальные шторма редки.
  const a = rng.next();
  const b = rng.next();
  return (a + b) / 2;
}

/**
 * Вероятность того, что карта ляжет перевёрнуто, при заданной
 * турбулентности. От 0.18 (штиль) до 0.62 (шторм).
 */
export function reversalProbability(turbulence: number): number {
  const clamped = Math.min(1, Math.max(0, turbulence));
  return 0.18 + 0.44 * clamped;
}

/** Определяет ориентацию одной карты при данной турбулентности. */
export function rollOrientation(turbulence: number, rng: Rng = cryptoRng()): Orientation {
  return rng.next() < reversalProbability(turbulence) ? "reversed" : "upright";
}

/** Снимает n карт с верха колоды (без определения ориентации). */
export function drawTop(deck: readonly TarotCard[], n: number): TarotCard[] {
  if (n > deck.length) {
    throw new Error(
      `Невозможно снять ${n} карт: в колоде лишь ${deck.length}.`,
    );
  }
  return deck.slice(0, n);
}

/** Краткое словесное описание уровня турбулентности (для знамения). */
export function turbulenceOmen(turbulence: number): string {
  if (turbulence < 0.2) return "Штиль имматериума: знаки читаются ясно.";
  if (turbulence < 0.4) return "Лёгкая рябь варпа: толкование надёжно.";
  if (turbulence < 0.6) return "Варп неспокоен: знаки двоятся, будь внимателен.";
  if (turbulence < 0.8) return "Варп-буря крепчает: многие карты ложатся навыворот.";
  return "ВАРП-ШТОРМ! Завеса истончилась — внимай знакам с трепетом.";
}
