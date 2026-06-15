/**
 * Веб-сервер Имперского Таро.
 *
 * Нативный HTTP-сервер (без фреймворков): раздаёт статический интерфейс из
 * каталога /public и предоставляет API поверх той же доменной логики, что и
 * CLI. Толкование LM Studio проксируется на стороне сервера и стримится в
 * браузер через Server-Sent Events — без CORS и без утечки ключей наружу.
 *
 * ++ Во имя Бога-Императора. Да внемлет браузер варпу. ++
 */

import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { extname, resolve, sep } from "node:path";

import { FULL_DECK, cardById } from "../tarot/deck.js";
import { SPREADS, DEFAULT_SPREAD_ID, spreadById } from "../tarot/spreads.js";
import { performReading } from "../tarot/reading.js";
import type { Reading } from "../tarot/types.js";
import { WARP_RULES, WARP_RULES_PREAMBLE } from "../warp/rules.js";

import { loadLMStudioConfig } from "../lmstudio/config.js";
import { LMStudioClient } from "../lmstudio/client.js";
import { interpretReading } from "../lmstudio/interpreter.js";

const PORT = Number(process.env["PORT"] ?? process.env["TARO_PORT"] ?? 8080);
const HOST = process.env["HOST"] ?? "127.0.0.1";

const PUBLIC_DIR = fileURLToPath(new URL("../../public/", import.meta.url));

const CONTENT_TYPES: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".svg": "image/svg+xml",
  ".json": "application/json; charset=utf-8",
  ".ico": "image/x-icon",
  ".woff2": "font/woff2",
};

/** Отправляет JSON-ответ. */
function sendJson(res: ServerResponse, status: number, data: unknown): void {
  const body = JSON.stringify(data);
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": Buffer.byteLength(body),
    "Cache-Control": "no-store",
  });
  res.end(body);
}

/** Считывает тело запроса целиком (с лимитом). */
async function readBody(req: IncomingMessage, limit = 1_000_000): Promise<string> {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks: Buffer[] = [];
    req.on("data", (c: Buffer) => {
      size += c.length;
      if (size > limit) {
        reject(new Error("Тело запроса слишком велико"));
        req.destroy();
        return;
      }
      chunks.push(c);
    });
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf-8")));
    req.on("error", reject);
  });
}

/** Раздаёт статический файл из /public с защитой от обхода пути. */
async function serveStatic(res: ServerResponse, urlPath: string): Promise<void> {
  const rel = urlPath === "/" ? "index.html" : decodeURIComponent(urlPath.replace(/^\/+/, ""));
  const base = resolve(PUBLIC_DIR);
  const filePath = resolve(base, rel);
  // Защита от path traversal: итоговый путь обязан лежать внутри /public.
  if (filePath !== base && !filePath.startsWith(base + sep)) {
    sendJson(res, 400, { error: "Недопустимый путь" });
    return;
  }
  try {
    const data = await readFile(filePath);
    const type = CONTENT_TYPES[extname(filePath).toLowerCase()] ?? "application/octet-stream";
    res.writeHead(200, { "Content-Type": type, "Cache-Control": "no-cache" });
    res.end(data);
  } catch {
    res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
    res.end("404 — реликвия не найдена");
  }
}

/** Сериализует расклады для фронтенда. */
function spreadsPayload() {
  return SPREADS.map((s) => ({
    id: s.id,
    name: s.name,
    title: s.title,
    description: s.description,
    size: s.positions.length,
    positions: s.positions,
  }));
}

/** SSE: инициализация заголовков. */
function sseInit(res: ServerResponse): void {
  res.writeHead(200, {
    "Content-Type": "text/event-stream; charset=utf-8",
    "Cache-Control": "no-cache, no-transform",
    Connection: "keep-alive",
    "X-Accel-Buffering": "no",
  });
}

/** SSE: отправка именованного события с данными. */
function sseSend(res: ServerResponse, event: string, data: unknown): void {
  res.write(`event: ${event}\n`);
  res.write(`data: ${JSON.stringify(data)}\n\n`);
}

/**
 * POST /api/divine — единый обряд: выкладывает расклад, шлёт его событием
 * `reading`, затем стримит толкование событиями `token` и завершает `done`.
 */
async function handleDivine(req: IncomingMessage, res: ServerResponse): Promise<void> {
  let payload: { question?: string; spreadId?: string; seed?: string; offline?: boolean };
  try {
    payload = JSON.parse((await readBody(req)) || "{}");
  } catch {
    sendJson(res, 400, { error: "Некорректный JSON" });
    return;
  }

  const spread = spreadById(payload.spreadId ?? DEFAULT_SPREAD_ID);
  if (!spread) {
    sendJson(res, 400, { error: `Неизвестный расклад «${payload.spreadId}»` });
    return;
  }

  let reading: Reading;
  try {
    reading = performReading({
      question: payload.question ?? "",
      spread,
      ...(payload.seed ? { seed: payload.seed } : {}),
    });
  } catch (err) {
    sendJson(res, 500, { error: err instanceof Error ? err.message : String(err) });
    return;
  }

  sseInit(res);
  sseSend(res, "reading", { reading });

  // Прерывание генерации при разрыве соединения с браузером.
  const ac = new AbortController();
  req.on("close", () => ac.abort());

  // Подготавливаем клиента LM Studio (если не запрошен офлайн).
  let client: LMStudioClient | null = null;
  if (!payload.offline) {
    const cfg = loadLMStudioConfig();
    const c = new LMStudioClient(cfg);
    const health = await c.health(ac.signal);
    client = health.ok ? c : null;
    if (!health.ok) {
      sseSend(res, "status", {
        lmstudio: false,
        message: `LM Studio недоступен (${health.error ?? "нет ответа"}) — толкование офлайн.`,
      });
    } else {
      sseSend(res, "status", { lmstudio: true, model: health.models[0] ?? null });
    }
  }

  try {
    const result = await interpretReading(reading, {
      client: client ?? undefined,
      offline: payload.offline || client === null,
      signal: ac.signal,
      onToken: (chunk) => sseSend(res, "token", { delta: chunk }),
    });
    sseSend(res, "done", {
      source: result.source,
      model: result.model ?? null,
      warning: result.warning ?? null,
    });
  } catch (err) {
    sseSend(res, "error", {
      message: err instanceof Error ? err.message : String(err),
    });
  } finally {
    res.end();
  }
}

/** Маршрутизация запросов. */
async function router(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const url = new URL(req.url ?? "/", `http://${req.headers.host ?? "localhost"}`);
  const path = url.pathname;
  const method = req.method ?? "GET";

  // --- API ---
  if (path === "/api/spreads" && method === "GET") {
    sendJson(res, 200, { spreads: spreadsPayload() });
    return;
  }
  if (path === "/api/cards" && method === "GET") {
    sendJson(res, 200, { cards: FULL_DECK });
    return;
  }
  if (path.startsWith("/api/cards/") && method === "GET") {
    const id = decodeURIComponent(path.slice("/api/cards/".length));
    const card = cardById(id);
    if (!card) {
      sendJson(res, 404, { error: `Карта «${id}» не найдена` });
      return;
    }
    sendJson(res, 200, { card });
    return;
  }
  if (path === "/api/rules" && method === "GET") {
    sendJson(res, 200, { preamble: WARP_RULES_PREAMBLE, rules: WARP_RULES });
    return;
  }
  if (path === "/api/health" && method === "GET") {
    const cfg = loadLMStudioConfig();
    const client = new LMStudioClient(cfg);
    const health = await client.health();
    sendJson(res, 200, {
      lmstudio: health.ok,
      baseUrl: cfg.baseUrl,
      models: health.models,
      ...(health.error ? { error: health.error } : {}),
    });
    return;
  }
  if (path === "/api/divine" && method === "POST") {
    await handleDivine(req, res);
    return;
  }

  // --- Статика ---
  if (method === "GET") {
    await serveStatic(res, path);
    return;
  }

  sendJson(res, 405, { error: "Метод не поддерживается" });
}

const server = createServer((req, res) => {
  router(req, res).catch((err: unknown) => {
    const message = err instanceof Error ? err.message : String(err);
    if (!res.headersSent) sendJson(res, 500, { error: message });
    else res.end();
  });
});

server.listen(PORT, HOST, () => {
  const url = `http://${HOST === "0.0.0.0" ? "localhost" : HOST}:${PORT}`;
  process.stdout.write(
    [
      "",
      "  ✠ ИМПЕРСКОЕ ТАРО — веб-храм варп-сети поднят",
      `  ▸ Открой в браузере:  ${url}`,
      "  ▸ LM Studio проксируется на стороне сервера (офлайн-резерв включён).",
      "  ▸ Останов: Ctrl+C",
      "",
    ].join("\n") + "\n",
  );
});
