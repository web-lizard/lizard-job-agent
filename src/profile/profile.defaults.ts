import type { ExtensionPreferences, JobProfile } from "./profile.types";

export const emptyProfile = (): JobProfile => ({
  personal: {
    firstName: "",
    lastName: "",
    middleName: "",
    birthDate: "",
    email: "",
    phone: "",
    city: "",
    citizenship: "",
    relocation: false,
    remoteWork: true,
    businessTrips: false,
  },
  target: {
    position: "",
    salary: undefined,
    currency: "RUB",
    employmentTypes: [],
    workFormats: [],
  },
  summary: "",
  skills: [],
  experience: [],
  education: [],
  languages: [],
  links: {},
});

export const defaultPreferences: ExtensionPreferences = {
  doNotOverwrite: true,
};

