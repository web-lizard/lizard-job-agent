import { jobProfileSchema } from "../profile/profile.schema";
import type { JobProfile } from "../profile/profile.types";
import { fillPlanSchema, DeepSeekClientError } from "./ai.types";
import type {
  AiSettings,
  ConnectionResult,
  FillPlan,
  PageDescription,
} from "./ai.types";
import type { FillAction } from "./ai.types";
import { CREATE_FILL_PLAN_SYSTEM_PROMPT } from "./prompts/create-fill-plan.prompt";
import { PARSE_RESUME_SYSTEM_PROMPT } from "./prompts/parse-resume.prompt";

interface ChatMessage {
  role: "system" | "user";
  content: string;
}

interface ChatOptions {
  requestId: string;
  messages: ChatMessage[];
  json: boolean;
  maxTokens: number;
}

const controllers = new Map<string, AbortController>();

function endpoint(settings: AiSettings): string {
  let url: URL;
  try {
    url = new URL(settings.apiUrl);
  } catch {
    throw new DeepSeekClientError(
      "Некорректный API URL.",
      "invalid_settings",
    );
  }
  if (url.protocol !== "https:" || url.hostname !== "api.deepseek.com") {
    throw new DeepSeekClientError(
      "Для защиты ключа разрешён только https://api.deepseek.com.",
      "invalid_settings",
    );
  }
  return `${url.origin}/chat/completions`;
}

async function errorFromResponse(response: Response): Promise<DeepSeekClientError> {
  if (response.status === 401) {
    return new DeepSeekClientError(
      "DeepSeek отклонил API-ключ. Проверьте ключ и повторите.",
      "unauthorized",
      401,
    );
  }
  if (response.status === 402) {
    return new DeepSeekClientError(
      "На балансе DeepSeek недостаточно средств.",
      "insufficient_balance",
      402,
    );
  }
  if (response.status === 429) {
    return new DeepSeekClientError(
      "DeepSeek ограничил частоту запросов. Подождите и повторите.",
      "rate_limited",
      429,
    );
  }

  let apiMessage = "";
  try {
    const body = (await response.json()) as {
      error?: { message?: string };
    };
    apiMessage =
      body.error?.message
        ?.replace(/sk-[A-Za-z0-9_-]{8,}/g, "sk-••••••••")
        .slice(0, 240) ?? "";
  } catch {
    // An invalid error body must not hide the HTTP status.
  }
  return new DeepSeekClientError(
    apiMessage
      ? `DeepSeek вернул ошибку ${response.status}: ${apiMessage}`
      : `DeepSeek вернул HTTP ${response.status}.`,
    response.status >= 500 ? "server" : "invalid_response",
    response.status,
  );
}

function responseContent(payload: unknown): string {
  if (!payload || typeof payload !== "object") {
    throw new DeepSeekClientError(
      "DeepSeek вернул ответ неизвестного формата.",
      "invalid_response",
    );
  }
  const choices = (payload as {
    choices?: Array<{ message?: { content?: unknown } }>;
  }).choices;
  const content = choices?.[0]?.message?.content;
  if (typeof content !== "string") {
    throw new DeepSeekClientError(
      "DeepSeek не вернул текст ответа.",
      "invalid_response",
    );
  }
  if (!content.trim()) {
    throw new DeepSeekClientError(
      "DeepSeek вернул пустой ответ. Повторите запрос.",
      "empty_response",
    );
  }
  return content.trim();
}

async function chat(
  settings: AiSettings,
  options: ChatOptions,
): Promise<{ content: string; model: string }> {
  if (!settings.apiKey.trim()) {
    throw new DeepSeekClientError(
      "Сначала добавьте API-ключ DeepSeek.",
      "missing_key",
    );
  }
  if (!settings.model.trim()) {
    throw new DeepSeekClientError("Укажите модель DeepSeek.", "invalid_settings");
  }

  controllers.get(options.requestId)?.abort();
  const controller = new AbortController();
  controllers.set(options.requestId, controller);
  const timeout = globalThis.setTimeout(
    () => controller.abort("timeout"),
    60_000,
  );

  try {
    const response = await fetch(endpoint(settings), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${settings.apiKey}`,
      },
      body: JSON.stringify({
        model: settings.model,
        messages: options.messages,
        stream: false,
        thinking: { type: "disabled" },
        max_tokens: options.maxTokens,
        ...(options.json
          ? { response_format: { type: "json_object" } }
          : {}),
      }),
      signal: controller.signal,
    });

    if (!response.ok) throw await errorFromResponse(response);
    const payload = (await response.json()) as { model?: unknown };
    return {
      content: responseContent(payload),
      model:
        typeof payload.model === "string" ? payload.model : settings.model,
    };
  } catch (error) {
    if (error instanceof DeepSeekClientError) throw error;
    if (controller.signal.aborted) {
      const timedOut = controller.signal.reason === "timeout";
      throw new DeepSeekClientError(
        timedOut
          ? "DeepSeek не ответил за 60 секунд."
          : "Запрос DeepSeek отменён.",
        timedOut ? "timeout" : "cancelled",
      );
    }
    throw new DeepSeekClientError(
      "Не удалось подключиться к DeepSeek. Проверьте сеть и API URL.",
      "network",
    );
  } finally {
    globalThis.clearTimeout(timeout);
    controllers.delete(options.requestId);
  }
}

function parseJson(content: string): unknown {
  try {
    return JSON.parse(content);
  } catch {
    throw new DeepSeekClientError(
      "DeepSeek вернул повреждённый JSON. Исходный текст сохранён — повторите запрос.",
      "invalid_json",
    );
  }
}

function valueAtPath(profile: JobProfile, sourcePath: string): unknown {
  const tokens = sourcePath.match(/[A-Za-z]+|\d+/g);
  let current: unknown = profile;
  for (const token of tokens ?? []) {
    if (current === null || typeof current !== "object") return undefined;
    current = (current as Record<string, unknown>)[token];
  }
  return current;
}

function enforceFillPlanPolicy(
  plan: FillPlan,
  profile: JobProfile,
  page: PageDescription,
): FillPlan {
  const fields = new Map(page.fields.map((field) => [field.fieldId, field]));
  const safeActions: FillAction[] = [];

  for (const action of plan.actions) {
    const field = fields.get(action.fieldId);
    if (!field || field.disabled || action.confidence < 0.65) continue;
    const sourceValue = valueAtPath(profile, action.sourcePath);

    if (action.action === "clickAddExperience") {
      const isAddButton =
        (/^(button|a)$/.test(field.tagName) || field.type === "button") &&
        /добавить (место работы|опыт|работу)|add (experience|employment)/i.test(
          field.label,
        ) &&
        /^experience\[\d+\]$/.test(action.sourcePath) &&
        sourceValue !== null &&
        typeof sourceValue === "object";
      if (isAddButton) safeActions.push({ ...action, value: null });
      continue;
    }

    if (field.currentValue && action.action !== "setCheckbox") continue;
    if (
      !(
        typeof sourceValue === "string" ||
        typeof sourceValue === "number" ||
        typeof sourceValue === "boolean"
      )
    ) {
      continue;
    }
    const expected =
      typeof sourceValue === "number" ? String(sourceValue) : sourceValue;
    if (action.value !== expected) continue;
    safeActions.push(action);
  }

  const clickIndex = safeActions.findIndex(
    (action) => action.action === "clickAddExperience",
  );
  return {
    actions:
      clickIndex >= 0
        ? [...safeActions.filter((action) => action.action !== "clickAddExperience"), safeActions[clickIndex]!]
        : safeActions,
    warnings: plan.warnings,
  };
}

export function cancelDeepSeekRequest(requestId: string): boolean {
  const controller = controllers.get(requestId);
  if (!controller) return false;
  controller.abort("cancelled");
  return true;
}

export async function testConnection(
  settings: AiSettings,
  requestId: string,
): Promise<ConnectionResult> {
  try {
    const response = await chat(settings, {
      requestId,
      json: true,
      maxTokens: 32,
      messages: [
        {
          role: "system",
          content:
            'Верни только валидный json без Markdown: {"connected":true}.',
        },
        {
          role: "user",
          content: "Проверь подключение и верни json.",
        },
      ],
    });
    const parsed = parseJson(response.content) as { connected?: unknown };
    if (parsed.connected !== true) {
      throw new DeepSeekClientError(
        "Подключение установлено, но тестовый ответ имеет неверный формат.",
        "invalid_response",
      );
    }
    return {
      success: true,
      message: "DeepSeek подключён.",
      model: response.model,
    };
  } catch (error) {
    return {
      success: false,
      message:
        error instanceof Error
          ? error.message
          : "Неизвестная ошибка подключения DeepSeek.",
    };
  }
}

export async function parseResume(
  settings: AiSettings,
  resumeText: string,
  requestId: string,
): Promise<JobProfile> {
  if (!resumeText.trim()) {
    throw new DeepSeekClientError(
      "Вставьте или загрузите текст резюме.",
      "invalid_settings",
    );
  }
  const response = await chat(settings, {
    requestId,
    json: true,
    maxTokens: 16_000,
    messages: [
      { role: "system", content: PARSE_RESUME_SYSTEM_PROMPT },
      {
        role: "user",
        content: `Разбери следующий текст резюме и верни json:\n\n${resumeText}`,
      },
    ],
  });
  const parsed = parseJson(response.content);
  const validated = jobProfileSchema.safeParse(parsed);
  if (!validated.success) {
    const details = validated.error.issues
      .slice(0, 5)
      .map((issue) => issue.path.join("."))
      .filter(Boolean)
      .join(", ");
    throw new DeepSeekClientError(
      `JSON DeepSeek не прошёл проверку структуры${details ? `: ${details}` : ""}. Исходный текст сохранён.`,
      "invalid_response",
    );
  }
  return validated.data;
}

export async function createFillPlan(
  settings: AiSettings,
  profile: JobProfile,
  page: PageDescription,
  requestId: string,
): Promise<FillPlan> {
  const response = await chat(settings, {
    requestId,
    json: true,
    maxTokens: 8_000,
    messages: [
      { role: "system", content: CREATE_FILL_PLAN_SYSTEM_PROMPT },
      {
        role: "user",
        content: `Создай json-план заполнения для этих данных:\n${JSON.stringify({
          profile,
          page,
        })}`,
      },
    ],
  });
  const parsed = parseJson(response.content);
  const validated = fillPlanSchema.safeParse(parsed);
  if (!validated.success) {
    throw new DeepSeekClientError(
      "DeepSeek вернул небезопасный или некорректный FillPlan.",
      "invalid_response",
    );
  }
  return enforceFillPlanPolicy(validated.data, profile, page);
}
