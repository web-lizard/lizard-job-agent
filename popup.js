"use strict";

const VERSION = browser.runtime.getManifest().version;
const ITERATION = "10";
const BUILD_ID = "I10-20260803";
const refreshBtn = document.getElementById("refresh-btn");
const googleFormBlock = document.getElementById("google-form-block");
const vacancyContextEl = document.getElementById("vacancy-context");
const googleFillBtn = document.getElementById("google-fill-btn");
const hhActionsEl = document.getElementById("hh-actions");
const questionnaireBtn = document.getElementById("questionnaire-btn");
const replyBtn = document.getElementById("reply-btn");
const applicationBtn = document.getElementById("application-btn");
const searchBtn = document.getElementById("search-btn");
const settingsBtn = document.getElementById("settings-btn");
const copyDiagnosticsBtn = document.getElementById("copy-diagnostics-btn");
const statusEl = document.getElementById("status");
const reportEl = document.getElementById("report");
const errorEl = document.getElementById("error");
const deepseekStatusEl = document.getElementById("deepseek-status");
const resumeStatusEl = document.getElementById("resume-status");
const chatStatusEl = document.getElementById("chat-status");
const agentStatusEl = document.getElementById("agent-status");
const questionBlockEl = document.getElementById("question-block");
const questionPreviewEl = document.getElementById("question-preview");
const versionEl = document.getElementById("version");

let lastDescribe = null;
let lastError = "";
let resumeLoaded = false;
let deepseekConfigured = false;
let activeTabUrl = "";
let activeChatFrameId = 0;
let framesScanned = 1;
let lastFrameDescriptions = [];
let contextSaveTimer = 0;

versionEl.textContent = `Версия ${VERSION} · итерация ${ITERATION}`;

function showOnly(element, text) {
  for (const item of [statusEl, reportEl, errorEl]) item.classList.add("hidden");
  element.textContent = text;
  element.classList.remove("hidden");
}

function showError(text) {
  lastError = text;
  showOnly(errorEl, text);
}

async function getActiveTab() {
  const response = await browser.runtime.sendMessage({ type: "LJA_GET_TARGET_TAB" });
  if (response?.ok && response.buildId === BUILD_ID && response.tab) return response.tab;
  const tabs = await browser.tabs.query({ active: true });
  return tabs.find((tab) => isSupportedPageUrl(tab.url || "")) || null;
}

async function getSettings() {
  const response = await browser.runtime.sendMessage({ type: "LJA_GET_SETTINGS" });
  if (!response?.ok) throw new Error(response?.error || "Не удалось прочитать настройки.");
  if (response.buildId !== BUILD_ID) {
    throw new Error(`Фоновый код устарел: ожидался ${BUILD_ID}, получен ${response.buildId || "без номера"}. Перезагрузите расширение.`);
  }
  return response.settings;
}

async function getResumeStatus() {
  const response = await browser.runtime.sendMessage({ type: "LJA_GET_RESUME" });
  return response?.ok
    ? { ok: true }
    : { ok: false, error: response?.error || "Неизвестная ошибка resume.json." };
}

function isHhUrl(url) {
  try {
    const parsed = new URL(url);
    return parsed.protocol === "https:" && (parsed.hostname === "hh.ru" || parsed.hostname.endsWith(".hh.ru"));
  } catch {
    return false;
  }
}

function isGoogleFormUrl(url) {
  try {
    const parsed = new URL(url);
    return parsed.protocol === "https:" && parsed.hostname === "docs.google.com" && parsed.pathname.startsWith("/forms/");
  } catch {
    return false;
  }
}

function isSupportedPageUrl(url) {
  return isHhUrl(url) || isGoogleFormUrl(url);
}

function isCurrentContentResponse(response) {
  return response && typeof response === "object" && response.buildId === BUILD_ID;
}

async function ensureContentInFrames(tab) {
  if (!isSupportedPageUrl(tab.url || "") || !browser.scripting?.executeScript) return [0];
  try {
    const results = await browser.scripting.executeScript({
      target: { tabId: tab.id, allFrames: true },
      files: ["content.js"],
    });
    const ids = Array.from(new Set((results || []).map((item) => item.frameId).filter(Number.isInteger)));
    return ids.length ? ids : [0];
  } catch {
    return [0];
  }
}

async function sendToFrame(tab, frameId, message) {
  const response = await browser.tabs.sendMessage(tab.id, message, { frameId });
  if (!isCurrentContentResponse(response)) {
    throw new Error(`Frame ${frameId} ответил старым кодом: ${response?.buildId || "без номера"}.`);
  }
  return response;
}

async function describeAcrossFrames(tab) {
  const frameIds = await ensureContentInFrames(tab);
  framesScanned = frameIds.length;
  const results = await Promise.all(
    frameIds.map(async (frameId) => {
      try {
        const response = await sendToFrame(tab, frameId, { type: "LJA_I10_DESCRIBE" });
        return { frameId, response };
      } catch {
        return null;
      }
    }),
  );
  const valid = results.filter(Boolean);
  lastFrameDescriptions = valid;
  if (!valid.length) {
    throw new Error(`Агент ${BUILD_ID} не отвечает ни в одном frame. Перезагрузите текущую вкладку один раз.`);
  }
  valid.sort((left, right) => {
    const score = (item) =>
      (item.response.googleFormFound ? 2000 : 0) +
      (item.response.messageInputFound ? 1000 : 0) +
      (item.response.chatFound ? 500 : 0) +
      Number(item.response.messagesCount || 0);
    return score(right) - score(left);
  });
  activeChatFrameId = valid[0].frameId;
  return {
    ...valid[0].response,
    frameId: activeChatFrameId,
    framesScanned,
  };
}

async function prepareInActiveFrame(tab, overwriteFilled) {
  const describe = await describeAcrossFrames(tab);
  if (!describe.chatFound) {
    return { ...describe, message: "Откройте чат с работодателем на HH.ru." };
  }
  if (!describe.messageInputFound) {
    return {
      ...describe,
      message: `Чат найден, но редактор сообщения не найден ни в одном из ${describe.framesScanned} frame.`,
    };
  }
  const response = await sendToFrame(tab, activeChatFrameId, {
    type: "LJA_I10_PREPARE_REPLY",
    overwriteFilled,
  });
  return { ...response, frameId: activeChatFrameId, framesScanned };
}

async function prepareApplicationAcrossFrames(tab, overwriteFilled) {
  await describeAcrossFrames(tab);
  const target = lastFrameDescriptions.find((item) => item.response.applicationFieldFound);
  if (!target) {
    return {
      ok: true,
      buildId: BUILD_ID,
      applicationFieldFound: false,
      message: "Откройте форму отклика с полем сопроводительного письма.",
      framesScanned,
    };
  }
  const response = await sendToFrame(tab, target.frameId, {
    type: "LJA_I10_PREPARE_APPLICATION",
    overwriteFilled,
  });
  return { ...response, frameId: target.frameId, framesScanned };
}

function renderChatStatus(describe) {
  lastDescribe = describe;
  const googleFormFound = Boolean(describe?.ok && describe.googleFormFound);
  const found = googleFormFound || Boolean(describe?.ok && describe.chatFound);
  chatStatusEl.textContent = googleFormFound
    ? `Google Forms · ${Number(describe.fieldsCount || 0)} полей`
    : found ? "чат найден" : "не найден";
  chatStatusEl.classList.toggle("ok", found);
  chatStatusEl.classList.toggle("warn", !found);
  const agentCurrent = describe?.buildId === BUILD_ID;
  agentStatusEl.textContent = agentCurrent
    ? `${BUILD_ID} ✓ · frame ${describe?.frameId ?? 0}/${describe?.framesScanned ?? 1}`
    : describe?.buildId || "не подключён";
  agentStatusEl.classList.toggle("ok", agentCurrent);
  agentStatusEl.classList.toggle("error-state", Boolean(describe) && !agentCurrent);
  agentStatusEl.classList.toggle("warn", !describe);
  const question = describe?.lastEmployerMessage || "";
  questionPreviewEl.textContent = question.length > 180 ? `${question.slice(0, 177)}…` : question;
  questionBlockEl.classList.toggle("hidden", !question);
  questionnaireBtn.classList.toggle("hidden", !describe?.hhQuestionnaireFound);
}

async function refreshStatus() {
  try {
    const [settings, resume, tab] = await Promise.all([
      getSettings(),
      getResumeStatus(),
      getActiveTab(),
    ]);

    deepseekConfigured = Boolean(settings.hasKey);
    const model = settings.deepseekModel || "модель не указана";
    deepseekStatusEl.textContent = deepseekConfigured ? `настроен (${model})` : "не настроен";
    deepseekStatusEl.classList.toggle("ok", deepseekConfigured);
    deepseekStatusEl.classList.toggle("warn", !deepseekConfigured);

    resumeLoaded = resume.ok;
    resumeStatusEl.textContent = resume.ok ? "загружено" : `ошибка: ${resume.error}`;
    resumeStatusEl.classList.toggle("ok", resume.ok);
    resumeStatusEl.classList.toggle("warn", !resume.ok);

    if (!tab || typeof tab.id !== "number") {
      activeTabUrl = "";
      renderChatStatus(null);
      return;
    }
    activeTabUrl = tab.url || "";
    const googleMode = isGoogleFormUrl(activeTabUrl);
    googleFormBlock.classList.toggle("hidden", !googleMode);
    hhActionsEl.classList.toggle("hidden", googleMode);
    if (!isSupportedPageUrl(activeTabUrl)) {
      renderChatStatus(null);
      showOnly(reportEl, "Откройте HH.ru или Google Forms.");
      return;
    }
    const describe = await describeAcrossFrames(tab);
    if (!describe.ok) throw new Error(describe.error || "Не удалось проверить чат.");
    renderChatStatus(describe);
    if (describe.googleFormFound) {
      showOnly(reportEl, `Google-форма найдена: ${Number(describe.fieldsCount || 0)} доступных полей.`);
    } else if (!describe.chatFound) {
      showOnly(reportEl, "Откройте чат с работодателем на HH.ru.");
    } else if (!describe.messageInputFound) {
      showOnly(reportEl, "Чат найден, но поле сообщения не обнаружено.");
    }
  } catch (error) {
    renderChatStatus(null);
    showError(error instanceof Error ? error.message : "Ошибка проверки расширения.");
  }
}

async function fillGoogleForm() {
  googleFillBtn.disabled = true;
  showOnly(statusEl, "Читаю вопросы Google Forms и готовлю ответы по вакансии…");
  try {
    const vacancyText = vacancyContextEl.value.trim();
    if (vacancyText.length < 30) throw new Error("Сначала вставьте текст вакансии в поле выше.");
    await browser.storage.local.set({ ljaGoogleVacancyContext: vacancyText });

    const tab = await getActiveTab();
    if (!tab || typeof tab.id !== "number" || !isGoogleFormUrl(tab.url || "")) {
      throw new Error("Откройте нужную Google-форму и повторите.");
    }
    const settings = await getSettings();
    await describeAcrossFrames(tab);
    const target = lastFrameDescriptions.find((item) => item.response.googleFormFound);
    if (!target) throw new Error("Google-форма найдена, но агент страницы к ней не подключился.");
    const response = await sendToFrame(tab, target.frameId, {
      type: "LJA_I10_FILL_GOOGLE_FORM",
      vacancyText,
      overwriteFilled: settings.overwriteFilled === true,
    });
    if (!response.ok) throw new Error(response.error || "Не удалось заполнить Google-форму.");
    const result = response.result || { filled: [], skipped: [], failed: [] };
    showOnly(
      reportEl,
      `${response.message || "Готово."} Пропущено: ${result.skipped?.length || 0}, ошибок: ${result.failed?.length || 0}.`,
    );
  } catch (error) {
    showError(error instanceof Error ? error.message : "Ошибка заполнения Google Forms.");
  } finally {
    googleFillBtn.disabled = false;
  }
}

async function fillHhQuestionnaire() {
  questionnaireBtn.disabled = true;
  showOnly(statusEl, "Читаю вопросы работодателя и готовлю ответы по резюме…");
  try {
    const tab = await getActiveTab();
    if (!tab || typeof tab.id !== "number" || !isHhUrl(tab.url || "")) {
      throw new Error("Откройте страницу с вопросами работодателя на HH.ru.");
    }
    const settings = await getSettings();
    await describeAcrossFrames(tab);
    const target = lastFrameDescriptions.find((item) => item.response.hhQuestionnaireFound);
    if (!target) throw new Error("Поля вопросов работодателя не найдены.");
    const response = await sendToFrame(tab, target.frameId, {
      type: "LJA_I10_FILL_HH_QUESTIONNAIRE",
      overwriteFilled: settings.overwriteFilled === true,
    });
    if (!response.ok) throw new Error(response.error || "Не удалось подготовить ответы работодателю.");
    const result = response.result || { filled: [], skipped: [], failed: [] };
    showOnly(
      reportEl,
      `${response.message || "Готово."} Пропущено: ${result.skipped?.length || 0}, ошибок: ${result.failed?.length || 0}.`,
    );
  } catch (error) {
    showError(error instanceof Error ? error.message : "Ошибка заполнения вопросов работодателя.");
  } finally {
    questionnaireBtn.disabled = false;
  }
}

async function loadVacancyContext() {
  const stored = await browser.storage.local.get("ljaGoogleVacancyContext");
  vacancyContextEl.value = typeof stored.ljaGoogleVacancyContext === "string"
    ? stored.ljaGoogleVacancyContext
    : "";
}

async function prepareReply() {
  replyBtn.disabled = true;
  showOnly(statusEl, "Читаю переписку и готовлю ответ…");
  try {
    const tab = await getActiveTab();
    if (!tab || typeof tab.id !== "number" || !isHhUrl(tab.url || "")) {
      throw new Error("Откройте чат с работодателем на HH.ru.");
    }
    activeTabUrl = tab.url || "";
    const settings = await getSettings();
    const response = await prepareInActiveFrame(tab, settings.overwriteFilled === true);
    if (!response.ok) throw new Error(response.error || "Не удалось подготовить ответ.");
    renderChatStatus(response);
    showOnly(reportEl, response.message || "Готово.");
  } catch (error) {
    showError(error instanceof Error ? error.message : "Ошибка подготовки ответа.");
  } finally {
    replyBtn.disabled = false;
  }
}

async function prepareApplicationDraft() {
  applicationBtn.disabled = true;
  showOnly(statusEl, "Готовлю персональное сопроводительное письмо…");
  try {
    const tab = await getActiveTab();
    if (!tab || typeof tab.id !== "number" || !isHhUrl(tab.url || "")) {
      throw new Error("Откройте вакансию или форму отклика на HH.ru.");
    }
    activeTabUrl = tab.url || "";
    const settings = await getSettings();
    const response = await prepareApplicationAcrossFrames(
      tab,
      settings.overwriteFilled === true,
    );
    if (!response.ok) throw new Error(response.error || "Не удалось подготовить сопроводительное письмо.");
    showOnly(reportEl, response.message || "Готово.");
  } catch (error) {
    showError(error instanceof Error ? error.message : "Ошибка подготовки сопроводительного письма.");
  } finally {
    applicationBtn.disabled = false;
  }
}

async function openVacancySearch() {
  searchBtn.disabled = true;
  try {
    const settings = await getSettings();
    const url = new URL("https://hh.ru/search/vacancy");
    url.searchParams.set("text", settings.jobSearchQuery || "PHP разработчик");
    if (settings.jobSearchArea) url.searchParams.set("area", settings.jobSearchArea);
    url.searchParams.set("order_by", "publication_time");
    await browser.tabs.create({ url: url.toString() });
    showOnly(reportEl, "Поиск HH.ru открыт в новой вкладке.");
  } catch (error) {
    showError(error instanceof Error ? error.message : "Не удалось открыть поиск вакансий.");
  } finally {
    searchBtn.disabled = false;
  }
}

function diagnosticsText() {
  return [
    `version=${VERSION}`,
    `iteration=${ITERATION}`,
    `buildId=${BUILD_ID}`,
    `contentBuildId=${lastDescribe?.buildId || "missing"}`,
    `frameId=${lastDescribe?.frameId ?? activeChatFrameId}`,
    `framesScanned=${lastDescribe?.framesScanned ?? framesScanned}`,
    `url=${activeTabUrl}`,
    `pageType=${lastDescribe?.pageType || "unknown"}`,
    `chatFound=${Boolean(lastDescribe?.chatFound)}`,
    `messageInputFound=${Boolean(lastDescribe?.messageInputFound)}`,
    `messagesCount=${Number(lastDescribe?.messagesCount || 0)}`,
    `googleFormFound=${Boolean(lastDescribe?.googleFormFound)}`,
    `googleFieldsCount=${Number(lastDescribe?.fieldsCount || 0)}`,
    `hhQuestionnaireFound=${Boolean(lastDescribe?.hhQuestionnaireFound)}`,
    `questionnaireFieldsCount=${Number(lastDescribe?.questionnaireFieldsCount || 0)}`,
    `vacancyContextLength=${vacancyContextEl.value.trim().length}`,
    `resumeLoaded=${resumeLoaded}`,
    `deepseekConfigured=${deepseekConfigured}`,
    `lastError=${lastError}`,
  ].join("\n");
}

async function copyDiagnostics() {
  try {
    await navigator.clipboard.writeText(diagnosticsText());
    showOnly(reportEl, "Диагностика скопирована.");
  } catch {
    showError("Не удалось скопировать диагностику в буфер обмена.");
  }
}

replyBtn.addEventListener("click", prepareReply);
applicationBtn.addEventListener("click", prepareApplicationDraft);
searchBtn.addEventListener("click", openVacancySearch);
refreshBtn.addEventListener("click", refreshStatus);
googleFillBtn.addEventListener("click", fillGoogleForm);
questionnaireBtn.addEventListener("click", fillHhQuestionnaire);
vacancyContextEl.addEventListener("input", () => {
  window.clearTimeout(contextSaveTimer);
  contextSaveTimer = window.setTimeout(() => {
    browser.storage.local.set({ ljaGoogleVacancyContext: vacancyContextEl.value }).catch(() => {});
  }, 400);
});
settingsBtn.addEventListener("click", () => browser.runtime.openOptionsPage());
copyDiagnosticsBtn.addEventListener("click", copyDiagnostics);
browser.tabs.onActivated.addListener(() => setTimeout(refreshStatus, 150));
loadVacancyContext().catch(() => {});
refreshStatus();
