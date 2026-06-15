/**
 * Интерактивный ввод и ритуальные анимации.
 */

import * as readline from "node:readline/promises";
import { stdin, stdout } from "node:process";
import type { Spread } from "../tarot/types.js";
import { SPREADS } from "../tarot/spreads.js";
import { RITUAL_PHASES } from "../warp/rules.js";
import { color } from "./ansi.js";

/** Создаёт интерфейс readline. */
function createRl(): readline.Interface {
  return readline.createInterface({ input: stdin, output: stdout });
}

/** Спрашивает вопрос к варпу. */
export async function askQuestion(rl: readline.Interface): Promise<string> {
  const q = await rl.question(
    color.bold("\n✠ Задай вопрос варпу") +
      color.dim(" (или Enter — для знамения общего течения судьбы):\n› "),
  );
  return q.trim();
}

/** Предлагает выбрать расклад из списка. */
export async function chooseSpread(rl: readline.Interface): Promise<Spread> {
  stdout.write(color.bold("\n✠ Избери расклад:\n"));
  SPREADS.forEach((s, i) => {
    stdout.write(
      color.gold(`  ${i + 1}) `) +
        color.bold(s.name) +
        color.dim(` — ${s.title} (${s.positions.length} карт)\n`),
    );
    stdout.write(color.gray(`     ${s.description}\n`));
  });

  while (true) {
    const ans = (await rl.question(color.bold("\nНомер расклада › "))).trim();
    const idx = Number(ans);
    if (Number.isInteger(idx) && idx >= 1 && idx <= SPREADS.length) {
      return SPREADS[idx - 1]!;
    }
    stdout.write(color.red("Неверный выбор. Введи число из списка.\n"));
  }
}

/** Спрашивает «да/нет». */
export async function confirm(
  rl: readline.Interface,
  prompt: string,
  defaultYes = true,
): Promise<boolean> {
  const hint = defaultYes ? "[Д/н]" : "[д/Н]";
  const ans = (await rl.question(`${prompt} ${color.dim(hint)} `)).trim().toLowerCase();
  if (ans === "") return defaultYes;
  return ans === "д" || ans === "y" || ans === "да" || ans === "yes";
}

/** Запускает интерфейс readline для последовательности вопросов. */
export function openPrompt(): readline.Interface {
  return createRl();
}

const SPINNER_FRAMES = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];

/**
 * Проигрывает ритуальную анимацию считывания варпа.
 * Если вывод не в TTY, печатает фазы без анимации.
 */
export async function performRitualAnimation(perPhaseMs = 650): Promise<void> {
  const isTty = Boolean(stdout.isTTY);
  for (const phase of RITUAL_PHASES) {
    if (!isTty) {
      stdout.write(color.gray(`  · ${phase.label}… ${phase.litany}\n`));
      continue;
    }
    const frames = Math.max(1, Math.round(perPhaseMs / 80));
    for (let f = 0; f < frames; f++) {
      const spin = SPINNER_FRAMES[f % SPINNER_FRAMES.length]!;
      stdout.write(
        `\r${color.brightMagenta(spin)} ${color.bold(phase.label)}  ${color.dim(phase.litany)}   `,
      );
      await sleep(80);
    }
    stdout.write(`\r${color.green("✓")} ${color.bold(phase.label)}${" ".repeat(40)}\n`);
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
