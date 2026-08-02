"use strict";

// Lizard Job Agent — background script (Firefox MV3).
// Отвечает за:
//  - загрузку resume.json (единственный источник правды о кандидате);
//  - безопасное хранение API-ключа DeepSeek в browser.storage.local;
//  - вызов DeepSeek API только для открытых вопросов формы;
//  - обработку сообщений от popup и content script.

const DEFAULT_SETTINGS = {
  deepseekApiKey: "",
  deepseekModel: "deepseek-chat",
  deepseekApiUrl: "https://api.deepseek.com",
  overwriteFilled: false,
  diagnostics: false,
  coverLetterIntroEnabled: true,
  coverLetterIntro:
    "Здравствуйте! Меня заинтересовала ваша вакансия. Пожалуйста, ознакомьтесь с моим резюме.",
  disclosureEnabled: true,
  disclosureText:
    "Письмо подготовлено с помощью моей программы Lizard Job Agent: {url}",
  projectGithubUrl: "https://github.com/web-lizard/lizard-job-agent",
  jobSearchQuery:
    "PHP разработчик OR Vue разработчик OR Nuxt разработчик OR Fullstack разработчик",
  jobSearchArea: "1",
};

const SETTINGS_KEY = "ljaSettings";
const LEGACY_SETTINGS_KEY = "deepSeekSettings";
const DEEPSEEK_ENDPOINT = "/chat/completions";
const REQUEST_TIMEOUT_MS = 60000;
const BUILD_ID = "I06-20260802";

function errorText(error, fallback) {
  return error && typeof error.message === "string" && error.message.trim()
    ? error.message.trim()
    : fallback;
}

// ---------------------------------------------------------------------------
// Настройки
// ---------------------------------------------------------------------------

async function getSettings() {
  const stored = await browser.storage.local.get([
    SETTINGS_KEY,
    LEGACY_SETTINGS_KEY,
    "apiKey",
    "deepseekApiKey",
    "model",
    "deepseekModel",
    "apiUrl",
    "endpoint",
    "deepseekApiUrl",
    "preferences",
  ]);
  const raw = stored[SETTINGS_KEY] || {};
  const legacy = stored[LEGACY_SETTINGS_KEY] || {};
  const preferences = stored.preferences || {};
  const firstString = (...values) => {
    const value = values.find((item) => typeof item === "string" && item.trim());
    return value ? value.trim() : "";
  };
  const settings = {
    deepseekApiKey: firstString(
      raw.deepseekApiKey,
      raw.apiKey,
      legacy.deepseekApiKey,
      legacy.apiKey,
      stored.deepseekApiKey,
      stored.apiKey,
    ),
    deepseekModel:
      firstString(
        raw.deepseekModel,
        raw.model,
        legacy.deepseekModel,
        legacy.model,
        stored.deepseekModel,
        stored.model,
      ) || DEFAULT_SETTINGS.deepseekModel,
    deepseekApiUrl: (
      firstString(
        raw.deepseekApiUrl,
        raw.apiUrl,
        legacy.deepseekApiUrl,
        legacy.apiUrl,
        stored.deepseekApiUrl,
        stored.apiUrl,
        stored.endpoint,
      ) || DEFAULT_SETTINGS.deepseekApiUrl
    ).replace(/\/+$/, ""),
    overwriteFilled:
      typeof raw.overwriteFilled === "boolean"
        ? raw.overwriteFilled
        : typeof raw.doNotOverwrite === "boolean"
          ? !raw.doNotOverwrite
          : typeof preferences.doNotOverwrite === "boolean"
            ? !preferences.doNotOverwrite
            : DEFAULT_SETTINGS.overwriteFilled,
    diagnostics:
      typeof raw.diagnostics === "boolean"
        ? raw.diagnostics
        : DEFAULT_SETTINGS.diagnostics,
    coverLetterIntroEnabled:
      typeof raw.coverLetterIntroEnabled === "boolean"
        ? raw.coverLetterIntroEnabled
        : DEFAULT_SETTINGS.coverLetterIntroEnabled,
    coverLetterIntro:
      firstString(raw.coverLetterIntro) || DEFAULT_SETTINGS.coverLetterIntro,
    disclosureEnabled:
      typeof raw.disclosureEnabled === "boolean"
        ? raw.disclosureEnabled
        : DEFAULT_SETTINGS.disclosureEnabled,
    disclosureText:
      firstString(raw.disclosureText) || DEFAULT_SETTINGS.disclosureText,
    projectGithubUrl:
      firstString(raw.projectGithubUrl) || DEFAULT_SETTINGS.projectGithubUrl,
    jobSearchQuery:
      firstString(raw.jobSearchQuery) || DEFAULT_SETTINGS.jobSearchQuery,
    jobSearchArea:
      firstString(raw.jobSearchArea) || DEFAULT_SETTINGS.jobSearchArea,
  };

  const needsMigration =
    !stored[SETTINGS_KEY] ||
    Object.keys(DEFAULT_SETTINGS).some(
      (key) => stored[SETTINGS_KEY][key] !== settings[key],
    );
  if (needsMigration) {
    await browser.storage.local.set({ [SETTINGS_KEY]: settings });
  }
  return settings;
}

async function saveSettings(settings) {
  settings = settings && typeof settings === "object" ? settings : {};
  const current = await getSettings();
  const next = {
    deepseekApiKey:
      typeof settings.deepseekApiKey === "string" && settings.deepseekApiKey.trim()
        ? settings.deepseekApiKey.trim()
        : current.deepseekApiKey,
    deepseekModel:
      typeof settings.deepseekModel === "string" && settings.deepseekModel.trim()
        ? settings.deepseekModel.trim()
        : current.deepseekModel,
    deepseekApiUrl:
      typeof settings.deepseekApiUrl === "string" && settings.deepseekApiUrl.trim()
        ? settings.deepseekApiUrl.trim().replace(/\/+$/, "")
        : current.deepseekApiUrl,
    overwriteFilled:
      typeof settings.overwriteFilled === "boolean"
        ? settings.overwriteFilled
        : current.overwriteFilled,
    diagnostics:
      typeof settings.diagnostics === "boolean"
        ? settings.diagnostics
        : current.diagnostics,
    coverLetterIntroEnabled:
      typeof settings.coverLetterIntroEnabled === "boolean"
        ? settings.coverLetterIntroEnabled
        : current.coverLetterIntroEnabled,
    coverLetterIntro:
      typeof settings.coverLetterIntro === "string" && settings.coverLetterIntro.trim()
        ? settings.coverLetterIntro.trim()
        : current.coverLetterIntro,
    disclosureEnabled:
      typeof settings.disclosureEnabled === "boolean"
        ? settings.disclosureEnabled
        : current.disclosureEnabled,
    disclosureText:
      typeof settings.disclosureText === "string" && settings.disclosureText.trim()
        ? settings.disclosureText.trim()
        : current.disclosureText,
    projectGithubUrl:
      typeof settings.projectGithubUrl === "string" && settings.projectGithubUrl.trim()
        ? settings.projectGithubUrl.trim()
        : current.projectGithubUrl,
    jobSearchQuery:
      typeof settings.jobSearchQuery === "string" && settings.jobSearchQuery.trim()
        ? settings.jobSearchQuery.trim()
        : current.jobSearchQuery,
    jobSearchArea:
      typeof settings.jobSearchArea === "string" && settings.jobSearchArea.trim()
        ? settings.jobSearchArea.trim()
        : current.jobSearchArea,
  };
  await browser.storage.local.set({ [SETTINGS_KEY]: next });
  return next;
}

// ---------------------------------------------------------------------------
// resume.json
// ---------------------------------------------------------------------------

let cachedResume = null;
let resumeLoadError = null;

async function loadResume() {
  if (cachedResume) return cachedResume;
  try {
    const url = browser.runtime.getURL("resume.json");
    const response = await fetch(url);
    if (!response.ok) {
      if (response.status === 404) {
        throw new Error("resume.json: файл не найден в корне расширения.");
      }
      throw new Error(`resume.json недоступен (HTTP ${response.status}).`);
    }
    const text = await response.text();
    let parsed;
    try {
      parsed = JSON.parse(text);
    } catch (error) {
      throw new Error(
        `Ошибка JSON в resume.json: ${errorText(error, "не удалось разобрать файл")}`,
      );
    }
    const requiredSections = ["candidate", "summary", "experienceProfile"];
    const missing = requiredSections.filter(
      (section) => !parsed || typeof parsed[section] !== "object",
    );
    if (missing.length > 0) {
      throw new Error(`resume.json: отсутствуют секции ${missing.join(", ")}.`);
    }
    cachedResume = parsed;
    resumeLoadError = null;
    return parsed;
  } catch (error) {
    resumeLoadError = errorText(error, "Не удалось прочитать resume.json.");
    throw new Error(resumeLoadError);
  }
}

// Очищенная техническая версия резюме без прямых идентификаторов
// (телефон, email, полное имя), которая отправляется в DeepSeek.
function sanitizedResumeForAi(resume) {
  const clone = JSON.parse(JSON.stringify(resume));
  if (clone.candidate) {
    clone.candidate = {
      firstName: clone.candidate.firstName || "",
      lastName: clone.candidate.lastName || "",
      city: clone.candidate.city || "",
      metro: clone.candidate.metro || "",
      github: clone.candidate.github || "",
    };
  }
  return clone;
}

// ---------------------------------------------------------------------------
// DeepSeek API
// ---------------------------------------------------------------------------

function deepSeekError(status, body) {
  if (status === 401) {
    return "DeepSeek отклонил API-ключ. Проверьте ключ в настройках и повторите.";
  }
  if (status === 402) {
    return "На балансе DeepSeek недостаточно средств.";
  }
  if (status === 403) {
    return "Доступ к DeepSeek запрещён. Проверьте ключ и права доступа.";
  }
  if (status === 429) {
    return "DeepSeek ограничил частоту запросов. Подождите и повторите.";
  }
  if (status >= 500) {
    return `Сервис DeepSeek временно недоступен (HTTP ${status}). Повторите позже.`;
  }
  let apiMessage = "";
  try {
    const parsed = typeof body === "string" ? JSON.parse(body) : body;
    apiMessage =
      (parsed && parsed.error && parsed.error.message) || "";
  } catch {
    apiMessage = "";
  }
  if (apiMessage) {
    return `DeepSeek вернул ошибку ${status}: ${apiMessage}`;
  }
  return `DeepSeek вернул HTTP ${status}.`;
}

function extractContent(payload) {
  if (!payload || typeof payload !== "object") {
    throw new Error("DeepSeek вернул ответ неизвестного формата.");
  }
  const choices = payload.choices;
  const content = choices && choices[0] && choices[0].message
    ? choices[0].message.content
    : undefined;
  if (typeof content !== "string" || !content.trim()) {
    throw new Error("DeepSeek вернул пустой ответ. Повторите запрос.");
  }
  return content.trim();
}

function deepSeekRequestUrl(apiUrl) {
  const base = apiUrl.replace(/\/+$/, "");
  return /\/chat\/completions$/i.test(base)
    ? base
    : `${base}${DEEPSEEK_ENDPOINT}`;
}

async function requestDeepSeek(settings, messages, maxTokens, expectJson = true) {
  if (!settings.deepseekApiKey.trim()) {
    throw new Error("Сначала добавьте API-ключ DeepSeek в настройках.");
  }
  if (!settings.deepseekModel.trim()) {
    throw new Error("Укажите модель DeepSeek в настройках.");
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const requestBody = {
      model: settings.deepseekModel,
      messages,
      stream: false,
      max_tokens: maxTokens,
    };
    if (expectJson) requestBody.response_format = { type: "json_object" };

    const response = await fetch(deepSeekRequestUrl(settings.deepseekApiUrl), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${settings.deepseekApiKey}`,
      },
      body: JSON.stringify(requestBody),
      signal: controller.signal,
    });

    if (!response.ok) {
      const body = await response.text();
      throw new Error(deepSeekError(response.status, body));
    }

    let payload;
    try {
      payload = await response.json();
    } catch {
      throw new Error("DeepSeek вернул ответ, который не удалось разобрать как JSON.");
    }
    return extractContent(payload);
  } catch (error) {
    if (error && error.name === "AbortError") {
      throw new Error("DeepSeek не ответил за 60 секунд. Повторите запрос.");
    }
    if (error instanceof TypeError) {
      throw new Error(
        "Не удалось подключиться к DeepSeek. Проверьте сеть и API URL.",
      );
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

// Извлекает JSON из ответа, устойчив к Markdown-блокам и тексту вокруг.
function parseJsonContent(content) {
  let text = content.trim();
  const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) text = fence[1].trim();
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start >= 0 && end > start) {
    text = text.slice(start, end + 1);
  }
  try {
    return JSON.parse(text);
  } catch {
    throw new Error("DeepSeek вернул повреждённый JSON. Повторите запрос.");
  }
}

// ---------------------------------------------------------------------------
// Промпт для генерации ответов
// ---------------------------------------------------------------------------

const SYSTEM_PROMPT = `
Ты помощник кандидата при заполнении формы отклика на вакансию.

Используй только факты из переданного резюме.

Запрещено:
- придумывать работодателей;
- придумывать сроки работы;
- придумывать образование;
- придумывать уровень английского;
- придумывать число лет по отдельной технологии;
- придумывать метрики;
- придумывать обязанности;
- превращать базовое знакомство в коммерческий опыт;
- называть личные проекты коммерческими;
- утверждать большой опыт с Laravel;
- представлять кандидата как DevOps, ML или AI-инженера;
- писать, что кандидат идеально подходит;
- писать рекламные штампы;
- использовать длинное тире;
- писать чрезмерно длинные ответы.

Правила:
- отвечай на русском языке, если поле не требует другого языка;
- отвечай непосредственно на вопрос;
- учитывай текст конкретной вакансии;
- используй спокойный деловой тон;
- не повторяй один текст в разных полях;
- открыто признавай отсутствие прямого опыта;
- при отсутствии точного опыта указывай ближайший релевантный опыт;
- не извиняйся за отсутствие технологии;
- не преувеличивай;
- не пиши канцелярские вступления;
- не используй фразу «я умею всё»;
- не используй длинное тире.

Верни строго валидный JSON без Markdown в формате:
{
  "answers": [
    {
      "fieldIndex": 0,
      "action": "fill",
      "answer": "Текст ответа",
      "confidence": "high",
      "needsReview": false
    }
  ]
}

Допустимые action: fill, select, check, skip.
- fill: вставить текстовый ответ в поле.
- select: выбрать вариант из options (answer должен быть одним из options).
- check: отметить checkbox (answer: true или false).
- skip: не заполнять поле (например, если данных нет или вопрос требует ручной проверки).

Если для вопроса нет данных в резюме или вопрос требует юридического согласия, используй action "skip" и needsReview true.
Не выдумывай значения, которых нет в резюме.
`.trim();

function buildUserPrompt(resume, vacancy, questions) {
  const resumeBlock = JSON.stringify(sanitizedResumeForAi(resume), null, 2);
  const vacancyBlock = JSON.stringify(vacancy || {}, null, 2);
  const questionsBlock = JSON.stringify(questions, null, 2);
  return (
    "Резюме кандидата (техническая версия без прямых идентификаторов):\n" +
    resumeBlock +
    "\n\nКонтекст вакансии:\n" +
    vacancyBlock +
    "\n\nВопросы формы (массив полей с индексами):\n" +
    questionsBlock +
    "\n\nВерни JSON с ответами для каждого поля."
  );
}

// ---------------------------------------------------------------------------
// Генерация ответов
// ---------------------------------------------------------------------------

async function generateAnswers(resume, vacancy, questions) {
  const settings = await getSettings();
  const content = await requestDeepSeek(
    settings,
    [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: buildUserPrompt(resume, vacancy, questions) },
    ],
    4000,
  );
  const parsed = parseJsonContent(content);
  if (!parsed || !Array.isArray(parsed.answers)) {
    throw new Error("DeepSeek вернул ответ без массива answers.");
  }

  const validIndexes = new Set(questions.map((q) => q.fieldIndex));
  const seen = new Set();
  const answers = [];
  for (const item of parsed.answers) {
    if (!item || typeof item !== "object") continue;
    const index = item.fieldIndex;
    if (typeof index !== "number" || !validIndexes.has(index)) continue;
    if (seen.has(index)) continue;
    seen.add(index);
    const action = ["fill", "select", "check", "skip"].includes(item.action)
      ? item.action
      : "skip";
    const answer = typeof item.answer === "string" ? item.answer : "";
    answers.push({
      fieldIndex: index,
      action,
      answer,
      confidence: item.confidence === "high" ? "high" : "low",
      needsReview: item.needsReview === true,
    });
  }
  return answers;
}

// ---------------------------------------------------------------------------
// Генерация ответа в переписке
// ---------------------------------------------------------------------------

const CHAT_SYSTEM_PROMPT = `
Ты помогаешь кандидату отвечать работодателю в чате HH.ru.

Отвечай только на основании переданного резюме.

Кандидат: Хорошаев Ярослав Сергеевич.
Основное позиционирование: Fullstack-разработчик PHP / Vue / Nuxt с более чем 13-летним опытом коммерческой веб-разработки.

Подтверждённый основной стек: PHP, WordPress, WooCommerce, 1С-Битрикс, JavaScript, Vue 3, Nuxt, HTML, CSS, REST API, Git, интернет-магазины, корпоративные сайты, B2B-кабинеты, личные кабинеты, интеграции, поддержка и развитие legacy-проектов.
Рабочее знакомство: TypeScript, Python, FastAPI, Docker, WSL2, AI-assisted development.
Laravel: есть практическое знакомство и работа с тестовыми проектами. Нельзя заявлять многолетний коммерческий опыт именно с Laravel.
Next.js: есть опыт отдельного тестового проекта. Нельзя называть основной специализацией.
Python и FastAPI используются в собственных проектах. Основным многолетним коммерческим backend-стеком остаётся PHP.
Личные проекты GNOSIS, OneiroGnosis, suviren-q и Scribe-Souverain нельзя называть коммерческими.

Запрещено:
- придумывать работодателей;
- придумывать коммерческий опыт;
- придумывать образование;
- придумывать уровень английского;
- придумывать число лет по отдельной технологии;
- придумывать метрики;
- придумывать сроки работы с отдельными технологиями;
- называть личные проекты коммерческими;
- превращать базовое знакомство в экспертный опыт;
- утверждать большой коммерческий опыт с Laravel;
- называть кандидата Laravel-экспертом, DevOps-инженером или ML-инженером;
- использовать длинное тире;
- писать рекламные штампы;
- писать «идеально подхожу»;
- писать «я умею всё».

Ответ должен:
- быть на русском языке;
- непосредственно отвечать на последнее сообщение;
- учитывать предыдущую переписку;
- быть деловым, спокойным и человеческим;
- обычно занимать от 2 до 6 предложений;
- не повторять приветствие, если диалог уже идёт;
- честно обозначать отсутствие прямого опыта;
- после ограничения указывать ближайший релевантный опыт;
- не извиняться;
- не добавлять подпись, телефон или email;
- не повторять весь текст вакансии;
- не писать длинное сопроводительное письмо.

Если работодатель задаёт несколько вопросов, ответь на каждый из них отдельно и в том же порядке.
Верни только текст ответа работодателю, без Markdown, кавычек и префикса «Ответ:».
`.trim();

function buildChatUserPrompt(resume, chat) {
  const resumeBlock = JSON.stringify(sanitizedResumeForAi(resume), null, 2);
  const chatBlock = JSON.stringify(chat || {}, null, 2);
  return (
    "Резюме кандидата (техническая версия без прямых идентификаторов):\n" +
    resumeBlock +
    "\n\nКонтекст переписки:\n" +
    chatBlock +
    "\n\nВерни только готовый текст ответа работодателю."
  );
}

function cleanChatReply(content) {
  let text = String(content || "").trim();
  const fence = text.match(/```(?:text|markdown)?\s*([\s\S]*?)```/i);
  if (fence) text = fence[1].trim();
  if (text.startsWith("{") && text.endsWith("}")) {
    try {
      const parsed = JSON.parse(text);
      if (typeof parsed.reply === "string") text = parsed.reply.trim();
    } catch {
      // Ответ в фигурных скобках может быть обычным текстом.
    }
  }
  text = text.replace(/^\s*(?:ответ|готовый ответ)\s*:\s*/i, "").trim();
  const wrapped = text.match(/^[«"']([\s\S]+)[»"']$/);
  if (wrapped) text = wrapped[1].trim();
  if (!text) throw new Error("DeepSeek вернул пустой ответ. Повторите запрос.");
  return text;
}

async function generateChatReply(resume, chat) {
  const settings = await getSettings();
  const content = await requestDeepSeek(
    settings,
    [
      { role: "system", content: CHAT_SYSTEM_PROMPT },
      { role: "user", content: buildChatUserPrompt(resume, chat) },
    ],
    1200,
    false,
  );
  return cleanChatReply(content);
}

// ---------------------------------------------------------------------------
// Персональное сопроводительное письмо (только черновик, без отправки)
// ---------------------------------------------------------------------------

const COVER_LETTER_SYSTEM_PROMPT = `
Ты готовишь центральную часть короткого сопроводительного письма для отклика на HH.ru.

Используй только факты из переданного резюме и конкретной вакансии.
Каждый текст должен быть связан с требованиями именно этой вакансии: выбери 2-3 наиболее релевантных подтверждённых факта и объясни пользу для задач работодателя.

Запрещено:
- выдумывать опыт, работодателей, проекты, сроки и метрики;
- называть личные проекты коммерческими;
- преувеличивать опыт Laravel, Next.js, Python, DevOps или ML;
- повторять всё резюме или весь текст вакансии;
- использовать рекламные штампы и длинное тире;
- добавлять приветствие, просьбу ознакомиться с резюме, подпись, контакты или ссылку;
- упоминать, что текст создан ИИ.

Верни только уникальную центральную часть письма на русском языке: 3-5 спокойных деловых предложений без Markdown и кавычек.
`.trim();

function buildCoverLetterPrompt(resume, vacancy) {
  return (
    "Резюме кандидата (без телефона и email):\n" +
    JSON.stringify(sanitizedResumeForAi(resume), null, 2) +
    "\n\nВакансия:\n" +
    JSON.stringify(vacancy || {}, null, 2) +
    "\n\nНапиши только центральную часть сопроводительного письма."
  );
}

async function generateCoverLetter(resume, vacancy) {
  const settings = await getSettings();
  const content = await requestDeepSeek(
    settings,
    [
      { role: "system", content: COVER_LETTER_SYSTEM_PROMPT },
      { role: "user", content: buildCoverLetterPrompt(resume, vacancy) },
    ],
    900,
    false,
  );
  const body = cleanChatReply(content);
  const parts = [];
  if (settings.coverLetterIntroEnabled && settings.coverLetterIntro.trim()) {
    parts.push(settings.coverLetterIntro.trim());
  }
  parts.push(body);
  if (settings.disclosureEnabled && settings.disclosureText.trim()) {
    parts.push(
      settings.disclosureText
        .replaceAll("{url}", settings.projectGithubUrl.trim())
        .trim(),
    );
  }
  return parts.filter(Boolean).join("\n\n");
}

// ---------------------------------------------------------------------------
// Проверка подключения
// ---------------------------------------------------------------------------

async function testConnection(settings) {
  try {
    const current = await getSettings();
    const effective = {
      ...current,
      ...settings,
      deepseekApiKey:
        typeof settings?.deepseekApiKey === "string" && settings.deepseekApiKey.trim()
          ? settings.deepseekApiKey.trim()
          : current.deepseekApiKey,
    };
    const content = await requestDeepSeek(
      effective,
      [
        {
          role: "system",
          content: 'Верни только валидный json без Markdown: {"connected":true}.',
        },
        { role: "user", content: "Проверь подключение и верни json." },
      ],
      32,
    );
    const parsed = parseJsonContent(content);
    if (parsed.connected !== true) {
      return { ok: false, message: "Тестовый ответ имеет неверный формат." };
    }
    return { ok: true, message: "DeepSeek подключён." };
  } catch (error) {
    return {
      ok: false,
      message: errorText(error, "Ошибка подключения."),
    };
  }
}

// ---------------------------------------------------------------------------
// Обработка сообщений
// ---------------------------------------------------------------------------

browser.runtime.onMessage.addListener((message, sender) => {
  if (!message || typeof message !== "object" || typeof message.type !== "string") {
    return undefined;
  }

  switch (message.type) {
    case "LJA_GET_RESUME":
      return loadResume()
        .then((resume) => ({ ok: true, buildId: BUILD_ID, resume }))
        .catch((error) => ({
          ok: false,
          buildId: BUILD_ID,
          error: errorText(error, "Ошибка загрузки резюме."),
        }));

    case "LJA_GENERATE_ANSWERS":
      return loadResume()
        .then((resume) =>
          generateAnswers(resume, message.vacancy, message.questions),
        )
        .then((answers) => ({ ok: true, buildId: BUILD_ID, answers }))
        .catch((error) => ({
          ok: false,
          buildId: BUILD_ID,
          error: errorText(error, "Ошибка генерации ответов."),
        }));

    case "LJA_GENERATE_CHAT_REPLY":
      return loadResume()
        .then((resume) => generateChatReply(resume, message.chat))
        .then((reply) => ({ ok: true, buildId: BUILD_ID, reply }))
        .catch((error) => ({
          ok: false,
          buildId: BUILD_ID,
          error: errorText(error, "Ошибка генерации ответа."),
        }));

    case "LJA_GENERATE_COVER_LETTER":
      return loadResume()
        .then((resume) => generateCoverLetter(resume, message.vacancy))
        .then((coverLetter) => ({
          ok: true,
          buildId: BUILD_ID,
          coverLetter,
        }))
        .catch((error) => ({
          ok: false,
          buildId: BUILD_ID,
          error: errorText(error, "Ошибка генерации сопроводительного письма."),
        }));

    case "LJA_GET_SETTINGS":
      return getSettings().then((settings) => ({
        ok: true,
        buildId: BUILD_ID,
        settings: {
          deepseekModel: settings.deepseekModel,
          deepseekApiUrl: settings.deepseekApiUrl,
          overwriteFilled: settings.overwriteFilled,
          diagnostics: settings.diagnostics,
          coverLetterIntroEnabled: settings.coverLetterIntroEnabled,
          coverLetterIntro: settings.coverLetterIntro,
          disclosureEnabled: settings.disclosureEnabled,
          disclosureText: settings.disclosureText,
          projectGithubUrl: settings.projectGithubUrl,
          jobSearchQuery: settings.jobSearchQuery,
          jobSearchArea: settings.jobSearchArea,
          hasKey: Boolean(settings.deepseekApiKey),
        },
      }));

    case "LJA_SAVE_SETTINGS":
      return saveSettings(message.settings).then((settings) => ({
        ok: true,
        buildId: BUILD_ID,
        settings: {
          deepseekModel: settings.deepseekModel,
          deepseekApiUrl: settings.deepseekApiUrl,
          overwriteFilled: settings.overwriteFilled,
          diagnostics: settings.diagnostics,
          coverLetterIntroEnabled: settings.coverLetterIntroEnabled,
          coverLetterIntro: settings.coverLetterIntro,
          disclosureEnabled: settings.disclosureEnabled,
          disclosureText: settings.disclosureText,
          projectGithubUrl: settings.projectGithubUrl,
          jobSearchQuery: settings.jobSearchQuery,
          jobSearchArea: settings.jobSearchArea,
          hasKey: Boolean(settings.deepseekApiKey),
        },
      }));

    case "LJA_TEST_CONNECTION":
      return testConnection(message.settings).then((result) => ({
        ...result,
        buildId: BUILD_ID,
      }));

    default:
      return undefined;
  }
});

// ---------------------------------------------------------------------------
// Инициализация
// ---------------------------------------------------------------------------

browser.runtime.onInstalled.addListener(() => {
  // Прогреваем кэш resume.json, чтобы ошибка была видна сразу.
  loadResume().catch(() => {
    // Ошибка будет показана при первом использовании.
  });
});
