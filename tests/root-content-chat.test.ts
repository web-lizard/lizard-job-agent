import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { JSDOM } from "jsdom";

const contentSource = readFileSync(resolve("content.js"), "utf8");
const openDoms: JSDOM[] = [];

function startContent(
  html: string,
  generatedReply = "Тестовый ответ",
  setupDom?: (dom: JSDOM) => void,
  pageUrl = "https://hh.ru/vacancy/135017075",
) {
  const dom = new JSDOM(html, {
    url: pageUrl,
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
  let lastCoverVacancy: any = null;
  let lastAnswersVacancy: any = null;
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
        if (message.type === "LJA_GET_RESUME") {
          return {
            ok: true,
            resume: {
              candidate: { fullName: "Хорошаев Ярослав Сергеевич" },
              target: { desiredSalaryRubNet: 130000 },
              canonicalAnswers: {},
            },
          };
        }
        if (message.type === "LJA_GENERATE_ANSWERS") {
          generateCalls += 1;
          lastAnswersVacancy = message.vacancy;
          return {
            ok: true,
            answers: message.questions.map((question: any) => ({
              fieldIndex: question.fieldIndex,
              action: "fill",
              answer: "Релевантный ответ с учётом PHP, Vue и задач вакансии.",
              confidence: "high",
              needsReview: false,
            })),
          };
        }
        if (message.type === "LJA_GENERATE_CHAT_REPLY") {
          generateCalls += 1;
          return { ok: true, reply: generatedReply };
        }
        if (message.type === "LJA_GENERATE_COVER_LETTER") {
          generateCalls += 1;
          lastCoverVacancy = message.vacancy;
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
    send: (message: unknown) => listeners[0]!(message),
    getGenerateCalls: () => generateCalls,
    getLastCoverVacancy: () => lastCoverVacancy,
    getLastAnswersVacancy: () => lastAnswersVacancy,
  };
}

afterEach(() => {
  while (openDoms.length) openDoms.pop()?.window.close();
});

describe("active iteration 10 content script chat flow", () => {
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
      buildId: "I10-20260803",
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

    const describe = await app.send({ type: "LJA_I10_DESCRIBE" });
    expect(describe).toMatchObject({
      ok: true,
      buildId: "I10-20260803",
      chatFound: true,
      messageInputFound: true,
    });

    const result = await app.send({ type: "LJA_I10_PREPARE_REPLY", overwriteFilled: false });
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

    const describe = await app.send({ type: "LJA_I10_DESCRIBE" });
    expect(describe.applicationFieldFound).toBe(true);
    const result = await app.send({
      type: "LJA_I10_PREPARE_APPLICATION",
      overwriteFilled: false,
    });

    expect(result).toMatchObject({ ok: true, inserted: true, applicationFieldFound: true });
    expect(app.dom.window.document.querySelector("textarea")!.value).toContain("релевантный опыт PHP");
    expect(submits).toBe(0);
  });

  it("uses the chat textarea when HH switches it into the cover-letter composer", async () => {
    const app = startContent(`
      <div role="dialog" data-qa="chat-window">
        <div data-qa="chat-message">Отклик на вакансию — без сопроводительного письма</div>
        <section data-qa="cover-letter-composer">
          <strong>Сопроводительное письмо</strong>
          <span>Введите текст сопроводительного письма</span>
          <textarea placeholder="Сообщение"></textarea>
        </section>
      </div>
    `);

    const describe = await app.send({ type: "LJA_I10_DESCRIBE" });
    expect(describe).toMatchObject({
      chatFound: true,
      messageInputFound: true,
      applicationFieldFound: true,
    });

    const result = await app.send({
      type: "LJA_I10_PREPARE_APPLICATION",
      overwriteFilled: false,
    });
    expect(result).toMatchObject({ ok: true, inserted: true, applicationFieldFound: true });
    expect(app.dom.window.document.querySelector("textarea")!.value).toContain("релевантный опыт PHP");
  });

  it("detects the current HH cover-letter popup and sends full vacancy context", async () => {
    const app = startContent(`
      <script type="application/ld+json">
        {"@type":"JobPosting","title":"Fullstack-разработчик","hiringOrganization":{"name":"Центр Интеграции"},"description":"<p>React, TypeScript, Node.js и PostgreSQL. Разработка сервисов для молекулярной генетики.</p>"}
      </script>
      <h1 data-qa="vacancy-title">Fullstack-разработчик</h1>
      <form id="cover-letter-ai-5472895082" action="/applicant/vacancy_response/edit_ajax">
        <h2>Сопроводительное письмо</h2>
        <textarea data-qa="vacancy-response-popup-form-letter-input" name="text"></textarea>
        <button type="submit">Отправить</button>
      </form>
    `);

    const result = await app.send({
      type: "LJA_I10_PREPARE_APPLICATION",
      overwriteFilled: false,
    });
    expect(result).toMatchObject({ ok: true, inserted: true, applicationFieldFound: true });
    expect(app.getLastCoverVacancy()).toMatchObject({
      title: "Fullstack-разработчик",
      company: "Центр Интеграции",
      url: "https://hh.ru/vacancy/135017075",
    });
    expect(app.getLastCoverVacancy().description).toContain("React, TypeScript, Node.js и PostgreSQL");
  });

  it("fills Google Forms from resume and manual vacancy context without submitting", async () => {
    const app = startContent(`
      <form>
        <div role="listitem">
          <div>Укажите ваше ФИ</div>
          <input type="text" aria-label="Укажите ваше ФИ" />
        </div>
        <div role="listitem">
          <div>Приведите 2-3 ваших проекта с использованием AI</div>
          <textarea aria-label="Приведите 2-3 ваших проекта с использованием AI"></textarea>
        </div>
        <button type="submit">Отправить</button>
      </form>
    `, "Тестовый ответ", undefined, "https://docs.google.com/forms/d/e/test/viewform");
    let submits = 0;
    app.dom.window.document.querySelector("form")!.addEventListener("submit", (event) => {
      submits += 1;
      event.preventDefault();
    });

    const vacancyText = "PHP/Vue разработчик. Нужны интеграции, REST API и опыт применения AI-инструментов в разработке.";
    const result = await app.send({
      type: "LJA_I10_FILL_GOOGLE_FORM",
      vacancyText,
      overwriteFilled: false,
    });

    expect(result).toMatchObject({ ok: true, googleFormFound: true, pageType: "google-form" });
    expect(app.dom.window.document.querySelector("input")!.value).toBe("Хорошаев Ярослав Сергеевич");
    expect(app.dom.window.document.querySelector("textarea")!.value).toContain("Релевантный ответ");
    expect(app.getLastAnswersVacancy()).toMatchObject({
      description: vacancyText,
      source: "manual-google-form-context",
    });
    expect(submits).toBe(0);
  });

  it("fills HH employer questionnaire fields and never submits the response", async () => {
    const app = startContent(`
      <form>
        <label for="self-employed">Вы готовы оформиться по самозанятости/ИП?</label>
        <textarea id="self-employed" name="task_324289949_text"></textarea>
        <label for="hubstaff">Готовы работать через программу учета рабочего времени Hubstaff?</label>
        <textarea id="hubstaff" name="task_324289950_text"></textarea>
        <label for="salary">Укажите ваши зарплатные ожидания</label>
        <textarea id="salary" name="task_324289951_text"></textarea>
        <button type="submit">Продолжить</button>
      </form>
    `, "Тестовый ответ", undefined, "https://hh.ru/applicant/vacancy_response?vacancyId=135256076");
    let submits = 0;
    app.dom.window.document.querySelector("form")!.addEventListener("submit", (event) => {
      submits += 1;
      event.preventDefault();
    });

    const describe = await app.send({ type: "LJA_I10_DESCRIBE" });
    expect(describe).toMatchObject({ hhQuestionnaireFound: true, questionnaireFieldsCount: 3 });

    const result = await app.send({
      type: "LJA_I10_FILL_HH_QUESTIONNAIRE",
      overwriteFilled: false,
    });
    const fields = Array.from(app.dom.window.document.querySelectorAll("textarea"));
    expect(result).toMatchObject({ ok: true, pageType: "hh-questionnaire", hhQuestionnaireFound: true });
    expect(fields[0]!.value).toContain("Релевантный ответ");
    expect(fields[1]!.value).toContain("Релевантный ответ");
    expect(fields[2]!.value).toBe("130000");
    expect(submits).toBe(0);
  });
});
