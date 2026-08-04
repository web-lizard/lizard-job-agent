import type { JobProfile } from "../profile/profile.types";
import type {
  AiSettings,
  ConnectionResult,
  ExecutePlanResult,
  FillPlan,
  PageDescription,
  SafeAiStatus,
} from "../ai/ai.types";

export const MESSAGE_TYPES = {
  DETECT_PAGE: "LJA_DETECT_PAGE",
  FILL_PAGE: "LJA_FILL_PAGE",
  DESCRIBE_PAGE: "LJA_DESCRIBE_PAGE",
  EXECUTE_FILL_PLAN: "LJA_EXECUTE_FILL_PLAN",
  AI_GET_SETTINGS: "LJA_AI_GET_SETTINGS",
  AI_SAVE_SETTINGS: "LJA_AI_SAVE_SETTINGS",
  AI_DELETE_KEY: "LJA_AI_DELETE_KEY",
  AI_GET_STATUS: "LJA_AI_GET_STATUS",
  AI_TEST_CONNECTION: "LJA_AI_TEST_CONNECTION",
  AI_PARSE_RESUME: "LJA_AI_PARSE_RESUME",
  AI_CREATE_FILL_PLAN: "LJA_AI_CREATE_FILL_PLAN",
  AI_CANCEL_REQUEST: "LJA_AI_CANCEL_REQUEST",
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
  sourcePath?: string;
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

export interface DescribePageMessage {
  type: typeof MESSAGE_TYPES.DESCRIBE_PAGE;
}

export interface ExecuteFillPlanMessage {
  type: typeof MESSAGE_TYPES.EXECUTE_FILL_PLAN;
  plan: FillPlan;
  doNotOverwrite: boolean;
}

export type ContentMessage =
  | FillPageMessage
  | DetectPageMessage
  | DescribePageMessage
  | ExecuteFillPlanMessage;

export type BackgroundMessage =
  | { type: typeof MESSAGE_TYPES.AI_GET_SETTINGS }
  | { type: typeof MESSAGE_TYPES.AI_SAVE_SETTINGS; settings: AiSettings }
  | { type: typeof MESSAGE_TYPES.AI_DELETE_KEY }
  | { type: typeof MESSAGE_TYPES.AI_GET_STATUS }
  | {
      type: typeof MESSAGE_TYPES.AI_TEST_CONNECTION;
      settings: AiSettings;
      requestId: string;
    }
  | {
      type: typeof MESSAGE_TYPES.AI_PARSE_RESUME;
      resumeText: string;
      requestId: string;
    }
  | {
      type: typeof MESSAGE_TYPES.AI_CREATE_FILL_PLAN;
      profile: JobProfile;
      page: PageDescription;
      requestId: string;
    }
  | { type: typeof MESSAGE_TYPES.AI_CANCEL_REQUEST; requestId: string };

export type AiResponse<T> =
  | { ok: true; data: T }
  | { ok: false; error: string; code?: string };

export type AiSettingsResponse = AiResponse<AiSettings>;
export type AiStatusResponse = AiResponse<SafeAiStatus>;
export type ConnectionResponse = AiResponse<ConnectionResult>;
export type ParsedResumeResponse = AiResponse<JobProfile>;
export type FillPlanResponse = AiResponse<FillPlan>;
export type ExecutePlanResponse = ExecutePlanResult;

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
