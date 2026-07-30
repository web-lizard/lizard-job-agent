import type { JobProfile, WorkExperience } from "../profile/profile.types";
import type { FillResult, PageDetectionResult } from "../shared/messages";

export interface SiteAdapter {
  id: string;
  matches(url: URL): boolean;
  detectPage(): Promise<PageDetectionResult>;
  fillProfile(profile: JobProfile, doNotOverwrite: boolean): Promise<FillResult>;
  fillExperience(
    experiences: WorkExperience[],
    doNotOverwrite: boolean,
  ): Promise<FillResult>;
}

