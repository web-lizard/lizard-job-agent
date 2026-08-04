import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { JSDOM } from "jsdom";
import { afterEach, describe, expect, it, vi } from "vitest";

const popupHtml = readFileSync(resolve("popup.html"), "utf8");
const popupSource = readFileSync(resolve("popup.js"), "utf8");
const openDoms: JSDOM[] = [];

afterEach(() => {
  while (openDoms.length) openDoms.pop()?.window.close();
});

describe("iteration 10 persistent panel frame selection", () => {
  it("selects the frame that contains the real message editor", async () => {
    const dom = new JSDOM(popupHtml, { runScripts: "outside-only", url: "moz-extension://test/popup.html" });
    openDoms.push(dom);
    let preparedFrameId = -1;
    let openedSearchUrl = "";

    const browser = {
      runtime: {
        getManifest: () => ({ version: "0.10.0" }),
        async sendMessage(message: any) {
          if (message.type === "LJA_GET_TARGET_TAB") {
            return {
              ok: true,
              buildId: "I10-20260803",
              tab: { id: 42, url: "https://hh.ru/search/vacancy" },
            };
          }
          if (message.type === "LJA_GET_SETTINGS") {
            return {
              ok: true,
              buildId: "I10-20260803",
              settings: {
                hasKey: true,
                deepseekModel: "deepseek-chat",
                overwriteFilled: false,
                jobSearchQuery: "PHP Vue разработчик",
                jobSearchArea: "1",
              },
            };
          }
          if (message.type === "LJA_GET_RESUME") {
            return { ok: true, buildId: "I10-20260803" };
          }
          return { ok: false, buildId: "I10-20260803", error: "unexpected" };
        },
        openOptionsPage: vi.fn(),
      },
      tabs: {
        async query() {
          return [{ id: 42, url: "https://hh.ru/search/vacancy" }];
        },
        async sendMessage(_tabId: number, message: any, options: { frameId: number }) {
          if (message.type === "LJA_I10_DESCRIBE") {
            return options.frameId === 7
              ? {
                  ok: true,
                  buildId: "I10-20260803",
                  chatFound: true,
                  messageInputFound: true,
                  messagesCount: 3,
                  lastEmployerMessage: "работали ли вы с медиа фасадами?",
                  pageType: "employer-chat",
                }
              : {
                  ok: true,
                  buildId: "I10-20260803",
                  chatFound: true,
                  messageInputFound: false,
                  messagesCount: 2,
                  pageType: "employer-chat",
                };
          }
          if (message.type === "LJA_I10_PREPARE_REPLY") {
            preparedFrameId = options.frameId;
            return {
              ok: true,
              buildId: "I10-20260803",
              chatFound: true,
              messageInputFound: true,
              inserted: true,
              message: "Ответ вставлен в чат. Проверьте текст и отправьте его вручную.",
            };
          }
          throw new Error("unexpected content message");
        },
        async create({ url }: { url: string }) {
          openedSearchUrl = url;
          return { id: 43, url };
        },
        onActivated: { addListener() {} },
      },
      scripting: {
        async executeScript() {
          return [{ frameId: 0 }, { frameId: 7 }];
        },
      },
    };
    Object.assign(dom.window, { browser });
    dom.window.eval(popupSource);

    await vi.waitFor(() => {
      expect(dom.window.document.getElementById("agent-status")?.textContent).toContain("frame 7/2");
    });
    expect(dom.window.document.getElementById("question-preview")?.textContent).toContain("медиа фасадами");

    dom.window.document.getElementById("reply-btn")?.click();
    await vi.waitFor(() => expect(preparedFrameId).toBe(7));
    expect(dom.window.document.getElementById("report")?.textContent).toContain("Ответ вставлен");

    dom.window.document.getElementById("search-btn")?.click();
    await vi.waitFor(() => expect(openedSearchUrl).toContain("hh.ru/search/vacancy"));
    expect(openedSearchUrl).toContain("PHP+Vue+%D1%80%D0%B0%D0%B7%D1%80%D0%B0%D0%B1%D0%BE%D1%82%D1%87%D0%B8%D0%BA");
    expect(openedSearchUrl).toContain("area=1");
  });
});
