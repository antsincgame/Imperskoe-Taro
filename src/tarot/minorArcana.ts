/**
 * Младшие Арканы Имперского Таро — 56 карт (4 масти × 14 рангов).
 *
 * Карты выкованы из мастей (suits.ts) и архетипов рангов: домен масти
 * определяет сферу жизни, ранг — стадию и характер силы. Такой подход
 * держит толкования согласованными и легко расширяемыми.
 */

import type { CardMeaning, SuitId, TarotCard } from "./types.js";
import { COURT_NAMES, RANKS, SUITS, type RankArchetype, type SuitDef } from "./suits.js";

/** Делает первую букву строки заглавной. */
function capitalize(s: string): string {
  return s.length === 0 ? s : s[0]!.toUpperCase() + s.slice(1);
}

/** Берёт первые n уникальных элементов из нескольких источников. */
function pickKeywords(n: number, ...sources: readonly (readonly string[])[]): string[] {
  const out: string[] = [];
  for (const src of sources) {
    for (const k of src) {
      if (!out.includes(k)) out.push(k);
      if (out.length >= n) return out;
    }
  }
  return out;
}

/** Имя карты: «Туз Аквил», «Канонисса Чаш». */
function cardName(rank: RankArchetype, suit: SuitDef): string {
  return `${rank.name} ${suit.genitive}`;
}

/** Слаг ранга для идентификатора. */
const RANK_SLUG: Readonly<Record<number, string>> = {
  1: "ace",
  2: "two",
  3: "three",
  4: "four",
  5: "five",
  6: "six",
  7: "seven",
  8: "eight",
  9: "nine",
  10: "ten",
  11: "servitor",
  12: "crusader",
  13: "canoness",
  14: "lord",
};

/** Признак придворной (фигурной) карты. */
export function isCourtRank(rank: number): boolean {
  return rank >= 11;
}

function buildUpright(rank: RankArchetype, suit: SuitDef): CardMeaning {
  const text = `${capitalize(rank.upright)} — в сфере, которой ведают ${suit.name} (${suit.themeShort}): ${suit.contextUpright}.`;
  return {
    keywords: pickKeywords(4, rank.uprightKeywords, suit.uprightKeywords),
    text,
  };
}

function buildReversed(rank: RankArchetype, suit: SuitDef): CardMeaning {
  const text = `${capitalize(rank.reversed)} — в сфере, которой ведают ${suit.name} (${suit.themeShort}): ${suit.contextReversed}.`;
  return {
    keywords: pickKeywords(4, rank.reversedKeywords, suit.reversedKeywords),
    text,
  };
}

function buildCard(rank: RankArchetype, suit: SuitDef): TarotCard {
  const rankPad = String(rank.rank).padStart(2, "0");
  const courtTitle = COURT_NAMES[rank.rank];
  const title = courtTitle
    ? `${courtTitle} — ${suit.themeShort}`
    : `${rank.archetype} — ${suit.themeShort}`;

  return {
    id: `${suit.id}-${rankPad}-${RANK_SLUG[rank.rank]}`,
    arcana: "minor",
    number: rank.rank,
    name: cardName(rank, suit),
    title,
    suit: suit.id,
    element: suit.element,
    glyph: suit.glyph,
    lore: `«${rank.archetype}» масти ${suit.name}. ${suit.lore}`,
    upright: buildUpright(rank, suit),
    reversed: buildReversed(rank, suit),
  };
}

/** Все 56 Младших Арканов, сгруппированные по порядку мастей и рангов. */
export const MINOR_ARCANA: readonly TarotCard[] = SUITS.flatMap((suit) =>
  RANKS.map((rank) => buildCard(rank, suit)),
);

/** Младшие Арканы конкретной масти. */
export function minorBySuit(suit: SuitId): readonly TarotCard[] {
  return MINOR_ARCANA.filter((c) => c.suit === suit);
}
