/**
 * Полная колода Имперского Таро — 78 священных карт.
 *
 * 22 Старших Аркана (Великий Цикл) + 56 Младших (4 имперские масти).
 */

import type { Arcana, SuitId, TarotCard } from "./types.js";
import { MAJOR_ARCANA } from "./majorArcana.js";
import { MINOR_ARCANA } from "./minorArcana.js";

/** Полная колода в каноническом порядке. */
export const FULL_DECK: readonly TarotCard[] = [...MAJOR_ARCANA, ...MINOR_ARCANA];

/** Ожидаемые размеры колоды (для самопроверки целостности). */
export const DECK_SIZE = {
  major: 22,
  minor: 56,
  total: 78,
} as const;

const BY_ID: ReadonlyMap<string, TarotCard> = new Map(FULL_DECK.map((c) => [c.id, c]));

/** Находит карту по идентификатору. */
export function cardById(id: string): TarotCard | undefined {
  return BY_ID.get(id);
}

/** Карты заданного класса (старшие/младшие). */
export function cardsByArcana(arcana: Arcana): readonly TarotCard[] {
  return FULL_DECK.filter((c) => c.arcana === arcana);
}

/** Карты заданной масти. */
export function cardsBySuit(suit: SuitId): readonly TarotCard[] {
  return FULL_DECK.filter((c) => c.suit === suit);
}

/**
 * Проверяет целостность колоды: количество карт, уникальность id,
 * отсутствие дублей. Бросает исключение при ереси данных.
 */
export function assertDeckIntegrity(deck: readonly TarotCard[] = FULL_DECK): void {
  if (deck.length !== DECK_SIZE.total) {
    throw new Error(
      `Ересь данных: в колоде ${deck.length} карт вместо ${DECK_SIZE.total}.`,
    );
  }
  const ids = new Set<string>();
  for (const card of deck) {
    if (ids.has(card.id)) {
      throw new Error(`Ересь данных: повторяющийся идентификатор карты «${card.id}».`);
    }
    ids.add(card.id);
  }
  const majors = deck.filter((c) => c.arcana === "major").length;
  const minors = deck.filter((c) => c.arcana === "minor").length;
  if (majors !== DECK_SIZE.major || minors !== DECK_SIZE.minor) {
    throw new Error(
      `Ересь данных: ${majors} старших / ${minors} младших (ожидалось ${DECK_SIZE.major}/${DECK_SIZE.minor}).`,
    );
  }
}
