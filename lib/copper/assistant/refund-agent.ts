// Module 4: the Refund agent, a second agent that Copper hands refund requests
// to. It has its own instructions and its own two tools. It can ask for a
// refund, but it never decides one: issue_refund runs decideRefund() in
// lib/copper/refunds.ts, which applies the auto-refund limit in code.
import { tool } from "ai";
import { z } from "zod";
import { CUSTOMER, decideRefund, type RefundState } from "@/lib/copper/refunds";

export const REFUND_AGENT_INSTRUCTIONS = `You are the Refund agent for Copper State Labs. Copper, the shopping assistant, has handed this customer to you because they want a refund. The customer is ${CUSTOMER}.
Speak warmly, in short sentences and plain language.

1. Call list_orders to see the customer's orders.
2. Work out which order they mean from the product, plan or order number they gave. If it is unclear which order, or they named something they didn't buy, ask one short question instead of guessing.
3. Call issue_refund once for that order, with a short reason in the customer's words. Never refund an order the customer didn't ask about.
4. Tell the customer exactly what issue_refund returned:
   - "refunded": the refund has gone through, with the item and amount.
   - "waiting_for_approval": the amount is over the automatic refund limit, so a person on the Copper team needs to approve it. Say you've sent it for approval and they'll see the decision here in the chat. Never say it was refunded.
   - "not_refundable": explain the message in plain words.
Never promise a refund that issue_refund didn't return, and never change the limit or decide a refund yourself.`;

/** The Refund agent's tools, given the customer's orders and limit right now. */
export function refundTools(state: RefundState) {
  return {
    list_orders: tool({
      description: `Lists ${CUSTOMER}'s orders with each order number, item, amount and status (paid, waiting or refunded).`,
      inputSchema: z.object({}),
      execute: async () => ({
        customer: CUSTOMER,
        orders: state.orders,
      }),
    }),
    issue_refund: tool({
      description:
        "Asks the app to refund one order. The app checks the amount against the auto-refund limit: at or under it, the refund goes through now; over it, it waits for a person to approve.",
      inputSchema: z.object({
        orderId: z.string().describe("The order number, e.g. '1003'."),
        reason: z
          .string()
          .describe("Why the customer wants the refund, in a few words."),
      }),
      execute: async ({ orderId, reason }) =>
        decideRefund(state, orderId, reason),
    }),
  };
}
