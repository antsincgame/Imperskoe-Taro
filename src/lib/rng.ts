/**
 * Генераторы случайности для ритуала.
 *
 * По умолчанию используется криптографический источник (node:crypto):
 * варп не должен быть предсказуем. Для тестов и воспроизводимых
 * прорицаний доступен детерминированный ГПСЧ с зерном.
 */

import { randomInt } from "node:crypto";

/** Минимальный интерфейс источника случайности. */
export interface Rng {
  /** Случайное число с плавающей точкой в [0, 1). */
  next(): number;
  /** Случайное целое в [0, maxExclusive). */
  int(maxExclusive: number): number;
}

/** Криптографический источник случайности (непредсказуемый варп). */
export function cryptoRng(): Rng {
  return {
    int(maxExclusive: number): number {
      if (maxExclusive <= 0) return 0;
      return randomInt(maxExclusive);
    },
    next(): number {
      // 53-битная мантисса из двух 32-битных слов криптослучайности.
      const hi = randomInt(0x20000000); // 29 бит
      const lo = randomInt(0x800000); // 24 бита
      return (hi * 0x800000 + lo) / 0x20000000000000;
    },
  };
}

/** Хеширует произвольное зерно в 32-битное беззнаковое число (xmur3). */
function hashSeed(seed: string): number {
  let h = 1779033703 ^ seed.length;
  for (let i = 0; i < seed.length; i++) {
    h = Math.imul(h ^ seed.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  h = Math.imul(h ^ (h >>> 16), 2246822507);
  h = Math.imul(h ^ (h >>> 13), 3266489909);
  return (h ^= h >>> 16) >>> 0;
}

/**
 * Детерминированный ГПСЧ (mulberry32) с зерном.
 * Одно и то же зерно всегда даёт одно и то же гадание — полезно
 * для тестов и для повторного «считывания» того же знамения.
 */
export function seededRng(seed: string | number): Rng {
  let state = typeof seed === "number" ? seed >>> 0 : hashSeed(seed);
  const next = (): number => {
    state |= 0;
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return {
    next,
    int(maxExclusive: number): number {
      if (maxExclusive <= 0) return 0;
      return Math.floor(next() * maxExclusive);
    },
  };
}
