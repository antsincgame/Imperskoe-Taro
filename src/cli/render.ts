/**
 * Рендер Имперского Таро в терминал: баннеры, панели карт, правила.
 *
 * Панели карт оформлены «руническим» стилем с левой границей — это
 * устойчиво к различиям в ширине символов между терминалами.
 */

import type { DrawnCard, Reading, Spread, TarotCard } from "../tarot/types.js";
import { meaningOf } from "../tarot/types.js";
import { turbulenceOmen } from "../tarot/shuffle.js";
import { SUIT_BY_ID } from "../tarot/suits.js";
import { WARP_RULES, WARP_RULES_PREAMBLE } from "../warp/rules.js";
import { color, elementColor } from "./ansi.js";

/** Видимая длина строки в кодовых точках (достаточно для кириллицы/латиницы). */
function len(s: string): number {
  return [...s].length;
}

/** Центрирует строку в поле заданной ширины. */
function center(s: string, width: number): string {
  const pad = Math.max(0, width - len(s));
  const left = Math.floor(pad / 2);
  return " ".repeat(left) + s + " ".repeat(pad - left);
}

/** Горизонтальная линейка. */
export function rule(width = 60, ch = "─"): string {
  return color.gray(ch.repeat(width));
}

/** Переносит текст по словам до заданной ширины. */
export function wrapText(text: string, width = 72): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let line = "";
  for (const w of words) {
    if (line === "") {
      line = w;
    } else if (len(line) + 1 + len(w) <= width) {
      line += " " + w;
    } else {
      lines.push(line);
      line = w;
    }
  }
  if (line) lines.push(line);
  return lines;
}

/** Главный баннер приложения. */
export function banner(): string {
  const W = 56;
  const top = "╔" + "═".repeat(W) + "╗";
  const bot = "╚" + "═".repeat(W) + "╝";
  const mid = (s: string): string => "║" + center(s, W) + "║";
  const lines = [
    color.gold(top),
    color.gold("║") + color.bold(center("✠  ИМПЕРСКОЕ ТАРО  ✠", W)) + color.gold("║"),
    color.gold("║") + color.dim(center("Гадание по варп-сети · Warhammer 40,000", W)) + color.gold("║"),
    color.gold("║") + color.gray(center("«Знание — оружие. Владей им мудро.»", W)) + color.gold("║"),
    color.gold(bot),
  ];
  // mid() оставлен для возможного расширения баннера.
  void mid;
  return lines.join("\n");
}

/** Значок-стрелка ориентации. */
function orientationMark(orientation: string): string {
  return orientation === "upright"
    ? color.green("▲ прямое")
    : color.red("▼ перевёрнутое");
}

/** Рисует «руническую» панель одной выложенной карты. */
export function renderCardPanel(drawn: DrawnCard, width = 64): string {
  const { card, orientation, position } = drawn;
  const tint = elementColor(card.element);
  const meaning = meaningOf(card, orientation);
  const arcana = card.arcana === "major" ? "Старший Аркан" : "Младший Аркан";
  const bar = color.gray("║ ");

  const head = `╓─ ${tint(card.glyph)} ${color.gray("─".repeat(Math.max(3, width - len(card.glyph) - 4)))}`;
  const foot = color.gray("╙" + "─".repeat(width - 1));

  const out: string[] = [];
  out.push(color.gray(head));
  out.push(bar + color.bold(`Позиция ${position.index}: ${position.name}`));
  out.push(bar + color.dim(position.meaning));
  out.push(bar);
  out.push(bar + tint(color.bold(card.name)) + color.gray(`  ·  ${orientationMark(orientation)}`));
  out.push(bar + color.italic(`${card.title} · ${arcana}`));
  out.push(bar + color.dim(`Ключи: ${meaning.keywords.join(", ")}`));
  out.push(bar);
  for (const line of wrapText(meaning.text, width - 4)) {
    out.push(bar + line);
  }
  out.push(foot);
  return out.join("\n");
}

/** Отображение турбулентности варпа с полоской-индикатором. */
export function renderTurbulence(turbulence: number, width = 30): string {
  const filled = Math.round(turbulence * width);
  const empty = width - filled;
  const tintFn =
    turbulence < 0.4 ? color.green : turbulence < 0.7 ? color.yellow : color.brightRed;
  const bar = tintFn("█".repeat(filled)) + color.gray("░".repeat(empty));
  const pct = `${(turbulence * 100).toFixed(0)}%`;
  return (
    color.bold("Турбулентность варпа: ") +
    bar +
    ` ${pct}\n` +
    color.dim(turbulenceOmen(turbulence))
  );
}

/** Заголовок расклада. */
export function renderSpreadHeader(spread: Spread, question: string): string {
  const out: string[] = [];
  out.push(color.bold(color.brightMagenta(`☼ Расклад: «${spread.name}» — ${spread.title}`)));
  out.push(color.dim(spread.description));
  if (question.trim()) {
    out.push(color.bold("Вопрос к варпу: ") + color.italic(question.trim()));
  } else {
    out.push(color.dim("Вопрос не задан — знамение общего течения судьбы."));
  }
  return out.join("\n");
}

/** Полный вывод расклада (без толкования). */
export function renderReading(reading: Reading): string {
  const out: string[] = [];
  out.push(renderSpreadHeader(reading.spread, reading.question));
  out.push("");
  out.push(renderTurbulence(reading.warpTurbulence));
  out.push("");
  for (const drawn of reading.cards) {
    out.push(renderCardPanel(drawn));
    out.push("");
  }
  return out.join("\n");
}

/** Свод правил гадания варп-сети. */
export function renderWarpRules(): string {
  const out: string[] = [];
  out.push(color.bold(color.brightMagenta("☼ ПРАВИЛА ГАДАНИЯ В ВАРП-СЕТИ")));
  out.push(color.dim(WARP_RULES_PREAMBLE));
  out.push("");
  for (const r of WARP_RULES) {
    out.push(color.gold(`  ${r.n}. ${color.bold(r.title)}`));
    for (const line of wrapText(r.text, 74)) {
      out.push(color.gray("     ") + line);
    }
    out.push("");
  }
  return out.join("\n").trimEnd();
}

/** Подробная карточка одной карты (для просмотра колоды). */
export function renderCardDetail(card: TarotCard): string {
  const tint = elementColor(card.element);
  const arcana = card.arcana === "major" ? "Старший Аркан" : "Младший Аркан";
  const suit = card.suit ? SUIT_BY_ID.get(card.suit) : undefined;
  const out: string[] = [];
  out.push(tint(color.bold(`${card.glyph}  ${card.name}`)) + color.gray(`  (${card.id})`));
  out.push(color.italic(card.title));
  out.push(
    color.dim(
      `${arcana} · №${card.number} · стихия: ${card.element}${suit ? ` · масть: ${suit.name}` : ""}`,
    ),
  );
  out.push("");
  out.push(color.gray("Лор:"));
  for (const line of wrapText(card.lore, 74)) out.push("  " + line);
  out.push("");
  out.push(color.green(color.bold("▲ Прямое положение:")) + color.dim(` ${card.upright.keywords.join(", ")}`));
  for (const line of wrapText(card.upright.text, 74)) out.push("  " + line);
  out.push("");
  out.push(color.red(color.bold("▼ Перевёрнутое положение:")) + color.dim(` ${card.reversed.keywords.join(", ")}`));
  for (const line of wrapText(card.reversed.text, 74)) out.push("  " + line);
  return out.join("\n");
}

/** Краткий список карт (id · имя · титул). */
export function renderCardLine(card: TarotCard): string {
  const tint = elementColor(card.element);
  return (
    color.gray(card.id.padEnd(22)) +
    tint(`${card.glyph} `) +
    color.bold(card.name.padEnd(20)) +
    color.dim(card.title)
  );
}
