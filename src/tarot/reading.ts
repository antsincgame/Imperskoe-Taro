/**
 * Проведение гадания: от тасования до выложенного расклада.
 */

import { randomUUID } from "node:crypto";
import type { DrawnCard, Reading, Spread, TarotCard } from "./types.js";
import { FULL_DECK } from "./deck.js";
import {
  drawTop,
  readWarpTurbulence,
  rollOrientation,
  shuffleDeck,
} from "./shuffle.js";
import type { Rng } from "../lib/rng.js";
import { cryptoRng, seededRng } from "../lib/rng.js";

/** Параметры обряда гадания. */
export interface ReadingOptions {
  /** Вопрос, заданный варпу. */
  question: string;
  /** Расклад, по которому ведётся гадание. */
  spread: Spread;
  /** Колода (по умолчанию — полная каноническая). */
  deck?: readonly TarotCard[];
  /** Источник случайности (по умолчанию — криптографический). */
  rng?: Rng;
  /**
   * Зерно для воспроизводимого гадания. Если задано, переопределяет rng
   * детерминированным ГПСЧ — одно и то же зерно даёт тот же расклад.
   */
  seed?: string | number;
}

/**
 * Проводит полный обряд гадания и возвращает завершённое прорицание.
 *
 * Порядок обряда:
 *   1. Считывается турбулентность варпа.
 *   2. Колода трижды очищается тасованием.
 *   3. По числу позиций расклада снимаются карты с верха.
 *   4. Каждой карте определяется положение (прямое/перевёрнутое).
 */
export function performReading(options: ReadingOptions): Reading {
  const { question, spread } = options;
  const deck = options.deck ?? FULL_DECK;
  const rng: Rng =
    options.seed !== undefined ? seededRng(options.seed) : options.rng ?? cryptoRng();

  const need = spread.positions.length;
  if (need > deck.length) {
    throw new Error(
      `Расклад «${spread.name}» требует ${need} карт, но в колоде лишь ${deck.length}.`,
    );
  }

  const turbulence = readWarpTurbulence(rng);
  const shuffled = shuffleDeck(deck, rng);
  const drawn = drawTop(shuffled, need);

  const cards: DrawnCard[] = drawn.map((card, i) => ({
    card,
    orientation: rollOrientation(turbulence, rng),
    position: spread.positions[i]!,
  }));

  return {
    id: randomUUID(),
    question: question.trim(),
    spread,
    cards,
    drawnAt: new Date().toISOString(),
    warpTurbulence: turbulence,
  };
}
