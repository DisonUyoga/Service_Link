/**
 * Apply migrations 008-011 via Supabase Management API (database/query).
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

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

const ref = process.env.SUPABASE_PROJECT_REF || "ckruqpbkprhnfjalroha";
const token = process.env.SUPABASE_ACCESS_TOKEN;
if (!token) {
  console.error("Set SUPABASE_ACCESS_TOKEN");
  process.exit(1);
}

async function runSql(sql, name) {
  const res = await fetch(`https://api.supabase.com/v1/projects/${ref}/database/query`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ query: sql }),
  });
  const text = await res.text();
  if (!res.ok) {
    console.error(`FAIL ${name}: ${res.status} ${text.slice(0, 800)}`);
    process.exit(1);
  }
  console.log(`OK ${name}`);
  return text;
}

const files = [
  "008_remote_job_pin.sql",
  "009_provider_kyc.sql",
  "010_terms_and_consent.sql",
  "011_complaints_feedback.sql",
];

for (const f of files) {
  const sql = fs.readFileSync(path.join(root, "supabase", "migrations", f), "utf8");
  await runSql(sql, f);
}

await runSql(
  "select column_name from information_schema.columns where table_schema='public' and table_name='job_requests' and column_name in ('recipient_name','place_id','formatted_address') order by 1",
  "verify-job-columns",
);
await runSql(
  "select count(*)::int as n from public.terms_versions where is_current",
  "verify-terms",
);
await runSql(
  "select to_regclass('public.complaints') as complaints",
  "verify-complaints",
);
console.log("Migrations 008-011 applied");
