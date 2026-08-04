import type { ExtensionPreferences, JobProfile } from "./profile.types";

export const emptyProfile = (): JobProfile => ({
  personal: {
    firstName: "",
    lastName: "",
    middleName: "",
    birthDate: null,
    email: "",
    phone: "",
    city: "",
    citizenship: "",
    relocation: null,
    remoteWork: null,
    businessTrips: null,
  },
  target: {
    position: "",
    salary: null,
    currency: "RUB",
    employmentTypes: [],
    workFormats: [],
  },
  summary: "",
  skills: [],
  experience: [],
  education: [],
  languages: [],
  links: {
    github: "",
    portfolio: "",
    website: "",
    telegram: "",
    linkedin: "",
    hh: "",
  },
});

export const defaultPreferences: ExtensionPreferences = {
  doNotOverwrite: true,
};
