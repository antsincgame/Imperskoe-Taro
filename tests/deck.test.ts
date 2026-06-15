import { test } from "node:test";
import assert from "node:assert/strict";

import {
  FULL_DECK,
  DECK_SIZE,
  assertDeckIntegrity,
  cardById,
  cardsByArcana,
  cardsBySuit,
} from "../src/tarot/deck.js";
import { MAJOR_ARCANA } from "../src/tarot/majorArcana.js";
import { MINOR_ARCANA } from "../src/tarot/minorArcana.js";

test("колода целостна: 78 карт, 22 старших, 56 младших", () => {
  assert.equal(FULL_DECK.length, DECK_SIZE.total);
  assert.equal(MAJOR_ARCANA.length, DECK_SIZE.major);
  assert.equal(MINOR_ARCANA.length, DECK_SIZE.minor);
  assert.doesNotThrow(() => assertDeckIntegrity());
});

test("все идентификаторы карт уникальны", () => {
  const ids = new Set(FULL_DECK.map((c) => c.id));
  assert.equal(ids.size, FULL_DECK.length);
});

test("каждая карта имеет прямое и перевёрнутое толкование с ключами", () => {
  for (const card of FULL_DECK) {
    assert.ok(card.name.length > 0, `имя пусто у ${card.id}`);
    assert.ok(card.title.length > 0, `титул пуст у ${card.id}`);
    assert.ok(card.upright.text.length > 0, `прямое значение пусто у ${card.id}`);
    assert.ok(card.reversed.text.length > 0, `перевёрнутое значение пусто у ${card.id}`);
    assert.ok(card.upright.keywords.length > 0, `нет прямых ключей у ${card.id}`);
    assert.ok(card.reversed.keywords.length > 0, `нет перевёрнутых ключей у ${card.id}`);
  }
});

test("поиск по идентификатору находит и старшие, и младшие арканы", () => {
  assert.equal(cardById("major-04-emperor")?.name, "Бог-Император");
  assert.equal(cardById("bolter-14-lord")?.suit, "bolter");
  assert.equal(cardById("несуществующая")?.name, undefined);
});

test("выборки по классу и масти возвращают верные количества", () => {
  assert.equal(cardsByArcana("major").length, 22);
  assert.equal(cardsByArcana("minor").length, 56);
  for (const suit of ["aquila", "bolter", "chalice", "blade"] as const) {
    assert.equal(cardsBySuit(suit).length, 14, `масть ${suit}`);
  }
});

test("у Старших Арканов нет масти, у Младших — есть", () => {
  for (const c of cardsByArcana("major")) assert.equal(c.suit, undefined);
  for (const c of cardsByArcana("minor")) assert.ok(c.suit, `у ${c.id} нет масти`);
});
