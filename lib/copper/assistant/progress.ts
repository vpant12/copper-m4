// What Ask Copper is doing, step by step, as it streams in: Gemini's thinking
// summaries, each tool call (with what went in and what came out), and the
// reply. The panel draws this as it changes.

/** Who is talking: Copper, or the Refund agent Copper hands refunds to (Module 4). */
export type Agent = "copper" | "refund";

export const AGENT_NAMES: Record<Agent, string> = {
  copper: "Copper",
  refund: "Refund agent",
};

export type ThinkingStep = { type: "thinking"; text: string; agent?: Agent };

export type ToolStep = {
  type: "tool";
  id: string;
  name: string;
  /** "calling" until the tool's result comes back. */
  state: "calling" | "done" | "error";
  input?: unknown;
  output?: unknown;
  agent?: Agent;
};

/** Copper passed the conversation to the Refund agent. */
export type HandoffStep = { type: "handoff"; from: Agent; to: Agent };

export type Step = ThinkingStep | ToolStep | HandoffStep;

export type Progress = {
  steps: Step[];
  reply: string;
  status: "working" | "done" | "error";
  /** Who wrote the reply. Copper unless it handed off. */
  agent?: Agent;
};

/** Every tool call in an answer, in order. */
export function toolCallsOf(progress: Progress) {
  return progress.steps
    .filter((step): step is ToolStep => step.type === "tool")
    .map(({ name, input, output }) => ({ name, input, output }));
}

/**
 * The tools Copper can use, and what each one does in plain English. The chat
 * panel lists these, so it lives here (and not in tools.ts, which reads the
 * database and can't be imported by a client component).
 */
export const TOOL_LABELS: Record<string, string> = {
  get_products: "Listing the products",
  get_prices: "Looking up prices",
  calculate_cost: "Working out the cost",
  check_availability: "Checking stock",
  search_docs: "Searching the documents",
};

/** Copper's handoff tool, offered only where refunds are handled (the Support page). */
export const HANDOFF_TOOL = "transfer_to_refund_agent";

/** The Refund agent's own tools (Module 4). */
export const REFUND_TOOL_LABELS: Record<string, string> = {
  list_orders: "Looking up the orders",
  issue_refund: "Asking the app for a refund",
};

/** Every label the tool cards can show. */
export const ALL_TOOL_LABELS: Record<string, string> = {
  ...TOOL_LABELS,
  [HANDOFF_TOOL]: "Handing off to the Refund agent",
  ...REFUND_TOOL_LABELS,
};
