import { detectForm } from "../content/form-detector";
import type { JobProfile, WorkExperience } from "../profile/profile.types";
import {
  mergeFillResults,
  type FillResult,
  type PageDetectionResult,
} from "../shared/messages";
import { genericAdapter } from "./generic.adapter";
import type { SiteAdapter } from "./site-adapter";

export const hhAdapter: SiteAdapter = {
  id: "hh.ru",
  matches(url: URL): boolean {
    return url.hostname === "hh.ru" || url.hostname.endsWith(".hh.ru");
  },
  async detectPage(): Promise<PageDetectionResult> {
    return detectForm(this.id);
  },
  async fillProfile(
    profile: JobProfile,
    doNotOverwrite: boolean,
  ): Promise<FillResult> {
    return genericAdapter.fillProfile(profile, doNotOverwrite);
  },
  async fillExperience(
    experiences: WorkExperience[],
    doNotOverwrite: boolean,
  ): Promise<FillResult> {
    return genericAdapter.fillExperience(experiences, doNotOverwrite);
  },
};

export async function fillHhPage(
  profile: JobProfile,
  doNotOverwrite: boolean,
): Promise<FillResult> {
  return mergeFillResults(
    await hhAdapter.fillProfile(profile, doNotOverwrite),
    await hhAdapter.fillExperience(profile.experience, doNotOverwrite),
  );
}

