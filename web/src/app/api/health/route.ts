import { handleApiError, json } from "@/lib/api";
import { env } from "@/lib/env";

type SupabaseHealth = {
  configured: boolean;
  url: string | null;
  reachable: boolean;
  schema_ready: boolean;
  detail: string;
};

async function checkSupabase(): Promise<SupabaseHealth> {
  const url = env.NEXT_PUBLIC_SUPABASE_URL ?? null;
  const key = env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !key) {
    return {
      configured: false,
      url,
      reachable: false,
      schema_ready: false,
      detail: "Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY",
    };
  }

  try {
    const res = await fetch(`${url}/rest/v1/service_categories?select=id&limit=1`, {
      headers: {
        apikey: key,
        Authorization: `Bearer ${key}`,
        // Supabase rejects secret keys sent with a browser-like User-Agent
        "User-Agent": "s-link-next/health",
      },
      cache: "no-store",
    });

    if (res.ok) {
      return {
        configured: true,
        url,
        reachable: true,
        schema_ready: true,
        detail: "Connected",
      };
    }
    if (res.status === 404) {
      return {
        configured: true,
        url,
        reachable: true,
        schema_ready: false,
        detail: "Connected, but tables are missing — run supabase/migrations/001_initial.sql",
      };
    }
    const body = await res.text();
    return {
      configured: true,
      url,
      reachable: false,
      schema_ready: false,
      detail: `HTTP ${res.status}: ${body.slice(0, 200)}`,
    };
  } catch (e) {
    return {
      configured: true,
      url,
      reachable: false,
      schema_ready: false,
      detail: e instanceof Error ? e.message : "Network error",
    };
  }
}

export async function GET() {
  try {
    return json({
      status: "ok",
      service: "s-link-next",
      demo_mode: env.demoMode,
      firebase_project: env.FIREBASE_PROJECT_ID ?? env.NEXT_PUBLIC_FIREBASE_PROJECT_ID ?? null,
      supabase: await checkSupabase(),
      time: new Date().toISOString(),
    });
  } catch (e) {
    return handleApiError(e);
  }
}
