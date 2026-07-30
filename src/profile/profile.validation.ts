import type { JobProfile } from "./profile.types";

export interface ProfileValidation {
  valid: boolean;
  errors: string[];
  completion: number;
}

const nonEmpty = (value: unknown): boolean =>
  typeof value === "string" && value.trim().length > 0;

export function validateProfile(value: unknown): ProfileValidation {
  const errors: string[] = [];
  if (!value || typeof value !== "object") {
    return { valid: false, errors: ["JSON должен содержать объект профиля"], completion: 0 };
  }

  const profile = value as Partial<JobProfile>;
  if (!profile.personal || typeof profile.personal !== "object") {
    errors.push("Отсутствует раздел personal");
  }
  if (!profile.target || typeof profile.target !== "object") {
    errors.push("Отсутствует раздел target");
  }
  if (!Array.isArray(profile.experience)) errors.push("experience должен быть массивом");
  if (!Array.isArray(profile.education)) errors.push("education должен быть массивом");
  if (!Array.isArray(profile.skills)) errors.push("skills должен быть массивом");
  if (!Array.isArray(profile.languages)) errors.push("languages должен быть массивом");

  const p = profile.personal;
  const target = profile.target;
  const checks = [
    nonEmpty(p?.firstName),
    nonEmpty(p?.lastName),
    nonEmpty(p?.email),
    nonEmpty(p?.phone),
    nonEmpty(p?.city),
    nonEmpty(target?.position),
    nonEmpty(profile.summary),
    (profile.skills?.length ?? 0) > 0,
    (profile.experience?.length ?? 0) > 0,
    (profile.education?.length ?? 0) > 0,
    (profile.languages?.length ?? 0) > 0,
    Boolean(profile.links && Object.values(profile.links).some(nonEmpty)),
  ];

  return {
    valid: errors.length === 0,
    errors,
    completion: Math.round((checks.filter(Boolean).length / checks.length) * 100),
  };
}

export function isJobProfile(value: unknown): value is JobProfile {
  return validateProfile(value).valid;
}

