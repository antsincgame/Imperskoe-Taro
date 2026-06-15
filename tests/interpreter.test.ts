import { test } from "node:test";
import assert from "node:assert/strict";

import { performReading } from "../src/tarot/reading.js";
import { spreadById } from "../src/tarot/spreads.js";
import {
  interpretReading,
  offlineInterpretation,
} from "../src/lmstudio/interpreter.js";
import { buildMessages, describeReading } from "../src/lmstudio/promptBuilder.js";
import { loadLMStudioConfig, DEFAULT_LMSTUDIO_CONFIG } from "../src/lmstudio/config.js";

function sampleReading() {
  return performReading({
    question: "Ждать ли мне повышения в Адептус Механикус?",
    spread: spreadById("triptych")!,
    seed: "mars-1138",
  });
}

test("офлайн-прорицание содержит вопрос, все позиции и благословение", () => {
  const reading = sampleReading();
  const text = offlineInterpretation(reading);
  assert.ok(text.includes("Адептус Механикус"), "нет вопроса");
  for (const c of reading.cards) {
    assert.ok(text.includes(c.position.name), `нет позиции ${c.position.name}`);
    assert.ok(text.includes(c.card.name), `нет карты ${c.card.name}`);
  }
  assert.ok(text.includes("Сведение знаков"), "нет сведения знаков");
  assert.ok(/Императора/.test(text), "нет благословения");
});

test("interpretReading в офлайн-режиме возвращает источник offline и зовёт onToken", async () => {
  const reading = sampleReading();
  let streamed = "";
  const result = await interpretReading(reading, {
    offline: true,
    onToken: (c) => {
      streamed += c;
    },
  });
  assert.equal(result.source, "offline");
  assert.ok(result.text.length > 0);
  assert.equal(streamed, result.text);
});

test("interpretReading без клиента откатывается в офлайн", async () => {
  const reading = sampleReading();
  const result = await interpretReading(reading, {});
  assert.equal(result.source, "offline");
});

test("describeReading включает турбулентность и значения карт", () => {
  const reading = sampleReading();
  const desc = describeReading(reading);
  assert.ok(desc.includes("ТУРБУЛЕНТНОСТЬ ВАРПА"));
  assert.ok(desc.includes("ВЫПАВШИЕ КАРТЫ"));
  for (const c of reading.cards) assert.ok(desc.includes(c.card.name));
});

test("buildMessages формирует системное и пользовательское сообщения", () => {
  const reading = sampleReading();
  const messages = buildMessages(reading);
  assert.equal(messages.length, 2);
  assert.equal(messages[0]!.role, "system");
  assert.equal(messages[1]!.role, "user");
  assert.ok(messages[0]!.content.includes("Имперского Таро"));
});

test("конфигурация LM Studio имеет каноничные значения по умолчанию", () => {
  const cfg = loadLMStudioConfig();
  assert.equal(cfg.baseUrl, DEFAULT_LMSTUDIO_CONFIG.baseUrl);
  assert.equal(cfg.apiKey, DEFAULT_LMSTUDIO_CONFIG.apiKey);
  assert.ok(cfg.temperature > 0);
});
