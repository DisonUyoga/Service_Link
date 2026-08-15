import { z } from "zod";
import { handleApiError, json, readJson } from "@/lib/api";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/store";
import { env } from "@/lib/env";
import { normalizeMsisdn } from "@/lib/phone";

const schema = z.object({
  job: z.coerce.number(),
  phone: z.string().optional(),
  phone_number: z.string().optional(),
});

async function stkPush(phone: string, amount: number, jobId: number) {
  if (!env.MPESA_CONSUMER_KEY || !env.MPESA_CONSUMER_SECRET || !env.MPESA_SHORTCODE) {
    return { mode: "demo" as const, checkoutRequestId: `DEMO-${jobId}-${Date.now()}` };
  }
  const base =
    env.MPESA_ENV === "production"
      ? "https://api.safaricom.co.ke"
      : "https://sandbox.safaricom.co.ke";
  const auth = Buffer.from(
    `${env.MPESA_CONSUMER_KEY}:${env.MPESA_CONSUMER_SECRET}`,
  ).toString("base64");
  const tokenRes = await fetch(
    `${base}/oauth/v1/generate?grant_type=client_credentials`,
    { headers: { Authorization: `Basic ${auth}` } },
  );
  if (!tokenRes.ok) {
    throw Object.assign(new Error("M-Pesa auth failed"), { status: 502 });
  }
  const { access_token } = (await tokenRes.json()) as { access_token: string };
  const timestamp = new Date()
    .toISOString()
    .replace(/[^0-9]/g, "")
    .slice(0, 14);
  const password = Buffer.from(
    `${env.MPESA_SHORTCODE}${env.MPESA_PASSKEY || ""}${timestamp}`,
  ).toString("base64");
  const res = await fetch(`${base}/mpesa/stkpush/v1/processrequest`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${access_token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      BusinessShortCode: env.MPESA_SHORTCODE,
      Password: password,
      Timestamp: timestamp,
      TransactionType: "CustomerPayBillOnline",
      Amount: amount,
      PartyA: phone,
      PartyB: env.MPESA_SHORTCODE,
      PhoneNumber: phone,
      CallBackURL: env.MPESA_CALLBACK_URL || `${env.NEXT_PUBLIC_APP_URL}/api/payments/mpesa/callback/`,
      AccountReference: `JOB-${jobId}`,
      TransactionDesc: "S-Link connection fee",
    }),
  });
  const data = await res.json();
  if (!res.ok) {
    throw Object.assign(new Error("STK push failed"), { status: 502 });
  }
  return { mode: "live" as const, ...data };
}

export async function POST(req: Request) {
  try {
    const user = await requireUser(req);
    const body = schema.parse(await readJson(req));
    const rawPhone = body.phone_number || body.phone || user.phone || "";
    let normalized = "";
    try {
      if (rawPhone) normalized = normalizeMsisdn(rawPhone);
    } catch {
      const digits = rawPhone.replace(/\D/g, "");
      normalized = digits.startsWith("254")
        ? digits
        : `254${digits.replace(/^0/, "")}`;
    }
    const payment = await db.initiatePayment(body.job, user.id, {
      phone_number: normalized,
    });
    const stk = await stkPush(normalized || "254700000000", Number(payment.amount), body.job);
    return json(
      {
        ...payment,
        customer_message:
          stk.mode === "demo"
            ? "Demo payment recorded."
            : String((stk as { CustomerMessage?: string }).CustomerMessage || ""),
        response_description:
          stk.mode === "demo"
            ? "Success. Demo mode."
            : String((stk as { ResponseDescription?: string }).ResponseDescription || ""),
        stk,
      },
      201,
    );
  } catch (e) {
    return handleApiError(e);
  }
}
