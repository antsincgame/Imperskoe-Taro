/**
 * Построение промптов для толкования расклада когитатором LM Studio.
 *
 * Системный промпт задаёт голос имперского астропата-толкователя;
 * пользовательский — точное описание выпавшего расклада, опирающееся
 * на канонические значения карт (модель толкует знаки, а не выдумывает их).
 */

import type { Reading } from "../tarot/types.js";
import { meaningOf } from "../tarot/types.js";
import { turbulenceOmen } from "../tarot/shuffle.js";
import type { ChatMessage } from "./client.js";

/** Системный промпт — личность и устав толкователя. */
export const SYSTEM_PROMPT = `Ты — Астропат-Прорицатель Адептус Астра Телепатика, толкователь священного Имперского Таро в сеттинге Warhammer 40,000. Ты вещаешь во имя Бога-Императора Человечества.

ТВОЯ ЗАДАЧА: истолковать выложенный расклад как ответ на вопрос вопрошающего.

ПРАВИЛА ТОЛКОВАНИЯ:
1. Отвечай ИСКЛЮЧИТЕЛЬНО на русском языке.
2. Держись величественного, мрачно-торжественного имперского тона (астропат, видящий сквозь варп). Уместны обороты вроде «во имя Императора», «варп являет», «знаки гласят», но без перегибов и без современного сленга.
3. Опирайся СТРОГО на приведённые значения карт, их положение (прямое/перевёрнутое) и позицию в раскладе. Не выдумывай иных карт.
4. Свяжи карты в единое повествование, отвечающее на вопрос, а не толкуй их разрозненно.
5. Учитывай турбулентность варпа: чем она выше, тем осторожнее и иносказательнее выводы.
6. Помни догмат: Таро являет склонение судьбы, но не отменяет свободной воли. Дай совет, а не приговор.

СТРУКТУРА ОТВЕТА:
— Краткое обращение к вопрошающему и упоминание вопроса.
— Толкование каждой карты по её позиции (1–3 предложения на карту).
— «Сведение знаков»: цельный вывод-ответ на вопрос.
— Завершающее благословение в одну строку.

Будь содержателен, но не многословен.`;

/** Формирует человекочитаемое описание расклада для модели. */
export function describeReading(reading: Reading): string {
  const lines: string[] = [];
  lines.push(`ВОПРОС ВОПРОШАЮЩЕГО: ${reading.question || "(без слов; знамение общего течения судьбы)"}`);
  lines.push("");
  lines.push(`РАСКЛАД: «${reading.spread.name}» — ${reading.spread.title}.`);
  lines.push(reading.spread.description);
  lines.push("");
  lines.push(
    `ТУРБУЛЕНТНОСТЬ ВАРПА: ${(reading.warpTurbulence * 100).toFixed(0)}% — ${turbulenceOmen(reading.warpTurbulence)}`,
  );
  lines.push("");
  lines.push("ВЫПАВШИЕ КАРТЫ:");

  for (const drawn of reading.cards) {
    const { card, orientation, position } = drawn;
    const orient = orientation === "upright" ? "прямое" : "перевёрнутое";
    const meaning = meaningOf(card, orientation);
    const arcana =
      card.arcana === "major" ? "Старший Аркан" : "Младший Аркан";
    lines.push("");
    lines.push(`[Позиция ${position.index}] ${position.name} — ${position.meaning}`);
    lines.push(`  Карта: ${card.name} (${card.title}) · ${arcana}`);
    lines.push(`  Положение: ${orient}.`);
    lines.push(`  Ключевые слова: ${meaning.keywords.join(", ")}.`);
    lines.push(`  Значение: ${meaning.text}`);
  }

  return lines.join("\n");
}

/** Собирает полный набор сообщений для запроса к LM Studio. */
export function buildMessages(reading: Reading): ChatMessage[] {
  return [
    { role: "system", content: SYSTEM_PROMPT },
    {
      role: "user",
      content: `${describeReading(reading)}\n\nИстолкуй этот расклад как ответ вопрошающему.`,
    },
  ];
}
