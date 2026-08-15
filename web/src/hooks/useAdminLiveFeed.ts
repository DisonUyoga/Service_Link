"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export type LiveConnectionState = "connecting" | "live" | "reconnecting" | "offline";

type Options = {
  token: string | null;
  /** Called when the server signals that map/overview data should reload */
  onRefresh: () => void | Promise<void>;
  /** Debounce bursty DB events (ms) */
  debounceMs?: number;
};

/**
 * Opens an authenticated SSE stream to /api/admin/live/ and soft-refreshes
 * when Supabase Realtime reports DB changes.
 */
export function useAdminLiveFeed({ token, onRefresh, debounceMs = 400 }: Options) {
  const [connection, setConnection] = useState<LiveConnectionState>("offline");
  const onRefreshRef = useRef(onRefresh);
  onRefreshRef.current = onRefresh;
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const scheduleRefresh = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      void onRefreshRef.current();
    }, debounceMs);
  }, [debounceMs]);

  useEffect(() => {
    if (!token) {
      setConnection("offline");
      return;
    }

    let cancelled = false;
    let retryMs = 1000;
    let abort: AbortController | null = null;

    async function connect() {
      if (cancelled) return;
      setConnection((prev) => (prev === "live" ? "reconnecting" : "connecting"));
      abort = new AbortController();

      try {
        const res = await fetch("/api/admin/live/", {
          headers: { Authorization: `Bearer ${token}` },
          signal: abort.signal,
          cache: "no-store",
        });

        if (!res.ok || !res.body) {
          throw new Error(`Live feed HTTP ${res.status}`);
        }

        setConnection("live");
        retryMs = 1000;

        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";

        while (!cancelled) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const chunks = buffer.split("\n\n");
          buffer = chunks.pop() || "";

          for (const chunk of chunks) {
            const lines = chunk.split("\n");
            let eventName = "message";
            let dataLine = "";
            for (const line of lines) {
              if (line.startsWith("event:")) eventName = line.slice(6).trim();
              if (line.startsWith("data:")) dataLine += line.slice(5).trim();
            }
            if (eventName === "refresh") {
              scheduleRefresh();
            }
            if (eventName === "connected" || eventName === "status") {
              setConnection("live");
            }
          }
        }

        if (!cancelled) {
          setConnection("reconnecting");
          setTimeout(connect, retryMs);
          retryMs = Math.min(retryMs * 2, 15_000);
        }
      } catch (err) {
        if (cancelled || (err instanceof DOMException && err.name === "AbortError")) return;
        setConnection("reconnecting");
        setTimeout(connect, retryMs);
        retryMs = Math.min(retryMs * 2, 15_000);
      }
    }

    void connect();

    return () => {
      cancelled = true;
      abort?.abort();
      if (timerRef.current) clearTimeout(timerRef.current);
      setConnection("offline");
    };
  }, [token, scheduleRefresh]);

  return { connection };
}
