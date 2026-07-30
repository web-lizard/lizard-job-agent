import type { JobProfile } from "../profile/profile.types";

export const MESSAGE_TYPES = {
  DETECT_PAGE: "LJA_DETECT_PAGE",
  FILL_PAGE: "LJA_FILL_PAGE",
} as const;

export interface PageDetectionResult {
  supported: boolean;
  adapterId: string;
  fieldCount: number;
  pageTitle: string;
}

export type FillStatus = "filled" | "skipped" | "failed";

export interface FilledField {
  field: string;
  label: string;
  value?: string;
  reason?: string;
  status?: FillStatus;
}

export interface FillResult {
  success: boolean;
  filled: FilledField[];
  skipped: FilledField[];
  failed: FilledField[];
  warnings: string[];
}

export interface FillPageMessage {
  type: typeof MESSAGE_TYPES.FILL_PAGE;
  profile: JobProfile;
  doNotOverwrite: boolean;
}

export interface DetectPageMessage {
  type: typeof MESSAGE_TYPES.DETECT_PAGE;
}

export type ContentMessage = FillPageMessage | DetectPageMessage;

export const emptyFillResult = (): FillResult => ({
  success: true,
  filled: [],
  skipped: [],
  failed: [],
  warnings: [],
});

export function mergeFillResults(...results: FillResult[]): FillResult {
  return {
    success: results.every((item) => item.failed.length === 0),
    filled: results.flatMap((item) => item.filled),
    skipped: results.flatMap((item) => item.skipped),
    failed: results.flatMap((item) => item.failed),
    warnings: results.flatMap((item) => item.warnings),
  };
}

