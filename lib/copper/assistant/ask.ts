"use server";

// The server action the Ask Copper chat calls. It streams the conversation to
// the model through callStream (lib/ai/call.ts), with or without the tools,
// and sends back each step as it happens, so the panel can show Copper
// thinking and using its tools.
//
// Module 4: on the Support page the panel also sends the customer's orders and
// the auto-refund limit. Copper then gets one more tool,
// transfer_to_refund_agent. When Copper calls it, Copper stops and the Refund
// agent (its own instructions and tools, lib/copper/assistant/refund-agent.ts)
// takes over the same conversation and writes the reply.
import { hasToolCall, stepCountIs, tool } from "ai";
import { z } from "zod";
import { callStream, THOUGHT_SUMMARIES } from "@/lib/ai/call";
import { createLive, type Live } from "@/lib/ai/live";
import {
  COPPER_INSTRUCTIONS,
  REFUND_HANDOFF_INSTRUCTIONS,
} from "@/lib/copper/assistant/instructions";
import {
  type Agent,
  HANDOFF_TOOL,
  type Progress,
  type ToolStep,
} from "@/lib/copper/assistant/progress";
import {
  REFUND_AGENT_INSTRUCTIONS,
  refundTools,
} from "@/lib/copper/assistant/refund-agent";
import { copperTools } from "@/lib/copper/assistant/tools";
import type { RefundState } from "@/lib/copper/refunds";

export type ChatMessage = { role: "user" | "assistant"; content: string };

export type AskCopperRequest = {
  messages: ChatMessage[];
  useTools: boolean;
  /** Module 4: the customer's orders and the limit, sent from the Support page. */
  refunds?: RefundState;
};

export type AskCopperResult = { progress: Live<Progress> };

/** At most this many model steps (tool calls plus the reply) per agent. */
const MAX_STEPS = 5;

const SORRY = "Sorry, something went wrong on my end. Please try again.";

/** Copper's handoff tool: it does nothing itself except say who takes over. */
const handoffTool = tool({
  description:
    "Hands the customer to the Refund agent, which can look up their orders and ask for a refund. Use it whenever a customer wants money back on one of their orders.",
  inputSchema: z.object({
    request: z
      .string()
      .describe("What the customer wants refunded, in a few words."),
  }),
  execute: async () => ({ handedOffTo: "Refund agent" }),
});

export async function askCopper({
  messages,
  useTools,
  refunds,
}: AskCopperRequest): Promise<AskCopperResult> {
  const { live, update, done } = createLive<Progress>();
  const progress: Progress = {
    steps: [],
    reply: "",
    status: "working",
    agent: "copper",
  };
  // A fresh copy each time, so earlier updates never change underneath the
  // panel.
  const snapshot = (): Progress => ({
    ...progress,
    steps: progress.steps.map((step) => ({ ...step })),
  });
  const toolStep = (id: string) =>
    progress.steps.find(
      (step): step is ToolStep => step.type === "tool" && step.id === id,
    );

  const canHandOff = useTools && refunds !== undefined;

  // Without tools, send no instructions either: "always use your tools" with
  // no tools makes the model answer with nothing.
  const copper = callStream(
    { module: 2, feature: "ask-copper" },
    {
      messages,
      providerOptions: THOUGHT_SUMMARIES,
      ...(useTools && {
        instructions: canHandOff
          ? `${COPPER_INSTRUCTIONS}\n\n${REFUND_HANDOFF_INSTRUCTIONS}`
          : COPPER_INSTRUCTIONS,
        tools: canHandOff
          ? { ...copperTools, [HANDOFF_TOOL]: handoffTool }
          : copperTools,
        stopWhen: canHandOff
          ? [stepCountIs(MAX_STEPS), hasToolCall(HANDOFF_TOOL)]
          : stepCountIs(MAX_STEPS),
      }),
    },
  );

  /** Reads one agent's stream into `progress`. True if it handed off. */
  async function follow(
    result: ReturnType<typeof callStream>,
    agent: Agent,
  ): Promise<boolean> {
    let handedOff = false;
    for await (const part of result.fullStream) {
      switch (part.type) {
        case "reasoning-delta": {
          const last = progress.steps.at(-1);
          if (last?.type === "thinking" && last.agent === agent)
            last.text += part.text;
          else
            progress.steps.push({ type: "thinking", text: part.text, agent });
          break;
        }
        case "tool-input-start":
          progress.steps.push({
            type: "tool",
            id: part.id,
            name: part.toolName,
            state: "calling",
            agent,
          });
          break;
        case "tool-call": {
          const step = toolStep(part.toolCallId);
          if (step) step.input = part.input;
          else
            progress.steps.push({
              type: "tool",
              id: part.toolCallId,
              name: part.toolName,
              state: "calling",
              input: part.input,
              agent,
            });
          break;
        }
        case "tool-result": {
          const step = toolStep(part.toolCallId);
          if (step) Object.assign(step, { output: part.output, state: "done" });
          if (part.toolName === HANDOFF_TOOL) handedOff = true;
          break;
        }
        case "tool-error": {
          const step = toolStep(part.toolCallId);
          const message =
            part.error instanceof Error
              ? part.error.message
              : String(part.error);
          if (step) Object.assign(step, { output: message, state: "error" });
          break;
        }
        case "text-delta":
          progress.reply += part.text;
          break;
        case "error":
          throw part.error;
        default:
          continue;
      }
      update(snapshot());
    }
    return handedOff;
  }

  // Read the streams in the background, so the panel gets the first update now.
  void (async () => {
    try {
      const handedOff = await follow(copper, "copper");
      if (handedOff && refunds) {
        // The Refund agent writes the reply; anything Copper said first is dropped.
        progress.steps.push({ type: "handoff", from: "copper", to: "refund" });
        progress.reply = "";
        progress.agent = "refund";
        update(snapshot());
        const refundAgent = callStream(
          { module: 4, feature: "refund-agent" },
          {
            messages,
            instructions: REFUND_AGENT_INSTRUCTIONS,
            tools: refundTools(refunds),
            stopWhen: stepCountIs(MAX_STEPS),
            providerOptions: THOUGHT_SUMMARIES,
          },
        );
        await follow(refundAgent, "refund");
      }
      progress.status = "done";
      if (!progress.reply.trim()) progress.reply = SORRY;
    } catch {
      progress.status = "error";
      if (!progress.reply.trim()) progress.reply = SORRY;
    }
    done(snapshot());
  })();

  return { progress: live };
}
