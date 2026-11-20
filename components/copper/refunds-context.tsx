"use client";

// Module 4: what the Refund Console and the chat share on the Support page:
// the customer's orders, the auto-refund limit and the refunds waiting for a
// person. When a person approves or rejects one, the chat is told straight
// away so it can tell the customer. It lives in the browser, so each visitor
// gets their own console.
import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useMemo,
  useReducer,
  useRef,
} from "react";
import {
  DEFAULT_LIMIT_USD,
  decisionMessage,
  type Order,
  type PendingRefund,
  type RefundOutcome,
  STARTING_ORDERS,
} from "@/lib/copper/refunds";

export type RefundsState = {
  limitUsd: number;
  orders: Order[];
  waiting: PendingRefund[];
};

type Action =
  | { type: "set-limit"; limitUsd: number }
  | { type: "outcome"; outcome: RefundOutcome }
  | { type: "decide"; orderId: string; decision: "approved" | "rejected" };

export const START: RefundsState = {
  limitUsd: DEFAULT_LIMIT_USD,
  orders: STARTING_ORDERS,
  waiting: [],
};

const setStatus = (orders: Order[], id: string, status: Order["status"]) =>
  orders.map((o) => (o.id === id ? { ...o, status } : o));

export function refundsReducer(
  state: RefundsState,
  action: Action,
): RefundsState {
  switch (action.type) {
    case "set-limit":
      return { ...state, limitUsd: Math.max(0, action.limitUsd) };
    case "outcome": {
      const { outcome } = action;
      if (outcome.status === "refunded")
        return {
          ...state,
          orders: setStatus(state.orders, outcome.orderId, "refunded"),
        };
      if (
        outcome.status === "waiting_for_approval" &&
        !state.waiting.some((w) => w.orderId === outcome.orderId)
      )
        return {
          ...state,
          orders: setStatus(state.orders, outcome.orderId, "waiting"),
          waiting: [
            ...state.waiting,
            {
              orderId: outcome.orderId,
              item: outcome.item,
              amountUsd: outcome.amountUsd,
              reason: outcome.reason,
            },
          ],
        };
      return state;
    }
    case "decide":
      if (!state.waiting.some((w) => w.orderId === action.orderId))
        return state;
      return {
        ...state,
        // Approve refunds the order; Reject keeps the money, so it's paid again.
        orders: setStatus(
          state.orders,
          action.orderId,
          action.decision === "approved" ? "refunded" : "paid",
        ),
        waiting: state.waiting.filter((w) => w.orderId !== action.orderId),
      };
  }
}

/** Called with the message for the customer when a person decides a refund. */
type DecisionListener = (message: string) => void;

type Refunds = RefundsState & {
  setLimit: (limitUsd: number) => void;
  applyOutcome: (outcome: RefundOutcome) => void;
  approve: (orderId: string) => void;
  reject: (orderId: string) => void;
  /** The chat listens here; returns a function that stops listening. */
  onDecision: (listener: DecisionListener) => () => void;
};

const RefundsContext = createContext<Refunds | null>(null);

export function RefundsProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(refundsReducer, START);
  const listeners = useRef(new Set<DecisionListener>());

  const onDecision = useCallback((listener: DecisionListener) => {
    listeners.current.add(listener);
    return () => {
      listeners.current.delete(listener);
    };
  }, []);

  const value = useMemo<Refunds>(() => {
    const decide = (orderId: string, decision: "approved" | "rejected") => {
      const refund = state.waiting.find((w) => w.orderId === orderId);
      if (!refund) return;
      dispatch({ type: "decide", orderId, decision });
      const message = decisionMessage(refund, decision);
      for (const listener of listeners.current) listener(message);
    };
    return {
      ...state,
      setLimit: (limitUsd) => dispatch({ type: "set-limit", limitUsd }),
      applyOutcome: (outcome) => dispatch({ type: "outcome", outcome }),
      approve: (orderId) => decide(orderId, "approved"),
      reject: (orderId) => decide(orderId, "rejected"),
      onDecision,
    };
  }, [state, onDecision]);

  return (
    <RefundsContext.Provider value={value}>{children}</RefundsContext.Provider>
  );
}

/** The Support page's refunds, or null anywhere else (the home page chat). */
export function useRefunds(): Refunds | null {
  return useContext(RefundsContext);
}
