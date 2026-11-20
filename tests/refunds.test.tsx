// Module 4: refunds. The rule in code (at or under the limit refunds now, over
// it waits), Copper handing refund requests to the Refund agent, and the
// Refund Console's Approve and Reject.
import {
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/react";
import { convertArrayToReadableStream, MockLanguageModelV4 } from "ai/test";
import { afterEach, describe, expect, it, vi } from "vitest";
import { finalValue } from "@/lib/ai/live";
import { refundsReducer, START } from "@/components/copper/refunds-context";
import {
  decideRefund,
  decisionMessage,
  STARTING_ORDERS,
} from "@/lib/copper/refunds";

const state = { limitUsd: 50, orders: STARTING_ORDERS };

describe("the refund rule (code, not AI)", () => {
  it("refunds an order at or under the limit straight away", () => {
    expect(decideRefund(state, "1001", "changed my mind")).toMatchObject({
      status: "refunded",
      orderId: "1001",
      amountUsd: 7.99,
    });
    expect(decideRefund({ ...state, limitUsd: 129 }, "#1003", "x").status).toBe(
      "refunded",
    );
  });

  it("holds an order over the limit for a person to approve", () => {
    expect(decideRefund(state, "1003", "not what I expected")).toMatchObject({
      status: "waiting_for_approval",
      item: "Copper Notes",
      amountUsd: 129,
      limitUsd: 50,
    });
  });

  it("won't refund an unknown, already refunded or already waiting order", () => {
    expect(decideRefund(state, "9999", "x").status).toBe("not_refundable");
    const orders = STARTING_ORDERS.map((o) =>
      o.id === "1001"
        ? { ...o, status: "refunded" as const }
        : o.id === "1003"
          ? { ...o, status: "waiting" as const }
          : o,
    );
    expect(decideRefund({ limitUsd: 50, orders }, "1001", "x").status).toBe(
      "not_refundable",
    );
    expect(decideRefund({ limitUsd: 50, orders }, "1003", "x").status).toBe(
      "not_refundable",
    );
  });
});

describe("the Refund Console's state", () => {
  const start = START;
  const waiting = refundsReducer(start, {
    type: "outcome",
    outcome: decideRefund(state, "1003", "not what I expected"),
  });

  it("marks an automatic refund as refunded", () => {
    const next = refundsReducer(start, {
      type: "outcome",
      outcome: decideRefund(state, "1001", "x"),
    });
    expect(next.orders.find((o) => o.id === "1001")?.status).toBe("refunded");
    expect(next.waiting).toEqual([]);
  });

  it("puts a refund over the limit in the waiting list", () => {
    expect(waiting.orders.find((o) => o.id === "1003")?.status).toBe("waiting");
    expect(waiting.waiting).toEqual([
      expect.objectContaining({ orderId: "1003", amountUsd: 129 }),
    ]);
  });

  it("Approve refunds it", () => {
    const next = refundsReducer(waiting, {
      type: "decide",
      orderId: "1003",
      decision: "approved",
    });
    expect(next.orders.find((o) => o.id === "1003")?.status).toBe("refunded");
    expect(next.waiting).toEqual([]);
  });

  it("Reject keeps the money: the order is paid again", () => {
    const next = refundsReducer(waiting, {
      type: "decide",
      orderId: "1003",
      decision: "rejected",
    });
    expect(next.orders.find((o) => o.id === "1003")?.status).toBe("paid");
    expect(next.waiting).toEqual([]);
  });

  it("tells the customer the decision in the chat, with the order and amount", () => {
    const refund = {
      orderId: "1003",
      item: "Copper Notes",
      amountUsd: 129,
      reason: "x",
    };
    expect(decisionMessage(refund, "approved")).toMatch(/has been approved/);
    expect(decisionMessage(refund, "rejected")).toMatch(
      /not approved, so no money has been refunded/,
    );
  });

  it("names the order and amount in the chat message", () => {
    expect(
      decisionMessage(
        { orderId: "1004", item: "Copper Home", amountUsd: 149, reason: "x" },
        "rejected",
      ),
    ).toMatch(/Copper Home \(order #1004, \$149\)/);
  });
});

describe("Support page", () => {
  afterEach(() => {
    cleanup();
    vi.unstubAllEnvs();
  });

  // Importing the page is slow when the whole suite runs at once.
  it(
    "shows the limit, an empty waiting list and Maya's four orders",
    {
      timeout: 20_000,
    },
    async () => {
      vi.stubEnv("GOOGLE_GENERATIVE_AI_API_KEY", "test-key");
      const { default: Support } = await import("@/app/support/page");
      render(<Support />);
      expect(screen.getByLabelText("Auto-refund limit")).toHaveValue(50);
      expect(
        within(screen.getByTestId("waiting-refunds")).getByText(
          /Nothing is waiting/,
        ),
      ).toBeVisible();
      for (const id of ["1001", "1002", "1003", "1004"])
        expect(screen.getByTestId(`order-${id}`)).toHaveTextContent("Paid");
      fireEvent.change(screen.getByLabelText("Auto-refund limit"), {
        target: { value: "100" },
      });
      expect(screen.getByText(/Refunds up to \$100 go through/)).toBeVisible();
    },
  );
});

let models: MockLanguageModelV4[] = [];
vi.mock("@ai-sdk/google", () => ({
  createGoogleGenerativeAI: () => () => models.shift(),
}));

const finish = {
  type: "finish",
  finishReason: { unified: "stop", raw: undefined },
  usage: {
    inputTokens: {
      total: 1,
      noCache: 1,
      cacheRead: undefined,
      cacheWrite: undefined,
    },
    outputTokens: { total: 1, text: 1, reasoning: undefined },
  },
} as const;

/** One model step that calls a tool. */
const toolStream = (name: string, input: object) => ({
  stream: convertArrayToReadableStream([
    {
      type: "tool-call" as const,
      toolCallId: name,
      toolName: name,
      input: JSON.stringify(input),
    },
    {
      ...finish,
      finishReason: { unified: "tool-calls" as const, raw: undefined },
    },
  ]),
});

/** One model step that writes text. */
const textStream = (text: string) => ({
  stream: convertArrayToReadableStream([
    { type: "text-start" as const, id: "t" },
    { type: "text-delta" as const, id: "t", delta: text },
    { type: "text-end" as const, id: "t" },
    finish,
  ]),
});

const toolStep = (name: string, input: object) =>
  new MockLanguageModelV4({ doStream: async () => toolStream(name, input) });

const textStep = (text: string) =>
  new MockLanguageModelV4({ doStream: async () => textStream(text) });

describe("Copper hands refunds to the Refund agent", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("Copper calls transfer_to_refund_agent, then the Refund agent asks the app for the refund", async () => {
    vi.stubEnv("GOOGLE_GENERATIVE_AI_API_KEY", "test-key");
    vi.spyOn(console, "info").mockImplementation(() => {});
    // Copper's one step, then the Refund agent's two steps.
    const copper = toolStep("transfer_to_refund_agent", {
      request: "Copper Notes",
    });
    // The Refund agent's first step asks for the refund; its second replies.
    let refundSteps = 0;
    const refundAgent = new MockLanguageModelV4({
      doStream: async () =>
        refundSteps++ === 0
          ? toolStream("issue_refund", { orderId: "1003", reason: "x" })
          : textStream("Sent for approval."),
    });
    models = [copper, refundAgent];
    const { askCopper } = await import("@/lib/copper/assistant/ask");
    const progress = await finalValue(
      (
        await askCopper({
          messages: [
            { role: "user", content: "Refund my Copper Notes please" },
          ],
          useTools: true,
          refunds: state,
        })
      ).progress,
    );

    const offered = (copper.doStreamCalls[0].tools ?? []).map((t) => t.name);
    expect(offered).toContain("transfer_to_refund_agent");
    const refundTools = (refundAgent.doStreamCalls[0].tools ?? []).map(
      (t) => t.name,
    );
    expect(refundTools.sort()).toEqual(["issue_refund", "list_orders"]);

    expect(progress.steps.some((s) => s.type === "handoff")).toBe(true);
    const refund = progress.steps.find(
      (s) => s.type === "tool" && s.name === "issue_refund",
    );
    expect(refund).toMatchObject({
      agent: "refund",
      output: { status: "waiting_for_approval", orderId: "1003" },
    });
    expect(progress).toMatchObject({
      agent: "refund",
      reply: "Sent for approval.",
      status: "done",
    });
  });

  it("offers no handoff where there are no refunds (the home page)", async () => {
    vi.stubEnv("GOOGLE_GENERATIVE_AI_API_KEY", "test-key");
    vi.spyOn(console, "info").mockImplementation(() => {});
    const copper = textStep("Hi!");
    models = [copper];
    const { askCopper } = await import("@/lib/copper/assistant/ask");
    await finalValue(
      (
        await askCopper({
          messages: [{ role: "user", content: "hi" }],
          useTools: true,
        })
      ).progress,
    );
    const offered = (copper.doStreamCalls[0].tools ?? []).map((t) => t.name);
    expect(offered).not.toContain("transfer_to_refund_agent");
  });
});
