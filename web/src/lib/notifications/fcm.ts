import { cert, getApps, initializeApp } from "firebase-admin/app";
import { getMessaging } from "firebase-admin/messaging";
import { env } from "@/lib/env";
import { logger } from "@/lib/logger";

function messaging() {
  if (!env.FIREBASE_SERVICE_ACCOUNT_JSON) return null;
  try {
    if (!getApps().length) {
      initializeApp({
        credential: cert(JSON.parse(env.FIREBASE_SERVICE_ACCOUNT_JSON)),
      });
    }
    return getMessaging();
  } catch (error) {
    logger.error("fcm.initialization_failed", {
      error: error instanceof Error ? error.message : "unknown",
    });
    return null;
  }
}

export async function notifyDevices(
  tokens: string[],
  message: { title: string; body: string; data: Record<string, string> },
) {
  const client = messaging();
  if (!tokens.length) return { sent: 0, configured: !!client };
  if (!client) {
    logger.warn("fcm.not_configured", { recipient_count: tokens.length });
    return { sent: 0, configured: false };
  }
  const result = await client.sendEachForMulticast({
    tokens,
    notification: { title: message.title, body: message.body },
    data: message.data,
    android: { priority: "high" },
  });
  logger.info("fcm.sent", {
    sent: result.successCount,
    failed: result.failureCount,
  });
  return { sent: result.successCount, configured: true };
}
