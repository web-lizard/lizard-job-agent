import { fillPlanSchema } from "../ai/ai.types";
import type { ExecutePlanResult, FillAction, FillPlan } from "../ai/ai.types";
import {
  emptyFillResult,
  type FilledField,
  type FillResult,
} from "../shared/messages";
import { normalizeText } from "../shared/normalize-text";
import { setChecked, setNativeValue } from "./event-dispatcher";
import { highlight, readValue } from "./field-filler";
import {
  getScannedElement,
  isAddExperienceElement,
  scanPage,
} from "./page-scanner";

const sourcePathPattern =
  /^(personal|target|summary|skills|experience\[\d+\]|education\[\d+\]|languages\[\d+\]|links)(\.|\[|$)/;

function item(
  action: FillAction,
  status: "filled" | "skipped" | "failed",
  reason?: string,
): FilledField {
  return {
    field: action.fieldId,
    label: action.explanation || action.sourcePath,
    value:
      typeof action.value === "string"
        ? `${action.value.slice(0, 77)}${action.value.length > 77 ? "…" : ""}`
        : String(action.value),
    sourcePath: action.sourcePath,
    reason,
    status,
  } as FilledField;
}

function waitForMutation(timeout = 2_500): Promise<boolean> {
  const before = scanPage().fields.length;
  return new Promise((resolve) => {
    const observer = new MutationObserver(() => {
      if (scanPage().fields.length > before) {
        observer.disconnect();
        resolve(true);
      }
    });
    observer.observe(document.body, { childList: true, subtree: true });
    window.setTimeout(() => {
      observer.disconnect();
      resolve(scanPage().fields.length > before);
    }, timeout);
  });
}

async function waitForOptions(timeout = 1_800): Promise<HTMLElement[]> {
  const find = (): HTMLElement[] =>
    Array.from(
      document.querySelectorAll<HTMLElement>(
        "[role='option'], [role='listbox'] li, [data-qa*='suggest'] [data-qa]",
      ),
    ).filter((element) => {
      const style = getComputedStyle(element);
      return style.display !== "none" && style.visibility !== "hidden";
    });
  const existing = find();
  if (existing.length) return existing;
  return new Promise((resolve) => {
    const observer = new MutationObserver(() => {
      const options = find();
      if (options.length) {
        observer.disconnect();
        resolve(options);
      }
    });
    observer.observe(document.body, { childList: true, subtree: true });
    window.setTimeout(() => {
      observer.disconnect();
      resolve(find());
    }, timeout);
  });
}

async function selectOption(
  element: HTMLElement,
  value: string,
): Promise<boolean> {
  const target = normalizeText(value);
  if (element instanceof HTMLSelectElement) {
    const option = Array.from(element.options).find((candidate) => {
      const text = normalizeText(candidate.textContent ?? candidate.label);
      return text === target || text.includes(target) || target.includes(text);
    });
    if (!option) return false;
    setNativeValue(element, option.value);
    return element.value === option.value;
  }

  element.click();
  if (element instanceof HTMLInputElement) setNativeValue(element, value);
  const options = await waitForOptions();
  const option = options.find((candidate) => {
    const text = normalizeText(candidate.innerText || candidate.textContent || "");
    return text === target || text.includes(target) || target.includes(text);
  });
  if (!option) return false;
  option.click();
  await new Promise((resolve) => window.setTimeout(resolve, 100));
  return normalizeText(readValue(element)).includes(target);
}

async function executeAction(
  action: FillAction,
  doNotOverwrite: boolean,
  result: FillResult,
): Promise<boolean> {
  if (action.confidence < 0.65) {
    result.skipped.push(item(action, "skipped", "Уверенность ИИ ниже 0.65"));
    return false;
  }
  if (!sourcePathPattern.test(action.sourcePath)) {
    result.failed.push(item(action, "failed", "Недопустимый sourcePath"));
    return false;
  }
  const element = getScannedElement(action.fieldId);
  if (!element || !document.contains(element)) {
    result.skipped.push(item(action, "skipped", "Поле больше не существует"));
    return false;
  }

  try {
    if (action.action === "clickAddExperience") {
      if (!isAddExperienceElement(element)) {
        result.failed.push(
          item(action, "failed", "Действие разрешено только для кнопки добавления опыта"),
        );
        return false;
      }
      const mutation = waitForMutation();
      element.click();
      const changed = await mutation;
      if (!changed) {
        result.skipped.push(
          item(action, "skipped", "После нажатия новый блок не появился"),
        );
        return false;
      }
      result.filled.push(item(action, "filled"));
      return true;
    }

    if (action.value === null) {
      result.skipped.push(item(action, "skipped", "ИИ не нашёл значение"));
      return false;
    }

    if (action.action === "setCheckbox") {
      if (
        !(element instanceof HTMLInputElement) ||
        element.type !== "checkbox" ||
        typeof action.value !== "boolean"
      ) {
        result.failed.push(item(action, "failed", "Ожидался checkbox и boolean"));
        return false;
      }
      setChecked(element, action.value);
    } else if (action.action === "setText") {
      if (doNotOverwrite && readValue(element)) {
        result.skipped.push(item(action, "skipped", "Поле уже заполнено"));
        highlight(element, "skipped");
        return false;
      }
      if (typeof action.value !== "string") {
        result.failed.push(item(action, "failed", "Ожидалось текстовое значение"));
        return false;
      }
      if (
        !(
          element instanceof HTMLInputElement ||
          element instanceof HTMLTextAreaElement ||
          element.isContentEditable
        )
      ) {
        result.failed.push(item(action, "failed", "Элемент не поддерживает текст"));
        return false;
      }
      setNativeValue(element, action.value);
    } else if (action.action === "selectOption") {
      if (doNotOverwrite && readValue(element)) {
        result.skipped.push(item(action, "skipped", "Поле уже заполнено"));
        highlight(element, "skipped");
        return false;
      }
      if (
        typeof action.value !== "string" ||
        !(await selectOption(element, action.value))
      ) {
        result.skipped.push(
          item(action, "skipped", "Подходящий вариант не найден или не применился"),
        );
        highlight(element, "skipped");
        return false;
      }
    }

    result.filled.push(item(action, "filled"));
    highlight(element, "filled");
    return false;
  } catch (error) {
    result.failed.push(
      item(
        action,
        "failed",
        error instanceof Error ? error.message : "Ошибка локального исполнителя",
      ),
    );
    highlight(element, "failed");
    return false;
  }
}

export async function executeFillPlan(
  rawPlan: FillPlan,
  doNotOverwrite: boolean,
): Promise<ExecutePlanResult> {
  const validated = fillPlanSchema.safeParse(rawPlan);
  if (!validated.success) {
    return {
      clickedAddExperience: false,
      fillResult: {
        success: false,
        filled: [],
        skipped: [],
        failed: [
          {
            field: "fillPlan",
            label: "План ИИ",
            reason: "План не прошёл локальную проверку",
          },
        ],
        warnings: [],
      },
    };
  }

  const result = emptyFillResult();
  result.warnings.push(...validated.data.warnings);
  let clickedAddExperience = false;
  const firstAdd = validated.data.actions.find(
    (action) => action.action === "clickAddExperience",
  );
  const actions = [
    ...validated.data.actions.filter(
      (action) => action.action !== "clickAddExperience",
    ),
    ...(firstAdd ? [firstAdd] : []),
  ];
  for (const action of actions) {
    if (
      await executeAction(action, doNotOverwrite, result)
    ) {
      clickedAddExperience = true;
    }
  }
  result.success = result.failed.length === 0;
  return { fillResult: result, clickedAddExperience };
}
