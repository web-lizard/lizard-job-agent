import { z } from "zod";

const nullableBoolean = z.boolean().nullable();
const nullableYear = z.number().int().min(1900).max(2200).nullable();
const nullableMonth = z.number().int().min(1).max(12).nullable();

export const workExperienceSchema = z
  .object({
    company: z.string(),
    position: z.string(),
    city: z.string(),
    website: z.string(),
    industry: z.string(),
    startMonth: z.number().int().min(1).max(12),
    startYear: z.number().int().min(1900).max(2200),
    endMonth: nullableMonth,
    endYear: nullableYear,
    currentlyWorking: z.boolean(),
    description: z.string(),
  })
  .strict();

export const educationSchema = z
  .object({
    institution: z.string(),
    faculty: z.string(),
    specialization: z.string(),
    degree: z.string(),
    startYear: nullableYear,
    graduationYear: nullableYear,
  })
  .strict();

export const languageSchema = z
  .object({
    name: z.string(),
    level: z.string(),
  })
  .strict();

export const jobProfileSchema = z
  .object({
    personal: z
      .object({
        firstName: z.string(),
        lastName: z.string(),
        middleName: z.string(),
        birthDate: z.string().nullable(),
        email: z.string(),
        phone: z.string(),
        city: z.string(),
        citizenship: z.string(),
        relocation: nullableBoolean,
        businessTrips: nullableBoolean,
        remoteWork: nullableBoolean,
      })
      .strict(),
    target: z
      .object({
        position: z.string(),
        salary: z.number().nonnegative().nullable(),
        currency: z.string(),
        employmentTypes: z.array(z.string()),
        workFormats: z.array(z.string()),
      })
      .strict(),
    summary: z.string(),
    skills: z.array(z.string()),
    experience: z.array(workExperienceSchema),
    education: z.array(educationSchema),
    languages: z.array(languageSchema),
    links: z
      .object({
        github: z.string(),
        portfolio: z.string(),
        website: z.string(),
        telegram: z.string(),
        linkedin: z.string(),
        hh: z.string(),
      })
      .strict(),
  })
  .strict();

