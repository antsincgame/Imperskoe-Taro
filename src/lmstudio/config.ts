/**
 * Конфигурация подключения к LM Studio.
 *
 * LM Studio поднимает OpenAI-совместимый сервер (по умолчанию на
 * http://localhost:1234/v1). Все параметры читаются из переменных
 * окружения с разумными значениями по умолчанию.
 */

/** Параметры клиента LM Studio. */
export interface LMStudioConfig {
  /** Базовый URL OpenAI-совместимого API (с суффиксом /v1). */
  baseUrl: string;
  /** Ключ API. LM Studio его игнорирует, но клиент требует значение. */
  apiKey: string;
  /**
   * Идентификатор модели. Значение "auto" заставляет клиент выбрать
   * первую загруженную в LM Studio модель.
   */
  model: string;
  /** Температура генерации (творческая вольность астропата). */
  temperature: number;
  /** Максимум токенов ответа (-1 — без ограничения со стороны клиента). */
  maxTokens: number;
  /** Тайм-аут запроса в миллисекундах. */
  timeoutMs: number;
}

function envStr(name: string, fallback: string): string {
  const v = process.env[name];
  return v === undefined || v === "" ? fallback : v;
}

function envNum(name: string, fallback: number): number {
  const v = process.env[name];
  if (v === undefined || v === "") return fallback;
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

/** Значения по умолчанию (каноничные для LM Studio). */
export const DEFAULT_LMSTUDIO_CONFIG: LMStudioConfig = {
  baseUrl: "http://localhost:1234/v1",
  apiKey: "lm-studio",
  model: "auto",
  temperature: 0.85,
  maxTokens: -1,
  timeoutMs: 120_000,
};

/** Собирает конфигурацию из переменных окружения. */
export function loadLMStudioConfig(): LMStudioConfig {
  const base = envStr("LMSTUDIO_BASE_URL", DEFAULT_LMSTUDIO_CONFIG.baseUrl).replace(
    /\/+$/,
    "",
  );
  return {
    baseUrl: base,
    apiKey: envStr("LMSTUDIO_API_KEY", DEFAULT_LMSTUDIO_CONFIG.apiKey),
    model: envStr("LMSTUDIO_MODEL", DEFAULT_LMSTUDIO_CONFIG.model),
    temperature: envNum("LMSTUDIO_TEMPERATURE", DEFAULT_LMSTUDIO_CONFIG.temperature),
    maxTokens: envNum("LMSTUDIO_MAX_TOKENS", DEFAULT_LMSTUDIO_CONFIG.maxTokens),
    timeoutMs: envNum("LMSTUDIO_TIMEOUT_MS", DEFAULT_LMSTUDIO_CONFIG.timeoutMs),
  };
}
