export interface JobProfile {
  personal: {
    firstName: string;
    lastName: string;
    middleName?: string;
    birthDate?: string;
    email: string;
    phone: string;
    city: string;
    citizenship?: string;
    relocation?: boolean;
    remoteWork?: boolean;
    businessTrips?: boolean;
  };
  target: {
    position: string;
    salary?: number;
    currency?: string;
    employmentTypes: string[];
    workFormats: string[];
  };
  summary: string;
  skills: string[];
  experience: WorkExperience[];
  education: Education[];
  languages: Language[];
  links: {
    github?: string;
    portfolio?: string;
    website?: string;
    telegram?: string;
    linkedin?: string;
    hh?: string;
  };
}

export interface WorkExperience {
  company: string;
  position: string;
  city?: string;
  website?: string;
  industry?: string;
  startMonth: number;
  startYear: number;
  endMonth?: number;
  endYear?: number;
  currentlyWorking: boolean;
  description: string;
}

export interface Education {
  institution: string;
  faculty?: string;
  specialization?: string;
  degree?: string;
  startYear?: number;
  graduationYear?: number;
}

export interface Language {
  name: string;
  level: string;
}

export interface ExtensionPreferences {
  doNotOverwrite: boolean;
}

