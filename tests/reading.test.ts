import { test } from "node:test";
import assert from "node:assert/strict";

import { performReading } from "../src/tarot/reading.js";
import { spreadById, SPREADS } from "../src/tarot/spreads.js";
import {
  reversalProbability,
  shuffleDeck,
  turbulenceOmen,
} from "../src/tarot/shuffle.js";
import { FULL_DECK } from "../src/tarot/deck.js";
import { seededRng } from "../src/lib/rng.js";

test("гадание заполняет все позиции расклада без повторов карт", () => {
  for (const spread of SPREADS) {
    const reading = performReading({ question: "тест", spread, seed: "omnissiah" });
    assert.equal(reading.cards.length, spread.positions.length);
    const ids = new Set(reading.cards.map((c) => c.card.id));
    assert.equal(ids.size, reading.cards.length, `повтор карт в ${spread.id}`);
    reading.cards.forEach((c, i) => {
      assert.equal(c.position.index, spread.positions[i]!.index);
    });
  }
});

test("одинаковое зерно даёт воспроизводимое гадание", () => {
  const spread = spreadById("triptych")!;
  const a = performReading({ question: "q", spread, seed: "terra-42" });
  const b = performReading({ question: "q", spread, seed: "terra-42" });
  assert.deepEqual(
    a.cards.map((c) => [c.card.id, c.orientation]),
    b.cards.map((c) => [c.card.id, c.orientation]),
  );
  assert.equal(a.warpTurbulence, b.warpTurbulence);
});

test("разные зёрна обычно дают разные расклады", () => {
  const spread = spreadById("great-cross")!;
  const a = performReading({ question: "q", spread, seed: "alpha" });
  const b = performReading({ question: "q", spread, seed: "omega" });
  const same = a.cards.every((c, i) => c.card.id === b.cards[i]!.card.id);
  assert.equal(same, false);
});

test("турбулентность всегда в диапазоне [0,1]", () => {
  for (let i = 0; i < 200; i++) {
    const r = performReading({
      question: "",
      spread: spreadById("single")!,
      seed: `seed-${i}`,
    });
    assert.ok(r.warpTurbulence >= 0 && r.warpTurbulence <= 1);
  }
});

test("вероятность переворота монотонна по турбулентности", () => {
  assert.ok(reversalProbability(0) < reversalProbability(0.5));
  assert.ok(reversalProbability(0.5) < reversalProbability(1));
  assert.ok(reversalProbability(0) >= 0 && reversalProbability(1) <= 1);
});

test("знамение турбулентности — непустая строка для всех уровней", () => {
  for (const t of [0, 0.25, 0.5, 0.75, 1]) {
    assert.ok(turbulenceOmen(t).length > 0);
  }
});

test("тасование сохраняет состав колоды (перестановка без потерь)", () => {
  const shuffled = shuffleDeck(FULL_DECK, seededRng("shuffle-seed"));
  assert.equal(shuffled.length, FULL_DECK.length);
  assert.deepEqual(
    new Set(shuffled.map((c) => c.id)),
    new Set(FULL_DECK.map((c) => c.id)),
  );
});
