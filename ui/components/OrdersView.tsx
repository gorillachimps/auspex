"use client";

import { useEffect, useMemo, useState } from "react";
import { Loader2, X, AlertCircle, RefreshCw, XCircle } from "lucide-react";
import { toast } from "sonner";
import type { ClobClient, OpenOrder } from "@polymarket/clob-client-v2";
import { useClobSession } from "@/lib/useClobSession";
import { useEnsureClientOnMount } from "@/lib/useEnsureClientOnMount";
import { useMarketLookup } from "@/lib/useMarketLookup";
import { cn } from "@/lib/cn";

const REFRESH_MS = 20_000;

function fmtPrice(p: string) {
  const n = parseFloat(p);
  return isFinite(n) ? `$${n.toFixed(3)}` : p;
}

function fmtShares(p: string) {
  const n = parseFloat(p);
  return isFinite(n) ? n.toFixed(2) : p;
}

function fmtAge(unix: number) {
  const ms = Date.now() - unix * 1000;
  if (ms < 60_000) return `${Math.floor(ms / 1000)}s`;
  if (ms < 3_600_000) return `${Math.floor(ms / 60_000)}m`;
  if (ms < 86_400_000) return `${Math.floor(ms / 3_600_000)}h`;
  return `${Math.floor(ms / 86_400_000)}d`;
}

export function OrdersView() {
  const session = useClobSession();
  // Navigating to /orders implies the user wants to see their orders.
  // Auto-derive CLOB credentials so the prompt has obvious context.
  useEnsureClientOnMount();
  const [orders, setOrders] = useState<OpenOrder[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cancelling, setCancelling] = useState<Set<string>>(new Set());

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;

    async function load(client: ClobClient) {
      if (cancelled) return;
      setLoading(true);
      try {
        const r = await client.getOpenOrders();
        if (cancelled) return;
        setOrders(r);
        setError(null);
      } catch (e) {
        if (cancelled) return;
        setError((e as Error).message);
      } finally {
        if (!cancelled) setLoading(false);
        if (!cancelled) timer = setTimeout(() => session.client && load(session.client), REFRESH_MS);
      }
    }

    if (session.client) load(session.client);
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [session.client]);

  async function cancelOne(id: string) {
    if (!session.client) return;
    setCancelling((prev) => new Set(prev).add(id));
    const toastId = toast.loading(`Cancelling order ${id.slice(0, 10)}…`);
    try {
      await session.client.cancelOrder({ orderID: id });
      toast.success("Order cancelled", { id: toastId, duration: 4000 });
      setOrders((prev) => prev?.filter((o) => o.id !== id) ?? null);
    } catch (e) {
      toast.error(`Cancel failed: ${(e as Error).message}`, {
        id: toastId,
        duration: 6000,
      });
    } finally {
      setCancelling((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
    }
  }

  async function cancelAll() {
    if (!session.client || !orders || orders.length === 0) return;
    if (
      !window.confirm(
        `Cancel all ${orders.length} open order${orders.length === 1 ? "" : "s"}?`,
      )
    ) {
      return;
    }
    const ids = orders.map((o) => o.id);
    setCancelling(new Set(ids));
    const toastId = toast.loading(`Cancelling ${ids.length} orders…`);
    try {
      await session.client.cancelOrders(ids);
      toast.success(`Cancelled ${ids.length} orders`, {
        id: toastId,
        duration: 4000,
      });
      setOrders([]);
    } catch (e) {
      toast.error(`Cancel-all failed: ${(e as Error).message}`, {
        id: toastId,
        duration: 8000,
      });
    } finally {
      setCancelling(new Set());
    }
  }

  async function refreshNow() {
    if (!session.client) return;
    setLoading(true);
    try {
      const r = await session.client.getOpenOrders();
      setOrders(r);
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }

  const orderTokenIds = useMemo(
    () => (orders ?? []).map((o) => o.asset_id).filter(Boolean),
    [orders],
  );
  const lookup = useMarketLookup(orderTokenIds);

  const summary = useMemo(() => {
    if (!orders) return null;
    let buys = 0;
    let sells = 0;
    let notional = 0;
    let unfilled = 0;
    for (const o of orders) {
      const price = parseFloat(o.price);
      const size = parseFloat(o.original_size);
      const matched = parseFloat(o.size_matched);
      if (isFinite(price) && isFinite(size)) {
        notional += price * size;
        unfilled += price * Math.max(0, size - matched);
      }
      if (o.side.toUpperCase() === "BUY") buys += 1;
      else sells += 1;
    }
    return { buys, sells, notional, unfilled };
  }, [orders]);

  if (session.status === "disabled") {
    return (
      <Empty
        title="Trading not configured"
        body="Set NEXT_PUBLIC_PRIVY_APP_ID in .env.local to enable trading."
      />
    );
  }
  if (session.status === "loading") {
    return <Empty title="Loading…" body="Privy is initialising." />;
  }
  if (session.status === "unconnected") {
    return (
      <Empty
        title="Wallet not connected"
        body="Connect a wallet from the top-right to view your open orders."
      />
    );
  }
  if (session.status === "no-funder") {
    return (
      <Empty
        title="Deposit wallet missing"
        body="Set your deposit-wallet address from the Connect menu."
      />
    );
  }
  if (session.status === "error") {
    return (
      <Empty title="Auth error" body={session.error ?? "Unknown error"} tone="error" />
    );
  }
  if (loading && !orders) {
    return (
      <Empty
        title="Fetching open orders…"
        body="One moment."
        icon={<Loader2 className="h-5 w-5 animate-spin text-accent" />}
      />
    );
  }
  if (error) {
    return <Empty title="Couldn't fetch orders" body={error} tone="error" />;
  }
  if (!orders || orders.length === 0) {
    return (
      <Empty
        title="No open orders"
        body="Place a Yes / No order from the screener and it will show up here."
      />
    );
  }

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center gap-3 rounded-md border border-border bg-surface/40 px-3 py-2">
        <Stat label="Open" value={orders.length.toLocaleString()} />
        {summary ? (
          <>
            <span className="text-border-strong" aria-hidden="true">·</span>
            <Stat label="Buys" value={summary.buys.toLocaleString()} tone="emerald" />
            <Stat label="Sells" value={summary.sells.toLocaleString()} tone="rose" />
            <span className="text-border-strong" aria-hidden="true">·</span>
            <Stat
              label="Notional"
              value={fmtNotional(summary.notional)}
              hint={`${fmtNotional(summary.unfilled)} unfilled`}
            />
          </>
        ) : null}
        <div className="ml-auto flex items-center gap-2">
          <button
            type="button"
            onClick={refreshNow}
            disabled={loading}
            className="inline-flex items-center gap-1 rounded-md border border-border-strong bg-surface px-2 py-1 text-[11px] font-medium text-muted hover:bg-surface-2 hover:text-foreground disabled:opacity-50"
          >
            {loading ? (
              <Loader2 className="h-3 w-3 animate-spin" aria-hidden="true" />
            ) : (
              <RefreshCw className="h-3 w-3" aria-hidden="true" />
            )}
            Refresh
          </button>
          <button
            type="button"
            onClick={cancelAll}
            disabled={cancelling.size > 0 || orders.length === 0}
            className="inline-flex items-center gap-1 rounded-md border border-rose-400/40 bg-rose-500/10 px-2 py-1 text-[11px] font-semibold text-rose-200 hover:bg-rose-500/20 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <XCircle className="h-3 w-3" aria-hidden="true" />
            Cancel all
          </button>
        </div>
      </div>
      <div className="overflow-x-auto">
      <table className="w-full min-w-[1080px] border-separate border-spacing-0 text-sm">
        <thead>
          <tr>
            <Th>Market</Th>
            <Th>Side</Th>
            <Th>Outcome</Th>
            <Th>Price</Th>
            <Th>Filled / Size</Th>
            <Th>Age</Th>
            <Th>Type</Th>
            <Th>Order ID</Th>
            <Th />
          </tr>
        </thead>
        <tbody>
          {orders.map((o) => {
            const matched = parseFloat(o.size_matched);
            const total = parseFloat(o.original_size);
            const pct = total > 0 ? (matched / total) * 100 : 0;
            const market = lookup[o.asset_id];
            return (
              <tr
                key={o.id}
                className="border-b border-border hover:bg-surface/50"
              >
                <Td>
                  {market ? (
                    <a
                      href={`/markets/${market.slug}`}
                      className="block max-w-[24rem] truncate text-[12px] text-foreground hover:text-accent hover:underline"
                      title={market.question}
                    >
                      {market.question}
                    </a>
                  ) : (
                    <span
                      className="font-mono text-[11px] text-muted-2"
                      title={o.asset_id}
                    >
                      {o.asset_id.slice(0, 14)}…
                    </span>
                  )}
                </Td>
                <Td>
                  <span
                    className={cn(
                      "rounded px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider ring-1",
                      o.side.toUpperCase() === "BUY"
                        ? "bg-emerald-500/15 text-emerald-200 ring-emerald-400/30"
                        : "bg-rose-500/15 text-rose-200 ring-rose-400/30",
                    )}
                  >
                    {o.side}
                  </span>
                </Td>
                <Td>
                  <span className="text-[12px] text-muted">{o.outcome}</span>
                </Td>
                <Td>
                  <span className="tabular text-foreground">
                    {fmtPrice(o.price)}
                  </span>
                </Td>
                <Td>
                  <span className="tabular text-[12px]">
                    {fmtShares(o.size_matched)} / {fmtShares(o.original_size)}{" "}
                    <span className="text-muted">({pct.toFixed(0)}%)</span>
                  </span>
                </Td>
                <Td>
                  <span className="tabular text-[12px] text-muted">
                    {fmtAge(o.created_at)}
                  </span>
                </Td>
                <Td>
                  <span className="text-[11px] uppercase text-muted">
                    {o.order_type}
                  </span>
                </Td>
                <Td>
                  <button
                    type="button"
                    title={`Click to copy: ${o.id}`}
                    onClick={() => {
                      if (typeof navigator !== "undefined" && navigator.clipboard) {
                        navigator.clipboard.writeText(o.id);
                        toast.success("Order ID copied", { duration: 2000 });
                      }
                    }}
                    className="font-mono text-[11px] text-muted-2 hover:text-foreground"
                  >
                    {o.id.slice(0, 14)}…
                  </button>
                </Td>
                <Td>
                  <button
                    type="button"
                    onClick={() => cancelOne(o.id)}
                    disabled={cancelling.has(o.id)}
                    className="inline-flex items-center gap-1 rounded-md border border-border-strong bg-surface px-2 py-1 text-[11px] font-medium text-muted hover:bg-surface-2 hover:text-foreground disabled:opacity-50"
                  >
                    {cancelling.has(o.id) ? (
                      <Loader2 className="h-3 w-3 animate-spin" />
                    ) : (
                      <X className="h-3 w-3" />
                    )}
                    Cancel
                  </button>
                </Td>
              </tr>
            );
          })}
        </tbody>
      </table>
      </div>
    </div>
  );
}

function fmtNotional(n: number): string {
  if (!isFinite(n)) return "—";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 2,
  }).format(n);
}

function Stat({
  label,
  value,
  hint,
  tone = "neutral",
}: {
  label: string;
  value: string;
  hint?: string;
  tone?: "neutral" | "emerald" | "rose";
}) {
  const colour =
    tone === "emerald"
      ? "text-emerald-300"
      : tone === "rose"
        ? "text-rose-300"
        : "text-foreground";
  return (
    <div className="flex flex-col leading-tight">
      <span className="text-[10px] uppercase tracking-wider text-muted-2">
        {label}
      </span>
      <span className={cn("tabular text-[13px] font-semibold", colour)}>
        {value}
      </span>
      {hint ? (
        <span className="tabular text-[10px] text-muted-2">{hint}</span>
      ) : null}
    </div>
  );
}

function Empty({
  title,
  body,
  icon,
  tone = "neutral",
}: {
  title: string;
  body: string;
  icon?: React.ReactNode;
  tone?: "neutral" | "error";
}) {
  return (
    <div className="mt-8 flex flex-col items-center gap-3 rounded-md border border-border bg-surface/40 px-6 py-12 text-center">
      <span
        className={cn(
          "grid h-10 w-10 place-items-center rounded-full ring-1",
          tone === "error"
            ? "bg-rose-500/15 ring-rose-400/30"
            : "bg-zinc-700/40 ring-zinc-500/40",
        )}
      >
        {icon ?? (
          <AlertCircle
            className={cn(
              "h-5 w-5",
              tone === "error" ? "text-rose-300" : "text-muted",
            )}
          />
        )}
      </span>
      <h2 className="text-base font-semibold">{title}</h2>
      <p className="max-w-md text-sm text-muted">{body}</p>
    </div>
  );
}

function Th({ children }: { children?: React.ReactNode }) {
  return (
    <th
      scope="col"
      className="border-b border-border bg-surface/40 px-3 py-2 text-left text-[10px] font-semibold uppercase tracking-wider text-muted"
    >
      {children}
    </th>
  );
}

function Td({ children }: { children: React.ReactNode }) {
  return <td className="border-b border-border/70 px-3 py-2 align-middle">{children}</td>;
}
