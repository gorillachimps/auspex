"use client";

/**
 * Singleton WebSocket client for Polymarket's public market-data stream.
 *
 * Architecture
 * ------------
 * One physical WebSocket per browser tab, regardless of how many components
 * call `subscribe`. Subscriptions are ref-counted per asset_id; the underlying
 * connection opens lazily on the first subscribe and closes when refs drop to
 * zero. New asset subscriptions are batched within a small time window so a
 * single render that triggers N hooks results in one `subscribe` message
 * rather than N.
 *
 * Reconnection is exponential-backoff with a 30s cap. On reconnect we
 * re-subscribe to every asset we still have refs for. Polymarket's WS protocol
 * has no per-asset unsubscribe verb — we simply stop forwarding events for
 * dropped assets and rely on the close-on-zero-refs behaviour to flush them.
 *
 * Heartbeat: send "PING" every 10s, server replies "PONG". A missed heartbeat
 * window will surface as an `onclose` from the browser and trigger reconnect
 * organically.
 */

const WS_URL = "wss://ws-subscriptions-clob.polymarket.com/ws/market";
const HEARTBEAT_MS = 10_000;
const BATCH_SUBSCRIBE_MS = 50;
const RECONNECT_DELAYS_MS = [500, 1000, 2000, 4000, 8000, 16000, 30000];

export type WsStatus = "idle" | "connecting" | "open" | "reconnecting" | "closed";

type AnyEvent = Record<string, unknown>;

export type HandlerSet = {
  onBook?: (e: AnyEvent) => void;
  onPriceChange?: (e: AnyEvent) => void;
  onLastTrade?: (e: AnyEvent) => void;
  onTickSizeChange?: (e: AnyEvent) => void;
};

class PolymarketMarketWS {
  private ws: WebSocket | null = null;
  private status: WsStatus = "idle";
  private refs = new Map<string, number>();
  private subscribers = new Map<string, Set<HandlerSet>>();
  private pendingSubscribeBatch = new Set<string>();
  private batchTimer: ReturnType<typeof setTimeout> | null = null;
  private reconnectAttempt = 0;
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private statusHandlers = new Set<(s: WsStatus) => void>();

  subscribe(assetIds: string[], handlers: HandlerSet): () => void {
    const newAssets: string[] = [];
    const cleanIds = assetIds.filter((id) => typeof id === "string" && id.length > 0);
    for (const id of cleanIds) {
      const prev = this.refs.get(id) ?? 0;
      this.refs.set(id, prev + 1);
      if (prev === 0) newAssets.push(id);
      let set = this.subscribers.get(id);
      if (!set) {
        set = new Set();
        this.subscribers.set(id, set);
      }
      set.add(handlers);
    }

    if (newAssets.length > 0) {
      newAssets.forEach((id) => this.pendingSubscribeBatch.add(id));
      this.scheduleBatchFlush();
    }

    return () => {
      for (const id of cleanIds) {
        const set = this.subscribers.get(id);
        if (set) set.delete(handlers);
        const prev = this.refs.get(id) ?? 0;
        if (prev <= 1) {
          this.refs.delete(id);
          this.subscribers.delete(id);
        } else {
          this.refs.set(id, prev - 1);
        }
      }
      if (this.refs.size === 0) this.close();
    };
  }

  onStatus(fn: (s: WsStatus) => void): () => void {
    this.statusHandlers.add(fn);
    fn(this.status);
    return () => {
      this.statusHandlers.delete(fn);
    };
  }

  private setStatus(s: WsStatus) {
    if (this.status === s) return;
    this.status = s;
    this.statusHandlers.forEach((h) => {
      try {
        h(s);
      } catch {
        // ignore handler errors
      }
    });
  }

  private scheduleBatchFlush() {
    if (this.batchTimer != null) return;
    this.batchTimer = setTimeout(() => {
      this.batchTimer = null;
      if (this.pendingSubscribeBatch.size === 0) return;
      const ids = [...this.pendingSubscribeBatch];
      this.pendingSubscribeBatch.clear();
      if (this.status === "open") {
        this.sendSubscribe(ids);
      } else if (this.status === "idle" || this.status === "closed") {
        // Connect will read this.refs and subscribe to everything.
        this.connect();
      }
      // If "connecting" or "reconnecting", the open handler will pick up
      // everything in this.refs anyway.
    }, BATCH_SUBSCRIBE_MS);
  }

  private connect() {
    if (typeof window === "undefined") return;
    if (this.status === "connecting" || this.status === "open") return;

    this.setStatus("connecting");

    let socket: WebSocket;
    try {
      socket = new WebSocket(WS_URL);
    } catch {
      this.scheduleReconnect();
      return;
    }
    this.ws = socket;

    // Every handler gates on `this.ws === socket`. When close() (or a
    // reconnect) supersedes this socket, it nulls/replaces this.ws; the old
    // socket's async onclose then no-ops instead of stomping the new socket's
    // status to "reconnecting" and scheduling a redundant reconnect. Without
    // this guard, a rapid mount→unmount→mount (route flip) produces spurious
    // "reconnecting" status pulses and wasted timers.
    socket.onopen = () => {
      if (this.ws !== socket) return;
      this.setStatus("open");
      this.reconnectAttempt = 0;
      const allAssets = [...this.refs.keys()];
      if (allAssets.length > 0) this.sendSubscribe(allAssets);
      this.startHeartbeat();
    };
    socket.onmessage = (ev) => {
      if (this.ws !== socket) return;
      this.handleMessage(ev.data);
    };
    socket.onclose = () => {
      if (this.ws !== socket) return; // superseded socket — ignore
      this.stopHeartbeat();
      this.ws = null;
      if (this.refs.size > 0) {
        this.setStatus("reconnecting");
        this.scheduleReconnect();
      } else {
        this.setStatus("closed");
      }
    };
    socket.onerror = () => {
      // onclose will fire next; let it handle reconnect.
    };
  }

  private sendSubscribe(assetIds: string[]) {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;
    if (assetIds.length === 0) return;
    try {
      this.ws.send(
        JSON.stringify({
          type: "market",
          auth: null,
          markets: [],
          assets_ids: assetIds,
        }),
      );
    } catch {
      // socket may have closed mid-send; close handler will reconnect
    }
  }

  private startHeartbeat() {
    this.stopHeartbeat();
    this.heartbeatTimer = setInterval(() => {
      if (this.ws && this.ws.readyState === WebSocket.OPEN) {
        try {
          this.ws.send("PING");
        } catch {
          // ignore
        }
      }
    }, HEARTBEAT_MS);
  }

  private stopHeartbeat() {
    if (this.heartbeatTimer != null) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
  }

  private scheduleReconnect() {
    if (this.reconnectTimer != null) return;
    const delay =
      RECONNECT_DELAYS_MS[Math.min(this.reconnectAttempt, RECONNECT_DELAYS_MS.length - 1)];
    this.reconnectAttempt++;
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.connect();
    }, delay);
  }

  private handleMessage(data: unknown) {
    if (typeof data !== "string") return;
    if (data === "PONG" || data === "pong") return;
    let parsed: unknown;
    try {
      parsed = JSON.parse(data);
    } catch {
      return;
    }
    const events: AnyEvent[] = Array.isArray(parsed)
      ? (parsed as AnyEvent[])
      : parsed && typeof parsed === "object"
        ? [parsed as AnyEvent]
        : [];
    for (const e of events) this.dispatch(e);
  }

  private dispatch(e: AnyEvent) {
    const assetId = typeof e.asset_id === "string" ? e.asset_id : null;
    if (!assetId) return;
    const subs = this.subscribers.get(assetId);
    if (!subs) return;
    const t = typeof e.event_type === "string" ? e.event_type : "";
    for (const h of subs) {
      try {
        switch (t) {
          case "book":
            h.onBook?.(e);
            break;
          case "price_change":
            h.onPriceChange?.(e);
            break;
          case "last_trade_price":
            h.onLastTrade?.(e);
            break;
          case "tick_size_change":
            h.onTickSizeChange?.(e);
            break;
        }
      } catch {
        // user handler error; swallow so other subscribers still fire
      }
    }
  }

  private close() {
    this.stopHeartbeat();
    if (this.reconnectTimer != null) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.batchTimer != null) {
      clearTimeout(this.batchTimer);
      this.batchTimer = null;
    }
    // Drop any not-yet-flushed subscribe batch. Otherwise a later subscribe()
    // would flush these now-zero-ref asset ids alongside the new ones, and
    // (since Polymarket has no unsubscribe verb) we'd receive + ignore events
    // for assets nobody is subscribed to — wasted bandwidth that defeats the
    // ref-counting intent.
    this.pendingSubscribeBatch.clear();
    if (this.ws) {
      try {
        this.ws.close();
      } catch {
        // ignore
      }
      this.ws = null;
    }
    this.setStatus("idle");
  }
}

export const polymarketMarketWs = new PolymarketMarketWS();
