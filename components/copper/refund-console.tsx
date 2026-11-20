"use client";

// Module 4: the Refund Console. A person sets the auto-refund limit, approves
// or rejects the refunds that went over it, and sees each order's status.
import { CheckIcon, XIcon } from "lucide-react";
import { useRefunds } from "@/components/copper/refunds-context";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { formatUsd } from "@/lib/copper/catalog";
import { CUSTOMER, type OrderStatus } from "@/lib/copper/refunds";
import { cn } from "@/lib/utils";

const STATUS: Record<OrderStatus, { label: string; className: string }> = {
  paid: { label: "Paid", className: "" },
  waiting: {
    label: "Waiting for approval",
    className: "bg-chart-4 text-chart-5",
  },
  refunded: { label: "Refunded", className: "bg-accent text-white" },
};

export function RefundConsole() {
  const refunds = useRefunds();
  if (!refunds) return null;
  const { limitUsd, orders, waiting, setLimit, approve, reject } = refunds;

  return (
    <div className="mt-6 space-y-8">
      <p className="text-muted-foreground">
        Ask for a refund in the chat as the customer. Copper hands you to the
        Refund agent, which asks the app for the refund. The app checks the
        amount against your limit: at or under it, the refund goes through; over
        it, it waits here for you.
      </p>

      <section className="bg-card space-y-2 rounded-xl border p-4">
        <Label htmlFor="refund-limit" className="font-semibold">
          Auto-refund limit
        </Label>
        <div className="flex items-center gap-2">
          <span className="text-muted-foreground">$</span>
          <Input
            id="refund-limit"
            type="number"
            min={0}
            step={1}
            value={limitUsd}
            onChange={(event) => setLimit(Number(event.target.value) || 0)}
            className="w-28"
          />
        </div>
        <p className="text-muted-foreground text-xs">
          Refunds up to {formatUsd(limitUsd)} go through on their own. Anything
          larger needs your approval.
        </p>
      </section>

      <section className="space-y-3" data-testid="waiting-refunds">
        <h2 className="text-lg font-semibold">Waiting for your approval</h2>
        {waiting.length === 0 ? (
          <p className="text-muted-foreground rounded-xl border p-4 text-sm">
            Nothing is waiting. Refunds over the limit will stop here.
          </p>
        ) : (
          <ul className="space-y-2">
            {waiting.map((refund) => (
              <li
                key={refund.orderId}
                className="bg-card border-chart-4 flex flex-wrap items-center gap-3 rounded-xl border-2 p-4"
              >
                <div className="min-w-0 flex-1">
                  <p className="font-semibold">
                    <span className="text-muted-foreground mr-2 font-mono text-sm">
                      #{refund.orderId}
                    </span>
                    {refund.item} · {formatUsd(refund.amountUsd)}
                  </p>
                  <p className="text-muted-foreground text-sm">
                    Over your {formatUsd(limitUsd)} limit. Reason:{" "}
                    {refund.reason}
                  </p>
                </div>
                <div className="flex gap-2">
                  <Button size="sm" onClick={() => approve(refund.orderId)}>
                    <CheckIcon /> Approve
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => reject(refund.orderId)}
                  >
                    <XIcon /> Reject
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">{CUSTOMER}&apos;s orders</h2>
        <ul className="bg-card divide-y rounded-xl border">
          {orders.map((order) => (
            <li
              key={order.id}
              data-testid={`order-${order.id}`}
              className="flex items-center gap-3 px-4 py-3 text-sm"
            >
              <span className="text-muted-foreground font-mono">
                #{order.id}
              </span>
              <span className="flex-1 font-medium">{order.item}</span>
              <Badge
                variant="outline"
                className={cn(STATUS[order.status].className)}
              >
                {STATUS[order.status].label}
              </Badge>
              <span className="w-16 text-right font-mono">
                {formatUsd(order.amountUsd)}
              </span>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
