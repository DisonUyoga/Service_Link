import { detail, handleApiError } from "@/lib/api";
import { requireUser, requireOperationsAccess } from "@/lib/auth";
import { env } from "@/lib/env";
import { createServiceClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Server-Sent Events stream for the admin live map.
 * Subscribes to Supabase Realtime (service role) and pushes "refresh" events
 * whenever providers, jobs, locations, payments, or ads change.
 */
export async function GET(req: Request) {
  try {
    const user = await requireUser(req);
    requireOperationsAccess(user);

    if (env.demoMode) {
      // Demo/memory mode: heartbeat-only so the UI still shows "Live"
      const encoder = new TextEncoder();
      const stream = new ReadableStream({
        start(controller) {
          controller.enqueue(encoder.encode(`event: connected\ndata: ${JSON.stringify({ mode: "demo" })}\n\n`));
          const heartbeat = setInterval(() => {
            try {
              controller.enqueue(encoder.encode(`: ping\n\n`));
            } catch {
              clearInterval(heartbeat);
            }
          }, 20_000);
          req.signal.addEventListener("abort", () => {
            clearInterval(heartbeat);
            try {
              controller.close();
            } catch {
              /* closed */
            }
          });
        },
      });
      return new Response(stream, {
        headers: {
          "Content-Type": "text/event-stream",
          "Cache-Control": "no-cache, no-transform",
          Connection: "keep-alive",
        },
      });
    }

    const supabase = createServiceClient();
    const encoder = new TextEncoder();
    let closed = false;

    const stream = new ReadableStream({
      start(controller) {
        const send = (event: string, data: unknown) => {
          if (closed) return;
          try {
            controller.enqueue(
              encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`),
            );
          } catch {
            closed = true;
          }
        };

        send("connected", { mode: "realtime" });

        const channel = supabase
          .channel(`admin-live-${user.id}`)
          .on(
            "postgres_changes",
            { event: "*", schema: "public", table: "service_provider_profiles" },
            () => send("refresh", { table: "service_provider_profiles" }),
          )
          .on(
            "postgres_changes",
            { event: "*", schema: "public", table: "provider_locations" },
            () => send("refresh", { table: "provider_locations" }),
          )
          .on(
            "postgres_changes",
            { event: "*", schema: "public", table: "job_requests" },
            () => send("refresh", { table: "job_requests" }),
          )
          .on(
            "postgres_changes",
            { event: "*", schema: "public", table: "payments" },
            () => send("refresh", { table: "payments" }),
          )
          .on(
            "postgres_changes",
            { event: "*", schema: "public", table: "ad_placements" },
            () => send("refresh", { table: "ad_placements" }),
          )
          .subscribe((status) => {
            if (status === "SUBSCRIBED") {
              send("status", { realtime: "subscribed" });
            }
            if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
              send("status", { realtime: status.toLowerCase() });
            }
          });

        const heartbeat = setInterval(() => {
          if (closed) {
            clearInterval(heartbeat);
            return;
          }
          try {
            controller.enqueue(encoder.encode(`: ping\n\n`));
          } catch {
            closed = true;
            clearInterval(heartbeat);
          }
        }, 20_000);

        const shutdown = async () => {
          if (closed) return;
          closed = true;
          clearInterval(heartbeat);
          try {
            await supabase.removeChannel(channel);
          } catch {
            /* ignore */
          }
          try {
            controller.close();
          } catch {
            /* ignore */
          }
        };

        req.signal.addEventListener("abort", () => {
          void shutdown();
        });
      },
      cancel() {
        closed = true;
      },
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache, no-transform",
        Connection: "keep-alive",
      },
    });
  } catch (e) {
    return handleApiError(e);
  }
}
