import { handleApiError, json } from "@/lib/api";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/store";
import { broadcastTimedOutDispatches } from "@/lib/dispatch";
import { env } from "@/lib/env";

async function expire(req: Request) {
  const isCron =
    !!env.CRON_SECRET &&
    req.headers.get("authorization") === `Bearer ${env.CRON_SECRET}`;
  if (!isCron) await requireUser(req);
  const timeout = Number(
    process.env.PROVIDER_RESPONSE_TIMEOUT_MIN ||
      new URL(req.url).searchParams.get("timeout_min") ||
      5,
  );
  const minutes = Number.isFinite(timeout) ? timeout : 5;
  const broadcast = await broadcastTimedOutDispatches(minutes);
  // Preserve legacy expiry only for jobs that were never AI-dispatched.
  return json({ broadcast, expired: await db.expirePendingJobs(minutes) });
}

export async function GET(req: Request) {
  try {
    return await expire(req);
  } catch (e) {
    return handleApiError(e);
  }
}

export async function POST(req: Request) {
  try {
    return await expire(req);
  } catch (e) {
    return handleApiError(e);
  }
}
