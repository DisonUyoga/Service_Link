import { handleApiError, json, readJson } from "@/lib/api";
import { db } from "@/lib/store";

export async function POST(req: Request) {
  try {
    const body = await readJson<Record<string, unknown>>(req);

    // Simplified Flutter/dev shape
    if (body.job_id != null && body.result_code != null) {
      return json(
        await db.paymentCallback({
          job_id: Number(body.job_id),
          result_code: String(body.result_code),
          mpesa_reference: body.mpesa_reference ? String(body.mpesa_reference) : undefined,
        }),
      );
    }

    // Daraja STK callback shape
    const stk =
      (body.Body as { stkCallback?: Record<string, unknown> } | undefined)?.stkCallback ||
      (body as { stkCallback?: Record<string, unknown> }).stkCallback;
    if (stk) {
      const resultCode = String(stk.ResultCode ?? "1");
      const meta = (stk.CallbackMetadata as { Item?: Array<{ Name: string; Value: unknown }> })
        ?.Item;
      const ref = meta?.find((i) => i.Name === "MpesaReceiptNumber")?.Value;
      const account = meta?.find((i) => i.Name === "AccountReference")?.Value;
      const checkout = String(stk.CheckoutRequestID || "");
      let jobId = 0;
      if (typeof account === "string" && account.startsWith("JOB-")) {
        jobId = Number(account.replace("JOB-", ""));
      } else if (checkout.includes("-")) {
        const maybe = Number(checkout.split("-")[1]);
        if (!Number.isNaN(maybe)) jobId = maybe;
      }
      if (!jobId && body.job_id) jobId = Number(body.job_id);
      if (!jobId) return json({ detail: "Unable to resolve job_id" }, 400);
      return json(
        await db.paymentCallback({
          job_id: jobId,
          result_code: resultCode,
          mpesa_reference: ref ? String(ref) : checkout,
        }),
      );
    }

    return json({ detail: "Unrecognized callback payload" }, 400);
  } catch (e) {
    return handleApiError(e);
  }
}
