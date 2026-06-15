/**
 * Священные типы Имперского Таро.
 *
 * ++ Когитатор-онтология. Да направит Омниссия чистоту данных. ++
 */

/** Положение карты при раскладе. */
export type Orientation = "upright" | "reversed";

/** Класс аркана. */
export type Arcana = "major" | "minor";

/** Идентификаторы имперских мастей Младших Арканов. */
export type SuitId = "aquila" | "bolter" | "chalice" | "blade";

/**
 * Стихии варпа. Четыре материальные плюс «эфир» (имматериум) —
 * стихия Старших Арканов, проводящих волю Императора.
 */
export type Element = "fire" | "water" | "air" | "earth" | "aether";

/** Толкование одной стороны карты. */
export interface CardMeaning {
  /** Ключевые слова — краткие маяки толкования. */
  readonly keywords: readonly string[];
  /** Развёрнутое толкование на языке Империума. */
  readonly text: string;
}

/** Каноническая запись об одной карте колоды. */
export interface TarotCard {
  /** Уникальный слаг карты, напр. "major-04-emperor" или "bolter-14-lord". */
  readonly id: string;
  readonly arcana: Arcana;
  /** Для Старших — 0..21, для Младших — ранг 1..14. */
  readonly number: number;
  /** Отображаемое имя (русское). */
  readonly name: string;
  /** Имперский титул/эпитет карты. */
  readonly title: string;
  /** Масть — только у Младших Арканов. */
  readonly suit?: SuitId;
  readonly element: Element;
  /** Лор-врезка в сеттинге Warhammer 40,000. */
  readonly lore: string;
  /** Прямое (восходящее) толкование. */
  readonly upright: CardMeaning;
  /** Перевёрнутое (нисходящее) толкование. */
  readonly reversed: CardMeaning;
  /** Краткий глиф/сигил карты для рендера. */
  readonly glyph: string;
}

/** Позиция в раскладе. */
export interface SpreadPosition {
  /** Порядковый индекс позиции, начиная с 1. */
  readonly index: number;
  /** Краткое имя позиции, напр. «Прошлое». */
  readonly name: string;
  /** Что эта позиция вопрошает у варпа. */
  readonly meaning: string;
}

/** Определение расклада. */
export interface Spread {
  readonly id: string;
  /** Отображаемое имя расклада. */
  readonly name: string;
  /** Имперский титул расклада. */
  readonly title: string;
  /** Назначение и применение расклада. */
  readonly description: string;
  readonly positions: readonly SpreadPosition[];
}

/** Карта, выложенная в конкретную позицию расклада. */
export interface DrawnCard {
  readonly card: TarotCard;
  readonly orientation: Orientation;
  readonly position: SpreadPosition;
}

/** Полностью завершённое гадание. */
export interface Reading {
  /** Идентификатор сеанса (для журнала прорицаний). */
  readonly id: string;
  /** Вопрос, заданный варпу. */
  readonly question: string;
  readonly spread: Spread;
  readonly cards: readonly DrawnCard[];
  /** Метка времени проведения ритуала (ISO 8601). */
  readonly drawnAt: string;
  /**
   * Турбулентность варпа в момент гадания: 0 (штиль) … 1 (шторм).
   * Влияет на знамение и на склонность карт ложиться перевёрнуто.
   */
  readonly warpTurbulence: number;
}

/** Возвращает действующее толкование карты согласно её ориентации. */
export function meaningOf(card: TarotCard, orientation: Orientation): CardMeaning {
  return orientation === "upright" ? card.upright : card.reversed;
}
