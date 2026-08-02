"use strict";

// Lizard Job Agent — options script.
// Управляет настройками DeepSeek (ключ, модель, API URL, перезапись полей).

const apiKeyInput = document.getElementById("api-key");
const modelInput = document.getElementById("model");
const apiUrlInput = document.getElementById("api-url");
const doNotOverwriteInput = document.getElementById("do-not-overwrite");
const diagnosticsInput = document.getElementById("diagnostics");
const coverIntroEnabledInput = document.getElementById("cover-intro-enabled");
const coverIntroInput = document.getElementById("cover-intro");
const disclosureEnabledInput = document.getElementById("disclosure-enabled");
const disclosureTextInput = document.getElementById("disclosure-text");
const projectGithubUrlInput = document.getElementById("project-github-url");
const jobSearchQueryInput = document.getElementById("job-search-query");
const jobSearchAreaInput = document.getElementById("job-search-area");
const toggleKeyBtn = document.getElementById("toggle-key");
const saveBtn = document.getElementById("save-btn");
const saveProfileBtn = document.getElementById("save-profile-btn");
const testBtn = document.getElementById("test-btn");
const messageEl = document.getElementById("message");
const errorEl = document.getElementById("error");
const keyHintEl = document.getElementById("key-hint");

function showMessage(text) {
  messageEl.textContent = text;
  messageEl.classList.remove("hidden");
  errorEl.classList.add("hidden");
}

function showError(text) {
  errorEl.textContent = text;
  errorEl.classList.remove("hidden");
  messageEl.classList.add("hidden");
}

function hideMessages() {
  messageEl.classList.add("hidden");
  errorEl.classList.add("hidden");
}

function collectSettings() {
  return {
    deepseekApiKey: apiKeyInput.value.trim(),
    deepseekModel: modelInput.value.trim(),
    deepseekApiUrl: apiUrlInput.value.trim(),
    overwriteFilled: !doNotOverwriteInput.checked,
    diagnostics: diagnosticsInput.checked,
    coverLetterIntroEnabled: coverIntroEnabledInput.checked,
    coverLetterIntro: coverIntroInput.value.trim(),
    disclosureEnabled: disclosureEnabledInput.checked,
    disclosureText: disclosureTextInput.value.trim(),
    projectGithubUrl: projectGithubUrlInput.value.trim(),
    jobSearchQuery: jobSearchQueryInput.value.trim(),
    jobSearchArea: jobSearchAreaInput.value.trim(),
  };
}

async function load() {
  const response = await browser.runtime.sendMessage({ type: "LJA_GET_SETTINGS" });
  if (!response || !response.ok) {
    showError((response && response.error) || "Не удалось загрузить настройки.");
    return;
  }
  const settings = response.settings;
  modelInput.value = settings.deepseekModel || "deepseek-chat";
  apiUrlInput.value = settings.deepseekApiUrl || "https://api.deepseek.com";
  doNotOverwriteInput.checked = settings.overwriteFilled !== true;
  diagnosticsInput.checked = settings.diagnostics === true;
  coverIntroEnabledInput.checked = settings.coverLetterIntroEnabled !== false;
  coverIntroInput.value = settings.coverLetterIntro || "Здравствуйте! Меня заинтересовала ваша вакансия. Пожалуйста, ознакомьтесь с моим резюме.";
  disclosureEnabledInput.checked = settings.disclosureEnabled === true;
  disclosureTextInput.value = settings.disclosureText || "Письмо подготовлено с помощью моей программы Lizard Job Agent: {url}";
  projectGithubUrlInput.value = settings.projectGithubUrl || "https://github.com/web-lizard/lizard-job-agent";
  jobSearchQueryInput.value = settings.jobSearchQuery || "PHP разработчик OR Vue разработчик OR Nuxt разработчик OR Fullstack разработчик";
  jobSearchAreaInput.value = settings.jobSearchArea || "1";
  if (settings.hasKey) {
    keyHintEl.textContent = "Ключ сохранён на этом устройстве.";
  } else {
    keyHintEl.textContent = "Ключ не задан.";
  }
}

async function save() {
  hideMessages();
  const settings = collectSettings();
  const response = await browser.runtime.sendMessage({
    type: "LJA_SAVE_SETTINGS",
    settings,
  });
  if (!response || !response.ok) {
    showError((response && response.error) || "Не удалось сохранить настройки.");
    return;
  }
  keyHintEl.textContent = response.settings.hasKey
    ? "Ключ сохранён на этом устройстве."
    : "Ключ не задан.";
  apiKeyInput.value = "";
  showMessage("Настройки сохранены");
}

async function test() {
  hideMessages();
  testBtn.disabled = true;
  testBtn.textContent = "Проверяю…";
  try {
    const settings = collectSettings();
    const response = await browser.runtime.sendMessage({
      type: "LJA_TEST_CONNECTION",
      settings,
    });
    if (!response) {
      showError("Не удалось подключиться к DeepSeek.");
      return;
    }
    if (response.ok) {
      showMessage(response.message || "DeepSeek подключён.");
    } else {
      showError(response.message || "Ошибка проверки подключения.");
    }
  } finally {
    testBtn.disabled = false;
    testBtn.textContent = "Проверить подключение";
  }
}

toggleKeyBtn.addEventListener("click", () => {
  const show = apiKeyInput.type === "password";
  apiKeyInput.type = show ? "text" : "password";
  toggleKeyBtn.textContent = show ? "Скрыть" : "Показать";
});

saveBtn.addEventListener("click", save);
saveProfileBtn.addEventListener("click", save);
testBtn.addEventListener("click", test);

load();
