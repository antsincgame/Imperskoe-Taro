/**
 * Клиент LM Studio (OpenAI-совместимый API) на нативном fetch.
 *
 * Поддерживает проверку доступности, перечень моделей, обычный чат и
 * потоковую генерацию (Server-Sent Events). Никаких внешних зависимостей —
 * лишь стандартная библиотека Node.
 */

import type { LMStudioConfig } from "./config.js";

/** Роль в диалоге. */
export type ChatRole = "system" | "user" | "assistant";

/** Сообщение диалога. */
export interface ChatMessage {
  role: ChatRole;
  content: string;
}

/** Параметры одного вызова чата. */
export interface ChatRequestOptions {
  model?: string;
  temperature?: number;
  maxTokens?: number;
  signal?: AbortSignal;
}

/** Состояние доступности сервера LM Studio. */
export interface HealthStatus {
  ok: boolean;
  models: string[];
  error?: string;
}

/** Ошибка взаимодействия с LM Studio. */
export class LMStudioError extends Error {
  constructor(
    message: string,
    public override readonly cause?: unknown,
  ) {
    super(message);
    this.name = "LMStudioError";
  }
}

interface ModelsResponse {
  data?: Array<{ id?: string }>;
}

interface ChatCompletionResponse {
  choices?: Array<{ message?: { content?: string } }>;
}

interface ChatCompletionChunk {
  choices?: Array<{ delta?: { content?: string }; finish_reason?: string | null }>;
}

/** Клиент когитатора LM Studio. */
export class LMStudioClient {
  constructor(private readonly config: LMStudioConfig) {}

  private url(path: string): string {
    return `${this.config.baseUrl}${path}`;
  }

  private headers(): Record<string, string> {
    return {
      "Content-Type": "application/json",
      Authorization: `Bearer ${this.config.apiKey}`,
    };
  }

  /** Создаёт сигнал прерывания с тайм-аутом, скомбинированный с внешним. */
  private withTimeout(external?: AbortSignal): { signal: AbortSignal; clear: () => void } {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), this.config.timeoutMs);
    if (external) {
      if (external.aborted) ctrl.abort();
      else external.addEventListener("abort", () => ctrl.abort(), { once: true });
    }
    return { signal: ctrl.signal, clear: () => clearTimeout(timer) };
  }

  /** Перечисляет загруженные в LM Studio модели. */
  async listModels(signal?: AbortSignal): Promise<string[]> {
    const { signal: s, clear } = this.withTimeout(signal);
    try {
      const res = await fetch(this.url("/models"), { headers: this.headers(), signal: s });
      if (!res.ok) {
        throw new LMStudioError(`LM Studio вернул статус ${res.status} на /models`);
      }
      const json = (await res.json()) as ModelsResponse;
      return (json.data ?? [])
        .map((m) => m.id)
        .filter((id): id is string => typeof id === "string");
    } catch (err) {
      throw new LMStudioError("Не удалось получить список моделей LM Studio", err);
    } finally {
      clear();
    }
  }

  /** Проверяет доступность сервера и возвращает перечень моделей. */
  async health(signal?: AbortSignal): Promise<HealthStatus> {
    try {
      const models = await this.listModels(signal);
      return { ok: true, models };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return { ok: false, models: [], error: message };
    }
  }

  /**
   * Разрешает идентификатор модели: если в конфиге "auto", берёт первую
   * доступную модель сервера.
   */
  async resolveModel(signal?: AbortSignal): Promise<string> {
    if (this.config.model && this.config.model !== "auto") return this.config.model;
    const models = await this.listModels(signal);
    if (models.length === 0) {
      throw new LMStudioError(
        "В LM Studio не загружено ни одной модели. Загрузите модель и повторите.",
      );
    }
    return models[0]!;
  }

  private body(messages: ChatMessage[], opts: ChatRequestOptions, stream: boolean): string {
    const payload: Record<string, unknown> = {
      model: opts.model ?? this.config.model,
      messages,
      temperature: opts.temperature ?? this.config.temperature,
      stream,
    };
    const maxTokens = opts.maxTokens ?? this.config.maxTokens;
    if (typeof maxTokens === "number" && maxTokens > 0) {
      payload["max_tokens"] = maxTokens;
    }
    return JSON.stringify(payload);
  }

  /** Обычный (непотоковый) запрос чата. Возвращает полный ответ. */
  async chat(messages: ChatMessage[], opts: ChatRequestOptions = {}): Promise<string> {
    const model = opts.model ?? (await this.resolveModel(opts.signal));
    const { signal, clear } = this.withTimeout(opts.signal);
    try {
      const res = await fetch(this.url("/chat/completions"), {
        method: "POST",
        headers: this.headers(),
        body: this.body(messages, { ...opts, model }, false),
        signal,
      });
      if (!res.ok) {
        const detail = await res.text().catch(() => "");
        throw new LMStudioError(
          `LM Studio вернул статус ${res.status}: ${detail.slice(0, 400)}`,
        );
      }
      const json = (await res.json()) as ChatCompletionResponse;
      return json.choices?.[0]?.message?.content ?? "";
    } catch (err) {
      if (err instanceof LMStudioError) throw err;
      throw new LMStudioError("Сбой запроса к LM Studio", err);
    } finally {
      clear();
    }
  }

  /**
   * Потоковый запрос чата. Возвращает асинхронный генератор фрагментов
   * текста по мере их поступления (как астропат, вещающий в трансе).
   */
  async *streamChat(
    messages: ChatMessage[],
    opts: ChatRequestOptions = {},
  ): AsyncGenerator<string, void, unknown> {
    const model = opts.model ?? (await this.resolveModel(opts.signal));
    const { signal, clear } = this.withTimeout(opts.signal);
    try {
      const res = await fetch(this.url("/chat/completions"), {
        method: "POST",
        headers: this.headers(),
        body: this.body(messages, { ...opts, model }, true),
        signal,
      });
      if (!res.ok || !res.body) {
        const detail = res.body ? await res.text().catch(() => "") : "";
        throw new LMStudioError(
          `LM Studio вернул статус ${res.status} при потоковой генерации: ${detail.slice(0, 400)}`,
        );
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder("utf-8");
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        // SSE-кадры разделены пустой строкой; обрабатываем построчно.
        let nl: number;
        while ((nl = buffer.indexOf("\n")) >= 0) {
          const rawLine = buffer.slice(0, nl).trimEnd();
          buffer = buffer.slice(nl + 1);
          if (!rawLine.startsWith("data:")) continue;
          const data = rawLine.slice(5).trim();
          if (data === "[DONE]") return;
          if (data === "") continue;
          let chunk: ChatCompletionChunk;
          try {
            chunk = JSON.parse(data) as ChatCompletionChunk;
          } catch {
            continue; // пропускаем неполные/служебные кадры
          }
          const delta = chunk.choices?.[0]?.delta?.content;
          if (delta) yield delta;
        }
      }
    } catch (err) {
      if (err instanceof LMStudioError) throw err;
      throw new LMStudioError("Сбой потоковой генерации LM Studio", err);
    } finally {
      clear();
    }
  }
}
