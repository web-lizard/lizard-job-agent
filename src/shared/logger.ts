type SafeDetails = Record<string, string | number | boolean | undefined>;

const redact = (details: SafeDetails): SafeDetails =>
  Object.fromEntries(
    Object.entries(details).filter(
      ([key]) => !["email", "phone", "description", "summary", "value"].includes(key),
    ),
  );

export const logger = {
  info(event: string, details: SafeDetails = {}): void {
    console.info("[Lizard Job Agent]", event, redact(details));
  },
  warn(event: string, details: SafeDetails = {}): void {
    console.warn("[Lizard Job Agent]", event, redact(details));
  },
  error(event: string, details: SafeDetails = {}): void {
    console.error("[Lizard Job Agent]", event, redact(details));
  },
};

