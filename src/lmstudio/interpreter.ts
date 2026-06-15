/**
 * Толкование расклада: оркестрация LM Studio с офлайн-резервом.
 *
 * Если когитатор LM Studio доступен — толкование вещается потоком от модели.
 * Если нет — собирается достойное офлайн-прорицание из канонических
 * значений карт, чтобы обряд завершался даже без внешнего сервера.
 */

import type { Reading } from "../tarot/types.js";
import { meaningOf } from "../tarot/types.js";
import { turbulenceOmen } from "../tarot/shuffle.js";
import { LMStudioClient } from "./client.js";
import { buildMessages } from "./promptBuilder.js";

/** Источник толкования. */
export type InterpretationSource = "lmstudio" | "offline";

/** Результат толкования. */
export interface Interpretation {
  text: string;
  source: InterpretationSource;
  model?: string;
  /** Заполняется, если был запрошен LM Studio, но произошёл сбой. */
  warning?: string;
}

/** Параметры толкования. */
export interface InterpretOptions {
  /** Клиент LM Studio. Если не задан — сразу офлайн-резерв. */
  client?: LMStudioClient;
  /** Принудительный офлайн-режим (без обращения к LM Studio). */
  offline?: boolean;
  /** Колбэк потоковой выдачи: вызывается на каждый фрагмент текста. */
  onToken?: (chunk: string) => void;
  /** Сигнал прерывания. */
  signal?: AbortSignal;
}

/**
 * Истолковывает расклад. Возвращает итоговый текст и его источник.
 * При сбое LM Studio мягко откатывается к офлайн-прорицанию.
 */
export async function interpretReading(
  reading: Reading,
  options: InterpretOptions = {},
): Promise<Interpretation> {
  const { client, offline, onToken, signal } = options;

  if (offline || !client) {
    const text = offlineInterpretation(reading);
    onToken?.(text);
    return { text, source: "offline" };
  }

  try {
    const model = await client.resolveModel(signal);
    const messages = buildMessages(reading);
    let text = "";
    for await (const chunk of client.streamChat(messages, { model, signal })) {
      text += chunk;
      onToken?.(chunk);
    }
    if (text.trim() === "") {
      // Модель промолчала — откатываемся к резерву.
      const fallback = offlineInterpretation(reading);
      onToken?.(fallback);
      return {
        text: fallback,
        source: "offline",
        warning: "LM Studio вернул пустой ответ; явлено офлайн-прорицание.",
      };
    }
    return { text, source: "lmstudio", model };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const fallback = offlineInterpretation(reading);
    onToken?.(fallback);
    return {
      text: fallback,
      source: "offline",
      warning: `Когитатор LM Studio недоступен (${message}); явлено офлайн-прорицание.`,
    };
  }
}

/**
 * Собирает офлайн-прорицание из канонических значений карт.
 * Структура повторяет ту, что запрашивается у модели: обращение,
 * толкование по позициям, сведение знаков и благословение.
 */
export function offlineInterpretation(reading: Reading): string {
  const out: string[] = [];
  const q = reading.question.trim();

  out.push(
    q
      ? `Вопрошающий, варп внял вопросу твоему: «${q}». Внимай знакам.`
      : "Вопрошающий, варп являет общее течение судьбы твоей. Внимай знакам.",
  );
  out.push(`Турбулентность имматериума: ${turbulenceOmen(reading.warpTurbulence)}`);
  out.push("");

  for (const drawn of reading.cards) {
    const { card, orientation, position } = drawn;
    const meaning = meaningOf(card, orientation);
    const orient = orientation === "upright" ? "в прямом положении" : "перевёрнутой";
    out.push(`❧ ${position.name} — ${card.name} (${orient}):`);
    out.push(`   ${meaning.text}`);
  }

  out.push("");
  out.push("Сведение знаков:");
  out.push(`   ${synthesize(reading)}`);
  out.push("");
  out.push("Да хранит тебя Свет Императора на избранном пути. ✠");

  return out.join("\n");
}

/** Формирует обобщающий вывод по составу расклада. */
function synthesize(reading: Reading): string {
  const total = reading.cards.length;
  const majors = reading.cards.filter((c) => c.card.arcana === "major").length;
  const reversed = reading.cards.filter((c) => c.orientation === "reversed").length;

  // Преобладающая масть среди Младших Арканов.
  const suitCount = new Map<string, number>();
  for (const d of reading.cards) {
    if (d.card.suit) suitCount.set(d.card.suit, (suitCount.get(d.card.suit) ?? 0) + 1);
  }
  let topSuit: string | undefined;
  let topSuitN = 0;
  for (const [suit, n] of suitCount) {
    if (n > topSuitN) {
      topSuit = suit;
      topSuitN = n;
    }
  }

  const suitVoice: Record<string, string> = {
    aquila: "сфера плоти, трудов и достатка",
    bolter: "сфера воли, веры и деяния",
    chalice: "сфера чувств, уз и души",
    blade: "сфера разума, истины и борьбы",
  };

  const parts: string[] = [];

  if (majors >= Math.ceil(total / 2)) {
    parts.push(
      `Старшие Арканы главенствуют (${majors} из ${total}) — здесь правят силы судьбы, что превыше повседневной воли; событие судьбоносно.`,
    );
  } else {
    parts.push(
      `Расклад ведом Младшими Арканами — речь о делах земных, в твоей власти и в твоих руках.`,
    );
  }

  if (topSuit && topSuitN >= 2) {
    parts.push(`Преобладает ${suitVoice[topSuit] ?? "одна из сфер"} — там и лежит узел вопроса.`);
  }

  if (reversed === 0) {
    parts.push("Ни одна карта не легла навыворот — путь открыт и знаки благосклонны.");
  } else if (reversed >= Math.ceil(total / 2)) {
    parts.push(
      `Многие карты перевёрнуты (${reversed} из ${total}) — силы скованы или искажены; прежде деяния устрани препятствия внутри себя.`,
    );
  } else {
    parts.push(
      `Часть карт перевёрнута (${reversed} из ${total}) — на пути есть затруднения, но они преодолимы волей и верой.`,
    );
  }

  parts.push(
    "Помни догмат: знаки являют склонение судьбы, но выбор и деяние — за тобой. Знание — оружие; владей им мудро.",
  );

  return parts.join(" ");
}
