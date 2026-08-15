/**
 * Dry-run / delete providers whose base or current coordinates are outside Kenya.
 *
 * Usage:
 *   node supabase/cleanup-outside-kenya.mjs
 *   node supabase/cleanup-outside-kenya.mjs --apply
 */
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { classifyKenyaCoords } from "./kenya-boundary.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(path.join(root, "web", "package.json"));
const { createClient } = require("@supabase/supabase-js");
for (const line of fs.readFileSync(path.join(root, "web", ".env.local"), "utf8").split(/\r?\n/)) {
  const match = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (match && process.env[match[1]] === undefined) process.env[match[1]] = match[2];
}

const apply = process.argv.includes("--apply");
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error("Missing Supabase credentials");
  process.exit(1);
}

const sb = createClient(url, key, { auth: { persistSession: false } });
const { data, error } = await sb
  .from("service_provider_profiles")
  .select("id, user_id, base_lat, base_lng, current_lat, current_lng, profiles(username, email)")
  .order("id");
if (error) throw error;

const candidates = [];
let missing = 0;
let inside = 0;
for (const row of data || []) {
  const profile = Array.isArray(row.profiles) ? row.profiles[0] : row.profiles;
  const classification = classifyKenyaCoords(row);
  if (classification.missing_coords) {
    missing += 1;
    continue;
  }
  if (classification.outside_kenya) {
    candidates.push({
      provider_id: row.id,
      user_id: row.user_id,
      username: profile?.username,
      email: profile?.email,
      reasons: classification.reasons,
      base_lat: row.base_lat,
      base_lng: row.base_lng,
      current_lat: row.current_lat,
      current_lng: row.current_lng,
    });
  } else {
    inside += 1;
  }
}

const stamp = new Date().toISOString().replace(/[:.]/g, "-");
const auditDir = path.join(root, "supabase", "audits");
fs.mkdirSync(auditDir, { recursive: true });
const auditPath = path.join(auditDir, `kenya-providers-${stamp}.json`);
const summary = {
  total_providers: (data || []).length,
  outside_kenya: candidates.length,
  missing_coords: missing,
  inside_kenya: inside,
  last_audit_at: new Date().toISOString(),
  mode: apply ? "apply" : "dry-run",
};
fs.writeFileSync(auditPath, JSON.stringify({ ...summary, candidates }, null, 2));
console.log(JSON.stringify(summary, null, 2));
console.log("AUDIT", auditPath);

if (!apply) {
  console.log("Dry-run only. Re-run with --apply to delete.");
  process.exit(0);
}

const userIds = candidates.map((row) => row.user_id);
const providerIds = candidates.map((row) => row.provider_id);
const [{ data: profiles }, { data: providers }] = await Promise.all([
  sb.from("profiles").select("*").in("id", userIds.length ? userIds : ["00000000-0000-0000-0000-000000000000"]),
  sb
    .from("service_provider_profiles")
    .select("*")
    .in("id", providerIds.length ? providerIds : [-1]),
]);
const backupPath = path.join(auditDir, `kenya-providers-backup-${stamp}.json`);
fs.writeFileSync(
  backupPath,
  JSON.stringify({ created_at: new Date().toISOString(), profiles, providers, candidates }, null, 2),
);
console.log("BACKUP", backupPath);

let deleted = 0;
for (const candidate of candidates) {
  await sb.from("provider_legal_documents").delete().eq("profile_id", candidate.provider_id);
  await sb.from("provider_locations").delete().eq("provider_id", candidate.user_id);
  await sb.from("job_requests").update({ provider_id: null }).eq("provider_id", candidate.user_id);
  const { error: providerError } = await sb
    .from("service_provider_profiles")
    .delete()
    .eq("id", candidate.provider_id);
  if (providerError) throw providerError;
  const { error: profileError } = await sb.from("profiles").delete().eq("id", candidate.user_id);
  if (profileError) throw profileError;
  deleted += 1;
}

fs.writeFileSync(
  auditPath,
  JSON.stringify({ ...summary, deleted_count: deleted, backup_path: backupPath, candidates }, null, 2),
);
console.log(JSON.stringify({ deleted_count: deleted, remaining_outside: 0 }, null, 2));
