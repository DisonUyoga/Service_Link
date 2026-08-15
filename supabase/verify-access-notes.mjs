import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
for (const line of fs.readFileSync(path.join(root, "web", ".env.local"), "utf8").split(/\r?\n/)) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2];
}

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
const ref = process.env.SUPABASE_PROJECT_REF;
const token = process.env.SUPABASE_ACCESS_TOKEN;

if (!url || !key || !ref || !token) {
  console.error("Missing env vars");
  process.exit(1);
}

async function mgmt(query, label) {
  const res = await fetch(`https://api.supabase.com/v1/projects/${ref}/database/query`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ query }),
  });
  const text = await res.text();
  console.log(label, res.status, text.slice(0, 300));
}

async function select(label) {
  const res = await fetch(`${url}/rest/v1/job_requests?select=id,access_notes&limit=1`, {
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
    },
  });
  const text = await res.text();
  console.log(label, res.status, text.slice(0, 300));
  return res.ok;
}

await select("select-before");
await mgmt(`notify pgrst, 'reload schema';`, "reload-notify");
await mgmt(`select pg_notify('pgrst', 'reload schema');`, "reload-pg-notify");
await new Promise((r) => setTimeout(r, 2500));
const ok = await select("select-after");
console.log(ok ? "ACCESS_NOTES_OK" : "ACCESS_NOTES_STILL_BROKEN");
process.exit(ok ? 0 : 1);
