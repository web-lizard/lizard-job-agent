import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import vm from "node:vm";
import { describe, expect, it, vi } from "vitest";

const backgroundSource = readFileSync(resolve("background.js"), "utf8");
const resumeText = readFileSync(resolve("resume.example.json"), "utf8");

function startBackground(initialStorage: Record<string, any>, fetchImpl: (url: string, init?: any) => Promise<any>) {
  const storage = { ...initialStorage };
  const listeners: Array<(message: any, sender?: any) => Promise<any>> = [];
  let actionListener: ((tab: any) => Promise<void> | void) | null = null;
  const createWindow = vi.fn(async () => ({ id: 77, type: "popup" }));
  const updateWindow = vi.fn(async (id: number) => ({ id, type: "popup" }));
  const browser = {
    storage: {
      local: {
        async get(keys: string | string[]) {
          const names = Array.isArray(keys) ? keys : [keys];
          return Object.fromEntries(names.filter((key) => key in storage).map((key) => [key, storage[key]]));
        },
        async set(values: Record<string, any>) {
          Object.assign(storage, values);
        },
      },
    },
    runtime: {
      getURL(path: string) {
        return `moz-extension://test/${path}`;
      },
      onMessage: {
        addListener(listener: (message: any, sender?: any) => Promise<any>) {
          listeners.push(listener);
        },
      },
      onInstalled: { addListener() {} },
    },
    action: {
      onClicked: {
        addListener(listener: (tab: any) => Promise<void> | void) {
          actionListener = listener;
        },
      },
    },
    windows: {
      async get() { return { type: "normal" }; },
      async getAll() { return []; },
      create: createWindow,
      update: updateWindow,
      onRemoved: { addListener() {} },
    },
    tabs: {
      async get(tabId: number) { return { id: tabId, url: "https://hh.ru/search/vacancy" }; },
      async query() { return [{ id: 42, url: "https://hh.ru/search/vacancy" }]; },
      onActivated: { addListener() {} },
    },
  };
  vm.runInNewContext(backgroundSource, {
    browser,
    fetch: fetchImpl,
    AbortController,
    setTimeout,
    clearTimeout,
    console,
    Error,
    TypeError,
    SyntaxError,
    JSON,
  });
  return {
    storage,
    send: (message: any) => listeners[0]!(message, {}),
    clickAction: (tab: any) => actionListener?.(tab),
    createWindow,
    updateWindow,
  };
}

function resumeResponse() {
  return { ok: true, status: 200, text: async () => resumeText };
}

describe("active iteration 10 background script", () => {
  it("opens one persistent panel window and focuses it on the next click", async () => {
    const app = startBackground({}, async () => resumeResponse());

    await app.clickAction({ id: 42, windowId: 1 });
    expect(app.createWindow).toHaveBeenCalledWith(expect.objectContaining({
      url: "moz-extension://test/popup.html",
      type: "popup",
    }));

    await app.clickAction({ id: 42, windowId: 1 });
    expect(app.createWindow).toHaveBeenCalledTimes(1);
    expect(app.updateWindow).toHaveBeenCalledWith(77, { focused: true, state: "normal" });
  });
  it("loads resume.json through runtime URL and migrates legacy settings", async () => {
    const fetchMock = vi.fn(async () => resumeResponse());
    const app = startBackground({
      deepSeekSettings: {
        apiKey: "legacy-secret",
        model: "deepseek-chat",
        apiUrl: "https://api.deepseek.com/",
      },
      preferences: { doNotOverwrite: true },
    }, fetchMock);

    await expect(app.send({ type: "LJA_GET_SETTINGS" })).resolves.toMatchObject({
      ok: true,
      buildId: "I10-20260803",
      settings: {
        hasKey: true,
        deepseekModel: "deepseek-chat",
        deepseekApiUrl: "https://api.deepseek.com",
        overwriteFilled: false,
      },
    });
    expect(app.storage.ljaSettings.deepseekApiKey).toBe("legacy-secret");

    const resume = await app.send({ type: "LJA_GET_RESUME" });
    expect(resume.ok).toBe(true);
    expect(fetchMock).toHaveBeenCalledWith("moz-extension://test/resume.json");
  });

  it("returns a clear network error from DeepSeek", async () => {
    const app = startBackground({
      ljaSettings: {
        deepseekApiKey: "secret",
        deepseekModel: "deepseek-chat",
        deepseekApiUrl: "https://api.deepseek.com",
        overwriteFilled: false,
        diagnostics: false,
      },
    }, async (url) => {
      if (url.startsWith("moz-extension:")) return resumeResponse();
      throw new TypeError("network down");
    });

    const result = await app.send({ type: "LJA_GENERATE_CHAT_REPLY", chat: { lastEmployerMessage: "Вопрос" } });
    expect(result).toMatchObject({ ok: false });
    expect(result.error).toContain("Не удалось подключиться к DeepSeek");
  });

  it("explains an invalid DeepSeek API key", async () => {
    const app = startBackground({
      ljaSettings: {
        deepseekApiKey: "wrong-secret",
        deepseekModel: "deepseek-chat",
        deepseekApiUrl: "https://api.deepseek.com",
        overwriteFilled: false,
        diagnostics: false,
      },
    }, async (url) => {
      if (url.startsWith("moz-extension:")) return resumeResponse();
      return {
        ok: false,
        status: 401,
        text: async () => JSON.stringify({ error: { message: "Authentication failed" } }),
      };
    });

    const result = await app.send({ type: "LJA_GENERATE_CHAT_REPLY", chat: { lastEmployerMessage: "Вопрос" } });
    expect(result.error).toContain("отклонил API-ключ");
    expect(result.error).not.toContain("wrong-secret");
  });

  it("rejects an invalid API payload with a precise error", async () => {
    const app = startBackground({
      ljaSettings: {
        deepseekApiKey: "secret",
        deepseekModel: "deepseek-chat",
        deepseekApiUrl: "https://api.deepseek.com",
        overwriteFilled: false,
        diagnostics: false,
      },
    }, async (url) => {
      if (url.startsWith("moz-extension:")) return resumeResponse();
      return { ok: true, status: 200, json: async () => { throw new SyntaxError("bad json"); } };
    });

    const result = await app.send({ type: "LJA_GENERATE_CHAT_REPLY", chat: { lastEmployerMessage: "Вопрос" } });
    expect(result.error).toBe("DeepSeek вернул ответ, который не удалось разобрать как JSON.");
  });

  it("wraps a unique cover-letter body in the configured honest branding", async () => {
    const app = startBackground({
      ljaSettings: {
        deepseekApiKey: "secret",
        deepseekModel: "deepseek-chat",
        deepseekApiUrl: "https://api.deepseek.com",
        overwriteFilled: false,
        diagnostics: false,
        coverLetterIntroEnabled: true,
        coverLetterIntro: "Здравствуйте! Меня заинтересовала ваша вакансия.",
        disclosureEnabled: true,
        disclosureText: "Создано с помощью Lizard Job Agent: {url}",
        projectGithubUrl: "https://github.com/web-lizard/lizard-job-agent",
        jobSearchQuery: "PHP разработчик",
        jobSearchArea: "1",
      },
    }, async (url) => {
      if (url.startsWith("moz-extension:")) return resumeResponse();
      return {
        ok: true,
        status: 200,
        json: async () => ({
          choices: [{ message: { content: "Мой опыт PHP и интеграций соответствует задачам проекта." } }],
        }),
      };
    });

    const result = await app.send({
      type: "LJA_GENERATE_COVER_LETTER",
      vacancy: { title: "PHP-разработчик", company: "Компания" },
    });
    expect(result).toMatchObject({ ok: true, buildId: "I10-20260803" });
    expect(result.coverLetter).toBe(
      "Здравствуйте! Меня заинтересовала ваша вакансия.\n\n" +
      "Мой опыт PHP и интеграций соответствует задачам проекта.\n\n" +
      "Создано с помощью Lizard Job Agent: https://github.com/web-lizard/lizard-job-agent",
    );
  });
});
