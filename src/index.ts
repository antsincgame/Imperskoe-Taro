#!/usr/bin/env node
/**
 * Имперское Таро — гадание по варп-сети (Warhammer 40,000) с поддержкой LM Studio.
 *
 * Главный модуль CLI: разбор аргументов, интерактивный обряд гадания и
 * информационные команды (правила, колода, расклады, модели LM Studio).
 *
 * ++ Во имя Бога-Императора. Да направит Омниссия чистоту кода. ++
 */

import { stdout } from "node:process";
import { writeFile } from "node:fs/promises";

import { FULL_DECK, assertDeckIntegrity, cardById } from "./tarot/deck.js";
import { SPREADS, DEFAULT_SPREAD_ID, spreadById } from "./tarot/spreads.js";
import { performReading } from "./tarot/reading.js";
import type { Reading } from "./tarot/types.js";

import { loadLMStudioConfig } from "./lmstudio/config.js";
import { LMStudioClient } from "./lmstudio/client.js";
import { interpretReading } from "./lmstudio/interpreter.js";

import { color } from "./cli/ansi.js";
import {
  banner,
  renderCardDetail,
  renderCardLine,
  renderReading,
  renderWarpRules,
  rule,
} from "./cli/render.js";
import {
  askQuestion,
  chooseSpread,
  confirm,
  openPrompt,
  performRitualAnimation,
} from "./cli/prompts.js";

interface CliArgs {
  help: boolean;
  rules: boolean;
  listSpreads: boolean;
  listCards: boolean;
  models: boolean;
  json: boolean;
  offline: boolean;
  question?: string;
  spread?: string;
  seed?: string;
  card?: string;
  save?: string;
  filter?: string;
}

function parseArgs(argv: readonly string[]): CliArgs {
  const args: CliArgs = {
    help: false,
    rules: false,
    listSpreads: false,
    listCards: false,
    models: false,
    json: false,
    offline: false,
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]!;
    const next = (): string | undefined => argv[++i];
    switch (a) {
      case "-h":
      case "--help":
        args.help = true;
        break;
      case "--rules":
        args.rules = true;
        break;
      case "--list-spreads":
        args.listSpreads = true;
        break;
      case "--list-cards":
        args.listCards = true;
        args.filter = argv[i + 1] && !argv[i + 1]!.startsWith("-") ? next() : undefined;
        break;
      case "--card":
        args.card = next();
        break;
      case "--models":
        args.models = true;
        break;
      case "--json":
        args.json = true;
        break;
      case "--offline":
      case "--no-llm":
        args.offline = true;
        break;
      case "-q":
      case "--question":
        args.question = next();
        break;
      case "-s":
      case "--spread":
        args.spread = next();
        break;
      case "--seed":
        args.seed = next();
        break;
      case "--save":
        args.save = next();
        break;
      default:
        // Голый аргумент после --card трактуется как id (на случай "--card foo").
        if (!a.startsWith("-") && args.card === undefined && argv[i - 1] === "--card") {
          args.card = a;
        }
        break;
    }
  }
  return args;
}

const HELP = `${banner()}

${color.bold("ИСПОЛЬЗОВАНИЕ")}
  taro [команда] [опции]

${color.bold("КОМАНДЫ")}
  (без аргументов)        Интерактивный обряд гадания
  --rules                 Показать правила гадания в варп-сети
  --list-spreads          Перечислить доступные расклады
  --list-cards [фильтр]   Перечислить карты колоды
                          фильтр: major | minor | aquila | bolter | chalice | blade
  --card <id>             Показать подробное толкование карты
  --models                Проверить LM Studio и перечислить модели

${color.bold("ОПЦИИ ГАДАНИЯ")}
  -q, --question <текст>  Вопрос к варпу (для неинтерактивного режима)
  -s, --spread <id>       Идентификатор расклада (${SPREADS.map((s) => s.id).join(", ")})
  --seed <строка>         Зерно для воспроизводимого гадания
  --offline, --no-llm     Не обращаться к LM Studio (офлайн-прорицание)
  --json                  Вывести результат в формате JSON
  --save <файл>           Сохранить гадание в JSON-файл
  -h, --help              Эта справка

${color.bold("LM STUDIO")}
  Запусти локальный сервер LM Studio (по умолчанию http://localhost:1234).
  Переменные окружения:
    LMSTUDIO_BASE_URL     (по умолчанию http://localhost:1234/v1)
    LMSTUDIO_MODEL        (по умолчанию auto — первая загруженная модель)
    LMSTUDIO_API_KEY      (по умолчанию lm-studio)
    LMSTUDIO_TEMPERATURE  (по умолчанию 0.85)

${color.bold("ПРИМЕРЫ")}
  taro
  taro -q "Ждать ли мне повышения в Адептус Механикус?" -s triptych
  taro --spread great-cross --offline
  taro --card major-04-emperor
  taro --rules
`;

/** Информационная команда: модели LM Studio. */
async function commandModels(): Promise<void> {
  const config = loadLMStudioConfig();
  const client = new LMStudioClient(config);
  stdout.write(color.bold(`Проверка LM Studio: ${config.baseUrl}\n`));
  const health = await client.health();
  if (health.ok) {
    stdout.write(color.green("✓ Когитатор LM Studio отвечает.\n"));
    if (health.models.length) {
      stdout.write(color.bold("Загруженные модели:\n"));
      for (const m of health.models) stdout.write(color.gold(`  • ${m}\n`));
    } else {
      stdout.write(color.yellow("Модели не загружены — загрузите модель в LM Studio.\n"));
    }
  } else {
    stdout.write(color.red(`✗ LM Studio недоступен: ${health.error}\n`));
    stdout.write(color.dim("Будет использован офлайн-режим толкования.\n"));
  }
}

/** Информационная команда: список карт. */
function commandListCards(filter?: string): void {
  let cards = FULL_DECK;
  if (filter) {
    const f = filter.toLowerCase();
    if (f === "major" || f === "minor") {
      cards = cards.filter((c) => c.arcana === f);
    } else if (["aquila", "bolter", "chalice", "blade"].includes(f)) {
      cards = cards.filter((c) => c.suit === f);
    } else {
      stdout.write(color.red(`Неизвестный фильтр «${filter}».\n`));
      return;
    }
  }
  stdout.write(color.bold(`Колода Имперского Таро — ${cards.length} карт\n`));
  stdout.write(rule(70) + "\n");
  for (const c of cards) stdout.write(renderCardLine(c) + "\n");
}

/** Информационная команда: подробности карты. */
function commandCard(id: string): void {
  const card = cardById(id);
  if (!card) {
    stdout.write(color.red(`Карта с id «${id}» не найдена. См. taro --list-cards.\n`));
    return;
  }
  stdout.write(renderCardDetail(card) + "\n");
}

/** Информационная команда: список раскладов. */
function commandListSpreads(): void {
  stdout.write(color.bold("Доступные расклады:\n"));
  stdout.write(rule(70) + "\n");
  for (const s of SPREADS) {
    stdout.write(
      color.gold(s.id.padEnd(16)) +
        color.bold(s.name) +
        color.dim(` — ${s.title} (${s.positions.length} карт)\n`),
    );
    stdout.write(color.gray(`  ${s.description}\n\n`));
  }
}

/** Готовит клиента LM Studio (или null, если офлайн). */
async function prepareClient(
  offline: boolean,
  announce: boolean,
): Promise<LMStudioClient | null> {
  if (offline) return null;
  const config = loadLMStudioConfig();
  const client = new LMStudioClient(config);
  const health = await client.health();
  if (announce) {
    if (health.ok) {
      const model = health.models[0] ?? "(модель не загружена)";
      stdout.write(
        color.green("✓ LM Studio на связи") +
          color.dim(` (${config.baseUrl}, модель: ${model})\n`),
      );
    } else {
      stdout.write(
        color.yellow("⚠ LM Studio недоступен — толкование будет офлайн.\n") +
          color.dim(`  (${health.error})\n`),
      );
    }
  }
  return health.ok ? client : null;
}

/** Печатает толкование расклада, потоково выводя текст. */
async function speakInterpretation(
  reading: Reading,
  client: LMStudioClient | null,
  offline: boolean,
): Promise<void> {
  stdout.write("\n" + color.bold(color.brightMagenta("☼ СЛОВО АСТРОПАТА-ПРОРИЦАТЕЛЯ")) + "\n");
  stdout.write(rule(60) + "\n");

  const result = await interpretReading(reading, {
    client: client ?? undefined,
    offline: offline || client === null,
    onToken: (chunk) => stdout.write(chunk),
  });

  stdout.write("\n" + rule(60) + "\n");
  if (result.warning) {
    stdout.write(color.yellow(`⚠ ${result.warning}\n`));
  }
  const src =
    result.source === "lmstudio"
      ? color.green(`Источник: LM Studio (${result.model ?? "?"})`)
      : color.dim("Источник: офлайн-прорицание");
  stdout.write(src + "\n");
}

/** Сохраняет гадание в JSON-файл. */
async function saveReading(reading: Reading, file: string): Promise<void> {
  await writeFile(file, JSON.stringify(reading, null, 2), "utf-8");
  stdout.write(color.green(`\n✓ Гадание сохранено в ${file}\n`));
}

/** Неинтерактивный режим гадания. */
async function runOneShot(args: CliArgs): Promise<void> {
  const spread = spreadById(args.spread ?? DEFAULT_SPREAD_ID);
  if (!spread) {
    stdout.write(color.red(`Неизвестный расклад «${args.spread}». См. taro --list-spreads.\n`));
    process.exitCode = 1;
    return;
  }
  const reading = performReading({
    question: args.question ?? "",
    spread,
    ...(args.seed !== undefined ? { seed: args.seed } : {}),
  });

  if (args.json) {
    const client = await prepareClient(args.offline, false);
    const interp = await interpretReading(reading, {
      client: client ?? undefined,
      offline: args.offline || client === null,
    });
    stdout.write(
      JSON.stringify({ reading, interpretation: interp }, null, 2) + "\n",
    );
    if (args.save) await saveReading(reading, args.save);
    return;
  }

  stdout.write("\n" + renderReading(reading));
  const client = await prepareClient(args.offline, true);
  await speakInterpretation(reading, client, args.offline);
  if (args.save) await saveReading(reading, args.save);
}

/** Интерактивный обряд гадания. */
async function runInteractive(args: CliArgs): Promise<void> {
  stdout.write(banner() + "\n\n");
  const client = await prepareClient(args.offline, true);
  const rl = openPrompt();
  try {
    let again = true;
    while (again) {
      const question = args.question ?? (await askQuestion(rl));
      const spread = args.spread
        ? spreadById(args.spread) ?? (await chooseSpread(rl))
        : await chooseSpread(rl);

      stdout.write("\n" + color.dim("Провожу обряд гадания…\n"));
      await performRitualAnimation();

      const reading = performReading({
        question,
        spread,
        ...(args.seed !== undefined ? { seed: args.seed } : {}),
      });

      stdout.write("\n" + renderReading(reading));
      await speakInterpretation(reading, client, args.offline);

      if (args.save) await saveReading(reading, args.save);

      // Повторное гадание возможно только в полностью интерактивном режиме.
      if (args.question) break;
      stdout.write("\n");
      again = await confirm(rl, color.bold("Вопросить варп ещё раз?"), false);
    }
  } finally {
    rl.close();
  }
  stdout.write(color.dim("\nДа пребудет с тобой Свет Императора. ✠\n"));
}

async function main(): Promise<void> {
  // Самопроверка целостности колоды — ересь данных недопустима.
  assertDeckIntegrity();

  const args = parseArgs(process.argv.slice(2));

  if (args.help) {
    stdout.write(HELP + "\n");
    return;
  }
  if (args.rules) {
    stdout.write(renderWarpRules() + "\n");
    return;
  }
  if (args.listSpreads) {
    commandListSpreads();
    return;
  }
  if (args.listCards) {
    commandListCards(args.filter);
    return;
  }
  if (args.card !== undefined) {
    commandCard(args.card);
    return;
  }
  if (args.models) {
    await commandModels();
    return;
  }

  // Неинтерактивно, если задан вопрос/JSON или ввод не из TTY.
  const interactive = !args.json && args.question === undefined && Boolean(process.stdin.isTTY);
  if (interactive) {
    await runInteractive(args);
  } else {
    await runOneShot(args);
  }
}

main().catch((err: unknown) => {
  const message = err instanceof Error ? err.message : String(err);
  process.stderr.write(color.red(`\n✗ Сбой обряда: ${message}\n`));
  process.exitCode = 1;
});
