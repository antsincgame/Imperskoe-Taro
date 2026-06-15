/**
 * Минимальные ANSI-помощники для терминала (без внешних зависимостей).
 *
 * Цвет автоматически отключается, если вывод не в TTY или задан NO_COLOR.
 */

const useColor =
  process.env["NO_COLOR"] === undefined &&
  process.env["TERM"] !== "dumb" &&
  Boolean(process.stdout.isTTY);

function wrap(open: number, close: number): (s: string) => string {
  if (!useColor) return (s) => s;
  const o = `[${open}m`;
  const c = `[${close}m`;
  return (s) => `${o}${s}${c}`;
}

export const color = {
  enabled: useColor,
  reset: useColor ? "[0m" : "",
  bold: wrap(1, 22),
  dim: wrap(2, 22),
  italic: wrap(3, 23),
  underline: wrap(4, 24),
  black: wrap(30, 39),
  red: wrap(31, 39),
  green: wrap(32, 39),
  yellow: wrap(33, 39),
  blue: wrap(34, 39),
  magenta: wrap(35, 39),
  cyan: wrap(36, 39),
  white: wrap(37, 39),
  gray: wrap(90, 39),
  brightRed: wrap(91, 39),
  brightGreen: wrap(92, 39),
  brightYellow: wrap(93, 39),
  brightBlue: wrap(94, 39),
  brightMagenta: wrap(95, 39),
  brightCyan: wrap(96, 39),
  gold: wrap(33, 39),
} as const;

/** Тематические цвета стихий. */
export function elementColor(element: string): (s: string) => string {
  switch (element) {
    case "fire":
      return color.brightRed;
    case "water":
      return color.brightBlue;
    case "air":
      return color.brightCyan;
    case "earth":
      return color.green;
    case "aether":
      return color.brightMagenta;
    default:
      return color.white;
  }
}
