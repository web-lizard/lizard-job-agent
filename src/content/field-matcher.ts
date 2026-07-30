import { normalizeText } from "../shared/normalize-text";

export type FieldKey =
  | "firstName"
  | "lastName"
  | "middleName"
  | "birthDate"
  | "email"
  | "phone"
  | "city"
  | "citizenship"
  | "position"
  | "salary"
  | "summary"
  | "skills"
  | "github"
  | "portfolio"
  | "company"
  | "experiencePosition"
  | "experienceCity"
  | "companyWebsite"
  | "industry"
  | "startMonth"
  | "startYear"
  | "endMonth"
  | "endYear"
  | "currentlyWorking"
  | "description";

export type FillableElement =
  | HTMLInputElement
  | HTMLTextAreaElement
  | HTMLSelectElement
  | HTMLElement;

export interface FieldMatch {
  key: FieldKey;
  element: FillableElement;
  score: number;
  descriptor: string;
  label: string;
}

export const fieldLabels: Record<FieldKey, string> = {
  firstName: "Имя",
  lastName: "Фамилия",
  middleName: "Отчество",
  birthDate: "Дата рождения",
  email: "Email",
  phone: "Телефон",
  city: "Город",
  citizenship: "Гражданство",
  position: "Желаемая должность",
  salary: "Желаемый доход",
  summary: "Обо мне",
  skills: "Навыки",
  github: "GitHub",
  portfolio: "Портфолио",
  company: "Компания",
  experiencePosition: "Должность",
  experienceCity: "Город работы",
  companyWebsite: "Сайт компании",
  industry: "Сфера деятельности компании",
  startMonth: "Месяц начала",
  startYear: "Год начала",
  endMonth: "Месяц окончания",
  endYear: "Год окончания",
  currentlyWorking: "Работаю сейчас",
  description: "Обязанности и достижения",
};

export const fieldAliases: Record<FieldKey, string[]> = {
  firstName: ["имя", "first name", "firstname", "given name"],
  lastName: ["фамилия", "last name", "lastname", "surname", "family name"],
  middleName: ["отчество", "middle name", "middlename"],
  birthDate: ["дата рождения", "birth date", "birthday"],
  email: ["электронная почта", "email", "e-mail"],
  phone: ["телефон", "phone", "mobile"],
  city: ["город проживания", "место жительства", "residence city", "home location"],
  citizenship: ["гражданство", "citizenship"],
  position: [
    "желаемая должность",
    "название резюме",
    "специализация",
    "позиция",
    "job title",
    "desired position",
  ],
  salary: ["желаемый доход", "зарплата", "salary", "income"],
  summary: ["обо мне", "о себе", "профессиональный профиль", "summary", "about me"],
  skills: ["ключевые навыки", "навыки", "skills"],
  github: ["github", "гитхаб"],
  portfolio: ["портфолио", "portfolio", "личный сайт"],
  company: [
    "компания",
    "название компании",
    "работодатель",
    "organization",
    "company",
  ],
  experiencePosition: [
    "должность или профессия",
    "должность",
    "профессия",
    "position",
    "job title",
  ],
  experienceCity: [
    "город или регион",
    "город работы",
    "регион",
    "location",
  ],
  companyWebsite: [
    "сайт компании",
    "адрес сайта",
    "website",
    "company website",
    "company url",
  ],
  industry: [
    "сфера деятельности компании",
    "сфера деятельности",
    "отрасль",
    "industry",
  ],
  startMonth: [
    "месяц начала работы",
    "начало работы месяц",
    "месяц начала",
    "start month",
  ],
  startYear: [
    "год начала работы",
    "начало работы год",
    "год начала",
    "start year",
  ],
  endMonth: [
    "месяц окончания работы",
    "окончание работы месяц",
    "месяц окончания",
    "end month",
  ],
  endYear: [
    "год окончания работы",
    "окончание работы год",
    "год окончания",
    "end year",
  ],
  currentlyWorking: [
    "работаю сейчас",
    "по настоящее время",
    "текущее место работы",
    "currently working",
    "current job",
  ],
  description: [
    "обязанности и достижения",
    "обязанности",
    "достижения",
    "чем занимались",
    "описание деятельности",
    "description",
    "responsibilities",
  ],
};

const selectors = [
  "input:not([type='hidden']):not([disabled])",
  "textarea:not([disabled])",
  "select:not([disabled])",
  "[contenteditable='true']",
  "[role='textbox']",
  "[role='combobox']",
].join(",");

export function getFillableElements(root: ParentNode = document): FillableElement[] {
  return Array.from(root.querySelectorAll<FillableElement>(selectors)).filter(
    (element) => isVisible(element),
  );
}

export function isVisible(element: Element): boolean {
  const htmlElement = element as HTMLElement;
  const style = window.getComputedStyle(htmlElement);
  const rect = htmlElement.getBoundingClientRect();
  return (
    style.display !== "none" &&
    style.visibility !== "hidden" &&
    style.opacity !== "0" &&
    (rect.width > 0 || rect.height > 0)
  );
}

function labelText(element: Element): string {
  const parts: string[] = [];
  const id = element.getAttribute("id");
  if (id) {
    try {
      const label = document.querySelector(`label[for="${CSS.escape(id)}"]`);
      if (label?.textContent) parts.push(label.textContent);
    } catch {
      // An invalid, page-controlled id must not break matching.
    }
  }

  const wrappingLabel = element.closest("label");
  if (wrappingLabel?.textContent) parts.push(wrappingLabel.textContent);

  const labelledBy = element.getAttribute("aria-labelledby");
  if (labelledBy) {
    for (const labelledId of labelledBy.split(/\s+/)) {
      const labelled = document.getElementById(labelledId);
      if (labelled?.textContent) parts.push(labelled.textContent);
    }
  }
  return normalizeText(parts.join(" "));
}

export function describeElement(element: Element): {
  descriptor: string;
  label: string;
} {
  const label = labelText(element);
  const attributes = [
    element.getAttribute("placeholder"),
    element.getAttribute("name"),
    element.getAttribute("id"),
    element.getAttribute("aria-label"),
    element.getAttribute("autocomplete"),
    element.getAttribute("data-qa"),
    element.getAttribute("data-testid"),
  ]
    .filter(Boolean)
    .join(" ");

  let nearby = "";
  let parent = element.parentElement;
  for (let depth = 0; parent && depth < 3; depth += 1) {
    const text = normalizeText(parent.innerText ?? parent.textContent ?? "");
    if (text.length > 0 && text.length <= 180) {
      nearby = text;
      break;
    }
    parent = parent.parentElement;
  }

  return {
    label,
    descriptor: normalizeText(`${label} ${attributes} ${nearby}`),
  };
}

function scoreAlias(descriptor: string, label: string, alias: string): number {
  const normalizedAlias = normalizeText(alias);
  if (!normalizedAlias) return 0;
  if (label === normalizedAlias) return 1;
  if (descriptor === normalizedAlias) return 0.97;
  if (label.includes(normalizedAlias)) return 0.92;

  const tokens = normalizedAlias.split(" ");
  const hits = tokens.filter((token) => descriptor.includes(token)).length;
  if (descriptor.includes(normalizedAlias)) {
    return normalizedAlias.length <= 4 ? 0.76 : 0.9;
  }
  if (tokens.length >= 2 && hits === tokens.length) return 0.78;
  if (tokens.length >= 3 && hits / tokens.length >= 0.66) return 0.69;
  return 0;
}

export function matchElement(
  element: FillableElement,
  key: FieldKey,
): FieldMatch {
  const { descriptor, label } = describeElement(element);
  const score = Math.max(
    0,
    ...fieldAliases[key].map((alias) => scoreAlias(descriptor, label, alias)),
  );
  return { key, element, score, descriptor, label: fieldLabels[key] };
}

export function findBestField(
  key: FieldKey,
  root: ParentNode = document,
  threshold = 0.72,
  excluded = new Set<Element>(),
): FieldMatch | undefined {
  return getFillableElements(root)
    .filter((element) => !excluded.has(element))
    .map((element) => matchElement(element, key))
    .filter((match) => match.score >= threshold)
    .sort((a, b) => b.score - a.score)[0];
}

export function findAllFields(
  key: FieldKey,
  root: ParentNode = document,
  threshold = 0.72,
): FieldMatch[] {
  return getFillableElements(root)
    .map((element) => matchElement(element, key))
    .filter((match) => match.score >= threshold)
    .sort((a, b) => b.score - a.score);
}
