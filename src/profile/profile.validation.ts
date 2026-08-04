import type { JobProfile } from "./profile.types";
import { jobProfileSchema } from "./profile.schema";

export interface ProfileValidation {
  valid: boolean;
  errors: string[];
  completion: number;
}

const nonEmpty = (value: unknown): boolean =>
  typeof value === "string" && value.trim().length > 0;

export function validateProfile(value: unknown): ProfileValidation {
  const parsed = jobProfileSchema.safeParse(value);
  const errors = parsed.success
    ? []
    : parsed.error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`);
  if (!parsed.success) {
    return { valid: false, errors, completion: 0 };
  }
  const profile = parsed.data;

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
  return jobProfileSchema.safeParse(value).success;
}

export function parseJobProfile(value: unknown): JobProfile {
  return jobProfileSchema.parse(value);
}

