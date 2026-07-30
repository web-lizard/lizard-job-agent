import { normalizeText } from "../shared/normalize-text";
import type { FilledField, FillResult } from "../shared/messages";
import { emptyFillResult } from "../shared/messages";
import {
  fieldLabels,
  findBestField,
  type FieldKey,
  type FillableElement,
} from "./field-matcher";
import { setChecked, setNativeValue } from "./event-dispatcher";

const HIGHLIGHT_CLASSES = {
  filled: "lja-field-filled",
  skipped: "lja-field-review",
  failed: "lja-field-error",
} as const;

export interface FillContext {
  root?: ParentNode;
  doNotOverwrite: boolean;
  used?: Set<Element>;
}

export function readValue(element: FillableElement): string {
  if (
    element instanceof HTMLInputElement ||
    element instanceof HTMLTextAreaElement ||
    element instanceof HTMLSelectElement
  ) {
    return element.value.trim();
  }
  return (element.textContent ?? "").trim();
}

function safeValue(value: string): string {
  if (value.length <= 80) return value;
  return `${value.slice(0, 77)}…`;
}

export function highlight(
  element: Element,
  status: keyof typeof HIGHLIGHT_CLASSES,
): void {
  const className = HIGHLIGHT_CLASSES[status];
  element.classList.add(className);
  window.setTimeout(() => element.classList.remove(className), 10_000);
}

function reportField(
  result: FillResult,
  status: "filled" | "skipped" | "failed",
  key: FieldKey,
  value?: string,
  reason?: string,
): void {
  const item: FilledField = {
    field: key,
    label: fieldLabels[key],
    value: value ? safeValue(value) : undefined,
    reason,
    status,
  };
  result[status].push(item);
}

async function chooseNativeSelect(
  element: HTMLSelectElement,
  value: string,
): Promise<boolean> {
  const target = normalizeText(value);
  const option = Array.from(element.options).find((candidate) => {
    const optionText = normalizeText(candidate.textContent ?? candidate.label);
    return optionText === target || optionText.includes(target) || target.includes(optionText);
  });
  if (!option) return false;
  setNativeValue(element, option.value);
  return element.value === option.value;
}

function waitForOptions(timeout = 1_500): Promise<HTMLElement[]> {
  const getOptions = (): HTMLElement[] =>
    Array.from(
      document.querySelectorAll<HTMLElement>(
        "[role='option'], [role='listbox'] li, [data-qa*='suggest'] [data-qa], .suggest-item",
      ),
    ).filter((element) => {
      const style = getComputedStyle(element);
      return style.display !== "none" && style.visibility !== "hidden";
    });

  const existing = getOptions();
  if (existing.length > 0) return Promise.resolve(existing);
  return new Promise((resolve) => {
    const observer = new MutationObserver(() => {
      const options = getOptions();
      if (options.length > 0) {
        observer.disconnect();
        resolve(options);
      }
    });
    observer.observe(document.body, { childList: true, subtree: true });
    window.setTimeout(() => {
      observer.disconnect();
      resolve(getOptions());
    }, timeout);
  });
}

async function chooseCustomOption(
  element: FillableElement,
  value: string,
): Promise<boolean> {
  element.click();
  const options = await waitForOptions();
  const target = normalizeText(value);
  const option = options.find((candidate) => {
    const text = normalizeText(candidate.innerText || candidate.textContent || "");
    return text === target || text.includes(target) || target.includes(text);
  });
  if (!option) return false;
  option.click();
  await new Promise((resolve) => window.setTimeout(resolve, 80));
  return normalizeText(readValue(element)).includes(target) || Boolean(option);
}

export async function fillMatchedField(
  key: FieldKey,
  value: string | number | boolean | undefined,
  context: FillContext,
): Promise<FillResult> {
  const result = emptyFillResult();
  if (value === undefined || value === "") {
    reportField(result, "skipped", key, undefined, "В локальном профиле нет значения");
    return result;
  }

  const match = findBestField(
    key,
    context.root ?? document,
    0.72,
    context.used ?? new Set(),
  );
  if (!match) {
    reportField(result, "skipped", key, String(value), "Поле не найдено с достаточной уверенностью");
    return result;
  }
  context.used?.add(match.element);

  try {
    if (typeof value === "boolean") {
      if (!(match.element instanceof HTMLInputElement) || match.element.type !== "checkbox") {
        highlight(match.element, "skipped");
        reportField(result, "skipped", key, String(value), "Найденный элемент не является checkbox");
        return result;
      }
      setChecked(match.element, value);
    } else {
      const textValue = String(value);
      if (context.doNotOverwrite && readValue(match.element)) {
        highlight(match.element, "skipped");
        reportField(result, "skipped", key, textValue, "Поле уже заполнено");
        return result;
      }

      let changed = false;
      if (match.element instanceof HTMLSelectElement) {
        changed = await chooseNativeSelect(match.element, textValue);
      } else if (match.element.getAttribute("role") === "combobox") {
        if (match.element instanceof HTMLInputElement) setNativeValue(match.element, textValue);
        changed = await chooseCustomOption(match.element, textValue);
      } else {
        setNativeValue(match.element, textValue);
        changed = readValue(match.element).length > 0;
      }

      if (!changed) {
        highlight(match.element, "skipped");
        reportField(result, "skipped", key, textValue, "Значение требует ручной проверки");
        return result;
      }
    }

    highlight(match.element, "filled");
    reportField(result, "filled", key, String(value));
  } catch (error) {
    highlight(match.element, "failed");
    reportField(
      result,
      "failed",
      key,
      String(value),
      error instanceof Error ? error.message : "Неизвестная ошибка",
    );
    result.success = false;
  }
  return result;
}

