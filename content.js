(() => {
"use strict";

if (globalThis.__ljaContentScriptI10Loaded) return;
globalThis.__ljaContentScriptI10Loaded = true;
const BUILD_ID = "I10-20260803";

// Lizard Job Agent — content script (Firefox MV3).
// Отвечает за:
//  - поиск и классификацию полей формы отклика;
//  - локальное заполнение детерминированных и канонических полей из resume.json;
//  - сбор открытых вопросов и контекста вакансии для DeepSeek;
//  - вставку ответов DeepSeek в поля;
//  - возврат результата в popup.

// ---------------------------------------------------------------------------
// Утилиты
// ---------------------------------------------------------------------------

function normalizeText(value) {
  return String(value || "")
    .toLocaleLowerCase("ru-RU")
    .replaceAll("ё", "е")
    .replace(/[•·:*_—–|()[\]{}<>!?]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function isVisible(element) {
  if (!(element instanceof Element) || !element.isConnected) return false;
  const style = window.getComputedStyle(element);
  const rect = element.getBoundingClientRect();
  return (
    !element.hidden &&
    element.getAttribute("aria-hidden") !== "true" &&
    style.display !== "none" &&
    style.visibility !== "hidden" &&
    style.opacity !== "0" &&
    (rect.width > 0 || rect.height > 0)
  );
}

// React/Vue-совместимая установка значения с событиями input/change/blur.
function setNativeValue(element, value) {
  element.focus();
  if (element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement) {
    const prototype =
      element instanceof HTMLInputElement
        ? HTMLInputElement.prototype
        : HTMLTextAreaElement.prototype;
    const setter = Object.getOwnPropertyDescriptor(prototype, "value")?.set;
    if (setter) setter.call(element, value);
    else element.value = value;
  } else if (element instanceof HTMLSelectElement) {
    element.value = value;
  } else if (
    element.isContentEditable ||
    element.getAttribute("contenteditable") === "true" ||
    element.getAttribute("contenteditable") === "plaintext-only"
  ) {
    element.textContent = value;
  }

  element.dispatchEvent(
    new InputEvent("input", {
      bubbles: true,
      inputType: "insertText",
      data: value,
    }),
  );
  element.dispatchEvent(new Event("change", { bubbles: true }));
}

function setChecked(element, checked) {
  if (element.checked !== checked) element.click();
  element.dispatchEvent(new Event("change", { bubbles: true }));
}

function readValue(element) {
  if (
    element instanceof HTMLInputElement ||
    element instanceof HTMLTextAreaElement ||
    element instanceof HTMLSelectElement
  ) {
    if (element instanceof HTMLInputElement && element.type === "checkbox") {
      return String(element.checked);
    }
    return element.value.trim();
  }
  return (element.textContent || "").trim();
}

// Проверяет, заполнено ли поле пользователем.
// Для checkbox/radio учитывается именно состояние checked, а не строка.
function hasValue(element) {
  if (
    element instanceof HTMLInputElement &&
    (element.type === "checkbox" || element.type === "radio")
  ) {
    return element.checked;
  }
  return Boolean(readValue(element));
}

// ---------------------------------------------------------------------------
// Поиск полей
// ---------------------------------------------------------------------------

const FIELD_SELECTOR = [
  "input:not([type='hidden']):not([type='password']):not([type='file']):not([type='submit']):not([type='reset']):not([type='button'])",
  "textarea",
  "select",
  "[contenteditable='true']",
  "[role='textbox']",
  "[role='combobox']",
].join(",");

// Юридические и опасные checkbox, которые никогда не отмечаем автоматически.
const LEGAL_CHECKBOX_PATTERN =
  /соглас|согласие|персональн|обработк|услови|оферт|политик|конфиденц|достоверн|подтвержд|рассылк|третьим лицам|legal|consent|agree|terms|privacy|subscribe|newsletter/i;

// Кнопки, которые никогда не нажимаем.
const FORBIDDEN_BUTTON_PATTERN =
  /сохран|отправ|отклик|опубликов|submit|apply|publish|respond|далее|продолжить|next|continue/i;

function collectFields() {
  const elements = Array.from(document.querySelectorAll(FIELD_SELECTOR)).filter(
    (el) => {
      if (!isVisible(el)) return false;
      if (el.disabled || el.readOnly) return false;
      if (el instanceof HTMLInputElement && el.type === "checkbox") {
        // Пропускаем юридические согласия.
        const label = describeElement(el).label;
        if (LEGAL_CHECKBOX_PATTERN.test(label)) return false;
      }
      return true;
    },
  );
  return elements.slice(0, 300);
}

// ---------------------------------------------------------------------------
// Определение подписи поля
// ---------------------------------------------------------------------------

function describeElement(element) {
  const parts = [];

  const id = element.getAttribute("id");
  if (id) {
    const label = Array.from(document.querySelectorAll("label[for]")).find(
      (candidate) => candidate.getAttribute("for") === id,
    );
    if (label && label.textContent) parts.push(label.textContent);
  }

  const wrappingLabel = element.closest("label");
  if (wrappingLabel && wrappingLabel.textContent) {
    parts.push(wrappingLabel.textContent);
  }

  const ariaLabel = element.getAttribute("aria-label");
  if (ariaLabel) parts.push(ariaLabel);

  const labelledBy = element.getAttribute("aria-labelledby");
  if (labelledBy) {
    for (const labelledId of labelledBy.split(/\s+/)) {
      const labelled = document.getElementById(labelledId);
      if (labelled && labelled.textContent) parts.push(labelled.textContent);
    }
  }

  const hasSemanticLabel = parts.some((part) => normalizeText(part).length > 0);

  const placeholder = element.getAttribute("placeholder");
  if (placeholder) parts.push(placeholder);

  const name = element.getAttribute("name");
  if (name) parts.push(name);

  if (!hasSemanticLabel) {
    // Ближайший заголовок нужен только когда у поля нет собственного label/aria-labelledby.
    let node = element.parentElement;
    for (let depth = 0; node && depth < 4; depth += 1) {
      const heading = node.querySelector("h1, h2, h3, h4, h5, h6, legend, [class*='label'], [class*='title']");
      if (heading && heading.textContent) {
        parts.push(heading.textContent);
        break;
      }
      node = node.parentElement;
    }

    // Текст родительского контейнера (ограниченный).
    let parent = element.parentElement;
    for (let depth = 0; parent && depth < 3; depth += 1) {
      const text = normalizeText(parent.innerText || parent.textContent || "");
      if (text.length > 0 && text.length <= 180) {
        parts.push(text);
        break;
      }
      parent = parent.parentElement;
    }
  }

  const label = normalizeText(parts.join(" "));
  return { label, descriptor: label };
}

// ---------------------------------------------------------------------------
// Классификация полей
// ---------------------------------------------------------------------------

// Детерминированные персональные поля: заполняются локально из resume.json.
const DETERMINISTIC_RULES = [
  { key: "fullName", pattern: /фио|ф\.и\.о|укажите ваше фи(?:\s|$)|^фи(?:\s|$)|полное имя|full name|имя и фамили/i },
  { key: "firstName", pattern: /^имя$|имя\b(?! и фамили)/i },
  { key: "lastName", pattern: /фамили/i },
  { key: "middleName", pattern: /отчество|middle name/i },
  { key: "phone", pattern: /телефон|контактный телефон|phone|mobile/i },
  { key: "email", pattern: /электронн|email|e-mail|почта/i },
  { key: "city", pattern: /город|место жительств|residence|city/i },
  { key: "metro", pattern: /метро|станция метро|metro/i },
  { key: "github", pattern: /github|гитхаб|git hub/i },
  { key: "salary", pattern: /зарплат|доход|salary|income|уровень дохода/i },
  { key: "relocation", pattern: /переезд|relocation/i },
  { key: "businessTrips", pattern: /командировк|business trip/i },
  { key: "workFormat", pattern: /формат работы|удалённ|гибрид|офис|work format|remote/i },
  { key: "employmentType", pattern: /тип занятости|формат занятости|employment type|график работы/i },
];

// Простые поля с известным каноническим ответом.
const CANONICAL_RULES = [
  { key: "about", pattern: /о себе|обо мне|расскажите о себе|о вас|about me|summary|профессиональн/i },
  { key: "github", pattern: /портфолио|ссылка на github|github|портфолио|portfolio/i },
  { key: "salary", pattern: /ожидани.*зарплат|зарплат.*ожидани|желаем.*доход|salary expectation/i },
  { key: "workFormat", pattern: /формат работы|удалённ|гибрид|офис/i },
  { key: "relocation", pattern: /переезд|relocation/i },
  { key: "businessTrips", pattern: /командировк|business trip/i },
  { key: "start", pattern: /когда готовы выйти|когда можете выйти|дата выхода|start date|available/i },
  { key: "whyLooking", pattern: /почему.*новую работу|почему.*рассматриваете|причина.*поиск|почему ищете/i },
];

// Открытые вопросы: отправляются в DeepSeek.
const OPEN_QUESTION_PATTERN =
  /почему.*заинтересовал|почему.*подходит|релевантн|опыт.*стек|похожие задачи|сопроводительн|дополнительн|комментари|расскажите.*опыт|какой опыт|как решали|почему вы|ваши сильные|ваши слабые|что вас мотивирует|достижения|проект|технологи|framework|фреймворк|laravel|symfony|python|vue|nuxt|docker|ии|ai|искусственн|почему именно|интересн.*ваканси/i;

// Поля для ручной проверки: не заполняем выдуманными значениями.
const MANUAL_FIELD_PATTERN =
  /английск|english|образован|education|гражданств|citizenship|разрешение на работу|дата рождения|birth|семейн|воинск|военн|точн.*лет|точн.*год|работодател|рост продаж|конверси|производительност|согласие|подтвержд|достоверн|юридическ|обработк персональн|рассылк/i;

function classifyField(element, index) {
  const { label, descriptor } = describeElement(element);
  const text = `${label} ${descriptor} ${element.getAttribute("placeholder") || ""} ${element.getAttribute("name") || ""}`;
  const normalized = normalizeText(text);

  const isCheckbox = element instanceof HTMLInputElement && element.type === "checkbox";
  const isRadio = element instanceof HTMLInputElement && element.type === "radio";
  const isSelect = element instanceof HTMLSelectElement;
  const isTextarea = element instanceof HTMLTextAreaElement;
  const isContentEditable = element.isContentEditable;

  // Поля для ручной проверки.
  if (MANUAL_FIELD_PATTERN.test(normalized)) {
    return {
      index,
      element,
      category: "manual",
      label,
      options: collectOptions(element),
    };
  }

  // Детерминированные персональные поля.
  for (const rule of DETERMINISTIC_RULES) {
    if (rule.pattern.test(normalized)) {
      return {
        index,
        element,
        category: "deterministic",
        key: rule.key,
        label,
        options: collectOptions(element),
      };
    }
  }

  // Канонические поля.
  for (const rule of CANONICAL_RULES) {
    if (rule.pattern.test(normalized)) {
      return {
        index,
        element,
        category: "canonical",
        key: rule.key,
        label,
        options: collectOptions(element),
      };
    }
  }

  // Открытые вопросы.
  if (isTextarea || isContentEditable || OPEN_QUESTION_PATTERN.test(normalized)) {
    return {
      index,
      element,
      category: "open",
      label,
      options: collectOptions(element),
    };
  }

  // select/radio/checkbox с вариантами — передаём в DeepSeek как select.
  if (isSelect || isRadio || isCheckbox) {
    return {
      index,
      element,
      category: "open",
      label,
      options: collectOptions(element),
    };
  }

  // Остальные текстовые поля — открытые вопросы.
  return {
    index,
    element,
    category: "open",
    label,
    options: collectOptions(element),
  };
}

function collectOptions(element) {
  if (element instanceof HTMLSelectElement) {
    return Array.from(element.options)
      .map((option) => (option.textContent || option.label || "").trim())
      .filter(Boolean)
      .slice(0, 200);
  }
  if (element instanceof HTMLInputElement && (element.type === "radio" || element.type === "checkbox")) {
    const name = element.getAttribute("name");
    if (name) {
      return Array.from(
        document.querySelectorAll(`input[name="${CSS.escape(name)}"]`),
      )
        .map((el) => {
          const label = describeElement(el).label;
          return label || el.value || "";
        })
        .filter(Boolean)
        .slice(0, 50);
    }
  }
  return undefined;
}

// ---------------------------------------------------------------------------
// Локальное заполнение из resume.json
// ---------------------------------------------------------------------------

function deterministicValue(resume, key) {
  const c = resume.candidate || {};
  const t = resume.target || {};
  switch (key) {
    case "fullName":
      return c.fullName || "";
    case "firstName":
      return c.firstName || "";
    case "lastName":
      return c.lastName || "";
    case "middleName":
      return c.middleName || "";
    case "phone":
      return c.phone || "";
    case "email":
      return c.email || "";
    case "city":
      return c.city || "";
    case "metro":
      return c.metro || "";
    case "github":
      return c.github || "";
    case "salary":
      return t.desiredSalaryRubNet ? String(t.desiredSalaryRubNet) : "";
    case "relocation":
      return t.relocation;
    case "businessTrips":
      return t.businessTrips;
    case "workFormat":
      return (t.workFormats || []).join(", ");
    case "employmentType":
      return (t.employmentTypes || []).join(", ");
    default:
      return "";
  }
}

function canonicalValue(resume, key) {
  const answers = (resume.canonicalAnswers || {});
  switch (key) {
    case "about":
      return answers.about || (resume.summary && resume.summary.short) || "";
    case "github":
      return answers.github || (resume.candidate && resume.candidate.github) || "";
    case "salary":
      return answers.salary || "";
    case "workFormat":
      return answers.workFormat || "";
    case "relocation":
      return answers.relocation || "";
    case "businessTrips":
      return answers.businessTrips || "";
    case "start":
      return answers.start || "";
    case "whyLooking":
      return answers.whyLooking || "";
    default:
      return "";
  }
}

function fillLocalField(field, value, doNotOverwrite, result) {
  const element = field.element;
  if (value === undefined || value === null || value === "") {
    result.skipped.push({ index: field.index, label: field.label, reason: "Нет данных в resume.json" });
    highlight(element, "review");
    return;
  }

  if (doNotOverwrite && hasValue(element)) {
    result.skipped.push({ index: field.index, label: field.label, reason: "Поле уже заполнено" });
    highlight(element, "review");
    return;
  }

  try {
    if (typeof value === "boolean") {
      if (element instanceof HTMLInputElement && (element.type === "checkbox" || element.type === "radio")) {
        setChecked(element, value);
        result.filled.push({ index: field.index, label: field.label, value: String(value) });
        highlight(element, "filled");
      } else {
        result.skipped.push({ index: field.index, label: field.label, reason: "Поле не является checkbox/radio" });
        highlight(element, "review");
      }
      return;
    }

    const textValue = String(value);
    if (element instanceof HTMLSelectElement) {
      const option = Array.from(element.options).find((opt) => {
        const optText = normalizeText(opt.textContent || opt.label);
        const target = normalizeText(textValue);
        return optText === target || optText.includes(target) || target.includes(optText);
      });
      if (option) {
        setNativeValue(element, option.value);
        result.filled.push({ index: field.index, label: field.label, value: textValue });
        highlight(element, "filled");
      } else {
        result.skipped.push({ index: field.index, label: field.label, reason: "Вариант не найден в select" });
        highlight(element, "review");
      }
      return;
    }

    if (element instanceof HTMLInputElement && (element.type === "checkbox" || element.type === "radio")) {
      // Для radio/checkbox с текстовым значением пытаемся найти подходящий вариант.
      const name = element.getAttribute("name");
      if (name) {
        const candidates = Array.from(
          document.querySelectorAll(`input[name="${CSS.escape(name)}"]`),
        );
        const target = normalizeText(textValue);
        const match = candidates.find((el) => {
          const elLabel = normalizeText(describeElement(el).label);
          return elLabel === target || elLabel.includes(target) || target.includes(elLabel);
        });
        if (match) {
          setChecked(match, true);
          result.filled.push({ index: field.index, label: field.label, value: textValue });
          highlight(match, "filled");
          return;
        }
      }
      result.skipped.push({ index: field.index, label: field.label, reason: "Подходящий вариант не найден" });
      highlight(element, "review");
      return;
    }

    setNativeValue(element, textValue);
    result.filled.push({ index: field.index, label: field.label, value: textValue });
    highlight(element, "filled");
  } catch (error) {
    result.failed.push({
      index: field.index,
      label: field.label,
      reason: error instanceof Error ? error.message : "Ошибка заполнения",
    });
    highlight(element, "error");
  }
}

// ---------------------------------------------------------------------------
// Подсветка полей
// ---------------------------------------------------------------------------

function highlight(element, status) {
  const className =
    status === "filled"
      ? "lja-field-filled"
      : status === "review"
        ? "lja-field-review"
        : "lja-field-error";
  element.classList.add(className);
  window.setTimeout(() => element.classList.remove(className), 15000);
}

// ---------------------------------------------------------------------------
// Контекст вакансии
// ---------------------------------------------------------------------------

function extractVacancyContext() {
  let jobPosting = null;
  for (const script of document.querySelectorAll("script[type='application/ld+json']")) {
    try {
      const parsed = JSON.parse(script.textContent || "null");
      const candidates = Array.isArray(parsed)
        ? parsed
        : Array.isArray(parsed?.["@graph"])
          ? parsed["@graph"]
          : [parsed];
      jobPosting = candidates.find((item) => {
        const types = Array.isArray(item?.["@type"]) ? item["@type"] : [item?.["@type"]];
        return types.includes("JobPosting");
      }) || jobPosting;
    } catch {
      // Некоторые служебные JSON-LD блоки HH могут быть неполными.
    }
  }

  const textFrom = (selectors) => {
    for (const selector of selectors) {
      const element = document.querySelector(selector);
      const text = elementText(element);
      if (text) return text;
    }
    return "";
  };
  const stripHtml = (value) => {
    const holder = document.createElement("div");
    holder.innerHTML = String(value || "");
    return elementText(holder);
  };

  const title = String(jobPosting?.title || "").trim() || textFrom([
    "[data-qa='vacancy-title']",
    "[data-qa='vacancy-view-title']",
    "h1",
  ]) || document.title || "";
  const company = String(jobPosting?.hiringOrganization?.name || "").trim() || textFrom([
    "[data-qa='vacancy-view-company-name']",
    "[data-qa='vacancy-serp__vacancy-employer']",
    "[class*='company-name']",
  ]);
  const structuredDescription = stripHtml(jobPosting?.description);
  const pageDescription = textFrom([
    "[data-qa='vacancy-description']",
    "[data-qa*='vacancy-description']",
    "[class*='vacancy-description']",
  ]);
  const body = document.body.innerText || document.body.textContent || "";
  const description = structuredDescription || pageDescription || body;
  return {
    title: title.trim().slice(0, 300),
    company: company.trim().slice(0, 300),
    description: description.trim().slice(0, 12000),
    url: window.location.href,
  };
}

// ---------------------------------------------------------------------------
// Обнаружение активного чата HH.ru
// ---------------------------------------------------------------------------

const CHAT_INPUT_SELECTORS = [
  "textarea[data-qa*='chat']",
  "textarea[data-qa*='chatik']",
  "textarea[data-qa*='message']",
  "textarea[placeholder]",
  "input[data-qa*='chat']",
  "input[data-qa*='chatik']",
  "input[data-qa*='message']",
  "input[placeholder]",
  "[contenteditable='true'][data-qa*='chat']",
  "[contenteditable='true'][data-qa*='chatik']",
  "[contenteditable='true'][data-qa*='message']",
  "[contenteditable='true']",
  "[contenteditable='plaintext-only']",
  "[role='textbox']",
  "textarea",
  "input:not([type='hidden'])",
];

const MESSAGE_SELECTOR = [
  "[data-qa*='chat-message']",
  "[data-qa*='message-text']",
  "[data-qa*='message-bubble']",
  "[class*='chat-message']",
  "[class*='message-bubble']",
  "[class*='message-text']",
].join(",");

function elementText(element) {
  return String(element?.innerText || element?.textContent || "")
    .replace(/\s+/g, " ")
    .trim();
}

function searchRoots(scope = document) {
  const roots = [scope];
  for (let index = 0; index < roots.length; index += 1) {
    const root = roots[index];
    for (const element of root.querySelectorAll("*")) {
      if (element.shadowRoot && !roots.includes(element.shadowRoot)) {
        roots.push(element.shadowRoot);
      }
    }
  }
  return roots;
}

function queryAllDeep(selector, scope = document) {
  const found = [];
  for (const root of searchRoots(scope)) {
    for (const element of root.querySelectorAll(selector)) {
      if (!found.includes(element)) found.push(element);
    }
  }
  return found;
}

function parentAcrossShadow(element) {
  if (element.parentElement) return element.parentElement;
  const root = element.getRootNode?.();
  return root && root.host instanceof Element ? root.host : null;
}

function closestAcrossShadow(element, selector) {
  let current = element;
  while (current) {
    const match = current.closest?.(selector);
    if (match) return match;
    const root = current.getRootNode?.();
    current = root && root.host instanceof Element ? root.host : null;
  }
  return null;
}

function composedContains(container, element) {
  let current = element;
  while (current) {
    if (current === container) return true;
    current = parentAcrossShadow(current);
  }
  return false;
}

function isEditableControl(element) {
  return (
    element instanceof HTMLInputElement ||
    element instanceof HTMLTextAreaElement ||
    element.isContentEditable ||
    element.getAttribute("contenteditable") === "true" ||
    element.getAttribute("contenteditable") === "plaintext-only" ||
    element.getAttribute("role") === "textbox"
  );
}

function isUsableMessageInput(element) {
  if (!isEditableControl(element)) return false;
  if (!isVisible(element) || element.disabled || element.readOnly) return false;
  if (element instanceof HTMLInputElement) {
    const type = (element.type || "text").toLowerCase();
    if (!["text", "search"].includes(type)) return false;
  }
  return true;
}

function scoreMessageInput(element, scope) {
  const identityParts = [];
  let current = element;
  for (let depth = 0; current && depth < 5; depth += 1) {
    identityParts.push(
      current.getAttribute("placeholder") || "",
      current.getAttribute("aria-placeholder") || "",
      current.getAttribute("data-placeholder") || "",
      current.getAttribute("aria-label") || "",
      current.getAttribute("data-qa") || "",
      String(current.className || ""),
    );
    current = parentAcrossShadow(current);
  }
  const identity = normalizeText(identityParts.join(" "));
  let score = 0;
  if (/сообщени|напишите сообщение|message/.test(identity)) score += 100;
  if (/chat|чат|messenger/.test(identity)) score += 45;
  if (element.matches("textarea,[contenteditable='true'],[role='textbox']")) score += 8;
  const dialog = closestAcrossShadow(element, "[role='dialog'],[aria-modal='true']");
  if (dialog) {
    score += 20;
    if (hasChatEvidence(dialog)) score += 30;
  }
  if (closestAcrossShadow(element, "[data-qa*='chat'],[data-qa*='chatik'],[data-qa*='messenger'],[data-qa*='negotiation']")) {
    score += 30;
  }
  if (scope && scope !== document && hasChatEvidence(scope)) score += 50;
  if (/поиск|найти|search|фильтр/.test(identity)) score -= 200;
  if (element instanceof HTMLInputElement && element.type === "search") score -= 100;
  return score;
}

function findMessageInput(scope = document) {
  let best = null;
  for (const selector of CHAT_INPUT_SELECTORS) {
    for (const element of queryAllDeep(selector, scope)) {
      if (!isUsableMessageInput(element)) continue;
      const score = scoreMessageInput(element, scope);
      if (!best || score > best.score) best = { element, selector, score };
    }
  }

  if (!best || best.score < 40) {
    const markerSelector = "[placeholder],[aria-placeholder],[data-placeholder],[data-qa*='placeholder'],label,span,p";
    for (const marker of queryAllDeep(markerSelector, scope)) {
      const markerIdentity = normalizeText(
        `${marker.getAttribute("placeholder") || ""} ${marker.getAttribute("aria-placeholder") || ""} ${marker.getAttribute("data-placeholder") || ""} ${marker.getAttribute("data-qa") || ""} ${elementText(marker)}`,
      );
      if (!/сообщени|напишите сообщение|message/.test(markerIdentity)) continue;
      let parent = marker;
      for (let depth = 0; parent && depth < 5; depth += 1) {
        const editable = queryAllDeep(
          "textarea,input:not([type='hidden']),[contenteditable='true'],[contenteditable='plaintext-only'],[role='textbox']",
          parent,
        ).find(isUsableMessageInput);
        if (editable) {
          const score = scoreMessageInput(editable, scope) + 120;
          if (!best || score > best.score) best = { element: editable, selector: "message-text-marker", score };
          break;
        }
        parent = parentAcrossShadow(parent);
      }
    }
  }
  return best && best.score >= 40 ? best : null;
}

function chatContainerScore(element, input) {
  if (!isVisible(element) || element === document.body || element === document.documentElement) {
    return -1;
  }
  const identity = normalizeText(
    `${element.getAttribute("data-qa") || ""} ${element.className || ""}`,
  );
  const text = normalizeText(elementText(element).slice(0, 2500));
  let score = 0;
  if (element.matches("[role='dialog'],[aria-modal='true']")) score += 100;
  if (/chat|messenger|conversation|negotiation|переписк/.test(identity)) score += 40;
  if (/(^| )чаты?( |$)/.test(text)) score += 20;
  if (input && composedContains(element, input)) score += 15;
  score += Math.min(queryAllDeep(MESSAGE_SELECTOR, element).length * 5, 30);
  return score;
}

function hasChatEvidence(element) {
  const identity = normalizeText(
    `${element.getAttribute("data-qa") || ""} ${element.className || ""}`,
  );
  const text = normalizeText(elementText(element).slice(0, 2500));
  return (
    /chat|messenger|conversation|negotiation|переписк/.test(identity) ||
    /(^| )чаты?( |$)/.test(text) ||
    queryAllDeep(MESSAGE_SELECTOR, element).length > 0
  );
}

function findChatContainer(input) {
  if (input) {
    const modal = closestAcrossShadow(input, "[role='dialog'],[aria-modal='true']");
    if (modal && isVisible(modal)) return modal;

    let best = null;
    let current = parentAcrossShadow(input);
    for (let depth = 0; current && depth < 10; depth += 1) {
      const score = chatContainerScore(current, input);
      if (!best || score > best.score) best = { element: current, score };
      current = parentAcrossShadow(current);
    }
    if (best && best.score >= 15) return best.element;
    return parentAcrossShadow(input);
  }

  let best = null;
  const selectors = [
    "[role='dialog']",
    "[aria-modal='true']",
    "[data-qa*='chat']",
    "[data-qa*='messenger']",
    "[data-qa*='negotiation']",
  ].join(",");
  for (const element of queryAllDeep(selectors)) {
    if (!hasChatEvidence(element)) continue;
    const score = chatContainerScore(element, null);
    if (!best || score > best.score) best = { element, score };
  }
  return best && best.score >= 40 ? best.element : null;
}

function isQuickReply(element) {
  return Boolean(
    closestAcrossShadow(
      element,
      "button,[role='button'],[data-qa*='quick'],[data-qa*='suggest'],[data-qa*='chip'],[class*='quick'],[class*='suggest']",
    ),
  );
}

function messageAuthor(element) {
  const identityParts = [];
  let current = element;
  for (let depth = 0; current && depth < 4; depth += 1) {
    identityParts.push(
      current.getAttribute("data-qa") || "",
      current.getAttribute("aria-label") || "",
      String(current.className || ""),
    );
    current = parentAcrossShadow(current);
  }
  const identity = normalizeText(identityParts.join(" "));
  if (/employer|incoming|opponent|interlocutor|recipient|работодатель|рекрутер/.test(identity)) {
    return "employer";
  }
  if (/candidate|applicant|outgoing|sender|own|mine|кандидат/.test(identity)) {
    return "candidate";
  }
  return "unknown";
}

function isLikelyMessage(element, input) {
  if (!isVisible(element) || isQuickReply(element)) return false;
  if (input && (element === input || element.contains(input))) return false;
  if (closestAcrossShadow(element, "aside,nav,[role='navigation']")) return false;
  const text = elementText(element);
  if (text.length < 2 || text.length > 2000) return false;
  const normalized = normalizeText(text);
  if (/^(чаты?|сообщение|отправить|назад|закрыть)$/.test(normalized)) return false;
  return true;
}

function collectChatMessages(container, input) {
  if (!container) return [];
  let candidates = queryAllDeep(MESSAGE_SELECTOR, container);

  candidates = candidates.filter((element) => {
    if (!isLikelyMessage(element, input)) return false;
    return !queryAllDeep(MESSAGE_SELECTOR, element).some(
      (child) => child !== element && isLikelyMessage(child, input),
    );
  });

  if (candidates.length === 0) {
    candidates = queryAllDeep("p,li,div,span", container).filter((element) => {
      if (!isLikelyMessage(element, input) || element.children.length > 2) return false;
      const text = elementText(element);
      return text.length >= 8 && /[а-яa-z0-9]/i.test(text);
    });
  }

  const messages = [];
  for (const element of candidates.slice(-30)) {
    const text = elementText(element).slice(0, 2000);
    if (!text) continue;
    const previous = messages[messages.length - 1];
    if (previous && previous.text === text) continue;
    messages.push({ author: messageAuthor(element), text });
  }
  return messages.slice(-10);
}

function findText(container, selectors) {
  const roots = container ? [container, document] : [document];
  for (const root of roots) {
    for (const selector of selectors) {
      const element = queryAllDeep(selector, root).find(isVisible);
      const text = elementText(element);
      if (text) return text.slice(0, 300);
    }
  }
  return "";
}

function findActiveChat() {
  let inputMatch = findMessageInput();
  let input = inputMatch?.element || null;
  let container = findChatContainer(input);
  if (!input && container) {
    inputMatch = findMessageInput(container);
    input = inputMatch?.element || null;
    if (input) container = findChatContainer(input) || container;
  }
  const messages = collectChatMessages(container, input);
  const incoming = messages.filter((message) => message.author === "employer");
  const fallback = messages.filter((message) => message.author !== "candidate");
  const lastEmployerMessage = (incoming.at(-1) || fallback.at(-1) || {}).text || "";

  return {
    container,
    input,
    messages,
    vacancyTitle: findText(container, [
      "[data-qa*='vacancy-title']",
      "[data-qa*='vacancy-name']",
      "[class*='vacancy-title']",
      "h1",
      "h2",
    ]),
    company: findText(container, [
      "[data-qa*='company-name']",
      "[data-qa*='employer-name']",
      "[class*='company-name']",
    ]),
    lastEmployerMessage,
    currentInputText: input ? readValue(input).slice(0, 2000) : "",
    inputSelector: inputMatch?.selector || "",
  };
}

function detectPageType(chat = findActiveChat()) {
  if (chat.container) return "employer-chat";
  const path = window.location.pathname || "";
  if (/\/applicant\/negotiations/i.test(path)) return "negotiations-list";
  if (/\/vacancy\/\d+/i.test(path)) return "vacancy";
  if (
    /\/applicant\/resumes\/\d+\/apply/i.test(path) ||
    /\/applicant\/vacancy_response/i.test(path) ||
    /apply/i.test(path)
  ) {
    return "application-form";
  }
  return "hh-page";
}

function diagnosticSnapshot(chat, pageType) {
  return {
    url: window.location.href,
    pageType,
    frameUrl: window.location.href,
    dialogFound: queryAllDeep("[role='dialog'],[aria-modal='true']").length > 0,
    textareaCount: queryAllDeep("textarea").length,
    inputCount: queryAllDeep("input:not([type='hidden'])").length,
    contenteditableCount: queryAllDeep("[contenteditable='true'],[contenteditable='plaintext-only']").length,
    roleTextboxCount: queryAllDeep("[role='textbox']").length,
    shadowRootsCount: searchRoots().length - 1,
    chatFound: Boolean(chat.container),
    messageInputFound: Boolean(chat.input),
    messagesCount: chat.messages.length,
    inputSelector: chat.inputSelector,
    lastEmployerMessagePreview: chat.lastEmployerMessage.slice(0, 140),
  };
}

async function logDiagnosticsIfEnabled(chat, pageType) {
  try {
    const response = await browser.runtime.sendMessage({ type: "LJA_GET_SETTINGS" });
    if (response?.ok && response.settings?.diagnostics) {
      console.info("[Lizard Job Agent] Диагностика", diagnosticSnapshot(chat, pageType));
    }
  } catch (error) {
    console.error(
      "[Lizard Job Agent] Не удалось прочитать настройку диагностики:",
      error instanceof Error ? error.message : String(error),
    );
  }
}

let detectionState = { chatFound: false, messageInputFound: false };
let observerTimer = 0;

function refreshDetectionState() {
  const chat = findActiveChat();
  detectionState = {
    chatFound: Boolean(chat.container),
    messageInputFound: Boolean(chat.input),
  };
}

const chatObserver = new MutationObserver(() => {
  window.clearTimeout(observerTimer);
  observerTimer = window.setTimeout(refreshDetectionState, 150);
});
chatObserver.observe(document.documentElement, { childList: true, subtree: true });
refreshDetectionState();

// ---------------------------------------------------------------------------
// Вставка ответов DeepSeek
// ---------------------------------------------------------------------------

function applyAiAnswer(field, answer, doNotOverwrite, result) {
  const element = field.element;
  if (answer.action === "skip") {
    result.skipped.push({
      index: field.index,
      label: field.label,
      reason: answer.needsReview ? "Требует ручной проверки" : "Пропущено",
    });
    highlight(element, "review");
    return;
  }

  if (doNotOverwrite && hasValue(element)) {
    result.skipped.push({ index: field.index, label: field.label, reason: "Поле уже заполнено" });
    highlight(element, "review");
    return;
  }

  try {
    if (answer.action === "fill") {
      if (element instanceof HTMLSelectElement) {
        const option = Array.from(element.options).find((opt) => {
          const optText = normalizeText(opt.textContent || opt.label);
          const target = normalizeText(answer.answer);
          return optText === target || optText.includes(target) || target.includes(optText);
        });
        if (option) {
          setNativeValue(element, option.value);
          result.filled.push({ index: field.index, label: field.label, value: answer.answer });
          highlight(element, "filled");
        } else {
          result.skipped.push({ index: field.index, label: field.label, reason: "Вариант не найден" });
          highlight(element, "review");
        }
      } else {
        setNativeValue(element, answer.answer);
        result.filled.push({ index: field.index, label: field.label, value: answer.answer });
        highlight(element, "filled");
      }
      return;
    }

    if (answer.action === "select") {
      if (element instanceof HTMLSelectElement) {
        const option = Array.from(element.options).find((opt) => {
          const optText = normalizeText(opt.textContent || opt.label);
          const target = normalizeText(answer.answer);
          return optText === target || optText.includes(target) || target.includes(optText);
        });
        if (option) {
          setNativeValue(element, option.value);
          result.filled.push({ index: field.index, label: field.label, value: answer.answer });
          highlight(element, "filled");
        } else {
          result.skipped.push({ index: field.index, label: field.label, reason: "Вариант не найден" });
          highlight(element, "review");
        }
      } else if (element instanceof HTMLInputElement && (element.type === "radio" || element.type === "checkbox")) {
        const name = element.getAttribute("name");
        if (name) {
          const candidates = Array.from(
            document.querySelectorAll(`input[name="${CSS.escape(name)}"]`),
          );
          const target = normalizeText(answer.answer);
          const match = candidates.find((el) => {
            const elLabel = normalizeText(describeElement(el).label);
            return elLabel === target || elLabel.includes(target) || target.includes(elLabel);
          });
          if (match) {
            setChecked(match, true);
            result.filled.push({ index: field.index, label: field.label, value: answer.answer });
            highlight(match, "filled");
            return;
          }
        }
        result.skipped.push({ index: field.index, label: field.label, reason: "Вариант не найден" });
        highlight(element, "review");
      } else {
        setNativeValue(element, answer.answer);
        result.filled.push({ index: field.index, label: field.label, value: answer.answer });
        highlight(element, "filled");
      }
      return;
    }

    if (answer.action === "check") {
      if (element instanceof HTMLInputElement && (element.type === "checkbox" || element.type === "radio")) {
        const desired = answer.answer === "true" || answer.answer === true;
        setChecked(element, desired);
        result.filled.push({ index: field.index, label: field.label, value: String(desired) });
        highlight(element, "filled");
      } else {
        result.skipped.push({ index: field.index, label: field.label, reason: "Поле не является checkbox/radio" });
        highlight(element, "review");
      }
      return;
    }

    result.skipped.push({ index: field.index, label: field.label, reason: "Неизвестное действие" });
    highlight(element, "review");
  } catch (error) {
    result.failed.push({
      index: field.index,
      label: field.label,
      reason: error instanceof Error ? error.message : "Ошибка вставки",
    });
    highlight(element, "error");
  }
}

// ---------------------------------------------------------------------------
// Основной процесс заполнения
// ---------------------------------------------------------------------------

function emptyResult() {
  return { filled: [], skipped: [], failed: [] };
}

const COVER_LETTER_PATTERN =
  /сопровод|cover\s*letter|письмо работодателю|комментарий к отклику|почему вы хотите работать|расскажите о себе/i;

const COVER_LETTER_COMPOSER_PATTERN =
  /введите.{0,80}(сопровод|текст письма)|сопроводительное письмо|cover\s*letter|письмо работодателю/i;

function coverLetterContextScore(element) {
  let current = parentAcrossShadow(element);
  let best = 0;
  for (let depth = 0; current && depth < 5; depth += 1) {
    const text = normalizeText(elementText(current).slice(0, 1800));
    if (COVER_LETTER_COMPOSER_PATTERN.test(text) && !/^добавить сопроводительное письмо$/.test(text)) {
      const explicitPrompt = /введите.{0,80}(сопровод|текст письма)/.test(text);
      best = Math.max(best, (explicitPrompt ? 220 : 130) - depth * 15);
    }
    current = parentAcrossShadow(current);
  }
  return best;
}

function findCoverLetterInput() {
  const chatInput = findActiveChat().input;
  let best = null;
  for (const element of queryAllDeep(FIELD_SELECTOR)) {
    if (!isVisible(element) || element.disabled || element.readOnly) continue;
    if (
      !(element instanceof HTMLInputElement) &&
      !(element instanceof HTMLTextAreaElement) &&
      !element.isContentEditable &&
      element.getAttribute("contenteditable") !== "true" &&
      element.getAttribute("role") !== "textbox"
    ) {
      continue;
    }
    const description = describeElement(element);
    const contextScore = coverLetterContextScore(element);
    if (element === chatInput && contextScore < 100) continue;
    const identity = [
      description.label,
      element.getAttribute("data-qa") || "",
      element.getAttribute("name") || "",
      element.getAttribute("placeholder") || "",
      String(element.className || ""),
    ].join(" ");
    let score = COVER_LETTER_PATTERN.test(identity) ? 120 : 0;
    if (/vacancy-response-popup-form-letter-input|cover-letter-ai|cover-letter|form-letter/i.test(identity)) score += 240;
    if (/letter|cover|сопровод/i.test(identity)) score += 80;
    score += contextScore;
    if (element instanceof HTMLTextAreaElement || element.isContentEditable) score += 15;
    if (!best || score > best.score) best = { element, score, label: description.label };
  }
  return best && best.score >= 100 ? best : null;
}

async function prepareApplication(overwriteFilled) {
  const match = findCoverLetterInput();
  if (!match) {
    return {
      ok: true,
      pageType: detectPageType(),
      applicationFieldFound: false,
      message: "Откройте форму отклика с полем сопроводительного письма.",
    };
  }
  if (!overwriteFilled && hasValue(match.element)) {
    return {
      ok: true,
      pageType: "application-form",
      applicationFieldFound: true,
      inserted: false,
      message: "Сопроводительное письмо уже содержит текст. Черновик не изменён.",
    };
  }

  const vacancy = extractVacancyContext();
  const response = await browser.runtime.sendMessage({
    type: "LJA_GENERATE_COVER_LETTER",
    vacancy,
  });
  if (!response?.ok || typeof response.coverLetter !== "string" || !response.coverLetter.trim()) {
    throw new Error(response?.error || "DeepSeek не вернул сопроводительное письмо.");
  }

  const fresh = findCoverLetterInput();
  if (!fresh) throw new Error("Поле сопроводительного письма исчезло со страницы.");
  if (!overwriteFilled && hasValue(fresh.element)) {
    return {
      ok: true,
      pageType: "application-form",
      applicationFieldFound: true,
      inserted: false,
      message: "В поле появился пользовательский текст. Черновик не изменён.",
    };
  }
  setNativeValue(fresh.element, response.coverLetter.trim());
  if (readValue(fresh.element) !== response.coverLetter.trim()) {
    throw new Error("HH.ru не принял текст сопроводительного письма.");
  }
  highlight(fresh.element, "filled");
  return {
    ok: true,
    pageType: "application-form",
    applicationFieldFound: true,
    inserted: true,
    message: "Сопроводительное письмо вставлено. Проверьте его и отправьте отклик вручную.",
  };
}

async function fillPage(doNotOverwrite, vacancyOverride = null, elementsOverride = null) {
  const result = emptyResult();

  // 1. Получаем resume.json из background.
  const resumeResponse = await browser.runtime.sendMessage({ type: "LJA_GET_RESUME" });
  if (!resumeResponse || !resumeResponse.ok) {
    throw new Error(
      (resumeResponse && resumeResponse.error) || "Не удалось загрузить resume.json.",
    );
  }
  const resume = resumeResponse.resume;

  // 2. Сканируем и классифицируем поля.
  const elements = elementsOverride || collectFields();
  if (elements.length === 0) {
    throw new Error("На странице не найдено доступных полей формы.");
  }

  const fields = elements.map((element, index) => classifyField(element, index));

  // 3. Заполняем локальные поля.
  const openFields = [];
  for (const field of fields) {
    if (field.category === "deterministic") {
      fillLocalField(field, deterministicValue(resume, field.key), doNotOverwrite, result);
    } else if (field.category === "canonical") {
      fillLocalField(field, canonicalValue(resume, field.key), doNotOverwrite, result);
    } else if (field.category === "manual") {
      result.skipped.push({
        index: field.index,
        label: field.label,
        reason: "Требует ручной проверки",
      });
      highlight(field.element, "review");
    } else {
      openFields.push(field);
    }
  }

  // 4. Отправляем открытые вопросы в DeepSeek.
  if (openFields.length > 0) {
    const vacancy = vacancyOverride || extractVacancyContext();
    const questions = openFields.map((field) => ({
      fieldIndex: field.index,
      label: field.label,
      options: field.options || [],
    }));

    const answersResponse = await browser.runtime.sendMessage({
      type: "LJA_GENERATE_ANSWERS",
      vacancy,
      questions,
    });

    if (!answersResponse || !answersResponse.ok) {
      throw new Error(
        (answersResponse && answersResponse.error) || "Не удалось получить ответы DeepSeek.",
      );
    }

    const answersByIndex = new Map(
      answersResponse.answers.map((a) => [a.fieldIndex, a]),
    );

    for (const field of openFields) {
      const answer = answersByIndex.get(field.index);
      if (answer) {
        applyAiAnswer(field, answer, doNotOverwrite, result);
      } else {
        result.skipped.push({
          index: field.index,
          label: field.label,
          reason: "DeepSeek не дал ответ",
        });
        highlight(field.element, "review");
      }
    }
  }

  return result;
}

function hhQuestionnaireFields() {
  return queryAllDeep("textarea[name^='task_'],input[name^='task_']").filter((element) =>
    isVisible(element) && !element.disabled && !element.readOnly,
  );
}

async function hhQuestionnaireVacancyContext() {
  const fallback = extractVacancyContext();
  const vacancyId = new URL(window.location.href).searchParams.get("vacancyId");
  if (!/^\d+$/.test(vacancyId || "")) return fallback;
  try {
    const response = await fetch(`https://hh.ru/vacancy/${vacancyId}`, {
      credentials: "include",
      headers: { Accept: "text/html" },
    });
    if (!response.ok) return fallback;
    const html = await response.text();
    const page = new DOMParser().parseFromString(html, "text/html");
    const text = (selector) => elementText(page.querySelector(selector));
    return {
      title: text("[data-qa='vacancy-title']") || text("h1") || fallback.title,
      company: text("[data-qa='vacancy-view-company-name']") || fallback.company,
      description:
        text("[data-qa='vacancy-description']") ||
        text("[data-qa*='vacancy-description']") ||
        fallback.description,
      url: `https://hh.ru/vacancy/${vacancyId}`,
      source: "hh-vacancy-response",
    };
  } catch {
    return fallback;
  }
}

// ---------------------------------------------------------------------------
// Подготовка ответа в переписке
// ---------------------------------------------------------------------------

async function prepareChatReply(overwriteFilled) {
  const chat = findActiveChat();
  const pageType = chat.container ? "employer-chat" : "hh-page";
  await logDiagnosticsIfEnabled(chat, pageType);

  if (!chat.container) {
    return {
      ok: true,
      pageType,
      chatFound: false,
      messageInputFound: false,
      lastEmployerMessage: "",
      messagesCount: 0,
      message: "Откройте чат с работодателем на HH.ru.",
    };
  }

  if (!chat.input) {
    return {
      ok: true,
      pageType,
      chatFound: true,
      messageInputFound: false,
      lastEmployerMessage: chat.lastEmployerMessage,
      messagesCount: chat.messages.length,
      message: "Чат найден, но поле сообщения не обнаружено.",
    };
  }

  if (!overwriteFilled && hasValue(chat.input)) {
    return {
      ok: true,
      pageType,
      chatFound: true,
      messageInputFound: true,
      lastEmployerMessage: chat.lastEmployerMessage,
      messagesCount: chat.messages.length,
      message: "Поле сообщения уже содержит текст. Черновик не изменён.",
    };
  }

  if (!chat.lastEmployerMessage) {
    return {
      ok: true,
      pageType,
      chatFound: true,
      messageInputFound: true,
      lastEmployerMessage: "",
      messagesCount: chat.messages.length,
      message: "Не удалось прочитать последний вопрос работодателя.",
    };
  }

  const replyResponse = await browser.runtime.sendMessage({
    type: "LJA_GENERATE_CHAT_REPLY",
    chat: {
      vacancyTitle: chat.vacancyTitle,
      company: chat.company,
      messages: chat.messages,
      lastEmployerMessage: chat.lastEmployerMessage,
      currentInputText: chat.currentInputText,
    },
  });
  if (!replyResponse || !replyResponse.ok) {
    throw new Error(
      (replyResponse && replyResponse.error) || "Не удалось получить ответ DeepSeek.",
    );
  }

  const reply = replyResponse.reply;
  if (!reply || !reply.trim()) {
    throw new Error("DeepSeek вернул пустой ответ.");
  }

  const freshChat = findActiveChat();
  if (!freshChat.input) {
    throw new Error("Чат изменился во время подготовки ответа: поле сообщения больше не найдено.");
  }
  if (!overwriteFilled && hasValue(freshChat.input)) {
    return {
      ok: true,
      pageType: "employer-chat",
      chatFound: true,
      messageInputFound: true,
      lastEmployerMessage: freshChat.lastEmployerMessage,
      messagesCount: freshChat.messages.length,
      message: "В поле появился пользовательский текст. Черновик не изменён.",
    };
  }

  setNativeValue(freshChat.input, reply.trim());
  if (readValue(freshChat.input) !== reply.trim()) {
    throw new Error("HH.ru не принял новое значение поля сообщения.");
  }
  highlight(freshChat.input, "filled");

  return {
    ok: true,
    pageType: "employer-chat",
    chatFound: true,
    messageInputFound: true,
    lastEmployerMessage: freshChat.lastEmployerMessage,
    messagesCount: freshChat.messages.length,
    inserted: true,
    message: "Ответ вставлен в чат. Проверьте текст и отправьте его вручную.",
  };
}

// ---------------------------------------------------------------------------
// Стили подсветки
// ---------------------------------------------------------------------------

const style = document.createElement("style");
style.textContent = `
  .lja-field-filled { outline: 3px solid #74d300 !important; outline-offset: 2px !important; }
  .lja-field-review { outline: 3px solid #f4b942 !important; outline-offset: 2px !important; }
  .lja-field-error { outline: 3px solid #ee5166 !important; outline-offset: 2px !important; }
`;
(document.head || document.documentElement).appendChild(style);

// ---------------------------------------------------------------------------
// Обработка сообщений
// ---------------------------------------------------------------------------

async function handleContentMessage(message) {
  try {
    if (!message || typeof message !== "object" || typeof message.type !== "string") {
      return { ok: false, error: "Получена некорректная команда content script." };
    }

    if (message.type === "LJA_FILL") {
      const overwriteFilled =
        typeof message.overwriteFilled === "boolean"
          ? message.overwriteFilled
          : message.doNotOverwrite === false;
      const result = await fillPage(!overwriteFilled);
      return { ok: true, result };
    }

    if (message.type === "LJA_I10_FILL_GOOGLE_FORM") {
      const hostname = window.location.hostname.toLowerCase();
      const isGoogleForm = hostname === "docs.google.com" && window.location.pathname.startsWith("/forms/");
      if (!isGoogleForm) {
        return { ok: false, error: "Откройте Google Forms перед заполнением." };
      }
      const vacancyText = String(message.vacancyText || "").trim();
      if (vacancyText.length < 30) {
        return { ok: false, error: "Вставьте текст вакансии в панель агента." };
      }
      const overwriteFilled = message.overwriteFilled === true;
      const result = await fillPage(!overwriteFilled, {
        title: "Вакансия из ручного контекста",
        company: "",
        description: vacancyText.slice(0, 16000),
        url: window.location.href,
        source: "manual-google-form-context",
      });
      return {
        ok: true,
        pageType: "google-form",
        googleFormFound: true,
        result,
        message: `Google-форма заполнена как черновик: ${result.filled.length} полей. Проверьте ответы перед отправкой.`,
      };
    }

    if (message.type === "LJA_I10_FILL_HH_QUESTIONNAIRE") {
      if (!/\/applicant\/vacancy_response/i.test(window.location.pathname)) {
        return { ok: false, error: "Откройте страницу с вопросами работодателя на HH.ru." };
      }
      const fields = hhQuestionnaireFields();
      if (!fields.length) {
        return { ok: false, error: "Поля вопросов работодателя не найдены." };
      }
      const vacancy = await hhQuestionnaireVacancyContext();
      const result = await fillPage(message.overwriteFilled !== true, vacancy, fields);
      return {
        ok: true,
        pageType: "hh-questionnaire",
        hhQuestionnaireFound: true,
        result,
        message: `Ответы работодателю подготовлены: ${result.filled.length} полей. Проверьте их перед продолжением.`,
      };
    }

    if (message.type === "LJA_PREPARE_REPLY" || message.type === "LJA_I10_PREPARE_REPLY") {
      const overwriteFilled =
        typeof message.overwriteFilled === "boolean"
          ? message.overwriteFilled
          : message.doNotOverwrite === false;
      return await prepareChatReply(overwriteFilled);
    }

    if (message.type === "LJA_PREPARE_APPLICATION" || message.type === "LJA_I10_PREPARE_APPLICATION") {
      const overwriteFilled =
        typeof message.overwriteFilled === "boolean"
          ? message.overwriteFilled
          : message.doNotOverwrite === false;
      return await prepareApplication(overwriteFilled);
    }

    if (message.type === "LJA_DESCRIBE" || message.type === "LJA_I10_DESCRIBE") {
      const chat = findActiveChat();
      const detectedType = detectPageType(chat);
      const pageType = chat.container ? "employer-chat" : detectedType;
      const applicationField = findCoverLetterInput();
      await logDiagnosticsIfEnabled(chat, pageType);
      const isGoogleForm = window.location.hostname === "docs.google.com" && window.location.pathname.startsWith("/forms/");
      const questionnaireFields = hhQuestionnaireFields();
      return {
        ok: true,
        frameUrl: window.location.href,
        pageType,
        chatFound: Boolean(chat.container),
        messageInputFound: Boolean(chat.input),
        applicationFieldFound: Boolean(applicationField),
        googleFormFound: isGoogleForm,
        hhQuestionnaireFound: questionnaireFields.length > 0,
        questionnaireFieldsCount: questionnaireFields.length,
        lastEmployerMessage: chat.lastEmployerMessage,
        messagesCount: chat.messages.length,
        fieldsCount: isGoogleForm ? collectFields().length : chat.container ? 0 : collectFields().length,
        title: document.title,
      };
    }

    return { ok: false, error: `Неизвестная команда content script: ${message.type}` };
  } catch (error) {
    const text = error instanceof Error ? error.message : String(error);
    console.error("[Lizard Job Agent]", text);
    return { ok: false, error: text };
  }
}

browser.runtime.onMessage.addListener(async (message) => {
  const response = await handleContentMessage(message);
  return { ...response, buildId: BUILD_ID };
});
})();
