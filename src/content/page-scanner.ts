import type { DetectedField, PageDescription } from "../ai/ai.types";
import { normalizeText } from "../shared/normalize-text";
import { describeElement, isVisible } from "./field-matcher";

const ids = new WeakMap<Element, string>();
const elements = new Map<string, HTMLElement>();
let sequence = 0;

const addExperiencePattern =
  /добавить (место работы|опыт|работу)|add (experience|employment)/i;
const forbiddenButtonPattern =
  /сохран|отправ|отклик|опубликов|submit|apply|publish|respond/i;

function idFor(element: Element): string {
  const existing = ids.get(element);
  if (existing) return existing;
  sequence += 1;
  const id = `field-${sequence}`;
  ids.set(element, id);
  return id;
}

function actualLabel(element: HTMLElement): string {
  const parts: string[] = [];
  const id = element.id;
  if (id) {
    try {
      const label = document.querySelector(`label[for="${CSS.escape(id)}"]`);
      if (label?.textContent) parts.push(label.textContent);
    } catch {
      // Ignore page-controlled invalid identifiers.
    }
  }
  const wrapping = element.closest("label");
  if (wrapping?.textContent) parts.push(wrapping.textContent);
  const ariaLabel = element.getAttribute("aria-label");
  if (ariaLabel) parts.push(ariaLabel);
  const described = describeElement(element);
  return parts.join(" ").trim().slice(0, 300) || described.label;
}

function valueOf(element: HTMLElement): string {
  if (
    element instanceof HTMLInputElement ||
    element instanceof HTMLTextAreaElement ||
    element instanceof HTMLSelectElement
  ) {
    if (element instanceof HTMLInputElement && element.type === "checkbox") {
      return String(element.checked);
    }
    return element.value.slice(0, 2_000);
  }
  if (element.isContentEditable) {
    return (element.textContent ?? "").trim().slice(0, 2_000);
  }
  return "";
}

function typeOf(element: HTMLElement): string {
  if (element instanceof HTMLInputElement) return element.type || "text";
  if (element instanceof HTMLTextAreaElement) return "textarea";
  if (element instanceof HTMLSelectElement) return "select";
  return element.getAttribute("role") || element.tagName.toLowerCase();
}

function optionsOf(element: HTMLElement): string[] | undefined {
  if (element instanceof HTMLSelectElement) {
    return Array.from(element.options)
      .map((option) => (option.textContent ?? option.label).trim())
      .filter(Boolean)
      .slice(0, 200);
  }
  return undefined;
}

function isSafeAddButton(element: HTMLElement): boolean {
  if (
    !(
      element instanceof HTMLButtonElement ||
      element instanceof HTMLAnchorElement ||
      element.getAttribute("role") === "button"
    )
  ) {
    return false;
  }
  const text = normalizeText(
    element.innerText || element.textContent || element.getAttribute("aria-label") || "",
  );
  return addExperiencePattern.test(text) && !forbiddenButtonPattern.test(text);
}

function candidates(): HTMLElement[] {
  const fields = Array.from(
    document.querySelectorAll<HTMLElement>(
      [
        "input:not([type='hidden']):not([type='password'])",
        "textarea",
        "select",
        "[contenteditable='true']",
        "[role='textbox']",
        "[role='combobox']",
      ].join(","),
    ),
  ).filter(isVisible);

  const addButtons = Array.from(
    document.querySelectorAll<HTMLElement>(
      "button:not([type='submit']), a, [role='button']",
    ),
  ).filter((element) => isVisible(element) && isSafeAddButton(element));

  return [...new Set([...fields, ...addButtons])].slice(0, 300);
}

export function scanPage(): PageDescription {
  elements.clear();
  const fields: DetectedField[] = candidates().map((element) => {
    const fieldId = idFor(element);
    elements.set(fieldId, element);
    const label = actualLabel(element);
    return {
      fieldId,
      tagName: element.tagName.toLowerCase(),
      type: typeOf(element),
      label: isSafeAddButton(element)
        ? (element.innerText || element.textContent || label).trim().slice(0, 300)
        : label,
      placeholder: element.getAttribute("placeholder")?.slice(0, 300) ?? "",
      name: element.getAttribute("name")?.slice(0, 300) ?? "",
      ariaLabel: element.getAttribute("aria-label")?.slice(0, 300) ?? "",
      currentValue: valueOf(element),
      options: optionsOf(element),
      disabled:
        "disabled" in element
          ? Boolean((element as HTMLInputElement).disabled)
          : element.getAttribute("aria-disabled") === "true",
      required:
        "required" in element
          ? Boolean((element as HTMLInputElement).required)
          : element.getAttribute("aria-required") === "true",
    };
  });

  const url = new URL(window.location.href);
  return {
    title: document.title.slice(0, 300),
    url: `${url.origin}${url.pathname}`,
    fields,
  };
}

export function getScannedElement(fieldId: string): HTMLElement | undefined {
  return elements.get(fieldId);
}

export function isAddExperienceElement(element: HTMLElement): boolean {
  return isSafeAddButton(element);
}

