/**
 * Delete outlier provider fp7773 (and related rows) from Supabase.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");

function loadEnvLocal() {
  const envPath = path.join(root, "web", ".env.local");
  if (!fs.existsSync(envPath)) return;
  for (const line of fs.readFileSync(envPath, "utf8").split(/\r?\n/)) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2];
  }
}

loadEnvLocal();

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}

const sb = createClient(url, key, { auth: { persistSession: false } });

async function main() {
  const username = "fp7773";

  const { data: profiles, error: pErr } = await sb
    .from("profiles")
    .select("id, username, role, email")
    .eq("username", username);
  if (pErr) throw pErr;
  if (!profiles?.length) {
    console.log(`No profile found for username=${username}`);
    process.exit(0);
  }

  for (const profile of profiles) {
    console.log(`Found profile ${profile.id} (${profile.username}, ${profile.role})`);

    const { data: providers } = await sb
      .from("service_provider_profiles")
      .select("id, user_id, base_lat, base_lng, current_lat, current_lng, verified")
      .eq("user_id", profile.id);

    for (const provider of providers || []) {
      console.log(
        `  provider #${provider.id} base=(${provider.base_lat},${provider.base_lng}) live=(${provider.current_lat},${provider.current_lng})`,
      );

      await sb.from("provider_legal_documents").delete().eq("profile_id", provider.id);
      await sb.from("provider_locations").delete().eq("provider_id", profile.id);
      // Clear jobs that reference this provider user
      await sb
        .from("job_requests")
        .update({ provider_id: null })
        .eq("provider_id", profile.id);
      const { error: delProv } = await sb
        .from("service_provider_profiles")
        .delete()
        .eq("id", provider.id);
      if (delProv) throw delProv;
      console.log(`  deleted provider profile #${provider.id}`);
    }

    const { error: delUser } = await sb.from("profiles").delete().eq("id", profile.id);
    if (delUser) throw delUser;
    console.log(`Deleted profile ${username}`);
  }

  // Verify gone
  const { data: check } = await sb.from("profiles").select("id").eq("username", username);
  console.log(check?.length ? "WARNING: still present" : "OK — fp7773 removed");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
