import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { JSDOM } from "jsdom";

const contentSource = readFileSync(resolve("content-i06.js"), "utf8");
const openDoms: JSDOM[] = [];

function startContent(
  html: string,
  generatedReply = "Тестовый ответ",
  setupDom?: (dom: JSDOM) => void,
) {
  const dom = new JSDOM(html, {
    url: "https://hh.ru/vacancy/135017075",
    runScripts: "outside-only",
    pretendToBeVisual: true,
  });
  openDoms.push(dom);

  Object.defineProperty(dom.window.HTMLElement.prototype, "getBoundingClientRect", {
    configurable: true,
    value() {
      return { width: 500, height: 300, top: 0, left: 0, right: 500, bottom: 300 };
    },
  });

  const listeners: Array<(message: unknown) => Promise<any>> = [];
  let generateCalls = 0;
  const browser = {
    runtime: {
      onMessage: {
        addListener(listener: (message: unknown) => Promise<any>) {
          listeners.push(listener);
        },
      },
      async sendMessage(message: any) {
        if (message.type === "LJA_GET_SETTINGS") {
          return { ok: true, settings: { diagnostics: false } };
        }
        if (message.type === "LJA_GENERATE_CHAT_REPLY") {
          generateCalls += 1;
          return { ok: true, reply: generatedReply };
        }
        if (message.type === "LJA_GENERATE_COVER_LETTER") {
          generateCalls += 1;
          return {
            ok: true,
            coverLetter: "Здравствуйте!\n\nУ меня есть релевантный опыт PHP.\n\nСоздано с помощью Lizard Job Agent.",
          };
        }
        return { ok: false, error: "unexpected message" };
      },
    },
  };
  Object.assign(dom.window, { browser });
  setupDom?.(dom);
  dom.window.eval(contentSource);

  return {
    dom,
    send: (message: unknown) => listeners[0](message),
    getGenerateCalls: () => generateCalls,
  };
}

afterEach(() => {
  while (openDoms.length) openDoms.pop()?.window.close();
});

describe("active iteration 06 content script chat flow", () => {
  it("finds a modal chat, ignores quick replies and inserts without sending", async () => {
    const app = startContent(`
      <main><h1>Страница вакансии</h1></main>
      <section role="dialog" aria-modal="true">
        <h2>Чаты</h2>
        <div data-qa="vacancy-title">PHP-разработчик</div>
        <div data-qa="company-name">Компания</div>
        <div data-qa="chat-messages">
          <div data-qa="chat-message-incoming">Добрый день.</div>
          <div data-qa="chat-message-outgoing">Здравствуйте.</div>
          <div data-qa="chat-message-incoming">Расскажите, пожалуйста, сколько лет вы работали с Laravel и в каких проектах участвовали?</div>
        </div>
        <button data-qa="quick-reply">Какая схема оплаты?</button>
        <textarea placeholder="Сообщение"></textarea>
        <button data-qa="chat-send">Отправить</button>
      </section>
    `, "Большого многолетнего коммерческого опыта именно с Laravel у меня нет.");

    const describe = await app.send({ type: "LJA_DESCRIBE" });
    expect(describe).toMatchObject({
      ok: true,
      buildId: "I06-20260802",
      pageType: "employer-chat",
      chatFound: true,
      messageInputFound: true,
      messagesCount: 3,
    });
    expect(describe.lastEmployerMessage).toContain("сколько лет вы работали с Laravel");
    expect(describe.lastEmployerMessage).not.toContain("схема оплаты");

    const sendButton = app.dom.window.document.querySelector("[data-qa='chat-send']")!;
    let sendClicks = 0;
    sendButton.addEventListener("click", () => { sendClicks += 1; });
    const result = await app.send({ type: "LJA_PREPARE_REPLY", overwriteFilled: false });
    const input = app.dom.window.document.querySelector("textarea")!;

    expect(result).toMatchObject({ ok: true, inserted: true, chatFound: true });
    expect(input.value).toContain("многолетнего коммерческого опыта");
    expect(sendClicks).toBe(0);
  });

  it("returns a non-empty object when no chat is open", async () => {
    const app = startContent("<main><h1>Вакансия</h1><textarea placeholder='Расскажите о себе'></textarea></main>");
    await expect(app.send({ type: "LJA_PREPARE_REPLY" })).resolves.toMatchObject({
      ok: true,
      pageType: "hh-page",
      chatFound: false,
      messageInputFound: false,
    });
  });

  it("does not overwrite an existing draft by default", async () => {
    const app = startContent(`
      <section role="dialog" aria-modal="true">
        <h2>Чаты</h2>
        <div data-qa="chat-message-incoming">Расскажите об опыте.</div>
        <textarea placeholder="Сообщение">Мой черновик</textarea>
      </section>
    `);

    const result = await app.send({ type: "LJA_PREPARE_REPLY", overwriteFilled: false });
    expect(result.message).toContain("Черновик не изменён");
    expect(app.dom.window.document.querySelector("textarea")!.value).toBe("Мой черновик");
    expect(app.getGenerateCalls()).toBe(0);
  });

  it("finds a contenteditable editor inside open shadow DOM", async () => {
    const app = startContent(`
      <section role="dialog" aria-modal="true">
        <h2>Чаты</h2>
        <div data-qa="chat-message-incoming">Видите содержание чата?</div>
        <div id="editor-host"></div>
      </section>
    `, "Да, теперь редактор найден.", (dom) => {
      const host = dom.window.document.getElementById("editor-host")!;
      const shadow = host.attachShadow({ mode: "open" });
      shadow.innerHTML = `
        <div data-placeholder="Сообщение">
          <div role="textbox" contenteditable="true"></div>
        </div>
      `;
    });

    const describe = await app.send({ type: "LJA_I06_DESCRIBE" });
    expect(describe).toMatchObject({
      ok: true,
      buildId: "I06-20260802",
      chatFound: true,
      messageInputFound: true,
    });

    const result = await app.send({ type: "LJA_I06_PREPARE_REPLY", overwriteFilled: false });
    const editor = app.dom.window.document.getElementById("editor-host")!.shadowRoot!
      .querySelector("[contenteditable='true']")!;
    expect(result.inserted).toBe(true);
    expect(editor.textContent).toBe("Да, теперь редактор найден.");
  });

  it("inserts a cover-letter draft without submitting the application", async () => {
    const app = startContent(`
      <main>
        <h1>PHP-разработчик</h1>
        <form>
          <label for="letter">Сопроводительное письмо</label>
          <textarea id="letter" name="coverLetter"></textarea>
          <button type="submit">Откликнуться</button>
        </form>
      </main>
    `);
    let submits = 0;
    app.dom.window.document.querySelector("form")!.addEventListener("submit", (event) => {
      submits += 1;
      event.preventDefault();
    });

    const describe = await app.send({ type: "LJA_I06_DESCRIBE" });
    expect(describe.applicationFieldFound).toBe(true);
    const result = await app.send({
      type: "LJA_I06_PREPARE_APPLICATION",
      overwriteFilled: false,
    });

    expect(result).toMatchObject({ ok: true, inserted: true, applicationFieldFound: true });
    expect(app.dom.window.document.querySelector("textarea")!.value).toContain("релевантный опыт PHP");
    expect(submits).toBe(0);
  });
});
