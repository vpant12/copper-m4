// The course's approved models. Calls go straight to Google with a Google AI
// Studio key, which is free and needs no credit card.
export const MODELS = [
  {
    id: "google/gemini-2.5-flash",
    label: "Gemini 2.5 Flash (fast, shows its thinking)",
    // Google's own name for it, used when calling Google.
    googleId: "gemini-2.5-flash",
  },
  {
    id: "google/gemini-3-flash",
    label: "Gemini 3 Flash (newer, thinks out loud less often)",
    googleId: "gemini-3-flash-preview",
  },
  {
    // Added in Module 4: its own free-tier quota is much larger than Gemini 3
    // Flash's (20 requests a day), and one refund takes about four requests.
    id: "google/gemini-3.1-flash-lite",
    label: "Gemini 3.1 Flash-Lite (fastest, largest free quota)",
    googleId: "gemini-3.1-flash-lite",
  },
] as const;

export type ModelId = (typeof MODELS)[number]["id"];

/**
 * The model used when a call doesn't name one. 2.5 Flash writes a summary of
 * its thinking for every question, which Ask Copper shows students.
 */
export const DEFAULT_MODEL: ModelId = "google/gemini-2.5-flash";

/**
 * Turns text into a list of numbers so similar meanings can be found (Module 3).
 * It isn't a chat model, so it isn't in MODELS.
 */
export const EMBEDDING_MODEL = "google/gemini-embedding-2";
/** Shorter than the 3072 default: a smaller passages.json, almost as accurate. */
export const EMBEDDING_DIMENSIONS = 768;

/** AI_MODEL if it names an approved model, otherwise the default. */
export function defaultModel(): ModelId {
  const id = process.env.AI_MODEL;
  return MODELS.find((m) => m.id === id)?.id ?? DEFAULT_MODEL;
}
