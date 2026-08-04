import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createFillPlan,
  parseResume,
  testConnection,
} from "../src/ai/deepseek-client";
import type { AiSettings, PageDescription } from "../src/ai/ai.types";
import { jobProfileSchema } from "../src/profile/profile.schema";
import exampleProfile from "../src/profile/profile.example.json";

const settings: AiSettings = {
  provider: "deepseek",
  apiUrl: "https://api.deepseek.com",
  model: "deepseek-v4-flash",
  rememberKey: false,
  apiKey: "test-api-key-placeholder",
};

function apiResponse(content: string): Response {
  return new Response(
    JSON.stringify({
      model: "deepseek-v4-flash",
      choices: [{ message: { content } }],
    }),
    { status: 200, headers: { "Content-Type": "application/json" } },
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("DeepSeek client", () => {
  it("parses and validates a strict JobProfile JSON response", async () => {
    const profile = jobProfileSchema.parse(exampleProfile);
    const fetchMock = vi.fn(
      async (_input: RequestInfo | URL, _init?: RequestInit) =>
        apiResponse(JSON.stringify(profile)),
    );
    vi.stubGlobal("fetch", fetchMock);

    const parsed = await parseResume(settings, "Текст резюме", "parse-1");

    expect(parsed.personal.firstName).toBe("Алексей");
    const request = JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body));
    expect(request.response_format).toEqual({ type: "json_object" });
    expect(request.messages[0].content.toLowerCase()).toContain("json");
    expect(request.model).toBe("deepseek-v4-flash");
  });

  it("turns HTTP 401 into a readable connection result", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("{}", { status: 401 })),
    );

    const result = await testConnection(settings, "test-401");

    expect(result.success).toBe(false);
    expect(result.message).toContain("API-ключ");
    expect(result.message).not.toContain(settings.apiKey);
  });

  it("filters invented values and unknown field ids from FillPlan", async () => {
    const profile = jobProfileSchema.parse(exampleProfile);
    const page: PageDescription = {
      title: "Редактирование опыта",
      url: "https://hh.ru/applicant/resumes",
      fields: [
        {
          fieldId: "field-1",
          tagName: "input",
          type: "text",
          label: "Компания",
          placeholder: "",
          name: "company",
          ariaLabel: "",
          currentValue: "",
          disabled: false,
          required: true,
        },
      ],
    };
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        apiResponse(
          JSON.stringify({
            actions: [
              {
                fieldId: "field-1",
                action: "setText",
                value: "Example Company",
                sourcePath: "experience[0].company",
                confidence: 0.99,
                explanation: "Компания",
              },
              {
                fieldId: "field-1",
                action: "setText",
                value: "Придуманная компания",
                sourcePath: "experience[0].company",
                confidence: 1,
                explanation: "Инъекция",
              },
              {
                fieldId: "missing",
                action: "setText",
                value: "Example Company",
                sourcePath: "experience[0].company",
                confidence: 1,
                explanation: "Неизвестное поле",
              },
            ],
            warnings: [],
          }),
        ),
      ),
    );

    const plan = await createFillPlan(settings, profile, page, "plan-1");

    expect(plan.actions).toHaveLength(1);
    expect(plan.actions[0]?.value).toBe("Example Company");
  });
});
