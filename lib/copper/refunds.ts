// Module 4: refunds. The customer's orders, the auto-refund limit, and the one
// rule that decides what happens to a refund request. This file is plain code
// with no AI in it: the Refund agent asks for a refund, and this rule (not the
// model) decides whether it goes through now or waits for a person.

export type OrderStatus = "paid" | "waiting" | "refunded";

export type Order = {
  id: string;
  item: string;
  amountUsd: number;
  status: OrderStatus;
};

/** The customer the Support page is helping. */
export const CUSTOMER = "Maya Reyes";

/** Refunds at or under this many dollars go through on their own. */
export const DEFAULT_LIMIT_USD = 50;

/** Maya's orders when the page first loads. */
export const STARTING_ORDERS: Order[] = [
  { id: "1001", item: "Copper Plus, monthly", amountUsd: 7.99, status: "paid" },
  { id: "1002", item: "Copper Plus, annual", amountUsd: 79, status: "paid" },
  { id: "1003", item: "Copper Notes", amountUsd: 129, status: "paid" },
  { id: "1004", item: "Copper Home", amountUsd: 149, status: "paid" },
];

/** What the Refund Console tells the server with each chat message. */
export type RefundState = { limitUsd: number; orders: Order[] };

/** What issue_refund sends back. The chat panel and the console both read it. */
export type RefundOutcome =
  | {
      status: "refunded";
      orderId: string;
      item: string;
      amountUsd: number;
      limitUsd: number;
      reason: string;
    }
  | {
      status: "waiting_for_approval";
      orderId: string;
      item: string;
      amountUsd: number;
      limitUsd: number;
      reason: string;
    }
  | {
      status: "not_refundable";
      orderId: string;
      message: string;
    };

/** "1003", "#1003" and " 1003 " all mean order 1003. */
export const normalizeOrderId = (id: string) => id.trim().replace(/^#/, "");

/**
 * The refund rule, in code: at or under the limit, refund now; over it, wait
 * for a person. Orders that don't exist, or are already refunded or waiting,
 * can't be refunded again.
 */
export function decideRefund(
  state: RefundState,
  orderId: string,
  reason: string,
): RefundOutcome {
  const id = normalizeOrderId(orderId);
  const order = state.orders.find((o) => o.id === id);
  if (!order) {
    return {
      status: "not_refundable",
      orderId: id,
      message: `There is no order #${id} for ${CUSTOMER}.`,
    };
  }
  if (order.status === "refunded") {
    return {
      status: "not_refundable",
      orderId: id,
      message: `Order #${id} (${order.item}) has already been refunded.`,
    };
  }
  if (order.status === "waiting") {
    return {
      status: "not_refundable",
      orderId: id,
      message: `A refund for order #${id} (${order.item}) is already waiting for approval.`,
    };
  }
  const outcome = {
    orderId: id,
    item: order.item,
    amountUsd: order.amountUsd,
    limitUsd: state.limitUsd,
    reason,
  };
  return order.amountUsd <= state.limitUsd
    ? { status: "refunded", ...outcome }
    : { status: "waiting_for_approval", ...outcome };
}

/** A refund over the limit, waiting in the Refund Console. */
export type PendingRefund = {
  orderId: string;
  item: string;
  amountUsd: number;
  reason: string;
};

/** What the chat says when a person decides a waiting refund. */
export function decisionMessage(
  refund: PendingRefund,
  decision: "approved" | "rejected",
): string {
  const what = `${refund.item} (order #${refund.orderId}, $${formatAmount(refund.amountUsd)})`;
  return decision === "approved"
    ? `Good news: your refund for ${what} has been approved. The money is on its way back to your original payment method.`
    : `Sorry: your refund for ${what} was not approved, so no money has been refunded. If you have questions, contact the Copper Crew in the Copper app (Settings > Help).`;
}

const formatAmount = (usd: number) =>
  Number.isInteger(usd) ? String(usd) : usd.toFixed(2);
