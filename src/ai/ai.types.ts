import { z } from "zod";

export interface AiSettings {
  provider: "deepseek";
  apiUrl: string;
  model: string;
  rememberKey: boolean;
  apiKey: string;
}

export interface SafeAiStatus {
  configured: boolean;
  connected: boolean;
  lastConnectedAt: string;
  provider: "deepseek";
  apiUrl: string;
  model: string;
  rememberKey: boolean;
}

export interface ConnectionResult {
  success: boolean;
  message: string;
  model?: string;
}

export interface DetectedField {
  fieldId: string;
  tagName: string;
  type: string;
  label: string;
  placeholder: string;
  name: string;
  ariaLabel: string;
  currentValue: string;
  options?: string[];
  disabled: boolean;
  required: boolean;
}

export interface PageDescription {
  title: string;
  url: string;
  fields: DetectedField[];
}

export const fillActionSchema = z
  .object({
    fieldId: z.string().min(1),
    action: z.enum([
      "setText",
      "setCheckbox",
      "selectOption",
      "clickAddExperience",
    ]),
    value: z.union([z.string(), z.boolean(), z.null()]),
    sourcePath: z.string(),
    confidence: z.number().min(0).max(1),
    explanation: z.string(),
  })
  .strict();

export const fillPlanSchema = z
  .object({
    actions: z.array(fillActionSchema).max(200),
    warnings: z.array(z.string()),
  })
  .strict();

export type FillAction = z.infer<typeof fillActionSchema>;
export type FillPlan = z.infer<typeof fillPlanSchema>;

export interface ExecutePlanResult {
  fillResult: import("../shared/messages").FillResult;
  clickedAddExperience: boolean;
}

export class DeepSeekClientError extends Error {
  constructor(
    message: string,
    public readonly code:
      | "missing_key"
      | "invalid_settings"
      | "unauthorized"
      | "insufficient_balance"
      | "rate_limited"
      | "network"
      | "timeout"
      | "cancelled"
      | "empty_response"
      | "invalid_json"
      | "invalid_response"
      | "server",
    public readonly status?: number,
  ) {
    super(message);
    this.name = "DeepSeekClientError";
  }
}
