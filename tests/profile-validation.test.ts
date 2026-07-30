import { describe, expect, it } from "vitest";
import { emptyProfile } from "../src/profile/profile.defaults";
import { validateProfile } from "../src/profile/profile.validation";
import exampleProfile from "../src/profile/profile.example.json";

describe("profile validation", () => {
  it("accepts the bundled anonymized example", () => {
    const result = validateProfile(exampleProfile);
    expect(result.valid).toBe(true);
    expect(result.completion).toBe(100);
  });

  it("reports incomplete empty profile without rejecting its structure", () => {
    const result = validateProfile(emptyProfile());
    expect(result.valid).toBe(true);
    expect(result.completion).toBe(0);
  });

  it("rejects non-profile JSON", () => {
    const result = validateProfile({ hello: "world" });
    expect(result.valid).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
  });
});

