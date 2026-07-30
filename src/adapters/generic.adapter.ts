import { detectForm } from "../content/form-detector";
import { fillMatchedField } from "../content/field-filler";
import {
  findAllFields,
  findBestField,
  type FieldKey,
} from "../content/field-matcher";
import type { JobProfile, WorkExperience } from "../profile/profile.types";
import {
  emptyFillResult,
  mergeFillResults,
  type FillResult,
  type PageDetectionResult,
} from "../shared/messages";
import { normalizeText } from "../shared/normalize-text";
import type { SiteAdapter } from "./site-adapter";

const forbiddenButtonText =
  /сохран|отправ|отклик|опубликов|submit|apply|publish|respond/i;
const addExperienceText =
  /добавить (место работы|опыт|работу)|add (experience|employment)/i;

function findExperienceRoots(): ParentNode[] {
  const companyFields = findAllFields("company");
  const roots: ParentNode[] = [];
  for (const match of companyFields) {
    let node = match.element.parentElement;
    let best: HTMLElement | undefined;
    for (let depth = 0; node && depth < 7; depth += 1) {
      const companies = findAllFields("company", node);
      const hasPosition = Boolean(findBestField("experiencePosition", node));
      if (companies.length === 1 && hasPosition) best = node;
      if (companies.length > 1) break;
      node = node.parentElement;
    }
    roots.push(best ?? match.element.parentElement ?? document);
  }
  return [...new Set(roots)];
}

async function waitForMoreExperience(previousCount: number): Promise<boolean> {
  if (findExperienceRoots().length > previousCount) return true;
  return new Promise((resolve) => {
    const observer = new MutationObserver(() => {
      if (findExperienceRoots().length > previousCount) {
        observer.disconnect();
        resolve(true);
      }
    });
    observer.observe(document.body, { childList: true, subtree: true });
    window.setTimeout(() => {
      observer.disconnect();
      resolve(findExperienceRoots().length > previousCount);
    }, 2_000);
  });
}

async function addExperienceBlock(): Promise<boolean> {
  const buttons = Array.from(
    document.querySelectorAll<HTMLElement>(
      "button:not([type='submit']), [role='button'], a",
    ),
  );
  const button = buttons.find((candidate) => {
    const text = normalizeText(candidate.innerText || candidate.textContent || "");
    return addExperienceText.test(text) && !forbiddenButtonText.test(text);
  });
  if (!button) return false;
  const previousCount = findExperienceRoots().length;
  button.click();
  return waitForMoreExperience(previousCount);
}

const profileFields: Array<[FieldKey, (profile: JobProfile) => string | number | undefined]> = [
  ["firstName", (profile) => profile.personal.firstName],
  ["lastName", (profile) => profile.personal.lastName],
  ["middleName", (profile) => profile.personal.middleName],
  ["birthDate", (profile) => profile.personal.birthDate],
  ["email", (profile) => profile.personal.email],
  ["phone", (profile) => profile.personal.phone],
  ["city", (profile) => profile.personal.city],
  ["citizenship", (profile) => profile.personal.citizenship],
  ["position", (profile) => profile.target.position],
  ["salary", (profile) => profile.target.salary],
  ["summary", (profile) => profile.summary],
  ["skills", (profile) => profile.skills.join(", ")],
  ["github", (profile) => profile.links.github],
  ["portfolio", (profile) => profile.links.portfolio ?? profile.links.website],
];

const experienceFields: Array<
  [FieldKey, (experience: WorkExperience) => string | number | boolean | undefined]
> = [
  ["company", (experience) => experience.company],
  ["experiencePosition", (experience) => experience.position],
  ["experienceCity", (experience) => experience.city],
  ["companyWebsite", (experience) => experience.website],
  ["industry", (experience) => experience.industry],
  ["startMonth", (experience) => experience.startMonth],
  ["startYear", (experience) => experience.startYear],
  ["currentlyWorking", (experience) => experience.currentlyWorking],
  ["endMonth", (experience) => experience.currentlyWorking ? undefined : experience.endMonth],
  ["endYear", (experience) => experience.currentlyWorking ? undefined : experience.endYear],
  ["description", (experience) => experience.description],
];

export const genericAdapter: SiteAdapter = {
  id: "generic",
  matches: () => true,

  async detectPage(): Promise<PageDetectionResult> {
    return detectForm(this.id);
  },

  async fillProfile(profile, doNotOverwrite): Promise<FillResult> {
    const used = new Set<Element>();
    const results: FillResult[] = [];
    for (const [key, getter] of profileFields) {
      results.push(
        await fillMatchedField(key, getter(profile), { doNotOverwrite, used }),
      );
    }
    return mergeFillResults(...results);
  },

  async fillExperience(experiences, doNotOverwrite): Promise<FillResult> {
    if (experiences.length === 0) return emptyFillResult();
    const results: FillResult[] = [];

    for (let index = 0; index < experiences.length; index += 1) {
      let roots = findExperienceRoots();
      if (roots.length <= index) {
        const created = await addExperienceBlock();
        roots = findExperienceRoots();
        if (!created && roots.length <= index) {
          results.push({
            success: true,
            filled: [],
            skipped: [{
              field: `experience.${index}`,
              label: `Опыт работы ${index + 1}`,
              reason: "Блок не найден; расширение не нажимает кнопки сохранения формы",
              status: "skipped",
            }],
            failed: [],
            warnings: ["Добавьте блок опыта вручную и повторите заполнение"],
          });
          continue;
        }
      }

      const root = roots[index] ?? document;
      const experience = experiences[index];
      if (!experience) continue;
      const used = new Set<Element>();
      for (const [key, getter] of experienceFields) {
        results.push(
          await fillMatchedField(key, getter(experience), {
            root,
            doNotOverwrite,
            used,
          }),
        );
      }
    }
    return mergeFillResults(...results);
  },
};

