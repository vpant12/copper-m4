import type { Metadata } from "next";
import { AskCopper } from "@/components/copper/ask-copper";
import { RefundConsole } from "@/components/copper/refund-console";
import { RefundsProvider } from "@/components/copper/refunds-context";
import { SiteHeader } from "@/components/copper/site-header";
import { isAiConfigured } from "@/lib/ai/call";

export const metadata: Metadata = { title: "Support | Copper State Labs" };

export default function Support() {
  return (
    // The console and the chat share the orders, the limit and the waiting refunds.
    <RefundsProvider>
      {/* Leaves room on the right for the docked chat. */}
      <div className="flex flex-1 flex-col lg:pr-[28rem]">
        <SiteHeader />
        <main
          data-testid="refund-console"
          className="mx-auto w-full max-w-3xl flex-1 px-4 py-8"
        >
          <h1 className="font-display text-3xl font-bold">Refund Console</h1>
          <RefundConsole />
        </main>
        <AskCopper aiConfigured={isAiConfigured()} docked />
      </div>
    </RefundsProvider>
  );
}
